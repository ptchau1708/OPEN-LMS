-- =============================================================================
-- OPEN-EDU v2 — Đấu trường: cài đặt của lớp, giải đấu loại trực tiếp, bảng xếp hạng theo mùa (26/11/2026)
--
-- 1) Cài đặt Đấu trường của lớp (v2.arena_settings) — giáo viên quản lí phần CHƠI TỰ DO (Đấu 1–1, Leo tháp):
--    bật / tắt; phạm vi ghép đấu (trong lớp / cả khối); nguồn câu (tự động theo môn / chỉ câu GV đưa vào);
--    giờ mở cửa (khung giờ theo thứ trong tuần, giờ Việt Nam; trống = luôn mở); kiểu chơi được mở; mùa xếp hạng.
--    Máy chủ kiểm tra khi tạo / ghép / vào trận Đấu 1–1.
-- 2) Giải đấu loại trực tiếp (v2.cups, cup_players, cup_matches):
--    GV mở giải cho lớp hoặc cả khối; HS tham gia (tự động cả lớp/khối hoặc tự đăng kí); bốc thăm / xếp hạt giống;
--    mỗi vòng mở trong một khung giờ; hai bạn trong cặp làm CÙNG bộ câu (không cần online cùng lúc).
--    Câu trả lời chấm ở Edge Function `grade` như Đấu 1–1 (mỗi trận là một dòng v2.duels mode 'cup') — KHÔNG cần
--    triển khai lại hàm Edge. Ai đúng nhiều hơn thắng; bằng nhau → điểm tốc độ → tổng thời gian → hạt giống.
--    Hết giờ vòng: một bạn chưa đấu → bạn kia thắng; cả hai chưa đấu → hạt giống cao hơn đi tiếp. GV chọn người
--    thắng / đóng vòng sớm được. Vòng sau mở ngay khi vòng trước xong (liên tục) hoặc mỗi ngày một vòng.
--    Kết thúc: Vô địch, Á quân, đồng Hạng ba (hai bạn thua bán kết) → sao + cúp (huy hiệu) + giấy khen in ở app GV.
-- 3) Bảng xếp hạng Đấu trường của lớp theo mùa: HS chỉ thấy top 10 + vị trí của mình; GV thấy cả lớp;
--    GV "Kết thúc mùa" → trao sao + cúp cho 3 bạn dẫn đầu, lưu lịch sử mùa, mùa mới bắt đầu từ 0.
-- Chạy sau SQL 21. Chạy lại nhiều lần không sao.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Đấu 1–1: thêm kiểu trận 'cup' (trận trong giải) và phạm vi ghép đấu
-- ---------------------------------------------------------------------------
alter table v2.duels drop constraint if exists duels_mode_check;
alter table v2.duels add constraint duels_mode_check check (mode in ('queue', 'code', 'challenge', 'bot', 'cup'));
alter table v2.duels add column if not exists scope text not null default 'class';
alter table v2.duels drop constraint if exists duels_scope_check;
alter table v2.duels add constraint duels_scope_check check (scope in ('class', 'grade'));

-- ---------------------------------------------------------------------------
-- 1) Cài đặt Đấu trường của lớp
-- ---------------------------------------------------------------------------
create table if not exists v2.arena_settings (
  class_id text primary key references v2.classes (id) on delete cascade,
  enabled boolean not null default true,
  scope text not null default 'class' check (scope in ('class', 'grade')),
  source text not null default 'auto' check (source in ('auto', 'picked')),
  item_ids text[] not null default '{}' check (cardinality(item_ids) <= 1000),
  hours jsonb not null default '[]'::jsonb check (jsonb_typeof(hours) = 'array'),
  modes text[] not null default '{duel,tower}' check (modes <@ array['duel', 'tower']::text[]),
  season_title text check (season_title is null or length(season_title) <= 80),
  -- null = tính từ đầu (chưa kết thúc mùa nào)
  season_start timestamptz,
  updated_by uuid references v2.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table v2.arena_settings enable row level security;
drop policy if exists arena_settings_read on v2.arena_settings;
create policy arena_settings_read on v2.arena_settings for select to authenticated
  using (v2.is_teacher_of_class(class_id) or class_id in (select v2.my_class_ids()));
revoke insert, update, delete on v2.arena_settings from anon, authenticated;

create table if not exists v2.arena_seasons (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references v2.classes (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  started_at timestamptz,
  ended_at timestamptz not null default now(),
  top jsonb not null default '[]'::jsonb check (jsonb_typeof(top) = 'array'),
  created_by uuid references v2.profiles (id) on delete set null
);
create index if not exists arena_seasons_class_idx on v2.arena_seasons (class_id, ended_at desc);
alter table v2.arena_seasons enable row level security;
revoke all on v2.arena_seasons from anon, authenticated;

-- Cài đặt của lớp (chưa lưu → mặc định: mở, trong lớp, tự động, luôn mở, Đấu 1–1 + Leo tháp).
create or replace function v2._arena_settings(p_class text) returns v2.arena_settings
language plpgsql stable security definer set search_path = v2, public as $$
declare v v2.arena_settings;
begin
  select * into v from v2.arena_settings where class_id = p_class;
  if not found then
    v.class_id := p_class; v.enabled := true; v.scope := 'class'; v.source := 'auto'; v.item_ids := '{}';
    v.hours := '[]'::jsonb; v.modes := '{duel,tower}'; v.updated_at := null;
  end if;
  return v;
end $$;

-- Khung giờ [{days:[1..7] (1 = thứ Hai), from:'HH:MM', to:'HH:MM'}] theo giờ Việt Nam; mảng rỗng = luôn mở.
create or replace function v2._arena_open(p_hours jsonb, p_at timestamptz default now()) returns boolean
language sql stable set search_path = v2, public as $$
  select coalesce(jsonb_array_length(p_hours), 0) = 0 or exists (
    select 1 from jsonb_array_elements(p_hours) w
    where jsonb_typeof(w -> 'days') = 'array'
      and extract(isodow from (p_at at time zone 'Asia/Ho_Chi_Minh'))::int in (select (d)::int from jsonb_array_elements_text(w -> 'days') d)
      and to_char(p_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') >= (w ->> 'from')
      and to_char(p_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') < (w ->> 'to'))
$$;

create or replace function v2._arena_json(s v2.arena_settings, p_with_items boolean default true) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select v2.jsonb_compact(jsonb_build_object(
    'classId', s.class_id, 'enabled', s.enabled, 'scope', s.scope, 'source', s.source,
    'itemIds', case when p_with_items then to_jsonb(s.item_ids) else '[]'::jsonb end,
    'hours', s.hours, 'modes', to_jsonb(s.modes), 'seasonTitle', s.season_title, 'seasonStart', s.season_start,
    'updatedAt', s.updated_at))
$$;

-- Học sinh: Đấu trường của lớp em đang mở không? Ném lỗi nếu đóng (dùng trong các hàm Đấu 1–1).
create or replace function v2._arena_require(p_class text, p_mode text) returns v2.arena_settings
language plpgsql stable security definer set search_path = v2, public as $$
declare s v2.arena_settings := v2._arena_settings(p_class);
begin
  if not s.enabled then
    raise exception 'Thầy/cô đang tạm đóng Đấu trường. Em quay lại sau nhé!' using errcode = '42501';
  end if;
  if not v2._arena_open(s.hours) then
    raise exception 'Đấu trường đang đóng cửa. Em xem giờ mở ở trang Đấu trường nhé!' using errcode = '42501';
  end if;
  if p_mode is not null and not (p_mode = any (s.modes)) then
    raise exception '%', case when p_mode = 'duel' then 'Thầy/cô đang tạm tắt Đấu 1–1.' else 'Thầy/cô đang tạm tắt Leo tháp.' end using errcode = '42501';
  end if;
  return s;
end $$;

create or replace function v2.arena_get_settings(p_class text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ thầy/cô của lớp mới xem được cài đặt Đấu trường.' using errcode = '42501';
  end if;
  return v2._arena_json(v2._arena_settings(p_class));
end $$;

create or replace function v2.arena_save_settings(p_class text, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  s v2.arena_settings;
  w jsonb;
  v_items text[];
  v_modes text[];
begin
  perform v2._require_user();
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ thầy/cô của lớp mới đổi được cài đặt Đấu trường.' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Cài đặt không hợp lệ.' using errcode = '22023'; end if;
  s := v2._arena_settings(p_class);
  if p ? 'enabled' then s.enabled := coalesce((p ->> 'enabled')::boolean, true); end if;
  if p ? 'scope' then
    if p ->> 'scope' not in ('class', 'grade') then raise exception 'Phạm vi chỉ là "class" hoặc "grade".' using errcode = '22023'; end if;
    s.scope := p ->> 'scope';
  end if;
  if p ? 'source' then
    if p ->> 'source' not in ('auto', 'picked') then raise exception 'Nguồn câu chỉ là "auto" hoặc "picked".' using errcode = '22023'; end if;
    s.source := p ->> 'source';
  end if;
  if p ? 'itemIds' then
    if jsonb_typeof(p -> 'itemIds') is distinct from 'array' then raise exception 'Danh sách câu không hợp lệ.' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_items from jsonb_array_elements_text(p -> 'itemIds') x
     where exists (select 1 from v2.items i where i.id = x);
    if cardinality(v_items) > 1000 then raise exception 'Bộ câu Đấu trường tối đa 1000 câu.' using errcode = '22023'; end if;
    s.item_ids := v_items;
  end if;
  if p ? 'hours' then
    if jsonb_typeof(p -> 'hours') is distinct from 'array' or jsonb_array_length(p -> 'hours') > 14 then
      raise exception 'Giờ mở cửa không hợp lệ (tối đa 14 khung giờ).' using errcode = '22023';
    end if;
    for w in select value from jsonb_array_elements(p -> 'hours') loop
      if jsonb_typeof(w -> 'days') is distinct from 'array' or jsonb_array_length(w -> 'days') = 0
         or exists (select 1 from jsonb_array_elements_text(w -> 'days') d where d !~ '^[1-7]$')
         or coalesce(w ->> 'from', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(w ->> 'to', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
         or (w ->> 'from') >= (w ->> 'to') then
        raise exception 'Khung giờ không hợp lệ: chọn ngày trong tuần và giờ bắt đầu trước giờ kết thúc.' using errcode = '22023';
      end if;
    end loop;
    s.hours := p -> 'hours';
  end if;
  if p ? 'modes' then
    if jsonb_typeof(p -> 'modes') is distinct from 'array' then raise exception 'Kiểu chơi không hợp lệ.' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_modes from jsonb_array_elements_text(p -> 'modes') x;
    if not v_modes <@ array['duel', 'tower']::text[] then raise exception 'Kiểu chơi chỉ là "duel" hoặc "tower".' using errcode = '22023'; end if;
    s.modes := v_modes;
  end if;
  if p ? 'seasonTitle' then s.season_title := nullif(left(btrim(coalesce(p ->> 'seasonTitle', '')), 80), ''); end if;
  insert into v2.arena_settings (class_id, enabled, scope, source, item_ids, hours, modes, season_title, season_start, updated_by, updated_at)
  values (p_class, s.enabled, s.scope, s.source, s.item_ids, s.hours, s.modes, s.season_title, s.season_start, auth.uid(), now())
  on conflict (class_id) do update set enabled = excluded.enabled, scope = excluded.scope, source = excluded.source,
    item_ids = excluded.item_ids, hours = excluded.hours, modes = excluded.modes, season_title = excluded.season_title,
    updated_by = excluded.updated_by, updated_at = now()
  returning * into s;
  return v2._arena_json(s);
end $$;

-- "Đưa vào Đấu trường" từ Ngân hàng câu hỏi: thêm câu vào bộ câu của lớp. Trả về số câu trong bộ.
create or replace function v2.arena_pool_add(p_class text, p_items text[]) returns int
language plpgsql volatile security definer set search_path = v2, public as $$
declare s v2.arena_settings; v_items text[];
begin
  perform v2._require_user();
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ thầy/cô của lớp mới thêm câu vào Đấu trường.' using errcode = '42501';
  end if;
  s := v2._arena_settings(p_class);
  select coalesce(array_agg(distinct x), '{}') into v_items
  from unnest(s.item_ids || coalesce(p_items, '{}')) x where exists (select 1 from v2.items i where i.id = x);
  if cardinality(v_items) > 1000 then raise exception 'Bộ câu Đấu trường tối đa 1000 câu.' using errcode = '22023'; end if;
  insert into v2.arena_settings (class_id, enabled, scope, source, item_ids, hours, modes, season_title, season_start, updated_by)
  values (p_class, s.enabled, s.scope, s.source, v_items, s.hours, s.modes, s.season_title, s.season_start, auth.uid())
  on conflict (class_id) do update set item_ids = excluded.item_ids, updated_by = excluded.updated_by, updated_at = now();
  return cardinality(v_items);
end $$;

-- Học sinh: trạng thái Đấu trường của lớp em (mở / đóng, lí do, cài đặt; bộ câu khi GV chọn "chỉ câu đưa vào").
create or replace function v2.arena_access() returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare v_me v2.profiles; s v2.arena_settings; v_reason text;
begin
  perform v2._require_user();
  select * into v_me from v2.profiles where id = auth.uid();
  s := v2._arena_settings(v_me.class_id);
  v_reason := case when not s.enabled then 'off' when not v2._arena_open(s.hours) then 'hours' end;
  return v2.jsonb_compact(jsonb_build_object('open', v_reason is null, 'reason', v_reason,
    'settings', v2._arena_json(s, s.source = 'picked'), 'now', now()));
end $$;

-- ---------------------------------------------------------------------------
-- Đấu 1–1 tự do: theo cài đặt của lớp (giờ mở, kiểu chơi, nguồn câu, phạm vi ghép)
-- ---------------------------------------------------------------------------
create or replace function v2._duel_pick_items(p_user uuid, p_grade int, p_subject text) returns text[]
language sql volatile security definer set search_path = v2, public as $$
  with st as (select v2._arena_settings((select class_id from v2.profiles where id = p_user)) as s),
  c as (
    select i.id, random() as r,
      exists (select 1 from v2.item_skills s join v2.skill_mastery m on m.skill_code = s.skill_code and m.user_id = p_user
              where s.item_id = i.id and m.level in ('dang-hoc', 'can-on')) as pref
    from st cross join v2.items i join v2.item_keys k on k.item_id = i.id and k.key is not null
    where i.grade = p_grade and i.subject = p_subject
      and i.type in ('MCQ', 'LISTEN_CHOOSE', 'SHORT_ANSWER', 'MATH_MANIPULATIVE', 'MCQ_MULTIPLE', 'ORDERING')
      and ((st.s).source is distinct from 'picked' or i.id = any ((st.s).item_ids))
  ), p as (select id from c where pref order by r limit 4),
  o as (select id from c where id not in (select id from p) order by r limit 7),
  z as (select id from (select id, 0 as g from p union all select id, 1 from o) u order by g limit 7)
  select coalesce(array_agg(id order by random()), '{}') from z
$$;

create or replace function v2._duel_new(p_mode text, p_subject text, p_invitee uuid) returns v2.duels
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_me v2.profiles;
  v_set v2.arena_settings;
  v_items text[];
  v_code text;
  v_d v2.duels;
  i int := 0;
begin
  if v_role <> 'student' then raise exception 'Đấu 1–1 dành cho học sinh.' using errcode = '42501'; end if;
  select * into v_me from v2.profiles where id = v_uid;
  if v_me.grade is null then raise exception 'Tài khoản của em chưa có khối lớp. Em báo thầy/cô nhé.' using errcode = '22023'; end if;
  v_set := v2._arena_require(v_me.class_id, 'duel');
  if (select count(*) from v2.duels where created_by = v_uid and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Em đấu nhiều quá rồi! Nghỉ một chút rồi chơi tiếp nhé.' using errcode = '54000';
  end if;
  -- Huỷ phòng chờ cũ của em.
  update v2.duels set status = 'cancelled', ended_at = now() where created_by = v_uid and status = 'waiting';
  v_items := v2._duel_pick_items(v_uid, v_me.grade, p_subject);
  if coalesce(cardinality(v_items), 0) < 3 then raise exception 'Môn này chưa đủ câu hỏi để đấu. Em chọn môn khác nhé!' using errcode = 'P0002'; end if;
  loop
    v_code := (1000 + floor(random() * 9000))::int::text;
    exit when not exists (select 1 from v2.duels where code = v_code and status in ('waiting', 'playing'));
    i := i + 1;
    if i > 30 then raise exception 'Phòng đấu đang đông, em thử lại sau ít giây nhé.' using errcode = '54000'; end if;
  end loop;
  insert into v2.duels (code, mode, class_id, subject, grade, players, invitee, item_ids, seed, status, created_by, started_at, scope)
  values (v_code, p_mode, v_me.class_id, p_subject, v_me.grade, array[v_uid], p_invitee, v_items, floor(random() * 2147483647)::int,
          case when p_mode = 'bot' then 'playing' else 'waiting' end, v_uid, case when p_mode = 'bot' then now() end, v_set.scope)
  returning * into v_d;
  return v_d;
end $$;

-- "Tìm bạn": cùng lớp; lớp cho phép "cả khối" thì ghép cả bạn lớp khác cùng khối (lớp bạn ấy cũng cho phép).
create or replace function v2.duel_seek(p_subject text) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_me v2.profiles;
  v_set v2.arena_settings;
  v_d v2.duels;
begin
  select * into v_me from v2.profiles where id = v_uid;
  v_set := v2._arena_require(v_me.class_id, 'duel');
  select * into v_d from v2.duels d
   where d.status = 'waiting' and d.mode = 'queue' and d.subject = p_subject and d.grade = v_me.grade
     and (d.class_id is not distinct from v_me.class_id or (v_set.scope = 'grade' and d.scope = 'grade'))
     and d.created_by <> v_uid and d.created_at > now() - interval '60 seconds'
   order by (d.class_id is not distinct from v_me.class_id) desc, d.created_at limit 1 for update skip locked;
  if found then
    update v2.duels set players = players || v_uid, status = 'playing', started_at = now() where id = v_d.id returning * into v_d;
    update v2.duels set status = 'cancelled', ended_at = now() where created_by = v_uid and status = 'waiting';
    return v2.duel_json(v_d);
  end if;
  return v2.duel_json(v2._duel_new('queue', p_subject, null));
end $$;

create or replace function v2.duel_join(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_me v2.profiles;
  v_d v2.duels;
begin
  if v_role <> 'student' then raise exception 'Đấu 1–1 dành cho học sinh.' using errcode = '42501'; end if;
  select * into v_me from v2.profiles where id = v_uid;
  perform v2._arena_require(v_me.class_id, 'duel');
  select * into v_d from v2.duels d where d.code = btrim(p_code) and d.status = 'waiting' and d.mode in ('code', 'challenge')
     and d.created_at > now() - interval '30 minutes' for update;
  if not found or v_d.created_by = v_uid then
    raise exception 'Không tìm thấy phòng này. Em hỏi lại bạn mã 4 số nhé!' using errcode = 'P0002';
  end if;
  if v_d.invitee is not null and v_d.invitee <> v_uid then
    raise exception 'Phòng này đang chờ một bạn khác.' using errcode = '42501';
  end if;
  if v_d.grade <> v_me.grade then
    raise exception 'Phòng này dành cho bạn cùng khối lớp.' using errcode = '42501';
  end if;
  update v2.duels set players = players || v_uid, status = 'playing', started_at = now() where id = v_d.id returning * into v_d;
  return v2.duel_json(v_d);
end $$;

-- duel_finish không dùng cho trận trong giải (kết quả tính khi cả hai làm xong / hết giờ vòng).
do $$
begin
  if to_regprocedure('v2._duel_finish_core(uuid, boolean)') is null then
    alter function v2.duel_finish(uuid, boolean) rename to _duel_finish_core;
  end if;
end $$;
create or replace function v2.duel_finish(p_id uuid, p_claim_forfeit boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
begin
  if exists (select 1 from v2.duels where id = p_id and mode = 'cup') then
    raise exception 'Trận trong giải đấu được tính kết quả khi cả hai bạn đấu xong.' using errcode = '22023';
  end if;
  return v2._duel_finish_core(p_id, p_claim_forfeit);
end $$;

-- ---------------------------------------------------------------------------
-- 2) Giải đấu loại trực tiếp
-- ---------------------------------------------------------------------------
create table if not exists v2.cups (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 80),
  scope text not null default 'class' check (scope in ('class', 'grade')),
  class_id text references v2.classes (id) on delete set null,
  grade smallint not null check (grade between 1 and 5),
  subject text not null check (subject in ('toan', 'tieng-viet', 'tieng-anh', 'dao-duc', 'lich-su-dia-li', 'khoa-hoc', 'tin-hoc',
    'cong-nghe', 'gdtc', 'am-nhac', 'mi-thuat', 'hdtn', 'tnxh', 'tieng-dan-toc', 'khac')),
  source text not null default 'auto' check (source in ('auto', 'picked')),
  item_ids text[] not null default '{}' check (cardinality(item_ids) <= 500),
  questions smallint not null default 7 check (questions between 3 and 10),
  seeding text not null default 'random' check (seeding in ('random', 'mastery')),
  entry text not null default 'all' check (entry in ('all', 'signup')),
  start_at timestamptz not null default now(),
  round_minutes int not null default 60 check (round_minutes between 2 and 1440),
  pace text not null default 'continuous' check (pace in ('continuous', 'daily')),
  status text not null default 'signup' check (status in ('signup', 'running', 'finished', 'cancelled')),
  round smallint not null default 0,
  rounds smallint not null default 0,
  champion uuid references v2.profiles (id) on delete set null,
  runner_up uuid references v2.profiles (id) on delete set null,
  thirds uuid[] not null default '{}',
  note text check (note is null or length(note) <= 200),
  created_by uuid not null references v2.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists cups_class_idx on v2.cups (class_id, created_at desc);
create index if not exists cups_grade_idx on v2.cups (grade, status) where scope = 'grade';
create index if not exists cups_active_idx on v2.cups (status) where status in ('signup', 'running');

create table if not exists v2.cup_players (
  cup_id uuid not null references v2.cups (id) on delete cascade,
  user_id uuid not null references v2.profiles (id) on delete cascade,
  class_id text,
  seed smallint,
  out_round smallint,
  joined_at timestamptz not null default now(),
  primary key (cup_id, user_id)
);
create index if not exists cup_players_user_idx on v2.cup_players (user_id);

create table if not exists v2.cup_matches (
  cup_id uuid not null references v2.cups (id) on delete cascade,
  round smallint not null check (round between 1 and 8),
  slot smallint not null check (slot >= 0),
  p1 uuid references v2.profiles (id) on delete set null,
  p2 uuid references v2.profiles (id) on delete set null,
  duel_id uuid references v2.duels (id) on delete set null,
  winner uuid references v2.profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done')),
  decided_by text check (decided_by in ('play', 'bye', 'walkover', 'seed', 'teacher')),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  opens_at timestamptz,
  closes_at timestamptz,
  decided_at timestamptz,
  primary key (cup_id, round, slot)
);
create index if not exists cup_matches_players_idx on v2.cup_matches (p1, p2);

alter table v2.cups enable row level security;
alter table v2.cup_players enable row level security;
alter table v2.cup_matches enable row level security;
-- Không có policy: đọc / ghi qua các hàm bên dưới.
revoke all on v2.cups, v2.cup_players, v2.cup_matches from anon, authenticated;

-- Thứ tự hạt giống trong nhánh đấu kích thước p_size (luỹ thừa của 2): 1 gặp p_size, 2 gặp p_size-1… ở hai nửa nhánh.
create or replace function v2._cup_positions(p_size int) returns int[]
language plpgsql immutable set search_path = v2, public as $$
declare p int[] := array[1, 2]; q int[]; k int; x int;
begin
  while cardinality(p) < p_size loop
    k := cardinality(p) * 2;
    q := '{}';
    foreach x in array p loop q := q || x || (k + 1 - x); end loop;
    p := q;
  end loop;
  return p;
end $$;

create or replace function v2._cup_host(c v2.cups) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.is_admin() or c.created_by = auth.uid() or (c.class_id is not null and v2.is_teacher_of_class(c.class_id))
$$;

-- HS được dự giải: lớp (thuộc lớp của giải) hoặc khối (cùng khối).
create or replace function v2._cup_eligible(c v2.cups, p_user uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.profiles p where p.id = p_user and p.role = 'student' and (
    (c.scope = 'class' and c.class_id is not null and exists (select 1 from v2._class_student_ids(c.class_id) s where s = p_user))
    or (c.scope = 'grade' and p.grade = c.grade)))
$$;

create or replace function v2._cup_player_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object('userId', p.id, 'name', p.name, 'mascot', p.avatar_mascot, 'color', p.avatar_color,
    'classId', p.class_id, 'className', (select c.name from v2.classes c where c.id = p.class_id))
  from v2.profiles p where p.id = p_user
$$;

-- Kết quả của một bạn trong trận (từ v2.duel_answers do Edge Function grade ghi).
create or replace function v2._cup_result(p_duel uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'answered', count(*), 'correct', count(*) filter (where a.correct),
    'points', coalesce(sum(a.points), 0), 'ms', coalesce(sum(a.ms), 0))
  from v2.duel_answers a where a.duel_id = p_duel and a.user_id = p_user
$$;

create or replace function v2._cup_json(c v2.cups) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_host boolean := v2._cup_host(c);
begin
  return v2.jsonb_compact(jsonb_build_object(
    'id', c.id, 'title', c.title, 'scope', c.scope, 'classId', c.class_id,
    'className', (select cl.name from v2.classes cl where cl.id = c.class_id),
    'grade', c.grade, 'subject', c.subject, 'source', c.source,
    'itemIds', case when v_host then to_jsonb(c.item_ids) end, 'itemCount', cardinality(c.item_ids),
    'questions', c.questions, 'seeding', c.seeding, 'entry', c.entry, 'startAt', c.start_at, 'roundMinutes', c.round_minutes,
    'pace', c.pace, 'status', c.status, 'round', c.round, 'rounds', c.rounds,
    'champion', c.champion, 'runnerUp', c.runner_up, 'thirds', to_jsonb(c.thirds), 'note', c.note,
    'createdBy', c.created_by, 'createdByName', (select p.name from v2.profiles p where p.id = c.created_by),
    'createdAt', c.created_at, 'startedAt', c.started_at, 'finishedAt', c.finished_at,
    'players', coalesce((select jsonb_agg(v2._cup_player_json(cp.user_id) || v2.jsonb_compact(jsonb_build_object('seed', cp.seed, 'outRound', cp.out_round))
                          order by cp.seed nulls last, cp.joined_at) from v2.cup_players cp where cp.cup_id = c.id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(v2.jsonb_compact(jsonb_build_object(
        'round', m.round, 'slot', m.slot, 'p1', m.p1, 'p2', m.p2, 'winner', m.winner, 'status', m.status, 'decidedBy', m.decided_by,
        'opensAt', m.opens_at, 'closesAt', m.closes_at, 'decidedAt', m.decided_at,
        'result', case when m.status = 'done' then m.result end,
        -- Trận đang mở: chỉ cho biết ai đã đấu xong (không lộ điểm trước khi có kết quả).
        'done', case when m.status = 'open' and m.duel_id is not null then (
          select coalesce(jsonb_agg(u), '[]'::jsonb) from unnest(array[m.p1, m.p2]) u
          where u is not null and (select count(*) from v2.duel_answers a where a.duel_id = m.duel_id and a.user_id = u) >= c.questions) end))
        order by m.round, m.slot) from v2.cup_matches m where m.cup_id = c.id), '[]'::jsonb),
    'me', jsonb_build_object('host', v_host, 'eligible', v2._cup_eligible(c, v_uid),
      'joined', exists (select 1 from v2.cup_players cp where cp.cup_id = c.id and cp.user_id = v_uid))));
end $$;

-- Chọn câu cho một trận: dạng trả lời nhanh, có đáp án; ưu tiên câu hai bạn chưa gặp ở các vòng trước.
create or replace function v2._cup_items(c v2.cups, p_a uuid, p_b uuid) returns text[]
language sql volatile security definer set search_path = v2, public as $$
  with seen as (
    select distinct unnest(d.item_ids) as id from v2.cup_matches m join v2.duels d on d.id = m.duel_id
    where m.cup_id = c.id and (m.p1 in (p_a, p_b) or m.p2 in (p_a, p_b))
  ), pool as (
    select i.id, (i.id in (select id from seen)) as old, random() as r
    from v2.items i join v2.item_keys k on k.item_id = i.id and k.key is not null
    where i.type in ('MCQ', 'LISTEN_CHOOSE', 'SHORT_ANSWER', 'MATH_MANIPULATIVE', 'MCQ_MULTIPLE', 'ORDERING')
      and case when c.source = 'picked' then i.id = any (c.item_ids) else i.grade = c.grade and i.subject = c.subject end
  ), z as (select id from pool order by old, r limit c.questions)
  select coalesce(array_agg(id order by random()), '{}') from z
$$;

-- Số câu đủ để đấu (để báo GV khi tạo giải).
create or replace function v2._cup_pool_size(c v2.cups) returns int
language sql stable security definer set search_path = v2, public as $$
  select count(*)::int from v2.items i join v2.item_keys k on k.item_id = i.id and k.key is not null
  where i.type in ('MCQ', 'LISTEN_CHOOSE', 'SHORT_ANSWER', 'MATH_MANIPULATIVE', 'MCQ_MULTIPLE', 'ORDERING')
    and case when c.source = 'picked' then i.id = any (c.item_ids) else i.grade = c.grade and i.subject = c.subject end
$$;

-- Khung giờ của vòng r.
create or replace function v2._cup_window(c v2.cups, p_round int) returns tstzrange
language sql stable set search_path = v2, public as $$
  select tstzrange(o, o + make_interval(mins => c.round_minutes))
  from (select case when c.pace = 'daily' then greatest(now(), c.start_at + make_interval(days => p_round - 1)) else now() end as o) x
$$;

-- Bắt đầu giải: lấy danh sách HS (cả lớp / khối hoặc các bạn đã đăng kí), xếp hạt giống, dựng vòng 1.
create or replace function v2._cup_begin(p_cup uuid) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  c v2.cups;
  v_n int;
  v_size int;
  v_pos int[];
  v_win tstzrange;
  j int;
  a uuid;
  b uuid;
begin
  select * into c from v2.cups where id = p_cup for update;
  if c.status <> 'signup' then return; end if;
  if c.entry = 'all' then
    insert into v2.cup_players (cup_id, user_id, class_id)
    select c.id, p.id, p.class_id from v2.profiles p
    where p.role = 'student' and (
      (c.scope = 'class' and p.id in (select v2._class_student_ids(c.class_id)))
      or (c.scope = 'grade' and p.grade = c.grade))
    on conflict do nothing;
  end if;
  -- Quá 256 bạn: giữ 256 bạn đăng kí sớm nhất.
  delete from v2.cup_players cp where cp.cup_id = c.id and cp.user_id not in (
    select x.user_id from v2.cup_players x where x.cup_id = c.id order by x.joined_at, x.user_id limit 256);
  select count(*) into v_n from v2.cup_players where cup_id = c.id;
  if v_n < 2 then
    update v2.cups set status = 'cancelled', note = 'Giải cần ít nhất 2 học sinh tham gia.', finished_at = now() where id = c.id;
    return;
  end if;
  if v2._cup_pool_size(c) < c.questions then
    update v2.cups set status = 'cancelled', note = format('Chưa đủ câu hỏi: cần ít nhất %s câu dạng trả lời nhanh có đáp án.', c.questions),
      finished_at = now() where id = c.id;
    return;
  end if;
  -- Hạt giống: bốc thăm, hoặc theo mức thành thạo môn (cao → hạt giống 1).
  with o as (
    select cp.user_id, row_number() over (order by
      case when c.seeding = 'mastery' then coalesce((select avg(m.p) from v2.skill_mastery m join v2.skills s on s.code = m.skill_code
                                                      where m.user_id = cp.user_id and s.subject = c.subject), 0) end desc nulls last,
      random()) as rn
    from v2.cup_players cp where cp.cup_id = c.id
  ) update v2.cup_players cp set seed = o.rn, out_round = null from o where cp.cup_id = c.id and cp.user_id = o.user_id;
  v_size := 2;
  while v_size < v_n loop v_size := v_size * 2; end loop;
  v_pos := v2._cup_positions(v_size);
  v_win := v2._cup_window(c, 1);
  delete from v2.cup_matches where cup_id = c.id;
  for j in 0 .. v_size / 2 - 1 loop
    select user_id into a from v2.cup_players where cup_id = c.id and seed = v_pos[2 * j + 1];
    select user_id into b from v2.cup_players where cup_id = c.id and seed = v_pos[2 * j + 2];
    if a is null and b is null then continue; end if;
    insert into v2.cup_matches (cup_id, round, slot, p1, p2, opens_at, closes_at, status, winner, decided_by, decided_at)
    values (c.id, 1, j, coalesce(a, b), case when a is null then null else b end, lower(v_win), upper(v_win),
            case when a is null or b is null then 'done' else 'open' end,
            case when a is null or b is null then coalesce(a, b) end,
            case when a is null or b is null then 'bye' end,
            case when a is null or b is null then now() end);
    a := null; b := null;
  end loop;
  update v2.cups set status = 'running', round = 1, rounds = round(log(2, v_size))::int, started_at = now() where id = c.id;
end $$;

-- So hai kết quả: đúng nhiều hơn → điểm (tốc độ) cao hơn → tổng thời gian ít hơn → hạt giống cao hơn (số nhỏ).
create or replace function v2._cup_better(r1 jsonb, s1 int, r2 jsonb, s2 int) returns boolean
language sql immutable set search_path = v2, public as $$
  select case
    when (r1 ->> 'correct')::int <> (r2 ->> 'correct')::int then (r1 ->> 'correct')::int > (r2 ->> 'correct')::int
    when (r1 ->> 'points')::int <> (r2 ->> 'points')::int then (r1 ->> 'points')::int > (r2 ->> 'points')::int
    when (r1 ->> 'ms')::int <> (r2 ->> 'ms')::int then (r1 ->> 'ms')::int < (r2 ->> 'ms')::int
    else coalesce(s1, 9999) <= coalesce(s2, 9999) end
$$;

-- Quyết định một trận đang mở. p_force = hết giờ vòng (chưa đấu xong vẫn phải có người thắng).
create or replace function v2._cup_decide(c v2.cups, m v2.cup_matches, p_force boolean, p_winner uuid default null) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  r1 jsonb := jsonb_build_object('answered', 0, 'correct', 0, 'points', 0, 'ms', 0);
  r2 jsonb := r1;
  s1 int;
  s2 int;
  v_win uuid;
  v_by text;
  v_lose uuid;
begin
  if m.status <> 'open' or m.p1 is null or m.p2 is null then return; end if;
  if m.duel_id is not null then
    r1 := v2._cup_result(m.duel_id, m.p1);
    r2 := v2._cup_result(m.duel_id, m.p2);
  end if;
  select seed into s1 from v2.cup_players where cup_id = c.id and user_id = m.p1;
  select seed into s2 from v2.cup_players where cup_id = c.id and user_id = m.p2;
  if p_winner is not null then
    v_win := p_winner; v_by := 'teacher';
  elsif (r1 ->> 'answered')::int >= c.questions and (r2 ->> 'answered')::int >= c.questions then
    v_by := 'play';
  elsif not p_force then
    return;
  elsif (r1 ->> 'answered')::int = 0 and (r2 ->> 'answered')::int = 0 then
    v_by := 'seed';
    v_win := case when coalesce(s1, 9999) <= coalesce(s2, 9999) then m.p1 else m.p2 end;
  elsif (r1 ->> 'answered')::int = 0 or (r2 ->> 'answered')::int = 0 then
    v_by := 'walkover';
    v_win := case when (r1 ->> 'answered')::int > 0 then m.p1 else m.p2 end;
  else
    v_by := 'play';
  end if;
  if v_win is null then
    v_win := case when v2._cup_better(r1, s1, r2, s2) then m.p1 else m.p2 end;
  end if;
  v_lose := case when v_win = m.p1 then m.p2 else m.p1 end;
  update v2.cup_matches set winner = v_win, status = 'done', decided_by = v_by, decided_at = now(),
    result = jsonb_build_object(m.p1::text, r1, m.p2::text, r2)
  where cup_id = m.cup_id and round = m.round and slot = m.slot;
  update v2.cup_players set out_round = m.round where cup_id = c.id and user_id = v_lose;
  if m.duel_id is not null then
    update v2.duels set status = 'finished', ended_at = now(), winner = v_win,
      scores = jsonb_build_object(m.p1::text, (r1 ->> 'points')::int, m.p2::text, (r2 ->> 'points')::int),
      correct = jsonb_build_object(m.p1::text, (r1 ->> 'correct')::int, m.p2::text, (r2 ->> 'correct')::int)
    where id = m.duel_id;
  end if;
  -- Sao: thắng trận 2 sao, đã đấu mà thua 1 sao (mỗi trận một lần).
  if (case when v_win = m.p1 then r1 else r2 end ->> 'answered')::int > 0 then
    perform v2._award(v_win, 2, 2, 20, format('Thắng vòng %s · %s', m.round, c.title), 'arena', c.id::text,
                      format('cup:%s:r%ss%s:%s', c.id, m.round, m.slot, v_win), null);
  end if;
  if (case when v_lose = m.p1 then r1 else r2 end ->> 'answered')::int > 0 then
    perform v2._award(v_lose, 1, 1, 10, format('Thi đấu vòng %s · %s', m.round, c.title), 'arena', c.id::text,
                      format('cup:%s:r%ss%s:%s', c.id, m.round, m.slot, v_lose), null);
  end if;
end $$;

-- Kết thúc giải: Vô địch, Á quân, đồng Hạng ba → sao + cúp (huy hiệu).
create or replace function v2._cup_finish(p_cup uuid) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  c v2.cups;
  f v2.cup_matches;
  v_thirds uuid[];
  u uuid;
  v_date text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY');
begin
  select * into c from v2.cups where id = p_cup for update;
  if c.status <> 'running' then return; end if;
  select * into f from v2.cup_matches where cup_id = c.id and round = c.rounds and slot = 0;
  if c.rounds >= 2 then
    select coalesce(array_agg(case when m.winner = m.p1 then m.p2 else m.p1 end), '{}') into v_thirds
    from v2.cup_matches m where m.cup_id = c.id and m.round = c.rounds - 1 and m.p1 is not null and m.p2 is not null;
  else
    v_thirds := '{}';
  end if;
  update v2.cups set status = 'finished', finished_at = now(), champion = f.winner,
    runner_up = case when f.p2 is null then null when f.winner = f.p1 then f.p2 else f.p1 end, thirds = v_thirds
  where id = c.id returning * into c;
  if c.champion is not null then
    perform v2._award(c.champion, 10, 10, 100, 'Vô địch · ' || c.title, 'arena', c.id::text, format('cup:%s:place:%s', c.id, c.champion), null);
    insert into v2.user_badges (user_id, badge_id, title, glyph, note, granted_by)
    values (c.champion, 'cua-co', left('Vô địch · ' || c.title, 40), 'cup', left(format('Giải đấu "%s" (%s)', c.title, v_date), 120), c.created_by);
  end if;
  if c.runner_up is not null then
    perform v2._award(c.runner_up, 6, 6, 60, 'Á quân · ' || c.title, 'arena', c.id::text, format('cup:%s:place:%s', c.id, c.runner_up), null);
    insert into v2.user_badges (user_id, badge_id, title, glyph, note, granted_by)
    values (c.runner_up, 'cua-co', left('Á quân · ' || c.title, 40), 'cup', left(format('Giải đấu "%s" (%s)', c.title, v_date), 120), c.created_by);
  end if;
  foreach u in array c.thirds loop
    perform v2._award(u, 4, 4, 40, 'Hạng ba · ' || c.title, 'arena', c.id::text, format('cup:%s:place:%s', c.id, u), null);
    insert into v2.user_badges (user_id, badge_id, title, glyph, note, granted_by)
    values (u, 'cua-co', left('Hạng ba · ' || c.title, 40), 'cup', left(format('Giải đấu "%s" (%s)', c.title, v_date), 120), c.created_by);
  end loop;
end $$;

-- Tiến trình giải (gọi mỗi khi có người xem / đấu xong): bắt đầu đúng giờ, quyết định trận, mở vòng sau, kết thúc.
create or replace function v2._cup_tick(p_cup uuid) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  c v2.cups;
  m v2.cup_matches;
  v_win tstzrange;
  w uuid[];
  k int;
  guard int := 0;
begin
  select * into c from v2.cups where id = p_cup for update;
  if not found then return; end if;
  if c.status = 'signup' and now() >= c.start_at then
    perform v2._cup_begin(c.id);
    select * into c from v2.cups where id = p_cup;
  end if;
  while c.status = 'running' and guard < 10 loop
    guard := guard + 1;
    for m in select * from v2.cup_matches where cup_id = c.id and round = c.round and status = 'open' loop
      perform v2._cup_decide(c, m, m.closes_at is not null and now() >= m.closes_at);
    end loop;
    exit when exists (select 1 from v2.cup_matches where cup_id = c.id and round = c.round and status = 'open');
    if c.round >= c.rounds then
      perform v2._cup_finish(c.id);
      exit;
    end if;
    select coalesce(array_agg(winner order by slot), '{}') into w from v2.cup_matches where cup_id = c.id and round = c.round;
    v_win := v2._cup_window(c, c.round + 1);
    for k in 0 .. (cardinality(w) + 1) / 2 - 1 loop
      insert into v2.cup_matches (cup_id, round, slot, p1, p2, opens_at, closes_at, status, winner, decided_by, decided_at)
      values (c.id, c.round + 1, k, w[2 * k + 1], w[2 * k + 2], lower(v_win), upper(v_win),
              case when w[2 * k + 2] is null then 'done' else 'open' end,
              case when w[2 * k + 2] is null then w[2 * k + 1] end,
              case when w[2 * k + 2] is null then 'bye' end,
              case when w[2 * k + 2] is null then now() end)
      on conflict do nothing;
    end loop;
    update v2.cups set round = round + 1 where id = c.id returning * into c;
  end loop;
end $$;

-- ---------- RPC giáo viên ----------
create or replace function v2.cup_create(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_role text := v2._require_user();
  c v2.cups;
  v_class text := nullif(btrim(coalesce(p ->> 'classId', '')), '');
  v_scope text := coalesce(nullif(p ->> 'scope', ''), 'class');
  v_grade int;
  v_items text[];
begin
  if v_role not in ('teacher', 'admin') then raise exception 'Chỉ thầy/cô mới mở được giải đấu.' using errcode = '42501'; end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Thông tin giải không hợp lệ.' using errcode = '22023'; end if;
  if v_scope not in ('class', 'grade') then raise exception 'Phạm vi chỉ là "class" hoặc "grade".' using errcode = '22023'; end if;
  if v_class is null then raise exception 'Thầy/cô chọn lớp cho giải đấu nhé.' using errcode = '22023'; end if;
  if not v2.is_teacher_of_class(v_class) then raise exception 'Thầy/cô chỉ mở giải cho lớp mình phụ trách.' using errcode = '42501'; end if;
  select grade into v_grade from v2.classes where id = v_class;
  if v_grade is null then raise exception 'Không tìm thấy lớp.' using errcode = 'P0002'; end if;
  if jsonb_typeof(coalesce(p -> 'itemIds', '[]'::jsonb)) <> 'array' then raise exception 'Danh sách câu không hợp lệ.' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_items from jsonb_array_elements_text(coalesce(p -> 'itemIds', '[]'::jsonb)) x
   where exists (select 1 from v2.items i where i.id = x);
  insert into v2.cups (title, scope, class_id, grade, subject, source, item_ids, questions, seeding, entry, start_at, round_minutes, pace, created_by)
  values (btrim(coalesce(p ->> 'title', '')), v_scope, v_class, v_grade, coalesce(nullif(p ->> 'subject', ''), 'toan'),
          coalesce(nullif(p ->> 'source', ''), 'auto'), v_items, coalesce(v2.try_int(p ->> 'questions'), 7),
          coalesce(nullif(p ->> 'seeding', ''), 'random'), coalesce(nullif(p ->> 'entry', ''), 'all'),
          coalesce((p ->> 'startAt')::timestamptz, now()), coalesce(v2.try_int(p ->> 'roundMinutes'), 60),
          coalesce(nullif(p ->> 'pace', ''), 'continuous'), auth.uid())
  returning * into c;
  if c.source = 'picked' and cardinality(c.item_ids) = 0 then
    raise exception 'Thầy/cô chọn câu hỏi cho giải (hoặc chọn "Tự động theo môn").' using errcode = '22023';
  end if;
  if v2._cup_pool_size(c) < c.questions then
    raise exception 'Chưa đủ câu hỏi: mỗi trận cần % câu dạng trả lời nhanh có đáp án, hiện có % câu.', c.questions, v2._cup_pool_size(c) using errcode = '22023';
  end if;
  perform v2._cup_tick(c.id);
  select * into c from v2.cups where id = c.id;
  return v2._cup_json(c);
end $$;

-- Danh sách giải: GV — giải mình mở / của lớp mình; HS — giải của lớp / khối em (đang diễn ra hoặc xong trong 30 ngày).
create or replace function v2.cup_list(p_class text default null) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_role text := v2._require_user();
  v_uid uuid := auth.uid();
  v_ids uuid[];
  x uuid;
begin
  if v_role in ('teacher', 'admin') then
    select coalesce(array_agg(c.id order by c.created_at desc), '{}') into v_ids from (
      select c.* from v2.cups c
      where (p_class is null or c.class_id = p_class) and v2._cup_host(c)
      order by c.created_at desc limit 60) c;
  else
    select coalesce(array_agg(c.id order by c.created_at desc), '{}') into v_ids from (
      select c.* from v2.cups c
      where c.status <> 'cancelled' and (c.status in ('signup', 'running') or c.finished_at > now() - interval '30 days')
        and (v2._cup_eligible(c, v_uid) or exists (select 1 from v2.cup_players cp where cp.cup_id = c.id and cp.user_id = v_uid))
      order by c.created_at desc limit 20) c;
  end if;
  foreach x in array v_ids loop
    if (select status from v2.cups where id = x) in ('signup', 'running') then perform v2._cup_tick(x); end if;
  end loop;
  return coalesce((select jsonb_agg(v2._cup_json(c) order by c.created_at desc) from v2.cups c where c.id = any (v_ids)), '[]'::jsonb);
end $$;

create or replace function v2._cup_load(p_id uuid, p_host boolean) returns v2.cups
language plpgsql volatile security definer set search_path = v2, public as $$
declare c v2.cups;
begin
  perform v2._require_user();
  select * into c from v2.cups where id = p_id;
  if not found then raise exception 'Không tìm thấy giải đấu.' using errcode = 'P0002'; end if;
  if p_host and not v2._cup_host(c) then raise exception 'Chỉ thầy/cô mở giải mới làm được việc này.' using errcode = '42501'; end if;
  if not p_host and not (v2._cup_host(c) or v2._cup_eligible(c, auth.uid())
                         or exists (select 1 from v2.cup_players cp where cp.cup_id = c.id and cp.user_id = auth.uid())) then
    raise exception 'Em không thuộc giải đấu này.' using errcode = '42501';
  end if;
  return c;
end $$;

create or replace function v2.cup_get(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare c v2.cups := v2._cup_load(p_id, false);
begin
  perform v2._cup_tick(c.id);
  select * into c from v2.cups where id = p_id;
  return v2._cup_json(c);
end $$;

create or replace function v2.cup_start(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare c v2.cups := v2._cup_load(p_id, true);
begin
  if c.status <> 'signup' then raise exception 'Giải đã bắt đầu rồi.' using errcode = '22023'; end if;
  update v2.cups set start_at = now() where id = c.id;
  perform v2._cup_tick(c.id);
  select * into c from v2.cups where id = p_id;
  return v2._cup_json(c);
end $$;

-- Đóng vòng hiện tại ngay (các trận chưa xong được quyết định theo luật hết giờ).
create or replace function v2.cup_close_round(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare c v2.cups := v2._cup_load(p_id, true);
begin
  if c.status <> 'running' then raise exception 'Giải không còn diễn ra.' using errcode = '22023'; end if;
  update v2.cup_matches set closes_at = now(), opens_at = least(opens_at, now())
   where cup_id = c.id and round = c.round and status = 'open';
  perform v2._cup_tick(c.id);
  select * into c from v2.cups where id = p_id;
  return v2._cup_json(c);
end $$;

create or replace function v2.cup_set_winner(p_id uuid, p_round int, p_slot int, p_winner uuid) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare c v2.cups := v2._cup_load(p_id, true); m v2.cup_matches;
begin
  select * into m from v2.cup_matches where cup_id = c.id and round = p_round and slot = p_slot;
  if not found or c.status <> 'running' or m.round <> c.round or m.status <> 'open' then
    raise exception 'Chỉ chọn người thắng cho trận đang diễn ra ở vòng hiện tại.' using errcode = '22023';
  end if;
  if p_winner is null or p_winner not in (m.p1, m.p2) then raise exception 'Người thắng phải là một trong hai bạn của trận.' using errcode = '22023'; end if;
  perform v2._cup_decide(c, m, true, p_winner);
  perform v2._cup_tick(c.id);
  select * into c from v2.cups where id = p_id;
  return v2._cup_json(c);
end $$;

create or replace function v2.cup_cancel(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare c v2.cups := v2._cup_load(p_id, true);
begin
  if c.status in ('finished', 'cancelled') then raise exception 'Giải đã kết thúc.' using errcode = '22023'; end if;
  update v2.cups set status = 'cancelled', finished_at = now(), note = coalesce(note, 'Thầy/cô đã huỷ giải.') where id = c.id returning * into c;
  update v2.duels set status = 'cancelled', ended_at = now()
   where id in (select duel_id from v2.cup_matches where cup_id = c.id and status = 'open' and duel_id is not null) and status = 'playing';
  return v2._cup_json(c);
end $$;

create or replace function v2.cup_delete(p_id uuid) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare c v2.cups := v2._cup_load(p_id, true);
begin
  if c.status = 'running' then raise exception 'Giải đang diễn ra — thầy/cô huỷ giải trước khi xoá.' using errcode = '22023'; end if;
  update v2.duels set status = 'cancelled', ended_at = now()
   where id in (select duel_id from v2.cup_matches where cup_id = c.id and duel_id is not null) and status = 'playing';
  delete from v2.cups where id = c.id;
end $$;

-- GV thêm / bớt học sinh khi giải chưa bắt đầu.
create or replace function v2.cup_set_player(p_id uuid, p_user uuid, p_in boolean) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare c v2.cups := v2._cup_load(p_id, true);
begin
  if c.status <> 'signup' then raise exception 'Giải đã bắt đầu — không đổi danh sách được nữa.' using errcode = '22023'; end if;
  if p_in then
    if not v2._cup_eligible(c, p_user) then raise exception 'Học sinh này không thuộc lớp / khối của giải.' using errcode = '22023'; end if;
    insert into v2.cup_players (cup_id, user_id, class_id) select c.id, p_user, p.class_id from v2.profiles p where p.id = p_user on conflict do nothing;
  else
    delete from v2.cup_players where cup_id = c.id and user_id = p_user;
  end if;
  return v2._cup_json(c);
end $$;

-- ---------- RPC học sinh ----------
create or replace function v2.cup_join(p_id uuid, p_in boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare c v2.cups := v2._cup_load(p_id, false); v_me v2.profiles;
begin
  if c.status <> 'signup' then raise exception 'Giải đã bắt đầu, không đăng kí được nữa.' using errcode = '22023'; end if;
  if not v2._cup_eligible(c, auth.uid()) then raise exception 'Em không thuộc lớp / khối của giải này.' using errcode = '42501'; end if;
  if p_in then
    select * into v_me from v2.profiles where id = auth.uid();
    insert into v2.cup_players (cup_id, user_id, class_id) values (c.id, v_me.id, v_me.class_id) on conflict do nothing;
  else
    delete from v2.cup_players where cup_id = c.id and user_id = auth.uid();
  end if;
  return v2._cup_json(c);
end $$;

-- Vào trận của em ở vòng hiện tại: tạo trận (bộ câu chung cho hai bạn) nếu chưa có. Trả câu hỏi (không có đáp án)
-- và các câu em đã làm (để làm tiếp khi lỡ thoát ra).
create or replace function v2.cup_play(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  c v2.cups;
  m v2.cup_matches;
  v_uid uuid := auth.uid();
  v_items text[];
  v_code text;
  v_d v2.duels;
  i int := 0;
begin
  c := v2._cup_load(p_id, false);
  perform v2._cup_tick(c.id);
  select * into c from v2.cups where id = p_id;
  if c.status <> 'running' then raise exception 'Giải đấu không còn diễn ra.' using errcode = '22023'; end if;
  select * into m from v2.cup_matches where cup_id = c.id and round = c.round and v_uid in (p1, p2) for update;
  if not found then raise exception 'Em không có trận ở vòng này.' using errcode = 'P0002'; end if;
  if m.status <> 'open' then raise exception 'Trận của em ở vòng này đã có kết quả.' using errcode = '22023'; end if;
  if now() < m.opens_at then raise exception 'Vòng % chưa mở. Em quay lại lúc % nhé!', m.round,
       to_char(m.opens_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') using errcode = '22023'; end if;
  if m.duel_id is null then
    v_items := v2._cup_items(c, m.p1, m.p2);
    if cardinality(v_items) < 3 then raise exception 'Giải chưa đủ câu hỏi. Em báo thầy/cô nhé.' using errcode = 'P0002'; end if;
    loop
      v_code := (1000 + floor(random() * 9000))::int::text;
      exit when not exists (select 1 from v2.duels where code = v_code and status in ('waiting', 'playing'));
      i := i + 1;
      if i > 50 then raise exception 'Máy chủ đang bận, em thử lại sau ít giây nhé.' using errcode = '54000'; end if;
    end loop;
    insert into v2.duels (code, mode, class_id, subject, grade, players, item_ids, seed, status, created_by, started_at, scope)
    values (v_code, 'cup', c.class_id, c.subject, c.grade, array[m.p1, m.p2], v_items, floor(random() * 2147483647)::int,
            'playing', c.created_by, now(), c.scope)
    returning * into v_d;
    update v2.cup_matches set duel_id = v_d.id where cup_id = m.cup_id and round = m.round and slot = m.slot;
  else
    select * into v_d from v2.duels where id = m.duel_id;
  end if;
  return jsonb_build_object(
    'cupId', c.id, 'round', m.round, 'slot', m.slot, 'closesAt', m.closes_at,
    'opponent', v2._cup_player_json(case when m.p1 = v_uid then m.p2 else m.p1 end),
    'duel', v2.duel_json(v_d),
    'items', coalesce((select jsonb_agg(v2.item_to_json(it, null, false) order by x.o)
                       from unnest(v_d.item_ids) with ordinality as x(id, o) join v2.items it on it.id = x.id), '[]'::jsonb),
    'answered', coalesce((select jsonb_agg(jsonb_build_object('q', a.q, 'correct', a.correct, 'points', a.points, 'ms', a.ms) order by a.q)
                          from v2.duel_answers a where a.duel_id = v_d.id and a.user_id = v_uid), '[]'::jsonb));
end $$;

-- Em đấu xong (hoặc muốn xem kết quả): cập nhật tiến trình giải.
create or replace function v2.cup_done(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
begin
  return v2.cup_get(p_id);
end $$;

-- ---------------------------------------------------------------------------
-- 3) Bảng xếp hạng Đấu trường của lớp (theo mùa)
--    Đấu 1–1 với bạn: thắng 3, hoà 1 (mỗi ngày tính 5 trận đầu) · với Robo: thắng 1 · Giải đấu: thắng mỗi trận 3,
--    Vô địch +10, Á quân +6, Hạng ba +4.
-- ---------------------------------------------------------------------------
create or replace function v2._arena_points(p_class text, p_since timestamptz) returns table (user_id uuid, points int, wins int, played int)
language sql stable security definer set search_path = v2, public as $$
  with st as (select s from v2._class_student_ids(p_class) s),
  d as (
    select u as user_id, d.mode, d.winner, d.winner_bot, d.ended_at,
      row_number() over (partition by u, (d.ended_at at time zone 'Asia/Ho_Chi_Minh')::date order by d.ended_at) as k
    from v2.duels d cross join lateral unnest(d.players) u
    where d.status = 'finished' and d.mode in ('queue', 'code', 'challenge', 'bot') and u in (select s from st)
      and (p_since is null or d.ended_at > p_since)
  ), dp as (
    select user_id,
      sum(case when k > 5 then 0
               when mode = 'bot' then case when winner = user_id then 1 else 0 end
               when winner = user_id then 3 when winner is null and not winner_bot then 1 else 0 end)::int as pts,
      count(*) filter (where winner = user_id)::int as w, count(*)::int as n
    from d group by user_id
  ), cm as (
    select u as user_id, sum(case when m.winner = u and m.decided_by in ('play', 'walkover', 'teacher') then 3 else 0 end)::int as pts,
      count(*) filter (where m.winner = u and m.decided_by in ('play', 'walkover', 'teacher'))::int as w,
      count(*) filter (where m.decided_by in ('play', 'walkover', 'teacher'))::int as n
    from v2.cup_matches m cross join lateral unnest(array[m.p1, m.p2]) u
    where m.status = 'done' and u in (select s from st) and (p_since is null or m.decided_at > p_since)
    group by u
  ), cp as (
    select u as user_id, sum(bonus)::int as pts from (
      select c.champion as u, 10 as bonus from v2.cups c where c.status = 'finished' and (p_since is null or c.finished_at > p_since)
      union all select c.runner_up, 6 from v2.cups c where c.status = 'finished' and (p_since is null or c.finished_at > p_since)
      union all select t, 4 from v2.cups c cross join lateral unnest(c.thirds) t where c.status = 'finished' and (p_since is null or c.finished_at > p_since)
    ) z where u in (select s from st) group by u
  )
  select s as user_id,
    coalesce((select pts from dp where dp.user_id = s), 0) + coalesce((select pts from cm where cm.user_id = s), 0) + coalesce((select pts from cp where cp.user_id = s), 0),
    coalesce((select w from dp where dp.user_id = s), 0) + coalesce((select w from cm where cm.user_id = s), 0),
    coalesce((select n from dp where dp.user_id = s), 0) + coalesce((select n from cm where cm.user_id = s), 0)
  from st
$$;

create or replace function v2._arena_board(p_class text) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with s as (select v2._arena_settings(p_class) as st),
  r as (
    select a.user_id, a.points, a.wins, a.played, p.name, p.avatar_mascot, p.avatar_color,
      rank() over (order by a.points desc, a.wins desc) as rk,
      row_number() over (order by a.points desc, a.wins desc, p.name) as rn
    from v2._arena_points(p_class, (select (st).season_start from s)) a join v2.profiles p on p.id = a.user_id
  )
  select jsonb_build_object(
    'classId', p_class, 'seasonTitle', (select (st).season_title from s), 'seasonStart', (select (st).season_start from s),
    'total', (select count(*) from r),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('userId', user_id, 'name', name, 'mascot', avatar_mascot, 'color', avatar_color,
                       'points', points, 'wins', wins, 'played', played, 'rank', rk) order by rn) from r), '[]'::jsonb))
$$;

-- GV: cả lớp. HS: top 10 + vị trí của em.
create or replace function v2.arena_board(p_class text default null) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_role text := v2._require_user();
  v_class text := p_class;
  b jsonb;
  v_me jsonb;
begin
  if v_role = 'student' then
    select class_id into v_class from v2.profiles where id = auth.uid();
    if v_class is null then return jsonb_build_object('rows', '[]'::jsonb, 'total', 0); end if;
    b := v2._arena_board(v_class);
    select x into v_me from jsonb_array_elements(b -> 'rows') x where x ->> 'userId' = auth.uid()::text;
    return b || jsonb_build_object(
      'rows', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements(b -> 'rows') with ordinality as t(x, o)
                                                   where (x ->> 'points')::int > 0 order by o limit 10) z), '[]'::jsonb),
      'me', v_me);
  end if;
  if v_class is null or not v2.is_teacher_of_class(v_class) then
    raise exception 'Chỉ thầy/cô của lớp mới xem được bảng xếp hạng đầy đủ.' using errcode = '42501';
  end if;
  return v2._arena_board(v_class);
end $$;

-- Kết thúc mùa: lưu top 10, trao sao + cúp cho 3 hạng đầu (có điểm), mùa mới bắt đầu từ 0.
create or replace function v2.arena_end_season(p_class text, p_title text default null) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  s v2.arena_settings;
  b jsonb;
  v_top jsonb;
  v_title text;
  v_season v2.arena_seasons;
  x jsonb;
  v_prize int;
  v_label text;
  v_date text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY');
begin
  perform v2._require_user();
  if not v2.is_teacher_of_class(p_class) then raise exception 'Chỉ thầy/cô của lớp mới kết thúc mùa.' using errcode = '42501'; end if;
  s := v2._arena_settings(p_class);
  v_title := coalesce(nullif(left(btrim(coalesce(p_title, '')), 80), ''), s.season_title,
                      'Mùa ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'MM/YYYY'));
  b := v2._arena_board(p_class);
  select coalesce(jsonb_agg(z.e), '[]'::jsonb) into v_top
  from (select t.e from jsonb_array_elements(b -> 'rows') with ordinality as t(e, o) where (t.e ->> 'points')::int > 0 order by t.o limit 10) z;
  insert into v2.arena_seasons (class_id, title, started_at, ended_at, top, created_by)
  values (p_class, v_title, s.season_start, now(), v_top, auth.uid()) returning * into v_season;
  for x in select value from jsonb_array_elements(v_top) loop
    exit when (x ->> 'rank')::int > 3;
    v_prize := case (x ->> 'rank')::int when 1 then 10 when 2 then 6 else 4 end;
    v_label := case (x ->> 'rank')::int when 1 then 'Hạng nhất' when 2 then 'Hạng nhì' else 'Hạng ba' end;
    perform v2._award((x ->> 'userId')::uuid, v_prize, v_prize, v_prize * 10, v_label || ' · ' || v_title, 'arena', v_season.id::text,
                      format('season:%s:%s', v_season.id, x ->> 'userId'), auth.uid());
    insert into v2.user_badges (user_id, badge_id, title, glyph, note, granted_by)
    values ((x ->> 'userId')::uuid, 'cua-co', left(v_label || ' · ' || v_title, 40), 'cup',
            left(format('Bảng xếp hạng Đấu trường "%s" (%s)', v_title, v_date), 120), auth.uid());
  end loop;
  insert into v2.arena_settings (class_id, enabled, scope, source, item_ids, hours, modes, season_title, season_start, updated_by)
  values (p_class, s.enabled, s.scope, s.source, s.item_ids, s.hours, s.modes, null, now(), auth.uid())
  on conflict (class_id) do update set season_start = now(), season_title = null, updated_by = auth.uid(), updated_at = now();
  return jsonb_build_object('id', v_season.id, 'classId', p_class, 'title', v_season.title, 'startedAt', v_season.started_at,
                            'endedAt', v_season.ended_at, 'top', v_season.top);
end $$;

create or replace function v2.arena_seasons(p_class text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  if not (v2.is_teacher_of_class(p_class) or p_class in (select v2.my_class_ids())) then
    raise exception 'Không xem được lịch sử mùa của lớp này.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'classId', s.class_id, 'title', s.title, 'startedAt', s.started_at,
                    'endedAt', s.ended_at, 'top', s.top) order by s.ended_at desc)
                   from v2.arena_seasons s where s.class_id = p_class), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Quyền gọi hàm
-- ---------------------------------------------------------------------------
revoke all on function
  v2._arena_settings(text), v2._arena_open(jsonb, timestamptz), v2._arena_json(v2.arena_settings, boolean), v2._arena_require(text, text),
  v2._duel_finish_core(uuid, boolean), v2._cup_positions(int), v2._cup_host(v2.cups), v2._cup_eligible(v2.cups, uuid),
  v2._cup_player_json(uuid), v2._cup_result(uuid, uuid), v2._cup_json(v2.cups), v2._cup_items(v2.cups, uuid, uuid),
  v2._cup_pool_size(v2.cups), v2._cup_window(v2.cups, int), v2._cup_begin(uuid), v2._cup_better(jsonb, int, jsonb, int),
  v2._cup_decide(v2.cups, v2.cup_matches, boolean, uuid), v2._cup_finish(uuid), v2._cup_tick(uuid), v2._cup_load(uuid, boolean),
  v2._arena_points(text, timestamptz), v2._arena_board(text),
  v2._duel_pick_items(uuid, int, text), v2._duel_new(text, text, uuid)
from public, anon, authenticated;

revoke all on function
  v2.arena_get_settings(text), v2.arena_save_settings(text, jsonb), v2.arena_pool_add(text, text[]), v2.arena_access(),
  v2.duel_seek(text), v2.duel_join(text), v2.duel_finish(uuid, boolean),
  v2.cup_create(jsonb), v2.cup_list(text), v2.cup_get(uuid), v2.cup_start(uuid), v2.cup_close_round(uuid),
  v2.cup_set_winner(uuid, int, int, uuid), v2.cup_cancel(uuid), v2.cup_delete(uuid), v2.cup_set_player(uuid, uuid, boolean),
  v2.cup_join(uuid, boolean), v2.cup_play(uuid), v2.cup_done(uuid),
  v2.arena_board(text), v2.arena_end_season(text, text), v2.arena_seasons(text)
from public, anon;
grant execute on function
  v2.arena_get_settings(text), v2.arena_save_settings(text, jsonb), v2.arena_pool_add(text, text[]), v2.arena_access(),
  v2.duel_seek(text), v2.duel_join(text), v2.duel_finish(uuid, boolean),
  v2.cup_create(jsonb), v2.cup_list(text), v2.cup_get(uuid), v2.cup_start(uuid), v2.cup_close_round(uuid),
  v2.cup_set_winner(uuid, int, int, uuid), v2.cup_cancel(uuid), v2.cup_delete(uuid), v2.cup_set_player(uuid, uuid, boolean),
  v2.cup_join(uuid, boolean), v2.cup_play(uuid), v2.cup_done(uuid),
  v2.arena_board(text), v2.arena_end_season(text, text), v2.arena_seasons(text)
to authenticated;
