-- =============================================================================
-- Trang nhúng, Trang học của lớp, xAPI (docs/KET_NOI_LTI.md, docs/TRANG_HOC.md).
--   * v2.embed_sites: trang được phép nhúng (GV và quản trị thêm / bớt). Sẵn 10 trang học tập quen thuộc.
--   * v2.class_pages: "Trang học" của lớp — link nhúng hoặc bài trong app LTI (chọn bằng Deep Linking).
--   * v2.xapi_statements: dữ liệu học chi tiết app ngoài gửi về (xAPI). Ghi qua Edge Function `lti` (service role).
--   * v2.learning_events: thêm object_type 'external' (câu trả lời ở app ngoài, có mã kĩ năng → tính mức thành thạo).
-- Chạy lại nhiều lần được.
-- =============================================================================

/* ------------------------------- trang được phép nhúng ------------------------------- */
create or replace function v2._origin_ok(p text) returns boolean
language sql immutable set search_path = v2, public as $$
  select p is not null and length(p) <= 200
    and p ~ '^(https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?|http://(localhost|127\.0\.0\.1))(:[0-9]{1,5})?$'
$$;

create table if not exists v2.embed_sites (
  origin text primary key check (v2._origin_ok(origin)),
  name text not null default '' check (length(name) <= 80),
  builtin boolean not null default false,
  added_by uuid references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table v2.embed_sites enable row level security;

drop policy if exists embed_sites_read on v2.embed_sites;
create policy embed_sites_read on v2.embed_sites for select to authenticated using (true);
drop policy if exists embed_sites_staff_insert on v2.embed_sites;
create policy embed_sites_staff_insert on v2.embed_sites for insert to authenticated
  with check ((select v2.is_staff()) and added_by = auth.uid() and not builtin);
drop policy if exists embed_sites_staff_delete on v2.embed_sites;
create policy embed_sites_staff_delete on v2.embed_sites for delete to authenticated using ((select v2.is_staff()));

revoke all on v2.embed_sites from public, anon, authenticated;
grant select, insert, delete on v2.embed_sites to authenticated;
grant all on v2.embed_sites to service_role;

insert into v2.embed_sites (origin, name, builtin) values
  ('https://www.youtube-nocookie.com', 'YouTube', true),
  ('https://docs.google.com', 'Google Tài liệu / Trang trình bày / Biểu mẫu', true),
  ('https://drive.google.com', 'Google Drive', true),
  ('https://quizizz.com', 'Quizizz', true),
  ('https://wayground.com', 'Wayground', true),
  ('https://wordwall.net', 'Wordwall', true),
  ('https://www.canva.com', 'Canva', true),
  ('https://padlet.com', 'Padlet', true),
  ('https://www.geogebra.org', 'GeoGebra', true),
  ('https://scratch.mit.edu', 'Scratch', true)
on conflict (origin) do nothing;

/* ------------------------------- trang học của lớp ------------------------------- */
create table if not exists v2.class_pages (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references v2.classes (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 500),
  -- link: trang web nhúng (url phải thuộc embed_sites, app kiểm tra) · lti: bài trong app LTI.
  kind text not null default 'link' check (kind in ('link', 'lti')),
  url text check (url is null or (length(url) <= 1000 and url ~ '^https?://')),
  app_id text references v2.external_apps (id) on delete cascade,
  -- Bài chọn bằng Deep Linking: { custom: {..}, lineItem: { scoreMaximum, label, resourceId, tag } }.
  lti jsonb not null default '{}'::jsonb check (jsonb_typeof(lti) = 'object' and octet_length(lti::text) <= 8192),
  -- window: mở thẻ mới · iframe: mở ngay trong OPEN-EDU.
  open_in text not null default 'iframe' check (open_in in ('iframe', 'window')),
  position int not null default 0,
  hidden boolean not null default false,
  created_by uuid references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'lti' and app_id is not null))
);
create index if not exists class_pages_class_idx on v2.class_pages (class_id, position, created_at);
create index if not exists class_pages_app_idx on v2.class_pages (app_id) where app_id is not null;
alter table v2.class_pages enable row level security;

drop policy if exists class_pages_read on v2.class_pages;
create policy class_pages_read on v2.class_pages for select to authenticated
  using ((select v2.is_teacher_of_class(class_id)) or (not hidden and (select v2.can_see_class(class_id))));
drop policy if exists class_pages_insert on v2.class_pages;
create policy class_pages_insert on v2.class_pages for insert to authenticated
  with check ((select v2.is_teacher_of_class(class_id)) and created_by = auth.uid());
drop policy if exists class_pages_update on v2.class_pages;
create policy class_pages_update on v2.class_pages for update to authenticated
  using ((select v2.is_teacher_of_class(class_id))) with check ((select v2.is_teacher_of_class(class_id)));
drop policy if exists class_pages_delete on v2.class_pages;
create policy class_pages_delete on v2.class_pages for delete to authenticated using ((select v2.is_teacher_of_class(class_id)));

revoke all on v2.class_pages from public, anon, authenticated;
grant select, insert, update, delete on v2.class_pages to authenticated;
grant all on v2.class_pages to service_role;

-- Cấu hình LTI có thêm deepLinkUrl (địa chỉ chọn bài của app, không bắt buộc).
create or replace function v2._lti_config_ok(p jsonb) returns boolean
language sql immutable set search_path = v2, public as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= 8192
    and coalesce(p ->> 'clientId', '') ~ '^[A-Za-z0-9._~-]{8,100}$'
    and coalesce(p ->> 'deploymentId', '') ~ '^[A-Za-z0-9._~-]{1,100}$'
    and v2._lti_url_ok(p ->> 'loginUrl')
    and v2._lti_url_ok(p ->> 'launchUrl')
    and (coalesce(p ->> 'deepLinkUrl', '') = '' or v2._lti_url_ok(p ->> 'deepLinkUrl'))
    and (coalesce(p ->> 'jwksUrl', '') = '' or v2._lti_url_ok(p ->> 'jwksUrl'))
    and (coalesce(p ->> 'jwksUrl', '') <> '' or coalesce(p ->> 'publicKey', '') <> '')
    and length(coalesce(p ->> 'publicKey', '')) <= 4000
    and (p -> 'redirectUris' is null or (
      jsonb_typeof(p -> 'redirectUris') = 'array' and jsonb_array_length(p -> 'redirectUris') <= 10
      and not exists (select 1 from jsonb_array_elements(p -> 'redirectUris') e(u) where jsonb_typeof(e.u) <> 'string' or not v2._lti_url_ok(e.u #>> '{}'))
    ))
  )
$$;

-- list_lti_tools: thêm deepLinkUrl (để GV biết app có cho chọn bài không).
create or replace function v2.list_lti_tools() returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'description', a.description,
      'clientId', a.lti ->> 'clientId', 'deploymentId', a.lti ->> 'deploymentId',
      'loginUrl', a.lti ->> 'loginUrl', 'launchUrl', a.lti ->> 'launchUrl',
      'deepLinkUrl', nullif(a.lti ->> 'deepLinkUrl', '')) order by a.name), '[]'::jsonb)
  from v2.external_apps a
  where a.enabled and a.lti is not null and auth.uid() is not null
    and exists (select 1 from v2.profiles p where p.id = auth.uid() and p.role in ('student', 'teacher', 'admin'))
$$;

/* ------------------------------- xAPI ------------------------------- */
create table if not exists v2.xapi_statements (
  id uuid primary key,
  user_id uuid not null references v2.profiles (id) on delete cascade,
  app_id text not null references v2.external_apps (id) on delete restrict,
  verb text not null check (length(verb) <= 200),
  object_id text not null check (length(object_id) <= 500),
  object_name text not null default '' check (length(object_name) <= 300),
  success boolean,
  score_scaled numeric check (score_scaled is null or score_scaled between -1 and 1),
  duration_sec int check (duration_sec is null or duration_sec between 0 and 86400),
  skills text[] not null default '{}' check (coalesce(array_length(skills, 1), 0) <= 10),
  statement jsonb not null check (octet_length(statement::text) <= 16384),
  at timestamptz not null default now(),
  stored timestamptz not null default now()
);
create index if not exists xapi_statements_user_idx on v2.xapi_statements (user_id, at desc);
create index if not exists xapi_statements_app_idx on v2.xapi_statements (app_id, stored desc);
alter table v2.xapi_statements enable row level security;
drop policy if exists xapi_statements_read on v2.xapi_statements;
create policy xapi_statements_read on v2.xapi_statements for select to authenticated using ((select v2.can_view_user(user_id)));
revoke all on v2.xapi_statements from public, anon, authenticated;
grant select on v2.xapi_statements to authenticated;   -- ghi: chỉ Edge Function (service role)
grant all on v2.xapi_statements to service_role;

-- Câu trả lời ở app ngoài (có mã kĩ năng) → sự kiện học 'external' để tính mức thành thạo.
alter table v2.learning_events drop constraint if exists learning_events_object_type_check;
alter table v2.learning_events add constraint learning_events_object_type_check
  check (object_type in ('slide', 'item', 'lesson', 'package', 'live', 'arena', 'remediation', 'work', 'exam', 'external'));

revoke execute on function v2._origin_ok(text) from public, anon;
grant execute on function v2._origin_ok(text), v2._lti_config_ok(jsonb) to authenticated;
revoke execute on function v2.list_lti_tools() from public, anon;
grant execute on function v2.list_lti_tools() to authenticated;
grant execute on all functions in schema v2 to service_role;
