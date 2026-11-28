-- =============================================================================
-- OPEN-EDU · SQL 26 · Ôn thi (docs/ON_THI.md)
--   • Dạng câu mới TRUE_FALSE_MULTI (Đúng – Sai nhiều ý): thêm vào ràng buộc v2.items.type và hàm v2._upsert_item.
--   • v2.onthi_sets      bài luyện cho CẢ KHỐI, kiểu 'tn' (Trạng Nguyên) hoặc 'vio' (Đấu trường VioEdu).
--   • v2.onthi_attempts  lần làm bài (điểm chỉ do Edge Function grade ghi qua onthi_record_results — service role).
--   • v2.onthi_answers   câu trả lời (tự lưu qua RPC onthi_save_answer).
-- Học sinh KHÔNG đọc/ghi trực tiếp 3 bảng onthi_*: mọi thao tác qua RPC security definer.
-- Câu hỏi gửi xuống bằng item_to_json(..., false) → không có đáp án. Đáp án chỉ trả về sau khi nộp bài,
-- khi bài luyện bật "Xem lại có đáp án" (reveal_answers).
-- Chạy lại nhiều lần được.
-- =============================================================================

-- ---------- 1. Dạng câu TRUE_FALSE_MULTI ----------
do $$
declare
  r record;
  v_list constant text := $l$('MCQ', 'MCQ_MULTIPLE', 'MATCHING', 'ORDERING', 'DRAG_DROP', 'SHORT_ANSWER', 'SENTENCE_SCRAMBLE', 'WORD_CLASSIFY', 'FILL_IN_PASSAGE', 'INLINE_DROPDOWN', 'LISTEN_CHOOSE', 'HOTSPOT', 'DRAW', 'RECORD_READ', 'MATH_MANIPULATIVE', 'POLL', 'TRUE_FALSE_MULTI')$l$;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'v2.items'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%MATH_MANIPULATIVE%'
  loop
    if pg_get_constraintdef((select oid from pg_constraint where conrelid = 'v2.items'::regclass and conname = r.conname)) not like '%TRUE_FALSE_MULTI%' then
      execute format('alter table v2.items drop constraint %I', r.conname);
      execute format('alter table v2.items add constraint %I check (type in %s)', r.conname, v_list);
    end if;
  end loop;
end $$;

do $$
declare
  f constant text := 'v2._upsert_item(jsonb,uuid,uuid,boolean)';
  def text;
  v_old constant text := $o$'MATH_MANIPULATIVE', 'POLL'])$o$;
  v_new constant text := $n$'MATH_MANIPULATIVE', 'POLL', 'TRUE_FALSE_MULTI'])$n$;
begin
  if to_regprocedure(f) is null then return; end if;
  def := pg_get_functiondef(to_regprocedure(f));
  if position(v_new in def) = 0 and position(v_old in def) > 0 then
    execute replace(def, v_old, v_new);
  end if;
end $$;

-- ---------- 2. Bảng ----------
create table if not exists v2.onthi_sets (
  id uuid primary key default gen_random_uuid(),
  style text not null check (style in ('tn', 'vio')),
  title text not null check (length(btrim(title)) between 1 and 120),
  grade smallint not null check (grade between 1 and 5),
  subject text not null check (length(subject) between 1 and 40),
  item_ids text[] not null check (cardinality(item_ids) between 1 and 60),
  minutes smallint not null check (minutes between 1 and 180),
  points numeric(6, 2) not null check (points > 0 and points <= 100),
  pass_score numeric(8, 2) not null default 0 check (pass_score >= 0),
  lock_order boolean not null default false,
  position int not null default 1,
  show_board boolean not null default true,
  reveal_answers boolean not null default true,
  status text not null default 'published' check (status in ('draft', 'published')),
  created_by uuid default auth.uid() references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onthi_sets_grade_idx on v2.onthi_sets (grade, style, status);

create table if not exists v2.onthi_attempts (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references v2.onthi_sets (id) on delete cascade,
  student_id uuid not null references v2.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  status text not null default 'in-progress' check (status in ('in-progress', 'submitted')),
  score numeric(8, 2),
  max_score numeric(8, 2),
  correct int,
  wrong int,
  skipped int,
  duration_ms int,
  results jsonb check (results is null or jsonb_typeof(results) = 'array'),
  auto_submitted boolean not null default false
);
create unique index if not exists onthi_attempts_open_uidx on v2.onthi_attempts (set_id, student_id) where status = 'in-progress';
create index if not exists onthi_attempts_set_idx on v2.onthi_attempts (set_id, status);
create index if not exists onthi_attempts_student_idx on v2.onthi_attempts (student_id, set_id);

create table if not exists v2.onthi_answers (
  attempt_id uuid not null references v2.onthi_attempts (id) on delete cascade,
  item_id text not null check (length(item_id) between 1 and 128),
  response jsonb,
  ms int not null default 0 check (ms >= 0),
  saved_at timestamptz not null default now(),
  primary key (attempt_id, item_id)
);

alter table v2.onthi_sets enable row level security;
alter table v2.onthi_attempts enable row level security;
alter table v2.onthi_answers enable row level security;
revoke all on v2.onthi_sets, v2.onthi_attempts, v2.onthi_answers from anon, authenticated;
grant all on v2.onthi_sets, v2.onthi_attempts, v2.onthi_answers to service_role;

-- ---------- 3. Hàm phụ ----------
-- Khối của người gọi (HS): profiles.grade, không có thì lấy khối của lớp.
create or replace function v2._onthi_grade(p_user uuid) returns smallint
language sql stable security definer set search_path = v2, public as $$
  select coalesce(p.grade, (select c.grade from v2.classes c where c.id = p.class_id))
  from v2.profiles p where p.id = p_user
$$;

create or replace function v2._onthi_set_json(s v2.onthi_sets) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select v2.jsonb_compact(jsonb_build_object(
    'id', s.id, 'style', s.style, 'title', s.title, 'grade', s.grade, 'subject', s.subject, 'itemIds', to_jsonb(s.item_ids),
    'minutes', s.minutes, 'points', s.points, 'passScore', s.pass_score, 'lockOrder', s.lock_order, 'position', s.position,
    'showBoard', s.show_board, 'revealAnswers', s.reveal_answers, 'status', s.status, 'createdBy', s.created_by,
    'createdByName', (select p.name from v2.profiles p where p.id = s.created_by),
    'createdAt', s.created_at, 'updatedAt', s.updated_at))
$$;

-- Lần làm tốt nhất (điểm → thời gian → số câu sai → nộp sớm).
create or replace function v2._onthi_best(p_set uuid, p_user uuid) returns v2.onthi_attempts
language sql stable security definer set search_path = v2, public as $$
  select a.* from v2.onthi_attempts a
  where a.set_id = p_set and a.student_id = p_user and a.status = 'submitted'
  order by a.score desc nulls last, a.duration_ms asc nulls last, a.wrong asc nulls last, a.submitted_at asc
  limit 1
$$;

create or replace function v2._onthi_best_json(a v2.onthi_attempts, s v2.onthi_sets) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select case when a.id is null then null else jsonb_build_object(
    'attemptId', a.id, 'score', a.score, 'durationMs', a.duration_ms, 'wrong', a.wrong,
    'passed', coalesce(a.score, 0) >= s.pass_score, 'at', a.submitted_at) end
$$;

-- Bài liền trước (cùng kiểu, khối, môn; đã mở) theo thứ tự position.
create or replace function v2._onthi_prev(s v2.onthi_sets) returns v2.onthi_sets
language sql stable security definer set search_path = v2, public as $$
  select p.* from v2.onthi_sets p
  where p.status = 'published' and p.style = s.style and p.grade = s.grade and p.subject = s.subject and p.id <> s.id
    and (p.position, p.created_at, p.id::text) < (s.position, s.created_at, s.id::text)
  order by p.position desc, p.created_at desc, p.id::text desc
  limit 1
$$;

create or replace function v2._onthi_locked_by(s v2.onthi_sets, p_user uuid) returns text
language plpgsql stable security definer set search_path = v2, public as $$
declare v_prev v2.onthi_sets; v_best v2.onthi_attempts;
begin
  if not s.lock_order then return null; end if;
  v_prev := v2._onthi_prev(s);
  if v_prev.id is null then return null; end if;
  v_best := v2._onthi_best(v_prev.id, p_user);
  if v_best.id is not null and coalesce(v_best.score, 0) >= v_prev.pass_score then return null; end if;
  return v_prev.title;
end $$;

create or replace function v2._onthi_require_staff() returns void
language plpgsql stable security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  if not v2.is_staff() then raise exception 'Chỉ thầy/cô dùng được chức năng này.' using errcode = '42501'; end if;
end $$;

create or replace function v2._onthi_require_student() returns smallint
language plpgsql stable security definer set search_path = v2, public as $$
declare v_role text := v2._require_user(); v_grade smallint;
begin
  if v_role <> 'student' then raise exception 'Trang Ôn thi dành cho học sinh.' using errcode = '42501'; end if;
  v_grade := v2._onthi_grade(auth.uid());
  if v_grade is null then raise exception 'Tài khoản của em chưa có khối lớp. Em báo thầy/cô nhé.' using errcode = '42501'; end if;
  return v_grade;
end $$;

-- ---------- 4. Thầy/cô ----------
create or replace function v2.onthi_sets_list(p_style text default null, p_grade int default null) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  perform v2._onthi_require_staff();
  return coalesce((
    select jsonb_agg(v2._onthi_set_json(s) || jsonb_build_object(
             'done', (select count(distinct a.student_id) from v2.onthi_attempts a where a.set_id = s.id and a.status = 'submitted'))
           order by s.grade, s.style, s.subject, s.position, s.created_at)
    from v2.onthi_sets s
    where (p_style is null or s.style = p_style) and (p_grade is null or s.grade = p_grade)), '[]'::jsonb);
end $$;

create or replace function v2.onthi_set_save(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_id uuid := v2.try_uuid(p ->> 'id');
  v_old v2.onthi_sets;
  v_row v2.onthi_sets;
  v_style text := p ->> 'style';
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_grade int := v2.try_int(p ->> 'grade');
  v_subject text := coalesce(nullif(p ->> 'subject', ''), 'khac');
  v_items text[];
  v_minutes int := v2.try_int(p ->> 'minutes');
  v_points numeric := nullif(p ->> 'points', '')::numeric;
  v_pass numeric := coalesce(nullif(p ->> 'passScore', '')::numeric, 0);
  v_status text := coalesce(nullif(p ->> 'status', ''), 'published');
  v_bad int;
begin
  perform v2._onthi_require_staff();
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Bài luyện không hợp lệ.' using errcode = '22023'; end if;
  if v_style is null or v_style not in ('tn', 'vio') then raise exception 'Kiểu bài luyện chỉ là "tn" hoặc "vio".' using errcode = '22023'; end if;
  if length(v_title) not between 1 and 120 then raise exception 'Tên bài luyện từ 1 đến 120 kí tự.' using errcode = '22023'; end if;
  if v_grade is null or v_grade not between 1 and 5 then raise exception 'Khối lớp phải từ 1 đến 5.' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'itemIds') is distinct from 'array' then raise exception 'Bài luyện cần danh sách câu hỏi.' using errcode = '22023'; end if;
  select array_agg(x order by o) into v_items from jsonb_array_elements_text(p -> 'itemIds') with ordinality as t(x, o);
  v_items := coalesce(v_items, '{}');
  if cardinality(v_items) not between 1 and 60 then raise exception 'Bài luyện có từ 1 đến 60 câu.' using errcode = '22023'; end if;
  if (select count(distinct x) from unnest(v_items) x) <> cardinality(v_items) then raise exception 'Có câu hỏi bị lặp trong bài luyện.' using errcode = '22023'; end if;
  select count(*) into v_bad from unnest(v_items) x where not exists (select 1 from v2.items i where i.id = x);
  if v_bad > 0 then raise exception 'Có % câu hỏi không còn trong ngân hàng.', v_bad using errcode = '22023'; end if;
  select count(*) into v_bad from unnest(v_items) x join v2.items i on i.id = x where i.grade <> v_grade;
  if v_bad > 0 then raise exception 'Mọi câu hỏi phải thuộc lớp %.', v_grade using errcode = '22023'; end if;
  if v_minutes is null or v_minutes not between 1 and 180 then raise exception 'Thời gian làm bài từ 1 đến 180 phút.' using errcode = '22023'; end if;
  if v_points is null or v_points <= 0 or v_points > 100 then raise exception 'Điểm mỗi câu không hợp lệ.' using errcode = '22023'; end if;
  if v_pass < 0 or v_pass > cardinality(v_items) * v_points then raise exception 'Mức đạt từ 0 đến % điểm.', cardinality(v_items) * v_points using errcode = '22023'; end if;
  if v_status not in ('draft', 'published') then raise exception 'Trạng thái không hợp lệ.' using errcode = '22023'; end if;

  if v_id is not null then select * into v_old from v2.onthi_sets where id = v_id; end if;
  if v_old.id is not null then
    if not (v2.is_admin() or v_old.created_by = auth.uid() or v_old.created_by is null) then
      raise exception 'Chỉ thầy/cô tạo bài này mới sửa được.' using errcode = '42501';
    end if;
    update v2.onthi_sets set style = v_style, title = v_title, grade = v_grade, subject = v_subject, item_ids = v_items,
      minutes = v_minutes, points = v_points, pass_score = v_pass, lock_order = coalesce((p ->> 'lockOrder')::boolean, false),
      position = coalesce(v2.try_int(p ->> 'position'), position), show_board = coalesce((p ->> 'showBoard')::boolean, true),
      reveal_answers = coalesce((p ->> 'revealAnswers')::boolean, true), status = v_status, updated_at = now()
    where id = v_old.id returning * into v_row;
  else
    insert into v2.onthi_sets (style, title, grade, subject, item_ids, minutes, points, pass_score, lock_order, position, show_board, reveal_answers, status, created_by)
    values (v_style, v_title, v_grade, v_subject, v_items, v_minutes, v_points, v_pass, coalesce((p ->> 'lockOrder')::boolean, false),
      coalesce(v2.try_int(p ->> 'position'), (select coalesce(max(s.position), 0) + 1 from v2.onthi_sets s where s.style = v_style and s.grade = v_grade and s.subject = v_subject)),
      coalesce((p ->> 'showBoard')::boolean, true), coalesce((p ->> 'revealAnswers')::boolean, true), v_status, auth.uid())
    returning * into v_row;
  end if;
  return v2._onthi_set_json(v_row);
end $$;

create or replace function v2.onthi_set_delete(p_id uuid) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare v_old v2.onthi_sets;
begin
  perform v2._onthi_require_staff();
  select * into v_old from v2.onthi_sets where id = p_id;
  if v_old.id is null then return; end if;
  if not (v2.is_admin() or v_old.created_by = auth.uid() or v_old.created_by is null) then
    raise exception 'Chỉ thầy/cô tạo bài này mới xoá được.' using errcode = '42501';
  end if;
  delete from v2.onthi_sets where id = p_id;
end $$;

-- Người tạo bài / quản trị: cả khối. Thầy/cô khác: học sinh các lớp mình dạy (cùng khối).
create or replace function v2.onthi_report(p_set uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare s v2.onthi_sets; v_full boolean;
begin
  perform v2._onthi_require_staff();
  select * into s from v2.onthi_sets where id = p_set;
  if s.id is null then raise exception 'Không tìm thấy bài luyện này.' using errcode = 'P0002'; end if;
  v_full := v2.is_admin() or s.created_by = auth.uid();
  return jsonb_build_object(
    'set', v2._onthi_set_json(s),
    'students', coalesce((
      with st as (
        select p.id, p.name, p.class_id, c.name as class_name
        from v2.profiles p left join v2.classes c on c.id = p.class_id
        where p.role = 'student' and v2._onthi_grade(p.id) = s.grade and (v_full or v2.is_teacher_of_class(p.class_id))
      )
      select jsonb_agg(v2.jsonb_compact(jsonb_build_object(
        'studentId', st.id, 'name', st.name, 'classId', st.class_id, 'className', st.class_name,
        'attempts', (select count(*) from v2.onthi_attempts a where a.set_id = s.id and a.student_id = st.id and a.status = 'submitted'),
        'best', v2._onthi_best_json(v2._onthi_best(s.id, st.id), s))) order by st.class_name nulls last, st.name)
      from st), '[]'::jsonb),
    'items', coalesce((
      with best as (
        select b.results from (
          select distinct on (a.student_id) a.results
          from v2.onthi_attempts a join v2.profiles p on p.id = a.student_id
          where a.set_id = s.id and a.status = 'submitted' and (v_full or v2.is_teacher_of_class(p.class_id))
          order by a.student_id, a.score desc nulls last, a.duration_ms asc nulls last, a.wrong asc nulls last, a.submitted_at
        ) b
      ),
      r as (select x from best, jsonb_array_elements(coalesce(best.results, '[]'::jsonb)) x)
      select jsonb_agg(jsonb_build_object('itemId', i.id, 'type', i.type,
               'tried', (select count(*) from r where r.x ->> 'itemId' = i.id and (r.x ->> 'answered')::boolean),
               'correct', (select count(*) from r where r.x ->> 'itemId' = i.id and (r.x ->> 'correct')::boolean)) order by o)
      from unnest(s.item_ids) with ordinality as u(iid, o) join v2.items i on i.id = u.iid), '[]'::jsonb));
end $$;

-- ---------- 5. Học sinh ----------
create or replace function v2.onthi_my_cards(p_style text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare v_grade smallint := v2._onthi_require_student(); v_uid uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(v2.jsonb_compact(jsonb_build_object(
      'setId', s.id, 'style', s.style, 'title', s.title, 'subject', s.subject, 'grade', s.grade,
      'questions', cardinality(s.item_ids), 'minutes', s.minutes, 'points', s.points, 'maxScore', cardinality(s.item_ids) * s.points,
      'passScore', s.pass_score, 'position', s.position, 'showBoard', s.show_board,
      'locked', v2._onthi_locked_by(s, v_uid) is not null, 'lockedBy', v2._onthi_locked_by(s, v_uid),
      'attempts', (select count(*) from v2.onthi_attempts a where a.set_id = s.id and a.student_id = v_uid and a.status = 'submitted'),
      'best', v2._onthi_best_json(v2._onthi_best(s.id, v_uid), s),
      'inProgress', (select jsonb_build_object('attemptId', a.id, 'deadlineAt', a.deadline_at) from v2.onthi_attempts a
                     where a.set_id = s.id and a.student_id = v_uid and a.status = 'in-progress'))) order by s.subject, s.position, s.created_at)
    from v2.onthi_sets s
    where s.status = 'published' and s.grade = v_grade and s.style = p_style), '[]'::jsonb);
end $$;

-- Mở bài: tiếp tục lần đang làm, hoặc tạo lần mới. Lần đang làm đã quá giờ → trả { overdueAttemptId } để máy
-- gọi grade 'onthi-finalize' rồi mở lại.
create or replace function v2.onthi_start(p_set uuid) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_grade smallint := v2._onthi_require_student();
  v_uid uuid := auth.uid();
  s v2.onthi_sets;
  a v2.onthi_attempts;
  v_lock text;
begin
  select * into s from v2.onthi_sets where id = p_set and status = 'published' and grade = v_grade;
  if s.id is null then raise exception 'Không tìm thấy bài luyện này.' using errcode = 'P0002'; end if;
  select * into a from v2.onthi_attempts where set_id = s.id and student_id = v_uid and status = 'in-progress';
  if a.id is not null and now() > a.deadline_at + interval '30 seconds' then
    return jsonb_build_object('overdueAttemptId', a.id);
  end if;
  if a.id is null then
    v_lock := v2._onthi_locked_by(s, v_uid);
    if v_lock is not null then raise exception 'Em cần đạt bài "%" trước nhé.', v_lock using errcode = 'P0001'; end if;
    insert into v2.onthi_attempts (set_id, student_id, started_at, deadline_at)
    values (s.id, v_uid, now(), now() + make_interval(mins => s.minutes))
    on conflict (set_id, student_id) where status = 'in-progress' do nothing
    returning * into a;
    if a.id is null then select * into a from v2.onthi_attempts where set_id = s.id and student_id = v_uid and status = 'in-progress'; end if;
  end if;
  return jsonb_build_object(
    'attemptId', a.id, 'setId', s.id, 'style', s.style, 'title', s.title, 'minutes', s.minutes, 'points', s.points,
    'maxScore', cardinality(s.item_ids) * s.points, 'passScore', s.pass_score,
    'startedAt', a.started_at, 'deadlineAt', a.deadline_at, 'serverNow', now(),
    'items', coalesce((select jsonb_agg(v2.item_to_json(i, null, false) order by u.o)
                       from unnest(s.item_ids) with ordinality as u(iid, o) join v2.items i on i.id = u.iid), '[]'::jsonb),
    'answers', coalesce((select jsonb_object_agg(x.item_id, jsonb_build_object('response', x.response, 'ms', x.ms))
                         from v2.onthi_answers x where x.attempt_id = a.id), '{}'::jsonb));
end $$;

create or replace function v2.onthi_save_answer(p_attempt uuid, p_item text, p_response jsonb, p_ms int default 0) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare a v2.onthi_attempts; v_items text[];
begin
  perform v2._require_user();
  select * into a from v2.onthi_attempts where id = p_attempt and student_id = auth.uid();
  if a.id is null then raise exception 'Không tìm thấy bài làm.' using errcode = 'P0002'; end if;
  if a.status <> 'in-progress' then raise exception 'Bài này đã nộp rồi.' using errcode = 'P0001'; end if;
  if now() > a.deadline_at + interval '30 seconds' then raise exception 'Đã hết giờ làm bài.' using errcode = 'P0001'; end if;
  select item_ids into v_items from v2.onthi_sets where id = a.set_id;
  if not (p_item = any (v_items)) then raise exception 'Câu này không có trong bài.' using errcode = '22023'; end if;
  if p_response is not null and length(p_response::text) > 20000 then raise exception 'Câu trả lời quá dài.' using errcode = '22023'; end if;
  insert into v2.onthi_answers (attempt_id, item_id, response, ms, saved_at)
  values (a.id, p_item, p_response, greatest(0, least(coalesce(p_ms, 0), 10800000)), now())
  on conflict (attempt_id, item_id) do update set response = excluded.response, ms = excluded.ms, saved_at = now();
end $$;

-- Kết quả một lần đã nộp (+ đáp án khi bài cho xem lại có đáp án). p_prev_best: điểm tốt nhất TRƯỚC lần này (để báo "kỉ lục mới").
create or replace function v2._onthi_result_json(a v2.onthi_attempts, p_new_best boolean default null) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select v2.jsonb_compact(jsonb_build_object(
    'attemptId', a.id, 'setId', s.id, 'style', s.style, 'title', s.title, 'score', a.score, 'maxScore', a.max_score,
    'passScore', s.pass_score, 'passed', coalesce(a.score, 0) >= s.pass_score, 'correct', a.correct, 'wrong', a.wrong,
    'skipped', a.skipped, 'durationMs', a.duration_ms, 'submittedAt', a.submitted_at, 'items', coalesce(a.results, '[]'::jsonb),
    'responses', coalesce((select jsonb_object_agg(x.item_id, x.response) from v2.onthi_answers x where x.attempt_id = a.id), '{}'::jsonb),
    'keys', case when s.reveal_answers then coalesce((select jsonb_object_agg(k.item_id, k.key) from v2.item_keys k where k.item_id = any (s.item_ids)), '{}'::jsonb) end,
    'best', (select b.score from v2._onthi_best(s.id, a.student_id) b),
    'newBest', coalesce(p_new_best, false)))
  from v2.onthi_sets s where s.id = a.set_id
$$;

create or replace function v2.onthi_result(p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare a v2.onthi_attempts;
begin
  perform v2._require_user();
  select * into a from v2.onthi_attempts where id = p_attempt;
  if a.id is null or a.status <> 'submitted' then raise exception 'Bài này chưa nộp.' using errcode = 'P0002'; end if;
  if a.student_id <> auth.uid() and not v2.is_staff() then raise exception 'Em chỉ xem được bài của mình.' using errcode = '42501'; end if;
  return v2._onthi_result_json(a);
end $$;

-- Chỉ Edge Function grade (service role) ghi điểm. Trả về kết quả như onthi_result.
create or replace function v2.onthi_record_results(p_attempt uuid, p_results jsonb, p_score numeric, p_max numeric,
  p_correct int, p_wrong int, p_skipped int, p_auto boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare a v2.onthi_attempts; v_prev v2.onthi_attempts; v_end timestamptz; v_new boolean;
begin
  select * into a from v2.onthi_attempts where id = p_attempt for update;
  if a.id is null then raise exception 'Không tìm thấy bài làm.' using errcode = 'P0002'; end if;
  if a.status = 'submitted' then return v2._onthi_result_json(a); end if;
  v_prev := v2._onthi_best(a.set_id, a.student_id);
  v_end := least(now(), a.deadline_at);
  update v2.onthi_attempts set status = 'submitted', submitted_at = greatest(a.started_at, v_end),
    score = p_score, max_score = p_max, correct = p_correct, wrong = p_wrong, skipped = p_skipped,
    duration_ms = greatest(0, (extract(epoch from (greatest(a.started_at, v_end) - a.started_at)) * 1000)::int),
    results = coalesce(p_results, '[]'::jsonb), auto_submitted = coalesce(p_auto, false)
  where id = a.id returning * into a;
  -- Kỉ lục mới: vượt kết quả tốt nhất TRƯỚC lần này (lần đầu thì không tính).
  v_new := v_prev.id is not null and (a.score > v_prev.score or (a.score = v_prev.score and a.duration_ms < v_prev.duration_ms)
    or (a.score = v_prev.score and a.duration_ms = v_prev.duration_ms and a.wrong < v_prev.wrong));
  return v2._onthi_result_json(a, v_new);
end $$;

-- Bảng xếp hạng: lần tốt nhất của mỗi bạn cùng khối. HS: 10 bạn đầu + vị trí của em (ẩn khi thầy/cô tắt). GV: cả bảng.
create or replace function v2.onthi_board(p_set uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_role text := v2._require_user();
  s v2.onthi_sets;
  v_staff boolean := v2.is_staff();
  v_rows jsonb;
begin
  select * into s from v2.onthi_sets where id = p_set;
  if s.id is null then raise exception 'Không tìm thấy bài luyện này.' using errcode = 'P0002'; end if;
  if not v_staff then
    if v_role <> 'student' or v2._onthi_grade(auth.uid()) is distinct from s.grade or s.status <> 'published' then
      raise exception 'Không tìm thấy bài luyện này.' using errcode = 'P0002';
    end if;
    if not s.show_board then return jsonb_build_object('setId', s.id, 'total', 0, 'rows', '[]'::jsonb, 'me', null, 'hidden', true); end if;
  end if;
  with b as (
    select distinct on (a.student_id) a.student_id, a.score, a.duration_ms, a.wrong, a.submitted_at
    from v2.onthi_attempts a
    where a.set_id = s.id and a.status = 'submitted'
    order by a.student_id, a.score desc nulls last, a.duration_ms asc nulls last, a.wrong asc nulls last, a.submitted_at
  ),
  r as (
    select b.*, p.name, p.avatar_mascot, p.avatar_color, c.name as class_name,
      rank() over (order by b.score desc nulls last, b.duration_ms asc nulls last, b.wrong asc nulls last) as rk,
      row_number() over (order by b.score desc nulls last, b.duration_ms asc nulls last, b.wrong asc nulls last, b.submitted_at, p.name) as rn
    from b join v2.profiles p on p.id = b.student_id left join v2.classes c on c.id = p.class_id
    where p.role = 'student'
  )
  select coalesce(jsonb_agg(v2.jsonb_compact(jsonb_build_object('rank', rk, 'studentId', student_id, 'name', name, 'className', class_name,
           'mascot', avatar_mascot, 'color', avatar_color, 'score', score, 'durationMs', duration_ms, 'wrong', wrong))
           order by rn), '[]'::jsonb)
  into v_rows from r;
  return jsonb_build_object(
    'setId', s.id, 'total', jsonb_array_length(v_rows),
    'rows', case when v_staff then v_rows else coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements(v_rows) with ordinality t(x, o) order by o limit 10) z), '[]'::jsonb) end,
    'me', (select x from jsonb_array_elements(v_rows) x where x ->> 'studentId' = auth.uid()::text));
end $$;

-- Luyện theo dạng: câu của các bài luyện đã mở cho khối của em.
create or replace function v2.onthi_practice_types(p_style text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare v_grade smallint := v2._onthi_require_student();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('type', t.type, 'count', t.n) order by t.type)
    from (select i.type, count(distinct i.id) as n
          from v2.onthi_sets s cross join lateral unnest(s.item_ids) x join v2.items i on i.id = x
          where s.status = 'published' and s.grade = v_grade and s.style = p_style
          group by i.type) t), '[]'::jsonb);
end $$;

create or replace function v2.onthi_practice_items(p_style text, p_type text, p_limit int default 10) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare v_grade smallint := v2._onthi_require_student();
begin
  return coalesce((
    with pool as (
      select distinct i.id
      from v2.onthi_sets s cross join lateral unnest(s.item_ids) x join v2.items i on i.id = x
      where s.status = 'published' and s.grade = v_grade and s.style = p_style and i.type = p_type
    ),
    pick as (select id from pool order by random() limit greatest(1, least(coalesce(p_limit, 10), 30)))
    select jsonb_agg(v2.item_to_json(i, null, false)) from v2.items i join pick on pick.id = i.id), '[]'::jsonb);
end $$;

-- ---------- 6. Quyền ----------
revoke execute on function v2._onthi_grade(uuid), v2._onthi_set_json(v2.onthi_sets), v2._onthi_best(uuid, uuid),
  v2._onthi_best_json(v2.onthi_attempts, v2.onthi_sets), v2._onthi_prev(v2.onthi_sets), v2._onthi_locked_by(v2.onthi_sets, uuid),
  v2._onthi_require_staff(), v2._onthi_require_student(), v2._onthi_result_json(v2.onthi_attempts, boolean),
  v2.onthi_record_results(uuid, jsonb, numeric, numeric, int, int, int, boolean)
  from public, anon, authenticated;
grant execute on function v2.onthi_record_results(uuid, jsonb, numeric, numeric, int, int, int, boolean),
  v2._onthi_result_json(v2.onthi_attempts, boolean) to service_role;
revoke execute on function v2.onthi_sets_list(text, int), v2.onthi_set_save(jsonb), v2.onthi_set_delete(uuid), v2.onthi_report(uuid),
  v2.onthi_my_cards(text), v2.onthi_start(uuid), v2.onthi_save_answer(uuid, text, jsonb, int), v2.onthi_result(uuid),
  v2.onthi_board(uuid), v2.onthi_practice_types(text), v2.onthi_practice_items(text, text, int)
  from public, anon;
grant execute on function v2.onthi_sets_list(text, int), v2.onthi_set_save(jsonb), v2.onthi_set_delete(uuid), v2.onthi_report(uuid),
  v2.onthi_my_cards(text), v2.onthi_start(uuid), v2.onthi_save_answer(uuid, text, jsonb, int), v2.onthi_result(uuid),
  v2.onthi_board(uuid), v2.onthi_practice_types(text), v2.onthi_practice_items(text, text, int)
  to authenticated, service_role;
