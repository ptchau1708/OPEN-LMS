-- pgTAP: trang nhúng, trang học, xAPI (migration 20261121000001_v2_embed_pages_xapi.sql).
--   AD 000000b1-…-01 · T1 GV lớp ep-5a 000000b2-…-01 · T2 GV lớp ep-5b 000000b2-…-02 · S1 HS ep-5a 000000b3-…-01 · S2 HS ep-5b 000000b3-…-02
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000b1-0000-0000-0000-000000000001', 'ep-admin@test.local', '{"role":"admin","name":"Quản trị"}'),
  ('000000b2-0000-0000-0000-000000000001', 'ep-gv1@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('000000b2-0000-0000-0000-000000000002', 'ep-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('000000b3-0000-0000-0000-000000000001', 'epan@openlms.edu', '{"role":"student","name":"An"}'),
  ('000000b3-0000-0000-0000-000000000002', 'epbinh@openlms.edu', '{"role":"student","name":"Bình"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('ep-5a', '5A', 5, '000000b2-0000-0000-0000-000000000001'),
  ('ep-5b', '5B', 5, '000000b2-0000-0000-0000-000000000002');
insert into v2.class_members (class_id, user_id, role) values
  ('ep-5a', '000000b3-0000-0000-0000-000000000001', 'student'),
  ('ep-5b', '000000b3-0000-0000-0000-000000000002', 'student');
insert into v2.external_apps (id, name, lti) values ('doc-ep', 'Đọc hiểu', '{"clientId":"cid-ep-000001","deploymentId":"1","loginUrl":"https://doc.vn/lti/login","launchUrl":"https://doc.vn/lti/launch","deepLinkUrl":"https://doc.vn/lti/chon-bai","jwksUrl":"https://doc.vn/lti/jwks"}');

select ok((select count(*) from v2.embed_sites where builtin) >= 10, 'có sẵn các trang học tập quen thuộc');
select ok(not has_table_privilege('authenticated', 'v2.xapi_statements', 'insert'), 'không ghi thẳng xAPI');

set local role authenticated;
-- ===================== GV =====================
select set_config('request.jwt.claims', '{"sub":"000000b2-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into v2.embed_sites (origin, name, added_by) values ('https://doc.truong.edu.vn', 'Luyện đọc', auth.uid()) $$, 'GV thêm trang được phép nhúng');
select throws_ok($$ insert into v2.embed_sites (origin, name, added_by) values ('https://doc.vn/duong-dan', 'X', auth.uid()) $$, '23514', null, 'origin có đường dẫn bị từ chối');
select throws_ok($$ insert into v2.embed_sites (origin, name, added_by) values ('http://doc.vn', 'X', auth.uid()) $$, '23514', null, 'http (không phải localhost) bị từ chối');
select throws_ok($$ insert into v2.embed_sites (origin, name, added_by, builtin) values ('https://x.vn', 'X', auth.uid(), true) $$, '42501', null, 'GV không tự đánh dấu trang có sẵn');
select lives_ok($$ insert into v2.class_pages (class_id, title, url, created_by) values ('ep-5a', 'Bài đọc: Cây bàng', 'https://doc.truong.edu.vn/bai/3', auth.uid()) $$, 'GV tạo trang học cho lớp mình');
select lives_ok($$ insert into v2.class_pages (class_id, title, kind, app_id, lti, created_by) values ('ep-5a', 'Bài 4 (chọn trong app)', 'lti', 'doc-ep', '{"custom":{"bai":"4"}}', auth.uid()) $$, 'GV tạo trang học từ app LTI');
select lives_ok($$ insert into v2.class_pages (class_id, title, url, hidden, created_by) values ('ep-5a', 'Nháp', 'https://padlet.com/x', true, auth.uid()) $$, 'GV tạo trang ẩn');
select throws_ok($$ insert into v2.class_pages (class_id, title, url, created_by) values ('ep-5b', 'Lớp khác', 'https://doc.vn', auth.uid()) $$, '42501', null, 'GV không tạo trang cho lớp người khác');
select throws_ok($$ insert into v2.class_pages (class_id, title, kind, created_by) values ('ep-5a', 'Thiếu app', 'lti', auth.uid()) $$, '23514', null, 'trang LTI phải có app');

-- ===================== GV khác =====================
select set_config('request.jwt.claims', '{"sub":"000000b2-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.class_pages where class_id = 'ep-5a'), 2, 'GV lớp khác xem được trang (không ẩn) như dữ liệu lớp khác');
with d as (delete from v2.class_pages where class_id = 'ep-5a' returning 1) select is((select count(*)::int from d), 0, 'GV lớp khác không xóa được');
select lives_ok($$ delete from v2.embed_sites where origin = 'https://padlet.com' $$, 'GV bớt trang được phép nhúng');

-- ===================== HS =====================
select set_config('request.jwt.claims', '{"sub":"000000b3-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.class_pages), 2, 'HS thấy trang học (không thấy trang ẩn)');
select ok((select count(*) from v2.embed_sites) >= 9, 'HS đọc được danh sách trang nhúng');
select throws_ok($$ insert into v2.embed_sites (origin, name, added_by) values ('https://hs.vn', 'X', auth.uid()) $$, '42501', null, 'HS không thêm trang nhúng');
with d as (delete from v2.embed_sites returning 1) select is((select count(*)::int from d), 0, 'HS không xóa trang nhúng');
select throws_ok($$ insert into v2.class_pages (class_id, title, url, created_by) values ('ep-5a', 'HS', 'https://doc.vn', auth.uid()) $$, '42501', null, 'HS không tạo trang học');
select is((v2.list_lti_tools() -> 0 ->> 'deepLinkUrl'), 'https://doc.vn/lti/chon-bai', 'danh sách app có địa chỉ chọn bài');

select set_config('request.jwt.claims', '{"sub":"000000b3-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.class_pages), 0, 'HS lớp khác không thấy');

reset role;
select lives_ok($$ insert into v2.learning_events (user_id, verb, object_type, object_id, result) values ('000000b3-0000-0000-0000-000000000001', 'answered', 'external', 'xapi:doc-ep:cau-1', '{"correct":true,"skills":[]}') $$, 'sự kiện học external');

select * from finish();
rollback;
