-- pgTAP: danh mục mở (SQL 19) — kĩ năng GV thêm / sửa / ẩn / xoá, thu hồi huy hiệu, môn học của trường, câu trả lời nhanh.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000e9-0000-0000-0000-000000000001', 'dm-gv@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('000000e9-0000-0000-0000-000000000002', 'dm-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('000000e9-0000-0000-0000-000000000003', 'dmhs@openlms.edu', '{"role":"student","name":"An"}'),
  ('000000e9-0000-0000-0000-000000000009', 'dm-ad@test.local', '{"role":"admin","name":"Quản trị"}');
insert into v2.classes (id, name, grade, teacher_id) values ('dm-4a', '4A', 4, '000000e9-0000-0000-0000-000000000001');
update v2.profiles set grade = 4, class_id = 'dm-4a' where id = '000000e9-0000-0000-0000-000000000003';
insert into v2.class_members (class_id, user_id, role) values ('dm-4a', '000000e9-0000-0000-0000-000000000003', 'student');

set local role authenticated;
-- GV thêm kĩ năng
select set_config('request.jwt.claims', '{"sub":"000000e9-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select custom from v2.save_skill('{"code":"KH4.GV.TIET-KIEM-NUOC","subject":"khoa-hoc","grade":4,"topic":"Chất","short":"Tiết kiệm nước","text":"Nêu được cách tiết kiệm nước ở gia đình"}')), true, 'GV thêm kĩ năng mới');
select is((select owner_id from v2.skills where code = 'KH4.GV.TIET-KIEM-NUOC'), '000000e9-0000-0000-0000-000000000001'::uuid, 'ghi người thêm');
select throws_ok($$ select v2.save_skill('{"code":"KH4.GV.X","subject":"vat-li","grade":4,"topic":"a","short":"b","text":"c"}') $$, '22023', 'Môn học không hợp lệ.', 'môn lạ bị chặn');
select throws_ok($$ select v2.save_skill('{"code":"sai ma","subject":"toan","grade":4,"topic":"a","short":"b","text":"c"}') $$, '22023', 'Mã kĩ năng không hợp lệ.', 'mã sai định dạng bị chặn');
select throws_ok($$ select v2.save_skill('{"code":"KH4.GV.Y","subject":"toan","grade":7,"topic":"a","short":"b","text":"c"}') $$, '22023', 'Lớp phải từ 1 đến 5.', 'lớp ngoài 1–5 bị chặn');

-- GV sửa chữ kĩ năng gốc → lưu cột edit_*, không đụng chữ gốc
select lives_ok($$ select v2.save_skill('{"code":"KH4.NL.ANH-SANG","topic":"Năng lượng","short":"Ánh sáng quanh em","text":"Nhận biết vật cho ánh sáng truyền qua"}') $$, 'GV sửa chữ kĩ năng gốc');
select is((select edit_short from v2.skills where code = 'KH4.NL.ANH-SANG'), 'Ánh sáng quanh em', 'chữ sửa nằm ở edit_short');
select is((select short from v2.skills where code = 'KH4.NL.ANH-SANG'), 'Ánh sáng và bóng tối', 'chữ gốc giữ nguyên');
select is((select edit_topic from v2.skills where code = 'KH4.NL.ANH-SANG'), null, 'phần không đổi không ghi vào edit_*');
select ok((select edited_at is not null from v2.skills where code = 'KH4.NL.ANH-SANG'), 'đánh dấu đã sửa');

-- ẩn / hiện, khôi phục
select is((select hidden from v2.save_skill('{"code":"KH4.NL.NHIET","hidden":true}')), true, 'ẩn kĩ năng gốc');
select is((select hidden from v2.save_skill('{"code":"KH4.NL.NHIET","hidden":false}')), false, 'hiện lại');
select is((select edit_short from v2.save_skill('{"code":"KH4.NL.ANH-SANG","restore":true}')), null, 'khôi phục bản gốc');

-- xoá: kĩ năng gốc → ẩn; tự thêm chưa dùng → xoá hẳn; người khác không xoá được
select is(v2.delete_skill('KH4.NL.AM-THANH'), 'hidden', 'xoá kĩ năng gốc = ẩn');
select set_config('request.jwt.claims', '{"sub":"000000e9-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select v2.delete_skill('KH4.GV.TIET-KIEM-NUOC') $$, '42501', null, 'GV khác không xoá kĩ năng tự thêm của cô Thu');
select lives_ok($$ select v2.save_skill('{"code":"KH4.GV.TIET-KIEM-NUOC","topic":"Chất","short":"Dùng nước tiết kiệm","text":"Nêu cách dùng nước tiết kiệm"}') $$, 'GV khác sửa được chữ (danh mục chung)');
select set_config('request.jwt.claims', '{"sub":"000000e9-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.delete_skill('KH4.GV.TIET-KIEM-NUOC'), 'deleted', 'người thêm xoá được kĩ năng chưa dùng');

-- HS không sửa danh mục
select set_config('request.jwt.claims', '{"sub":"000000e9-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select v2.save_skill('{"code":"KH4.NL.NHIET","hidden":true}') $$, '42501', null, 'HS không sửa được danh mục');

-- Thu hồi huy hiệu
select set_config('request.jwt.claims', '{"sub":"000000e9-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select v2.grant_teacher_badge('dm-4a', array['000000e9-0000-0000-0000-000000000003']::uuid[], 'Đọc to rõ ràng', 'star') $$, 'GV tặng huy hiệu');
select set_config('test.badge', (select id::text from v2.user_badges where badge_id = 'cua-co' limit 1), true);
select set_config('request.jwt.claims', '{"sub":"000000e9-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format('select v2.revoke_teacher_badge(%L)', current_setting('test.badge')), '42501', null, 'GV lớp khác không thu hồi được');
select set_config('request.jwt.claims', '{"sub":"000000e9-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(format('select v2.revoke_teacher_badge(%L)', current_setting('test.badge')), 'GV lớp thu hồi được');
reset role;
select is((select count(*)::int from v2.user_badges where badge_id = 'cua-co'), 0, 'huy hiệu đã thu hồi');
set local role authenticated;

-- Môn học của trường
select set_config('request.jwt.claims', '{"sub":"000000e9-0000-0000-0000-000000000009","role":"authenticated"}', true);
select is((select v2.admin_save_settings('{"schoolName":"TH A","schoolYear":"2026-2027","termId":"GK1","aiDailyQuota":100,"subjects":{"khac":{"name":"Giáo dục địa phương","short":"GDĐP"},"tnxh":{"hidden":true},"vat-li":{"name":"Lạ"}}}') -> 'subjects'),
  '{"khac":{"name":"Giáo dục địa phương","short":"GDĐP"},"tnxh":{"hidden":true}}'::jsonb, 'lưu môn học: đổi tên, ẩn; bỏ mã lạ');

-- Câu trả lời nhanh
reset role;
select throws_ok($$ insert into v2.discussions (class_id, title, quick_replies) values ('dm-4a', 'x', '{"a":1}') $$, '23514', null, 'câu trả lời nhanh phải là mảng');

select * from finish();
rollback;
