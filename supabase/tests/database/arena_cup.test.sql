-- pgTAP: Đấu trường — cài đặt lớp, giải đấu loại trực tiếp, bảng xếp hạng theo mùa (20261126000002_v2_arena_cup.sql).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(44);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000f1-0000-0000-0000-000000000001', 'ac-gv@test.local', '{"role":"teacher","name":"Cô Mai"}'),
  ('000000f1-0000-0000-0000-000000000002', 'ac-gv2@test.local', '{"role":"teacher","name":"Thầy Tâm"}'),
  ('000000f2-0000-0000-0000-000000000001', 'aca@openlms.edu', '{"role":"student","name":"An"}'),
  ('000000f2-0000-0000-0000-000000000002', 'acb@openlms.edu', '{"role":"student","name":"Bình"}'),
  ('000000f2-0000-0000-0000-000000000003', 'acc@openlms.edu', '{"role":"student","name":"Chi"}'),
  ('000000f2-0000-0000-0000-000000000004', 'acd@openlms.edu', '{"role":"student","name":"Dũng"}'),
  ('000000f2-0000-0000-0000-000000000005', 'ace@openlms.edu', '{"role":"student","name":"Em"}'),
  ('000000f2-0000-0000-0000-000000000006', 'acf@openlms.edu', '{"role":"student","name":"Phúc"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('ac-5a', '5A', 5, '000000f1-0000-0000-0000-000000000001'),
  ('ac-5b', '5B', 5, '000000f1-0000-0000-0000-000000000002');
update v2.profiles set grade = 5, class_id = 'ac-5a' where id::text like '000000f2-0000-0000-0000-00000000000_' and id <> '000000f2-0000-0000-0000-000000000006';
update v2.profiles set grade = 5, class_id = 'ac-5b' where id = '000000f2-0000-0000-0000-000000000006';
insert into v2.items (id, type, grade, subject, prompt, payload, owner_id)
select 'ac-i' || g, 'MCQ', 5, 'toan', jsonb_build_object('text', 'Câu ' || g), '{"options":[{"id":"a","text":"1"},{"id":"b","text":"2"}]}',
       '000000f1-0000-0000-0000-000000000001'
from generate_series(1, 8) g;
insert into v2.item_keys (item_id, key) select 'ac-i' || g, '{"correct":"a"}' from generate_series(1, 8) g;

-- ---------------------------------------------------------------------------
-- Giờ mở cửa
-- ---------------------------------------------------------------------------
select ok(v2._arena_open('[{"days":[1],"from":"19:00","to":"21:00"}]', '2026-11-30 20:00+07'), 'thứ Hai 20:00 trong khung 19:00–21:00 → mở');
select ok(not v2._arena_open('[{"days":[1],"from":"19:00","to":"21:00"}]', '2026-11-30 21:00+07'), '21:00 → đã đóng');
select ok(not v2._arena_open('[{"days":[1],"from":"19:00","to":"21:00"}]', '2026-12-01 20:00+07'), 'thứ Ba → đóng');
select ok(v2._arena_open('[]', now()), 'không đặt giờ → luôn mở');

-- ---------------------------------------------------------------------------
-- Cài đặt lớp
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.arena_access() ->> 'open')::boolean, true, 'mặc định Đấu trường mở');
select throws_ok($$ select v2.arena_save_settings('ac-5a', '{"enabled":false}') $$, '42501', null, 'học sinh không đổi được cài đặt');

select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.arena_save_settings('ac-5a', '{"enabled":false}') ->> 'enabled', 'false', 'GV tắt Đấu trường');
select throws_ok($$ select v2.arena_save_settings('ac-5a', '{"hours":[{"days":[1],"from":"21:00","to":"19:00"}]}') $$, '22023', null, 'khung giờ ngược bị từ chối');
select throws_ok($$ select v2.arena_save_settings('ac-5b', '{"enabled":false}') $$, '42501', null, 'GV không đổi cài đặt lớp người khác');

select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.arena_access() ->> 'reason', 'off', 'HS thấy Đấu trường đang tắt');
select throws_ok($$ select v2.duel_create_bot('toan') $$, '42501', null, 'Đấu trường tắt → không tạo được trận');

select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.arena_pool_add('ac-5a', array['ac-i1', 'ac-i2', 'ac-i3', 'khong-co']), 3, 'Đưa 3 câu vào Đấu trường (bỏ mã không có)');
select is(v2.arena_save_settings('ac-5a', '{"enabled":true,"source":"picked","scope":"grade"}') ->> 'source', 'picked', 'chỉ dùng câu GV đưa vào');

select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.arena_access() -> 'settings' -> 'itemIds'), 3, 'HS nhận bộ câu của lớp');
create temp table _bot on commit drop as select v2.duel_create_bot('toan') as d;
select ok((select bool_and(x in ('ac-i1', 'ac-i2', 'ac-i3')) from _bot, jsonb_array_elements_text(d -> 'itemIds') x), 'trận chỉ dùng câu GV đưa vào');

-- ---------------------------------------------------------------------------
-- Giải đấu loại trực tiếp (5 bạn lớp 5A → nhánh 8, 3 vòng)
-- ---------------------------------------------------------------------------
select throws_ok($$ select v2.cup_create('{"title":"Giải thử","classId":"ac-5a"}') $$, '42501', null, 'học sinh không mở được giải');

select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select v2.cup_create('{"title":"Thiếu câu","classId":"ac-5a","questions":10}') $$, '22023', null, 'không đủ câu hỏi → báo GV');
create temp table _cup on commit drop as
  select v2.cup_create('{"title":"Giải Toán tuần 12","classId":"ac-5a","subject":"toan","questions":3,"roundMinutes":30}') as c;
grant select on _cup, _bot to authenticated, anon;
select is((select c ->> 'status' from _cup), 'running', 'giải bắt đầu ngay (cả lớp tham gia)');
select is((select jsonb_array_length(c -> 'players') from _cup), 5, '5 học sinh lớp 5A, không có bạn lớp khác');
select is((select (c ->> 'rounds')::int from _cup), 3, '5 bạn → 3 vòng');
select is((select count(*)::int from _cup, jsonb_array_elements(c -> 'matches') m where m ->> 'decidedBy' = 'bye'), 3, 'vòng 1: 3 bạn hạt giống cao được miễn đấu');

reset role;
create temp table _m on commit drop as
  select m.p1, m.p2, (select (c ->> 'id')::uuid from _cup) as cup from v2.cup_matches m
  where m.cup_id = (select (c ->> 'id')::uuid from _cup) and m.round = 1 and m.status = 'open';
grant select on _m to authenticated;
set local role authenticated;
select is((select count(*)::int from _m), 1, 'vòng 1 có 1 trận thật (hạt giống 4 gặp 5)');

select set_config('request.jwt.claims', json_build_object('sub', (select p1 from _m), 'role', 'authenticated')::text, true);
create temp table _play on commit drop as select v2.cup_play((select cup from _m)) as p;
grant select on _play to authenticated;
select is((select jsonb_array_length(p -> 'items') from _play), 3, 'vào trận: 3 câu, cùng bộ cho hai bạn');
select ok((select bool_and(not (x ? 'key')) from _play, jsonb_array_elements(p -> 'items') x), 'câu hỏi không kèm đáp án');
select throws_ok(format('select v2.duel_finish(%L)', (select p -> 'duel' ->> 'id' from _play)), '22023', null, 'trận trong giải không kết thúc bằng duel_finish');

-- Edge Function grade ghi câu trả lời (giả lập bằng duel_record_answer)
reset role;
select v2.duel_record_answer((select p1 from _m), (select (p -> 'duel' ->> 'id')::uuid from _play), q, (select p -> 'duel' -> 'itemIds' ->> q from _play),
                             true, 1, 5000, null, '{}', '{}') from generate_series(0, 2) q;
select v2.duel_record_answer((select p2 from _m), (select (p -> 'duel' ->> 'id')::uuid from _play), q, (select p -> 'duel' -> 'itemIds' ->> q from _play),
                             q = 0, 1, 4000, null, '{}', '{}') from generate_series(0, 2) q;
set local role authenticated;
create temp table _after on commit drop as select v2.cup_done((select cup from _m)) as c;
grant select on _after to authenticated;
select is((select (c ->> 'round')::int from _after), 2, 'cả hai đấu xong → sang vòng 2');
select is((select m ->> 'winner' from _after, jsonb_array_elements(c -> 'matches') m where (m ->> 'round')::int = 1 and m ->> 'decidedBy' = 'play'),
          (select p1::text from _m), 'đúng nhiều hơn thì thắng');
reset role;
select is((select stars from v2.reward_ledger where user_id = (select p1 from _m) and dedupe_key like 'cup:%r1%'), 2, 'thắng trận: 2 sao');
select is((select stars from v2.reward_ledger where user_id = (select p2 from _m) and dedupe_key like 'cup:%r1%'), 1, 'thua nhưng đã đấu: 1 sao');

-- GV đóng vòng: chưa ai đấu → hạt giống cao hơn đi tiếp; đến chung kết → kết thúc giải
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format('select v2.cup_close_round(%L)', (select cup from _m)), '42501', null, 'học sinh không đóng vòng được');
select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((v2.cup_close_round((select cup from _m)) ->> 'round')::int, 3, 'đóng vòng 2 → mở chung kết');
create temp table _fin on commit drop as select v2.cup_close_round((select cup from _m)) as c;
grant select on _fin to authenticated;
select is((select c ->> 'status' from _fin), 'finished', 'đóng chung kết → giải kết thúc');
reset role;
select is((select c ->> 'champion' from _fin), (select user_id::text from v2.cup_players where cup_id = (select cup from _m) and seed = 1),
          'không ai đấu → hạt giống 1 vô địch');
select is((select jsonb_array_length(c -> 'thirds') from _fin), 2, 'hai bạn thua bán kết đồng hạng ba');
select is((select stars from v2.reward_ledger where user_id = (select (c ->> 'champion')::uuid from _fin) and dedupe_key like 'cup:%:place:%'), 10, 'vô địch: 10 sao');
select is((select count(*)::int from v2.user_badges where glyph = 'cup' and title like 'Vô địch · Giải Toán%'), 1, 'vô địch nhận cúp');

-- Đăng kí (phạm vi khối): bạn lớp 5B đăng kí được giải của khối, không đăng kí được giải của lớp 5A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table _sg on commit drop as
  select v2.cup_create(jsonb_build_object('title', 'Giải khối 5', 'classId', 'ac-5a', 'scope', 'grade', 'entry', 'signup', 'questions', 3,
                                          'startAt', now() + interval '1 day')) as c,
         v2.cup_create(jsonb_build_object('title', 'Giải lớp', 'classId', 'ac-5a', 'entry', 'signup', 'questions', 3,
                                          'startAt', now() + interval '1 day')) as k;
grant select on _sg to authenticated;
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((v2.cup_join((select (c ->> 'id')::uuid from _sg)) -> 'me' ->> 'joined'), 'true', 'bạn lớp 5B đăng kí giải khối');
select throws_ok(format('select v2.cup_join(%L)', (select k ->> 'id' from _sg)), '42501', null, 'không đăng kí được giải của lớp khác');
select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(v2.cup_start((select (c ->> 'id')::uuid from _sg)) ->> 'status', 'cancelled', 'bắt đầu khi mới 1 bạn đăng kí → huỷ, báo cần ít nhất 2 bạn');

-- ---------------------------------------------------------------------------
-- Bảng xếp hạng
-- ---------------------------------------------------------------------------
select is((select jsonb_array_length(v2.arena_board('ac-5a') -> 'rows')), 5, 'GV thấy cả lớp');
select set_config('request.jwt.claims', '{"sub":"000000f2-0000-0000-0000-000000000005","role":"authenticated"}', true);
create temp table _b on commit drop as select v2.arena_board() as b;
select ok((select bool_and((x ->> 'points')::int > 0) from _b, jsonb_array_elements(b -> 'rows') x), 'HS chỉ thấy các bạn có điểm (top 10)');
select ok((select b ? 'me' from _b), 'HS thấy vị trí của mình');
select set_config('request.jwt.claims', '{"sub":"000000f1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(jsonb_array_length(v2.arena_end_season('ac-5a', 'Mùa thu') -> 'top') >= 1, 'kết thúc mùa: lưu top');
select is((select max((x ->> 'points')::int) from jsonb_array_elements(v2.arena_board('ac-5a') -> 'rows') x), 0, 'mùa mới bắt đầu từ 0');

select * from finish();
rollback;
