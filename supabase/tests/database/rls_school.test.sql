-- pgTAP: Phase 5 — mã liên kết phụ huynh, giới hạn 4 phụ huynh, báo cáo theo quyền, RPC quản trị, vá vai trò khi tự đăng ký.
-- Chạy: supabase test db  |  tools/run-db-tests.sh [--plain]
--   A admin 0000005a-…-01 · T1 GV 5A1 0000005b-…-01 · T2 GV 5A2 0000005b-…-02 · S1,S2 HS 5A1 0000005c-…-01/02 · S3 HS 5A2 …-03
--   P1..P5 phụ huynh 0000005d-…-01..05
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('0000005a-0000-0000-0000-000000000001', 'p5-admin@test.local', '{"role":"admin","name":"Quản trị"}'),
  ('0000005b-0000-0000-0000-000000000001', 'p5-gv1@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('0000005b-0000-0000-0000-000000000002', 'p5-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('0000005c-0000-0000-0000-000000000001', 'p5an@openlms.edu', '{"role":"student","name":"An"}'),
  ('0000005c-0000-0000-0000-000000000002', 'p5binh@openlms.edu', '{"role":"student","name":"Bình"}'),
  ('0000005c-0000-0000-0000-000000000003', 'p5chi@openlms.edu', '{"role":"student","name":"Chi"}'),
  ('0000005d-0000-0000-0000-000000000001', '0912000001@parent.openlms.edu', '{"role":"parent","name":"Mẹ An"}'),
  ('0000005d-0000-0000-0000-000000000002', 'p5-bo@test.local', '{"role":"parent","name":"Bố An"}'),
  ('0000005d-0000-0000-0000-000000000003', 'p5-ong@test.local', '{"role":"parent","name":"Ông An"}'),
  ('0000005d-0000-0000-0000-000000000004', 'p5-ba@test.local', '{"role":"parent","name":"Bà An"}'),
  ('0000005d-0000-0000-0000-000000000005', 'p5-co@test.local', '{"role":"parent","name":"Cô An"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('p5-5a1', '5A1', 5, '0000005b-0000-0000-0000-000000000001'),
  ('p5-5a2', '5A2', 5, '0000005b-0000-0000-0000-000000000002');
update v2.profiles set grade = 5, class_id = 'p5-5a1' where id in ('0000005c-0000-0000-0000-000000000001', '0000005c-0000-0000-0000-000000000002');
update v2.profiles set grade = 5, class_id = 'p5-5a2' where id = '0000005c-0000-0000-0000-000000000003';

select is((select username from v2.profiles where id = '0000005d-0000-0000-0000-000000000001'), '0912000001', 'phụ huynh dùng SĐT: tên đăng nhập = số điện thoại');


-- ===================== GV T1 =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000005b-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.create_guardian_codes('p5-5a1')), 2, 'GV tạo mã cho cả lớp (2 HS)');
select throws_ok($$ select v2.create_guardian_codes('p5-5a2') $$, '42501', null, 'GV không tạo mã cho lớp khác');
select is((select count(*)::int from v2.guardian_codes), 2, 'GV chỉ thấy mã của lớp mình');
select is(jsonb_array_length(v2.create_guardian_codes('p5-5a1', array['0000005c-0000-0000-0000-000000000001']::uuid[])), 1, 'tạo lại mã cho 1 HS');
select is((select count(*)::int from v2.guardian_codes where student_id = '0000005c-0000-0000-0000-000000000001' and revoked_at is null), 1, 'mã cũ của HS bị thu hồi');
select throws_ok($$ insert into v2.guardian_codes (code, student_id, class_id) values ('AAAAAAAA', '0000005c-0000-0000-0000-000000000001', 'p5-5a1') $$, '42501', null, 'không ghi thẳng bảng mã');
select is((select jsonb_array_length(v2.school_report() -> 'classes')), 1, 'GV: báo cáo chỉ lớp mình');
select throws_ok($$ select v2.admin_save_class('{"name":"5A9","grade":5}') $$, '42501', null, 'GV không tạo lớp');
reset role;

-- ===================== phụ huynh =====================
create temporary table p5_code on commit drop as
  select code from v2.guardian_codes where student_id = '0000005c-0000-0000-0000-000000000001' and revoked_at is null;
grant select on p5_code to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000005d-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select v2.create_guardian_codes('p5-5a1') $$, '42501', null, 'phụ huynh không tạo mã');
select is((select count(*)::int from v2.guardian_codes), 0, 'phụ huynh không đọc được bảng mã');
select throws_ok($$ select v2.redeem_guardian_code('ZZZZZZZZ') $$, 'P0001', 'Mã chưa đúng. Bố mẹ kiểm tra lại 8 kí tự trên phiếu nhé.', 'mã sai báo lỗi tiếng Việt');
select is((v2.redeem_guardian_code((select code from p5_code)) -> 'child' ->> 'name'), 'An', 'dùng mã → liên kết con');
select ok(v2.is_guardian_of('0000005c-0000-0000-0000-000000000001'), 'đã là phụ huynh của An');
select is((v2.redeem_guardian_code((select code from p5_code)) ->> 'already_linked')::boolean, true, 'dùng lại mã của chính mình không lỗi');
select throws_ok($$ select v2.school_report() $$, '42501', null, 'phụ huynh không xem báo cáo trường');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000005d-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select v2.redeem_guardian_code((select code from p5_code)) $$, 'P0001', 'Mã này đã được dùng. Mỗi mã chỉ dùng một lần — xin nhờ thầy cô cấp mã mới.', 'mã chỉ dùng một lần');
reset role;

-- Giới hạn 4 phụ huynh / HS.
insert into v2.guardian_links (parent_id, student_id) values
  ('0000005d-0000-0000-0000-000000000002', '0000005c-0000-0000-0000-000000000001'),
  ('0000005d-0000-0000-0000-000000000003', '0000005c-0000-0000-0000-000000000001'),
  ('0000005d-0000-0000-0000-000000000004', '0000005c-0000-0000-0000-000000000001');
select throws_ok($$ insert into v2.guardian_links (parent_id, student_id) values ('0000005d-0000-0000-0000-000000000005', '0000005c-0000-0000-0000-000000000001') $$,
  'P0001', null, 'tối đa 4 phụ huynh cho một HS');
select throws_ok($$ insert into v2.guardian_links (parent_id, student_id) values ('0000005b-0000-0000-0000-000000000002', '0000005c-0000-0000-0000-000000000002') $$,
  'P0001', null, 'chỉ tài khoản phụ huynh được liên kết');

-- ===================== GV xem / gỡ liên kết =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000005b-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.list_guardian_links('p5-5a1')), 4, 'GV thấy phụ huynh của lớp');
select lives_ok($$ select v2.revoke_guardian_link('0000005d-0000-0000-0000-000000000004', '0000005c-0000-0000-0000-000000000001') $$, 'GV gỡ liên kết');
reset role;

-- ===================== admin =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000005a-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.admin_save_class('{"name":"5a3","grade":5,"teacher_id":"0000005b-0000-0000-0000-000000000002"}') ->> 'name'), '5A3', 'admin tạo lớp, tên viết hoa');
select is((select jsonb_array_length(v2.school_report() -> 'classes')) >= 3, true, 'admin: báo cáo cả trường');
select is((v2.admin_save_settings('{"schoolName":"TH Hòa Bình","schoolYear":"2026-2027","termId":"CK1","aiDailyQuota":150}') ->> 'termId'), 'CK1', 'admin lưu cài đặt');
reset role;

select * from finish();
rollback;
