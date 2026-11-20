-- =============================================================================
-- migrate-v1 · Đối soát: số bản ghi cũ (public) ↔ mới (v2) theo từng hạng mục.
-- Chạy SAU bước 6 (cần schema v1etl). Kết quả: VIEW v1etl.reconcile + bảng Markdown (cột "markdown").
--   cũ       số bản ghi app cũ
--   bỏ_qua   số bản ghi biết trước là không chuyển (không có tài khoản, trùng, dạng câu chưa hỗ trợ…) — xem lý do
--            ở 90_verify.sql và v1etl.history_rejects
--   mới      số bản ghi tương ứng trong v2
--   lệch     cũ − bỏ_qua − mới; trạng_thái 'OK' khi lệch = 0
-- tools/migrate-v1/run.mjs ghi bảng này ra reports/reconcile-<thời điểm>.md và .csv.
-- =============================================================================

create or replace view v1etl.reconcile as
with old_users as (
  select id from v1etl.profiles where id is not null
  union select id from v1etl.parents where id is not null
),
member_pairs as (
  select distinct c.id as class_id, btrim(sid) as student_id
  from v1etl.classes c cross join lateral unnest(coalesce(c.student_ids, '{}')) as sid
  where c.id is not null and btrim(sid) <> ''
),
qcount as (
  select (select count(*) from v1etl.question_bank) + (select count(*) from v1etl.arena_questions)
       + (select count(*) from v1etl.exams e
            cross join lateral jsonb_array_elements(case when jsonb_typeof(e.questions) = 'array' then e.questions else '[]'::jsonb end)) as n
),
ai_old as (select g.* from v1etl.ai_grades g),
rows as (
  select 1 as ord, 'Người dùng (HS, GV, admin, phụ huynh)' as hạng_mục,
         (select count(*) from old_users) as cũ,
         (select count(*) from old_users u where not exists (select 1 from auth.users a where a.id::text = u.id)) as bỏ_qua,
         (select count(*) from v2.profiles p where p.id::text in (select id from old_users)) as mới,
         'bỏ qua = id không có trong auth.users' as ghi_chú
  union all
  select 2, 'Lớp', (select count(*) from v1etl.classes where id is not null), 0,
         (select count(*) from v2.classes c where c.id in (select id from v1etl.classes)), ''
  union all
  select 3, 'Thành viên lớp (HS)', (select count(*) from member_pairs),
         (select count(*) from member_pairs m where not exists (
            select 1 from v2.profiles p where p.id::text = m.student_id and p.role = 'student')),
         (select count(*) from member_pairs m where exists (
            select 1 from v2.class_members cm where cm.class_id = m.class_id and cm.user_id::text = m.student_id)),
         'v2 có thể có thêm HS ghép theo class_name: ' || (select count(*) from v2.class_members cm
            where cm.role = 'student' and not exists (select 1 from member_pairs m where m.class_id = cm.class_id and m.student_id = cm.user_id::text))
  union all
  select 4, 'Câu hỏi → items', (select n from qcount),
         (select count(*) from v1etl.item_rejects) + (select count(*) - count(distinct content_hash) from v1etl.item_candidates),
         (select count(*) from v2.items where legacy_ref is not null),
         'bỏ qua = dạng chưa hỗ trợ + câu trùng được gộp'
  union all
  select 5, 'Đề thi → bài giao (có kết quả)', (select count(*) from v1etl.exams where id is not null),
         (select count(*) from v1etl.exams e where e.id is not null and not exists (select 1 from v1etl.results_ok o where o.exam_id = e.id)),
         (select count(*) from v2.work_tasks where id like 'v1ex\_%'),
         'bỏ qua = đề chưa có kết quả hoặc không gắn lớp (câu hỏi vẫn sang items)'
  union all
  select 6, 'Kết quả bài kiểm tra → submissions', (select count(*) from v1etl.results where id is not null),
         (select count(*) from v1etl.history_rejects where loại = 'result'),
         (select count(*) from v2.submissions s where s.id in (select submission_id from v1etl.results_x)), ''
  union all
  select 7, 'Điểm thi đua (+) → reward_ledger: số HS',
         (select count(distinct student_id) from v1etl.behavior_logs where points > 0),
         (select count(distinct b.student_id) from v1etl.behavior_logs b where b.points > 0
            and not exists (select 1 from v2.profiles p where p.id::text = b.student_id and p.role = 'student')),
         (select count(*) from v2.reward_ledger where dedupe_key = 'migrate:behavior'), ''
  union all
  select 8, 'Điểm thi đua (+) → reward_ledger: tổng sao',
         (select coalesce(sum(points), 0) from v1etl.behavior_logs where points > 0),
         (select coalesce(sum(b.points), 0) from v1etl.behavior_logs b where b.points > 0
            and not exists (select 1 from v2.profiles p where p.id::text = b.student_id and p.role = 'student')),
         (select coalesce(sum(stars), 0) from v2.reward_ledger where dedupe_key = 'migrate:behavior'),
         'lệch nếu đổi tỉ lệ quy đổi trong 05_rewards.sql'
  union all
  select 9, 'AI chấm → ai_grades', (select count(*) from ai_old),
         (select count(*) from v1etl.history_rejects where loại = 'ai_grade')
           + (select count(*) - count(distinct result_id) from ai_old where result_id is not null),
         (select count(*) from v2.ai_grades g where g.model like 'v1:%' and g.model <> 'v1:diem-cu'),
         'nhiều bản AI cho cùng bài: giữ bản mới nhất'
  union all
  select 10, 'Nhận xét TT27 → tt27_evaluations', (select count(*) from v1etl.tt27 where id is not null),
         (select count(*) from v1etl.history_rejects where loại = 'tt27'),
         (select count(*) from v1etl.tt27_x x where exists (select 1 from v2.tt27_evaluations e
            where e.student_id = x.student_uuid and e.term_id = x.term_id and e.school_year = x.school_year)),
         'mới = số nhận xét cũ đã có phiếu (HS × kì × năm học); GV đã sửa trên app mới: '
           || (select count(*) from v2.tt27_evaluations e where coalesce(e.data ->> '_v1', '') <> 'true'
                 and exists (select 1 from v1etl.tt27_x x where e.student_id = x.student_uuid and e.term_id = x.term_id and e.school_year = x.school_year))
)
select ord, hạng_mục, cũ::bigint, bỏ_qua::bigint, mới::bigint, (cũ - bỏ_qua - mới)::bigint as lệch,
       case when cũ - bỏ_qua - mới = 0 then 'OK' else 'LỆCH' end as trạng_thái, ghi_chú
from rows;

select hạng_mục, cũ, bỏ_qua, mới, lệch, trạng_thái, ghi_chú from v1etl.reconcile order by ord;

-- Bảng Markdown (dán vào báo cáo / issue)
select '| Hạng mục | Cũ | Bỏ qua | Mới | Lệch | Trạng thái | Ghi chú |' || E'\n' ||
       '|---|---:|---:|---:|---:|---|---|' || E'\n' ||
       string_agg(format('| %s | %s | %s | %s | %s | %s | %s |', hạng_mục, cũ, bỏ_qua, mới, lệch, trạng_thái,
                         replace(ghi_chú, '|', '/')), E'\n' order by ord) as markdown
from v1etl.reconcile;
