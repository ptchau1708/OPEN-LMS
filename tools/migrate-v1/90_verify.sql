-- =============================================================================
-- migrate-v1 · Kiểm tra: số dòng cũ (public) ↔ mới (v2). Chạy SAU bước 5, TRƯỚC 99_cleanup.sql.
-- "lệch" khác 0 không hẳn là lỗi — xem cột ghi_chú.
-- =============================================================================

with c as (
  select 'Hồ sơ HS/GV/admin' as hạng_mục,
         (select count(*) from v1etl.profiles) as cũ,
         (select count(*) from v2.profiles p where exists (select 1 from v1etl.profiles o where o.id = p.id::text)) as mới,
         'thiếu = id không có trong auth.users (không đăng nhập được)' as ghi_chú
  union all
  select 'Phụ huynh', (select count(*) from v1etl.parents),
         (select count(*) from v2.profiles p where p.role = 'parent' and exists (select 1 from v1etl.parents o where o.id = p.id::text)),
         'thiếu = không có tài khoản auth.users'
  union all
  select 'Liên kết phụ huynh–HS', (select count(*) from v1etl.parent_links), (select count(*) from v2.guardian_links),
         'thiếu = một bên chưa chuyển được'
  union all
  select 'Lớp', (select count(*) from v1etl.classes), (select count(*) from v2.classes c where exists (select 1 from v1etl.classes o where o.id = c.id)), ''
  union all
  select 'HS trong lớp (student_ids)',
         (select count(*) from v1etl.classes c cross join lateral unnest(coalesce(c.student_ids, '{}'))),
         (select count(*) from v2.class_members), 'mới có thể nhiều hơn: ghép thêm theo class_name'
  union all
  select 'HS chưa có lớp', null, (select count(*) from v2.profiles p where p.role = 'student' and p.class_id is null),
         'nên = 0; xếp lớp tay trên app GV'
  union all
  select 'Tổ/nhóm', (select count(*) from v1etl.class_groups), (select count(*) from v2.class_teams where id like 'cg\_%'), ''
  union all
  select 'Câu hỏi: question_bank', (select count(*) from v1etl.question_bank), (select count(*) from v2.items where legacy_ref like 'qb:%'),
         'thiếu = trùng nội dung hoặc không chuyển được'
  union all
  select 'Câu hỏi: arena_questions', (select count(*) from v1etl.arena_questions), (select count(*) from v2.items where legacy_ref like 'ar:%'), ''
  union all
  select 'Câu hỏi: exams.questions',
         (select count(*) from v1etl.exams e cross join lateral jsonb_array_elements(case when jsonb_typeof(e.questions) = 'array' then e.questions else '[]'::jsonb end)),
         (select count(*) from v2.items where legacy_ref like 'ex:%'), ''
  union all
  select 'Câu hỏi có đáp án', (select count(*) from v2.items where legacy_ref is not null),
         (select count(*) from v2.item_keys k join v2.items i on i.id = k.item_id where i.legacy_ref is not null), 'hai số phải bằng nhau'
  union all
  select 'Câu hỏi gộp vì trùng', null,
         (select count(*) - count(distinct content_hash) from v1etl.item_candidates), ''
  union all
  select 'Câu hỏi KHÔNG chuyển được', null, (select count(*) from v1etl.item_rejects), 'xem truy vấn chi tiết bên dưới'
  union all
  select 'Câu hỏi cần kiểm tra khối lớp', null, (select count(*) from v2.items where 'can-kiem-tra-lop' = any (tags)), 'tag can-kiem-tra-lop'
  union all
  select 'Khóa học', (select count(*) from v1etl.el_courses), (select count(*) from v2.courses where legacy_ref like 'el_course:%'), ''
  union all
  select 'Bài học', (select count(*) from v1etl.el_lessons), (select count(*) from v2.lessons where legacy_ref like 'el_lesson:%'), ''
  union all
  select 'Slide (bài cũ)', null,
         (select count(*) from v2.lesson_slides s join v2.lessons l on l.id = s.lesson_id where l.legacy_ref like 'el_lesson:%'), '2–4 slide mỗi bài'
  union all
  select 'Tiến độ bài học', (select count(*) from v1etl.el_progress), (select count(*) from v2.lesson_progress where lesson_id like 'el\_%'), ''
  union all
  select 'HS có điểm thi đua dương', (select count(distinct student_id) from v1etl.behavior_logs where points > 0),
         (select count(*) from v2.reward_ledger where dedupe_key = 'migrate:behavior'), ''
  union all
  select 'Tổng sao chuyển từ thi đua', (select coalesce(sum(points), 0) from v1etl.behavior_logs where points > 0),
         (select coalesce(sum(stars), 0) from v2.reward_ledger where dedupe_key = 'migrate:behavior'), 'bằng nhau nếu giữ quy đổi 1:1'
  union all
  select 'Hồ sơ Đấu trường', (select count(*) from v1etl.arena_profiles), (select count(*) from v2.arena_profiles), ''
  union all
  select 'Tổng XP Đấu trường', (select coalesce(sum(greatest(total_xp, 0)), 0) from v1etl.arena_profiles),
         (select coalesce(sum(xp), 0) from v2.reward_ledger where dedupe_key = 'migrate:arena'), ''
)
select hạng_mục, cũ, mới, case when cũ is not null then mới - cũ end as lệch, ghi_chú from c;

-- Chi tiết câu hỏi không chuyển được, theo dạng cũ
select coalesce(old_type, '(trống)') as dạng_cũ, count(*) as số_câu, min(legacy_ref) as ví_dụ
from v1etl.item_rejects group by 1 order by 2 desc;
