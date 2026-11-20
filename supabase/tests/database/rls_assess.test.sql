-- pgTAP: bảo mật Phase 4–5 — điểm, sao, đáp án, AI chấm, duyệt bài, TT27, thi đua, điểm danh, phụ huynh.
-- Bổ sung cho rls.test.sql (cùng bộ người dùng mẫu, id khác để hai file độc lập).
-- Chạy: supabase test db  |  tools/run-db-tests.sh [--plain]
--
--   T1 GV lớp 2A1        0000001b-…-01      S1 HS 2A1   0000001c-…-01      P1 phụ huynh của S2  0000001d-…-01
--   T2 GV lớp 2A2        0000001b-…-02      S2 HS 2A2   0000001c-…-02      P2 phụ huynh chưa liên kết 0000001d-…-02
--                                            S3 HS 2A2   0000001c-…-03
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(59);

-- ---------------------------------------------------------------------------
-- Dữ liệu mẫu (postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('0000001b-0000-0000-0000-000000000001', 'sec-gv1@test.local', '{"role":"teacher","name":"Cô Lan"}'),
  ('0000001b-0000-0000-0000-000000000002', 'sec-gv2@test.local', '{"role":"teacher","name":"Thầy Minh"}'),
  ('0000001c-0000-0000-0000-000000000001', 'secan@openlms.edu',  '{"role":"student","name":"An"}'),
  ('0000001c-0000-0000-0000-000000000002', 'secbinh@openlms.edu','{"role":"student","name":"Bình"}'),
  ('0000001c-0000-0000-0000-000000000003', 'secchi@openlms.edu', '{"role":"student","name":"Chi"}'),
  ('0000001d-0000-0000-0000-000000000001', 'sec-me@test.local',  '{"role":"parent","name":"Mẹ Bình"}'),
  ('0000001d-0000-0000-0000-000000000002', 'sec-bo@test.local',  '{"role":"parent","name":"Bố lạ"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('sec-2a1', '2A1', 2, '0000001b-0000-0000-0000-000000000001'),
  ('sec-2a2', '2A2', 2, '0000001b-0000-0000-0000-000000000002');
update v2.profiles set grade = 2, class_id = 'sec-2a1' where id = '0000001c-0000-0000-0000-000000000001';
update v2.profiles set grade = 2, class_id = 'sec-2a2' where id in ('0000001c-0000-0000-0000-000000000002', '0000001c-0000-0000-0000-000000000003');
insert into v2.class_members (class_id, user_id, role) values
  ('sec-2a1', '0000001c-0000-0000-0000-000000000001', 'student'),
  ('sec-2a2', '0000001c-0000-0000-0000-000000000002', 'student'),
  ('sec-2a2', '0000001c-0000-0000-0000-000000000003', 'student');
insert into v2.guardian_links (parent_id, student_id) values
  ('0000001d-0000-0000-0000-000000000001', '0000001c-0000-0000-0000-000000000002');

insert into v2.items (id, type, grade, subject, prompt, payload, owner_id) values
  ('sec-i1', 'MCQ', 2, 'toan', '{"text":"1+1"}', '{"options":[{"id":"a","text":"2"},{"id":"b","text":"3"}]}',
   '0000001b-0000-0000-0000-000000000001');
insert into v2.item_keys (item_id, key) values ('sec-i1', '{"correct":"a"}');

insert into v2.rubrics (id, title, subject, grade, model_answer, owner_id) values
  ('sec-r1', 'Viết đoạn văn', 'tieng-viet', 2, 'Bài mẫu bí mật', '0000001b-0000-0000-0000-000000000002');
insert into v2.work_tasks (id, title, subject, grade, rubric_id, class_id, created_by) values
  ('sec-w2', 'Tả con mèo', 'tieng-viet', 2, 'sec-r1', 'sec-2a2', '0000001b-0000-0000-0000-000000000002');
-- S2: một bài đã duyệt, một bài chờ GV duyệt. S3: bài đã duyệt (bạn cùng lớp, không phải con của P1).
insert into v2.submissions (id, task_id, student_id, class_id, kind, text, status) values
  ('00000000-5ec0-0000-0000-000000000001', 'sec-w2', '0000001c-0000-0000-0000-000000000002', 'sec-2a2', 'text', 'Con mèo…', 'approved'),
  ('00000000-5ec0-0000-0000-000000000002', 'sec-w2', '0000001c-0000-0000-0000-000000000002', 'sec-2a2', 'text', 'Bản 2', 'needs-review'),
  ('00000000-5ec0-0000-0000-000000000003', 'sec-w2', '0000001c-0000-0000-0000-000000000003', 'sec-2a2', 'text', 'Bài của Chi', 'approved');
insert into v2.ai_grades (submission_id, data, total, max, level, confidence, model)
select s.id, '{"total":7}', 7, 10, 'H', 0.8, 'test' from v2.submissions s where s.task_id = 'sec-w2';
insert into v2.grade_reviews (submission_id, teacher_id, decision, final) values
  ('00000000-5ec0-0000-0000-000000000001', '0000001b-0000-0000-0000-000000000002', 'approved', '{"total":7}'),
  ('00000000-5ec0-0000-0000-000000000003', '0000001b-0000-0000-0000-000000000002', 'approved', '{"total":9}');

insert into v2.tt27_evaluations (student_id, class_id, term_id, school_year, data, status) values
  ('0000001c-0000-0000-0000-000000000002', 'sec-2a2', 'GK1', '2026-2027', '{"generalComment":"Ngoan"}', 'final'),
  ('0000001c-0000-0000-0000-000000000002', 'sec-2a2', 'CK1', '2026-2027', '{"generalComment":"Nháp"}', 'draft'),
  ('0000001c-0000-0000-0000-000000000003', 'sec-2a2', 'GK1', '2026-2027', '{"generalComment":"Của Chi"}', 'final');
insert into v2.behaviors (class_id, id, label, points, kind) values ('sec-2a2', 'giup-ban', 'Giúp bạn', 2, 'positive');
insert into v2.behavior_logs (student_id, class_id, behavior_id, points) values
  ('0000001c-0000-0000-0000-000000000002', 'sec-2a2', 'giup-ban', 2),
  ('0000001c-0000-0000-0000-000000000003', 'sec-2a2', 'giup-ban', 2);
insert into v2.attendance (class_id, date, student_id, status) values
  ('sec-2a2', current_date, '0000001c-0000-0000-0000-000000000002', 'co-mat'),
  ('sec-2a2', current_date, '0000001c-0000-0000-0000-000000000003', 'vang-co-phep');
insert into v2.reward_ledger (user_id, stars, reason, source_type, dedupe_key) values
  ('0000001c-0000-0000-0000-000000000002', 5, 'test', 'bonus', 'sec:s2'),
  ('0000001c-0000-0000-0000-000000000003', 7, 'test', 'bonus', 'sec:s3');

-- ===========================================================================
-- HỌC SINH S2 (lớp 2A2): không sửa được điểm, sao, đáp án, AI chấm, duyệt, TT27
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000001c-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- sao (reward_ledger)
select throws_ok($$ update v2.reward_ledger set stars = 999 where user_id = auth.uid() $$, '42501', null,
  'HS không UPDATE được reward_ledger (sao)');
select throws_ok($$ delete from v2.reward_ledger where user_id = auth.uid() $$, '42501', null,
  'HS không DELETE được reward_ledger');
select throws_ok($$ insert into v2.reward_ledger (user_id, stars, reason, source_type) values (auth.uid(), 100, 'hack', 'bonus') $$,
  '42501', null, 'HS không INSERT được reward_ledger');
select throws_ok($$ select v2.award_bonus('0000001c-0000-0000-0000-000000000002', 5, 'tự thưởng') $$, '42501', null,
  'HS không tự thưởng sao bằng award_bonus');
select throws_ok($$ select v2.award('{"sourceType":"behavior","userId":"0000001c-0000-0000-0000-000000000002","stars":5,"reason":"x"}'::jsonb) $$,
  '42501', null, 'HS không tự thưởng sao bằng award({sourceType: behavior})');
select is((select stars from v2.wallets where user_id = '0000001c-0000-0000-0000-000000000002'), 5, 'ví HS2 vẫn 5 sao');
select is((select count(*)::int from v2.reward_ledger where user_id = '0000001c-0000-0000-0000-000000000003'), 0,
  'HS không đọc sổ sao của bạn cùng lớp');

-- đáp án (item_keys)
select is((select count(*)::int from v2.item_keys), 0, 'HS không đọc được item_keys');
select throws_ok($$ insert into v2.item_keys (item_id, key) values ('sec-i1', '{"correct":"b"}') $$, '42501', null,
  'HS không INSERT được item_keys');
update v2.item_keys set key = '{"correct":"b"}' where item_id = 'sec-i1';
delete from v2.items where id = 'sec-i1';   -- RLS lọc: không lỗi, 0 dòng — kiểm tra ở phần dưới

-- điểm / trạng thái bài nộp
select throws_ok($$ update v2.submissions set status = 'approved' where id = '00000000-5ec0-0000-0000-000000000002' $$,
  '42501', null, 'HS không đổi được trạng thái bài nộp (tự duyệt)');
select throws_ok($$ insert into v2.submissions (task_id, student_id, class_id, kind, text, status)
                   values ('sec-w2', auth.uid(), 'sec-2a2', 'text', 'x', 'approved') $$,
  '42501', null, 'HS không nộp bài ở trạng thái approved');
select throws_ok($$ insert into v2.submissions (task_id, student_id, class_id, kind, text, status, submitted_by)
                   values ('sec-w2', '0000001c-0000-0000-0000-000000000003', 'sec-2a2', 'text', 'x', 'submitted', 'student') $$,
  '42501', null, 'HS không nộp bài thay bạn khác');
select lives_ok($$ insert into v2.submissions (task_id, student_id, class_id, kind, text)
                   values ('sec-w2', auth.uid(), 'sec-2a2', 'text', 'Bài mới') $$, 'HS nộp bài của mình được');
select is((select count(*)::int from v2.submissions where student_id = '0000001c-0000-0000-0000-000000000003'), 0,
  'HS không thấy bài nộp của bạn cùng lớp');

-- AI chấm & duyệt bài
select throws_ok($$ update v2.ai_grades set total = 10 $$, '42501', null, 'HS không UPDATE được ai_grades');
select throws_ok($$ insert into v2.ai_grades (submission_id, data, total, max, level, confidence, model)
                   values ('00000000-5ec0-0000-0000-000000000002', '{}', 10, 10, 'T', 1, 'hack') $$,
  '42501', null, 'HS không INSERT được ai_grades');
select throws_ok($$ delete from v2.ai_grades $$, '42501', null, 'HS không DELETE được ai_grades');
select throws_ok($$ insert into v2.grade_reviews (submission_id, decision) values ('00000000-5ec0-0000-0000-000000000002', 'approved') $$,
  '42501', null, 'HS không tự duyệt bài (grade_reviews)');
select throws_ok($$ update v2.grade_reviews set final = '{"total":10}' $$, '42501', null, 'HS không sửa được điểm chốt');
select is((select count(*)::int from v2.ai_grades where submission_id = '00000000-5ec0-0000-0000-000000000001'), 1,
  'HS thấy điểm AI của bài ĐÃ duyệt');
select is((select count(*)::int from v2.ai_grades where submission_id = '00000000-5ec0-0000-0000-000000000002'), 0,
  'HS KHÔNG thấy điểm AI khi GV chưa duyệt');
select is((select count(*)::int from v2.ai_grades where submission_id = '00000000-5ec0-0000-0000-000000000003'), 0,
  'HS không thấy điểm của bạn');
select is((select count(*)::int from v2.rubrics), 0, 'HS không đọc được rubric (bài mẫu)');

-- TT27
select is((select count(*)::int from v2.tt27_evaluations where student_id = auth.uid()), 1, 'HS chỉ thấy TT27 bản final của mình');
select is((select count(*)::int from v2.tt27_evaluations where student_id = '0000001c-0000-0000-0000-000000000003'), 0,
  'HS không thấy TT27 của bạn');
select throws_ok($$ insert into v2.tt27_evaluations (student_id, class_id, term_id, school_year, data, status)
                   values (auth.uid(), 'sec-2a2', 'GK2', '2026-2027', '{}', 'final') $$,
  '42501', null, 'HS không tự ghi TT27');
update v2.tt27_evaluations set data = '{"generalComment":"Xuất sắc"}' where student_id = auth.uid();
delete from v2.tt27_evaluations where student_id = auth.uid();

-- thi đua & điểm danh
select throws_ok($$ insert into v2.behavior_logs (student_id, class_id, behavior_id, points) values (auth.uid(), 'sec-2a2', 'giup-ban', 5) $$,
  '42501', null, 'HS không ghi được behavior_logs');
select throws_ok($$ select v2.record_behavior('sec-2a2', 'giup-ban', array['0000001c-0000-0000-0000-000000000002'::uuid]) $$,
  '42501', null, 'HS không gọi được record_behavior');
select is((select count(*)::int from v2.behavior_logs where student_id = '0000001c-0000-0000-0000-000000000003'), 0,
  'HS không thấy thi đua của bạn');
select throws_ok($$ insert into v2.attendance (class_id, date, student_id, status) values ('sec-2a2', current_date + 1, auth.uid(), 'co-mat') $$,
  '42501', null, 'HS không tự điểm danh');
update v2.attendance set status = 'co-mat' where student_id = '0000001c-0000-0000-0000-000000000003';
select is((select count(*)::int from v2.attendance where student_id = '0000001c-0000-0000-0000-000000000003'), 0,
  'HS không thấy điểm danh của bạn');
select throws_ok($$ select v2.get_student_extras('0000001c-0000-0000-0000-000000000003') $$, '42501', null,
  'HS không mở được hồ sơ (extras) của bạn');
-- hồ sơ của bạn: chỉ tên/linh vật, không đổi được
update v2.profiles set name = 'Bị đổi' where id = '0000001c-0000-0000-0000-000000000003';

-- ===========================================================================
-- Kiểm tra dữ liệu không bị đổi (postgres, bỏ qua RLS)
-- ===========================================================================
reset role;
select is((select key ->> 'correct' from v2.item_keys where item_id = 'sec-i1'), 'a', 'đáp án không bị HS sửa');
select is((select count(*)::int from v2.items where id = 'sec-i1'), 1, 'câu hỏi không bị HS xóa');
select is((select data ->> 'generalComment' from v2.tt27_evaluations where student_id = '0000001c-0000-0000-0000-000000000002' and term_id = 'GK1'),
  'Ngoan', 'nhận xét TT27 không bị HS sửa');
select is((select count(*)::int from v2.tt27_evaluations where student_id = '0000001c-0000-0000-0000-000000000002'), 2,
  'TT27 không bị HS xóa');
select is((select status from v2.attendance where student_id = '0000001c-0000-0000-0000-000000000003'), 'vang-co-phep',
  'điểm danh của bạn không bị HS sửa');
select is((select name from v2.profiles where id = '0000001c-0000-0000-0000-000000000003'), 'Chi', 'HS không đổi được tên bạn');
select is((select status from v2.submissions where id = '00000000-5ec0-0000-0000-000000000002'), 'needs-review',
  'bài chờ duyệt vẫn chờ duyệt');

-- ===========================================================================
-- PHỤ HUYNH P1 (con: S2) — chỉ con mình, chỉ bài đã duyệt
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000001d-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.submissions), 1, 'PH chỉ thấy 1 bài: bài ĐÃ duyệt của con');
select is((select id from v2.submissions), '00000000-5ec0-0000-0000-000000000001'::uuid, 'đúng bài đã duyệt của con');
select is((select count(*)::int from v2.ai_grades), 1, 'PH chỉ thấy điểm AI của bài đã duyệt của con');
select is((select count(*)::int from v2.grade_reviews), 1, 'PH chỉ thấy kết quả duyệt của con');
select is((select count(*)::int from v2.tt27_evaluations), 1, 'PH chỉ thấy TT27 bản final của con');
select is((select count(*)::int from v2.reward_ledger), 1, 'PH chỉ thấy sổ sao của con');
select is((select count(*)::int from v2.behavior_logs), 1, 'PH chỉ thấy thi đua của con');
select is((select count(*)::int from v2.attendance), 1, 'PH chỉ thấy điểm danh của con');
select is(jsonb_array_length(v2.get_student_extras('0000001c-0000-0000-0000-000000000002') -> 'works'), 1,
  'get_student_extras: PH chỉ nhận bài đã duyệt');
select is(v2.get_student_extras('0000001c-0000-0000-0000-000000000002') -> 'tt27' ->> 'status', 'final',
  'get_student_extras: PH chỉ nhận TT27 final');
select throws_ok($$ select v2.get_student_extras('0000001c-0000-0000-0000-000000000003') $$, '42501', null,
  'PH không mở được hồ sơ HS không phải con mình');
select throws_ok($$ insert into v2.tt27_evaluations (student_id, class_id, term_id, school_year, data)
                   values ('0000001c-0000-0000-0000-000000000002', 'sec-2a2', 'GK2', '2026-2027', '{}') $$,
  '42501', null, 'PH không ghi được TT27');
select throws_ok($$ update v2.reward_ledger set stars = 100 $$, '42501', null, 'PH không sửa được sao');
select throws_ok($$ insert into v2.guardian_links (parent_id, student_id) values (auth.uid(), '0000001c-0000-0000-0000-000000000003') $$,
  '42501', null, 'PH không tự liên kết với HS khác');

-- PHỤ HUYNH P2 (chưa liên kết) — không thấy gì
select set_config('request.jwt.claims', '{"sub":"0000001d-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.submissions) + (select count(*)::int from v2.tt27_evaluations)
        + (select count(*)::int from v2.reward_ledger) + (select count(*)::int from v2.attendance), 0,
  'PH chưa liên kết không thấy dữ liệu HS nào');

-- ===========================================================================
-- GIÁO VIÊN
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"0000001b-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.submissions where class_id = 'sec-2a2'), 0, 'GV lớp khác không thấy bài nộp');
select throws_ok($$ insert into v2.tt27_evaluations (student_id, class_id, term_id, school_year, data)
                   values ('0000001c-0000-0000-0000-000000000002', 'sec-2a2', 'GK2', '2026-2027', '{}') $$,
  '42501', null, 'GV lớp khác không ghi được TT27');
select throws_ok($$ update v2.ai_grades set total = 10 $$, '42501', null, 'GV cũng không sửa trực tiếp ai_grades (chỉ Edge Function)');

select set_config('request.jwt.claims', '{"sub":"0000001b-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.tt27_evaluations where class_id = 'sec-2a2'), 3, 'GV chủ nhiệm thấy cả bản nháp TT27');
select is((select count(*)::int from v2.ai_grades), 3, 'GV chủ nhiệm thấy điểm AI mọi bài của lớp');

reset role;
select * from finish();
rollback;
