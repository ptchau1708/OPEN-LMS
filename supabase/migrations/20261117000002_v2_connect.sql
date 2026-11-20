-- =============================================================================
-- OPEN-EDU v2 — Cầu nối với app ngoài (docs/KET_NOI_APP_NGOAI.md)
--  • v2.external_apps: sổ đăng kí các app/trang HTML bên ngoài được phép "Đăng nhập bằng OPEN-EDU".
--    Chỉ quản trị viên ghi. Người đã đăng nhập chỉ đọc qua v2.get_external_app() (id, tên, origin của app đang bật).
--  • v2.external_activities: kết quả học do app ngoài gửi về hồ sơ học sinh. KHÔNG ai ghi trực tiếp —
--    chỉ qua v2.record_external_activity() (security definer; gửi lại không bị nhân đôi; giới hạn 300 lượt/ngày/HS).
--    Đọc: chính em, GV của em, phụ huynh liên kết, quản trị (v2.can_view_user — giống learning_events).
--  • Điểm từ app ngoài KHÔNG cộng sao/xu và KHÔNG đổi mức thành thạo (không kiểm chứng được).
-- Chạy lại nhiều lần được.
-- =============================================================================

create table if not exists v2.external_apps (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 300),
  -- Origin CHÍNH XÁC (scheme + host [+ cổng], không có đường dẫn, chữ thường). Bắt buộc https, trừ localhost/127.0.0.1 để thử.
  allowed_origins text[] not null default '{}' check (
    coalesce(array_length(allowed_origins, 1), 0) <= 20
    and array_to_string(allowed_origins, ' ') ~ '^((https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?|http://(localhost|127\.0\.0\.1))(:[0-9]{1,5})?( |$))*$'
  ),
  enabled boolean not null default true,
  created_by uuid references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists v2.external_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references v2.profiles (id) on delete cascade,
  app_id text not null references v2.external_apps (id) on delete restrict,
  -- Khóa chống ghi trùng do app ngoài sinh ra (SDK tự sinh): gửi lại cùng khóa → cập nhật dòng cũ.
  client_id text not null check (length(client_id) between 1 and 80),
  activity_id text not null default '' check (length(activity_id) <= 120),
  title text not null default '' check (length(title) <= 200),
  kind text not null default 'other' check (kind ~ '^[a-z0-9-]{1,32}$'),
  score numeric check (score is null or score between 0 and 100000),
  max_score numeric check (max_score is null or max_score between 0 and 100000),
  correct int check (correct is null or correct between 0 and 10000),
  total int check (total is null or total between 0 and 10000),
  duration_sec int check (duration_sec is null or duration_sec between 0 and 86400),
  completed boolean not null default true,
  detail jsonb not null default '{}'::jsonb check (octet_length(detail::text) <= 8192),
  skills text[] not null default '{}' check (coalesce(array_length(skills, 1), 0) <= 10),
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (app_id, user_id, client_id)
);
create index if not exists external_activities_user_idx on v2.external_activities (user_id, at desc);
create index if not exists external_activities_rate_idx on v2.external_activities (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table v2.external_apps enable row level security;
alter table v2.external_activities enable row level security;

drop policy if exists external_apps_admin_read on v2.external_apps;
create policy external_apps_admin_read on v2.external_apps for select to authenticated using ((select v2.is_admin()));
drop policy if exists external_apps_admin_insert on v2.external_apps;
create policy external_apps_admin_insert on v2.external_apps for insert to authenticated with check ((select v2.is_admin()));
drop policy if exists external_apps_admin_update on v2.external_apps;
create policy external_apps_admin_update on v2.external_apps for update to authenticated
  using ((select v2.is_admin())) with check ((select v2.is_admin()));
drop policy if exists external_apps_admin_delete on v2.external_apps;
create policy external_apps_admin_delete on v2.external_apps for delete to authenticated using ((select v2.is_admin()));

drop policy if exists external_activities_read on v2.external_activities;
create policy external_activities_read on v2.external_activities for select to authenticated using (v2.can_view_user(user_id));

revoke all on v2.external_apps, v2.external_activities from anon, authenticated;
grant select, insert, update, delete on v2.external_apps to authenticated;   -- thực tế chỉ admin (policy ở trên)
grant select on v2.external_activities to authenticated;                     -- không có quyền ghi: chỉ qua RPC
grant all on v2.external_apps, v2.external_activities to service_role;

-- -----------------------------------------------------------------------------
-- RPC
-- -----------------------------------------------------------------------------
-- Trang /ket-noi của app học sinh: lấy tên + danh sách origin của MỘT app đang bật (null nếu không có / đã tắt).
create or replace function v2.get_external_app(p_id text) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object('id', a.id, 'name', a.name, 'allowedOrigins', to_jsonb(a.allowed_origins))
  from v2.external_apps a
  where a.id = p_id and a.enabled and auth.uid() is not null
$$;

create or replace function v2._external_activity_json(r v2.external_activities, p_app_name text) returns jsonb
language sql stable set search_path = v2, public as $$
  select jsonb_build_object(
    'id', r.id, 'userId', r.user_id, 'appId', r.app_id, 'appName', coalesce(p_app_name, r.app_id),
    'activityId', r.activity_id, 'title', r.title, 'kind', r.kind,
    'score', r.score, 'maxScore', r.max_score, 'correct', r.correct, 'total', r.total,
    'durationSec', r.duration_sec, 'completed', r.completed, 'detail', r.detail, 'skills', to_jsonb(r.skills), 'at', r.at)
$$;

-- Số trong JSON → numeric đã kẹp vào [0, p_max]; không phải số → null.
create or replace function v2._ext_num(p jsonb, p_key text, p_max numeric) returns numeric
language sql immutable set search_path = v2, public as $$
  select case when jsonb_typeof(p -> p_key) = 'number' then least(greatest((p ->> p_key)::numeric, 0), p_max) end
$$;

/**
 * App ngoài ghi một kết quả học vào hồ sơ của người đang đăng nhập.
 * p = { appId, clientId, activityId?, title?, kind?, score?, maxScore?, correct?, total?, durationSec?, completed?, detail?, skills?, at? }
 * Trả id của dòng. Cùng (appId, người dùng, clientId) → cập nhật dòng cũ (gửi lại không nhân đôi).
 */
create or replace function v2.record_external_activity(p jsonb) returns uuid
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_app text := p ->> 'appId';
  v_client text := left(btrim(coalesce(p ->> 'clientId', '')), 80);
  v_kind text := left(regexp_replace(lower(coalesce(p ->> 'kind', '')), '[^a-z0-9-]', '', 'g'), 32);
  v_score numeric := v2._ext_num(p, 'score', 100000);
  v_max numeric := v2._ext_num(p, 'maxScore', 100000);
  v_correct int := floor(v2._ext_num(p, 'correct', 10000))::int;
  v_total int := floor(v2._ext_num(p, 'total', 10000))::int;
  v_dur int := floor(v2._ext_num(p, 'durationSec', 86400))::int;
  v_detail jsonb := case when jsonb_typeof(p -> 'detail') = 'object' then p -> 'detail' else '{}'::jsonb end;
  v_skills text[] := '{}';
  v_at timestamptz := now();
  v_id uuid;
begin
  if v_uid is null or not exists (select 1 from v2.profiles where id = v_uid) then
    raise exception 'Cần đăng nhập OPEN-EDU.' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Dữ liệu gửi lên không hợp lệ.' using errcode = '22023';
  end if;
  if v_app is null or not exists (select 1 from v2.external_apps a where a.id = v_app and a.enabled) then
    raise exception 'Ứng dụng chưa được nhà trường đăng kí hoặc đã tắt.' using errcode = '42501';
  end if;
  if v_client = '' then
    raise exception 'Thiếu clientId.' using errcode = '22023';
  end if;
  if v_kind = '' then v_kind := 'other'; end if;
  if v_max is not null and v_score is not null and v_score > v_max then v_score := v_max; end if;
  if v_total is not null and v_correct is not null and v_correct > v_total then v_correct := v_total; end if;
  if octet_length(v_detail::text) > 8192 then v_detail := jsonb_build_object('truncated', true); end if;
  if jsonb_typeof(p -> 'skills') = 'array' then
    -- Chỉ giữ mã kĩ năng có thật trong OPEN-EDU, tối đa 10.
    select coalesce(array_agg(x.code), '{}') into v_skills from (
      select distinct s.code from jsonb_array_elements_text(p -> 'skills') e(code) join v2.skills s on s.code = e.code limit 10
    ) x;
  end if;
  begin
    v_at := least(greatest((p ->> 'at')::timestamptz, now() - interval '30 days'), now() + interval '5 minutes');
  exception when others then v_at := now();
  end;
  v_at := coalesce(v_at, now());

  -- Chống gửi dồn dập: tính trên các dòng mới tạo trong 24 giờ (gửi lại dòng cũ không tính).
  if not exists (select 1 from v2.external_activities x where x.app_id = v_app and x.user_id = v_uid and x.client_id = v_client)
     and (select count(*) from v2.external_activities x where x.user_id = v_uid and x.created_at > now() - interval '1 day') >= 300 then
    raise exception 'Hôm nay em đã ghi quá nhiều kết quả từ ứng dụng ngoài. Mai thử lại nhé.' using errcode = 'P0001';
  end if;

  insert into v2.external_activities
    (user_id, app_id, client_id, activity_id, title, kind, score, max_score, correct, total, duration_sec, completed, detail, skills, at)
  values
    (v_uid, v_app, v_client, left(coalesce(p ->> 'activityId', ''), 120), left(coalesce(p ->> 'title', ''), 200), v_kind,
     v_score, v_max, v_correct, v_total, v_dur,
     case when jsonb_typeof(p -> 'completed') = 'boolean' then (p ->> 'completed')::boolean else true end,
     v_detail, v_skills, v_at)
  on conflict (app_id, user_id, client_id) do update set
    activity_id = excluded.activity_id, title = excluded.title, kind = excluded.kind, score = excluded.score,
    max_score = excluded.max_score, correct = excluded.correct, total = excluded.total, duration_sec = excluded.duration_sec,
    completed = excluded.completed, detail = excluded.detail, skills = excluded.skills, at = excluded.at
  returning id into v_id;
  return v_id;
end $$;

-- Hồ sơ học sinh: các hoạt động gần đây ở app ngoài (mới nhất trước), kèm tên app.
create or replace function v2.list_external_activities(p_user uuid, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if auth.uid() is null or p_user is null or not v2.can_view_user(p_user) then
    raise exception 'Không có quyền xem hoạt động của học sinh này.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(v2._external_activity_json(e, a.name) order by e.at desc)
    from (
      select x.* from v2.external_activities x
      where x.user_id = p_user order by x.at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) e join v2.external_apps a on a.id = e.app_id), '[]'::jsonb);
end $$;

revoke execute on function v2._external_activity_json(v2.external_activities, text), v2._ext_num(jsonb, text, numeric)
  from public, anon, authenticated;
revoke execute on function v2.get_external_app(text), v2.record_external_activity(jsonb), v2.list_external_activities(uuid, int)
  from public, anon;
grant execute on function v2.get_external_app(text), v2.record_external_activity(jsonb), v2.list_external_activities(uuid, int)
  to authenticated;
grant execute on all functions in schema v2 to service_role;
