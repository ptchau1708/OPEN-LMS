-- pgTAP: Phase 6 — đề kiểm tra: HS không đọc bài làm/đáp án của người khác, không tự sửa điểm; GV chỉ thấy lớp mình;
-- chỉ service role ghi điểm; kết quả theo chế độ công bố; làm lại; mở trùng phiên.
-- Chạy: supabase test db  |  tools/run-db-tests.sh [--plain]
--   T1 GV 4A 000e6b..01 · T2 GV 4B 000e6b..02 · S1,S2 HS 4A 000e6c..01/02 · S3 HS 4B 000e6c..03
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000e6b00-0000-0000-0000-000000000001', 'e6-gv1@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('000e6b00-0000-0000-0000-000000000002', 'e6-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('000e6c00-0000-0000-0000-000000000001', 'e6an@openlms.edu', '{"role":"student","name":"An"}'),
  ('000e6c00-0000-0000-0000-000000000002', 'e6binh@openlms.edu', '{"role":"student","name":"Bình"}'),
  ('000e6c00-0000-0000-0000-000000000003', 'e6chi@openlms.edu', '{"role":"student","name":"Chi"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('e6-4a', '4A', 4, '000e6b00-0000-0000-0000-000000000001'),
  ('e6-4b', '4B', 4, '000e6b00-0000-0000-0000-000000000002');
update v2.profiles set grade = 4, class_id = 'e6-4a' where id in ('000e6c00-0000-0000-0000-000000000001', '000e6c00-0000-0000-0000-000000000002');
update v2.profiles set grade = 4, class_id = 'e6-4b' where id = '000e6c00-0000-0000-0000-000000000003';
insert into v2.items (id, type, grade, subject, difficulty, prompt, payload) values
  ('e6-it1', 'MCQ', 4, 'toan', 'nhan-biet', '{"text":"1 + 1 = ?"}', '{"options":[{"id":"a","text":"2"},{"id":"b","text":"3"}]}'),
  ('e6-it2', 'SHORT_ANSWER', 4, 'toan', 'van-dung', '{"text":"2 + 2 = ?"}', '{}'),
  ('e6-it3', 'MCQ', 4, 'toan', 'ket-noi', '{"text":"Ngoài đề"}', '{"options":[{"id":"a","text":"x"}]}');
insert into v2.item_keys (item_id, key) values ('e6-it1', '{"correct":"a"}'), ('e6-it2', '{"accepted":["4"]}'), ('e6-it3', '{"correct":"a"}');

-- ===================== GV T1 ra đề =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000e6b00-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into v2.exam_matrices (id, title, subject, grade, rows, cells) values ('e6-mt', 'Toán 4', 'toan', 4, '[]', '{}') $$, 'GV tạo ma trận');
select lives_ok($$ insert into v2.exams (id, title, subject, grade, class_id, open_at, close_at, status, results_policy, paper) values
  ('e6-ex', 'KT Toán 4', 'toan', 4, 'e6-4a', now() - interval '1 hour', now() + interval '1 day', 'published', 'after-release',
   '{"A":[{"id":"s1","no":1,"rowId":"r","level":1,"qtype":"tn","points":1,"itemId":"e6-it1"},{"id":"s2","no":2,"rowId":"r","level":3,"qtype":"tl","points":1,"itemId":"e6-it2"}],
     "B":[{"id":"s1","no":1,"rowId":"r","level":1,"qtype":"tn","points":1,"itemId":"e6-it1"},{"id":"s2","no":2,"rowId":"r","level":3,"qtype":"tl","points":1,"itemId":"e6-it2"}]}') $$,
  'GV ra đề cho lớp mình');
select throws_ok($$ insert into v2.exams (id, title, subject, grade, class_id, open_at, close_at, paper) values
  ('e6-ex2', 'Lạ', 'toan', 4, 'e6-4b', now(), now() + interval '1 day', '{"A":[],"B":[]}') $$, '42501', null, 'GV không ra đề cho lớp khác');
reset role;

-- ===================== HS S1 =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000e6c00-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.exam_my_list()), 1, 'HS thấy đề được giao trên Hôm nay');
select is((select count(*)::int from v2.exams), 0, 'HS không đọc thẳng bảng đề (paper)');
reset role;
create temporary table e6_s1 on commit drop as select v2.exam_start('e6-ex', 'session-s1-aaaa') as j;
grant select on e6_s1 to authenticated, service_role;
set local role authenticated;
select is(jsonb_array_length((select j -> 'items' from e6_s1)), 2, 'bắt đầu: nhận 2 câu');
select ok(not exists (select 1 from e6_s1, jsonb_array_elements(j -> 'items') i where i ? 'key'), 'câu gửi xuống KHÔNG có đáp án');
select is((select count(*)::int from v2.item_keys where item_id like 'e6-%'), 0, 'HS không đọc item_keys');
select lives_ok($$ select v2.exam_save_answer((select (j ->> 'attemptId')::uuid from e6_s1), 'e6-it1', '{"choice":"a"}', 9000, false) $$, 'tự lưu câu trả lời');
select throws_ok($$ select v2.exam_save_answer((select (j ->> 'attemptId')::uuid from e6_s1), 'e6-it3', '{"choice":"a"}', 1, false) $$, '22023', null, 'không lưu câu ngoài đề');
select is(v2.exam_log_integrity((select (j ->> 'attemptId')::uuid from e6_s1),
  '[{"kind":"hidden","at":"2026-01-01T00:00:00Z","awayMs":5000},{"kind":"blur"},{"kind":"hack"}]'), 2, 'ghi 2 sự kiện hợp lệ, bỏ kiểu lạ');
select is((select count(*)::int from v2.exam_attempts), 0, 'HS không đọc bảng bài làm (kể cả của mình — chỉ qua RPC)');
select throws_ok($$ update v2.exam_attempts set score10 = 10 $$, '42501', null, 'HS không sửa điểm');
select throws_ok($$ insert into v2.exam_answers (attempt_id, item_id, response) values ((select (j ->> 'attemptId')::uuid from e6_s1), 'e6-it2', '{}') $$, '42501', null, 'HS không ghi thẳng câu trả lời');
select throws_ok($$ select v2.exam_record_results((select (j ->> 'attemptId')::uuid from e6_s1), '[]', 10, 10, 10, false, '[]') $$, '42501', null, 'HS không gọi được hàm ghi điểm');
select is((v2.exam_start('e6-ex', 'session-s1-bbbb') ->> 'otherSession')::boolean, true, 'mở bài ở tab thứ hai → báo mở trùng');
reset role;

-- ===================== HS S2 (cùng lớp) =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000e6c00-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select v2.exam_save_answer((select (j ->> 'attemptId')::uuid from e6_s1), 'e6-it1', '{"choice":"b"}', 1, false) $$, '42501', null, 'bạn khác không sửa bài của S1');
select throws_ok($$ select v2.exam_log_integrity((select (j ->> 'attemptId')::uuid from e6_s1), '[]') $$, '42501', null, 'bạn khác không ghi sự kiện vào bài S1');
select is((select count(*)::int from v2.exam_answers), 0, 'bạn khác không đọc câu trả lời');
select is((v2.exam_start('e6-ex', 'session-s2-aaaa') ->> 'attemptNo')::int, 1, 'S2 bắt đầu bài của mình');
reset role;

-- ===================== HS S3 (lớp khác) =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000e6c00-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(jsonb_array_length(v2.exam_my_list()), 0, 'HS lớp khác không thấy đề');
select throws_ok($$ select v2.exam_start('e6-ex', 'session-s3-aaaa') $$, 'P0002', null, 'HS lớp khác không mở được đề');
reset role;

-- ===================== GV =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000e6b00-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.exam_attempts), 0, 'GV lớp khác không thấy bài làm');
select throws_ok($$ select v2.exam_allow_retake('e6-ex', '000e6c00-0000-0000-0000-000000000001') $$, '42501', null, 'GV lớp khác không cho làm lại');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000e6b00-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.exam_attempts), 2, 'GV lớp thấy 2 bài làm');
select ok((select count(*) from v2.integrity_events) >= 3, 'GV thấy sự kiện rời màn hình / mở trùng');
select throws_ok($$ update v2.exam_attempts set score10 = 10 $$, '42501', null, 'GV cũng không sửa điểm trực tiếp');
reset role;

-- ===================== service role (Edge Function grade) =====================
set local role service_role;
select ok(v2.exam_record_results((select (j ->> 'attemptId')::uuid from e6_s1),
  '[{"itemId":"e6-it1","slotId":"s1","correct":true,"score":1,"earned":1,"points":1},{"itemId":"e6-it2","slotId":"s2","correct":false,"score":0,"earned":0,"points":1}]',
  1, 2, 5, false, '[{"itemId":"e6-it1","correct":true,"score":1,"skills":["T4.STN.DOC-VIET"]},{"itemId":"e6-it2","correct":false,"score":0}]'), 'ghi điểm');
select ok(not v2.exam_record_results((select (j ->> 'attemptId')::uuid from e6_s1), '[]', 2, 2, 10, false, '[]'), 'không ghi đè bài đã nộp');
select is((select count(*)::int from v2.learning_events where object_type = 'exam' and user_id = '000e6c00-0000-0000-0000-000000000001'), 2, 'sự kiện exam cho thành thạo');
reset role;

-- ===================== kết quả & làm lại =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000e6c00-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(not (v2.exam_my_result('e6-ex') ? 'score10'), 'chưa công bố → HS chưa thấy điểm');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000e6b00-0000-0000-0000-000000000001","role":"authenticated"}', true);
update v2.exams set released_at = now() where id = 'e6-ex';
select lives_ok($$ select v2.exam_allow_retake('e6-ex', '000e6c00-0000-0000-0000-000000000001') $$, 'GV cho S1 làm lại');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000e6c00-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.exam_my_result('e6-ex') ->> 'score10')::int, 5, 'đã công bố → HS thấy điểm');
select is((v2.exam_start('e6-ex', 'session-s1-cccc') ->> 'attemptNo')::int, 2, 'làm lại → lần 2');
reset role;

select * from finish();
rollback;
