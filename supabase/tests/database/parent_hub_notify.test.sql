-- pgTAP: Phụ huynh (quyền xem theo lớp, chờ duyệt, gửi phụ huynh, nhắn tin) + Thông báo (20261127000001_v2_parent_hub_notify.sql).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(81);

insert into auth.users (id, email, raw_user_meta_data) values
  ('0000a701-0000-0000-0000-000000000001', 'ph-gv@test.local', '{"role":"teacher","name":"Cô Hoa"}'),
  ('0000a701-0000-0000-0000-000000000002', 'ph-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('0000a702-0000-0000-0000-000000000001', 'pha@openlms.edu', '{"role":"student","name":"An"}'),
  ('0000a702-0000-0000-0000-000000000002', 'phb@openlms.edu', '{"role":"student","name":"Bình"}'),
  ('0000a703-0000-0000-0000-000000000001', '0901000001@parent.test', '{"role":"parent","name":"Mẹ An"}'),
  ('0000a703-0000-0000-0000-000000000002', '0901000002@parent.test', '{"role":"parent","name":"Bố Bình"}'),
  ('0000a703-0000-0000-0000-000000000003', '0901000003@parent.test', '{"role":"parent","name":"Cô Ba"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('ph-5a', '5A', 5, '0000a701-0000-0000-0000-000000000001'),
  ('ph-5b', '5B', 5, '0000a701-0000-0000-0000-000000000002');
update v2.profiles set grade = 5, class_id = 'ph-5a' where id in ('0000a702-0000-0000-0000-000000000001', '0000a702-0000-0000-0000-000000000002');
insert into v2.guardian_links (parent_id, student_id, relation) values
  ('0000a703-0000-0000-0000-000000000001', '0000a702-0000-0000-0000-000000000001', 'Mẹ'),
  ('0000a703-0000-0000-0000-000000000002', '0000a702-0000-0000-0000-000000000002', 'Bố');
insert into v2.behaviors (class_id, id, label, points, icon, kind, position) values
  ('ph-5a', 'chu-y', 'Chú ý nghe giảng', 1, 'star', 'positive', 1),
  ('ph-5a', 'noi-chuyen', 'Nói chuyện riêng', -1, 'alert', 'needs-work', 2);

-- ---------------------------------------------------------------------------
-- Giờ yên lặng
-- ---------------------------------------------------------------------------
select is(v2._quiet_until('21:00', '06:30', '2026-11-27 22:00+07'), '2026-11-28 06:30+07'::timestamptz, '22:00 trong giờ yên lặng → 06:30 sáng mai');
select is(v2._quiet_until('21:00', '06:30', '2026-11-27 05:00+07'), '2026-11-27 06:30+07'::timestamptz, '05:00 → 06:30 cùng ngày');
select is(v2._quiet_until('21:00', '06:30', '2026-11-27 10:00+07'), '2026-11-27 10:00+07'::timestamptz, '10:00 → gửi ngay');
select is(v2._quiet_until('07:00', '11:00', '2026-11-27 08:00+07'), '2026-11-27 11:00+07'::timestamptz, 'khung ban ngày 07:00–11:00');
select is(v2._quiet_until(null, null, '2026-11-27 23:00+07'), '2026-11-27 23:00+07'::timestamptz, 'tắt giờ yên lặng');

-- ---------------------------------------------------------------------------
-- Sự kiện (ghi thẳng bảng như các RPC của GV)
-- ---------------------------------------------------------------------------
insert into v2.behavior_logs (id, student_id, class_id, behavior_id, points, note, by) values
  ('0000a7b0-0000-0000-0000-000000000001', '0000a702-0000-0000-0000-000000000001', 'ph-5a', 'chu-y', 1, null, '0000a701-0000-0000-0000-000000000001'),
  ('0000a7b0-0000-0000-0000-000000000002', '0000a702-0000-0000-0000-000000000001', 'ph-5a', 'noi-chuyen', -1, 'Trong giờ Toán', '0000a701-0000-0000-0000-000000000001');
insert into v2.attendance (class_id, date, student_id, status, updated_by) values
  ('ph-5a', v2.today_vn(), '0000a702-0000-0000-0000-000000000001', 'vang-khong-phep', '0000a701-0000-0000-0000-000000000001'),
  ('ph-5a', v2.today_vn() - 1, '0000a702-0000-0000-0000-000000000001', 'co-mat', '0000a701-0000-0000-0000-000000000001');
insert into v2.learning_events (user_id, verb, object_type, object_id, at) values
  ('0000a702-0000-0000-0000-000000000001', 'answered', 'item', 'x1', now());

select is((select count(*)::int from v2.notifications where user_id = '0000a702-0000-0000-0000-000000000001' and kind = 'hs-khen'), 1, 'HS được khen → có thông báo');
select is((select count(*)::int from v2.notifications where user_id = '0000a703-0000-0000-0000-000000000001' and kind = 'ph-khen'), 1, 'PH nhận lời khen (mặc định tự động)');
select is((select count(*)::int from v2.notifications where user_id = '0000a703-0000-0000-0000-000000000001' and kind = 'ph-nhac-nho'), 0, 'Nhắc nhở mặc định chờ cô duyệt → chưa báo PH');
select is((select count(*)::int from v2.notifications where user_id = '0000a703-0000-0000-0000-000000000001' and kind = 'ph-chuyen-can' and sensitive), 1, 'Vắng học → báo PH ngay (tin nhạy cảm)');
select is((select count(*)::int from v2.notifications where user_id = '0000a703-0000-0000-0000-000000000002'), 0, 'PH em khác không nhận gì');

-- ---------------------------------------------------------------------------
-- Phụ huynh thấy gì (RLS + hồ sơ)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000a701-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.parent_share_get('ph-5a') -> 'modes' ->> 'reminders', 'review', 'mặc định: nhắc nhở cô duyệt');
select is(v2.parent_share_get('ph-5a') -> 'modes' ->> 'attendance', 'auto', 'mặc định: chuyên cần tự động');
select is((v2.parent_share_get('ph-5a') ->> 'parents')::int, 2, 'lớp có 2 phụ huynh đã liên kết');

select set_config('request.jwt.claims', '{"sub":"0000a703-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.behavior_logs), 1, 'PH chỉ thấy lời khen, chưa thấy nhắc nhở');
select is(jsonb_array_length(v2.get_student_extras('0000a702-0000-0000-0000-000000000001') -> 'behaviorLogs'), 1, 'hồ sơ cũng chỉ có lời khen');
select is((select count(*)::int from v2.attendance), 2, 'PH thấy chuyên cần');

select set_config('request.jwt.claims', '{"sub":"0000a702-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.behavior_logs), 2, 'HS vẫn thấy đủ của mình');
select throws_ok($$ select v2.parent_share_save('ph-5a', '{"modes":{"study":"off"}}') $$, '42501', null, 'HS không đổi được cài đặt');

select set_config('request.jwt.claims', '{"sub":"0000a701-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select v2.parent_queue('ph-5a') $$, '42501', null, 'GV lớp khác không xem được hàng chờ');

select set_config('request.jwt.claims', '{"sub":"0000a701-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select v2.parent_share_save('ph-5a', '{"modes":{"study":"review"}}') $$, '22023', null, 'Kết quả tự học không có chế độ duyệt');
select is(jsonb_array_length(v2.parent_queue('ph-5a')), 1, 'Hàng chờ có 1 mục (nhắc nhở)');
select is(v2.parent_queue('ph-5a') -> 0 ->> 'kind', 'reminders', 'mục chờ là nhắc nhở');
select is(v2.parent_release('[{"kind":"reminders","refId":"0000a7b0-0000-0000-0000-000000000002"}]', 'sent', 'Cô nhờ bố mẹ nhắc con.'), 1, 'GV gửi mục chờ duyệt');
select is(jsonb_array_length(v2.parent_queue('ph-5a')), 0, 'Hàng chờ đã trống');
select is((select count(*)::int from jsonb_array_elements(v2.parent_preview('0000a702-0000-0000-0000-000000000001') -> 'items') x where x ->> 'kind' = 'reminders' and (x ->> 'shown')::int = 1), 1,
          'Xem như phụ huynh: nhắc nhở đã hiện 1');

select set_config('request.jwt.claims', '{"sub":"0000a703-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.behavior_logs), 2, 'Sau khi cô gửi, PH thấy nhắc nhở');
select is(jsonb_array_length(v2.parent_inbox('0000a702-0000-0000-0000-000000000001') -> 'items'), 1, 'Hộp thư PH có mục cô gửi');
select is(v2.parent_inbox('0000a702-0000-0000-0000-000000000001') -> 'items' -> 0 ->> 'note', 'Cô nhờ bố mẹ nhắc con.', 'kèm lời nhắn của cô');
reset role;
select is((select count(*)::int from v2.notifications where user_id = '0000a703-0000-0000-0000-000000000001' and kind = 'ph-nhac-nho' and sensitive), 1, 'Gửi mục duyệt → báo PH');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000a701-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.parent_share_save('ph-5a', '{"modes":{"attendance":"off","study":"off"}}') -> 'modes' ->> 'attendance', 'off', 'GV tắt chuyên cần + tự học');
select set_config('request.jwt.claims', '{"sub":"0000a703-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.attendance), 0, 'Tắt → PH không đọc được chuyên cần');
select is((select count(*)::int from v2.learning_events), 0, 'Tắt → PH không đọc được hoạt động tự học');
select is(jsonb_array_length(v2.get_student_profile('0000a702-0000-0000-0000-000000000001') -> 'events'), 0, 'hồ sơ cũng không có hoạt động');
select is(v2.parent_inbox('0000a702-0000-0000-0000-000000000001') -> 'modes' ->> 'study', 'off', 'app PH biết mục nào đang tắt');
select set_config('request.jwt.claims', '{"sub":"0000a702-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.learning_events), 1, 'HS vẫn đọc được hoạt động của mình');

-- ---------------------------------------------------------------------------
-- Gửi phụ huynh
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0000a701-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table _p1 on commit drop as
  select v2.parent_post_create('{"classId":"ph-5a","title":"Họp phụ huynh","body":"Thứ Bảy 8:00","ackRequired":true}') as j;
grant select on _p1 to authenticated;
select is((select (j ->> 'sent')::boolean from _p1), true, 'thông báo cả lớp gửi ngay');
select is((select (j ->> 'parents')::int from _p1), 2, 'gửi tới 2 phụ huynh');
select throws_ok($$ select v2.parent_post_create('{"classId":"ph-5a","audience":"students","studentIds":["0000a702-0000-0000-0000-000000000009"],"title":"x"}') $$,
                 '22023', null, 'em ngoài lớp bị từ chối');
create temp table _p2 on commit drop as
  select v2.parent_post_create('{"classId":"ph-5a","audience":"students","studentIds":["0000a702-0000-0000-0000-000000000002"],"title":"Riêng Bình"}') as j;
create temp table _p3 on commit drop as
  select v2.parent_post_create(jsonb_build_object('classId', 'ph-5a', 'title', 'Hẹn giờ', 'sendAt', now() + interval '2 hours')) as j;
grant select on _p2, _p3 to authenticated;
select is((select (j ->> 'sent')::boolean from _p3), false, 'thông báo hẹn giờ chưa gửi');
reset role;
select is((select count(*)::int from v2.notifications where kind = 'ph-thong-bao' and user_id = '0000a703-0000-0000-0000-000000000001'), 1, 'Mẹ An nhận 1 thông báo (không nhận tin riêng của Bình)');
select is((select count(*)::int from v2.notifications where kind = 'ph-thong-bao' and user_id = '0000a703-0000-0000-0000-000000000002'), 2, 'Bố Bình nhận 2 thông báo');
update v2.parent_posts set send_at = now() - interval '1 minute' where id = (select (j ->> 'id')::uuid from _p3);
select is((v2.notify_tick() ->> 'posts')::int, 1, 'đến giờ → lịch chạy mỗi phút gửi thông báo hẹn giờ');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000a703-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.parent_inbox('0000a702-0000-0000-0000-000000000001') -> 'posts'), 2, 'Mẹ An thấy 2 thông báo cả lớp');
select ok(v2.parent_post_read((select (j ->> 'id')::uuid from _p1), true) ->> 'ackedAt' is not null, 'Mẹ An xác nhận');
select throws_ok(format('select v2.parent_post_read(%L)', (select j ->> 'id' from _p2)), '42501', null, 'không đọc được tin riêng của em khác');
select set_config('request.jwt.claims', '{"sub":"0000a703-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select v2.parent_inbox('0000a702-0000-0000-0000-000000000001') $$, '42501', null, 'PH chưa liên kết không xem được');
select set_config('request.jwt.claims', '{"sub":"0000a703-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(jsonb_array_length(v2.parent_inbox('0000a702-0000-0000-0000-000000000002') -> 'posts'), 3, 'Bố Bình thấy cả tin riêng');
select lives_ok(format('select v2.parent_post_read(%L, true)', (select j ->> 'id' from _p1)), 'Bố Bình xác nhận');
reset role;
select is((select count(*)::int from v2.notifications where kind = 'gv-xac-nhan' and user_id = '0000a701-0000-0000-0000-000000000001'), 1, 'Đủ phụ huynh xác nhận → báo cô');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000a701-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.parent_post_detail((select (j ->> 'id')::uuid from _p1)) ->> 'acks')::int, 2, 'chi tiết: 2 xác nhận');
select ok((v2.parent_post_recall((select (j ->> 'id')::uuid from _p2)) ->> 'recalled')::boolean, 'thu hồi tin riêng');
select set_config('request.jwt.claims', '{"sub":"0000a703-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(jsonb_array_length(v2.parent_inbox('0000a702-0000-0000-0000-000000000002') -> 'posts'), 2, 'tin đã thu hồi không còn hiện');

-- ---------------------------------------------------------------------------
-- Nhắn tin hai chiều
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0000a703-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(v2.parent_message_send('0000a702-0000-0000-0000-000000000001', 'Cô ơi, mai con xin nghỉ ạ.') ->> 'id' is not null, 'PH nhắn cô');
select throws_ok($$ select v2.parent_message_send('0000a702-0000-0000-0000-000000000002', 'Chào cô') $$, '42501', null, 'không nhắn về em khác');
select throws_ok($$ select v2.parent_thread('0000a702-0000-0000-0000-000000000002') $$, '42501', null, 'không mở được trò chuyện của em khác');
reset role;
select is((select count(*)::int from v2.notifications where kind = 'gv-tin-nhan' and user_id = '0000a701-0000-0000-0000-000000000001'), 1, 'cô nhận thông báo tin nhắn');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000a701-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.parent_threads('ph-5a') -> 0 ->> 'unread')::int, 1, 'danh sách trò chuyện: 1 tin chưa đọc');
select is(jsonb_array_length(v2.parent_thread('0000a702-0000-0000-0000-000000000001') -> 'messages'), 1, 'cô mở trò chuyện');
select is((v2.parent_threads('ph-5a') -> 0 ->> 'unread')::int, 0, 'đã đọc');
select ok(v2.parent_message_send('0000a702-0000-0000-0000-000000000001', 'Cô đã nhận, cảm ơn chị.') ->> 'fromTeacher' = 'true', 'cô trả lời');
select is(v2.parent_share_save('ph-5a', '{"msgEnabled":false}') ->> 'msgEnabled', 'false', 'cô tắt nhận tin');
select set_config('request.jwt.claims', '{"sub":"0000a703-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.parent_inbox('0000a702-0000-0000-0000-000000000001') -> 'thread' ->> 'unread')::int, 1, 'PH thấy 1 tin mới của cô');
select throws_ok($$ select v2.parent_message_send('0000a702-0000-0000-0000-000000000001', 'Dạ') $$, '42501', null, 'lớp tắt nhắn tin → PH không gửi được');

-- ---------------------------------------------------------------------------
-- Chuông thông báo, cài đặt, đẩy
-- ---------------------------------------------------------------------------
select ok((v2.notify_list() ->> 'unread')::int >= 4, 'PH có thông báo chưa đọc');
select ok(v2.notify_read() >= 4, 'đánh dấu đã đọc tất cả');
select is(v2.notify_unread(), 0, 'không còn tin chưa đọc');
select is(v2.notify_prefs_save('{"quietFrom":"","quietTo":"","pushOff":["ph-khen"]}') ->> 'quietFrom', null, 'tắt giờ yên lặng');
select is((v2.push_subscribe('{"endpoint":"https://push.example.com/abc","p256dh":"BPXa1234567890123456789012345678901234567890123456789012345678901234567890123456","auth":"abcdefghijklmnop"}') ->> 'devices')::int, 1, 'đăng kí nhận thông báo trên máy');
select throws_ok($$ select v2.push_claim() $$, '42501', null, 'người dùng không gọi được hàng đợi đẩy');
reset role;
select v2._notify(array['0000a703-0000-0000-0000-000000000001'::uuid], 'ph-thong-bao', 'Thử', 'x');
select v2._notify(array['0000a703-0000-0000-0000-000000000001'::uuid], 'ph-khen', 'Khen', 'x');
select is((select push_state from v2.notifications where user_id = '0000a703-0000-0000-0000-000000000001' and title = 'Thử'), 'pending', 'có máy nhận → chờ đẩy ngay');
select is((select push_state from v2.notifications where user_id = '0000a703-0000-0000-0000-000000000001' and title = 'Khen'), 'none', 'loại đã tắt đẩy → chỉ hiện trong chuông');
create temp table _claim on commit drop as select v2.push_claim(50) as j;
select is((select jsonb_array_length(j -> 0 -> 'subs') from _claim), 1, 'hàng đợi kèm máy nhận');
select is((v2.push_done(jsonb_build_object('sent', jsonb_build_array((select j -> 0 -> 'id' from _claim)))) ->> 'sent')::int, 1, 'ghi nhận đã đẩy');
select is((select push_state from v2.notifications where user_id = '0000a703-0000-0000-0000-000000000001' and title = 'Thử'), 'sent', 'trạng thái: đã đẩy');

-- Gộp tin: 2 bài nộp cùng đề → 1 thông báo cho cô "2 bài mới cần chấm".
insert into v2.rubrics (id, title, subject, grade, model_answer, owner_id) values ('ph-r1', 'Tả cây', 'tieng-viet', 5, '', '0000a701-0000-0000-0000-000000000001');
insert into v2.work_tasks (id, title, subject, grade, rubric_id, class_id, created_by) values ('ph-w1', 'Tả cây bàng', 'tieng-viet', 5, 'ph-r1', 'ph-5a', '0000a701-0000-0000-0000-000000000001');
insert into v2.submissions (task_id, student_id, class_id, kind, text, status, submitted_by) values
  ('ph-w1', '0000a702-0000-0000-0000-000000000001', 'ph-5a', 'text', 'Cây bàng…', 'submitted', 'student'),
  ('ph-w1', '0000a702-0000-0000-0000-000000000002', 'ph-5a', 'text', 'Cây bàng…', 'submitted', 'student');
select is((select title from v2.notifications where kind = 'gv-nop-bai' and user_id = '0000a701-0000-0000-0000-000000000001'), '2 bài mới cần chấm: Tả cây bàng', 'gộp 2 bài nộp thành 1 thông báo');

-- Giao bài + nhắc hạn.
insert into v2.lessons (id, title, subject, grade, owner_id, status) values ('ph-l1', 'Phân số', 'toan', 5, '0000a701-0000-0000-0000-000000000001', 'published');
insert into v2.assignments (id, target_type, target_id, title, class_id, open_at, due_at, created_by) values
  ('ph-a1', 'lesson', 'ph-l1', 'Ôn phân số', 'ph-5a', now() - interval '1 minute', now() + interval '20 hours', '0000a701-0000-0000-0000-000000000001');
select is((select count(*)::int from v2.notifications where kind = 'hs-bai-moi' and ref ->> 'assignmentId' = 'ph-a1'), 2, 'giao bài → 2 HS nhận thông báo');
select ok(v2._due_notify() >= 2, 'nhắc hạn bài chưa học xong');
select is((select count(*)::int from v2.notifications where kind = 'ph-han-bai'), 2, 'phụ huynh cũng được nhắc hạn');

-- Liên kết mới → báo cô.
insert into v2.guardian_links (parent_id, student_id, relation) values ('0000a703-0000-0000-0000-000000000003', '0000a702-0000-0000-0000-000000000002', 'Bà');
select is((select count(*)::int from v2.notifications where kind = 'gv-lien-ket' and user_id = '0000a701-0000-0000-0000-000000000001'), 1, 'phụ huynh mới liên kết → báo cô');

-- Quyền gọi hàm.
select ok(not has_function_privilege('anon', 'v2.parent_inbox(uuid)', 'execute'), 'khách không gọi được parent_inbox');
select ok(not has_function_privilege('authenticated', 'v2.push_done(jsonb)', 'execute'), 'người dùng không gọi được push_done');

select * from finish();
rollback;
