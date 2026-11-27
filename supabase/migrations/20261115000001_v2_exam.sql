-- =============================================================================
-- Phase 6 — Đề kiểm tra theo ma trận + làm bài trực tuyến có chống gian lận nhẹ (docs/PHASE6_EXAM.md)
--   • v2.exam_matrices  ma trận đề (GV/admin đọc; chủ/admin ghi)
--   • v2.exams          đề đã ra (paper jsonb: đề A/B gồm item id + điểm; KHÔNG có đáp án) — chỉ GV lớp đọc/ghi
--   • v2.exam_attempts  lần làm bài (điểm chỉ do Edge Function grade ghi qua exam_record_results — service role)
--   • v2.exam_answers   câu trả lời (autosave qua RPC exam_save_answer)
--   • v2.integrity_events  rời màn hình / thoát toàn màn hình / chặn dán / mở trùng / mở lại
-- HỌC SINH KHÔNG có quyền SELECT/INSERT/UPDATE trực tiếp trên 4 bảng exam_*: mọi thao tác qua RPC security definer
-- (exam_my_list, exam_start, exam_save_answer, exam_log_integrity, exam_heartbeat, exam_my_result, exam_scores).
-- Câu hỏi gửi xuống bằng item_to_json(..., false) → không có đáp án (đáp án ở item_keys, HS không đọc được).
-- =============================================================================

alter table v2.learning_events drop constraint if exists learning_events_object_type_check;
alter table v2.learning_events add constraint learning_events_object_type_check
  check (object_type in ('slide', 'item', 'lesson', 'package', 'live', 'arena', 'remediation', 'work', 'exam'));

create table if not exists v2.exam_matrices (
  id text primary key default gen_random_uuid()::text check (length(id) between 1 and 128),
  title text not null check (length(title) between 1 and 200),
  subject text not null,
  grade smallint not null check (grade between 1 and 5),
  term_id text check (term_id in ('GK1', 'CK1', 'GK2', 'CN')),
  duration_min smallint not null default 40 check (duration_min between 5 and 180),
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array'),
  cells jsonb not null default '{}'::jsonb check (jsonb_typeof(cells) = 'object'),
  owner_id uuid default auth.uid() references v2.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists v2.exams (
  id text primary key default gen_random_uuid()::text check (length(id) between 1 and 128),
  title text not null check (length(title) between 1 and 200),
  matrix_id text references v2.exam_matrices (id) on delete set null,
  subject text not null,
  grade smallint not null check (grade between 1 and 5),
  term_id text check (term_id in ('GK1', 'CK1', 'GK2', 'CN')),
  class_id text not null references v2.classes (id) on delete cascade,
  student_ids uuid[] not null default '{}',
  duration_min smallint not null default 40 check (duration_min between 5 and 180),
  open_at timestamptz not null,
  close_at timestamptz not null,
  results_policy text not null default 'after-release' check (results_policy in ('immediate', 'after-release')),
  released_at timestamptz,
  max_attempts smallint not null default 1 check (max_attempts between 1 and 5),
  online_variants text not null default 'A' check (online_variants in ('A', 'AB')),
  fullscreen_prompt boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published')),
  rows jsonb not null default '[]'::jsonb,
  paper jsonb not null check (jsonb_typeof(paper -> 'A') = 'array' and jsonb_typeof(paper -> 'B') = 'array'),
  created_by uuid default auth.uid() references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (close_at > open_at)
);
create index if not exists exams_class_idx on v2.exams (class_id, open_at desc);

create table if not exists v2.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id text not null references v2.exams (id) on delete cascade,
  student_id uuid not null references v2.profiles (id) on delete cascade,
  attempt_no smallint not null default 1,
  variant char(1) not null default 'A' check (variant in ('A', 'B')),
  seed bigint not null,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  status text not null default 'in-progress' check (status in ('in-progress', 'submitted')),
  score numeric(6, 2),
  max_score numeric(6, 2),
  score10 smallint check (score10 between 1 and 10),
  results jsonb,
  retake_allowed boolean not null default false,
  session_id text,
  session_seen_at timestamptz,
  unique (exam_id, student_id, attempt_no)
);
create index if not exists exam_attempts_student_idx on v2.exam_attempts (student_id, exam_id);

create table if not exists v2.exam_answers (
  attempt_id uuid not null references v2.exam_attempts (id) on delete cascade,
  item_id text not null,
  response jsonb,
  ms int not null default 0 check (ms >= 0),
  flagged boolean not null default false,
  saved_at timestamptz not null default now(),
  primary key (attempt_id, item_id)
);

create table if not exists v2.integrity_events (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references v2.exam_attempts (id) on delete cascade,
  kind text not null check (kind in ('blur', 'hidden', 'fullscreen-exit', 'paste-blocked', 'duplicate-session', 'resume')),
  at timestamptz not null default now(),
  away_ms int check (away_ms between 0 and 3600000),
  item_id text
);
create index if not exists integrity_events_attempt_idx on v2.integrity_events (attempt_id, at);

drop trigger if exists exam_matrices_updated on v2.exam_matrices;
create trigger exam_matrices_updated before update on v2.exam_matrices for each row execute function v2.set_updated_at();
drop trigger if exists exams_updated on v2.exams;
create trigger exams_updated before update on v2.exams for each row execute function v2.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
create or replace function v2.is_exam_teacher(p_exam text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.exams e where e.id = p_exam and v2.is_teacher_of_class(e.class_id))
$$;
create or replace function v2.is_attempt_teacher(p_attempt uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.exam_attempts a join v2.exams e on e.id = a.exam_id
                 where a.id = p_attempt and v2.is_teacher_of_class(e.class_id))
$$;

alter table v2.exam_matrices enable row level security;
alter table v2.exams enable row level security;
alter table v2.exam_attempts enable row level security;
alter table v2.exam_answers enable row level security;
alter table v2.integrity_events enable row level security;

drop policy if exists exam_matrices_read on v2.exam_matrices;
create policy exam_matrices_read on v2.exam_matrices for select to authenticated using (v2.is_staff());
drop policy if exists exam_matrices_write on v2.exam_matrices;
create policy exam_matrices_write on v2.exam_matrices for all to authenticated
  using (v2.is_staff() and (owner_id = auth.uid() or v2.is_admin()))
  with check (v2.is_staff() and (owner_id = auth.uid() or v2.is_admin()));

drop policy if exists exams_teacher on v2.exams;
create policy exams_teacher on v2.exams for all to authenticated
  using (v2.is_teacher_of_class(class_id)) with check (v2.is_teacher_of_class(class_id));

drop policy if exists exam_attempts_teacher on v2.exam_attempts;
create policy exam_attempts_teacher on v2.exam_attempts for select to authenticated using (v2.is_exam_teacher(exam_id));
drop policy if exists exam_answers_teacher on v2.exam_answers;
create policy exam_answers_teacher on v2.exam_answers for select to authenticated using (v2.is_attempt_teacher(attempt_id));
drop policy if exists integrity_events_teacher on v2.integrity_events;
create policy integrity_events_teacher on v2.integrity_events for select to authenticated using (v2.is_attempt_teacher(attempt_id));

revoke all on v2.exam_matrices, v2.exams, v2.exam_attempts, v2.exam_answers, v2.integrity_events from anon, authenticated;
grant select, insert, update, delete on v2.exam_matrices, v2.exams to authenticated;
grant select on v2.exam_attempts, v2.exam_answers, v2.integrity_events to authenticated;
grant all on v2.exam_matrices, v2.exams, v2.exam_attempts, v2.exam_answers, v2.integrity_events to service_role;
grant usage, select on all sequences in schema v2 to service_role;

-- -----------------------------------------------------------------------------
-- Hàm nội bộ
-- -----------------------------------------------------------------------------
-- Slot có câu của một đề (A/B): item_id, điểm, dạng.
create or replace function v2._exam_slots(p_paper jsonb, p_variant text)
returns table (slot_id text, item_id text, points numeric, qtype text)
language sql immutable set search_path = v2, public as $$
  select s ->> 'id', s ->> 'itemId', coalesce((s ->> 'points')::numeric, 0), coalesce(s ->> 'qtype', 'tn')
  from jsonb_array_elements(coalesce(p_paper -> p_variant, '[]'::jsonb)) s
  where coalesce(s ->> 'itemId', '') <> ''
$$;

create or replace function v2._exam_applies(e v2.exams, p_student uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select e.status = 'published'
     and exists (select 1 from v2.class_ids_of(p_student) c where c = e.class_id)
     and (cardinality(e.student_ids) = 0 or p_student = any (e.student_ids))
$$;

create or replace function v2._exam_public(e v2.exams) returns jsonb
language sql stable set search_path = v2, public as $$
  select jsonb_build_object('id', e.id, 'title', e.title, 'subject', e.subject, 'grade', e.grade, 'durationMin', e.duration_min,
    'openAt', e.open_at, 'closeAt', e.close_at, 'resultsPolicy', e.results_policy, 'releasedAt', e.released_at,
    'fullscreenPrompt', e.fullscreen_prompt, 'termId', e.term_id,
    'questions', (select count(*) from v2._exam_slots(e.paper, 'A')))
$$;

create or replace function v2._exam_latest(p_exam text, p_student uuid) returns v2.exam_attempts
language sql stable security definer set search_path = v2, public as $$
  select a.* from v2.exam_attempts a where a.exam_id = p_exam and a.student_id = p_student order by a.attempt_no desc limit 1
$$;

create or replace function v2._attempt_json(a v2.exam_attempts) returns jsonb
language sql stable set search_path = v2, public as $$
  select case when a.id is null then null else jsonb_build_object('id', a.id, 'attemptNo', a.attempt_no, 'status', a.status,
    'startedAt', a.started_at, 'deadlineAt', a.deadline_at, 'submittedAt', a.submitted_at, 'retakeAllowed', a.retake_allowed,
    'count', (select count(*) from v2.exam_attempts x where x.exam_id = a.exam_id and x.student_id = a.student_id)) end
$$;

-- Bài của chính HS (ném lỗi nếu không phải).
create or replace function v2._own_attempt(p_attempt uuid) returns v2.exam_attempts
language plpgsql stable security definer set search_path = v2, public as $$
declare a v2.exam_attempts;
begin
  perform v2._require_user();
  select * into a from v2.exam_attempts where id = p_attempt;
  if a.id is null or a.student_id <> auth.uid() then
    raise exception 'Không tìm thấy bài làm của em.' using errcode = '42501';
  end if;
  return a;
end $$;

-- -----------------------------------------------------------------------------
-- RPC học sinh
-- -----------------------------------------------------------------------------
create or replace function v2.exam_my_list() returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('exam', v2._exam_public(e), 'attempt', v2._attempt_json(v2._exam_latest(e.id, auth.uid())),
           'maxAttempts', e.max_attempts) order by e.close_at), '[]'::jsonb)
  from v2.exams e
  where v2._exam_applies(e, auth.uid()) and e.close_at > now() - interval '3 days'
$$;

create or replace function v2.exam_start(p_exam text, p_session text) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  e v2.exams; a v2.exam_attempts; v_count int; v_seed bigint; v_other boolean := false; v_variant text;
begin
  perform v2._require_user();
  select * into e from v2.exams where id = p_exam;
  if e.id is null or not v2._exam_applies(e, auth.uid()) then
    raise exception 'Không tìm thấy bài kiểm tra này.' using errcode = 'P0002';
  end if;
  if length(coalesce(p_session, '')) not between 8 and 64 then raise exception 'Phiên làm bài không hợp lệ.' using errcode = '22023'; end if;
  a := v2._exam_latest(e.id, auth.uid());
  select count(*) into v_count from v2.exam_attempts where exam_id = e.id and student_id = auth.uid();
  if a.id is null or (a.status = 'submitted' and (a.retake_allowed or v_count < e.max_attempts)) then
    if now() < e.open_at then raise exception 'Bài kiểm tra chưa mở. Em quay lại sau nhé.' using errcode = 'P0001'; end if;
    if now() >= e.close_at then raise exception 'Bài kiểm tra đã đóng.' using errcode = 'P0001'; end if;
    if a.id is not null then update v2.exam_attempts set retake_allowed = false where id = a.id; end if;
    v_seed := floor(random() * 2147483647)::bigint;
    v_variant := case when e.online_variants = 'AB' and v_seed % 2 = 1 then 'B' else 'A' end;
    insert into v2.exam_attempts (exam_id, student_id, attempt_no, variant, seed, deadline_at, session_id, session_seen_at)
    values (e.id, auth.uid(), coalesce(a.attempt_no, 0) + 1, v_variant, v_seed,
            least(now() + make_interval(mins => e.duration_min), e.close_at), p_session, now())
    returning * into a;
  elsif a.status = 'in-progress' then
    if a.session_id is distinct from p_session then
      if a.session_seen_at > now() - interval '45 seconds' then
        v_other := true;
        insert into v2.integrity_events (attempt_id, kind) values (a.id, 'duplicate-session');
      else
        insert into v2.integrity_events (attempt_id, kind) values (a.id, 'resume');
      end if;
    end if;
    update v2.exam_attempts set session_id = p_session, session_seen_at = now() where id = a.id returning * into a;
  end if;
  return jsonb_build_object(
    'exam', v2._exam_public(e), 'attemptId', a.id, 'attemptNo', a.attempt_no, 'variant', a.variant, 'seed', a.seed,
    'startedAt', a.started_at, 'deadlineAt', a.deadline_at, 'serverNow', now(), 'status', a.status, 'otherSession', v_other,
    'items', case when a.status = 'in-progress' then coalesce((
        select jsonb_agg(v2.item_to_json(i, null, false)) from v2._exam_slots(e.paper, a.variant) s join v2.items i on i.id = s.item_id), '[]'::jsonb)
      else '[]'::jsonb end,
    'points', coalesce((select jsonb_object_agg(s.item_id, s.points) from v2._exam_slots(e.paper, a.variant) s), '{}'::jsonb),
    'answers', coalesce((select jsonb_object_agg(x.item_id, jsonb_build_object('response', x.response, 'ms', x.ms, 'flagged', x.flagged, 'savedAt', x.saved_at))
                         from v2.exam_answers x where x.attempt_id = a.id), '{}'::jsonb));
end $$;

create or replace function v2.exam_save_answer(p_attempt uuid, p_item text, p_response jsonb, p_ms int default 0, p_flagged boolean default false)
returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare a v2.exam_attempts; e v2.exams;
begin
  a := v2._own_attempt(p_attempt);
  if a.status <> 'in-progress' then raise exception 'Em đã nộp bài rồi.' using errcode = 'P0001'; end if;
  if now() > a.deadline_at + interval '30 seconds' then raise exception 'Đã hết giờ làm bài.' using errcode = 'P0001'; end if;
  select * into e from v2.exams where id = a.exam_id;
  if not exists (select 1 from v2._exam_slots(e.paper, a.variant) s where s.item_id = p_item) then
    raise exception 'Câu này không có trong bài.' using errcode = '22023';
  end if;
  if p_response is not null and length(p_response::text) > 20000 then raise exception 'Câu trả lời quá dài.' using errcode = '22023'; end if;
  insert into v2.exam_answers (attempt_id, item_id, response, ms, flagged, saved_at)
  values (a.id, p_item, p_response, greatest(0, least(coalesce(p_ms, 0), 10800000)), coalesce(p_flagged, false), now())
  on conflict (attempt_id, item_id) do update set response = excluded.response, ms = excluded.ms, flagged = excluded.flagged, saved_at = now();
end $$;

create or replace function v2.exam_log_integrity(p_attempt uuid, p_events jsonb) returns int
language plpgsql volatile security definer set search_path = v2, public as $$
declare a v2.exam_attempts; v_have int; v_n int;
begin
  a := v2._own_attempt(p_attempt);
  if a.status <> 'in-progress' or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  select count(*) into v_have from v2.integrity_events where attempt_id = a.id;
  with ev as (
    select x ->> 'kind' as kind, v2.try_int(x ->> 'awayMs') as away, left(x ->> 'itemId', 128) as item,
           case when (x ->> 'at') ~ '^\d{4}-\d\d-\d\dT' then least((x ->> 'at')::timestamptz, now()) else now() end as at
    from jsonb_array_elements(p_events) x
    where x ->> 'kind' in ('blur', 'hidden', 'fullscreen-exit', 'paste-blocked')
    limit greatest(0, 300 - v_have)
  ), ins as (
    insert into v2.integrity_events (attempt_id, kind, at, away_ms, item_id)
    select a.id, kind, greatest(at, a.started_at), case when away between 0 and 3600000 then away end, item from ev
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $$;

create or replace function v2.exam_heartbeat(p_attempt uuid, p_session text) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare a v2.exam_attempts; v_other boolean;
begin
  a := v2._own_attempt(p_attempt);
  v_other := a.session_id is distinct from p_session and a.session_seen_at > now() - interval '45 seconds';
  if v_other and a.status = 'in-progress' then
    insert into v2.integrity_events (attempt_id, kind) values (a.id, 'duplicate-session');
  end if;
  update v2.exam_attempts set session_id = p_session, session_seen_at = now() where id = a.id;
  return jsonb_build_object('otherSession', v_other, 'deadlineAt', a.deadline_at);
end $$;

-- Kết quả của em. Chưa công bố → chỉ biết đã nộp.
create or replace function v2._exam_result_json(e v2.exams, a v2.exam_attempts) returns jsonb
language sql stable set search_path = v2, public as $$
  select jsonb_build_object('examId', e.id, 'title', e.title, 'submittedAt', a.submitted_at,
           'released', (e.results_policy = 'immediate' or e.released_at is not null))
    || case when e.results_policy = 'immediate' or e.released_at is not null then jsonb_build_object(
         'score', a.score, 'maxScore', a.max_score, 'score10', a.score10, 'seed', a.seed,
         'results', coalesce((select jsonb_agg(jsonb_build_object('itemId', r ->> 'itemId', 'correct', (r ->> 'correct')::boolean))
                              from jsonb_array_elements(coalesce(a.results, '[]'::jsonb)) r), '[]'::jsonb),
         'entries', coalesce((select jsonb_agg(jsonb_build_object('id', s.item_id, 'qtype', s.qtype)) from v2._exam_slots(e.paper, a.variant) s), '[]'::jsonb))
       else '{}'::jsonb end
$$;

create or replace function v2.exam_my_result(p_exam text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare e v2.exams; a v2.exam_attempts;
begin
  perform v2._require_user();
  select * into e from v2.exams where id = p_exam;
  if e.id is null then return null; end if;
  a := v2._exam_latest(e.id, auth.uid());
  if a.id is null or a.status <> 'submitted' then return null; end if;
  return v2._exam_result_json(e, a);
end $$;

-- Điểm KTĐK đã công bố (gợi ý TT27): chính em, GV, phụ huynh, admin.
create or replace function v2.exam_scores(p_student uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('examId', e.id, 'title', e.title, 'subject', e.subject, 'termId', e.term_id,
           'score10', a.score10, 'at', coalesce(a.submitted_at, a.started_at)) order by a.submitted_at desc), '[]'::jsonb)
  from v2.exams e
  join lateral (select * from v2.exam_attempts x where x.exam_id = e.id and x.student_id = p_student and x.status = 'submitted'
                order by x.attempt_no desc limit 1) a on true
  where v2.can_view_user(p_student) and a.score10 is not null and (e.results_policy = 'immediate' or e.released_at is not null)
$$;

-- -----------------------------------------------------------------------------
-- RPC giáo viên
-- -----------------------------------------------------------------------------
create or replace function v2.exam_allow_retake(p_exam text, p_student uuid) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare a v2.exam_attempts;
begin
  if not v2.is_exam_teacher(p_exam) then raise exception 'Chỉ thầy/cô của lớp mới cho làm lại.' using errcode = '42501'; end if;
  a := v2._exam_latest(p_exam, p_student);
  if a.id is null then raise exception 'Em này chưa làm bài nên chưa cần cho làm lại.' using errcode = 'P0001'; end if;
  if a.status <> 'submitted' then raise exception 'Em này đang làm bài.' using errcode = 'P0001'; end if;
  update v2.exam_attempts set retake_allowed = true where id = a.id;
end $$;

-- -----------------------------------------------------------------------------
-- Ghi điểm — CHỈ service role (Edge Function grade, action exam-finalize).
-- p_events: [{ itemId, correct, score, durationMs, skills[], misconceptions[] }] → learning_events 'exam'.
-- -----------------------------------------------------------------------------
create or replace function v2.exam_record_results(p_attempt uuid, p_results jsonb, p_score numeric, p_max numeric, p_score10 int,
  p_auto boolean, p_events jsonb) returns boolean
language plpgsql volatile security definer set search_path = v2, public as $$
declare a v2.exam_attempts;
begin
  update v2.exam_attempts set status = 'submitted', submitted_at = now(), auto_submitted = coalesce(p_auto, false),
    results = p_results, score = p_score, max_score = p_max, score10 = greatest(1, least(10, p_score10))
  where id = p_attempt and status = 'in-progress' returning * into a;
  if a.id is null then return false; end if;
  insert into v2.learning_events (user_id, verb, object_type, object_id, assignment_id, result)
  select a.student_id, 'answered', 'exam', left(x ->> 'itemId', 128), 'exam:' || a.exam_id,
         jsonb_build_object('correct', coalesce((x ->> 'correct')::boolean, false), 'score', coalesce((x ->> 'score')::numeric, 0),
           'durationMs', v2.try_int(x ->> 'durationMs'), 'skills', coalesce(x -> 'skills', '[]'::jsonb),
           'misconceptions', coalesce(x -> 'misconceptions', '[]'::jsonb), 'examId', a.exam_id)
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) x
  where coalesce(x ->> 'itemId', '') <> '';
  return true;
end $$;

revoke execute on function v2.exam_record_results(uuid, jsonb, numeric, numeric, int, boolean, jsonb),
  v2._own_attempt(uuid), v2._exam_latest(text, uuid), v2._exam_result_json(v2.exams, v2.exam_attempts)
  from public, anon, authenticated;
grant execute on function v2.exam_record_results(uuid, jsonb, numeric, numeric, int, boolean, jsonb),
  v2._exam_result_json(v2.exams, v2.exam_attempts), v2._exam_slots(jsonb, text) to service_role;
grant execute on function v2.is_exam_teacher(text), v2.is_attempt_teacher(uuid), v2._exam_slots(jsonb, text),
  v2._exam_applies(v2.exams, uuid), v2._exam_public(v2.exams), v2._attempt_json(v2.exam_attempts),
  v2.exam_my_list(), v2.exam_start(text, text), v2.exam_save_answer(uuid, text, jsonb, int, boolean),
  v2.exam_log_integrity(uuid, jsonb), v2.exam_heartbeat(uuid, text), v2.exam_my_result(text), v2.exam_scores(uuid),
  v2.exam_allow_retake(text, uuid)
  to authenticated, service_role;
