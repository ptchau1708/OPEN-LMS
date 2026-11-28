-- pgTAP: SQL 26 — Ôn thi: dạng câu Đúng – Sai nhiều ý; bài luyện cả khối; HS không đọc bảng / đáp án trước khi nộp;
-- khóa theo thứ tự; chỉ service role ghi điểm; bảng xếp hạng điểm → thời gian → câu sai; GV chỉ sửa bài mình tạo.
-- Chạy: supabase test db  |  tools/run-db-tests.sh [--plain]
--   T1 GV 5A 0000b501..01 · T2 GV 5B ..02 · S1 HS 5A 0000b502..01 · S2 HS 5B ..02 · S3 HS 4A ..03
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

insert into auth.users (id, email, raw_user_meta_data) values
  ('0000b501-0000-0000-0000-000000000001', 'ot-gv1@test.local', '{"role":"teacher","name":"Thầy Quang"}'),
  ('0000b501-0000-0000-0000-000000000002', 'ot-gv2@test.local', '{"role":"teacher","name":"Cô Mai"}'),
  ('0000b502-0000-0000-0000-000000000001', 'otkhang@openlms.edu', '{"role":"student","name":"Khang"}'),
  ('0000b502-0000-0000-0000-000000000002', 'otngan@openlms.edu', '{"role":"student","name":"Ngân"}'),
  ('0000b502-0000-0000-0000-000000000003', 'otvy@openlms.edu', '{"role":"student","name":"Vy"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('ot-5a', '5A', 5, '0000b501-0000-0000-0000-000000000001'),
  ('ot-5b', '5B', 5, '0000b501-0000-0000-0000-000000000002'),
  ('ot-4a', '4A', 4, '0000b501-0000-0000-0000-000000000002');
update v2.profiles set grade = null, class_id = 'ot-5a' where id = '0000b502-0000-0000-0000-000000000001';
update v2.profiles set grade = 5, class_id = 'ot-5b' where id = '0000b502-0000-0000-0000-000000000002';
update v2.profiles set grade = 4, class_id = 'ot-4a' where id = '0000b502-0000-0000-0000-000000000003';

select lives_ok($$ insert into v2.items (id, type, grade, subject, prompt, payload) values
  ('ot-tf', 'TRUE_FALSE_MULTI', 5, 'toan', '{"text":"Đúng hay sai?"}', '{"statements":[{"id":"a","text":"1 < 2"},{"id":"b","text":"3 < 2"}]}') $$,
  'bảng items nhận dạng TRUE_FALSE_MULTI');
insert into v2.items (id, type, grade, subject, prompt, payload) values
  ('ot-q1', 'MCQ', 5, 'tieng-viet', '{"text":"Câu 1"}', '{"options":[{"id":"a","text":"x"},{"id":"b","text":"y"}]}'),
  ('ot-q2', 'MCQ', 5, 'tieng-viet', '{"text":"Câu 2"}', '{"options":[{"id":"a","text":"x"},{"id":"b","text":"y"}]}'),
  ('ot-q4', 'MCQ', 4, 'tieng-viet', '{"text":"Lớp 4"}', '{"options":[{"id":"a","text":"x"},{"id":"b","text":"y"}]}');
insert into v2.item_keys (item_id, key) values ('ot-tf', '{"truth":{"a":true,"b":false}}'), ('ot-q1', '{"correct":"a"}'), ('ot-q2', '{"correct":"b"}');
select ok(position('TRUE_FALSE_MULTI' in pg_get_functiondef('v2._upsert_item(jsonb,uuid,uuid,boolean)'::regprocedure)) > 0, '_upsert_item nhận dạng mới');

-- ===================== GV T1 tạo bài =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000b501-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temporary table ot_sets (k text, j jsonb) on commit drop;
grant all on ot_sets to authenticated, service_role;
insert into ot_sets select 'b1', v2.onthi_set_save('{"style":"tn","title":"TV 5 – Bài 1","grade":5,"subject":"tieng-viet","itemIds":["ot-q1","ot-q2"],"minutes":5,"points":10,"passScore":20,"position":1}');
insert into ot_sets select 'b2', v2.onthi_set_save('{"style":"tn","title":"TV 5 – Bài 2","grade":5,"subject":"tieng-viet","itemIds":["ot-q2"],"minutes":5,"points":10,"passScore":10,"lockOrder":true,"position":2}');
select is((select (j ->> 'passScore')::numeric from ot_sets where k = 'b1'), 20::numeric, 'GV tạo bài luyện');
select throws_ok($$ select v2.onthi_set_save('{"style":"tn","title":"Lẫn lớp","grade":5,"subject":"tieng-viet","itemIds":["ot-q1","ot-q4"],"minutes":5,"points":10}') $$, '22023', null, 'không cho trộn câu lớp khác');
select throws_ok($$ select v2.onthi_set_save('{"style":"tn","title":"Mức đạt lạ","grade":5,"subject":"tieng-viet","itemIds":["ot-q1"],"minutes":5,"points":10,"passScore":50}') $$, '22023', null, 'mức đạt không vượt điểm tối đa');
select throws_ok($$ select v2.onthi_set_save('{"style":"abc","title":"X","grade":5,"itemIds":["ot-q1"],"minutes":5,"points":1}') $$, '22023', null, 'kiểu bài chỉ tn hoặc vio');
select is(jsonb_array_length(v2.onthi_sets_list('tn', 5)), 2, 'GV xem danh sách bài theo kiểu và khối');
select throws_ok($$ select count(*) from v2.onthi_sets $$, '42501', null, 'không ai đọc thẳng bảng bài luyện (chỉ qua RPC)');
reset role;

-- ===================== GV T2: không sửa bài của T1 =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000b501-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$ select v2.onthi_set_save(%L::jsonb) $$, (select j from ot_sets where k = 'b1') || '{"title":"Đổi"}'), '42501', null, 'GV khác không sửa bài');
select throws_ok(format($$ select v2.onthi_set_delete(%L) $$, (select j ->> 'id' from ot_sets where k = 'b1')), '42501', null, 'GV khác không xoá bài');
reset role;

-- ===================== HS S1 (5A, khối lấy theo lớp) =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000b502-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.onthi_my_cards('tn')), 2, 'HS khối 5 thấy 2 bài (khối lấy theo lớp khi hồ sơ thiếu)');
select is((select (x ->> 'locked')::boolean from jsonb_array_elements(v2.onthi_my_cards('tn')) x where x ->> 'title' = 'TV 5 – Bài 2'), true, 'bài 2 khóa khi chưa đạt bài 1');
select throws_ok(format($$ select v2.onthi_start(%L) $$, (select j ->> 'id' from ot_sets where k = 'b2')), 'P0001', null, 'không mở được bài đang khóa');
create temporary table ot_s1 (j jsonb) on commit drop;
grant all on ot_s1 to authenticated, service_role;
insert into ot_s1 select v2.onthi_start((select (j ->> 'id')::uuid from ot_sets where k = 'b1'));
select is(jsonb_array_length((select j -> 'items' from ot_s1)), 2, 'mở bài: nhận 2 câu theo thứ tự');
select ok(not exists (select 1 from ot_s1, jsonb_array_elements(j -> 'items') i where i ? 'key'), 'câu gửi xuống KHÔNG có đáp án');
select is((v2.onthi_start((select (j ->> 'id')::uuid from ot_sets where k = 'b1')) ->> 'attemptId'), (select j ->> 'attemptId' from ot_s1), 'mở lại → tiếp tục lần đang làm');
select lives_ok($$ select v2.onthi_save_answer((select (j ->> 'attemptId')::uuid from ot_s1), 'ot-q1', '{"choice":"a"}', 4000) $$, 'tự lưu câu trả lời');
select throws_ok($$ select v2.onthi_save_answer((select (j ->> 'attemptId')::uuid from ot_s1), 'ot-tf', '{"picks":{}}', 1) $$, '22023', null, 'không lưu câu ngoài bài');
select throws_ok($$ select v2.onthi_record_results((select (j ->> 'attemptId')::uuid from ot_s1), '[]', 20, 20, 2, 0, 0, false) $$, '42501', null, 'HS không tự ghi điểm');
select throws_ok($$ select count(*) from v2.onthi_attempts $$, '42501', null, 'HS không đọc thẳng bảng bài làm');
reset role;

-- ===================== HS S2 (5B) + S3 (4A) =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000b502-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select v2.onthi_save_answer((select (j ->> 'attemptId')::uuid from ot_s1), 'ot-q1', '{"choice":"b"}', 1) $$, 'P0002', null, 'bạn khác không sửa bài của S1');
create temporary table ot_s2 (j jsonb) on commit drop;
grant all on ot_s2 to authenticated, service_role;
insert into ot_s2 select v2.onthi_start((select (j ->> 'id')::uuid from ot_sets where k = 'b1'));
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000b502-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(jsonb_array_length(v2.onthi_my_cards('tn')), 0, 'HS khối 4 không thấy bài khối 5');
select throws_ok(format($$ select v2.onthi_start(%L) $$, (select j ->> 'id' from ot_sets where k = 'b1')), 'P0002', null, 'HS khối khác không mở được bài');
reset role;

-- ===================== service role ghi điểm (như Edge Function grade) =====================
set local role service_role;
select is((v2.onthi_record_results((select (j ->> 'attemptId')::uuid from ot_s1),
  '[{"itemId":"ot-q1","type":"MCQ","answered":true,"correct":true,"earned":10,"points":10,"ms":4000},{"itemId":"ot-q2","type":"MCQ","answered":true,"correct":true,"earned":10,"points":10,"ms":3000}]',
  20, 20, 2, 0, 0, false) ->> 'passed')::boolean, true, 'S1 đạt 20/20');
select is((v2.onthi_record_results((select (j ->> 'attemptId')::uuid from ot_s1), '[]', 0, 0, 0, 0, 0, false) ->> 'score')::numeric, 20::numeric, 'ghi lại lần đã nộp → không đổi điểm');
update v2.onthi_attempts set started_at = now() - interval '2 minutes' where id = (select (j ->> 'attemptId')::uuid from ot_s2);
select is((v2.onthi_record_results((select (j ->> 'attemptId')::uuid from ot_s2),
  '[{"itemId":"ot-q1","type":"MCQ","answered":true,"correct":true,"earned":10,"points":10,"ms":1000},{"itemId":"ot-q2","type":"MCQ","answered":true,"correct":true,"earned":10,"points":10,"ms":1000}]',
  20, 20, 2, 0, 0, false) ->> 'newBest')::boolean, false, 'lần nộp đầu tiên không tính là kỉ lục mới');
reset role;

-- ===================== sau khi nộp =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000b502-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select (x ->> 'locked')::boolean from jsonb_array_elements(v2.onthi_my_cards('tn')) x where x ->> 'title' = 'TV 5 – Bài 2'), false, 'đạt bài 1 → mở bài 2');
select ok((v2.onthi_result((select (j ->> 'attemptId')::uuid from ot_s1)) -> 'keys') ? 'ot-q1', 'xem lại có đáp án (bài bật xem đáp án)');
-- S1 làm nhanh hơn (≈0 giây) nên xếp trên S2 (2 phút) dù bằng điểm.
select is((v2.onthi_board((select (j ->> 'id')::uuid from ot_sets where k = 'b1')) -> 'rows' -> 0 ->> 'name'), 'Khang', 'bằng điểm → làm nhanh hơn xếp trên');
reset role;

select * from finish();
rollback;
