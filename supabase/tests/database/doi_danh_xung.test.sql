-- pgTAP: SQL 24 (20261128000001_v2_doi_danh_xung.sql) — danh xưng "thầy/cô" trong lời nhắn tự động,
-- tên "Huy hiệu của thầy/cô", và báo phụ huynh mới liên kết khi lớp đã có thông báo.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('0000a801-0000-0000-0000-000000000001', 'dx-gv@test.local', '{"role":"teacher","name":"Thầy Minh"}'),
  ('0000a802-0000-0000-0000-000000000001', 'dxa@openlms.edu', '{"role":"student","name":"Châu"}'),
  ('0000a802-0000-0000-0000-000000000002', 'dxb@openlms.edu', '{"role":"student","name":"Duy"}'),
  ('0000a803-0000-0000-0000-000000000001', '0902000001@parent.test', '{"role":"parent","name":"Mẹ Châu"}'),
  ('0000a803-0000-0000-0000-000000000002', '0902000002@parent.test', '{"role":"parent","name":"Bố Duy"}');
insert into v2.classes (id, name, grade, teacher_id) values ('dx-5c', '5C', 5, '0000a801-0000-0000-0000-000000000001');
update v2.profiles set grade = 5, class_id = 'dx-5c'
 where id in ('0000a802-0000-0000-0000-000000000001', '0000a802-0000-0000-0000-000000000002');
insert into v2.behaviors (class_id, id, label, points, icon, kind, position) values
  ('dx-5c', 'chu-y', 'Chú ý nghe giảng', 1, 'star', 'positive', 1);

-- 1) Tên huy hiệu
select is((select title from v2.badges where id = 'cua-co'), 'Huy hiệu của thầy/cô', 'huy hiệu GV tặng: "Huy hiệu của thầy/cô"');

select is((select hint from v2.badges where id = 'cua-co'), 'Thầy/cô tặng riêng cho em', 'mô tả huy hiệu dùng "thầy/cô"');

-- 2) Không còn hàm v2 nào xưng "cô" một mình hay "thầy cô" không gạch chéo
select is((
  select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'v2' and p.prosrc ~ '[Tt]hầy cô'
), 0, 'hàm v2 dùng "thầy/cô" (không còn "thầy cô")');
select is((
  select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'v2'
     and p.prosrc ~ '(^|[^A-Za-zÀ-ỹĐđ/])[Cc]ô([^A-Za-zÀ-ỹĐđ]|$)'
), 0, 'hàm v2 không còn danh xưng "cô" đứng riêng');

-- 3) Lời nhắn tự động khi được khen
insert into v2.behavior_logs (id, student_id, class_id, behavior_id, points, note, by) values
  ('0000a8b0-0000-0000-0000-000000000001', '0000a802-0000-0000-0000-000000000001', 'dx-5c', 'chu-y', 1, null, '0000a801-0000-0000-0000-000000000001');
select is((select title from v2.notifications where user_id = '0000a802-0000-0000-0000-000000000001' and kind = 'hs-khen'),
          'Em được thầy/cô khen: Chú ý nghe giảng', 'HS: "Em được thầy/cô khen: …"');

-- 4) Phụ huynh liên kết khi lớp CHƯA có thông báo → không có thông báo chào
insert into v2.guardian_links (parent_id, student_id, relation) values
  ('0000a803-0000-0000-0000-000000000001', '0000a802-0000-0000-0000-000000000001', 'Mẹ');
select is((select count(*)::int from v2.notifications where user_id = '0000a803-0000-0000-0000-000000000001' and kind = 'ph-thong-bao'), 0,
          'lớp chưa có thông báo → phụ huynh mới không nhận thông báo chào');
select is((select count(*)::int from v2.notifications where user_id = '0000a801-0000-0000-0000-000000000001' and kind = 'gv-lien-ket'), 1,
          'GV vẫn được báo có phụ huynh mới liên kết');

-- 5) Lớp đã gửi thông báo cả lớp (đã gửi, trong 30 ngày) + 1 thông báo đã thu hồi + 1 thông báo hẹn giờ chưa gửi
insert into v2.parent_posts (class_id, author_id, audience, student_ids, title, body, send_at, notified_at, recalled_at) values
  ('dx-5c', '0000a801-0000-0000-0000-000000000001', 'class', '{}', 'Thông báo lịch nghỉ', 'Lớp nghỉ thứ Sáu.', now() - interval '1 day', now() - interval '1 day', null),
  ('dx-5c', '0000a801-0000-0000-0000-000000000001', 'class', '{}', 'Đã thu hồi', '…', now() - interval '2 day', now() - interval '2 day', now() - interval '1 day'),
  ('dx-5c', '0000a801-0000-0000-0000-000000000001', 'class', '{}', 'Hẹn giờ', '…', now() + interval '1 day', null, null),
  ('dx-5c', '0000a801-0000-0000-0000-000000000001', 'students', array['0000a802-0000-0000-0000-000000000001'::uuid], 'Riêng em Châu', '…',
   now() - interval '1 hour', now() - interval '1 hour', null);

insert into v2.guardian_links (parent_id, student_id, relation) values
  ('0000a803-0000-0000-0000-000000000002', '0000a802-0000-0000-0000-000000000002', 'Bố');
select is((select count(*)::int from v2.notifications where user_id = '0000a803-0000-0000-0000-000000000002' and kind = 'ph-thong-bao'), 1,
          'phụ huynh mới liên kết nhận 1 thông báo chào');
select is((select title from v2.notifications where user_id = '0000a803-0000-0000-0000-000000000002' and kind = 'ph-thong-bao'),
          'Lớp 5C có 1 thông báo gần đây', 'chỉ đếm thông báo cả lớp đã gửi, chưa thu hồi (không tính tin riêng em khác, tin hẹn giờ)');
select is((select push_state from v2.notifications where user_id = '0000a803-0000-0000-0000-000000000002' and kind = 'ph-thong-bao'), 'none',
          'chưa đăng ký nhận thông báo đẩy → chỉ hiện trong chuông');

-- 6) Liên kết thêm một phụ huynh nữa cho em Châu (có tin riêng) → đếm cả tin riêng của em
insert into auth.users (id, email, raw_user_meta_data) values
  ('0000a803-0000-0000-0000-000000000003', '0902000003@parent.test', '{"role":"parent","name":"Bố Châu"}');
insert into v2.guardian_links (parent_id, student_id, relation) values
  ('0000a803-0000-0000-0000-000000000003', '0000a802-0000-0000-0000-000000000001', 'Bố');
select is((select title from v2.notifications where user_id = '0000a803-0000-0000-0000-000000000003' and kind = 'ph-thong-bao'),
          'Lớp 5C có 2 thông báo gần đây', 'đếm cả thông báo gửi riêng cho con');

select * from finish();
rollback;
