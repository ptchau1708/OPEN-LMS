-- pgTAP: Phòng thảo luận (migration 20261124000001_v2_discussions.sql).
--   T GV lớp 4A · T2 GV lớp khác · S1, S2 HS 4A · S3 HS lớp khác · P phụ huynh của S1
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(33);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000f1-0000-0000-0000-000000000001', 'tl-gv@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('000000f1-0000-0000-0000-000000000002', 'tl-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('000000f2-0000-0000-0000-000000000001', 'tlan@openlms.edu', '{"role":"student","name":"An"}'),
  ('000000f2-0000-0000-0000-000000000002', 'tlbinh@openlms.edu', '{"role":"student","name":"Bình"}'),
  ('000000f2-0000-0000-0000-000000000003', 'tlchi@openlms.edu', '{"role":"student","name":"Chi"}'),
  ('000000f3-0000-0000-0000-000000000001', 'tl-me@test.local', '{"role":"parent","name":"Mẹ An"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('tl-4a', '4A', 4, '000000f1-0000-0000-0000-000000000001'),
  ('tl-4b', '4B', 4, '000000f1-0000-0000-0000-000000000002');
update v2.profiles set grade = 4, class_id = 'tl-4a' where id in ('000000f2-0000-0000-0000-000000000001', '000000f2-0000-0000-0000-000000000002');
update v2.profiles set grade = 4, class_id = 'tl-4b' where id = '000000f2-0000-0000-0000-000000000003';
insert into v2.class_members (class_id, user_id, role) values
  ('tl-4a', '000000f2-0000-0000-0000-000000000001', 'student'),
  ('tl-4a', '000000f2-0000-0000-0000-000000000002', 'student'),
  ('tl-4b', '000000f2-0000-0000-0000-000000000003', 'student');
insert into v2.guardian_links (parent_id, student_id) values ('000000f3-0000-0000-0000-000000000001', '000000f2-0000-0000-0000-000000000001');

set local role authenticated;
-- GV tạo phòng: 2 phòng nhỏ (Tổ 1 chỉ có An), 2 tab, duyệt trước.
select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into v2.discussions (id, class_id, title, moderation, rooms, tabs, created_by) values
  ('00000000-0000-0000-0000-0000000000d1', 'tl-4a', 'Bảo vệ môi trường', 'pre',
   '[{"id":"chung","name":"Cả lớp","members":[]},{"id":"to1","name":"Tổ 1","members":["000000f2-0000-0000-0000-000000000001"]}]',
   '[{"id":"y-kien","name":"Ý kiến","color":"#2f6fd1"},{"id":"cau-hoi","name":"Câu hỏi","color":"#d89e00"}]', auth.uid()) $$, 'GV tạo phòng thảo luận');
select is((select status from v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'y-kien', null, 'Các em nêu ý kiến nhé')), 'visible', 'bài của GV hiện ngay');

-- GV lớp khác không tạo / không đăng được.
select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ insert into v2.discussions (class_id, title, created_by) values ('tl-4a', 'Lạ', auth.uid()) $$, '42501', null, 'GV lớp khác không tạo phòng');
select is((select count(*)::int from v2.discussion_posts), 0, 'GV lớp khác không đọc bài');

-- HS An đăng: chờ duyệt.
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.discussions), 1, 'HS thấy phòng của lớp');
select is((select status from v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'y-kien', null, 'Em sẽ nhặt rác')), 'pending', 'phòng duyệt trước: bài HS chờ duyệt');
select is((select status from v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'to1', 'cau-hoi', null, 'Tổ mình làm áp phích nhé')), 'pending', 'An đăng được vào phòng nhỏ Tổ 1');
select throws_ok($$ select v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'khong-co', null, 'x') $$, '22023', 'Không có tab này.', 'tab phải có trong phòng');
select throws_ok($$ select v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'y-kien', null, '   ') $$, '22023', null, 'không đăng bài trống');
select throws_ok($$ select v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'y-kien', null, 'ảnh', '["khac/000000f2-0000-0000-0000-000000000001/a.jpg"]') $$, '22023', 'Ảnh không hợp lệ.', 'ảnh phải nằm trong thư mục của em');
select is((select count(*)::int from v2.discussion_posts), 3, 'An thấy bài GV + 2 bài của mình (kể cả chờ duyệt)');

-- HS Bình: không vào Tổ 1, chưa thấy bài chờ duyệt của An.
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.discussion_posts), 1, 'Bình chỉ thấy bài đã hiện (của GV)');
select throws_ok($$ select v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'to1', 'y-kien', null, 'vào tổ 1') $$, '42501', 'Em không ở trong phòng nhỏ này.', 'không đăng vào phòng nhỏ của tổ khác');
select is((select flagged from v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'y-kien', null, 'Bạn ngu quá')), true, 'từ chưa phù hợp được đánh dấu');
select is((select flagged from v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'y-kien', null, 'Em đi ngủ sớm để mai trồng cây')), false, '"ngủ" không bị nhầm là "ngu"');

-- HS lớp khác.
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from v2.discussions), 0, 'HS lớp khác không thấy phòng');
select throws_ok($$ select v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'y-kien', null, 'xin chào') $$, '42501', null, 'HS lớp khác không đăng được');

-- GV duyệt bài của An; ẩn bài có từ chưa phù hợp.
select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.discussion_posts where status = 'pending'), 4, 'GV thấy 4 bài chờ duyệt');
select is(v2.moderate_discussion_posts(array(select id from v2.discussion_posts where author_id = '000000f2-0000-0000-0000-000000000001'), 'visible'), 2, 'duyệt 2 bài của An');
select is(v2.moderate_discussion_posts(array(select id from v2.discussion_posts where flagged), 'hidden'), 1, 'ẩn bài có từ chưa phù hợp');

-- Bình thấy bài của An ở phòng chung, không thấy ở Tổ 1; thả tim, báo bài.
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.discussion_posts where author_id = '000000f2-0000-0000-0000-000000000001'), 1, 'Bình thấy bài của An ở phòng chung, không thấy bài Tổ 1');
select is(v2.toggle_discussion_reaction((select id from v2.discussion_posts where body = 'Em sẽ nhặt rác'), 'heart'), true, 'thả tim');
select is(v2.toggle_discussion_reaction((select id from v2.discussion_posts where body = 'Em sẽ nhặt rác'), 'heart'), false, 'bấm lại thì bỏ tim');
select lives_ok($$ select v2.report_discussion_post((select id from v2.discussion_posts where body = 'Em sẽ nhặt rác'), 'Thử báo') $$, 'báo bài');
select lives_ok($$ select v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', '', (select id from v2.discussion_posts where body = 'Em sẽ nhặt rác'), 'Hay quá bạn ơi') $$, 'bình luận dưới bài');
select throws_ok($$ select v2.moderate_discussion_posts(array(select id from v2.discussion_posts), 'hidden') $$, '42501', null, 'HS không duyệt / ẩn được');

-- Phụ huynh của An: chỉ thấy bài đã hiện của An.
select set_config('request.jwt.claims', '{"sub":"000000f3-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.discussion_posts), 2, 'phụ huynh thấy 2 bài đã hiện của con');
select throws_ok($$ select v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'y-kien', null, 'Phụ huynh viết') $$, '42501', null, 'phụ huynh không đăng bài');

-- GV khóa phòng → HS không đăng được.
select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
update v2.discussions set locked = true where id = '00000000-0000-0000-0000-0000000000d1';
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select v2.post_discussion('00000000-0000-0000-0000-0000000000d1', 'chung', 'y-kien', null, 'còn mở không') $$, '42501', 'Phòng thảo luận đang khóa.', 'phòng khóa thì HS không đăng');
select lives_ok($$ select v2.remove_my_discussion_post((select id from v2.discussion_posts where body = 'Em sẽ nhặt rác')) $$, 'HS gỡ bài của mình');

-- Trò chuyện nhóm (SQL 16): phòng kind 'chat', tin nhắn theo tổ.
select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into v2.discussions (id, class_id, title, kind, moderation, rooms, tabs, created_by) values
  ('00000000-0000-0000-0000-0000000000d2', 'tl-4a', 'Trò chuyện nhóm', 'chat', 'post',
   '[{"id":"to1","name":"Tổ 1","members":["000000f2-0000-0000-0000-000000000001"]},{"id":"to2","name":"Tổ 2","members":["000000f2-0000-0000-0000-000000000002"]}]',
   '[{"id":"chat","name":"Trò chuyện","color":"#2f6fd1"}]', auth.uid()) $$, 'GV tạo phòng trò chuyện nhóm');
select throws_ok($$ update v2.discussions set kind = 'khac' where id = '00000000-0000-0000-0000-0000000000d2' $$, '23514', null, 'kind chỉ là board | chat');
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select status from v2.post_discussion('00000000-0000-0000-0000-0000000000d2', 'to2', 'chat', null, 'Tổ 2 chào cả nhà')), 'visible', 'tin nhắn hiện ngay trong tổ của em');

reset role;
select * from finish();
rollback;
