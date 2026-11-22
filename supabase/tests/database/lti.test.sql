-- pgTAP: LTI 1.3 (migration 20261120000001_v2_lti.sql).
-- Chạy: supabase test db  |  tools/run-db-tests.sh [--plain]
--   AD admin 000000a1-…-01 · T1 GV 000000a2-…-01 · S1 HS lớp lt-5a 000000a3-…-01
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000a1-0000-0000-0000-000000000001', 'lt-admin@test.local', '{"role":"admin","name":"Quản trị"}'),
  ('000000a2-0000-0000-0000-000000000001', 'lt-gv@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('000000a3-0000-0000-0000-000000000001', 'ltan@openlms.edu', '{"role":"student","name":"An"}');
insert into v2.classes (id, name, grade, teacher_id) values ('lt-5a', '5A', 5, '000000a2-0000-0000-0000-000000000001');
insert into v2.class_members (class_id, user_id, role) values ('lt-5a', '000000a3-0000-0000-0000-000000000001', 'student');

select ok(not has_table_privilege('authenticated', 'v2.lti_platform_keys', 'select'), 'không ai (trừ service_role) đọc được khóa kí');
select ok(not has_table_privilege('authenticated', 'v2.lti_lineitems', 'insert'), 'không ghi thẳng cột điểm');
select ok(not has_function_privilege('authenticated', 'v2.lti_remember_jti(text, timestamptz)', 'execute'), 'chỉ service_role ghi jti');
select ok(not has_function_privilege('anon', 'v2.list_lti_tools()', 'execute'), 'anon không xem danh sách app LTI');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into v2.external_apps (id, name, allowed_origins, lti) values ('doc-hieu', 'Đọc hiểu', array['https://doc.truong.edu.vn'],
  '{"clientId":"cid-0123456789","deploymentId":"1","loginUrl":"https://doc.truong.edu.vn/lti/login","launchUrl":"https://doc.truong.edu.vn/lti/launch","jwksUrl":"https://doc.truong.edu.vn/lti/jwks"}') $$, 'quản trị thêm app có LTI');
select lives_ok($$ insert into v2.external_apps (id, name, lti) values ('local-lti', 'Thử máy', '{"clientId":"cid-local-0001","deploymentId":"d","loginUrl":"http://localhost:8001/lti/login","launchUrl":"http://localhost:8001/lti/launch","publicKey":"-----BEGIN PUBLIC KEY-----x-----END PUBLIC KEY-----","redirectUris":["http://localhost:8001/lti/launch"]}') $$, 'localhost + khóa PEM được');
select throws_ok($$ insert into v2.external_apps (id, name, lti) values ('x-http', 'X', '{"clientId":"cid-0000000001","deploymentId":"1","loginUrl":"http://doc.vn/login","launchUrl":"https://doc.vn/launch","jwksUrl":"https://doc.vn/jwks"}') $$, '23514', null, 'http (không phải localhost) bị từ chối');
select throws_ok($$ insert into v2.external_apps (id, name, lti) values ('x-key', 'X', '{"clientId":"cid-0000000002","deploymentId":"1","loginUrl":"https://doc.vn/login","launchUrl":"https://doc.vn/launch"}') $$, '23514', null, 'thiếu cả JWKS lẫn khóa PEM bị từ chối');
select throws_ok($$ insert into v2.external_apps (id, name, lti) values ('x-cid', 'X', '{"clientId":"ngan","deploymentId":"1","loginUrl":"https://doc.vn/login","launchUrl":"https://doc.vn/launch","jwksUrl":"https://doc.vn/jwks"}') $$, '23514', null, 'client_id quá ngắn bị từ chối');
select throws_ok($$ insert into v2.external_apps (id, name, lti) values ('x-red', 'X', '{"clientId":"cid-0000000003","deploymentId":"1","loginUrl":"https://doc.vn/login","launchUrl":"https://doc.vn/launch","jwksUrl":"https://doc.vn/jwks","redirectUris":["javascript:alert(1)"]}') $$, '23514', null, 'redirect_uri lạ bị từ chối');
select throws_ok($$ insert into v2.external_apps (id, name, lti) values ('x-dup', 'X', '{"clientId":"cid-0123456789","deploymentId":"2","loginUrl":"https://doc.vn/login","launchUrl":"https://doc.vn/launch","jwksUrl":"https://doc.vn/jwks"}') $$, '23505', null, 'client_id trùng bị từ chối');
select lives_ok($$ update v2.external_apps set lti = null where id = 'local-lti' $$, 'tắt LTI của một app');

-- ===================== HS =====================
select set_config('request.jwt.claims', '{"sub":"000000a3-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.list_lti_tools()), 1, 'HS thấy app LTI đang bật');
select is(v2.list_lti_tools() -> 0 ->> 'loginUrl', 'https://doc.truong.edu.vn/lti/login', 'kèm địa chỉ mở app');
select ok(not (v2.list_lti_tools() -> 0 ? 'publicKey'), 'không lộ khóa của app');
select is((select count(*)::int from v2.external_apps), 0, 'HS không đọc thẳng bảng external_apps');
select throws_ok($$ select v2.lti_remember_jti('x', now()) $$, '42501', null, 'HS không gọi được lti_remember_jti');

-- ===================== service_role (Edge Function) =====================
reset role;
select is(v2.lti_remember_jti('cid:abc', now() + interval '5 minutes'), true, 'jti mới → true');
select is(v2.lti_remember_jti('cid:abc', now() + interval '5 minutes'), false, 'jti dùng lại → false');
insert into v2.lti_lineitems (app_id, class_id, label, score_maximum, resource_link_id) values ('doc-hieu', 'lt-5a', 'Đọc hiểu', 100, 'doc-hieu:lt-5a');
select is((select count(*)::int from v2.lti_lineitems where class_id = 'lt-5a'), 1, 'service_role tạo cột điểm');

select * from finish();
rollback;
