-- =============================================================================
-- OPEN-EDU · Migration Phase 4 · Bài làm + AI chấm, TT27, thi đua, điểm danh (docs/PHASE4_API.md)
--
-- Bảng: rubrics, work_tasks, submissions, ai_grades, grade_reviews, tt27_evaluations, behaviors, behavior_logs,
--       attendance (một dòng / HS / ngày). Bucket Storage `submissions` (riêng tư): <task_id>/<student_id>/<file>.
-- Nguyên tắc quyền:
--   • HS: đọc / nộp bài của mình; điểm & nhận xét (ai_grades, grade_reviews) CHỈ khi bài đã duyệt ('approved').
--   • GV của lớp: mọi thứ của lớp. Điểm AI chỉ do Edge Function `ai-grade` (service role) ghi; GV duyệt qua `ai-grade`
--     (action 'review') để server ghi learning_events + cộng sao + tính lại skill_mastery.
--   • Phụ huynh (guardian_links): chỉ bài đã duyệt, TT27 'final', thi đua, chuyên cần của con.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Mở rộng ràng buộc cũ
-- -----------------------------------------------------------------------------
alter table v2.learning_events drop constraint if exists learning_events_object_type_check;
alter table v2.learning_events add constraint learning_events_object_type_check
  check (object_type in ('slide', 'item', 'lesson', 'package', 'live', 'arena', 'remediation', 'work'));

alter table v2.reward_ledger drop constraint if exists reward_ledger_source_type_check;
alter table v2.reward_ledger add constraint reward_ledger_source_type_check
  check (source_type in ('item', 'lesson', 'live', 'arena', 'behavior', 'bonus', 'work'));

alter table v2.ai_usage drop constraint if exists ai_usage_bucket_check;
alter table v2.ai_usage add constraint ai_usage_bucket_check check (bucket in ('generate', 'encourage', 'grade'));

-- -----------------------------------------------------------------------------
-- Bảng
-- -----------------------------------------------------------------------------
create table if not exists v2.rubrics (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(btrim(title)) > 0),
  subject text not null,
  grade smallint not null check (grade between 1 and 5),
  max_score numeric(5, 2) not null default 10 check (max_score > 0),
  criteria jsonb not null default '[]' check (jsonb_typeof(criteria) = 'array'),
  model_answer text,
  skills text[] not null default '{}',
  ai_notes text,
  owner_id uuid default auth.uid() references v2.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists rubrics_owner_idx on v2.rubrics (owner_id);

create table if not exists v2.work_tasks (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(btrim(title)) > 0),
  prompt jsonb not null default '{}',              -- { text, image? }
  subject text not null,
  grade smallint not null check (grade between 1 and 5),
  rubric_id text not null references v2.rubrics (id) on delete restrict,
  class_id text not null references v2.classes (id) on delete cascade,
  student_ids text[] not null default '{}',        -- rỗng = cả lớp
  due_at timestamptz,
  allow_photo boolean not null default true,
  allow_text boolean not null default true,
  created_by uuid default auth.uid() references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (allow_photo or allow_text)
);
create index if not exists work_tasks_class_idx on v2.work_tasks (class_id, created_at desc);

create table if not exists v2.submissions (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references v2.work_tasks (id) on delete cascade,
  student_id uuid not null references v2.profiles (id) on delete cascade,
  class_id text not null references v2.classes (id) on delete cascade,
  kind text not null check (kind in ('photo', 'text', 'mixed')),
  text text check (text is null or length(text) <= 20000),
  images jsonb not null default '[]',              -- [{ path, width, height }] (url ký lúc đọc)
  submitted_by text not null default 'student' check (submitted_by in ('student', 'teacher')),
  submitter_id uuid default auth.uid() references v2.profiles (id) on delete set null,
  status text not null default 'submitted'
    check (status in ('submitted', 'grading', 'graded', 'needs-review', 'approved', 'returned', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists submissions_task_idx on v2.submissions (task_id, created_at desc);
create index if not exists submissions_student_idx on v2.submissions (student_id, created_at desc);
create index if not exists submissions_class_status_idx on v2.submissions (class_id, status);

create table if not exists v2.ai_grades (
  submission_id uuid primary key references v2.submissions (id) on delete cascade,
  data jsonb not null,                              -- AiGrade đầy đủ (contracts/assess.ts)
  total numeric(5, 2) not null,
  max numeric(5, 2) not null,
  level text not null check (level in ('T', 'H', 'C')),
  confidence real not null,
  flags text[] not null default '{}',
  model text not null,
  repairs text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists v2.grade_reviews (
  submission_id uuid primary key references v2.submissions (id) on delete cascade,
  teacher_id uuid references v2.profiles (id) on delete set null,
  final jsonb,                                      -- GradeFinal (bản chốt đã ghép)
  decision text not null check (decision in ('approved', 'edited', 'regrade', 'redo')),
  note text,
  at timestamptz not null default now()
);

create table if not exists v2.tt27_evaluations (
  student_id uuid not null references v2.profiles (id) on delete cascade,
  class_id text not null references v2.classes (id) on delete cascade,
  term_id text not null check (term_id in ('GK1', 'CK1', 'GK2', 'CN')),
  school_year text not null check (school_year ~ '^\d{4}-\d{4}$'),
  data jsonb not null,                              -- { subjects, qualities, competencies, generalComment }
  status text not null default 'draft' check (status in ('draft', 'final')),
  updated_by uuid default auth.uid() references v2.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (student_id, term_id, school_year)
);
create index if not exists tt27_class_idx on v2.tt27_evaluations (class_id, term_id, school_year);

create table if not exists v2.behaviors (
  class_id text not null references v2.classes (id) on delete cascade,
  id text not null,
  label text not null check (length(btrim(label)) > 0),
  points smallint not null check (points between -5 and 5),
  icon text not null default '⭐',
  kind text not null check (kind in ('positive', 'needs-work')),
  position smallint not null default 0,
  primary key (class_id, id)
);

create table if not exists v2.behavior_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.profiles (id) on delete cascade,
  class_id text not null references v2.classes (id) on delete cascade,
  behavior_id text not null,
  points smallint not null,
  note text,
  team_id text references v2.class_teams (id) on delete set null,
  at timestamptz not null default now(),
  by uuid references v2.profiles (id) on delete set null
);
create index if not exists behavior_logs_class_idx on v2.behavior_logs (class_id, at desc);
create index if not exists behavior_logs_student_idx on v2.behavior_logs (student_id, at desc);

create table if not exists v2.attendance (
  class_id text not null references v2.classes (id) on delete cascade,
  date date not null,
  student_id uuid not null references v2.profiles (id) on delete cascade,
  status text not null check (status in ('co-mat', 'vang-co-phep', 'vang-khong-phep', 'muon')),
  updated_by uuid default auth.uid() references v2.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (class_id, date, student_id)
);
create index if not exists attendance_student_idx on v2.attendance (student_id, date desc);

-- -----------------------------------------------------------------------------
-- Hàm hỗ trợ quyền
-- -----------------------------------------------------------------------------
create or replace function v2.task_visible_to_student(p_task text, p_student uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.work_tasks t
     where t.id = p_task
       and t.class_id in (select v2.class_ids_of(p_student))
       and (cardinality(t.student_ids) = 0 or p_student::text = any (t.student_ids))
  )
$$;

create or replace function v2.can_see_task(p_task text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.work_tasks t
     where t.id = p_task
       and (v2.is_teacher_of_class(t.class_id)
            or v2.task_visible_to_student(t.id, auth.uid())
            or exists (select 1 from v2.guardian_links g where g.parent_id = auth.uid() and v2.task_visible_to_student(t.id, g.student_id)))
  )
$$;

-- Xem điểm / nhận xét của một bài nộp: GV của lớp; HS / phụ huynh chỉ khi đã duyệt.
create or replace function v2.can_see_grade(p_submission uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.submissions s
     where s.id = p_submission
       and (v2.is_teacher_of_class(s.class_id)
            or (s.status = 'approved' and (s.student_id = auth.uid() or v2.is_guardian_of(s.student_id))))
  )
$$;

-- Lời nhắn "làm lại" (decision 'redo') HS thấy được khi bài ở trạng thái 'returned'.
create or replace function v2.can_see_review(p_submission uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.can_see_grade(p_submission) or exists (
    select 1 from v2.submissions s where s.id = p_submission and s.status = 'returned'
       and (s.student_id = auth.uid() or v2.is_guardian_of(s.student_id))
  )
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table v2.rubrics enable row level security;
alter table v2.work_tasks enable row level security;
alter table v2.submissions enable row level security;
alter table v2.ai_grades enable row level security;
alter table v2.grade_reviews enable row level security;
alter table v2.tt27_evaluations enable row level security;
alter table v2.behaviors enable row level security;
alter table v2.behavior_logs enable row level security;
alter table v2.attendance enable row level security;

-- rubrics: chỉ GV/admin (có bài mẫu); chủ rubric hoặc admin sửa.
drop policy if exists rubrics_read on v2.rubrics;
create policy rubrics_read on v2.rubrics for select to authenticated using ((select v2.is_staff()));
drop policy if exists rubrics_insert on v2.rubrics;
create policy rubrics_insert on v2.rubrics for insert to authenticated with check ((select v2.is_staff()) and (owner_id = (select auth.uid()) or (select v2.is_admin())));
drop policy if exists rubrics_update on v2.rubrics;
create policy rubrics_update on v2.rubrics for update to authenticated
  using (owner_id = (select auth.uid()) or (select v2.is_admin())) with check (owner_id = (select auth.uid()) or (select v2.is_admin()));
drop policy if exists rubrics_delete on v2.rubrics;
create policy rubrics_delete on v2.rubrics for delete to authenticated using (owner_id = (select auth.uid()) or (select v2.is_admin()));

-- work_tasks
drop policy if exists work_tasks_read on v2.work_tasks;
create policy work_tasks_read on v2.work_tasks for select to authenticated using (v2.can_see_task(id));
drop policy if exists work_tasks_write on v2.work_tasks;
create policy work_tasks_write on v2.work_tasks for all to authenticated
  using (v2.is_teacher_of_class(class_id)) with check (v2.is_teacher_of_class(class_id));

-- submissions: HS nộp của mình (status 'submitted'); GV nộp hộ HS của lớp. Đổi trạng thái: chỉ Edge Function.
drop policy if exists submissions_read on v2.submissions;
create policy submissions_read on v2.submissions for select to authenticated using (
  student_id = (select auth.uid())
  or v2.is_teacher_of_class(class_id)
  or (status = 'approved' and v2.is_guardian_of(student_id))
);
drop policy if exists submissions_insert on v2.submissions;
create policy submissions_insert on v2.submissions for insert to authenticated with check (
  status = 'submitted'
  and class_id = (select t.class_id from v2.work_tasks t where t.id = task_id)
  and (
    (student_id = (select auth.uid()) and submitted_by = 'student' and v2.task_visible_to_student(task_id, student_id))
    or (submitted_by = 'teacher' and v2.is_teacher_of_class(class_id) and v2.task_visible_to_student(task_id, student_id))
  )
);
drop policy if exists submissions_delete on v2.submissions;
create policy submissions_delete on v2.submissions for delete to authenticated using (
  v2.is_teacher_of_class(class_id) or (student_id = (select auth.uid()) and status = 'submitted')
);

drop policy if exists ai_grades_read on v2.ai_grades;
create policy ai_grades_read on v2.ai_grades for select to authenticated using (v2.can_see_grade(submission_id));
drop policy if exists grade_reviews_read on v2.grade_reviews;
create policy grade_reviews_read on v2.grade_reviews for select to authenticated using (v2.can_see_review(submission_id));

-- TT27: GV của lớp đọc/ghi; HS & phụ huynh chỉ đọc bản 'final'.
drop policy if exists tt27_read on v2.tt27_evaluations;
create policy tt27_read on v2.tt27_evaluations for select to authenticated using (
  v2.is_teacher_of_class(class_id)
  or (status = 'final' and (student_id = (select auth.uid()) or v2.is_guardian_of(student_id)))
);
drop policy if exists tt27_write on v2.tt27_evaluations;
create policy tt27_write on v2.tt27_evaluations for all to authenticated
  using (v2.is_teacher_of_class(class_id)) with check (v2.is_teacher_of_class(class_id));

-- behaviors: thành viên lớp / phụ huynh đọc; GV ghi.
drop policy if exists behaviors_read on v2.behaviors;
create policy behaviors_read on v2.behaviors for select to authenticated using (v2.can_see_class(class_id));
drop policy if exists behaviors_write on v2.behaviors;
create policy behaviors_write on v2.behaviors for all to authenticated
  using (v2.is_teacher_of_class(class_id)) with check (v2.is_teacher_of_class(class_id));

-- behavior_logs: GV lớp, chính HS, phụ huynh đọc; ghi / hoàn tác qua RPC (cộng / trừ sao cùng lúc).
drop policy if exists behavior_logs_read on v2.behavior_logs;
create policy behavior_logs_read on v2.behavior_logs for select to authenticated using (
  v2.is_teacher_of_class(class_id) or student_id = (select auth.uid()) or v2.is_guardian_of(student_id)
);

-- attendance: GV lớp đọc/ghi; HS & phụ huynh đọc dòng của mình / của con.
drop policy if exists attendance_read on v2.attendance;
create policy attendance_read on v2.attendance for select to authenticated using (
  v2.is_teacher_of_class(class_id) or student_id = (select auth.uid()) or v2.is_guardian_of(student_id)
);
drop policy if exists attendance_write on v2.attendance;
create policy attendance_write on v2.attendance for all to authenticated
  using (v2.is_teacher_of_class(class_id)) with check (v2.is_teacher_of_class(class_id));

-- GRANT
grant select on v2.rubrics, v2.work_tasks, v2.submissions, v2.ai_grades, v2.grade_reviews, v2.tt27_evaluations,
  v2.behaviors, v2.behavior_logs, v2.attendance to authenticated;
grant insert, update, delete on v2.rubrics, v2.work_tasks, v2.tt27_evaluations, v2.behaviors, v2.attendance to authenticated;
grant insert, delete on v2.submissions to authenticated;
grant all on v2.rubrics, v2.work_tasks, v2.submissions, v2.ai_grades, v2.grade_reviews, v2.tt27_evaluations,
  v2.behaviors, v2.behavior_logs, v2.attendance to service_role;

-- -----------------------------------------------------------------------------
-- RPC thi đua (cộng / hoàn tác sao cùng giao dịch)
-- -----------------------------------------------------------------------------
create or replace function v2.record_behavior(p_class text, p_behavior text, p_students uuid[], p_note text default null)
returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  b v2.behaviors;
  v_label text; v_points int; v_icon text;
  v_out jsonb := '[]'::jsonb;
  v_sid uuid;
  v_log v2.behavior_logs;
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ giáo viên của lớp mới ghi thi đua.' using errcode = '42501';
  end if;
  select * into b from v2.behaviors where class_id = p_class and id = p_behavior;
  if found then
    v_label := b.label; v_points := b.points; v_icon := b.icon;
  else
    -- Hành vi mặc định (packages/data/src/engagement.ts DEFAULT_BEHAVIORS) khi lớp chưa có danh sách riêng.
    select d.label, d.points, d.icon into v_label, v_points, v_icon from (values
      ('bh-phat-bieu', 'Hăng hái phát biểu', 1, '🙋'), ('bh-giup-ban', 'Giúp đỡ bạn', 2, '🤝'), ('bh-trat-tu', 'Giữ trật tự', 1, '🤫'),
      ('bh-hoan-thanh', 'Hoàn thành bài tập', 1, '✅'), ('bh-vo-sach', 'Vở sạch, chữ đẹp', 1, '✍️'), ('bh-trung-thuc', 'Trung thực', 2, '💎'),
      ('bh-quen-do', 'Quên đồ dùng học tập', -1, '🎒'), ('bh-noi-chuyen', 'Nói chuyện riêng', -1, '💬'), ('bh-chua-lam-bai', 'Chưa làm bài tập', -1, '📒')
    ) as d(id, label, points, icon) where d.id = p_behavior;
    if v_label is null then
      raise exception 'Không tìm thấy hành vi này.' using errcode = 'P0002';
    end if;
  end if;
  foreach v_sid in array coalesce(p_students, '{}') loop
    if not exists (select 1 from v2.class_ids_of(v_sid) c where c = p_class) then continue; end if;
    insert into v2.behavior_logs (student_id, class_id, behavior_id, points, note, team_id, by)
    values (v_sid, p_class, p_behavior, v_points, nullif(btrim(p_note), ''),
            (select m.team_id from v2.class_members m where m.class_id = p_class and m.user_id = v_sid), auth.uid())
    returning * into v_log;
    if v_points > 0 then
      perform v2._award(v_sid, v_points, v_points, v_points * 10, 'Thầy cô khen: ' || v_label, 'behavior', v_log.id::text,
                        'behavior:' || v_log.id::text, auth.uid());
    end if;
    v_out := v_out || jsonb_build_object('id', v_log.id, 'studentId', v_log.student_id, 'classId', v_log.class_id,
      'behaviorId', v_log.behavior_id, 'points', v_log.points, 'note', v_log.note, 'teamId', v_log.team_id, 'at', v_log.at, 'by', v_log.by);
  end loop;
  return v_out;
end $$;

create or replace function v2.undo_behavior(p_log uuid) returns void
language plpgsql security definer set search_path = v2, public as $$
declare v_class text;
begin
  select class_id into v_class from v2.behavior_logs where id = p_log;
  if v_class is null then
    raise exception 'Không tìm thấy lần ghi này.' using errcode = 'P0002';
  end if;
  if not v2.is_teacher_of_class(v_class) then
    raise exception 'Chỉ giáo viên của lớp mới hoàn tác được.' using errcode = '42501';
  end if;
  delete from v2.reward_ledger where dedupe_key = 'behavior:' || p_log::text;
  delete from v2.behavior_logs where id = p_log;
end $$;

-- Phần bổ sung cho hồ sơ HS / tóm tắt phụ huynh (client ghép với get_student_profile / get_parent_summary).
create or replace function v2.get_student_extras(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_class text;
  v_staff boolean := v2.is_teacher_of_student(p_user) or v2.is_admin();
begin
  if not (v2.can_view_user(p_user) or v2.is_admin()) then
    raise exception 'Không có quyền xem hồ sơ học sinh này.' using errcode = '42501';
  end if;
  select coalesce(p.class_id, (select m.class_id from v2.class_members m where m.user_id = p.id and m.role = 'student' limit 1))
    into v_class from v2.profiles p where p.id = p_user;
  return jsonb_build_object(
    'works', coalesce((
      select jsonb_agg(jsonb_build_object('submission', to_jsonb(s), 'task', to_jsonb(t), 'grade', g.data, 'review', to_jsonb(r)) order by s.updated_at desc)
        from v2.submissions s
        join v2.work_tasks t on t.id = s.task_id
        join v2.ai_grades g on g.submission_id = s.id
        left join v2.grade_reviews r on r.submission_id = s.id
       where s.student_id = p_user and s.status = 'approved'), '[]'::jsonb),
    'workPending', (select count(*) from v2.submissions s where s.student_id = p_user and s.status not in ('approved', 'returned')),
    'behaviors', coalesce((select jsonb_agg(to_jsonb(b) order by b.position) from v2.behaviors b where b.class_id = v_class), '[]'::jsonb),
    'behaviorLogs', coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc) from v2.behavior_logs l
                               where l.student_id = p_user and l.at > now() - interval '90 days'), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(to_jsonb(a) order by a.date desc) from v2.attendance a
                             where a.student_id = p_user and a.date > v2.today_vn() - 45), '[]'::jsonb),
    'tt27', (select to_jsonb(e) from v2.tt27_evaluations e
              where e.student_id = p_user and (v_staff or e.status = 'final')
              order by e.school_year desc, array_position(array['GK1', 'CK1', 'GK2', 'CN'], e.term_id) desc limit 1)
  );
end $$;

revoke execute on function v2.record_behavior(text, text, uuid[], text), v2.undo_behavior(uuid), v2.get_student_extras(uuid) from public, anon;
grant execute on function v2.record_behavior(text, text, uuid[], text), v2.undo_behavior(uuid), v2.get_student_extras(uuid) to authenticated;
grant execute on function v2.task_visible_to_student(text, uuid), v2.can_see_task(text), v2.can_see_grade(uuid), v2.can_see_review(uuid)
  to authenticated, service_role;
grant execute on all functions in schema v2 to service_role;

-- -----------------------------------------------------------------------------
-- Storage: bucket riêng tư `submissions`, đường dẫn <task_id>/<student_id>/<file>.jpg (≤ 5 MB, chỉ ảnh)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists submissions_obj_insert on storage.objects;
create policy submissions_obj_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'submissions' and (
    ((storage.foldername(name))[2] = (select auth.uid())::text
      and v2.task_visible_to_student((storage.foldername(name))[1], (select auth.uid())))
    or exists (select 1 from v2.work_tasks t where t.id = (storage.foldername(name))[1] and v2.is_teacher_of_class(t.class_id))
  )
);

drop policy if exists submissions_obj_read on storage.objects;
create policy submissions_obj_read on storage.objects for select to authenticated using (
  bucket_id = 'submissions' and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or exists (select 1 from v2.work_tasks t where t.id = (storage.foldername(name))[1] and v2.is_teacher_of_class(t.class_id))
    or exists (select 1 from v2.submissions s
                where s.task_id = (storage.foldername(name))[1] and s.student_id::text = (storage.foldername(name))[2]
                  and s.status = 'approved' and v2.is_guardian_of(s.student_id))
  )
);

drop policy if exists submissions_obj_delete on storage.objects;
create policy submissions_obj_delete on storage.objects for delete to authenticated using (
  bucket_id = 'submissions'
  and exists (select 1 from v2.work_tasks t where t.id = (storage.foldername(name))[1] and v2.is_teacher_of_class(t.class_id))
);
