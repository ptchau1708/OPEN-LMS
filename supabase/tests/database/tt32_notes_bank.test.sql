-- pgTAP: SQL 20 — môn Tiếng dân tộc thiểu số, ngân hàng nhận xét, thông tin bổ sung của học sinh.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(26);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000ea-0000-0000-0000-000000000001', 'nb-gv@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('000000ea-0000-0000-0000-000000000002', 'nb-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('000000ea-0000-0000-0000-000000000003', 'nbhs@openlms.edu', '{"role":"student","name":"Lê An"}'),
  ('000000ea-0000-0000-0000-000000000004', 'nb-ph@test.local', '{"role":"parent","name":"Mẹ An"}'),
  ('000000ea-0000-0000-0000-000000000009', 'nb-ad@test.local', '{"role":"admin","name":"Quản trị"}');
insert into v2.classes (id, name, grade, teacher_id) values ('nb-4a', '4A', 4, '000000ea-0000-0000-0000-000000000001'), ('nb-4b', '4B', 4, '000000ea-0000-0000-0000-000000000002');
update v2.profiles set grade = 4, class_id = 'nb-4a' where id = '000000ea-0000-0000-0000-000000000003';
insert into v2.class_members (class_id, user_id, role) values ('nb-4a', '000000ea-0000-0000-0000-000000000003', 'student');
insert into v2.guardian_links (parent_id, student_id) values ('000000ea-0000-0000-0000-000000000004', '000000ea-0000-0000-0000-000000000003');

-- 1) Môn Tiếng dân tộc thiểu số
select lives_ok($$ insert into v2.lessons (id, title, subject, grade, owner_id) values ('nb-ls', 'Tiếng Khmer', 'tieng-dan-toc', 3, '000000ea-0000-0000-0000-000000000001') $$, 'bài giảng Tiếng dân tộc thiểu số');
select throws_ok($$ insert into v2.lessons (id, title, subject, grade, owner_id) values ('nb-x', 'Lạ', 'vat-li', 4, '000000ea-0000-0000-0000-000000000001') $$, '23514', null, 'môn lạ vẫn bị chặn');
select lives_ok($$ select v2._upsert_item('{"id":"nb-it","type":"SHORT_ANSWER","grade":3,"subject":"tieng-dan-toc","prompt":{"text":"?"},"payload":{},"key":{"accepted":["x"]}}'::jsonb,
  '000000ea-0000-0000-0000-000000000001', '000000ea-0000-0000-0000-000000000001', true) $$, 'lưu câu hỏi môn Tiếng dân tộc');
select ok(position('tieng-dan-toc' in pg_get_functiondef('v2.save_skill(jsonb)'::regprocedure)) > 0, 'save_skill nhận môn mới');
select ok(position('tieng-dan-toc' in pg_get_functiondef('v2.admin_save_settings(jsonb)'::regprocedure)) > 0, 'cài đặt môn học nhận môn mới');
select is((select count(*)::int from v2.skills where subject = 'tieng-dan-toc'), 20, 'có 20 kĩ năng Tiếng dân tộc');

-- 2) Ngân hàng nhận xét
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000ea-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.bank_add_comments('[{"scope":"tt27:toan","level":"T","text":"Em tính nhanh, chính xác."},{"scope":"tt27:toan","text":"  Em   tính nhanh, chính xác. "},{"scope":"SAI PHAM VI","text":"x"}]'), 2, 'lưu 2 câu hợp lệ, bỏ câu sai phạm vi');
select is((select uses from v2.comment_bank where scope = 'tt27:toan'), 2, 'câu trùng → tăng số lần dùng, không nhân đôi');
select is((select level from v2.comment_bank where scope = 'tt27:toan'), 'T', 'giữ mức đã có');
select lives_ok($$ update v2.comment_bank set shared = true where scope = 'tt27:toan' $$, 'chia sẻ câu');
select lives_ok($$ select v2.bank_add_comments('[{"scope":"tt27:chung","text":"Em chăm ngoan, lễ phép."}]') $$, 'thêm câu riêng (không chia sẻ)');
select set_config('request.jwt.claims', '{"sub":"000000ea-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.comment_bank), 1, 'GV khác chỉ thấy câu được chia sẻ');
update v2.comment_bank set text = 'Bị sửa' where scope = 'tt27:toan';
select set_config('request.jwt.claims', '{"sub":"000000ea-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select text from v2.comment_bank where scope = 'tt27:toan'), 'Em tính nhanh, chính xác.', 'GV khác không sửa được câu của mình');
select set_config('request.jwt.claims', '{"sub":"000000ea-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select v2.bank_add_comments('[{"scope":"tt27:toan","text":"abc"}]') $$, '42501', null, 'HS không dùng ngân hàng nhận xét');
select is((select count(*)::int from v2.comment_bank), 0, 'HS không đọc được ngân hàng');

-- 3) Thông tin bổ sung
select set_config('request.jwt.claims', '{"sub":"000000ea-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into v2.student_notes (student_id, category, title, body, fields, source, share_parent) values
  ('000000ea-0000-0000-0000-000000000003', 'suc-khoe', 'Khám sức khoẻ', '', '{"Thị lực":"10/10"}', 'excel', false),
  ('000000ea-0000-0000-0000-000000000003', 'nang-khieu', 'Năng khiếu vẽ', 'Em vẽ đẹp.', '{}', 'tay', true) $$, 'GV lớp nhập thông tin bổ sung');
select is((select count(*)::int from v2.student_notes), 2, 'GV lớp thấy cả hai ghi chép');
select throws_ok($$ insert into v2.student_notes (student_id, title, body, category) values ('000000ea-0000-0000-0000-000000000003', 'x', 'y', 'bua') $$, '23514', null, 'nhóm lạ bị chặn');
select throws_ok($$ insert into v2.student_notes (student_id, title, fields) values ('000000ea-0000-0000-0000-000000000003', 'x', '[1]') $$, '23514', null, 'dữ liệu phải là đối tượng');
select set_config('request.jwt.claims', '{"sub":"000000ea-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.student_notes), 0, 'GV lớp khác không xem được');
select throws_ok($$ insert into v2.student_notes (student_id, title, body) values ('000000ea-0000-0000-0000-000000000003', 'x', 'y') $$, '42501', null, 'GV lớp khác không nhập được');
select set_config('request.jwt.claims', '{"sub":"000000ea-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select array_agg(title)::text from v2.student_notes), '{"Năng khiếu vẽ"}', 'phụ huynh chỉ thấy ghi chép được chia sẻ');
delete from v2.student_notes;
select set_config('request.jwt.claims', '{"sub":"000000ea-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from v2.student_notes), 0, 'học sinh không xem ghi chép của thầy/cô');
select set_config('request.jwt.claims', '{"sub":"000000ea-0000-0000-0000-000000000009","role":"authenticated"}', true);
select is((select count(*)::int from v2.student_notes), 2, 'phụ huynh không xoá được; quản trị thấy đủ');
select lives_ok($$ delete from v2.student_notes where title = 'Khám sức khoẻ' $$, 'quản trị xoá được');
reset role;
set local role anon;
select throws_ok($$ select * from v2.student_notes $$, '42501', null, 'khách (anon) không đọc được');

select * from finish();
rollback;
