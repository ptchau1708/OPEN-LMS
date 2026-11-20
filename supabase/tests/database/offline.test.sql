-- pgTAP: Phase 6 — học offline: khóa idempotency (client_event_id), thời điểm trả lời thật, plausibility (docs/PHASE6_OFFLINE.md).
-- Chạy: supabase test db  |  tools/run-db-tests.sh [--plain]
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000f6c00-0000-0000-0000-000000000001', 'f6an@openlms.edu', '{"role":"student","name":"An"}');
update v2.profiles set grade = 2 where id = '000f6c00-0000-0000-0000-000000000001';
insert into v2.items (id, type, grade, subject, stars, prompt, payload) values
  ('f6-it1', 'MCQ', 2, 'toan', 2, '{"text":"1 + 1 = ?"}', '{"options":[{"id":"a","text":"2"},{"id":"b","text":"3"}]}');

-- service role (Edge Function grade)
set local role service_role;
select is((v2.record_grade('000f6c00-0000-0000-0000-000000000001', 'f6-it1', '{"choice":"a"}', true, true, 1,
  null, null, null, null, null, 'cid-offline-0001', now() - interval '2 days') ->> 'starsAwarded')::int, 2, 'lần đầu: cộng sao');
select is((v2.record_grade('000f6c00-0000-0000-0000-000000000001', 'f6-it1', '{"choice":"a"}', true, true, 1,
  null, null, null, null, null, 'cid-offline-0001', now() - interval '2 days') ->> 'duplicate')::boolean, true, 'gửi lại cùng id: duplicate');
reset role;
select is((select count(*)::int from v2.learning_events where user_id = '000f6c00-0000-0000-0000-000000000001' and client_event_id = 'cid-offline-0001'), 1, 'chỉ một sự kiện');
select ok((select at < now() - interval '1 day' from v2.learning_events where client_event_id = 'cid-offline-0001'), 'giữ thời điểm trả lời thật');
select is((select result ->> 'offline' from v2.learning_events where client_event_id = 'cid-offline-0001'), 'true', 'đánh dấu offline cho GV');
set local role service_role;
select throws_ok($$ select v2.record_grade('000f6c00-0000-0000-0000-000000000001', 'f6-it1', '{"choice":"a"}', true, true, 1,
  null, null, null, null, null, 'cid-offline-0002', now() - interval '20 days') $$, '22007', null, 'quá 14 ngày: từ chối');
reset role;
select ok(v2._plausible_at(now() + interval '3 hours', true) <= now(), 'tương lai: kẹp về hiện tại');

-- HS ghi sự kiện (snake_case từ toEventRow) hai lần cùng clientEventId
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000f6c00-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select v2.record_event('{"verb":"started","object_type":"lesson","object_id":"f6-l1","clientEventId":"cid-ev-000001","clientAt":"2020-01-01T00:00:00Z","offline":true}') $$, 'record_event nhận snake_case + clientEventId');
select v2.record_event('{"verb":"started","objectType":"lesson","objectId":"f6-l1","clientEventId":"cid-ev-000001"}');
reset role;
select is((select count(*)::int from v2.learning_events where client_event_id = 'cid-ev-000001'), 1, 'sự kiện trùng id bị bỏ qua');

select * from finish();
rollback;
