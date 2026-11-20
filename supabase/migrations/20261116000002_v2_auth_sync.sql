-- =============================================================================
-- OPEN-EDU v2 — đồng bộ vai trò khi GoTrue gắn app_metadata SAU khi tạo người dùng
--
-- Lỗi gặp khi chạy trên Supabase thật: Admin API `createUser({ app_metadata })` chèn dòng auth.users trước
-- (app_metadata mới chỉ có provider) rồi mới cập nhật app_metadata. Trigger AFTER INSERT thấy chưa có role
-- → hồ sơ thành 'student'. Kiểm thử cũ chèn thẳng SQL nên không bắt được.
-- Vá: khi raw_app_meta_data đổi, nạp lại role / username / grade / class_id vào hồ sơ.
-- app_metadata chỉ ghi được bằng service role (Edge Function), nên đây vẫn là nguồn tin cậy; user_metadata KHÔNG được dùng.
-- Chạy lại nhiều lần được.
-- =============================================================================
create or replace function v2.sync_auth_app_meta() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare
  v_role text := lower(coalesce(new.raw_app_meta_data ->> 'role', ''));
  v_username text := nullif(lower(coalesce(new.raw_app_meta_data ->> 'username', '')), '');
  v_grade smallint := v2.try_int(new.raw_app_meta_data ->> 'grade')::smallint;
  v_class text := nullif(new.raw_app_meta_data ->> 'class_id', '');
begin
  if v_role not in ('student', 'teacher', 'admin', 'parent') then return new; end if;
  if v_username is not null and exists (select 1 from v2.profiles where username = v_username and id <> new.id) then v_username := null; end if;
  update v2.profiles p
     set role = v_role,
         username = coalesce(v_username, p.username),
         grade = coalesce(p.grade, v_grade),
         class_id = coalesce(p.class_id, v_class)
   where p.id = new.id
     and (p.role is distinct from v_role
          or (v_username is not null and p.username is distinct from v_username)
          or (p.grade is null and v_grade is not null)
          or (p.class_id is null and v_class is not null));
  return new;
exception when others then
  raise warning 'v2.sync_auth_app_meta: %', sqlerrm;
  return new;
end $$;
revoke execute on function v2.sync_auth_app_meta() from public, anon, authenticated;

drop trigger if exists openedu_v2_on_auth_app_meta on auth.users;
create trigger openedu_v2_on_auth_app_meta after update of raw_app_meta_data on auth.users
  for each row when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
  execute function v2.sync_auth_app_meta();

-- Sửa các tài khoản đã tạo trước bản vá (vai trò nằm ở app_metadata nhưng hồ sơ là 'student').
update v2.profiles p
   set role = lower(u.raw_app_meta_data ->> 'role')
  from auth.users u
 where u.id = p.id
   and lower(coalesce(u.raw_app_meta_data ->> 'role', '')) in ('teacher', 'admin', 'parent')
   and p.role = 'student';
