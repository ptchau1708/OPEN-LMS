-- =============================================================================
-- OPEN-EDU · SQL 15 · Phòng thảo luận (docs/THAO_LUAN.md)
--   • v2.discussions: phòng thảo luận của lớp (GV tạo). Trong phòng có:
--       rooms: các PHÒNG NHỎ [{id, name, members: [uuid…]}] — members rỗng = cả lớp vào được;
--       tabs:  các TAB đăng bài kiểu Padlet [{id, name, color}].
--   • v2.discussion_posts: bài (thẻ) + bình luận (parent_id, 1 tầng). Trạng thái pending | visible | hidden | removed.
--     HS đăng qua RPC v2.post_discussion (kiểm tra giờ mở, khóa, phòng nhỏ, giới hạn, lọc từ). Không xóa thật.
--   • v2.discussion_reactions (❤️ ⭐ 👍), v2.discussion_reports (HS báo bài chưa hay), v2.discussion_words (từ cần chặn).
--   • Bucket riêng tư `discussion`: <discussion_id>/<user_id>/<file>.jpg.
--   • Realtime: discussion_posts, discussion_reactions vào publication supabase_realtime (RLS quyết định ai nhận).
-- Quyền: GV của lớp (chủ nhiệm, GV bộ môn trong lớp) + quản trị: toàn quyền, duyệt/ẩn. HS: đọc bài đã hiện trong phòng nhỏ
-- của mình (+ bài của chính mình); "ẩn bài bạn khác" → chỉ thấy bài bạn khi đã đăng bài. Phụ huynh: chỉ đọc bài đã hiện của con.
-- Chạy lại nhiều lần được.
-- =============================================================================

create table if not exists v2.discussions (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references v2.classes (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  prompt text not null default '' check (length(prompt) <= 4000),
  moderation text not null default 'pre' check (moderation in ('pre', 'post')),
  hide_others boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  locked boolean not null default false,
  pinned boolean not null default false,
  archived boolean not null default false,
  rooms jsonb not null default '[{"id":"chung","name":"Cả lớp","members":[]}]'::jsonb check (jsonb_typeof(rooms) = 'array' and jsonb_array_length(rooms) between 1 and 20),
  tabs jsonb not null default '[{"id":"y-kien","name":"Ý kiến","color":"#2f6fd1"}]'::jsonb check (jsonb_typeof(tabs) = 'array' and jsonb_array_length(tabs) between 1 and 12),
  created_by uuid default auth.uid() references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discussions_class_idx on v2.discussions (class_id, archived, pinned desc, created_at desc);

create table if not exists v2.discussion_posts (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references v2.discussions (id) on delete cascade,
  room_id text not null default 'chung' check (length(room_id) between 1 and 40),
  tab_id text not null default '' check (length(tab_id) <= 40),
  parent_id uuid references v2.discussion_posts (id) on delete cascade,
  author_id uuid not null references v2.profiles (id) on delete cascade,
  body text not null default '' check (length(body) <= 1000),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 3),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  status text not null default 'pending' check (status in ('pending', 'visible', 'hidden', 'removed')),
  flagged boolean not null default false,
  moderated_by uuid references v2.profiles (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discussion_posts_disc_idx on v2.discussion_posts (discussion_id, room_id, created_at);
create index if not exists discussion_posts_author_idx on v2.discussion_posts (author_id, created_at desc);
create index if not exists discussion_posts_pending_idx on v2.discussion_posts (discussion_id) where status = 'pending';

create table if not exists v2.discussion_reactions (
  post_id uuid not null references v2.discussion_posts (id) on delete cascade,
  user_id uuid not null references v2.profiles (id) on delete cascade,
  kind text not null check (kind in ('heart', 'star', 'like')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

create table if not exists v2.discussion_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references v2.discussion_posts (id) on delete cascade,
  user_id uuid not null references v2.profiles (id) on delete cascade,
  reason text not null default '' check (length(reason) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (post_id, user_id)
);

-- Từ cần chặn: class_id null = cả trường (quản trị), có class_id = GV của lớp thêm.
create table if not exists v2.discussion_words (
  id uuid primary key default gen_random_uuid(),
  class_id text references v2.classes (id) on delete cascade,
  word text not null check (length(btrim(word)) between 1 and 40),
  created_by uuid default auth.uid() references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists discussion_words_uq on v2.discussion_words (coalesce(class_id, ''), lower(word));

-- Danh sách mặc định (cả trường). Khớp theo NGUYÊN TỪ, giữ dấu: "ngu" không chặn "ngủ".
insert into v2.discussion_words (class_id, word, created_by)
select null, w, null from unnest(array['ngu', 'đồ ngu', 'óc chó', 'mày ngu', 'đần', 'thằng ngu', 'con ngu', 'chết đi', 'cút', 'đm', 'dm', 'vcl', 'vl', 'đéo', 'địt', 'lồn', 'cặc', 'đụ', 'xấu xí', 'đồ khùng']) w
on conflict do nothing;

drop trigger if exists discussions_updated_at on v2.discussions;
create trigger discussions_updated_at before update on v2.discussions for each row execute function v2.set_updated_at();

-- -----------------------------------------------------------------------------
-- Hàm hỗ trợ
-- -----------------------------------------------------------------------------
-- Phòng nhỏ có cho người gọi vào không (members rỗng = cả lớp).
create or replace function v2._discussion_room_ok(p_rooms jsonb, p_room text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb)) r
    where r ->> 'id' = p_room
      and (jsonb_array_length(coalesce(r -> 'members', '[]'::jsonb)) = 0 or (r -> 'members') ? auth.uid()::text)
  )
$$;

-- Bài có chứa từ cần chặn (nguyên từ, không phân biệt hoa thường, giữ dấu).
create or replace function v2.discussion_flagged(p_class text, p_text text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.discussion_words w
    where (w.class_id is null or w.class_id = p_class)
      and normalize(lower(coalesce(p_text, '')), NFC) ~ ('(^|[^[:alnum:]_])' || regexp_replace(normalize(lower(btrim(w.word)), NFC), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '($|[^[:alnum:]_])')
  )
$$;

-- Người gọi xem được phòng thảo luận này không (danh sách phòng).
create or replace function v2.can_see_discussion(p_class text, p_archived boolean) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.is_teacher_of_class(p_class)
      or (not p_archived and v2.can_see_class(p_class) and v2.current_role() in ('student', 'parent'))
$$;

-- Người gọi đọc được bài này không.
create or replace function v2.can_read_discussion_post(p_disc uuid, p_room text, p_author uuid, p_status text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.discussions d
    where d.id = p_disc and (
      v2.is_teacher_of_class(d.class_id)
      or p_author = auth.uid()
      or (p_status = 'visible' and not d.archived and v2.current_role() = 'student' and v2.is_member_of_class(d.class_id)
          and v2._discussion_room_ok(d.rooms, p_room)
          and (not d.hide_others or exists (
            select 1 from v2.discussion_posts m
            where m.discussion_id = d.id and m.author_id = auth.uid() and m.parent_id is null and m.status <> 'removed')))
      or (p_status = 'visible' and not d.archived and v2.is_guardian_of(p_author))
    )
  )
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table v2.discussions enable row level security;
alter table v2.discussion_posts enable row level security;
alter table v2.discussion_reactions enable row level security;
alter table v2.discussion_reports enable row level security;
alter table v2.discussion_words enable row level security;

drop policy if exists discussions_read on v2.discussions;
create policy discussions_read on v2.discussions for select to authenticated using ((select v2.can_see_discussion(class_id, archived)));
drop policy if exists discussions_insert on v2.discussions;
create policy discussions_insert on v2.discussions for insert to authenticated
  with check ((select v2.is_teacher_of_class(class_id)) and created_by = auth.uid());
drop policy if exists discussions_update on v2.discussions;
create policy discussions_update on v2.discussions for update to authenticated
  using ((select v2.is_teacher_of_class(class_id))) with check ((select v2.is_teacher_of_class(class_id)));
drop policy if exists discussions_delete on v2.discussions;
create policy discussions_delete on v2.discussions for delete to authenticated using ((select v2.is_teacher_of_class(class_id)));

-- Bài: chỉ ĐỌC trực tiếp; ghi qua RPC (security definer).
drop policy if exists discussion_posts_read on v2.discussion_posts;
create policy discussion_posts_read on v2.discussion_posts for select to authenticated
  using ((select v2.can_read_discussion_post(discussion_id, room_id, author_id, status)));

drop policy if exists discussion_reactions_read on v2.discussion_reactions;
create policy discussion_reactions_read on v2.discussion_reactions for select to authenticated
  using (exists (select 1 from v2.discussion_posts p where p.id = post_id and v2.can_read_discussion_post(p.discussion_id, p.room_id, p.author_id, p.status)));

drop policy if exists discussion_reports_read on v2.discussion_reports;
create policy discussion_reports_read on v2.discussion_reports for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from v2.discussion_posts p join v2.discussions d on d.id = p.discussion_id
    where p.id = post_id and v2.is_teacher_of_class(d.class_id)));

drop policy if exists discussion_words_read on v2.discussion_words;
create policy discussion_words_read on v2.discussion_words for select to authenticated
  using (v2.is_staff());
drop policy if exists discussion_words_insert on v2.discussion_words;
create policy discussion_words_insert on v2.discussion_words for insert to authenticated
  with check (created_by = auth.uid() and (case when class_id is null then v2.is_admin() else v2.is_teacher_of_class(class_id) end));
drop policy if exists discussion_words_delete on v2.discussion_words;
create policy discussion_words_delete on v2.discussion_words for delete to authenticated
  using (case when class_id is null then v2.is_admin() else v2.is_teacher_of_class(class_id) end);

revoke all on v2.discussions, v2.discussion_posts, v2.discussion_reactions, v2.discussion_reports, v2.discussion_words from public, anon, authenticated;
grant select, insert, update, delete on v2.discussions to authenticated;
grant select on v2.discussion_posts, v2.discussion_reactions, v2.discussion_reports to authenticated;
grant select, insert, delete on v2.discussion_words to authenticated;
grant all on v2.discussions, v2.discussion_posts, v2.discussion_reactions, v2.discussion_reports, v2.discussion_words to service_role;

-- -----------------------------------------------------------------------------
-- RPC
-- -----------------------------------------------------------------------------
-- Đăng bài / bình luận. Trả về bài vừa đăng (dạng hàng của bảng).
create or replace function v2.post_discussion(
  p_discussion uuid, p_room text, p_tab text, p_parent uuid, p_body text, p_images jsonb default '[]'::jsonb, p_color text default null
) returns v2.discussion_posts
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_d v2.discussions;
  v_staff boolean;
  v_parent v2.discussion_posts;
  v_body text := btrim(coalesce(p_body, ''));
  v_images jsonb := coalesce(p_images, '[]'::jsonb);
  v_status text;
  v_flag boolean;
  v_row v2.discussion_posts;
  v_img jsonb;
begin
  select * into v_d from v2.discussions where id = p_discussion;
  if not found then raise exception 'Không tìm thấy phòng thảo luận.' using errcode = 'P0002'; end if;
  v_staff := v2.is_teacher_of_class(v_d.class_id);
  if not v_staff then
    if v_role <> 'student' or not v2.is_member_of_class(v_d.class_id) then
      raise exception 'Em chưa ở trong lớp này nên chưa đăng bài được.' using errcode = '42501';
    end if;
    if v_d.archived or v_d.locked then raise exception 'Phòng thảo luận đang khóa.' using errcode = '42501'; end if;
    if v_d.opens_at is not null and now() < v_d.opens_at then raise exception 'Phòng thảo luận chưa mở.' using errcode = '42501'; end if;
    if v_d.closes_at is not null and now() > v_d.closes_at then raise exception 'Phòng thảo luận đã đóng.' using errcode = '42501'; end if;
    if not v2._discussion_room_ok(v_d.rooms, p_room) then raise exception 'Em không ở trong phòng nhỏ này.' using errcode = '42501'; end if;
    if (select count(*) from v2.discussion_posts where author_id = v_uid and created_at > now() - interval '1 minute') >= 10 then
      raise exception 'Em đăng nhanh quá, chờ một chút rồi đăng tiếp nhé.' using errcode = '54000';
    end if;
  elsif not exists (select 1 from jsonb_array_elements(v_d.rooms) r where r ->> 'id' = p_room) then
    raise exception 'Không có phòng nhỏ này.' using errcode = '22023';
  end if;
  if p_parent is null and not exists (select 1 from jsonb_array_elements(v_d.tabs) t where t ->> 'id' = coalesce(p_tab, '')) then
    raise exception 'Không có tab này.' using errcode = '22023';
  end if;
  if p_parent is not null then
    select * into v_parent from v2.discussion_posts where id = p_parent;
    if not found or v_parent.discussion_id <> p_discussion or v_parent.parent_id is not null
       or not v2.can_read_discussion_post(v_parent.discussion_id, v_parent.room_id, v_parent.author_id, v_parent.status) then
      raise exception 'Không tìm thấy bài để bình luận.' using errcode = 'P0002';
    end if;
  end if;
  if jsonb_typeof(v_images) <> 'array' or jsonb_array_length(v_images) > 3 then
    raise exception 'Tối đa 3 ảnh mỗi bài.' using errcode = '22023';
  end if;
  for v_img in select * from jsonb_array_elements(v_images) loop
    if jsonb_typeof(v_img) <> 'string' or (v_img #>> '{}') not like p_discussion::text || '/' || v_uid::text || '/%' then
      raise exception 'Ảnh không hợp lệ.' using errcode = '22023';
    end if;
  end loop;
  if v_body = '' and jsonb_array_length(v_images) = 0 then raise exception 'Em viết vài chữ hoặc gửi ảnh nhé.' using errcode = '22023'; end if;
  if length(v_body) > 1000 then raise exception 'Bài dài quá (tối đa 1000 chữ cái).' using errcode = '22023'; end if;

  v_flag := v2.discussion_flagged(v_d.class_id, v_body);
  v_status := case when v_staff then 'visible' when v_flag or v_d.moderation = 'pre' then 'pending' else 'visible' end;
  insert into v2.discussion_posts (discussion_id, room_id, tab_id, parent_id, author_id, body, images, color, status, flagged)
  values (p_discussion, p_room, case when p_parent is null then coalesce(p_tab, '') else coalesce(v_parent.tab_id, '') end,
          p_parent, v_uid, v_body, v_images, case when p_color ~ '^#[0-9a-fA-F]{6}$' then p_color end, v_status, v_flag and not v_staff)
  returning * into v_row;
  return v_row;
end $$;

-- Sửa bài của mình (chữ). Bài đã hiện của HS ở phòng "duyệt trước" sẽ chờ duyệt lại.
create or replace function v2.edit_discussion_post(p_post uuid, p_body text) returns v2.discussion_posts
language plpgsql security definer set search_path = v2, public as $$
declare
  v_p v2.discussion_posts;
  v_d v2.discussions;
  v_body text := btrim(coalesce(p_body, ''));
  v_staff boolean;
begin
  perform v2._require_user();
  select * into v_p from v2.discussion_posts where id = p_post for update;
  if not found or v_p.author_id <> auth.uid() or v_p.status in ('hidden', 'removed') then
    raise exception 'Không sửa được bài này.' using errcode = '42501';
  end if;
  select * into v_d from v2.discussions where id = v_p.discussion_id;
  v_staff := v2.is_teacher_of_class(v_d.class_id);
  if not v_staff and (v_d.locked or v_d.archived) then raise exception 'Phòng thảo luận đang khóa.' using errcode = '42501'; end if;
  if v_body = '' and jsonb_array_length(v_p.images) = 0 then raise exception 'Bài không được để trống.' using errcode = '22023'; end if;
  if length(v_body) > 1000 then raise exception 'Bài dài quá (tối đa 1000 chữ cái).' using errcode = '22023'; end if;
  update v2.discussion_posts set body = v_body, updated_at = now(),
    flagged = not v_staff and v2.discussion_flagged(v_d.class_id, v_body),
    status = case when v_staff then status
                  when v2.discussion_flagged(v_d.class_id, v_body) or v_d.moderation = 'pre' then 'pending' else status end
  where id = p_post returning * into v_p;
  return v_p;
end $$;

-- HS gỡ bài của mình (không xóa thật: status 'removed').
create or replace function v2.remove_my_discussion_post(p_post uuid) returns void
language plpgsql security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  update v2.discussion_posts set status = 'removed', updated_at = now(), moderated_by = auth.uid(), moderated_at = now()
  where id = p_post and author_id = auth.uid() and status <> 'removed';
  if not found then raise exception 'Không gỡ được bài này.' using errcode = '42501'; end if;
end $$;

-- GV duyệt / ẩn / đưa về chờ duyệt (nhiều bài một lần). Trả về số bài đã đổi.
create or replace function v2.moderate_discussion_posts(p_ids uuid[], p_status text) returns int
language plpgsql security definer set search_path = v2, public as $$
declare v_n int;
begin
  perform v2._require_user();
  if p_status not in ('visible', 'hidden', 'pending') then raise exception 'Trạng thái không hợp lệ.' using errcode = '22023'; end if;
  update v2.discussion_posts p set status = p_status, moderated_by = auth.uid(), moderated_at = now(), updated_at = now()
  from v2.discussions d
  where p.id = any (coalesce(p_ids, '{}')) and d.id = p.discussion_id and v2.is_teacher_of_class(d.class_id) and p.status <> 'removed';
  get diagnostics v_n = row_count;
  if v_n = 0 and cardinality(coalesce(p_ids, '{}')) > 0 then raise exception 'Thầy/cô chưa có quyền với các bài này.' using errcode = '42501'; end if;
  update v2.discussion_reports r set resolved_at = now() where r.post_id = any (p_ids) and r.resolved_at is null and p_status in ('visible', 'hidden');
  return v_n;
end $$;

-- Thả / bỏ ❤️ ⭐ 👍. Trả về true nếu vừa thả.
create or replace function v2.toggle_discussion_reaction(p_post uuid, p_kind text) returns boolean
language plpgsql security definer set search_path = v2, public as $$
declare v_p v2.discussion_posts; v_role text := v2._require_user();
begin
  if p_kind not in ('heart', 'star', 'like') then raise exception 'Biểu tượng không hợp lệ.' using errcode = '22023'; end if;
  if v_role = 'parent' then raise exception 'Phụ huynh chỉ xem bài.' using errcode = '42501'; end if;
  select * into v_p from v2.discussion_posts where id = p_post;
  if not found or v_p.status <> 'visible' or not v2.can_read_discussion_post(v_p.discussion_id, v_p.room_id, v_p.author_id, v_p.status) then
    raise exception 'Không tìm thấy bài.' using errcode = 'P0002';
  end if;
  delete from v2.discussion_reactions where post_id = p_post and user_id = auth.uid() and kind = p_kind;
  if found then return false; end if;
  insert into v2.discussion_reactions (post_id, user_id, kind) values (p_post, auth.uid(), p_kind);
  return true;
end $$;

-- HS báo bài chưa hay (mỗi người một lần mỗi bài).
create or replace function v2.report_discussion_post(p_post uuid, p_reason text) returns void
language plpgsql security definer set search_path = v2, public as $$
declare v_p v2.discussion_posts;
begin
  perform v2._require_user();
  select * into v_p from v2.discussion_posts where id = p_post;
  if not found or not v2.can_read_discussion_post(v_p.discussion_id, v_p.room_id, v_p.author_id, v_p.status) then
    raise exception 'Không tìm thấy bài.' using errcode = 'P0002';
  end if;
  insert into v2.discussion_reports (post_id, user_id, reason) values (p_post, auth.uid(), left(btrim(coalesce(p_reason, '')), 300))
  on conflict (post_id, user_id) do update set reason = excluded.reason, resolved_at = null, created_at = now();
end $$;

revoke all on function
  v2._discussion_room_ok(jsonb, text), v2.discussion_flagged(text, text), v2.can_see_discussion(text, boolean),
  v2.can_read_discussion_post(uuid, text, uuid, text),
  v2.post_discussion(uuid, text, text, uuid, text, jsonb, text), v2.edit_discussion_post(uuid, text), v2.remove_my_discussion_post(uuid),
  v2.moderate_discussion_posts(uuid[], text), v2.toggle_discussion_reaction(uuid, text), v2.report_discussion_post(uuid, text)
  from public, anon;
grant execute on function
  v2._discussion_room_ok(jsonb, text), v2.discussion_flagged(text, text), v2.can_see_discussion(text, boolean),
  v2.can_read_discussion_post(uuid, text, uuid, text),
  v2.post_discussion(uuid, text, text, uuid, text, jsonb, text), v2.edit_discussion_post(uuid, text), v2.remove_my_discussion_post(uuid),
  v2.moderate_discussion_posts(uuid[], text), v2.toggle_discussion_reaction(uuid, text), v2.report_discussion_post(uuid, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Ảnh: bucket riêng tư `discussion`, <discussion_id>/<user_id>/<file> (≤ 5 MB, chỉ ảnh)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('discussion', 'discussion', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists discussion_obj_insert on storage.objects;
create policy discussion_obj_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'discussion' and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (select 1 from v2.discussions d where d.id::text = (storage.foldername(name))[1]
              and (v2.is_teacher_of_class(d.class_id) or (v2.is_member_of_class(d.class_id) and not d.locked and not d.archived)))
);
drop policy if exists discussion_obj_read on storage.objects;
create policy discussion_obj_read on storage.objects for select to authenticated using (
  bucket_id = 'discussion'
  and exists (select 1 from v2.discussions d where d.id::text = (storage.foldername(name))[1] and v2.can_see_discussion(d.class_id, d.archived))
);
drop policy if exists discussion_obj_delete on storage.objects;
create policy discussion_obj_delete on storage.objects for delete to authenticated using (
  bucket_id = 'discussion'
  and exists (select 1 from v2.discussions d where d.id::text = (storage.foldername(name))[1] and v2.is_teacher_of_class(d.class_id))
);

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['discussion_posts', 'discussion_reactions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'v2' and tablename = t) then
      execute format('alter publication supabase_realtime add table v2.%I', t);
    end if;
  end loop;
end $$;
