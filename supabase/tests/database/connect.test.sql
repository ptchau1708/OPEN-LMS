-- pgTAP: Cầu nối với app ngoài (migration 20261117000002_v2_connect.sql).
-- Chạy: supabase test db  |  tools/run-db-tests.sh [--plain]
--   AD admin 0000007a-…-01 · T1 GV lớp cn-3a 0000007b-…-01 · T2 GV lớp khác 0000007b-…-02
--   S1 HS cn-3a 0000007c-…-01 · S2 HS cn-3b 0000007c-…-02 · P1 phụ huynh của S1 0000007d-…-01
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(39);

insert into auth.users (id, email, raw_user_meta_data) values
  ('0000007a-0000-0000-0000-000000000001', 'cn-admin@test.local', '{"role":"admin","name":"Quản trị"}'),
  ('0000007b-0000-0000-0000-000000000001', 'cn-gv1@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('0000007b-0000-0000-0000-000000000002', 'cn-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('0000007c-0000-0000-0000-000000000001', 'cnan@openlms.edu', '{"role":"student","name":"An"}'),
  ('0000007c-0000-0000-0000-000000000002', 'cnbinh@openlms.edu', '{"role":"student","name":"Bình"}'),
  ('0000007d-0000-0000-0000-000000000001', 'cn-ph@test.local', '{"role":"parent","name":"Mẹ An"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('cn-3a', '3A', 3, '0000007b-0000-0000-0000-000000000001'),
  ('cn-3b', '3B', 3, '0000007b-0000-0000-0000-000000000002');
update v2.profiles set grade = 3, class_id = 'cn-3a' where id = '0000007c-0000-0000-0000-000000000001';
update v2.profiles set grade = 3, class_id = 'cn-3b' where id = '0000007c-0000-0000-0000-000000000002';
insert into v2.class_members (class_id, user_id, role) values
  ('cn-3a', '0000007c-0000-0000-0000-000000000001', 'student'),
  ('cn-3b', '0000007c-0000-0000-0000-000000000002', 'student');
insert into v2.guardian_links (parent_id, student_id) values ('0000007d-0000-0000-0000-000000000001', '0000007c-0000-0000-0000-000000000001');

select ok(not has_function_privilege('anon', 'v2.record_external_activity(jsonb)', 'execute'), 'anon không gọi được record_external_activity');
select ok(not has_function_privilege('anon', 'v2.get_external_app(text)', 'execute'), 'anon không gọi được get_external_app');
select ok(not has_table_privilege('authenticated', 'v2.external_activities', 'insert'), 'không ai có quyền INSERT trực tiếp vào external_activities');

set local role authenticated;

-- ===================== Admin: sổ đăng kí =====================
select set_config('request.jwt.claims', '{"sub":"0000007a-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into v2.external_apps (id, name, allowed_origins, created_by) values
  ('doc-hieu', 'Đọc hiểu vui', array['https://doc.truong.edu.vn', 'http://localhost:3000'], auth.uid()),
  ('da-tat', 'App đã tắt', array['https://tat.example.com'], auth.uid()) $$, 'admin thêm app');
select lives_ok($$ update v2.external_apps set enabled = false where id = 'da-tat' $$, 'admin tắt app');
select throws_ok($$ insert into v2.external_apps (id, name, allowed_origins) values ('x-path', 'X', array['https://a.vn/duong-dan']) $$, '23514', null, 'origin có đường dẫn bị từ chối');
select throws_ok($$ insert into v2.external_apps (id, name, allowed_origins) values ('x-star', 'X', array['*']) $$, '23514', null, 'origin * bị từ chối');
select throws_ok($$ insert into v2.external_apps (id, name, allowed_origins) values ('x-http', 'X', array['http://doc.truong.edu.vn']) $$, '23514', null, 'http (không phải localhost) bị từ chối');
select throws_ok($$ insert into v2.external_apps (id, name) values ('Sai Id', 'X') $$, '23514', null, 'id phải là slug');
select is((select count(*)::int from v2.external_apps), 2, 'admin thấy cả app đã tắt');

-- ===================== HS An =====================
select set_config('request.jwt.claims', '{"sub":"0000007c-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.external_apps), 0, 'HS không đọc thẳng bảng external_apps');
select throws_ok($$ insert into v2.external_apps (id, name) values ('hs-app', 'Của em') $$, '42501', null, 'HS không tự đăng kí app');
with u as (update v2.external_apps set allowed_origins = array['https://xau.example.com'] returning 1)
select is((select count(*)::int from u), 0, 'HS không sửa được origin');
select is(v2.get_external_app('doc-hieu') ->> 'name', 'Đọc hiểu vui', 'HS lấy được tên app đang bật');
select is(v2.get_external_app('doc-hieu') -> 'allowedOrigins', '["https://doc.truong.edu.vn", "http://localhost:3000"]'::jsonb, 'kèm danh sách origin');
select ok(v2.get_external_app('da-tat') is null, 'app đã tắt: không trả gì');
select ok(v2.get_external_app('khong-co') is null, 'app không tồn tại: không trả gì');

select set_config('cn.id1', v2.record_external_activity('{"appId":"doc-hieu","clientId":"c-1","activityId":"bai-1","title":"Chú sẻ nhỏ","kind":"Reading","score":8,"maxScore":10,"correct":4,"total":5,"durationSec":120,"detail":{"answers":[1,0,2]},"skills":["KHONG.CO.MA"]}')::text, true);
select is((select count(*)::int from v2.external_activities), 1, 'ghi một kết quả');
select is((select kind || '|' || score || '|' || correct || '/' || total || '|' || user_id from v2.external_activities),
  'reading|8|4/5|0000007c-0000-0000-0000-000000000001', 'các trường được lưu, user_id lấy từ phiên đăng nhập');
select is((select skills from v2.external_activities), '{}'::text[], 'mã kĩ năng không có thật bị bỏ');
select is(v2.record_external_activity('{"appId":"doc-hieu","clientId":"c-1","title":"Chú sẻ nhỏ (sửa)","score":9,"maxScore":10}')::text, current_setting('cn.id1'), 'gửi lại cùng clientId: trả cùng id');
select is((select count(*)::int || '|' || max(title) from v2.external_activities), '1|Chú sẻ nhỏ (sửa)', 'không nhân đôi, cập nhật dòng cũ');
select lives_ok($$ select v2.record_external_activity(jsonb_build_object('appId', 'doc-hieu', 'clientId', 'c-2', 'title', repeat('a', 500),
  'score', 999, 'maxScore', 10, 'correct', 9, 'total', 5, 'durationSec', 9999999, 'userId', '0000007c-0000-0000-0000-000000000002',
  'detail', jsonb_build_object('big', repeat('x', 20000)), 'at', '1999-01-01T00:00:00Z')) $$, 'dữ liệu quá cỡ vẫn ghi được');
select is((select length(title) || '|' || score || '|' || correct || '|' || duration_sec || '|' || detail::text || '|' || (at > now() - interval '31 days') || '|' || user_id
  from v2.external_activities where client_id = 'c-2'),
  '200|10|5|86400|{"truncated": true}|true|0000007c-0000-0000-0000-000000000001', 'được kẹp: tên, điểm, số câu, thời lượng, detail, thời điểm; không ghi hộ người khác');
select throws_ok($$ select v2.record_external_activity('{"appId":"da-tat","clientId":"c-9"}') $$, '42501', null, 'app đã tắt: từ chối');
select throws_ok($$ select v2.record_external_activity('{"appId":"la","clientId":"c-9"}') $$, '42501', null, 'app chưa đăng kí: từ chối');
select throws_ok($$ select v2.record_external_activity('{"appId":"doc-hieu"}') $$, '22023', null, 'thiếu clientId: từ chối');
select throws_ok($$ insert into v2.external_activities (user_id, app_id, client_id) values (auth.uid(), 'doc-hieu', 'tu-ghi') $$, '42501', null, 'HS không ghi thẳng vào bảng');
select throws_ok($$ update v2.external_activities set score = 10 $$, '42501', null, 'HS không sửa thẳng điểm');
select is(jsonb_array_length(v2.list_external_activities('0000007c-0000-0000-0000-000000000001', 50)), 2, 'HS xem danh sách của mình');
select is(v2.list_external_activities('0000007c-0000-0000-0000-000000000001', 1) -> 0 ->> 'appName', 'Đọc hiểu vui', 'danh sách kèm tên app, mới nhất trước');

-- Giới hạn 300 lượt/ngày
reset role;
insert into v2.external_activities (user_id, app_id, client_id)
  select '0000007c-0000-0000-0000-000000000001', 'doc-hieu', 'bulk-' || g from generate_series(1, 298) g;
set local role authenticated;
select throws_ok($$ select v2.record_external_activity('{"appId":"doc-hieu","clientId":"c-301"}') $$, 'P0001', null, 'quá 300 lượt/ngày: từ chối');
select lives_ok($$ select v2.record_external_activity('{"appId":"doc-hieu","clientId":"c-1","score":7}') $$, 'gửi lại dòng cũ vẫn được dù đã chạm giới hạn');

-- ===================== HS Bình (lớp khác) =====================
select set_config('request.jwt.claims', '{"sub":"0000007c-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.external_activities), 0, 'HS khác không thấy dòng của An');
select throws_ok($$ select v2.list_external_activities('0000007c-0000-0000-0000-000000000001', 50) $$, '42501', null, 'HS khác không gọi được danh sách của An');

-- ===================== GV, phụ huynh =====================
select set_config('request.jwt.claims', '{"sub":"0000007b-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.list_external_activities('0000007c-0000-0000-0000-000000000001', 5)), 5, 'GV của lớp xem được (theo p_limit)');
select set_config('request.jwt.claims', '{"sub":"0000007b-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select v2.list_external_activities('0000007c-0000-0000-0000-000000000001', 5) $$, '42501', null, 'GV lớp khác không xem được');
select set_config('request.jwt.claims', '{"sub":"0000007d-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.external_activities), 300, 'phụ huynh liên kết đọc được');

-- ===================== Chưa đăng nhập (JWT không có sub) =====================
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select v2.record_external_activity('{"appId":"doc-hieu","clientId":"c-x"}') $$, '42501', null, 'không có người dùng: từ chối');

select * from finish();
rollback;
