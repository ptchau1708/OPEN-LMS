-- =============================================================================
-- LTI 1.3: OPEN-EDU làm NỀN TẢNG cho app ngoài (Tool) — docs/KET_NOI_LTI.md.
--   * v2.external_apps.lti: cấu hình LTI của một app đã đăng kí (quản trị sửa qua bảng, như các cột khác).
--   * v2.lti_platform_keys: khóa kí id_token của OPEN-EDU (Edge Function `lti` tự tạo lần đầu). CHỈ service_role.
--   * v2.lti_lineitems: cột điểm (AGS) theo app × lớp. CHỈ service_role.
--   * v2.lti_jti: chống dùng lại client_assertion. CHỈ service_role.
--   * Điểm app gửi về được ghi vào v2.external_activities (hồ sơ học tập), client_id = 'lti:<mã cột điểm>'.
-- Chạy lại nhiều lần được.
-- =============================================================================

create or replace function v2._lti_url_ok(p text) returns boolean
language sql immutable set search_path = v2, public as $$
  select p is not null and length(p) <= 500
    and p ~ '^(https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?|http://(localhost|127\.0\.0\.1))(:[0-9]{1,5})?(/[^[:space:]"<>]*)?$'
$$;

-- lti = { clientId, deploymentId, loginUrl, launchUrl, redirectUris?: [], jwksUrl?, publicKey? (PEM hoặc JWK) }
create or replace function v2._lti_config_ok(p jsonb) returns boolean
language sql immutable set search_path = v2, public as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= 8192
    and coalesce(p ->> 'clientId', '') ~ '^[A-Za-z0-9._~-]{8,100}$'
    and coalesce(p ->> 'deploymentId', '') ~ '^[A-Za-z0-9._~-]{1,100}$'
    and v2._lti_url_ok(p ->> 'loginUrl')
    and v2._lti_url_ok(p ->> 'launchUrl')
    and (coalesce(p ->> 'jwksUrl', '') = '' or v2._lti_url_ok(p ->> 'jwksUrl'))
    and (coalesce(p ->> 'jwksUrl', '') <> '' or coalesce(p ->> 'publicKey', '') <> '')
    and length(coalesce(p ->> 'publicKey', '')) <= 4000
    and (p -> 'redirectUris' is null or (
      jsonb_typeof(p -> 'redirectUris') = 'array' and jsonb_array_length(p -> 'redirectUris') <= 10
      and not exists (select 1 from jsonb_array_elements(p -> 'redirectUris') e(u) where jsonb_typeof(e.u) <> 'string' or not v2._lti_url_ok(e.u #>> '{}'))
    ))
  )
$$;

alter table v2.external_apps add column if not exists lti jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'external_apps_lti_ok' and conrelid = 'v2.external_apps'::regclass) then
    alter table v2.external_apps add constraint external_apps_lti_ok check (v2._lti_config_ok(lti));
  end if;
end $$;
create unique index if not exists external_apps_lti_client_key on v2.external_apps ((lti ->> 'clientId')) where lti is not null;

create table if not exists v2.lti_platform_keys (
  id smallint primary key default 1 check (id = 1),
  kid text not null,
  private_jwk jsonb not null,
  public_jwk jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists v2.lti_lineitems (
  id uuid primary key default gen_random_uuid(),
  app_id text not null references v2.external_apps (id) on delete cascade,
  class_id text not null references v2.classes (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 200),
  score_maximum numeric not null check (score_maximum > 0 and score_maximum <= 100000),
  resource_link_id text check (resource_link_id is null or length(resource_link_id) <= 200),
  resource_id text check (resource_id is null or length(resource_id) <= 200),
  tag text check (tag is null or length(tag) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists lti_lineitems_app_class_idx on v2.lti_lineitems (app_id, class_id);
create index if not exists lti_lineitems_class_idx on v2.lti_lineitems (class_id);

create table if not exists v2.lti_jti (
  key text primary key check (length(key) <= 400),
  expires_at timestamptz not null
);
create index if not exists lti_jti_exp_idx on v2.lti_jti (expires_at);

alter table v2.lti_platform_keys enable row level security;
alter table v2.lti_lineitems enable row level security;
alter table v2.lti_jti enable row level security;
-- Không có policy nào: chỉ service_role (Edge Function `lti`) đọc / ghi được.
revoke all on v2.lti_platform_keys, v2.lti_lineitems, v2.lti_jti from public, anon, authenticated;
grant all on v2.lti_platform_keys, v2.lti_lineitems, v2.lti_jti to service_role;

-- App LTI đang bật — cho trang "Ứng dụng học" của học sinh / giáo viên (chỉ phần công khai, không có khóa).
create or replace function v2.list_lti_tools() returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'description', a.description,
      'clientId', a.lti ->> 'clientId', 'deploymentId', a.lti ->> 'deploymentId',
      'loginUrl', a.lti ->> 'loginUrl', 'launchUrl', a.lti ->> 'launchUrl') order by a.name), '[]'::jsonb)
  from v2.external_apps a
  where a.enabled and a.lti is not null and auth.uid() is not null
    and exists (select 1 from v2.profiles p where p.id = auth.uid() and p.role in ('student', 'teacher', 'admin'))
$$;

-- Ghi nhận jti của client_assertion; false nếu đã gặp (dùng lại). Dọn jti hết hạn.
create or replace function v2.lti_remember_jti(p_key text, p_expires timestamptz) returns boolean
language plpgsql volatile security definer set search_path = v2, public as $$
declare v_n int;
begin
  delete from v2.lti_jti where key in (select key from v2.lti_jti where expires_at < now() - interval '5 minutes' limit 500);
  insert into v2.lti_jti (key, expires_at) values (left(p_key, 400), least(coalesce(p_expires, now() + interval '1 hour'), now() + interval '2 hours'))
  on conflict (key) do nothing;
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

revoke execute on function v2.lti_remember_jti(text, timestamptz) from public, anon, authenticated;
-- Hàm kiểm tra dùng trong CHECK: người sửa bảng (quản trị) cần quyền EXECUTE. Hàm thuần, không đọc dữ liệu.
revoke execute on function v2._lti_url_ok(text), v2._lti_config_ok(jsonb) from public, anon;
grant execute on function v2._lti_url_ok(text), v2._lti_config_ok(jsonb) to authenticated;
revoke execute on function v2.list_lti_tools() from public, anon;
grant execute on function v2.list_lti_tools() to authenticated;
grant execute on all functions in schema v2 to service_role;
