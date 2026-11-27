-- =============================================================================
-- OPEN-EDU · SQL 23 · Phụ huynh + Thông báo
--   1. Phụ huynh thấy gì: mỗi lớp chọn cho từng mục "Tự động" / "GV duyệt rồi mới gửi" / "Không gửi".
--      Chặn ở máy chủ: quyền đọc bảng (RLS) và các hàm hồ sơ (get_student_extras, get_student_profile, get_parent_summary)
--      đều xét cài đặt này khi người xem là phụ huynh. Mục "GV duyệt" chỉ hiện khi GV đã gửi (v2.parent_releases).
--   2. Gửi phụ huynh: thông báo cả lớp / từng em, hẹn giờ, cần xác nhận, thu hồi, nhắc lại.
--   3. Nhắn tin hai chiều GV ↔ phụ huynh theo từng em; GV đặt giờ nhận tin (ngoài giờ vẫn gửi được, thông báo đến khi vào giờ).
--   4. Thông báo cho HS, GV, PH (chuông trong app) do trigger sinh ra; giờ yên lặng; gộp tin cùng loại.
--   5. Thông báo đẩy (web push): hàng đợi trong v2.notifications; pg_net gọi Edge Function `push`, pg_cron chạy mỗi phút
--      (tin hẹn giờ, tin trong giờ yên lặng, nhắc hạn bài 19:00, bản tin tuần thứ Bảy 17:00, gửi lại khi lỗi).
-- Sau khi triển khai hàm `push`, chạy một lần: select v2.push_setup('https://<ref>.supabase.co/functions/v1/push');
-- Chạy lại nhiều lần được.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Tiện ích
-- ---------------------------------------------------------------------------
create or replace function v2._class_of_student(p_student uuid) returns text
language sql stable security definer set search_path = v2, public as $$
  select coalesce(
    (select p.class_id from v2.profiles p where p.id = p_student and p.class_id is not null),
    (select m.class_id from v2.class_members m where m.user_id = p_student and m.role = 'student' order by m.joined_at limit 1))
$$;

create or replace function v2._ph_students(p_class text) returns uuid[]
language sql stable security definer set search_path = v2, public as $$
  select coalesce(array_agg(distinct s), '{}') from v2._class_student_ids(p_class) s
$$;

create or replace function v2._ph_teachers(p_class text) returns uuid[]
language sql stable security definer set search_path = v2, public as $$
  select coalesce(array_agg(distinct t), '{}') from (
    select c.teacher_id as t from v2.classes c where c.id = p_class and c.teacher_id is not null
    union select m.user_id from v2.class_members m where m.class_id = p_class and m.role = 'teacher') x
$$;

create or replace function v2._ph_guardians(p_students uuid[]) returns uuid[]
language sql stable security definer set search_path = v2, public as $$
  select coalesce(array_agg(distinct g.parent_id), '{}') from v2.guardian_links g where g.student_id = any (p_students)
$$;

create or replace function v2._ph_name(p_id uuid) returns text
language sql stable security definer set search_path = v2, public as $$
  select coalesce((select nullif(btrim(p.name), '') from v2.profiles p where p.id = p_id), 'Thầy/cô')
$$;

create or replace function v2._ph_ddmm(p_at timestamptz) returns text
language sql stable set search_path = v2, public as $$
  select to_char(p_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM')
$$;

-- Giờ yên lặng [from, to) theo giờ Việt Nam → thời điểm sớm nhất được gửi. from = to hoặc null: không yên lặng.
create or replace function v2._quiet_until(p_from time, p_to time, p_now timestamptz) returns timestamptz
language plpgsql stable set search_path = v2, public as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Ho_Chi_Minh';
  v_t time := v_local::time;
begin
  if p_from is null or p_to is null or p_from = p_to then return p_now; end if;
  if p_from > p_to then
    if v_t >= p_from then return ((v_local::date + 1) + p_to) at time zone 'Asia/Ho_Chi_Minh'; end if;
    if v_t < p_to then return (v_local::date + p_to) at time zone 'Asia/Ho_Chi_Minh'; end if;
    return p_now;
  end if;
  if v_t >= p_from and v_t < p_to then return (v_local::date + p_to) at time zone 'Asia/Ho_Chi_Minh'; end if;
  return p_now;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Phụ huynh thấy gì
-- ---------------------------------------------------------------------------
create table if not exists v2.parent_share_settings (
  class_id text primary key references v2.classes (id) on delete cascade,
  modes jsonb not null default '{}'::jsonb check (jsonb_typeof(modes) = 'object'),
  msg_enabled boolean not null default true,
  msg_from time not null default '06:30',
  msg_to time not null default '21:00',
  updated_by uuid references v2.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (msg_from < msg_to)
);
alter table v2.parent_share_settings enable row level security;
comment on table v2.parent_share_settings is 'Mỗi lớp: mục nào phụ huynh thấy (auto/review/off) + giờ nhận tin nhắn của phụ huynh. Đọc/ghi qua RPC.';

-- Mục "GV duyệt rồi mới gửi" đã gửi (state = sent) hoặc bỏ qua (skipped).
create table if not exists v2.parent_releases (
  kind text not null check (kind in ('works', 'tt27', 'praise', 'reminders', 'attendance')),
  ref_id text not null check (length(ref_id) between 1 and 200),
  student_id uuid not null references v2.profiles (id) on delete cascade,
  class_id text references v2.classes (id) on delete cascade,
  state text not null default 'sent' check (state in ('sent', 'skipped')),
  note text check (note is null or length(note) <= 1000),
  by_id uuid references v2.profiles (id) on delete set null,
  at timestamptz not null default now(),
  primary key (kind, ref_id)
);
create index if not exists parent_releases_student on v2.parent_releases (student_id, at desc);
alter table v2.parent_releases enable row level security;

create or replace function v2._ps_kinds() returns text[]
language sql immutable as $$
  select array['study', 'skills', 'assignments', 'works', 'tt27', 'praise', 'reminders', 'attendance', 'notes', 'discuss', 'arena']
$$;

create or replace function v2._ps_kind_ok(p_kind text, p_mode text) returns boolean
language sql immutable as $$
  select case
    when p_kind in ('works', 'tt27', 'praise', 'reminders', 'attendance') then coalesce(p_mode in ('auto', 'review', 'off'), false)
    when p_kind in ('study', 'skills', 'assignments', 'notes', 'discuss', 'arena') then coalesce(p_mode in ('auto', 'off'), false)
    else false end
$$;

create or replace function v2._ps_mode(p_class text, p_kind text) returns text
language sql stable security definer set search_path = v2, public as $$
  select coalesce(
    (select s.modes ->> p_kind from v2.parent_share_settings s where s.class_id = p_class and v2._ps_kind_ok(p_kind, s.modes ->> p_kind)),
    case p_kind when 'reminders' then 'review' else 'auto' end)
$$;

-- Phụ huynh (người gọi) có được thấy mục p_kind của em p_student không. p_ref = mã bản ghi cần duyệt (null: bản ghi không cần duyệt).
create or replace function v2.ps_guardian_ok(p_student uuid, p_kind text, p_ref text default null) returns boolean
language plpgsql stable security definer set search_path = v2, public as $$
declare v_mode text;
begin
  if p_student is null or not v2.is_guardian_of(p_student) then return false; end if;
  v_mode := v2._ps_mode(v2._class_of_student(p_student), p_kind);
  if v_mode = 'auto' then return true; end if;
  if v_mode = 'review' then
    return p_ref is null or exists (select 1 from v2.parent_releases r where r.kind = p_kind and r.ref_id = p_ref and r.state = 'sent');
  end if;
  return false;
end $$;

-- Lời khen hay nhắc nhở: theo loại hành vi của lớp; không có thì theo dấu điểm.
create or replace function v2._ps_behavior_kind(p_class text, p_behavior text, p_points int) returns text
language sql stable security definer set search_path = v2, public as $$
  select case coalesce((select b.kind from v2.behaviors b where b.class_id = p_class and b.id = p_behavior),
                       case when p_points < 0 then 'needs-work' else 'positive' end)
         when 'needs-work' then 'reminders' else 'praise' end
$$;

-- Như can_view_user nhưng phụ huynh còn phải qua cài đặt của lớp.
create or replace function v2.can_view_user_k(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select p_user = auth.uid() or v2.is_teacher_of_student(p_user) or v2.ps_guardian_ok(p_user, p_kind)
$$;

-- Quyền đọc bảng: thay nhánh phụ huynh.
drop policy if exists attendance_read on v2.attendance;
create policy attendance_read on v2.attendance for select to authenticated using (
  v2.is_teacher_of_class(class_id) or student_id = (select auth.uid())
  or v2.ps_guardian_ok(student_id, 'attendance', case when status = 'co-mat' then null else student_id::text || ':' || date::text end));

drop policy if exists behavior_logs_read on v2.behavior_logs;
create policy behavior_logs_read on v2.behavior_logs for select to authenticated using (
  v2.is_teacher_of_class(class_id) or student_id = (select auth.uid())
  or v2.ps_guardian_ok(student_id, v2._ps_behavior_kind(class_id, behavior_id, points), id::text));

drop policy if exists submissions_read on v2.submissions;
create policy submissions_read on v2.submissions for select to authenticated using (
  student_id = (select auth.uid()) or v2.is_teacher_of_class(class_id)
  or (status = 'approved' and v2.ps_guardian_ok(student_id, 'works', id::text)));

drop policy if exists tt27_read on v2.tt27_evaluations;
create policy tt27_read on v2.tt27_evaluations for select to authenticated using (
  v2.is_teacher_of_class(class_id)
  or (status = 'final' and (student_id = (select auth.uid())
      or v2.ps_guardian_ok(student_id, 'tt27', student_id::text || ':' || school_year || ':' || term_id))));

drop policy if exists student_notes_select on v2.student_notes;
create policy student_notes_select on v2.student_notes for select to authenticated using (
  (select v2.is_teacher_of_student(student_notes.student_id))
  or (share_parent and v2.ps_guardian_ok(student_id, 'notes')));

drop policy if exists learning_events_read on v2.learning_events;
create policy learning_events_read on v2.learning_events for select to authenticated using (v2.can_view_user_k(user_id, 'study'));
drop policy if exists reward_ledger_read on v2.reward_ledger;
create policy reward_ledger_read on v2.reward_ledger for select to authenticated using (v2.can_view_user_k(user_id, 'study'));
drop policy if exists streaks_read on v2.streaks;
create policy streaks_read on v2.streaks for select to authenticated using (v2.can_view_user_k(user_id, 'study'));
drop policy if exists lesson_progress_read on v2.lesson_progress;
create policy lesson_progress_read on v2.lesson_progress for select to authenticated using (v2.can_view_user_k(user_id, 'assignments'));
drop policy if exists skill_mastery_read on v2.skill_mastery;
create policy skill_mastery_read on v2.skill_mastery for select to authenticated using (v2.can_view_user_k(user_id, 'skills') or (select v2.is_admin()));
drop policy if exists arena_profiles_read on v2.arena_profiles;
create policy arena_profiles_read on v2.arena_profiles for select to authenticated using (v2.can_view_user_k(user_id, 'arena'));

create or replace function v2.can_see_grade(p_submission uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.submissions s
     where s.id = p_submission
       and (v2.is_teacher_of_class(s.class_id)
            or (s.status = 'approved' and (s.student_id = auth.uid() or v2.ps_guardian_ok(s.student_id, 'works', s.id::text))))
  )
$$;

create or replace function v2.can_see_review(p_submission uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.can_see_grade(p_submission) or exists (
    select 1 from v2.submissions s where s.id = p_submission and s.status = 'returned'
       and (s.student_id = auth.uid() or v2.ps_guardian_ok(s.student_id, 'works', null))
  )
$$;

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
      or (p_status = 'visible' and not d.archived and v2.ps_guardian_ok(p_author, 'discuss'))
    )
  )
$$;

-- Hồ sơ (security definer — bỏ qua RLS nên lọc tại đây khi người xem là phụ huynh).
create or replace function v2.get_student_extras(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_class text;
  v_staff boolean := v2.is_teacher_of_student(p_user) or v2.is_admin();
  v_gd boolean;
begin
  if not (v2.can_view_user(p_user) or v2.is_admin()) then
    raise exception 'Không có quyền xem hồ sơ học sinh này.' using errcode = '42501';
  end if;
  v_gd := not (v_staff or p_user = auth.uid());
  select coalesce(p.class_id, (select m.class_id from v2.class_members m where m.user_id = p.id and m.role = 'student' limit 1))
    into v_class from v2.profiles p where p.id = p_user;
  return jsonb_build_object(
    'works', coalesce((
      select jsonb_agg(jsonb_build_object('submission', to_jsonb(s), 'task', to_jsonb(t), 'grade', g.data, 'review', to_jsonb(r)) order by s.updated_at desc)
        from v2.submissions s
        join v2.work_tasks t on t.id = s.task_id
        join v2.ai_grades g on g.submission_id = s.id
        left join v2.grade_reviews r on r.submission_id = s.id
       where s.student_id = p_user and s.status = 'approved'
         and (not v_gd or v2.ps_guardian_ok(p_user, 'works', s.id::text))), '[]'::jsonb),
    'workPending', case when v_gd and v2._ps_mode(v_class, 'works') = 'off' then 0
                        else (select count(*) from v2.submissions s where s.student_id = p_user and s.status not in ('approved', 'returned')) end,
    'behaviors', coalesce((select jsonb_agg(to_jsonb(b) order by b.position) from v2.behaviors b where b.class_id = v_class), '[]'::jsonb),
    'behaviorLogs', coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc) from v2.behavior_logs l
                               where l.student_id = p_user and l.at > now() - interval '90 days'
                                 and (not v_gd or v2.ps_guardian_ok(p_user, v2._ps_behavior_kind(l.class_id, l.behavior_id, l.points), l.id::text))), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(to_jsonb(a) order by a.date desc) from v2.attendance a
                             where a.student_id = p_user and a.date > v2.today_vn() - 45
                               and (not v_gd or v2.ps_guardian_ok(p_user, 'attendance',
                                      case when a.status = 'co-mat' then null else a.student_id::text || ':' || a.date::text end))), '[]'::jsonb),
    'tt27', (select to_jsonb(e) from v2.tt27_evaluations e
              where e.student_id = p_user and (v_staff or e.status = 'final')
                and (not v_gd or v2.ps_guardian_ok(p_user, 'tt27', e.student_id::text || ':' || e.school_year || ':' || e.term_id))
              order by e.school_year desc, array_position(array['GK1', 'CK1', 'GK2', 'CN'], e.term_id) desc limit 1)
  );
end $$;

create or replace function v2.get_student_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_class text;
  v_gd boolean;
  v_study boolean := true;
  v_skills boolean := true;
  v_asg boolean := true;
begin
  if not (v2.can_view_user(p_user) or v2.is_admin()) then
    raise exception 'Không có quyền xem hồ sơ học sinh này.' using errcode = '42501';
  end if;
  v_gd := not (p_user = auth.uid() or v2.is_teacher_of_student(p_user) or v2.is_admin());
  if v_gd then
    v_study := v2.ps_guardian_ok(p_user, 'study');
    v_skills := v2.ps_guardian_ok(p_user, 'skills');
    v_asg := v2.ps_guardian_ok(p_user, 'assignments');
  end if;
  select coalesce(p.class_id, (select m.class_id from v2.class_members m where m.user_id = p.id and m.role = 'student' limit 1))
    into v_class from v2.profiles p where p.id = p_user;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from v2.profiles p where p.id = p_user),
    'class', case when v_class is null then null else v2.class_json(v_class) end,
    'wallet', case when v_study then (select to_jsonb(w) from v2.wallets w where w.user_id = p_user) end,
    'passport', case when v_study then (select to_jsonb(x) from v2.passports x where x.user_id = p_user) end,
    'masteries', case when not v_skills then '[]'::jsonb else
      coalesce((select jsonb_agg(to_jsonb(m) order by m.skill_code) from v2.skill_mastery m where m.user_id = p_user), '[]'::jsonb) end,
    'assignments', case when not v_asg then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(a) order by a.open_at desc) from v2.assignments a
       where a.class_id = v_class and (cardinality(a.student_ids) = 0 or p_user::text = any (a.student_ids))), '[]'::jsonb) end,
    'lessons', case when not v_asg then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'subject', l.subject,
               'slide_ids', coalesce((select jsonb_agg(s.id order by s.position) from v2.lesson_slides s where s.lesson_id = l.id), '[]'::jsonb)))
        from v2.lessons l
       where l.id in (
         select a.target_id from v2.assignments a
          where a.target_type = 'lesson' and a.class_id = v_class and (cardinality(a.student_ids) = 0 or p_user::text = any (a.student_ids))
         union select lp.lesson_id from v2.lesson_progress lp where lp.user_id = p_user)), '[]'::jsonb) end,
    'progress', case when not v_asg then '[]'::jsonb else
      coalesce((select jsonb_agg(to_jsonb(lp)) from v2.lesson_progress lp where lp.user_id = p_user), '[]'::jsonb) end,
    'events', case when not v_study then '[]'::jsonb else coalesce((select jsonb_agg(v2.event_lite(e) order by e.at desc) from (
      select * from v2.learning_events where user_id = p_user order by at desc limit 300) e), '[]'::jsonb) end,
    'rewards', case when not v_study then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(r) order by r.at desc) from (
      select * from v2.reward_ledger where user_id = p_user order by at desc limit 100) r), '[]'::jsonb) end
  );
end $$;

create or replace function v2.get_parent_summary(p_child uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_gd boolean;
  v_study boolean := true;
  v_skills boolean := true;
begin
  if not (v2.is_guardian_of(p_child) or v2.can_view_user(p_child) or v2.is_admin()) then
    raise exception 'Không có quyền xem thông tin học sinh này.' using errcode = '42501';
  end if;
  v_gd := not (p_child = auth.uid() or v2.is_teacher_of_student(p_child) or v2.is_admin());
  if v_gd then
    v_study := v2.ps_guardian_ok(p_child, 'study');
    v_skills := v2.ps_guardian_ok(p_child, 'skills');
  end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from v2.profiles p where p.id = p_child),
    'masteries', case when not v_skills then '[]'::jsonb else
      coalesce((select jsonb_agg(to_jsonb(m)) from v2.skill_mastery m where m.user_id = p_child), '[]'::jsonb) end,
    'events', case when not v_study then '[]'::jsonb else coalesce((select jsonb_agg(v2.event_lite(e) order by e.at desc) from v2.learning_events e
                         where e.user_id = p_child and e.at > now() - interval '15 days'), '[]'::jsonb) end,
    'rewards', case when not v_study then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(r) order by r.at desc) from v2.reward_ledger r
                          where r.user_id = p_child and r.at > now() - interval '15 days'), '[]'::jsonb) end
  );
end $$;

-- ---- RPC cho giáo viên ----------------------------------------------------
create or replace function v2._ps_json(p_class text) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'classId', p_class,
    'modes', (select jsonb_object_agg(k, v2._ps_mode(p_class, k)) from unnest(v2._ps_kinds()) k),
    'msgEnabled', coalesce(s.msg_enabled, true),
    'msgFrom', to_char(coalesce(s.msg_from, '06:30'::time), 'HH24:MI'),
    'msgTo', to_char(coalesce(s.msg_to, '21:00'::time), 'HH24:MI'),
    'students', cardinality(st.ids),
    'linkedStudents', (select count(distinct g.student_id) from v2.guardian_links g where g.student_id = any (st.ids)),
    'parents', cardinality(v2._ph_guardians(st.ids)),
    'updatedAt', s.updated_at)
  from (select v2._ph_students(p_class) as ids) st
  left join v2.parent_share_settings s on s.class_id = p_class
$$;

create or replace function v2.parent_share_get(p_class text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ giáo viên của lớp xem được cài đặt phụ huynh.' using errcode = '42501';
  end if;
  return v2._ps_json(p_class);
end $$;

create or replace function v2.parent_share_save(p_class text, p jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_modes jsonb := coalesce((select s.modes from v2.parent_share_settings s where s.class_id = p_class), '{}'::jsonb);
  k text; m text;
  v_from time; v_to time;
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ giáo viên của lớp đổi được cài đặt phụ huynh.' using errcode = '42501';
  end if;
  if p ? 'modes' then
    if jsonb_typeof(p -> 'modes') <> 'object' then raise exception 'Cài đặt chưa đúng.' using errcode = '22023'; end if;
    for k, m in select key, value #>> '{}' from jsonb_each(p -> 'modes') loop
      if not v2._ps_kind_ok(k, m) then raise exception 'Mục "%" không đặt được là "%".', k, m using errcode = '22023'; end if;
      v_modes := v_modes || jsonb_build_object(k, m);
    end loop;
  end if;
  begin
    v_from := coalesce((p ->> 'msgFrom')::time, (select s.msg_from from v2.parent_share_settings s where s.class_id = p_class), '06:30');
    v_to := coalesce((p ->> 'msgTo')::time, (select s.msg_to from v2.parent_share_settings s where s.class_id = p_class), '21:00');
  exception when others then
    raise exception 'Giờ nhận tin chưa đúng (dạng 07:00).' using errcode = '22023';
  end;
  if v_from >= v_to then raise exception 'Giờ bắt đầu nhận tin phải trước giờ kết thúc.' using errcode = '22023'; end if;
  insert into v2.parent_share_settings as s (class_id, modes, msg_enabled, msg_from, msg_to, updated_by, updated_at)
  values (p_class, v_modes, coalesce((p ->> 'msgEnabled')::boolean, true), v_from, v_to, auth.uid(), now())
  on conflict (class_id) do update set
    modes = excluded.modes,
    msg_enabled = coalesce((p ->> 'msgEnabled')::boolean, s.msg_enabled),
    msg_from = excluded.msg_from, msg_to = excluded.msg_to,
    updated_by = excluded.updated_by, updated_at = now();
  return v2._ps_json(p_class);
end $$;

create or replace function v2._ps_term_label(p_term text) returns text
language sql immutable as $$
  select case p_term when 'GK1' then 'giữa học kì I' when 'CK1' then 'cuối học kì I' when 'GK2' then 'giữa học kì II' when 'CN' then 'cuối năm học' else p_term end
$$;

create or replace function v2._ps_att_label(p_status text) returns text
language sql immutable as $$
  select case p_status when 'vang-co-phep' then 'Vắng có phép' when 'vang-khong-phep' then 'Vắng không phép' when 'muon' then 'Đi học muộn' else 'Có mặt' end
$$;

-- Một mục cần duyệt: {kind, refId, studentId, classId, at, title, detail}. null nếu không còn.
create or replace function v2._ps_item(p_kind text, p_ref text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v jsonb;
  v_parts text[];
begin
  if p_kind = 'works' then
    if p_ref !~ '^[0-9a-fA-F-]{36}$' then return null; end if;
    select jsonb_build_object('studentId', s.student_id, 'classId', s.class_id, 'at', s.updated_at,
             'title', 'Bài viết đã chấm: ' || coalesce(t.title, 'Bài viết'), 'detail', null)
      into v from v2.submissions s left join v2.work_tasks t on t.id = s.task_id
     where s.id = p_ref::uuid and s.status = 'approved';
  elsif p_kind = 'tt27' then
    v_parts := string_to_array(p_ref, ':');
    if cardinality(v_parts) <> 3 or v_parts[1] !~ '^[0-9a-fA-F-]{36}$' then return null; end if;
    select jsonb_build_object('studentId', e.student_id, 'classId', e.class_id, 'at', e.updated_at,
             'title', 'Kết quả đánh giá ' || v2._ps_term_label(e.term_id) || ' ' || e.school_year, 'detail', e.data ->> 'generalComment')
      into v from v2.tt27_evaluations e
     where e.student_id = v_parts[1]::uuid and e.school_year = v_parts[2] and e.term_id = v_parts[3] and e.status = 'final';
  elsif p_kind in ('praise', 'reminders') then
    if p_ref !~ '^[0-9a-fA-F-]{36}$' then return null; end if;
    select jsonb_build_object('studentId', l.student_id, 'classId', l.class_id, 'at', l.at,
             'title', case when p_kind = 'praise' then 'Được khen: ' else 'Nhắc nhở: ' end
                      || coalesce(b.label, nullif(btrim(l.note), ''), case when p_kind = 'praise' then 'thi đua' else 'nề nếp' end)
                      || ' (' || case when l.points > 0 then '+' else '' end || l.points || ' điểm)',
             'detail', case when b.label is not null then nullif(btrim(l.note), '') end, 'points', l.points)
      into v from v2.behavior_logs l left join v2.behaviors b on b.class_id = l.class_id and b.id = l.behavior_id
     where l.id = p_ref::uuid and v2._ps_behavior_kind(l.class_id, l.behavior_id, l.points) = p_kind;
  elsif p_kind = 'attendance' then
    v_parts := string_to_array(p_ref, ':');
    if cardinality(v_parts) <> 2 or v_parts[1] !~ '^[0-9a-fA-F-]{36}$' or v_parts[2] !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
    select jsonb_build_object('studentId', a.student_id, 'classId', a.class_id, 'at', a.updated_at,
             'title', v2._ps_att_label(a.status) || ' ngày ' || to_char(a.date, 'DD/MM'), 'detail', null)
      into v from v2.attendance a
     where a.student_id = v_parts[1]::uuid and a.date = v_parts[2]::date and a.status <> 'co-mat';
  end if;
  if v is null then return null; end if;
  return v || jsonb_build_object('kind', p_kind, 'refId', p_ref, 'studentName', v2._ph_name((v ->> 'studentId')::uuid));
end $$;

create or replace function v2.parent_queue(p_class text, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 120)));
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ giáo viên của lớp xem được mục chờ duyệt.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(i.j order by q.at desc)
    from (
      select 'works'::text as kind, s.id::text as ref, s.updated_at as at from v2.submissions s
       where v2._ps_mode(p_class, 'works') = 'review' and s.class_id = p_class and s.status = 'approved' and s.updated_at > v_since
      union all
      select 'tt27', e.student_id::text || ':' || e.school_year || ':' || e.term_id, e.updated_at from v2.tt27_evaluations e
       where v2._ps_mode(p_class, 'tt27') = 'review' and e.class_id = p_class and e.status = 'final' and e.updated_at > v_since
      union all
      select k, l.id::text, l.at from v2.behavior_logs l, lateral (select v2._ps_behavior_kind(l.class_id, l.behavior_id, l.points) as k) x
       where l.class_id = p_class and l.at > v_since and v2._ps_mode(p_class, x.k) = 'review'
      union all
      select 'attendance', a.student_id::text || ':' || a.date::text, a.updated_at from v2.attendance a
       where v2._ps_mode(p_class, 'attendance') = 'review' and a.class_id = p_class and a.status <> 'co-mat' and a.updated_at > v_since
    ) q
    cross join lateral (select v2._ps_item(q.kind, q.ref) as j) i
    where i.j is not null and not exists (select 1 from v2.parent_releases r where r.kind = q.kind and r.ref_id = q.ref)
  ), '[]'::jsonb);
end $$;

-- Gửi (sent) hoặc bỏ qua (skipped) các mục chờ duyệt. p_items: [{kind, refId}]. Trả về số mục đã xử lí.
create or replace function v2.parent_release(p_items jsonb, p_state text default 'sent', p_note text default null) returns int
language plpgsql security definer set search_path = v2, public as $$
declare
  x jsonb; v_item jsonb; n int := 0;
begin
  perform v2._require_user();
  if p_state not in ('sent', 'skipped') then raise exception 'Trạng thái chưa đúng.' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 then
    raise exception 'Danh sách mục chưa đúng.' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 1000 then raise exception 'Lời nhắn tối đa 1000 kí tự.' using errcode = '22023'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    v_item := v2._ps_item(x ->> 'kind', x ->> 'refId');
    if v_item is null then continue; end if;
    if not v2.is_teacher_of_class(v_item ->> 'classId') then
      raise exception 'Chỉ giáo viên của lớp gửi được mục này.' using errcode = '42501';
    end if;
    insert into v2.parent_releases as r (kind, ref_id, student_id, class_id, state, note, by_id, at)
    values (x ->> 'kind', x ->> 'refId', (v_item ->> 'studentId')::uuid, v_item ->> 'classId', p_state, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
    on conflict (kind, ref_id) do update set state = excluded.state, note = excluded.note, by_id = excluded.by_id, at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

-- "Phụ huynh của em thấy gì": mỗi mục {kind, mode, total, shown} (30 ngày với mục theo ngày) + phụ huynh đã liên kết.
create or replace function v2.parent_preview(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_class text := v2._class_of_student(p_student);
  v_since timestamptz := now() - interval '30 days';
  k text; v_mode text; v_total int; v_shown int; v_out jsonb := '[]'::jsonb;
begin
  if not v2.is_teacher_of_student(p_student) then
    raise exception 'Chỉ giáo viên của em xem được.' using errcode = '42501';
  end if;
  foreach k in array v2._ps_kinds() loop
    v_mode := v2._ps_mode(v_class, k);
    v_total := 0; v_shown := null;
    if k = 'study' then
      select count(*) into v_total from v2.learning_events e where e.user_id = p_student and e.at > now() - interval '7 days';
    elsif k = 'skills' then
      select count(*) into v_total from v2.skill_mastery m where m.user_id = p_student;
    elsif k = 'assignments' then
      select count(*) into v_total from v2.assignments a where a.class_id = v_class and (cardinality(a.student_ids) = 0 or p_student::text = any (a.student_ids)) and a.open_at > v_since;
    elsif k = 'works' then
      select count(*), count(*) filter (where exists (select 1 from v2.parent_releases r where r.kind = 'works' and r.ref_id = s.id::text and r.state = 'sent'))
        into v_total, v_shown from v2.submissions s where s.student_id = p_student and s.status = 'approved';
    elsif k = 'tt27' then
      select count(*), count(*) filter (where exists (select 1 from v2.parent_releases r where r.kind = 'tt27' and r.state = 'sent'
                                                        and r.ref_id = e.student_id::text || ':' || e.school_year || ':' || e.term_id))
        into v_total, v_shown from v2.tt27_evaluations e where e.student_id = p_student and e.status = 'final';
    elsif k in ('praise', 'reminders') then
      select count(*), count(*) filter (where exists (select 1 from v2.parent_releases r where r.kind = k and r.ref_id = l.id::text and r.state = 'sent'))
        into v_total, v_shown from v2.behavior_logs l
       where l.student_id = p_student and l.at > v_since and v2._ps_behavior_kind(l.class_id, l.behavior_id, l.points) = k;
    elsif k = 'attendance' then
      select count(*), count(*) filter (where a.status = 'co-mat' or exists (select 1 from v2.parent_releases r where r.kind = 'attendance' and r.state = 'sent'
                                                        and r.ref_id = a.student_id::text || ':' || a.date::text))
        into v_total, v_shown from v2.attendance a where a.student_id = p_student and a.date > v2.today_vn() - 30;
    elsif k = 'notes' then
      select count(*) filter (where n.share_parent), count(*) filter (where n.share_parent) into v_total, v_shown from v2.student_notes n where n.student_id = p_student;
    elsif k = 'discuss' then
      select count(*) into v_total from v2.discussion_posts d where d.author_id = p_student and d.status = 'visible';
    elsif k = 'arena' then
      select count(*) into v_total from v2.cup_players c where c.user_id = p_student;
    end if;
    v_shown := case v_mode when 'off' then 0 when 'auto' then v_total else coalesce(v_shown, v_total) end;
    v_out := v_out || jsonb_build_object('kind', k, 'mode', v_mode, 'total', v_total, 'shown', v_shown);
  end loop;
  return jsonb_build_object(
    'studentId', p_student, 'studentName', v2._ph_name(p_student), 'classId', v_class, 'items', v_out,
    'parents', coalesce((select jsonb_agg(jsonb_build_object('id', g.parent_id, 'name', v2._ph_name(g.parent_id), 'relation', g.relation) order by g.created_at)
                         from v2.guardian_links g where g.student_id = p_student), '[]'::jsonb),
    'waiting', (select count(*) from jsonb_array_elements(v2.parent_queue(v_class, 30)) q where q ->> 'studentId' = p_student::text));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Gửi phụ huynh + nhắn tin hai chiều
-- ---------------------------------------------------------------------------
create table if not exists v2.parent_posts (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references v2.classes (id) on delete cascade,
  author_id uuid references v2.profiles (id) on delete set null,
  audience text not null default 'class' check (audience in ('class', 'students')),
  student_ids uuid[] not null default '{}',
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 5000),
  ack_required boolean not null default false,
  send_at timestamptz not null default now(),
  notified_at timestamptz,
  reminded_at timestamptz,
  recalled_at timestamptz,
  created_at timestamptz not null default now(),
  check (audience = 'class' or cardinality(student_ids) between 1 and 300)
);
create index if not exists parent_posts_class on v2.parent_posts (class_id, send_at desc);
create index if not exists parent_posts_due on v2.parent_posts (send_at) where notified_at is null and recalled_at is null;
alter table v2.parent_posts enable row level security;

create table if not exists v2.parent_post_reads (
  post_id uuid not null references v2.parent_posts (id) on delete cascade,
  parent_id uuid not null references v2.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  acked_at timestamptz,
  primary key (post_id, parent_id)
);
alter table v2.parent_post_reads enable row level security;

create table if not exists v2.parent_messages (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references v2.classes (id) on delete cascade,
  student_id uuid not null references v2.profiles (id) on delete cascade,
  sender_id uuid references v2.profiles (id) on delete set null,
  from_teacher boolean not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  post_id uuid references v2.parent_posts (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz
);
create index if not exists parent_messages_thread on v2.parent_messages (student_id, created_at desc);
create index if not exists parent_messages_class on v2.parent_messages (class_id, created_at desc);
alter table v2.parent_messages enable row level security;
-- Đọc trực tiếp chỉ để nhận Realtime; ghi qua RPC.
drop policy if exists parent_messages_read on v2.parent_messages;
create policy parent_messages_read on v2.parent_messages for select to authenticated
  using (v2.is_teacher_of_class(class_id) or v2.is_guardian_of(student_id));

create or replace function v2._ps_msg_json(p_class text) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'enabled', coalesce(s.msg_enabled, true),
    'from', to_char(coalesce(s.msg_from, '06:30'::time), 'HH24:MI'),
    'to', to_char(coalesce(s.msg_to, '21:00'::time), 'HH24:MI'),
    'open', v2._quiet_until(coalesce(s.msg_to, '21:00'::time), coalesce(s.msg_from, '06:30'::time), now()) <= now())
  from (select 1) x left join v2.parent_share_settings s on s.class_id = p_class
$$;

create or replace function v2._post_targets(p v2.parent_posts) returns uuid[]
language sql stable security definer set search_path = v2, public as $$
  select case when p.audience = 'class' then v2._ph_students(p.class_id) else p.student_ids end
$$;

create or replace function v2._post_json(p v2.parent_posts, p_detail boolean default false) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with t as (select v2._post_targets(p) as students),
       g as (select v2._ph_guardians(t.students) as parents from t)
  select jsonb_build_object(
    'id', p.id, 'classId', p.class_id, 'authorId', p.author_id, 'authorName', v2._ph_name(p.author_id),
    'audience', p.audience, 'studentIds', to_jsonb(p.student_ids),
    'studentNames', case when p.audience = 'students' then (select jsonb_agg(v2._ph_name(s) order by v2._ph_name(s)) from unnest(p.student_ids) s) else '[]'::jsonb end,
    'title', p.title, 'body', p.body, 'ackRequired', p.ack_required, 'sendAt', p.send_at,
    'sent', p.notified_at is not null, 'recalled', p.recalled_at is not null, 'remindedAt', p.reminded_at, 'createdAt', p.created_at,
    'parents', cardinality(g.parents),
    'reads', (select count(*) from v2.parent_post_reads r where r.post_id = p.id and r.parent_id = any (g.parents)),
    'acks', (select count(*) from v2.parent_post_reads r where r.post_id = p.id and r.parent_id = any (g.parents) and r.acked_at is not null),
    'noParent', (select count(*) from unnest(t.students) s where not exists (select 1 from v2.guardian_links l where l.student_id = s)))
  || case when not p_detail then '{}'::jsonb else jsonb_build_object('students', coalesce((
      select jsonb_agg(jsonb_build_object('studentId', s, 'studentName', v2._ph_name(s),
               'parents', coalesce((select jsonb_agg(jsonb_build_object('id', l.parent_id, 'name', v2._ph_name(l.parent_id), 'relation', l.relation,
                                                         'readAt', r.read_at, 'ackedAt', r.acked_at) order by l.created_at)
                                    from v2.guardian_links l left join v2.parent_post_reads r on r.post_id = p.id and r.parent_id = l.parent_id
                                   where l.student_id = s), '[]'::jsonb)) order by v2._ph_name(s))
      from unnest(t.students) s), '[]'::jsonb)) end
  from t, g
$$;

create or replace function v2.parent_post_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_class text := p ->> 'classId';
  v_aud text := coalesce(p ->> 'audience', 'class');
  v_students uuid[] := '{}';
  v_send timestamptz;
  v_row v2.parent_posts;
begin
  if not v2.is_teacher_of_class(v_class) then
    raise exception 'Chỉ giáo viên của lớp gửi được thông báo cho phụ huynh lớp này.' using errcode = '42501';
  end if;
  if v_aud not in ('class', 'students') then raise exception 'Người nhận chưa đúng.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p ->> 'title', ''))) = 0 then raise exception 'Cần có tiêu đề.' using errcode = '22023'; end if;
  if v_aud = 'students' then
    begin
      select coalesce(array_agg(distinct x::uuid), '{}') into v_students from jsonb_array_elements_text(coalesce(p -> 'studentIds', '[]')) x;
    exception when others then raise exception 'Danh sách học sinh chưa đúng.' using errcode = '22023';
    end;
    if cardinality(v_students) = 0 then raise exception 'Chọn ít nhất một em.' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_students) s where not (s = any (v2._ph_students(v_class)))) then
      raise exception 'Có em không thuộc lớp này.' using errcode = '22023';
    end if;
  end if;
  begin
    v_send := coalesce((p ->> 'sendAt')::timestamptz, now());
  exception when others then raise exception 'Giờ gửi chưa đúng.' using errcode = '22023';
  end;
  if v_send > now() + interval '60 days' then raise exception 'Chỉ hẹn giờ trong vòng 60 ngày.' using errcode = '22023'; end if;
  insert into v2.parent_posts (class_id, author_id, audience, student_ids, title, body, ack_required, send_at)
  values (v_class, auth.uid(), v_aud, v_students, btrim(p ->> 'title'), btrim(coalesce(p ->> 'body', '')),
          coalesce((p ->> 'ackRequired')::boolean, false), greatest(v_send, now()))
  returning * into v_row;
  select * into v_row from v2.parent_posts where id = v_row.id;  -- trigger có thể đã đặt notified_at
  return v2._post_json(v_row);
end $$;

create or replace function v2.parent_post_list(p_class text, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ giáo viên của lớp xem được.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x.j order by x.at desc)
                   from (select v2._post_json(p) as j, p.send_at as at from v2.parent_posts p
                          where p.class_id = p_class order by p.send_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) x), '[]'::jsonb);
end $$;

create or replace function v2.parent_post_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare v_row v2.parent_posts;
begin
  select * into v_row from v2.parent_posts where id = p_id;
  if not found or not v2.is_teacher_of_class(v_row.class_id) then
    raise exception 'Không tìm thấy thông báo.' using errcode = '42501';
  end if;
  return v2._post_json(v_row, true);
end $$;

create or replace function v2.parent_post_recall(p_id uuid) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare v_row v2.parent_posts;
begin
  select * into v_row from v2.parent_posts where id = p_id for update;
  if not found or not v2.is_teacher_of_class(v_row.class_id) then
    raise exception 'Không tìm thấy thông báo.' using errcode = '42501';
  end if;
  update v2.parent_posts set recalled_at = coalesce(recalled_at, now()) where id = p_id returning * into v_row;
  -- Thông báo chưa đọc của tin đã thu hồi: gỡ khỏi chuông phụ huynh.
  delete from v2.notifications n where n.kind = 'ph-thong-bao' and n.ref ->> 'postId' = p_id::text and n.read_at is null;
  return v2._post_json(v_row);
end $$;

-- Nhắc lại phụ huynh chưa đọc (tối đa mỗi 12 giờ một lần).
create or replace function v2.parent_post_remind(p_id uuid) returns int
language plpgsql security definer set search_path = v2, public as $$
declare
  v_row v2.parent_posts;
  v_targets uuid[];
begin
  select * into v_row from v2.parent_posts where id = p_id for update;
  if not found or not v2.is_teacher_of_class(v_row.class_id) then
    raise exception 'Không tìm thấy thông báo.' using errcode = '42501';
  end if;
  if v_row.recalled_at is not null or v_row.notified_at is null then
    raise exception 'Thông báo chưa gửi hoặc đã thu hồi.' using errcode = '22023';
  end if;
  if v_row.reminded_at is not null and v_row.reminded_at > now() - interval '12 hours' then
    raise exception 'Đã nhắc lúc %. Mỗi 12 giờ nhắc một lần.', to_char(v_row.reminded_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') using errcode = '22023';
  end if;
  select coalesce(array_agg(g), '{}') into v_targets from unnest(v2._ph_guardians(v2._post_targets(v_row))) g
   where not exists (select 1 from v2.parent_post_reads r where r.post_id = p_id and r.parent_id = g
                       and (r.acked_at is not null or not v_row.ack_required));
  update v2.parent_posts set reminded_at = now() where id = p_id;
  return v2._notify(v_targets, 'ph-thong-bao', 'Nhắc lại: ' || v_row.title, left(v_row.body, 160), '/phu-huynh?tin=' || p_id,
                    jsonb_build_object('postId', p_id));
end $$;

-- Phụ huynh: thông báo của thầy/cô + mục thầy/cô đã gửi + tóm tắt tin nhắn của một con.
create or replace function v2.parent_inbox(p_child uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_class text := v2._class_of_student(p_child);
begin
  if not v2.is_guardian_of(p_child) then
    raise exception 'Chỉ phụ huynh đã liên kết với em mới xem được.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'childId', p_child, 'classId', v_class,
    'modes', (select jsonb_object_agg(k, v2._ps_mode(v_class, k)) from unnest(v2._ps_kinds()) k),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'body', p.body, 'at', p.send_at, 'teacherName', v2._ph_name(p.author_id),
               'private', p.audience = 'students', 'ackRequired', p.ack_required, 'readAt', r.read_at, 'ackedAt', r.acked_at) order by p.send_at desc)
        from (select * from v2.parent_posts x
               where x.class_id = v_class and x.recalled_at is null and x.send_at <= now()
                 and (x.audience = 'class' or p_child = any (x.student_ids))
               order by x.send_at desc limit 60) p
        left join v2.parent_post_reads r on r.post_id = p.id and r.parent_id = auth.uid()), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(i.j || jsonb_build_object('note', i.note, 'sentAt', i.at, 'teacherName', v2._ph_name(i.by_id)) order by i.at desc)
        from (select v2._ps_item(r.kind, r.ref_id) as j, r.note, r.at, r.by_id from v2.parent_releases r
               where r.student_id = p_child and r.state = 'sent' and r.at > now() - interval '60 days'
               order by r.at desc limit 60) i
       where i.j is not null), '[]'::jsonb),
    'thread', jsonb_build_object(
      'unread', (select count(*) from v2.parent_messages m where m.student_id = p_child and m.from_teacher and m.read_at is null and m.deleted_at is null),
      'last', (select jsonb_build_object('body', m.body, 'at', m.created_at, 'fromTeacher', m.from_teacher, 'senderName', v2._ph_name(m.sender_id))
                 from v2.parent_messages m where m.student_id = p_child and m.deleted_at is null order by m.created_at desc limit 1)),
    'msg', v2._ps_msg_json(v_class),
    'teachers', coalesce((select jsonb_agg(v2._ph_name(t)) from unnest(v2._ph_teachers(v_class)) t), '[]'::jsonb));
end $$;

create or replace function v2.parent_post_read(p_post uuid, p_ack boolean default false) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare v_row v2.parent_posts;
begin
  select * into v_row from v2.parent_posts where id = p_post and recalled_at is null and send_at <= now();
  if not found or not exists (select 1 from v2.guardian_links g where g.parent_id = auth.uid() and g.student_id = any (v2._post_targets(v_row))) then
    raise exception 'Không tìm thấy thông báo.' using errcode = '42501';
  end if;
  insert into v2.parent_post_reads as r (post_id, parent_id, read_at, acked_at)
  values (p_post, auth.uid(), now(), case when p_ack then now() end)
  on conflict (post_id, parent_id) do update set acked_at = coalesce(r.acked_at, excluded.acked_at);
  update v2.notifications set read_at = now() where user_id = auth.uid() and kind = 'ph-thong-bao' and ref ->> 'postId' = p_post::text and read_at is null;
  return (select jsonb_build_object('readAt', r.read_at, 'ackedAt', r.acked_at) from v2.parent_post_reads r where r.post_id = p_post and r.parent_id = auth.uid());
end $$;

-- Danh sách cuộc trò chuyện của lớp (GV): mỗi em một dòng.
create or replace function v2.parent_threads(p_class text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ giáo viên của lớp xem được tin nhắn.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(t.j order by (t.j ->> 'unread')::int desc, t.last_at desc nulls last, t.j ->> 'studentName')
    from (
      select jsonb_build_object(
               'studentId', s, 'studentName', v2._ph_name(s),
               'parents', (select count(*) from v2.guardian_links g where g.student_id = s),
               'unread', (select count(*) from v2.parent_messages m where m.student_id = s and m.class_id = p_class and not m.from_teacher and m.read_at is null and m.deleted_at is null),
               'last', (select jsonb_build_object('body', m.body, 'at', m.created_at, 'fromTeacher', m.from_teacher, 'senderName', v2._ph_name(m.sender_id))
                          from v2.parent_messages m where m.student_id = s and m.class_id = p_class and m.deleted_at is null order by m.created_at desc limit 1)) as j,
             (select max(m.created_at) from v2.parent_messages m where m.student_id = s and m.class_id = p_class and m.deleted_at is null) as last_at
      from unnest(v2._ph_students(p_class)) s
    ) t), '[]'::jsonb);
end $$;

-- Một cuộc trò chuyện (GV của lớp hoặc phụ huynh của em); đánh dấu đã đọc phía người gọi.
create or replace function v2.parent_thread(p_student uuid, p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_class text := v2._class_of_student(p_student);
  v_teacher boolean := v2.is_teacher_of_class(v_class);
begin
  if not (v_teacher or v2.is_guardian_of(p_student)) then
    raise exception 'Không mở được cuộc trò chuyện này.' using errcode = '42501';
  end if;
  update v2.parent_messages set read_at = now()
   where student_id = p_student and read_at is null and deleted_at is null and from_teacher = not v_teacher;
  update v2.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and kind in ('ph-tin-nhan', 'gv-tin-nhan') and ref ->> 'studentId' = p_student::text;
  return jsonb_build_object(
    'studentId', p_student, 'studentName', v2._ph_name(p_student), 'classId', v_class,
    'className', (select c.name from v2.classes c where c.id = v_class),
    'asTeacher', v_teacher,
    'parents', coalesce((select jsonb_agg(jsonb_build_object('id', g.parent_id, 'name', v2._ph_name(g.parent_id), 'relation', g.relation) order by g.created_at)
                         from v2.guardian_links g where g.student_id = p_student), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(v2._ph_name(t)) from unnest(v2._ph_teachers(v_class)) t), '[]'::jsonb),
    'msg', v2._ps_msg_json(v_class),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'body', case when m.deleted_at is null then m.body else '' end, 'deleted', m.deleted_at is not null,
               'fromTeacher', m.from_teacher, 'senderId', m.sender_id, 'senderName', v2._ph_name(m.sender_id), 'mine', m.sender_id = auth.uid(),
               'at', m.created_at, 'readAt', m.read_at, 'postId', m.post_id,
               'postTitle', (select p.title from v2.parent_posts p where p.id = m.post_id)) order by m.created_at)
        from (select * from v2.parent_messages x where x.student_id = p_student and x.class_id = v_class
               order by x.created_at desc limit greatest(1, least(coalesce(p_limit, 200), 500))) m), '[]'::jsonb));
end $$;

create or replace function v2.parent_message_send(p_student uuid, p_body text, p_post uuid default null) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_class text := v2._class_of_student(p_student);
  v_teacher boolean := v2.is_teacher_of_class(v_class);
  v_body text := btrim(coalesce(p_body, ''));
  v_row v2.parent_messages;
  v_msg jsonb := v2._ps_msg_json(v_class);
begin
  if v_class is null or not (v_teacher or v2.is_guardian_of(p_student)) then
    raise exception 'Không gửi được tin nhắn về em này.' using errcode = '42501';
  end if;
  if length(v_body) = 0 then raise exception 'Tin nhắn đang trống.' using errcode = '22023'; end if;
  if length(v_body) > 2000 then raise exception 'Tin nhắn tối đa 2000 kí tự.' using errcode = '22023'; end if;
  if not v_teacher then
    if not (v_msg ->> 'enabled')::boolean then
      raise exception 'Lớp đang tắt nhắn tin với thầy/cô.' using errcode = '42501';
    end if;
    if (select count(*) from v2.parent_messages m where m.sender_id = auth.uid() and m.created_at > now() - interval '1 day') >= 30 then
      raise exception 'Mỗi ngày gửi tối đa 30 tin nhắn.' using errcode = '22023';
    end if;
  end if;
  if p_post is not null and not exists (select 1 from v2.parent_posts p where p.id = p_post and p.class_id = v_class) then
    p_post := null;
  end if;
  insert into v2.parent_messages (class_id, student_id, sender_id, from_teacher, body, post_id)
  values (v_class, p_student, auth.uid(), v_teacher, v_body, p_post)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'body', v_row.body, 'fromTeacher', v_row.from_teacher, 'senderId', v_row.sender_id,
                            'senderName', v2._ph_name(v_row.sender_id), 'mine', true, 'at', v_row.created_at, 'readAt', null,
                            'deleted', false, 'postId', v_row.post_id, 'msgOpen', (v_msg ->> 'open')::boolean);
end $$;

create or replace function v2.parent_message_delete(p_id uuid) returns void
language plpgsql security definer set search_path = v2, public as $$
begin
  update v2.parent_messages set deleted_at = now() where id = p_id and sender_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Chỉ gỡ được tin nhắn của mình.' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Thông báo
-- ---------------------------------------------------------------------------
create table if not exists v2.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references v2.profiles (id) on delete cascade,
  kind text not null check (length(kind) between 1 and 40),
  title text not null check (length(title) <= 200),
  body text not null default '' check (length(body) <= 500),
  link text check (link is null or length(link) <= 300),
  ref jsonb not null default '{}'::jsonb,
  grp text check (grp is null or length(grp) <= 120),
  count int not null default 1,
  sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  push_state text not null default 'none' check (push_state in ('none', 'pending', 'sending', 'sent', 'failed')),
  push_after timestamptz,
  push_tries smallint not null default 0
);
create index if not exists notifications_user on v2.notifications (user_id, id desc);
create index if not exists notifications_unread on v2.notifications (user_id) where read_at is null;
create index if not exists notifications_grp on v2.notifications (user_id, grp) where read_at is null and grp is not null;
create index if not exists notifications_push on v2.notifications (push_after) where push_state = 'pending';
create index if not exists notifications_sending on v2.notifications (updated_at) where push_state = 'sending';
alter table v2.notifications enable row level security;
drop policy if exists notifications_read on v2.notifications;
create policy notifications_read on v2.notifications for select to authenticated using (user_id = (select auth.uid()));

create table if not exists v2.notify_prefs (
  user_id uuid primary key references v2.profiles (id) on delete cascade,
  push_off text[] not null default '{}',
  quiet_from time default '21:00',
  quiet_to time default '06:30',
  show_sensitive boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table v2.notify_prefs enable row level security;

create table if not exists v2.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references v2.profiles (id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 8 and 100),
  app text not null default 'hoc' check (app in ('hoc', 'gv')),
  ua text check (ua is null or length(ua) <= 300),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fails smallint not null default 0,
  unique (endpoint, user_id)
);
create index if not exists push_subscriptions_user on v2.push_subscriptions (user_id);
alter table v2.push_subscriptions enable row level security;

-- Cấu hình đẩy: URL hàm push, khoá VAPID (hàm push tự sinh lần đầu), mã gọi nội bộ. Chỉ service role đọc.
create table if not exists v2.push_config (
  id smallint primary key default 1 check (id = 1),
  url text,
  public_key text,
  private_key text,
  subject text,
  hook_token text not null default replace(gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);
alter table v2.push_config enable row level security;
revoke all on v2.push_config from anon, authenticated;

create table if not exists v2.notify_sent (
  key text primary key check (length(key) <= 200),
  at timestamptz not null default now()
);
alter table v2.notify_sent enable row level security;
revoke all on v2.notify_sent from anon, authenticated;

create or replace function v2._once(p_key text) returns boolean
language plpgsql security definer set search_path = v2, public as $$
begin
  insert into v2.notify_sent (key) values (p_key) on conflict (key) do nothing;
  return found;
end $$;

-- Tạo thông báo cho nhiều người. p_title có thể chứa %s (số tin khi gộp theo p_grp).
create or replace function v2._notify(
  p_users uuid[], p_kind text, p_title text, p_body text default '', p_link text default null, p_ref jsonb default '{}'::jsonb,
  p_sensitive boolean default false, p_grp text default null, p_after timestamptz default null, p_now boolean default false
) returns int
language plpgsql security definer set search_path = v2, public as $$
declare
  u uuid; n int := 0; v_id bigint;
  v_pref v2.notify_prefs; v_has boolean;
  v_push boolean; v_after timestamptz;
begin
  for u in select distinct x from unnest(p_users) x where x is not null loop
    select * into v_pref from v2.notify_prefs where user_id = u;
    v_has := found;
    v_push := exists (select 1 from v2.push_subscriptions s where s.user_id = u)
              and not (p_kind = any (coalesce(v_pref.push_off, '{}')));
    v_after := case when p_now then now()
                    when v_has then v2._quiet_until(v_pref.quiet_from, v_pref.quiet_to, now())
                    else v2._quiet_until('21:00', '06:30', now()) end;
    v_after := greatest(v_after, coalesce(p_after, v_after));
    v_id := null;
    if p_grp is not null then
      update v2.notifications nt set
        count = nt.count + 1,
        title = left(replace(p_title, '%s', (nt.count + 1)::text), 200),
        body = left(coalesce(p_body, ''), 500),
        link = coalesce(p_link, nt.link),
        ref = nt.ref || coalesce(p_ref, '{}'::jsonb),
        updated_at = now(),
        push_after = case when v_push and nt.push_state in ('none', 'sent', 'failed') and nt.updated_at < now() - interval '30 minutes' then v_after else nt.push_after end,
        push_state = case when v_push and nt.push_state in ('none', 'sent', 'failed') and nt.updated_at < now() - interval '30 minutes' then 'pending' else nt.push_state end
       where nt.id = (select x.id from v2.notifications x where x.user_id = u and x.grp = p_grp and x.read_at is null
                        and x.created_at > now() - interval '12 hours' order by x.id desc limit 1)
      returning nt.id into v_id;
    end if;
    if v_id is null then
      insert into v2.notifications (user_id, kind, title, body, link, ref, grp, sensitive, push_state, push_after)
      values (u, p_kind, left(replace(p_title, '%s', '1'), 200), left(coalesce(p_body, ''), 500), p_link, coalesce(p_ref, '{}'::jsonb),
              p_grp, p_sensitive, case when v_push then 'pending' else 'none' end, case when v_push then v_after end);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---- RPC cho mọi người dùng -------------------------------------------------
create or replace function v2.notify_list(p_limit int default 50, p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  return jsonb_build_object(
    'unread', (select count(*) from v2.notifications n where n.user_id = auth.uid() and n.read_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link', n.link, 'ref', n.ref,
               'count', n.count, 'at', n.updated_at, 'readAt', n.read_at) order by n.updated_at desc, n.id desc)
        from (select * from v2.notifications x where x.user_id = auth.uid() and (p_before is null or x.id < p_before)
               order by x.updated_at desc, x.id desc limit greatest(1, least(coalesce(p_limit, 50), 200))) n), '[]'::jsonb));
end $$;

create or replace function v2.notify_unread() returns int
language sql stable security definer set search_path = v2, public as $$
  select count(*)::int from v2.notifications n where n.user_id = auth.uid() and n.read_at is null
$$;

create or replace function v2.notify_read(p_ids bigint[] default null) returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int;
begin
  perform v2._require_user();
  update v2.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function v2._prefs_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'pushOff', to_jsonb(coalesce(p.push_off, '{}'::text[])),
    'quietFrom', case when p.user_id is null then '21:00' else to_char(p.quiet_from, 'HH24:MI') end,
    'quietTo', case when p.user_id is null then '06:30' else to_char(p.quiet_to, 'HH24:MI') end,
    'showSensitive', coalesce(p.show_sensitive, false),
    'devices', (select count(*) from v2.push_subscriptions s where s.user_id = p_user))
  from (select 1) x left join v2.notify_prefs p on p.user_id = p_user
$$;

create or replace function v2.notify_prefs_get() returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  return v2._prefs_json(auth.uid());
end $$;

create or replace function v2.notify_prefs_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_off text[];
  v_from time; v_to time;
  v_cur v2.notify_prefs;
begin
  perform v2._require_user();
  select * into v_cur from v2.notify_prefs where user_id = auth.uid();
  if not found then v_cur.quiet_from := '21:00'; v_cur.quiet_to := '06:30'; v_cur.push_off := '{}'; v_cur.show_sensitive := false; end if;
  v_off := v_cur.push_off;
  if p ? 'pushOff' then
    select coalesce(array_agg(distinct x), '{}') into v_off from jsonb_array_elements_text(p -> 'pushOff') x where length(x) between 1 and 40;
  end if;
  v_from := v_cur.quiet_from; v_to := v_cur.quiet_to;
  begin
    if p ? 'quietFrom' then v_from := nullif(p ->> 'quietFrom', '')::time; end if;
    if p ? 'quietTo' then v_to := nullif(p ->> 'quietTo', '')::time; end if;
  exception when others then raise exception 'Giờ yên lặng chưa đúng (dạng 21:00).' using errcode = '22023';
  end;
  if (v_from is null) <> (v_to is null) then raise exception 'Cần cả giờ bắt đầu và giờ kết thúc.' using errcode = '22023'; end if;
  insert into v2.notify_prefs as np (user_id, push_off, quiet_from, quiet_to, show_sensitive, updated_at)
  values (auth.uid(), v_off, v_from, v_to, coalesce((p ->> 'showSensitive')::boolean, v_cur.show_sensitive), now())
  on conflict (user_id) do update set push_off = excluded.push_off, quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to,
    show_sensitive = excluded.show_sensitive, updated_at = now();
  return v2._prefs_json(auth.uid());
end $$;

create or replace function v2.push_subscribe(p jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_ep text := btrim(coalesce(p ->> 'endpoint', ''));
begin
  perform v2._require_user();
  if v_ep !~ '^https://' or length(v_ep) > 1000 then raise exception 'Địa chỉ nhận thông báo chưa đúng.' using errcode = '22023'; end if;
  if length(coalesce(p ->> 'p256dh', '')) not between 40 and 200 or length(coalesce(p ->> 'auth', '')) not between 8 and 100 then
    raise exception 'Khoá nhận thông báo chưa đúng.' using errcode = '22023';
  end if;
  insert into v2.push_subscriptions as s (user_id, endpoint, p256dh, auth, app, ua)
  values (auth.uid(), v_ep, p ->> 'p256dh', p ->> 'auth', case when p ->> 'app' = 'gv' then 'gv' else 'hoc' end, left(p ->> 'ua', 300))
  on conflict (endpoint, user_id) do update set p256dh = excluded.p256dh, auth = excluded.auth, app = excluded.app, ua = excluded.ua, fails = 0;
  -- Mỗi người tối đa 10 máy: bỏ máy cũ nhất.
  delete from v2.push_subscriptions s where s.user_id = auth.uid() and s.id in (
    select x.id from v2.push_subscriptions x where x.user_id = auth.uid() order by x.created_at desc offset 10);
  return v2._prefs_json(auth.uid());
end $$;

create or replace function v2.push_unsubscribe(p_endpoint text default null) returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int;
begin
  perform v2._require_user();
  delete from v2.push_subscriptions where user_id = auth.uid() and (p_endpoint is null or endpoint = p_endpoint);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function v2.push_info() returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'ready', coalesce((select c.url is not null from v2.push_config c where c.id = 1), false),
    'publicKey', (select c.public_key from v2.push_config c where c.id = 1),
    'devices', (select count(*) from v2.push_subscriptions s where s.user_id = auth.uid()))
$$;

create or replace function v2.notify_test() returns int
language plpgsql security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  return v2._notify(array[auth.uid()], 'thu', 'Thông báo thử của OPEN-EDU', 'Thấy dòng này là máy đã nhận được thông báo.', '/', '{}'::jsonb,
                    false, null, null, true);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Sự kiện → thông báo (trigger không bao giờ làm hỏng thao tác chính)
-- ---------------------------------------------------------------------------
create or replace function v2._parent_post_notify(p_id uuid) returns void
language plpgsql security definer set search_path = v2, public as $$
declare
  v_row v2.parent_posts;
  v_students uuid[];
  v_title text;
begin
  select * into v_row from v2.parent_posts where id = p_id and notified_at is null and recalled_at is null and send_at <= now() for update;
  if not found then return; end if;
  v_students := v2._post_targets(v_row);
  v_title := v2._ph_name(v_row.author_id) || ': ' || v_row.title;
  if v_row.audience = 'students' and cardinality(v_students) = 1 then
    v_title := v2._ph_name(v_row.author_id) || ' (về ' || v2._ph_name(v_students[1]) || '): ' || v_row.title;
  end if;
  perform v2._notify(v2._ph_guardians(v_students), 'ph-thong-bao', v_title, left(v_row.body, 160), '/phu-huynh?tin=' || v_row.id,
                     jsonb_build_object('postId', v_row.id, 'classId', v_row.class_id));
  update v2.parent_posts set notified_at = now() where id = p_id;
end $$;

create or replace function v2._trg_parent_post() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  begin
    if new.send_at <= now() then perform v2._parent_post_notify(new.id); end if;
  exception when others then raise warning 'thông báo (parent_posts): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists parent_posts_notify on v2.parent_posts;
create trigger parent_posts_notify after insert on v2.parent_posts for each row execute function v2._trg_parent_post();

create or replace function v2._trg_parent_message() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare
  v_s text; v_msg jsonb;
begin
  begin
    v_s := v2._ph_name(new.student_id);
    if new.from_teacher then
      perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-tin-nhan', v2._ph_name(new.sender_id) || ' nhắn về ' || v_s,
                         left(new.body, 160), '/phu-huynh/nhan-tin?con=' || new.student_id,
                         jsonb_build_object('studentId', new.student_id), false, 'msg:' || new.student_id);
    else
      select jsonb_build_object('from', coalesce(s.msg_from, '06:30'::time), 'to', coalesce(s.msg_to, '21:00'::time)) into v_msg
        from (select 1) x left join v2.parent_share_settings s on s.class_id = new.class_id;
      perform v2._notify(v2._ph_teachers(new.class_id), 'gv-tin-nhan', v2._ph_name(new.sender_id) || ' (phụ huynh ' || v_s || ')',
                         left(new.body, 160), '/phu-huynh?the=tin-nhan&em=' || new.student_id,
                         jsonb_build_object('studentId', new.student_id), false, 'pmsg:' || new.student_id,
                         v2._quiet_until((v_msg ->> 'to')::time, (v_msg ->> 'from')::time, now()));
    end if;
  exception when others then raise warning 'thông báo (parent_messages): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists parent_messages_notify on v2.parent_messages;
create trigger parent_messages_notify after insert on v2.parent_messages for each row execute function v2._trg_parent_message();

create or replace function v2._ps_notify_kind(p_kind text) returns text
language sql immutable as $$
  select case p_kind when 'works' then 'ph-bai-viet' when 'tt27' then 'ph-tt27' when 'praise' then 'ph-khen'
                     when 'reminders' then 'ph-nhac-nho' when 'attendance' then 'ph-chuyen-can' else 'ph-thong-bao' end
$$;

create or replace function v2._trg_parent_release() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare v_item jsonb;
begin
  begin
    if new.state = 'sent' and (tg_op = 'INSERT' or old.state is distinct from 'sent') then
      v_item := v2._ps_item(new.kind, new.ref_id);
      if v_item is not null then
        perform v2._notify(v2._ph_guardians(array[new.student_id]), v2._ps_notify_kind(new.kind),
                           v2._ph_name(new.student_id) || ': ' || (v_item ->> 'title'),
                           coalesce(new.note, v_item ->> 'detail', ''), '/phu-huynh',
                           jsonb_build_object('studentId', new.student_id, 'kind', new.kind, 'refId', new.ref_id),
                           new.kind in ('reminders', 'attendance'));
      end if;
    end if;
  exception when others then raise warning 'thông báo (parent_releases): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists parent_releases_notify on v2.parent_releases;
create trigger parent_releases_notify after insert or update on v2.parent_releases for each row execute function v2._trg_parent_release();

create or replace function v2._trg_post_ack() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare
  v_row v2.parent_posts; v_parents uuid[]; v_acked int;
begin
  begin
    if new.acked_at is not null and (tg_op = 'INSERT' or old.acked_at is null) then
      select * into v_row from v2.parent_posts where id = new.post_id;
      if found and v_row.ack_required and v_row.author_id is not null then
        v_parents := v2._ph_guardians(v2._post_targets(v_row));
        select count(*) into v_acked from v2.parent_post_reads r where r.post_id = new.post_id and r.acked_at is not null and r.parent_id = any (v_parents);
        if v_acked >= cardinality(v_parents) and cardinality(v_parents) > 0 and v2._once('ack:' || new.post_id) then
          perform v2._notify(array[v_row.author_id], 'gv-xac-nhan', 'Đủ ' || v_acked || ' phụ huynh đã xác nhận', v_row.title,
                             '/phu-huynh?the=da-gui', jsonb_build_object('postId', v_row.id));
        end if;
      end if;
    end if;
  exception when others then raise warning 'thông báo (xác nhận): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists parent_post_reads_notify on v2.parent_post_reads;
create trigger parent_post_reads_notify after insert or update of acked_at on v2.parent_post_reads for each row execute function v2._trg_post_ack();

create or replace function v2._trg_attendance_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  begin
    if new.status <> 'co-mat' and (tg_op = 'INSERT' or old.status is distinct from new.status)
       and new.date >= v2.today_vn() - 1 and v2._ps_mode(new.class_id, 'attendance') = 'auto' then
      perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-chuyen-can',
                         v2._ph_name(new.student_id) || ': ' || v2._ps_att_label(new.status) || ' ngày ' || to_char(new.date, 'DD/MM'),
                         'Thầy/cô vừa điểm danh.', '/phu-huynh', jsonb_build_object('studentId', new.student_id, 'date', new.date), true);
    end if;
  exception when others then raise warning 'thông báo (điểm danh): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists attendance_notify on v2.attendance;
create trigger attendance_notify after insert or update of status on v2.attendance for each row execute function v2._trg_attendance_notify();

create or replace function v2._trg_submission_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare v_task text;
begin
  begin
    select coalesce(t.title, 'Bài viết') into v_task from v2.work_tasks t where t.id = new.task_id;
    v_task := coalesce(v_task, 'Bài viết');
    if new.submitted_by = 'student' and new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
      perform v2._notify(v2._ph_teachers(new.class_id), 'gv-nop-bai', '%s bài mới cần chấm: ' || v_task, v2._ph_name(new.student_id) || ' vừa nộp bài.',
                         '/cham-bai', jsonb_build_object('taskId', new.task_id), false, 'sub:' || new.task_id);
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      if new.status = 'approved' then
        perform v2._notify(array[new.student_id], 'hs-bai-cham', 'Thầy/cô đã chấm bài: ' || v_task, 'Em vào xem nhận xét của thầy/cô nhé.',
                           '/bai-viet/' || new.task_id, jsonb_build_object('taskId', new.task_id));
        if v2._ps_mode(new.class_id, 'works') = 'auto' then
          perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-bai-viet', v2._ph_name(new.student_id) || ': bài viết đã được chấm',
                             v_task, '/phu-huynh', jsonb_build_object('studentId', new.student_id, 'submissionId', new.id));
        end if;
      elsif new.status = 'returned' then
        perform v2._notify(array[new.student_id], 'hs-bai-cham', 'Thầy/cô trả bài để em sửa: ' || v_task, 'Em đọc lời thầy/cô dặn rồi nộp lại nhé.',
                           '/bai-viet/' || new.task_id, jsonb_build_object('taskId', new.task_id));
      end if;
    end if;
  exception when others then raise warning 'thông báo (bài viết): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists submissions_notify on v2.submissions;
create trigger submissions_notify after insert or update of status on v2.submissions for each row execute function v2._trg_submission_notify();

create or replace function v2._trg_tt27_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  begin
    if new.status = 'final' and (tg_op = 'INSERT' or old.status is distinct from 'final') and v2._ps_mode(new.class_id, 'tt27') = 'auto' then
      perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-tt27',
                         v2._ph_name(new.student_id) || ': kết quả đánh giá ' || v2._ps_term_label(new.term_id),
                         'Năm học ' || new.school_year, '/phu-huynh', jsonb_build_object('studentId', new.student_id));
    end if;
  exception when others then raise warning 'thông báo (TT27): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists tt27_notify on v2.tt27_evaluations;
create trigger tt27_notify after insert or update of status on v2.tt27_evaluations for each row execute function v2._trg_tt27_notify();

create or replace function v2._trg_behavior_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare
  v_kind text; v_label text;
begin
  begin
    if new.at < now() - interval '1 day' then return null; end if;
    v_kind := v2._ps_behavior_kind(new.class_id, new.behavior_id, new.points);
    select b.label into v_label from v2.behaviors b where b.class_id = new.class_id and b.id = new.behavior_id;
    v_label := coalesce(v_label, nullif(btrim(new.note), ''), case when v_kind = 'praise' then 'thi đua' else 'nề nếp' end);
    if v_kind = 'praise' then
      perform v2._notify(array[new.student_id], 'hs-khen', 'Em được thầy/cô khen: ' || v_label,
                         case when new.points > 0 then '+' || new.points || ' điểm thi đua' else '' end, '/toi', '{}'::jsonb);
      if v2._ps_mode(new.class_id, 'praise') = 'auto' then
        perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-khen', v2._ph_name(new.student_id) || ' được thầy/cô khen: ' || v_label,
                           coalesce(nullif(btrim(new.note), ''), ''), '/phu-huynh', jsonb_build_object('studentId', new.student_id));
      end if;
    elsif v2._ps_mode(new.class_id, 'reminders') = 'auto' then
      perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-nhac-nho', v2._ph_name(new.student_id) || ': thầy/cô nhắc nhở ' || v_label,
                         coalesce(nullif(btrim(new.note), ''), ''), '/phu-huynh', jsonb_build_object('studentId', new.student_id), true);
    end if;
  exception when others then raise warning 'thông báo (thi đua): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists behavior_logs_notify on v2.behavior_logs;
create trigger behavior_logs_notify after insert on v2.behavior_logs for each row execute function v2._trg_behavior_notify();

create or replace function v2._trg_note_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  begin
    if new.share_parent and (tg_op = 'INSERT' or not old.share_parent)
       and v2._ps_mode(v2._class_of_student(new.student_id), 'notes') = 'auto' then
      perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-ghi-chep', 'Thầy/cô ghi chép về ' || v2._ph_name(new.student_id),
                         new.title, '/phu-huynh', jsonb_build_object('studentId', new.student_id), true, 'note:' || new.student_id);
    end if;
  exception when others then raise warning 'thông báo (ghi chép): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists student_notes_notify on v2.student_notes;
create trigger student_notes_notify after insert or update of share_parent on v2.student_notes for each row execute function v2._trg_note_notify();

create or replace function v2._assignment_notify(p_id text) returns void
language plpgsql security definer set search_path = v2, public as $$
declare
  a v2.assignments;
  v_students uuid[];
begin
  select * into a from v2.assignments where id = p_id;
  if not found or a.open_at > now() + interval '1 minute' or not v2._once('asg:' || p_id) then return; end if;
  if cardinality(a.student_ids) > 0 then
    select coalesce(array_agg(x::uuid), '{}') into v_students from unnest(a.student_ids) x where x ~ '^[0-9a-fA-F-]{36}$';
  else
    v_students := v2._ph_students(a.class_id);
  end if;
  perform v2._notify(v_students, 'hs-bai-moi', case when a.parent_id is not null then 'Bài làm lại: ' else 'Bài mới: ' end || a.title,
                     case when a.due_at is not null then 'Hạn: ' || to_char(a.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') else 'Không có hạn' end,
                     case when a.target_type = 'lesson' then '/bai/' || a.target_id else '/' end,
                     jsonb_build_object('assignmentId', a.id), false, 'asg:' || a.class_id);
end $$;

create or replace function v2._trg_assignment_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  begin
    if new.open_at <= now() + interval '1 minute' then perform v2._assignment_notify(new.id); end if;
  exception when others then raise warning 'thông báo (giao bài): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists assignments_notify on v2.assignments;
create trigger assignments_notify after insert on v2.assignments for each row execute function v2._trg_assignment_notify();

create or replace function v2._trg_badge_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  begin
    perform v2._notify(array[new.user_id], 'hs-huy-hieu', 'Em nhận huy hiệu: ' || coalesce(new.title, new.badge_id), coalesce(new.note, ''),
                       '/qua', jsonb_build_object('badgeId', new.badge_id));
    if new.glyph = 'cup' and v2._ps_mode(v2._class_of_student(new.user_id), 'arena') = 'auto' then
      perform v2._notify(v2._ph_guardians(array[new.user_id]), 'ph-cup', v2._ph_name(new.user_id) || ' nhận cúp: ' || coalesce(new.title, 'Đấu trường'),
                         coalesce(new.note, ''), '/phu-huynh', jsonb_build_object('studentId', new.user_id));
    end if;
  exception when others then raise warning 'thông báo (huy hiệu): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists user_badges_notify on v2.user_badges;
create trigger user_badges_notify after insert on v2.user_badges for each row execute function v2._trg_badge_notify();

create or replace function v2._trg_cup_match_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare v_title text;
begin
  begin
    if new.status = 'open' and new.p1 is not null and new.p2 is not null
       and (tg_op = 'INSERT' or old.status is distinct from 'open' or old.p1 is distinct from new.p1 or old.p2 is distinct from new.p2) then
      select c.title into v_title from v2.cups c where c.id = new.cup_id;
      perform v2._notify(array[new.p1], 'hs-giai-dau', coalesce(v_title, 'Giải đấu') || ': đến lượt em đấu vòng ' || new.round,
                         'Gặp bạn ' || v2._ph_name(new.p2) || '.', '/choi/giai/' || new.cup_id, jsonb_build_object('cupId', new.cup_id), false,
                         null, new.opens_at);
      perform v2._notify(array[new.p2], 'hs-giai-dau', coalesce(v_title, 'Giải đấu') || ': đến lượt em đấu vòng ' || new.round,
                         'Gặp bạn ' || v2._ph_name(new.p1) || '.', '/choi/giai/' || new.cup_id, jsonb_build_object('cupId', new.cup_id), false,
                         null, new.opens_at);
    end if;
  exception when others then raise warning 'thông báo (trận giải): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists cup_matches_notify on v2.cup_matches;
create trigger cup_matches_notify after insert or update on v2.cup_matches for each row execute function v2._trg_cup_match_notify();

create or replace function v2._trg_cup_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  begin
    if new.created_by is null then return null; end if;
    if new.status = 'finished' and old.status is distinct from 'finished' then
      perform v2._notify(array[new.created_by], 'gv-giai-dau', 'Giải "' || new.title || '" đã kết thúc',
                         case when new.champion is not null then 'Vô địch: ' || v2._ph_name(new.champion) else '' end,
                         '/dau-truong/giai/' || new.id, jsonb_build_object('cupId', new.id), false, 'cup:' || new.id);
    elsif new.status = 'running' and new.round > coalesce(old.round, 0) and new.round > 1 then
      perform v2._notify(array[new.created_by], 'gv-giai-dau', 'Giải "' || new.title || '" sang vòng ' || new.round || '/' || new.rounds,
                         '', '/dau-truong/giai/' || new.id, jsonb_build_object('cupId', new.id), false, 'cup:' || new.id);
    end if;
  exception when others then raise warning 'thông báo (giải đấu): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists cups_notify on v2.cups;
create trigger cups_notify after update of status, round on v2.cups for each row execute function v2._trg_cup_notify();

create or replace function v2._trg_discussion_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare
  d v2.discussions; v_parent_author uuid;
begin
  begin
    select * into d from v2.discussions where id = new.discussion_id;
    if not found then return null; end if;
    if tg_op = 'INSERT' and new.status = 'pending' and new.author_id is distinct from d.created_by then
      perform v2._notify(v2._ph_teachers(d.class_id), 'gv-thao-luan', '%s bài thảo luận chờ duyệt', d.title,
                         '/thao-luan/' || d.id, jsonb_build_object('discussionId', d.id), false, 'disc:' || d.id);
    end if;
    if new.parent_id is not null and new.status = 'visible' and (tg_op = 'INSERT' or old.status is distinct from 'visible') then
      select p.author_id into v_parent_author from v2.discussion_posts p where p.id = new.parent_id;
      if v_parent_author is not null and v_parent_author <> new.author_id
         and exists (select 1 from v2.profiles pr where pr.id = v_parent_author and pr.role = 'student') then
        perform v2._notify(array[v_parent_author], 'hs-thao-luan', '%s bình luận mới cho bài của em', d.title,
                           '/thao-luan/' || d.id, jsonb_build_object('discussionId', d.id), false, 'reply:' || new.parent_id);
      end if;
    end if;
  exception when others then raise warning 'thông báo (thảo luận): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists discussion_posts_notify on v2.discussion_posts;
create trigger discussion_posts_notify after insert or update of status on v2.discussion_posts for each row execute function v2._trg_discussion_notify();

create or replace function v2._trg_discussion_report_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare d v2.discussions;
begin
  begin
    select x.* into d from v2.discussions x join v2.discussion_posts p on p.discussion_id = x.id where p.id = new.post_id;
    if found then
      perform v2._notify(v2._ph_teachers(d.class_id), 'gv-thao-luan', '%s bài bị báo cần thầy/cô xem', d.title,
                         '/thao-luan/' || d.id, jsonb_build_object('discussionId', d.id), false, 'report:' || d.id);
    end if;
  exception when others then raise warning 'thông báo (báo thầy/cô): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists discussion_reports_notify on v2.discussion_reports;
create trigger discussion_reports_notify after insert on v2.discussion_reports for each row execute function v2._trg_discussion_report_notify();

create or replace function v2._trg_guardian_link_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare v_class text := v2._class_of_student(new.student_id);
begin
  begin
    if v_class is not null then
      perform v2._notify(v2._ph_teachers(v_class), 'gv-lien-ket', '%s phụ huynh mới liên kết',
                         v2._ph_name(new.parent_id) || coalesce(' (' || new.relation || ')', '') || ' của ' || v2._ph_name(new.student_id),
                         '/phu-huynh?the=lien-ket', jsonb_build_object('studentId', new.student_id), false, 'link:' || v_class);
    end if;
  exception when others then raise warning 'thông báo (liên kết): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists guardian_links_notify on v2.guardian_links;
create trigger guardian_links_notify after insert on v2.guardian_links for each row execute function v2._trg_guardian_link_notify();

-- Nhắc hạn bài (bài học có hạn đến hết ngày mai mà em chưa học xong) — chạy 19:00 mỗi ngày.
create or replace function v2._due_notify() returns int
language plpgsql security definer set search_path = v2, public as $$
declare
  r record; n int := 0;
  v_end timestamptz := ((v2.today_vn() + 2)::timestamp) at time zone 'Asia/Ho_Chi_Minh';
begin
  for r in
    select a.id, a.title, a.class_id, a.target_id, a.due_at, s.sid
      from v2.assignments a
      cross join lateral unnest(case when cardinality(a.student_ids) > 0
                                     then (select coalesce(array_agg(x::uuid), '{}') from unnest(a.student_ids) x where x ~ '^[0-9a-fA-F-]{36}$')
                                     else v2._ph_students(a.class_id) end) as s(sid)
     where a.target_type = 'lesson' and a.due_at > now() and a.due_at <= v_end and a.open_at <= now()
       and not exists (select 1 from v2.lesson_progress lp where lp.user_id = s.sid and lp.lesson_id = a.target_id and lp.completed_at is not null)
  loop
    if not v2._once('due:' || r.id || ':' || r.sid) then continue; end if;
    perform v2._notify(array[r.sid], 'hs-han-bai', 'Sắp hết hạn: ' || r.title,
                       'Hạn ' || to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || '. Em làm nốt nhé!', '/bai/' || r.target_id,
                       jsonb_build_object('assignmentId', r.id), false, null, null, true);
    if v2._ps_mode(r.class_id, 'assignments') = 'auto' then
      perform v2._notify(v2._ph_guardians(array[r.sid]), 'ph-han-bai', v2._ph_name(r.sid) || ' chưa xong bài: ' || r.title,
                         'Hạn ' || to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || '.', '/phu-huynh',
                         jsonb_build_object('studentId', r.sid, 'assignmentId', r.id), false, null, null, true);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Bản tin tuần đã có — thứ Bảy 17:00.
create or replace function v2._week_notify() returns int
language plpgsql security definer set search_path = v2, public as $$
declare r record; n int := 0;
begin
  for r in select g.parent_id, g.student_id from v2.guardian_links g loop
    if v2._ps_mode(v2._class_of_student(r.student_id), 'study') <> 'auto' then continue; end if;
    perform v2._notify(array[r.parent_id], 'ph-ban-tin', 'Bản tin tuần của ' || v2._ph_name(r.student_id) || ' đã có',
                       'Xem con học thế nào trong tuần.', '/phu-huynh', jsonb_build_object('studentId', r.student_id), false, null, null, true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Thông báo đẩy: pg_net gọi hàm push; pg_cron mỗi phút
-- ---------------------------------------------------------------------------
do $$ begin
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    create extension if not exists pg_net;
  end;
exception when others then raise notice 'Chưa bật được pg_net (%): bật trong Dashboard → Database → Extensions rồi chạy lại tệp này.', sqlerrm;
end $$;

create or replace function v2._push_kick() returns void
language plpgsql security definer set search_path = v2, public as $$
declare c v2.push_config;
begin
  select * into c from v2.push_config where id = 1;
  if c.url is null or to_regnamespace('net') is null then return; end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 8000)'
    using c.url, jsonb_build_object('Content-Type', 'application/json', 'x-openedu-push', c.hook_token);
exception when others then raise warning 'Chưa gọi được hàm push: %', sqlerrm;
end $$;

create or replace function v2._trg_push_kick() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  if exists (select 1 from v2.notifications where push_state = 'pending' and push_after <= now()) then
    perform v2._push_kick();
  end if;
  return null;
end $$;
drop trigger if exists notifications_kick_ins on v2.notifications;
create trigger notifications_kick_ins after insert on v2.notifications for each statement execute function v2._trg_push_kick();
drop trigger if exists notifications_kick_upd on v2.notifications;
create trigger notifications_kick_upd after update of push_state on v2.notifications for each statement execute function v2._trg_push_kick();

-- Chạy mỗi phút (pg_cron): tin hẹn giờ, bài mở hẹn giờ, nhắc hạn 19:00, bản tin tuần thứ Bảy 17:00, gửi lại, dọn dẹp.
create or replace function v2.notify_tick() returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  r record;
  v_local timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_posts int := 0; v_asg int := 0; v_due int := 0; v_week int := 0;
begin
  for r in select id from v2.parent_posts where notified_at is null and recalled_at is null and send_at <= now() order by send_at limit 200 loop
    perform v2._parent_post_notify(r.id); v_posts := v_posts + 1;
  end loop;
  for r in select a.id from v2.assignments a
            where a.open_at <= now() and a.open_at > now() - interval '1 hour'
              and not exists (select 1 from v2.notify_sent s where s.key = 'asg:' || a.id) loop
    perform v2._assignment_notify(r.id); v_asg := v_asg + 1;
  end loop;
  if v_local::time >= '19:00' and v2._once('job:due:' || v_local::date) then v_due := v2._due_notify(); end if;
  if extract(isodow from v_local) = 6 and v_local::time >= '17:00' and v2._once('job:week:' || v_local::date) then v_week := v2._week_notify(); end if;
  update v2.notifications set push_state = 'pending', push_after = now() where push_state = 'sending' and updated_at < now() - interval '10 minutes';
  -- Tin quá 2 ngày chưa đẩy được (hàm push chưa triển khai, máy tắt lâu…): thôi đẩy, vẫn nằm trong chuông.
  update v2.notifications set push_state = 'failed' where push_state = 'pending' and created_at < now() - interval '2 days';
  if v_local::time >= '03:00' and v2._once('job:clean:' || v_local::date) then
    delete from v2.notifications where (read_at is not null and created_at < now() - interval '60 days') or created_at < now() - interval '120 days';
    delete from v2.notify_sent where at < now() - interval '120 days';
  end if;
  if exists (select 1 from v2.notifications where push_state = 'pending' and push_after <= now()) then perform v2._push_kick(); end if;
  return jsonb_build_object('posts', v_posts, 'assignments', v_asg, 'due', v_due, 'week', v_week);
end $$;

do $$ begin
  begin
    create extension if not exists pg_cron;
  exception when others then raise notice 'pg_cron không có ở máy này (%). Thông báo hẹn giờ cần chạy "select v2.notify_tick();".', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'openedu-notify-tick';
    perform cron.schedule('openedu-notify-tick', '* * * * *', 'select v2.notify_tick()');
  end if;
exception when others then raise notice 'Chưa đặt được lịch pg_cron cho thông báo: %', sqlerrm;
end $$;

-- ---- RPC cho Edge Function `push` (service role) ---------------------------
create or replace function v2.push_keys_get() returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object('publicKey', c.public_key, 'privateKey', c.private_key, 'subject', c.subject, 'hookToken', c.hook_token, 'url', c.url)
  from (select 1) x left join v2.push_config c on c.id = 1
$$;

create or replace function v2.push_keys_set(p_public text, p_private text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
begin
  insert into v2.push_config as c (id, public_key, private_key) values (1, p_public, p_private)
  on conflict (id) do update set public_key = coalesce(c.public_key, excluded.public_key), private_key = coalesce(c.private_key, excluded.private_key),
    updated_at = now();
  return v2.push_keys_get();
end $$;

-- Chạy trong SQL Editor sau khi triển khai hàm push.
create or replace function v2.push_setup(p_url text, p_subject text default null) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
begin
  if p_url !~ '^https://[^/]+/functions/v1/push$' then
    raise exception 'Địa chỉ cần có dạng https://<ref>.supabase.co/functions/v1/push' using errcode = '22023';
  end if;
  insert into v2.push_config as c (id, url, subject) values (1, p_url, p_subject)
  on conflict (id) do update set url = excluded.url, subject = coalesce(excluded.subject, c.subject), updated_at = now();
  return jsonb_build_object('url', p_url, 'ok', true);
end $$;

create or replace function v2.push_claim(p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare v jsonb;
begin
  with c as (
    select n.id from v2.notifications n
     where n.push_state = 'pending' and n.push_after <= now()
     order by n.id limit greatest(1, least(coalesce(p_limit, 100), 500))
     for update skip locked
  ), u as (
    update v2.notifications n set push_state = 'sending', push_tries = n.push_tries + 1, updated_at = now()
      from c where n.id = c.id
    returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'userId', u.user_id, 'kind', u.kind, 'title', u.title, 'body', u.body, 'link', u.link,
      'sensitive', u.sensitive, 'count', u.count, 'tag', coalesce(u.grp, u.kind || ':' || u.id),
      'showSensitive', coalesce((select pr.show_sensitive from v2.notify_prefs pr where pr.user_id = u.user_id), false),
      'name', v2._ph_name(u.user_id),
      'badge', (select count(*) from v2.notifications x where x.user_id = u.user_id and x.read_at is null),
      'subs', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'app', s.app,
                                 'shared', exists (select 1 from v2.push_subscriptions y where y.endpoint = s.endpoint and y.user_id <> s.user_id)))
                        from v2.push_subscriptions s where s.user_id = u.user_id), '[]'::jsonb)
    ) order by u.id), '[]'::jsonb)
  into v from u;
  return v;
end $$;

-- p: {sent:[id], retry:[id], failed:[id], gone:[subId], ok:[subId]}
create or replace function v2.push_done(p jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_sent bigint[] := coalesce((select array_agg(x::bigint) from jsonb_array_elements_text(coalesce(p -> 'sent', '[]')) x), '{}');
  v_retry bigint[] := coalesce((select array_agg(x::bigint) from jsonb_array_elements_text(coalesce(p -> 'retry', '[]')) x), '{}');
  v_failed bigint[] := coalesce((select array_agg(x::bigint) from jsonb_array_elements_text(coalesce(p -> 'failed', '[]')) x), '{}');
  v_gone uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'gone', '[]')) x), '{}');
  v_ok uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'ok', '[]')) x), '{}');
begin
  update v2.notifications set push_state = 'sent' where id = any (v_sent) and push_state = 'sending';
  update v2.notifications set push_state = 'failed' where id = any (v_failed) and push_state = 'sending';
  update v2.notifications set push_state = case when push_tries >= 4 then 'failed' else 'pending' end,
         push_after = now() + make_interval(mins => 2 * push_tries)
   where id = any (v_retry) and push_state = 'sending';
  delete from v2.push_subscriptions where id = any (v_gone);
  update v2.push_subscriptions set last_ok_at = now(), fails = 0 where id = any (v_ok);
  return jsonb_build_object('sent', cardinality(v_sent), 'retry', cardinality(v_retry), 'gone', cardinality(v_gone));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Realtime + quyền gọi hàm
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['notifications', 'parent_messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'v2' and tablename = t) then
      execute format('alter publication supabase_realtime add table v2.%I', t);
    end if;
  end loop;
end $$;

grant select on v2.notifications, v2.parent_messages to authenticated;

do $$
declare r record;
begin
  -- Nội bộ: không ai gọi trực tiếp.
  for r in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'v2'::regnamespace and p.proname = any (array[
              '_class_of_student', '_ph_students', '_ph_teachers', '_ph_guardians', '_ph_name', '_ph_ddmm', '_quiet_until',
              '_ps_kinds', '_ps_kind_ok', '_ps_mode', '_ps_json', '_ps_term_label', '_ps_att_label', '_ps_item', '_ps_msg_json',
              '_post_targets', '_post_json', '_once', '_notify', '_prefs_json', '_parent_post_notify', '_ps_notify_kind',
              '_assignment_notify', '_due_notify', '_week_notify', '_push_kick',
              '_trg_parent_post', '_trg_parent_message', '_trg_parent_release', '_trg_post_ack', '_trg_attendance_notify',
              '_trg_submission_notify', '_trg_tt27_notify', '_trg_behavior_notify', '_trg_note_notify', '_trg_assignment_notify',
              '_trg_badge_notify', '_trg_cup_match_notify', '_trg_cup_notify', '_trg_discussion_notify', '_trg_discussion_report_notify',
              '_trg_guardian_link_notify', '_trg_push_kick', 'notify_tick', 'push_setup'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
  -- Người dùng đã đăng nhập.
  for r in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'v2'::regnamespace and p.proname = any (array[
              'ps_guardian_ok', '_ps_behavior_kind', 'can_view_user_k',
              'parent_share_get', 'parent_share_save', 'parent_queue', 'parent_release', 'parent_preview',
              'parent_post_create', 'parent_post_list', 'parent_post_detail', 'parent_post_recall', 'parent_post_remind',
              'parent_inbox', 'parent_post_read', 'parent_threads', 'parent_thread', 'parent_message_send', 'parent_message_delete',
              'notify_list', 'notify_unread', 'notify_read', 'notify_prefs_get', 'notify_prefs_save',
              'push_subscribe', 'push_unsubscribe', 'push_info', 'notify_test'])
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  -- Chỉ Edge Function (service role).
  for r in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'v2'::regnamespace and p.proname = any (array['push_keys_get', 'push_keys_set', 'push_claim', 'push_done'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function v2.notify_tick() to service_role';
  end if;
end $$;
