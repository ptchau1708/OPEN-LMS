-- =============================================================================
-- OPEN-EDU v2 — mã bên ngoài của học sinh (cầu nối VnEdu / Google Classroom)
--  1. v2.profiles.external_code: mã học sinh ở phần mềm quản lí trường (VnEdu, mã định danh). Không bắt buộc duy nhất
--     (hai nguồn có thể trùng mã); có chỉ mục để tìm. HS không tự sửa được mã của mình.
--  2. v2.student_external_ids: tài khoản bên ngoài khác (hiện có 'google': id + email từ Google Classroom).
--     Chỉ GV của lớp / quản trị / chính HS đọc được; ghi qua RPC.
--  3. v2.set_student_external_ids(p_class, p_rows): GV chủ nhiệm / dạy cùng / quản trị ghi mã hàng loạt cho HS của lớp.
-- Chạy lại nhiều lần được. Xem docs/CAU_NOI_VNEDU_CLASSROOM.md.
-- =============================================================================
alter table v2.profiles add column if not exists external_code text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_external_code_len' and conrelid = 'v2.profiles'::regclass) then
    alter table v2.profiles add constraint profiles_external_code_len check (external_code is null or length(external_code) between 1 and 64);
  end if;
end $$;
create index if not exists profiles_external_code_idx on v2.profiles (external_code) where external_code is not null;

-- HS (và mọi người không phải GV của em / quản trị) không đổi được external_code khi cập nhật hồ sơ qua API.
-- KHÔNG security definer: cần current_user thật của người gọi (giống v2.protect_profile_columns).
create or replace function v2.protect_profile_external_code() returns trigger
language plpgsql set search_path = v2, public as $$
begin
  if current_user in ('authenticated', 'anon') and new.external_code is distinct from old.external_code
     and not v2.is_teacher_of_student(old.id) then
    new.external_code := old.external_code;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_external_code on v2.profiles;
create trigger profiles_protect_external_code before update on v2.profiles
  for each row execute function v2.protect_profile_external_code();

create table if not exists v2.student_external_ids (
  user_id uuid not null references v2.profiles (id) on delete cascade,
  provider text not null check (provider in ('google')),
  external_id text not null check (length(external_id) between 1 and 128),
  email text check (email is null or length(email) <= 254),
  updated_by uuid default auth.uid() references v2.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
create index if not exists student_external_ids_lookup_idx on v2.student_external_ids (provider, external_id);

alter table v2.student_external_ids enable row level security;
drop policy if exists student_external_ids_read on v2.student_external_ids;
create policy student_external_ids_read on v2.student_external_ids for select to authenticated
  using (user_id = (select auth.uid()) or v2.is_teacher_of_student(user_id));
-- Không có policy ghi: chỉ ghi qua v2.set_student_external_ids (security definer) hoặc service role.
revoke all on v2.student_external_ids from anon, authenticated;
grant select on v2.student_external_ids to authenticated;
grant all on v2.student_external_ids to service_role;

-- p_rows: [{ "studentId": uuid, "externalCode"?: text ('' = xóa), "googleId"?: text ('' = xóa), "googleEmail"?: text }]
-- Khóa vắng mặt = không đổi. HS không thuộc lớp p_class bị bỏ qua. Trả về số HS đã cập nhật.
create or replace function v2.set_student_external_ids(p_class text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = v2, public as $$
declare
  r jsonb;
  v_id uuid;
  v_code text;
  v_gid text;
  v_n integer := 0;
begin
  if auth.uid() is null or not v2.is_teacher_of_class(p_class) then
    raise exception 'Thầy/cô chỉ sửa mã cho học sinh lớp mình.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Danh sách mã không hợp lệ.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Mỗi lần cập nhật tối đa 500 học sinh.' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_id := v2.try_uuid(r ->> 'studentId');
    if v_id is null or not exists (select 1 from v2._class_students(p_class) s where s = v_id) then
      continue;
    end if;
    if r ? 'externalCode' then
      v_code := nullif(left(btrim(coalesce(r ->> 'externalCode', '')), 64), '');
      update v2.profiles set external_code = v_code where id = v_id and external_code is distinct from v_code;
    end if;
    if r ? 'googleId' then
      v_gid := nullif(left(btrim(coalesce(r ->> 'googleId', '')), 128), '');
      if v_gid is null then
        delete from v2.student_external_ids where user_id = v_id and provider = 'google';
      else
        insert into v2.student_external_ids (user_id, provider, external_id, email, updated_by, updated_at)
        values (v_id, 'google', v_gid, nullif(left(btrim(coalesce(r ->> 'googleEmail', '')), 254), ''), auth.uid(), now())
        on conflict (user_id, provider) do update
          set external_id = excluded.external_id, email = excluded.email, updated_by = excluded.updated_by, updated_at = now();
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function v2.set_student_external_ids(text, jsonb), v2.protect_profile_external_code() from public, anon;
grant execute on function v2.set_student_external_ids(text, jsonb) to authenticated, service_role;
grant execute on function v2.protect_profile_external_code() to authenticated, service_role;
