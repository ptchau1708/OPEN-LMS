-- =============================================================================
-- migrate-v1 · Bước 6 · Lịch sử học tập: kết quả bài kiểm tra, AI chấm, nhận xét TT27.
--
--   exams (có kết quả)       → v2.rubrics + v2.work_tasks  id 'v1ex_<examId>' (chỉ giao cho HS đã làm bài,
--                              nên HS khác không thấy "bài mới"; câu hỏi của đề đã sang v2.items ở bước 3)
--   exam_results / results…  → v2.submissions (id = md5('v1:result:<id>')::uuid, status 'approved',
--                              text = "Điểm bài kiểm tra trên app cũ: 8/10") + v2.ai_grades + v2.grade_reviews
--   ai_gradings / ai_grades… → gộp lời nhận xét + model vào ai_grades của bài tương ứng; AI chấm cũ CHƯA duyệt
--                              → bài ở trạng thái 'needs-review' (GV duyệt trên app mới)
--   tt27_comments / …        → v2.tt27_evaluations (gộp theo HS × kì × năm học), status 'draft' để GV rà rồi chốt
--
-- Tên bảng/cột cũ được dò tự động (danh sách ứng viên bên dưới). Không có bảng → bước này không làm gì.
-- Chạy lại được: khóa theo id cũ. Không ghi đè bản GV đã sửa trên app mới
--   (grade_reviews có teacher_id, tt27_evaluations có updated_by / data._v1 khác true).
-- =============================================================================

create or replace function v1etl.pick_table(p_candidates text[]) returns text
language sql stable as $$
  select coalesce((select c from unnest(p_candidates) with ordinality as u(c, n) where v1etl.has_table(c) order by n limit 1),
                  p_candidates[1])
$$;

-- Năm học của một ngày (năm học bắt đầu tháng 9) — giống schoolYearOf() ở client.
create or replace function v1etl.school_year_of(p timestamptz) returns text
language sql immutable as $$
  select case when p is null then null
              when extract(month from p) >= 9 then extract(year from p)::int || '-' || (extract(year from p)::int + 1)
              else (extract(year from p)::int - 1) || '-' || extract(year from p)::int end
$$;

create or replace function v1etl.map_term(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    when lower(p) ~ '(gk1|gk 1|gki|giữa (học )?k[iì] ?(1|i)\M|giua_?ki_?1|mid.?1)' then 'GK1'
    when lower(p) ~ '(gk2|gk 2|gkii|giữa (học )?k[iì] ?(2|ii)\M|giua_?ki_?2|mid.?2)' then 'GK2'
    when lower(p) ~ '(ck2|cuối năm|cuoi nam|cả năm|ca nam|^cn$|hk2|hk ?ii|học k[iì] ?(2|ii)|cuối (học )?k[iì] ?(2|ii)|final|^2$)' then 'CN'
    when lower(p) ~ '(ck1|hk1|hk ?i\M|học k[iì] ?(1|i)\M|cuối (học )?k[iì] ?(1|i)\M|cuoi_?ki_?1|^1$)' then 'CK1'
  end
$$;

-- Mức môn học TT27: T (Hoàn thành tốt) · H (Hoàn thành) · C (Chưa hoàn thành).
create or replace function v1etl.map_tt27_level(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    when upper(btrim(p)) in ('T', 'HTT') or lower(p) ~ '(hoàn thành tốt|hoan thanh tot|excellent)' then 'T'
    when upper(btrim(p)) in ('C', 'CHT') or lower(p) ~ '(chưa hoàn thành|chua hoan thanh|not)' then 'C'
    when upper(btrim(p)) in ('H', 'HT') or lower(p) ~ '(hoàn thành|hoan thanh|complete)' then 'H'
  end
$$;

create or replace function v1etl.level_of(p_total numeric, p_max numeric) returns text
language sql immutable as $$
  select case when coalesce(p_max, 0) <= 0 then 'H'
              when p_total / p_max >= 0.8 then 'T' when p_total / p_max >= 0.5 then 'H' else 'C' end
$$;

select src as "nguồn dữ liệu cũ (bước 6)" from (values
  (v1etl.build_view('results', v1etl.pick_table(array['exam_results', 'results', 'exam_attempts', 'attempts', 'student_results', 'submissions']), '[
    ["id","text","id"],
    ["exam_id","text","exam_id","examId","exam","assignment_id","assignmentId"],
    ["student_id","text","student_id","studentId","user_id","userId"],
    ["score","text","score","total_score_earned","points","mark","diem"],
    ["max_score","text","max_score","maxScore","total_score","totalScore","total_points","totalPoints","total"],
    ["answers","jsonb","answers","responses","answer_data"],
    ["teacher_comment","text","teacher_comment","teacherComment","comment","feedback","note"],
    ["submitted_at","ts","submitted_at","submittedAt","completed_at","completedAt","created_at","createdAt"]]')),
  (v1etl.build_view('ai_grades', v1etl.pick_table(array['ai_gradings', 'ai_grading_results', 'ai_grades', 'ai_feedback', 'essay_gradings']), '[
    ["id","text","id"],
    ["result_id","text","result_id","resultId","submission_id","submissionId","attempt_id","attemptId","exam_result_id"],
    ["student_id","text","student_id","studentId","user_id","userId"],
    ["score","text","score","total","points"],
    ["max_score","text","max_score","maxScore","max","total_score"],
    ["feedback","text","feedback","comment","ai_feedback","aiFeedback","content","result_text"],
    ["data","jsonb","data","result","raw","details"],
    ["model","text","model","model_name","modelName"],
    ["status","text","status","state","is_approved","isApproved","approved"],
    ["created_at","ts","created_at","createdAt"]]')),
  (v1etl.build_view('tt27', v1etl.pick_table(array['tt27_comments', 'tt27_evaluations', 'tt27', 'student_comments', 'student_evaluations', 'evaluations', 'nhan_xet']), '[
    ["id","text","id"],
    ["student_id","text","student_id","studentId","user_id","userId"],
    ["class_id","text","class_id","classId"],
    ["subject","text","subject","subject_name","subjectName","mon"],
    ["term","text","term","semester","period","hoc_ky","term_id","termId"],
    ["school_year","text","school_year","schoolYear","academic_year","academicYear","academic_year_id","academicYearId","year"],
    ["level","text","level","rating","result","muc_dat","grade_level"],
    ["score","text","score","diem","point"],
    ["comment","text","comment","content","nhan_xet","text","note"],
    ["created_at","ts","created_at","createdAt","updated_at","updatedAt"]]'))
) as v(src);

-- ---------- chuẩn hóa ----------
create or replace view v1etl.results_x as
select r.id, r.exam_id, p.id as student_uuid, e.id as exam_ok,
       coalesce(p.class_id, e.class_id) as class_ref,
       e.class_id as exam_class, e.title as exam_title, e.subject as exam_subject, e.grade as exam_grade, e.teacher_id,
       least(greatest(coalesce(replace(r.score, ',', '.')::numeric, 0), 0), 999) as total,
       coalesce(nullif(replace(r.max_score, ',', '.'), '')::numeric, 10) as max,
       r.teacher_comment, coalesce(r.submitted_at, now()) as submitted_at,
       md5('v1:result:' || r.id)::uuid as submission_id
from v1etl.results r
left join v1etl.exams e on e.id = r.exam_id
left join v2.profiles p on p.id::text = r.student_id and p.role = 'student'
where r.id is not null and (r.score is null or replace(r.score, ',', '.') ~ '^\s*-?\d+(\.\d+)?\s*$')
  and (r.max_score is null or replace(r.max_score, ',', '.') ~ '^\s*\d+(\.\d+)?\s*$');

-- Kết quả chuyển được: có HS, có đề, đề có lớp đã sang v2.
create or replace view v1etl.results_ok as
select x.*, c.id as v2_class, c.grade as class_grade
from v1etl.results_x x
join v2.classes c on c.id = x.exam_class
where x.student_uuid is not null and x.exam_ok is not null;

-- ---------- đề thi → rubric + work_task ----------
insert into v2.rubrics as t (id, title, subject, grade, max_score, criteria, ai_notes, owner_id)
select 'v1ex_' || o.exam_id, left(coalesce(o.exam_title, 'Bài kiểm tra'), 200),
       v1etl.map_subject(o.exam_subject),
       coalesce(v1etl.map_grade(o.exam_grade), o.class_grade, 1),
       greatest(max(o.max), 1),
       jsonb_build_array(jsonb_build_object('id', 'tong', 'label', 'Điểm bài kiểm tra', 'max', greatest(max(o.max), 1))),
       'Chuyển từ app cũ (OpenLMS): điểm tổng, không có tiêu chí chi tiết.',
       (select id from v2.profiles where id::text = o.teacher_id and role in ('teacher', 'admin'))
from v1etl.results_ok o
group by o.exam_id, o.exam_title, o.exam_subject, o.exam_grade, o.class_grade, o.teacher_id
on conflict (id) do update set title = excluded.title, max_score = excluded.max_score, criteria = excluded.criteria;

insert into v2.work_tasks as t (id, title, prompt, subject, grade, rubric_id, class_id, student_ids, allow_photo, allow_text,
                                created_by, created_at)
select 'v1ex_' || o.exam_id, '[App cũ] ' || left(coalesce(o.exam_title, 'Bài kiểm tra'), 180),
       jsonb_build_object('text', 'Bài kiểm tra đã làm trên app cũ (OpenLMS). Chỉ xem lại điểm.'),
       v1etl.map_subject(o.exam_subject), coalesce(v1etl.map_grade(o.exam_grade), o.class_grade, 1),
       'v1ex_' || o.exam_id, o.v2_class,
       array_agg(distinct o.student_uuid::text order by o.student_uuid::text),
       false, true,
       (select id from v2.profiles where id::text = o.teacher_id and role in ('teacher', 'admin')),
       min(o.submitted_at)
from v1etl.results_ok o
group by o.exam_id, o.exam_title, o.exam_subject, o.exam_grade, o.class_grade, o.v2_class, o.teacher_id
on conflict (id) do update set title = excluded.title, student_ids = excluded.student_ids, class_id = excluded.class_id;

-- ---------- kết quả → submissions + ai_grades + grade_reviews ----------
-- AI chấm cũ khớp kết quả (lấy bản mới nhất)
create or replace view v1etl.ai_x as
select distinct on (g.result_id) g.result_id, g.feedback, g.model, g.created_at,
       coalesce(v1etl.try_bool(g.status), lower(coalesce(g.status, '')) in ('approved', 'published', 'done', 'reviewed', 'final')) as approved
from v1etl.ai_grades g
where g.result_id is not null
order by g.result_id, g.created_at desc nulls last;

insert into v2.submissions as t (id, task_id, student_id, class_id, kind, text, submitted_by, submitter_id, status, created_at, updated_at)
select o.submission_id, 'v1ex_' || o.exam_id, o.student_uuid, o.v2_class, 'text',
       'Điểm bài kiểm tra trên app cũ: ' || replace(trim_scale(o.total)::text, '.', ',') || '/' || replace(trim_scale(o.max)::text, '.', ','),
       'teacher', null,
       case when a.result_id is not null and not a.approved then 'needs-review' else 'approved' end,
       o.submitted_at, o.submitted_at
from v1etl.results_ok o
left join v1etl.ai_x a on a.result_id = o.id
on conflict (id) do update set text = excluded.text, task_id = excluded.task_id, class_id = excluded.class_id,
  status = case when t.status in ('approved', 'needs-review') and not exists
                  (select 1 from v2.grade_reviews r where r.submission_id = t.id and r.teacher_id is not null)
                then excluded.status else t.status end;

insert into v2.ai_grades as t (submission_id, data, total, max, level, confidence, flags, model, created_at)
select o.submission_id,
       jsonb_build_object(
         'submissionId', o.submission_id, 'transcript', '[]'::jsonb,
         'criteria', jsonb_build_array(jsonb_build_object('criterionId', 'tong', 'points', o.total, 'comment', '')),
         'total', o.total, 'max', o.max, 'level', v1etl.level_of(o.total, o.max),
         'strengths', '[]'::jsonb, 'issues', '[]'::jsonb,
         'feedbackStudent', coalesce(o.teacher_comment, a.feedback, ''),
         'feedbackTeacher', coalesce(a.feedback, ''),
         'feedbackParent', coalesce(o.teacher_comment, ''),
         'skills', '[]'::jsonb, 'confidence', 1, 'flags', '[]'::jsonb,
         'model', coalesce('v1:' || a.model, 'v1:diem-cu'), 'createdAt', o.submitted_at, 'legacy', true),
       o.total, o.max, v1etl.level_of(o.total, o.max), 1, '{}', coalesce('v1:' || a.model, 'v1:diem-cu'), o.submitted_at
from v1etl.results_ok o
left join v1etl.ai_x a on a.result_id = o.id
on conflict (submission_id) do update set data = excluded.data, total = excluded.total, max = excluded.max,
  level = excluded.level, model = excluded.model
where t.data ->> 'legacy' = 'true';

insert into v2.grade_reviews as t (submission_id, teacher_id, final, decision, note, at)
select o.submission_id, null,
       jsonb_build_object('total', o.total, 'max', o.max, 'level', v1etl.level_of(o.total, o.max),
         'criteria', jsonb_build_array(jsonb_build_object('criterionId', 'tong', 'points', o.total, 'comment', '')),
         'feedbackStudent', coalesce(o.teacher_comment, ''), 'feedbackParent', coalesce(o.teacher_comment, '')),
       'approved', 'Chuyển từ app cũ', o.submitted_at
from v1etl.results_ok o
left join v1etl.ai_x a on a.result_id = o.id
where a.result_id is null or a.approved
on conflict (submission_id) do update set final = excluded.final, at = excluded.at
where t.teacher_id is null;

-- ---------- TT27 ----------
create or replace view v1etl.tt27_x as
select t.id, p.id as student_uuid, v1etl.map_term(t.term) as term_id,
       regexp_replace(coalesce(substring(coalesce(ay.name, t.school_year) from '(\d{4}\s*-\s*\d{4})'),
                               v1etl.school_year_of(t.created_at)), '\s', '', 'g') as school_year,
       coalesce(c1.id, c2.id) as class_id,
       case when t.subject is null then null else v1etl.map_subject(t.subject) end as subject,
       v1etl.map_tt27_level(t.level) as level,
       nullif(replace(t.score, ',', '.'), '') as score_txt,
       coalesce(t.comment, '') as comment, t.created_at
from v1etl.tt27 t
join v2.profiles p on p.id::text = t.student_id and p.role = 'student'
left join v1etl.academic_years ay on ay.id = t.school_year
left join v2.classes c1 on c1.id = t.class_id
left join v2.classes c2 on c2.id = p.class_id
where v1etl.map_term(t.term) is not null and coalesce(c1.id, c2.id) is not null
  and coalesce(substring(coalesce(ay.name, t.school_year) from '(\d{4}\s*-\s*\d{4})'), v1etl.school_year_of(t.created_at)) is not null;

create or replace view v1etl.history_rejects as
select 'result' as loại, r.id as id_cũ,
       case when x.id is null then 'điểm không phải số'
            when x.student_uuid is null then 'HS không có trong v2.profiles'
            when x.exam_ok is null then 'không tìm thấy đề thi'
            else 'đề thi không gắn lớp đã chuyển' end as lý_do
from v1etl.results r
left join v1etl.results_x x on x.id = r.id
where r.id is not null and not exists (select 1 from v1etl.results_ok o where o.id = r.id)
union all
select 'ai_grade', g.id, 'không khớp kết quả bài kiểm tra nào'
from v1etl.ai_grades g
where not exists (select 1 from v1etl.results_ok o where o.id = g.result_id)
union all
select 'tt27', t.id,
       case when p.id is null then 'HS không có trong v2.profiles'
            when v1etl.map_term(t.term) is null then 'không nhận ra kì: ' || coalesce(t.term, '(trống)')
            else 'không xác định được lớp / năm học' end
from v1etl.tt27 t
left join v2.profiles p on p.id::text = t.student_id and p.role = 'student'
where not exists (select 1 from v1etl.tt27_x x where x.id = t.id);

with g as (
  select x.student_uuid, x.term_id, x.school_year,
         (array_agg(x.class_id order by x.created_at desc nulls last))[1] as class_id,
         coalesce(jsonb_object_agg(x.subject, jsonb_strip_nulls(jsonb_build_object(
             'level', coalesce(x.level, 'H'), 'comment', x.comment,
             'score', case when x.score_txt ~ '^\d+(\.\d+)?$' then x.score_txt::numeric end)))
           filter (where x.subject is not null and x.subject <> 'khac'), '{}'::jsonb) as subjects,
         string_agg(x.comment, E'\n' order by x.created_at) filter (where (x.subject is null or x.subject = 'khac') and x.comment <> '') as general,
         array_agg(x.id order by x.id) as ids
  from v1etl.tt27_x x
  group by 1, 2, 3
)
insert into v2.tt27_evaluations as t (student_id, class_id, term_id, school_year, data, status, updated_by, updated_at)
select g.student_uuid, g.class_id, g.term_id, g.school_year,
       jsonb_build_object('subjects', g.subjects,
         'qualities', '{"yeu-nuoc":"Đ","nhan-ai":"Đ","cham-chi":"Đ","trung-thuc":"Đ","trach-nhiem":"Đ"}'::jsonb,
         'competencies', '{}'::jsonb, 'generalComment', coalesce(g.general, ''),
         '_v1', true, '_v1Ids', to_jsonb(g.ids)),
       'draft', null, now()
from g
on conflict (student_id, term_id, school_year) do update set data = excluded.data, class_id = excluded.class_id
where t.updated_by is null and t.data ->> '_v1' = 'true';

select (select count(*) from v1etl.results_ok) as kết_quả_chuyển,
       (select count(*) from v1etl.tt27_x) as nhận_xét_tt27_chuyển,
       (select count(*) from v1etl.history_rejects) as không_chuyển_được;
