-- =============================================================================
-- migrate-v1 · Bước 3 · Câu hỏi: question_bank + arena_questions + exams.questions → v2.items + v2.item_keys
--
--   • MCQ: payload.options có id 'a','b','c','d'…; key.correct = chữ của chỉ số đúng (0-based)
--   • nhiều đáp án đúng → MCQ_MULTIPLE (key.correct = mảng chữ); điền ngắn → SHORT_ANSWER (key.accepted)
--   • Đúng/Sai → MCQ hai lựa chọn
--   • Chống trùng: md5(dạng | nội dung chuẩn hóa | các lựa chọn); ưu tiên question_bank > arena > exams
--   • id ổn định: qb_<id>, ar_<id>, ex_<examId>_<questionId|thứ tự>  → chạy lại không tạo trùng
--   • Câu đã có trên v2 (cùng id hoặc cùng mã băm) KHÔNG bị ghi đè (giữ chỉnh sửa trên app mới)
--   • Câu không chuyển được → v1etl.item_rejects (xem trong 90_verify.sql)
-- =============================================================================

drop table if exists v1etl.item_candidates;
create table v1etl.item_candidates (
  legacy_ref text primary key,
  new_id text not null,
  src_rank int not null,
  owner_text text,
  content text,
  image text,
  item jsonb not null,           -- { type, payload, key }
  grade_text text,
  subject_text text,
  level_text text,
  explanation text,
  topic text,
  class_id text,
  created_at timestamptz,
  content_hash text
);

drop table if exists v1etl.item_rejects;
create table v1etl.item_rejects (
  legacy_ref text primary key,
  old_type text,
  content text
);

-- Gộp 3 nguồn về một dạng
create or replace view v1etl.questions_all as
select 'qb:' || q.id as legacy_ref,
       'qb_' || case when length(q.id) > 100 then md5(q.id) else q.id end as new_id,
       1 as src_rank, q.teacher_id as owner_text, q.content, q.image, q.type, q.options,
       q.correct_index, q.correct_indices, q.correct_answer,
       q.grade as grade_text, q.subject as subject_text, q.level as level_text, q.explanation, q.topic,
       null::text as class_id, q.created_at
from v1etl.question_bank q where q.id is not null
union all
select 'ar:' || a.id, 'ar_' || case when length(a.id) > 100 then md5(a.id) else a.id end,
       2, a.teacher_id, a.content, a.image, a.type, a.options,
       a.correct_index, a.correct_indices, a.correct_answer,
       a.grade, a.subject, a.level, a.explanation, a.topic, null, a.created_at
from v1etl.arena_questions a where a.id is not null
union all
select 'ex:' || e.id || ':' || coalesce(q.v ->> 'id', q.ord::text),
       'ex_' || md5(e.id || ':' || coalesce(q.v ->> 'id', q.ord::text)),
       3, e.teacher_id,
       coalesce(q.v ->> 'content', q.v ->> 'question', q.v ->> 'text', q.v ->> 'title'),
       coalesce(q.v ->> 'image', q.v ->> 'imageUrl', q.v ->> 'image_url'),
       coalesce(q.v ->> 'type', q.v ->> 'questionType', q.v ->> 'question_type'),
       coalesce(q.v -> 'options', q.v -> 'choices',
                case when coalesce(q.v ->> 'type', '') !~* '(SHORT|FILL|TEXT|INPUT|ESSAY|BLANK)' then q.v -> 'answers' end),
       v1etl.try_int(coalesce(q.v ->> 'correctOptionIndex', q.v ->> 'correct_option_index', q.v ->> 'correctIndex',
                              q.v ->> 'correct_index', q.v ->> 'correctAnswerIndex')),
       nullif(v1etl.text_array(coalesce(q.v -> 'correctOptionIndices', q.v -> 'correct_option_indices',
                                        q.v -> 'correctIndices', q.v -> 'correct_indices')::text), '{}'),
       coalesce(q.v ->> 'correctAnswer', q.v ->> 'correct_answer', q.v ->> 'correctAnswerString', q.v ->> 'answer',
                case when coalesce(q.v ->> 'type', '') ~* '(SHORT|FILL|TEXT|INPUT|ESSAY|BLANK)'
                          and jsonb_typeof(q.v -> 'answers') = 'array'
                     then (select string_agg(x, '|') from jsonb_array_elements_text(q.v -> 'answers') x) end),
       coalesce(q.v ->> 'grade', e.grade), coalesce(q.v ->> 'subject', e.subject, e.category),
       coalesce(q.v ->> 'level', q.v ->> 'difficulty'), coalesce(q.v ->> 'explanation', q.v ->> 'explain'),
       coalesce(q.v ->> 'topic', e.title), e.class_id, e.created_at
from v1etl.exams e
cross join lateral jsonb_array_elements(case when jsonb_typeof(e.questions) = 'array' then e.questions else '[]'::jsonb end)
  with ordinality as q(v, ord)
where e.id is not null and jsonb_typeof(q.v) = 'object';

insert into v1etl.item_candidates
select s.legacy_ref, s.new_id, s.src_rank, s.owner_text, v1etl.strip_html(s.content),
       coalesce(nullif(s.image, ''), v1etl.first_img(s.content)), m.it,
       s.grade_text, s.subject_text, s.level_text, v1etl.strip_html(s.explanation), s.topic, s.class_id, s.created_at,
       md5((m.it ->> 'type') || '|' || v1etl.norm(s.content) || '|' ||
           coalesce((select string_agg(lower(coalesce(o ->> 'text', o ->> 'image', '')), '|' order by n)
                     from jsonb_array_elements(m.it -> 'payload' -> 'options') with ordinality as x(o, n)), ''))
from v1etl.questions_all s
cross join lateral (select v1etl.make_item(s.type, s.options, s.correct_index, s.correct_indices, s.correct_answer) as it) m
where m.it is not null and v1etl.strip_html(s.content) is not null
on conflict (legacy_ref) do nothing;

insert into v1etl.item_rejects (legacy_ref, old_type, content)
select s.legacy_ref, s.type, left(v1etl.strip_html(s.content), 200)
from v1etl.questions_all s
where not exists (select 1 from v1etl.item_candidates c where c.legacy_ref = s.legacy_ref)
on conflict do nothing;

-- Ghi item (mỗi mã băm một câu). Khối lớp: cột grade › lớp của đề thi › allowed_grades của GV › 1 (gắn tag cần kiểm tra).
with pick as (
  select distinct on (c.content_hash) c.*
  from v1etl.item_candidates c
  where not exists (select 1 from v2.items i where i.content_hash = c.content_hash)
    and not exists (select 1 from v2.items i where i.legacy_ref = c.legacy_ref or i.id = c.new_id)
  order by c.content_hash, c.src_rank, c.created_at nulls last, c.legacy_ref
),
resolved as (
  select p.*,
         op.id as owner_id,
         coalesce(v1etl.map_grade(p.grade_text), cl.grade,
                  (select v1etl.map_grade(g) from jsonb_array_elements_text(
                     case when jsonb_typeof(op.legacy -> 'allowed_grades') = 'array' then op.legacy -> 'allowed_grades' else '[]'::jsonb end) g
                   limit 1)) as grade_n
  from pick p
  left join v2.profiles op on op.id::text = p.owner_text and op.role in ('teacher', 'admin')
  left join v2.classes cl on cl.id = p.class_id
)
insert into v2.items (id, type, grade, subject, difficulty, prompt, payload, explanation, stars, tags, owner_id,
                      legacy_ref, content_hash, created_at)
select r.new_id, r.item ->> 'type', coalesce(r.grade_n, 1), v1etl.map_subject(r.subject_text),
       v1etl.map_difficulty(r.level_text),
       v2.jsonb_compact(jsonb_build_object('text', r.content, 'image', r.image)),
       r.item -> 'payload', r.explanation, 1,
       array_remove(array['v1', case when r.grade_n is null then 'can-kiem-tra-lop' end, left(r.topic, 80)], null),
       r.owner_id, r.legacy_ref, r.content_hash, coalesce(r.created_at, now())
from resolved r
on conflict (id) do nothing;

insert into v2.item_keys (item_id, key)
select c.new_id, c.item -> 'key'
from v1etl.item_candidates c
join v2.items i on i.id = c.new_id and i.legacy_ref = c.legacy_ref
on conflict (item_id) do nothing;

select 'items (v1)' as bảng, count(*) as số_dòng_v2 from v2.items where legacy_ref is not null
union all select 'item_keys (v1)', count(*) from v2.item_keys k join v2.items i on i.id = k.item_id where i.legacy_ref is not null
union all select 'câu trùng nội dung đã gộp', (select count(*) from v1etl.item_candidates) - (select count(distinct content_hash) from v1etl.item_candidates)
union all select 'câu không chuyển được', count(*) from v1etl.item_rejects;
