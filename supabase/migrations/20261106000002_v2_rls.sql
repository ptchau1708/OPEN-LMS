-- =============================================================================
-- OPEN-EDU · Migration 2/6 · Hàm hỗ trợ quyền + RLS cho mọi bảng + quyền GRANT
--
-- Nguyên tắc:
--   • HS đọc nội dung đã xuất bản của khối lớp mình / bài được giao / lớp trực tiếp đang tham gia, và dữ liệu của chính mình.
--   • GV quản lý lớp mình, bài giảng và câu hỏi của mình; đọc được ngân hàng câu hỏi chung và đáp án (item_keys).
--   • Admin toàn quyền. Phụ huynh đọc dữ liệu của con (guardian_links).
--   • learning_events / reward_ledger / live_responses / passports / streaks: KHÔNG ghi trực tiếp được —
--     chỉ qua hàm security definer (RPC) hoặc service role (Edge Function).
-- Mọi hàm hỗ trợ là security definer (tránh đệ quy RLS) và chỉ xét auth.uid() của người gọi.
-- Trong policy, hàm không tham số được bọc (select …) để Postgres tính một lần cho cả câu truy vấn.
-- =============================================================================

alter default privileges in schema v2 revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Hàm hỗ trợ
-- -----------------------------------------------------------------------------
-- Lưu ý: current_role là từ khóa SQL — luôn gọi kèm schema: v2.current_role().
create or replace function v2.current_role() returns text
language sql stable security definer set search_path = v2, public as $$
  select p.role from v2.profiles p where p.id = auth.uid()
$$;

create or replace function v2.is_admin() returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

-- GV hoặc admin.
create or replace function v2.is_staff() returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.profiles p where p.id = auth.uid() and p.role in ('teacher', 'admin'))
$$;

create or replace function v2.my_grade() returns smallint
language sql stable security definer set search_path = v2, public as $$
  select p.grade from v2.profiles p where p.id = auth.uid()
$$;

-- Khối lớp liên quan tới người gọi: HS → khối của mình; phụ huynh → khối của các con. Rỗng = chưa rõ (không lọc).
create or replace function v2.my_grades() returns smallint[]
language sql stable security definer set search_path = v2, public as $$
  select coalesce(array_agg(distinct s.g) filter (where s.g is not null), '{}'::smallint[])
  from (
    select p.grade as g from v2.profiles p where p.id = auth.uid()
    union all
    select c.grade from v2.guardian_links gl join v2.profiles c on c.id = gl.student_id where gl.parent_id = auth.uid()
  ) s
$$;

-- Các lớp của một người (thành viên hoặc lớp chính trong hồ sơ).
create or replace function v2.class_ids_of(p_user uuid) returns setof text
language sql stable security definer set search_path = v2, public as $$
  select m.class_id from v2.class_members m where m.user_id = p_user
  union
  select p.class_id from v2.profiles p where p.id = p_user and p.class_id is not null
$$;

create or replace function v2.my_class_ids() returns setof text
language sql stable security definer set search_path = v2, public as $$
  select v2.class_ids_of(auth.uid())
$$;

create or replace function v2.is_member_of_class(p_class text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select p_class is not null and exists (select 1 from v2.class_ids_of(auth.uid()) c where c = p_class)
$$;

-- GV chủ nhiệm (classes.teacher_id), GV dạy cùng (class_members.role='teacher') hoặc admin.
create or replace function v2.is_teacher_of_class(p_class text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.is_admin() or (
    p_class is not null and v2.is_staff() and (
      exists (select 1 from v2.classes c where c.id = p_class and c.teacher_id = auth.uid())
      or exists (select 1 from v2.class_members m where m.class_id = p_class and m.user_id = auth.uid() and m.role = 'teacher')
    )
  )
$$;

create or replace function v2.is_teacher_of_student(p_student uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.is_admin() or (
    v2.is_staff() and exists (
      select 1
      from (
        select m.class_id from v2.class_members m where m.user_id = p_student and m.role = 'student'
        union
        select p.class_id from v2.profiles p where p.id = p_student and p.class_id is not null
      ) s
      where exists (select 1 from v2.classes c where c.id = s.class_id and c.teacher_id = auth.uid())
         or exists (select 1 from v2.class_members t where t.class_id = s.class_id and t.user_id = auth.uid() and t.role = 'teacher')
    )
  )
$$;

create or replace function v2.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.guardian_links g where g.parent_id = auth.uid() and g.student_id = p_student)
$$;

create or replace function v2.shares_class_with(p_user uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.class_ids_of(p_user) a join v2.class_ids_of(auth.uid()) b on a = b
  )
$$;

-- Ai được xem dữ liệu học tập của p_user: chính mình, GV của em, phụ huynh, admin.
create or replace function v2.can_view_user(p_user uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select p_user = auth.uid() or v2.is_teacher_of_student(p_user) or v2.is_guardian_of(p_user)
$$;

create or replace function v2.can_see_profile(p_id uuid, p_role text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select p_id = auth.uid()
      or p_role in ('teacher', 'admin')     -- tên thầy cô hiển thị cho mọi người
      or v2.is_staff()                      -- thầy cô thấy danh sách học sinh toàn trường
      or v2.is_guardian_of(p_id)
      or v2.shares_class_with(p_id)         -- bạn cùng lớp (tên, linh vật)
$$;

create or replace function v2.can_see_class(p_class text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.is_staff()
      or v2.is_member_of_class(p_class)
      or exists (
        select 1 from v2.guardian_links g
        where g.parent_id = auth.uid() and exists (select 1 from v2.class_ids_of(g.student_id) c where c = p_class)
      )
$$;

create or replace function v2.grade_visible(p_grade smallint) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select cardinality(v2.my_grades()) = 0 or p_grade = any (v2.my_grades())
$$;

-- Quyền đọc một bài giảng (đường đầy đủ, dùng cho RPC và nhánh chậm của RLS).
create or replace function v2.lesson_visible(p_id text, p_owner uuid, p_status text, p_grade smallint) returns boolean
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2.current_role();
begin
  if v_uid is null or v_role is null then return false; end if;
  if v_role = 'admin' or p_owner = v_uid then return true; end if;
  if p_status = 'published' then
    if v_role in ('teacher', 'parent') then return true; end if;
    if v2.grade_visible(p_grade) then return true; end if;
    -- Bài được giao cho lớp/em (cả khi khác khối).
    if exists (
      select 1 from v2.assignments a
      where a.target_type = 'lesson' and a.target_id = p_id
        and a.class_id in (select v2.class_ids_of(v_uid))
        and (cardinality(a.student_ids) = 0 or v_uid::text = any (a.student_ids))
    ) then return true; end if;
  end if;
  -- Lớp học trực tiếp đang mở với bài này (kể cả bài nháp): GV của lớp, HS cùng lớp hoặc HS đã vào bằng PIN.
  return exists (
    select 1 from v2.live_sessions s
    where s.lesson_id = p_id and s.ended_at is null and s.created_at > now() - interval '12 hours'
      and (
        s.teacher_id = v_uid
        or v2.is_teacher_of_class(s.class_id)
        or v2.is_member_of_class(s.class_id)
        or exists (select 1 from v2.learning_events e where e.user_id = v_uid and e.live_session_id = s.id and e.verb = 'joined')
      )
  );
end $$;

create or replace function v2.can_read_lesson(p_id text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select coalesce((select v2.lesson_visible(l.id, l.owner_id, l.status, l.grade) from v2.lessons l where l.id = p_id), false)
$$;

-- HS/phụ huynh đọc item: cùng khối, hoặc item nằm trong một bài em đọc được.
create or replace function v2.student_can_read_item(p_id text, p_grade smallint) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.grade_visible(p_grade) or exists (
    select 1 from v2.lesson_items li join v2.lessons l on l.id = li.lesson_id
    where li.item_id = p_id and v2.lesson_visible(l.id, l.owner_id, l.status, l.grade)
  )
$$;

create or replace function v2.can_see_assignment(p_class text, p_students text[], p_created_by uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select p_created_by = auth.uid()
      or v2.is_teacher_of_class(p_class)
      or (v2.is_member_of_class(p_class) and (cardinality(p_students) = 0 or auth.uid()::text = any (p_students)))
      or exists (
        select 1 from v2.guardian_links g
        where g.parent_id = auth.uid()
          and (cardinality(p_students) = 0 or g.student_id::text = any (p_students))
          and exists (select 1 from v2.class_ids_of(g.student_id) c where c = p_class)
      )
$$;

create or replace function v2.live_visible(p_id uuid, p_class text, p_teacher uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select p_teacher = auth.uid()
      or v2.is_admin()
      or v2.is_teacher_of_class(p_class)
      or v2.is_member_of_class(p_class)
      or exists (select 1 from v2.learning_events e where e.user_id = auth.uid() and e.live_session_id = p_id and e.verb = 'joined')
$$;

-- GV chủ phiên (hoặc GV của lớp, admin) — xem câu trả lời trực tiếp.
create or replace function v2.is_live_host(p_session uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.live_sessions s
    where s.id = p_session and (s.teacher_id = auth.uid() or v2.is_teacher_of_class(s.class_id) or v2.is_admin())
  )
$$;

create or replace function v2.owns_course(p_course text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.is_admin() or exists (select 1 from v2.courses c where c.id = p_course and c.owner_id = auth.uid())
$$;

create or replace function v2.course_visible(p_course text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.courses c
    where c.id = p_course and (c.status = 'published' or c.owner_id = auth.uid() or v2.is_admin())
  )
$$;

create or replace function v2.owns_item(p_item text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.is_admin() or exists (select 1 from v2.items i where i.id = p_item and i.owner_id = auth.uid() and v2.is_staff())
$$;

-- -----------------------------------------------------------------------------
-- Trigger bảo vệ cột (chỉ áp dụng khi ghi trực tiếp qua API với vai trò authenticated/anon;
-- hàm security definer và service role không bị ảnh hưởng).
-- -----------------------------------------------------------------------------
-- KHÔNG security definer: cần current_user thật của người gọi.
create or replace function v2.protect_profile_columns() returns trigger
language plpgsql set search_path = v2, public as $$
begin
  if current_user in ('authenticated', 'anon') and not v2.is_admin() then
    new.id := old.id;
    new.role := old.role;
    new.legacy := old.legacy;
    new.created_at := old.created_at;
    if not v2.is_teacher_of_student(old.id) then
      new.grade := old.grade;
      new.class_id := old.class_id;
      new.username := old.username;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect on v2.profiles;
create trigger profiles_protect before update on v2.profiles
  for each row execute function v2.protect_profile_columns();

-- answers / stars_earned / completed_at do server quyết định (grade, complete_lesson).
-- Client vẫn upsert được slide_index, completed_slides; các cột còn lại bị giữ nguyên (không báo lỗi).
create or replace function v2.protect_progress_columns() returns trigger
language plpgsql set search_path = v2, public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.answers := '{}'::jsonb;
      new.stars_earned := 0;
      new.completed_at := null;
    else
      new.user_id := old.user_id;
      new.lesson_id := old.lesson_id;
      new.answers := old.answers;
      new.stars_earned := old.stars_earned;
      new.completed_at := old.completed_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lesson_progress_protect on v2.lesson_progress;
create trigger lesson_progress_protect before insert or update on v2.lesson_progress
  for each row execute function v2.protect_progress_columns();

-- -----------------------------------------------------------------------------
-- Bật RLS + xóa policy cũ (để chạy lại được)
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'v2' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'v2' and c.relkind = 'r' loop
    execute format('alter table v2.%I enable row level security', r.relname);
  end loop;
end $$;

-- mascots: danh mục công khai
create policy mascots_read on v2.mascots for select to authenticated using (true);

-- profiles
create policy profiles_read on v2.profiles for select to authenticated
  using (v2.can_see_profile(id, role));
create policy profiles_update on v2.profiles for update to authenticated
  using (id = (select auth.uid()) or (select v2.is_admin()) or v2.is_teacher_of_student(id))
  with check (id = (select auth.uid()) or (select v2.is_admin()) or v2.is_teacher_of_student(id));
create policy profiles_insert on v2.profiles for insert to authenticated
  with check ((select v2.is_admin()));
create policy profiles_delete on v2.profiles for delete to authenticated
  using ((select v2.is_admin()));

-- classes
create policy classes_read on v2.classes for select to authenticated
  using (v2.can_see_class(id));
create policy classes_insert on v2.classes for insert to authenticated
  with check ((select v2.is_staff()) and (teacher_id = (select auth.uid()) or (select v2.is_admin())));
create policy classes_update on v2.classes for update to authenticated
  using (v2.is_teacher_of_class(id))
  with check (teacher_id = (select auth.uid()) or (select v2.is_admin()) or v2.is_teacher_of_class(id));
create policy classes_delete on v2.classes for delete to authenticated
  using (teacher_id = (select auth.uid()) or (select v2.is_admin()));

-- class_teams
create policy class_teams_read on v2.class_teams for select to authenticated
  using (v2.can_see_class(class_id));
create policy class_teams_write on v2.class_teams for all to authenticated
  using (v2.is_teacher_of_class(class_id))
  with check (v2.is_teacher_of_class(class_id));

-- class_members
create policy class_members_read on v2.class_members for select to authenticated
  using ((select v2.is_staff()) or user_id = (select auth.uid()) or v2.is_member_of_class(class_id) or v2.is_guardian_of(user_id));
create policy class_members_write on v2.class_members for all to authenticated
  using (v2.is_teacher_of_class(class_id))
  with check (v2.is_teacher_of_class(class_id));

-- guardian_links
create policy guardian_links_read on v2.guardian_links for select to authenticated
  using (parent_id = (select auth.uid()) or student_id = (select auth.uid()) or v2.is_teacher_of_student(student_id));
create policy guardian_links_write on v2.guardian_links for all to authenticated
  using ((select v2.is_admin()) or v2.is_teacher_of_student(student_id))
  with check ((select v2.is_admin()) or v2.is_teacher_of_student(student_id));

-- items (không chứa đáp án)
create policy items_read on v2.items for select to authenticated
  using ((select v2.is_staff()) or (select cardinality(v2.my_grades())) = 0 or grade = any ((select v2.my_grades())::smallint[]));
create policy items_insert on v2.items for insert to authenticated
  with check ((select v2.is_staff()) and (owner_id = (select auth.uid()) or (select v2.is_admin())));
create policy items_update on v2.items for update to authenticated
  using ((select v2.is_staff()) and (owner_id = (select auth.uid()) or (select v2.is_admin())))
  with check (owner_id = (select auth.uid()) or (select v2.is_admin()));
create policy items_delete on v2.items for delete to authenticated
  using ((select v2.is_staff()) and (owner_id = (select auth.uid()) or (select v2.is_admin())));

-- item_keys: CHỈ GV/admin đọc; chủ item ghi
create policy item_keys_read on v2.item_keys for select to authenticated
  using ((select v2.is_staff()));
create policy item_keys_write on v2.item_keys for all to authenticated
  using (v2.owns_item(item_id))
  with check (v2.owns_item(item_id));

-- lessons: nhánh nhanh (chủ bài, admin, bài đã xuất bản cùng khối) rồi nhánh chậm (giao bài, lớp trực tiếp)
create policy lessons_read on v2.lessons for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select v2.is_admin())
    or (status = 'published' and (
          (select v2.current_role()) in ('teacher', 'parent')
          or (select cardinality(v2.my_grades())) = 0
          or grade = any ((select v2.my_grades())::smallint[])))
    or v2.lesson_visible(id, owner_id, status, grade)
  );
create policy lessons_insert on v2.lessons for insert to authenticated
  with check ((select v2.is_staff()) and (owner_id = (select auth.uid()) or (select v2.is_admin())));
create policy lessons_update on v2.lessons for update to authenticated
  using (owner_id = (select auth.uid()) or (select v2.is_admin()))
  with check (owner_id = (select auth.uid()) or (select v2.is_admin()));
create policy lessons_delete on v2.lessons for delete to authenticated
  using (owner_id = (select auth.uid()) or (select v2.is_admin()));

-- lesson_slides / lesson_items: chỉ đọc; ghi qua v2.save_lesson (tách đáp án của item nhúng)
create policy lesson_slides_read on v2.lesson_slides for select to authenticated
  using (v2.can_read_lesson(lesson_id));
create policy lesson_items_read on v2.lesson_items for select to authenticated
  using ((select v2.is_staff()) or v2.can_read_lesson(lesson_id));

-- courses / course_nodes
create policy courses_read on v2.courses for select to authenticated
  using (status = 'published' or owner_id = (select auth.uid()) or (select v2.is_admin()));
create policy courses_insert on v2.courses for insert to authenticated
  with check ((select v2.is_staff()) and (owner_id = (select auth.uid()) or (select v2.is_admin())));
create policy courses_update on v2.courses for update to authenticated
  using (owner_id = (select auth.uid()) or (select v2.is_admin()))
  with check (owner_id = (select auth.uid()) or (select v2.is_admin()));
create policy courses_delete on v2.courses for delete to authenticated
  using (owner_id = (select auth.uid()) or (select v2.is_admin()));
create policy course_nodes_read on v2.course_nodes for select to authenticated
  using (v2.course_visible(course_id));
create policy course_nodes_write on v2.course_nodes for all to authenticated
  using (v2.owns_course(course_id))
  with check (v2.owns_course(course_id));

-- packages: mọi người đăng nhập đọc được (cần base_url để mở gói)
create policy packages_read on v2.packages for select to authenticated using (true);
create policy packages_insert on v2.packages for insert to authenticated
  with check ((select v2.is_staff()) and (owner_id = (select auth.uid()) or (select v2.is_admin())));
create policy packages_update on v2.packages for update to authenticated
  using (owner_id = (select auth.uid()) or (select v2.is_admin()))
  with check (owner_id = (select auth.uid()) or (select v2.is_admin()));
create policy packages_delete on v2.packages for delete to authenticated
  using (owner_id = (select auth.uid()) or (select v2.is_admin()));

-- assignments
create policy assignments_read on v2.assignments for select to authenticated
  using (v2.can_see_assignment(class_id, student_ids, created_by));
create policy assignments_insert on v2.assignments for insert to authenticated
  with check (v2.is_teacher_of_class(class_id) and (created_by = (select auth.uid()) or (select v2.is_admin())));
create policy assignments_update on v2.assignments for update to authenticated
  using (created_by = (select auth.uid()) or v2.is_teacher_of_class(class_id))
  with check (v2.is_teacher_of_class(class_id));
create policy assignments_delete on v2.assignments for delete to authenticated
  using (created_by = (select auth.uid()) or v2.is_teacher_of_class(class_id));

-- lesson_progress: HS ghi của mình (cột điểm được trigger bảo vệ); GV/phụ huynh đọc
create policy lesson_progress_read on v2.lesson_progress for select to authenticated
  using (v2.can_view_user(user_id));
create policy lesson_progress_insert on v2.lesson_progress for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy lesson_progress_update on v2.lesson_progress for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Chỉ đọc (ghi qua RPC / Edge Function)
create policy learning_events_read on v2.learning_events for select to authenticated
  using (v2.can_view_user(user_id));
create policy reward_ledger_read on v2.reward_ledger for select to authenticated
  using (v2.can_view_user(user_id));
create policy streaks_read on v2.streaks for select to authenticated
  using (v2.can_view_user(user_id));
create policy passports_read on v2.passports for select to authenticated
  using (v2.can_view_user(user_id));
create policy arena_profiles_read on v2.arena_profiles for select to authenticated
  using (v2.can_view_user(user_id));

-- live_sessions: đọc (state để vào lại sau rớt mạng); tạo/sửa qua RPC; GV xóa phiên của mình
create policy live_sessions_read on v2.live_sessions for select to authenticated
  using (v2.live_visible(id, class_id, teacher_id));
create policy live_sessions_delete on v2.live_sessions for delete to authenticated
  using (teacher_id = (select auth.uid()) or (select v2.is_admin()));

-- live_responses: GV chủ phiên (Realtime postgres_changes cũng đi qua policy này) + HS xem của mình
create policy live_responses_read on v2.live_responses for select to authenticated
  using (user_id = (select auth.uid()) or v2.is_live_host(session_id));

-- -----------------------------------------------------------------------------
-- GRANT: bắt đầu từ con số 0 rồi cấp đúng phần cần.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema v2 from anon, authenticated;
grant select on all tables in schema v2 to authenticated;
grant insert, update, delete on
  v2.profiles, v2.classes, v2.class_teams, v2.class_members, v2.guardian_links,
  v2.items, v2.item_keys, v2.lessons, v2.courses, v2.course_nodes, v2.packages, v2.assignments
  to authenticated;
grant insert, update on v2.lesson_progress to authenticated;
grant delete on v2.live_sessions to authenticated;
-- (learning_events, reward_ledger, live_responses, passports, streaks, arena_profiles, lesson_slides,
--  lesson_items, mascots: authenticated chỉ có SELECT.)

grant all on all tables in schema v2 to service_role;
grant usage, select on all sequences in schema v2 to service_role;

-- Hàm hỗ trợ dùng trong policy phải gọi được bởi authenticated (kể cả Realtime khi kiểm tra quyền).
revoke execute on all functions in schema v2 from public, anon;
grant execute on function
  v2.current_role(), v2.is_admin(), v2.is_staff(), v2.my_grade(), v2.my_grades(),
  v2.my_class_ids(), v2.is_member_of_class(text), v2.is_teacher_of_class(text), v2.is_teacher_of_student(uuid),
  v2.is_guardian_of(uuid), v2.shares_class_with(uuid), v2.can_view_user(uuid), v2.can_see_profile(uuid, text),
  v2.can_see_class(text), v2.grade_visible(smallint), v2.lesson_visible(text, uuid, text, smallint),
  v2.can_read_lesson(text), v2.student_can_read_item(text, smallint), v2.can_see_assignment(text, text[], uuid),
  v2.live_visible(uuid, text, uuid), v2.is_live_host(uuid), v2.owns_course(text), v2.course_visible(text),
  v2.owns_item(text), v2.today_vn(), v2.jsonb_compact(jsonb), v2.try_int(text), v2.try_uuid(text)
  to authenticated, service_role;
