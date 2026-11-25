-- pgTAP: Màn hình lớp (TV) xem lớp trực tiếp bằng mã lớp, không cần đăng nhập (20261126000001_v2_live_screen.sql).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000e1-0000-0000-0000-000000000001', 'ls-gv@test.local', '{"role":"teacher","name":"Cô Hà"}'),
  ('000000e2-0000-0000-0000-000000000001', 'lsan@openlms.edu', '{"role":"student","name":"An"}');
insert into v2.classes (id, name, grade, teacher_id) values ('ls-5a', '5A', 5, '000000e1-0000-0000-0000-000000000001');
insert into v2.class_members (class_id, user_id, role) values ('ls-5a', '000000e2-0000-0000-0000-000000000001', 'student');
insert into v2.items (id, type, grade, subject, prompt, payload, owner_id) values
  ('ls-i1', 'MCQ', 5, 'khac', '{"text":"Năm 1010 vua Lý Thái Tổ dời đô ra đâu?"}',
   '{"options":[{"id":"a","text":"Cổ Loa"},{"id":"b","text":"Đại La"}]}', '000000e1-0000-0000-0000-000000000001'),
  ('ls-i2', 'MCQ', 5, 'khac', '{"text":"Câu hai"}',
   '{"options":[{"id":"a","text":"X"},{"id":"b","text":"Y"}]}', '000000e1-0000-0000-0000-000000000001');
insert into v2.item_keys (item_id, key) values ('ls-i1', '{"correct":"b"}'), ('ls-i2', '{"correct":"a"}');
insert into v2.lessons (id, title, subject, grade, owner_id, status) values
  ('ls-l1', 'Đố vui Lịch sử', 'khac', 5, '000000e1-0000-0000-0000-000000000001', 'draft');
insert into v2.lesson_slides (id, lesson_id, position, layout, data) values
  ('ls-s1', 'ls-l1', 0, 'activity', '{"itemId":"ls-i1"}'),
  ('ls-s2', 'ls-l1', 1, 'activity', '{"itemId":"ls-i2"}');

select ok(has_function_privilege('anon', 'v2.find_live_screen(text)', 'execute'), 'khách gọi được find_live_screen');
select ok(has_function_privilege('anon', 'v2.live_screen(uuid, text, timestamptz, boolean)', 'execute'), 'khách gọi được live_screen');
select ok(not has_function_privilege('anon', 'v2.find_live(text)', 'execute'), 'khách vẫn không gọi được find_live của học sinh');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000e1-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table _ls on commit drop as select v2.start_live('ls-l1', 'ls-5a') as info;
grant select on _ls to anon, authenticated;

reset role;
update v2.live_sessions set state = jsonb_build_object('sessionId', id, 'pin', pin, 'lessonId', lesson_id, 'slideIndex', 0,
  'phase', 'activity-open', 'locked', false, 'teams', '[]'::jsonb, 'participants', '[]'::jsonb, 'studentStars', '{}'::jsonb,
  'updatedAt', now()) where lesson_id = 'ls-l1';
insert into v2.live_responses (session_id, user_id, item_id, slide_index, response, correct, score)
select (info ->> 'sessionId')::uuid, '000000e2-0000-0000-0000-000000000001', 'ls-i1', 0, '{"choice":"b"}', true, 1 from _ls;
create temp table _ev on commit drop as select count(*)::int as n from v2.learning_events where verb = 'joined';
grant select on _ev to anon;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(v2.find_live_screen((select info ->> 'pin' from _ls)) ->> 'sessionId', (select info ->> 'sessionId' from _ls),
  'TV (khách) tìm đúng phiên theo mã lớp');
select is(v2.find_live_screen('12'), null::jsonb, 'mã không đủ 6 số → không có');
select is(v2.live_screen((select (info ->> 'sessionId')::uuid from _ls), '000000', null, true), null::jsonb, 'sai mã lớp → không xem được');

create temp table _v1 on commit drop as
  select v2.live_screen((select (info ->> 'sessionId')::uuid from _ls), (select info ->> 'pin' from _ls), null, true) as v;
select is((select v -> 'lesson' ->> 'title' from _v1), 'Đố vui Lịch sử', 'TV nhận được bài giảng');
select is((select jsonb_array_length(v -> 'items') from _v1), 2, 'TV nhận được các câu hỏi của bài');
select ok((select bool_and(not (x ? 'key')) from _v1, jsonb_array_elements(v -> 'items') x), 'câu hỏi KHÔNG kèm đáp án');
select is((select v -> 'keys' from _v1), '{}'::jsonb, 'đang mở câu hỏi → chưa có đáp án');
select is((select v -> 'state' ->> 'phase' from _v1), 'activity-open', 'TV nhận được trạng thái phiên');
select ok((select jsonb_array_length(v -> 'responses') = 1 and not (v -> 'responses' -> 0 ? 'correct') from _v1),
  'câu trả lời chưa lộ đúng / sai khi chưa hiện đáp án');

reset role;
update v2.live_sessions set state = state || '{"phase":"reveal"}' where lesson_id = 'ls-l1';
set local role anon;
create temp table _v2 on commit drop as
  select v2.live_screen((select (info ->> 'sessionId')::uuid from _ls), (select info ->> 'pin' from _ls), now() + interval '1 hour', false) as v;
select is((select v -> 'keys' -> 'ls-i1' ->> 'correct' from _v2), 'b', 'hiện đáp án → có đáp án của câu đang chiếu');
select ok((select not (v -> 'keys' ? 'ls-i2') from _v2), 'không lộ đáp án câu khác');
select is((select v -> 'responses' -> 0 ->> 'correct' from _v2), 'true', 'hiện đáp án → gửi đúng / sai của câu đang chiếu');
select ok((select not (v ? 'lesson') and not (v ? 'items') from _v2), 'hỏi lại (không p_full) → không gửi lại bài giảng');

reset role;
select is((select count(*)::int from v2.learning_events where verb = 'joined'), (select n from _ev), 'TV không bị tính là học sinh vào lớp');
update v2.live_sessions set created_at = now() - interval '13 hours' where lesson_id = 'ls-l1';
set local role anon;
select is(v2.live_screen((select (info ->> 'sessionId')::uuid from _ls), (select info ->> 'pin' from _ls)), null::jsonb, 'phiên quá 12 giờ → đóng');

select * from finish();
rollback;
