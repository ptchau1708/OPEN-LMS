-- pgTAP: kiểm tra các quy tắc RLS/RPC chính của schema v2.
-- Chạy: supabase test db   (Supabase CLI + Docker; mọi thay đổi bị rollback sau khi chạy)
--
-- Người dùng mẫu:
--   A0 admin            0000000a-0000-0000-0000-000000000000
--   T1 GV lớp 2A1       0000000b-0000-0000-0000-000000000001
--   T2 GV lớp 2A2       0000000b-0000-0000-0000-000000000002
--   S1 HS lớp 2A1       0000000c-0000-0000-0000-000000000001
--   S2 HS lớp 2A2       0000000c-0000-0000-0000-000000000002
--   P1 phụ huynh của S2 0000000d-0000-0000-0000-000000000001
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(48);

-- ---------------------------------------------------------------------------
-- Dữ liệu mẫu (postgres). Trigger trên auth.users tự tạo v2.profiles + passports.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('0000000a-0000-0000-0000-000000000000', 'admin@test.local',    '{"role":"admin","name":"Quản trị"}'),
  ('0000000b-0000-0000-0000-000000000001', 'gv1@test.local',      '{"role":"teacher","name":"Cô Lan"}'),
  ('0000000b-0000-0000-0000-000000000002', 'gv2@test.local',      '{"role":"teacher","name":"Thầy Minh"}'),
  ('0000000c-0000-0000-0000-000000000001', 'an2a1@openlms.edu',   '{"role":"student","name":"Minh An"}'),
  ('0000000c-0000-0000-0000-000000000002', 'binh2a2@openlms.edu', '{"role":"student","name":"Bình"}'),
  ('0000000d-0000-0000-0000-000000000001', 'me.binh@test.local',  '{"role":"parent","name":"Mẹ Bình"}');

select is((select count(*)::int from v2.profiles where id in (
  '0000000a-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000001', '0000000b-0000-0000-0000-000000000002',
  '0000000c-0000-0000-0000-000000000001', '0000000c-0000-0000-0000-000000000002', '0000000d-0000-0000-0000-000000000001')),
  6, 'trigger auth.users tạo đủ hồ sơ v2');
select is((select username from v2.profiles where id = '0000000c-0000-0000-0000-000000000001'),
  'an2a1', 'username lấy từ email @openlms.edu');

insert into v2.classes (id, name, grade, teacher_id) values
  ('c-2a1', '2A1', 2, '0000000b-0000-0000-0000-000000000001'),
  ('c-2a2', '2A2', 2, '0000000b-0000-0000-0000-000000000002');
update v2.profiles set grade = 2, class_id = 'c-2a1' where id = '0000000c-0000-0000-0000-000000000001';
update v2.profiles set grade = 2, class_id = 'c-2a2' where id = '0000000c-0000-0000-0000-000000000002';
insert into v2.class_members (class_id, user_id, role) values
  ('c-2a1', '0000000c-0000-0000-0000-000000000001', 'student'),
  ('c-2a2', '0000000c-0000-0000-0000-000000000002', 'student');
insert into v2.guardian_links (parent_id, student_id) values
  ('0000000d-0000-0000-0000-000000000001', '0000000c-0000-0000-0000-000000000002');

insert into v2.items (id, type, grade, subject, prompt, payload, owner_id) values
  ('i-mcq', 'MCQ', 2, 'toan', '{"text":"2 + 3 = ?"}',
   '{"options":[{"id":"a","text":"4"},{"id":"b","text":"5"}]}', '0000000b-0000-0000-0000-000000000001');
insert into v2.item_keys (item_id, key) values ('i-mcq', '{"correct":"b"}');

-- ---------------------------------------------------------------------------
-- GV1 soạn bài
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000000b-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  select v2.save_lesson('{
    "id": "l-cong", "title": "Phép cộng trong phạm vi 10", "subject": "toan", "grade": 2, "status": "published",
    "slides": [
      {"id": "s1", "layout": "title", "title": "Cùng học phép cộng"},
      {"id": "s2", "layout": "activity", "itemId": "i-mcq"},
      {"id": "s3", "layout": "activity", "item": {"id": "i-emb", "type": "MCQ", "prompt": {"text": "1 + 1 = ?"},
        "payload": {"options": [{"id":"a","text":"2"},{"id":"b","text":"3"}]}, "key": {"correct": "a"}}},
      {"id": "s4", "layout": "summary"}
    ]}'::jsonb)
$$, 'GV lưu được bài giảng của mình (save_lesson)');

select is((v2.get_lesson('l-cong') -> 'slides' -> 2 -> 'item' -> 'key' ->> 'correct'), 'a',
  'GV xem bài thấy đáp án của item nhúng');
select is((select count(*)::int from v2.lesson_slides where lesson_id = 'l-cong'), 4, 'đủ 4 slide theo thứ tự');

select lives_ok($$
  select v2.save_lesson('{"id": "l-cong", "title": "Phép cộng (sửa)", "subject": "toan", "grade": 2, "status": "published",
    "slides": [{"id": "s1", "layout": "title"}, {"id": "s2", "layout": "activity", "itemId": "i-mcq"},
               {"id": "s3", "layout": "activity", "item": {"id": "i-emb", "type": "MCQ", "prompt": {"text": "1 + 1 = ?"},
                 "payload": {"options": [{"id":"a","text":"2"},{"id":"b","text":"3"}]}, "key": {"correct": "a"}}}]}'::jsonb)
$$, 'GV sửa lại bài của mình');

select throws_ok($$ select v2.save_lesson('{"title": "Thiếu lớp", "subject": "toan", "slides": []}'::jsonb) $$,
  '22023', null, 'save_lesson báo lỗi dữ liệu thiếu lớp');

select is(jsonb_array_length(v2.get_items(array['i-mcq'])), 1, 'GV lấy được item');
select ok((v2.get_items(array['i-mcq']) -> 0) ? 'key', 'GV nhận item KÈM đáp án');

-- ---------------------------------------------------------------------------
-- GV2 không sửa được bài của GV1
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0000000b-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select v2.save_lesson('{"id": "l-cong", "title": "Chiếm bài", "subject": "toan", "grade": 2, "slides": []}'::jsonb) $$,
  '42501', null, 'GV khác không sửa được bài giảng');
-- UPDATE bị RLS lọc: không lỗi, chỉ không có dòng nào đổi.
update v2.items set hint = 'hack' where id = 'i-mcq';
select is((select hint from v2.items where id = 'i-mcq'), null, 'GV khác không sửa được item của GV1');

-- ---------------------------------------------------------------------------
-- HS1 (lớp 2A1)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0000000c-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from v2.item_keys), 0, 'HS KHÔNG đọc được item_keys');
select is((select count(*)::int from v2.items where id = 'i-mcq'), 1, 'HS đọc được item cùng khối');
select ok(not ((v2.get_items(array['i-mcq', 'i-emb']) -> 0) ? 'key'), 'get_items trả item KHÔNG kèm đáp án cho HS');
select ok(not ((v2.get_lesson('l-cong') -> 'slides' -> 2 -> 'item') ? 'key'), 'get_lesson bỏ đáp án item nhúng cho HS');
select ok(not exists (select 1 from v2.lesson_slides where data -> 'item' ? 'key'), 'lesson_slides không chứa đáp án');

select throws_ok($$ insert into v2.reward_ledger (user_id, stars, reason, source_type)
                    values ('0000000c-0000-0000-0000-000000000001', 100, 'tự cộng', 'bonus') $$,
  '42501', null, 'HS KHÔNG ghi được reward_ledger');
select throws_ok($$ insert into v2.learning_events (user_id, verb, object_type, object_id)
                    values ('0000000c-0000-0000-0000-000000000001', 'answered', 'item', 'i-mcq') $$,
  '42501', null, 'HS KHÔNG ghi trực tiếp được learning_events');
select throws_ok($$ select v2._award('0000000c-0000-0000-0000-000000000001', 50, 0, 0, 'x', 'bonus', null, null, null) $$,
  '42501', null, 'HS KHÔNG gọi được hàm nội bộ _award');
select throws_ok($$ select v2.record_grade('0000000c-0000-0000-0000-000000000001', 'i-mcq', '{"choice":"b"}', true, true, 1) $$,
  '42501', null, 'HS KHÔNG gọi được record_grade (chỉ Edge Function)');
select throws_ok($$ select v2.save_lesson('{"title": "Bài của em", "subject": "toan", "grade": 2}'::jsonb) $$,
  '42501', null, 'HS không lưu được bài giảng');

-- HS ghi tiến độ được nhưng không tự đặt answers/stars_earned
insert into v2.lesson_progress (user_id, lesson_id, slide_index, answers, stars_earned)
values ('0000000c-0000-0000-0000-000000000001', 'l-cong', 1, '{"s2":{"correct":true,"score":1}}', 99);
select is((select answers from v2.lesson_progress where user_id = '0000000c-0000-0000-0000-000000000001' and lesson_id = 'l-cong'),
  '{}'::jsonb, 'HS không tự ghi được answers');
select is((select slide_index from v2.lesson_progress where user_id = '0000000c-0000-0000-0000-000000000001' and lesson_id = 'l-cong'),
  1, 'HS ghi được slide_index');

-- HS không tự đổi vai trò
update v2.profiles set role = 'admin', name = 'Minh An 2A1' where id = '0000000c-0000-0000-0000-000000000001';
select is((select role || '|' || name from v2.profiles where id = '0000000c-0000-0000-0000-000000000001'),
  'student|Minh An 2A1', 'HS đổi được tên nhưng KHÔNG đổi được vai trò');

-- ---------------------------------------------------------------------------
-- Chấm bài (giả lập Edge Function bằng service role) + hoàn thành bài
-- ---------------------------------------------------------------------------
reset role;
select is((v2.record_grade('0000000c-0000-0000-0000-000000000001', 'i-mcq', '{"choice":"b"}', true, true, 1, 'l-cong') ->> 'starsAwarded')::int,
  1, 'trả lời đúng lần đầu được 1 sao');
select is((v2.record_grade('0000000c-0000-0000-0000-000000000001', 'i-mcq', '{"choice":"b"}', true, true, 1, 'l-cong') ->> 'starsAwarded')::int,
  0, 'trả lời đúng lần hai trong cùng bài không được thêm sao');
select is((select answers -> 's2' ->> 'correct' from v2.lesson_progress
           where user_id = '0000000c-0000-0000-0000-000000000001' and lesson_id = 'l-cong'),
  'true', 'grade ghi answers theo slide id');
-- HS khác lớp có tiến độ riêng (để kiểm tra quyền đọc)
select v2.record_grade('0000000c-0000-0000-0000-000000000002', 'i-mcq', '{"choice":"a"}', true, false, 0, 'l-cong');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000000c-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.complete_lesson('l-cong') ->> 'starsAwarded')::int, 1, 'complete_lesson: sao = số câu đúng');
select is((v2.complete_lesson('l-cong') ->> 'starsAwarded')::int, 0, 'complete_lesson chỉ thưởng 1 lần mỗi bài');
select is((select stars from v2.wallets where user_id = '0000000c-0000-0000-0000-000000000001'), 2, 'ví HS1 có 2 sao');
select is((select streak_days from v2.wallets where user_id = '0000000c-0000-0000-0000-000000000001'), 1, 'chuỗi ngày học = 1');

select is((select count(*)::int from v2.lesson_progress where user_id = '0000000c-0000-0000-0000-000000000002'), 0,
  'HS KHÔNG đọc được tiến độ của HS lớp khác');
select is((select count(*)::int from v2.wallets where user_id = '0000000c-0000-0000-0000-000000000002'), 0,
  'HS KHÔNG xem được ví của HS lớp khác');

select throws_ok($$ select v2.set_companion('shiba') $$, '42501', null, 'chưa đủ sao thì chưa chọn được Shiba');

-- ---------------------------------------------------------------------------
-- GV1: chỉ thấy HS lớp mình; thưởng sao
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0000000b-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.lesson_progress where user_id = '0000000c-0000-0000-0000-000000000002'), 0,
  'GV KHÔNG đọc được tiến độ HS lớp khác');
select is((select count(*)::int from v2.lesson_progress where user_id = '0000000c-0000-0000-0000-000000000001'), 1,
  'GV đọc được tiến độ HS lớp mình');
select throws_ok($$ select v2.award_bonus('0000000c-0000-0000-0000-000000000002', 2, 'Giỏi') $$,
  '42501', null, 'GV không thưởng sao được cho HS lớp khác');
select throws_ok($$ select v2.award_bonus('0000000c-0000-0000-0000-000000000001', 6, 'Quá nhiều') $$,
  '22023', null, 'mỗi lần thưởng tối đa 5 sao');
select v2.award_bonus('0000000c-0000-0000-0000-000000000001', 5, 'Ngồi học ngoan') from generate_series(1, 4);
select is((select stars from v2.wallets where user_id = '0000000c-0000-0000-0000-000000000001'), 22, 'ví HS1 = 22 sao sau thưởng');

-- ---------------------------------------------------------------------------
-- HS1: Shiba đã mở (mốc 20 sao)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0000000c-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.set_companion('shiba') ->> 'companion'), 'shiba', 'đủ 20 sao → chọn được Shiba làm bạn đồng hành');

-- ---------------------------------------------------------------------------
-- Phụ huynh đọc dữ liệu của con
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0000000d-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.lesson_progress where user_id = '0000000c-0000-0000-0000-000000000002'), 1,
  'phụ huynh đọc được tiến độ của con');
select is((select count(*)::int from v2.lesson_progress where user_id = '0000000c-0000-0000-0000-000000000001'), 0,
  'phụ huynh không đọc được tiến độ của HS khác');

-- ---------------------------------------------------------------------------
-- Lớp học trực tiếp: HS lớp khác vào bằng PIN
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0000000b-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table _live on commit drop as select v2.start_live('l-cong', 'c-2a1') as info;
grant select on _live to authenticated;
select ok((select info ->> 'pin' from _live) ~ '^[0-9]{6}$', 'start_live trả về PIN 6 chữ số');

select set_config('request.jwt.claims', '{"sub":"0000000c-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.live_sessions), 0, 'HS lớp khác chưa thấy phiên trước khi nhập PIN');
select is((v2.find_live((select info ->> 'pin' from _live)) ->> 'sessionId'), (select info ->> 'sessionId' from _live),
  'find_live tìm đúng phiên theo PIN');
select is((select count(*)::int from v2.live_sessions), 1, 'sau khi nhập PIN, HS đọc được trạng thái phiên');

reset role;
select v2.record_grade('0000000c-0000-0000-0000-000000000002', 'i-mcq', '{"choice":"b"}', true, true, 1,
                       null, null, (select (info ->> 'sessionId')::uuid from _live), 1);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000000c-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.live_responses), 0, 'HS không thấy câu trả lời trực tiếp của bạn khác');
select set_config('request.jwt.claims', '{"sub":"0000000b-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from v2.live_responses), 1, 'GV chủ phiên thấy câu trả lời trực tiếp');

reset role;
select * from finish();
rollback;
