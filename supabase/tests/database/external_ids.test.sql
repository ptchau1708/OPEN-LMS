-- pgTAP: mã bên ngoài của học sinh (VnEdu / Google) — migration 20261117000003_v2_external_ids.sql.
-- Chạy: TEST_DB=… tools/run-db-tests.sh --plain
--   A admin 0000007a-…-01 · T1 GV 7A1 0000007b-…-01 · T2 GV 7A2 0000007b-…-02 · S1,S2 HS 7A1 0000007c-…-01/02 · S3 HS 7A2 …-03
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

insert into auth.users (id, email, raw_user_meta_data) values
  ('0000007a-0000-0000-0000-000000000001', 'x7-admin@test.local', '{"role":"admin","name":"Quản trị"}'),
  ('0000007b-0000-0000-0000-000000000001', 'x7-gv1@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('0000007b-0000-0000-0000-000000000002', 'x7-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('0000007c-0000-0000-0000-000000000001', 'x7an@openlms.edu', '{"role":"student","name":"An"}'),
  ('0000007c-0000-0000-0000-000000000002', 'x7binh@openlms.edu', '{"role":"student","name":"Bình"}'),
  ('0000007c-0000-0000-0000-000000000003', 'x7chi@openlms.edu', '{"role":"student","name":"Chi"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('x7-a1', '7A1', 5, '0000007b-0000-0000-0000-000000000001'),
  ('x7-a2', '7A2', 5, '0000007b-0000-0000-0000-000000000002');
update v2.profiles set grade = 5, class_id = 'x7-a1' where id in ('0000007c-0000-0000-0000-000000000001', '0000007c-0000-0000-0000-000000000002');
update v2.profiles set grade = 5, class_id = 'x7-a2' where id = '0000007c-0000-0000-0000-000000000003';

select ok(not has_function_privilege('anon', 'v2.set_student_external_ids(text, jsonb)', 'execute'), 'anon không gọi được RPC ghi mã');
select ok(has_function_privilege('authenticated', 'v2.set_student_external_ids(text, jsonb)', 'execute'), 'người đã đăng nhập gọi được RPC ghi mã');
select ok((select relrowsecurity from pg_class where oid = 'v2.student_external_ids'::regclass), 'bảng student_external_ids bật RLS');

-- ===================== GV T1 (lớp 7A1) =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000007b-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.set_student_external_ids('x7-a1', '[
  {"studentId":"0000007c-0000-0000-0000-000000000001","externalCode":" 0079100001 ","googleId":"g-111","googleEmail":"an@truong.edu.vn"},
  {"studentId":"0000007c-0000-0000-0000-000000000002","externalCode":"0079100002"},
  {"studentId":"0000007c-0000-0000-0000-000000000003","externalCode":"LOP-KHAC"},
  {"studentId":"khong-phai-uuid","externalCode":"X"}]'::jsonb), 2, 'GV ghi mã cho 2 HS lớp mình; HS lớp khác và id sai bị bỏ qua');
select is((select external_code from v2.profiles where id = '0000007c-0000-0000-0000-000000000001'), '0079100001', 'mã được cắt khoảng trắng, giữ số 0 đầu');
select is((select count(*)::int from v2.student_external_ids), 1, 'GV thấy tài khoản Google của HS lớp mình');
select is((select email from v2.student_external_ids where user_id = '0000007c-0000-0000-0000-000000000001'), 'an@truong.edu.vn', 'email Google được lưu');
select throws_ok($$ select v2.set_student_external_ids('x7-a2', '[{"studentId":"0000007c-0000-0000-0000-000000000003","externalCode":"X"}]'::jsonb) $$, '42501', null, 'GV không ghi mã cho lớp khác');
select throws_ok($$ insert into v2.student_external_ids (user_id, provider, external_id) values ('0000007c-0000-0000-0000-000000000002', 'google', 'g-x') $$, '42501', null, 'không ghi thẳng vào bảng');
select is(v2.set_student_external_ids('x7-a1', '[{"studentId":"0000007c-0000-0000-0000-000000000001","googleId":""},{"studentId":"0000007c-0000-0000-0000-000000000002","googleId":"g-222"}]'::jsonb), 2, 'xóa / thêm tài khoản Google');
select is((select external_code from v2.profiles where id = '0000007c-0000-0000-0000-000000000001'), '0079100001', 'khóa vắng mặt thì mã không đổi');
select is((select string_agg(external_id, ',') from v2.student_external_ids), 'g-222', 'chỉ còn tài khoản Google của Bình');
-- GV sửa thẳng hồ sơ HS lớp mình (ô sửa mã trong danh sách lớp) cũng được.
update v2.profiles set external_code = 'SUA-TAY' where id = '0000007c-0000-0000-0000-000000000002';
select is((select external_code from v2.profiles where id = '0000007c-0000-0000-0000-000000000002'), 'SUA-TAY', 'GV sửa mã trực tiếp cho HS lớp mình');
reset role;
select is((select external_code from v2.profiles where id = '0000007c-0000-0000-0000-000000000003'), null, 'HS lớp khác không bị đổi mã');

-- ===================== GV T2 (lớp 7A2) =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000007b-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.student_external_ids), 0, 'GV lớp khác không đọc được tài khoản Google');
reset role;

-- ===================== HS S1 =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000007c-0000-0000-0000-000000000001","role":"authenticated"}', true);
update v2.profiles set external_code = 'TU-SUA', avatar_color = '#112233' where id = '0000007c-0000-0000-0000-000000000001';
select is((select external_code || '|' || avatar_color from v2.profiles where id = '0000007c-0000-0000-0000-000000000001'), '0079100001|#112233', 'HS không tự đổi được mã (các cột khác vẫn sửa được)');
select throws_ok($$ select v2.set_student_external_ids('x7-a1', '[]'::jsonb) $$, '42501', null, 'HS không gọi được RPC ghi mã');
reset role;

-- ===================== admin =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000007a-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.set_student_external_ids('x7-a2', '[{"studentId":"0000007c-0000-0000-0000-000000000003","externalCode":""}]'::jsonb), 1, 'quản trị ghi cho mọi lớp; chuỗi rỗng = xóa mã');
select throws_ok($$ select v2.set_student_external_ids('x7-a2', '{"a":1}'::jsonb) $$, '22023', null, 'dữ liệu không phải mảng bị từ chối');
reset role;

select * from finish();
rollback;
