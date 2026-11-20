-- pgTAP: Phase 6 — huy hiệu, cửa hàng trang phục, Vườn lớp (migration 20261113000009_v2_rewards.sql).
-- Chạy: supabase test db  |  tools/run-db-tests.sh [--plain]
--   T1 GV 6A1 0000006b-…-01 · T2 GV 6A2 0000006b-…-02 · S1,S2 HS 6A1 0000006c-…-01/02 · S3 HS 6A2 0000006c-…-03
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

insert into auth.users (id, email, raw_user_meta_data) values
  ('0000006b-0000-0000-0000-000000000001', 'p6-gv1@test.local', '{"role":"teacher","name":"Cô Lan"}'),
  ('0000006b-0000-0000-0000-000000000002', 'p6-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('0000006c-0000-0000-0000-000000000001', 'p6an@openlms.edu', '{"role":"student","name":"An"}'),
  ('0000006c-0000-0000-0000-000000000002', 'p6binh@openlms.edu', '{"role":"student","name":"Bình"}'),
  ('0000006c-0000-0000-0000-000000000003', 'p6chi@openlms.edu', '{"role":"student","name":"Chi"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('p6-2a', '2A', 2, '0000006b-0000-0000-0000-000000000001'),
  ('p6-2b', '2B', 2, '0000006b-0000-0000-0000-000000000002');
update v2.profiles set grade = 2, class_id = 'p6-2a' where id in ('0000006c-0000-0000-0000-000000000001', '0000006c-0000-0000-0000-000000000002');
update v2.profiles set grade = 2, class_id = 'p6-2b' where id = '0000006c-0000-0000-0000-000000000003';
insert into v2.class_teams (id, class_id, name, color) values ('p6-t1', 'p6-2a', 'Tổ Mặt Trời', '#ff8a3d');
insert into v2.class_members (class_id, user_id, role, team_id) values
  ('p6-2a', '0000006c-0000-0000-0000-000000000001', 'student', 'p6-t1'),
  ('p6-2a', '0000006c-0000-0000-0000-000000000002', 'student', null);

-- An: 3 ngày học liền (sao + xu tự động bằng sao), Bình: 5 sao hôm nay.
select is((v2._award('0000006c-0000-0000-0000-000000000001', 10, 0, 100, 'x', 'bonus', null, 'p6:a1', null) -> 'wallet' ->> 'coins')::int, 10, '_award: 1 sao = 1 xu khi nơi gọi không ghi xu');
update v2.reward_ledger set at = now() - interval '1 day' where dedupe_key = 'p6:a1';
select v2._award('0000006c-0000-0000-0000-000000000001', 10, 0, 100, 'x', 'bonus', null, 'p6:a2', null);
update v2.reward_ledger set at = now() - interval '2 day' where dedupe_key = 'p6:a2';
select v2._award('0000006c-0000-0000-0000-000000000001', 20, 0, 200, 'x', 'bonus', null, 'p6:a3', null);
select v2._award('0000006c-0000-0000-0000-000000000002', 5, 0, 50, 'x', 'bonus', null, 'p6:b1', null);
select is((v2._award('0000006c-0000-0000-0000-000000000002', 2, 7, 20, 'x', 'bonus', null, 'p6:b2', null) -> 'wallet' ->> 'coins')::int, 12, '_award giữ số xu khi nơi gọi có ghi');
select ok((select pg_get_constraintdef(oid) like '%shop%' and pg_get_constraintdef(oid) like '%work%' from pg_constraint where conname = 'reward_ledger_source_type_check'), 'source_type có thêm shop, giữ các giá trị cũ');
select is((select count(*)::int from v2.badges where rule_kind is not null), 24, '24 huy hiệu theo quy tắc');
select is((select count(*)::int from v2.shop_items), 20, '20 món trong cửa hàng');

-- Mong đợi cho vườn (tuần tính theo giờ VN — có thể cắt ngang 3 ngày học ở trên).
select set_config('p6.cls', (select coalesce(sum(stars), 0)::text from v2.reward_ledger where stars > 0 and at >= (v2._vn_week_start()::timestamp at time zone 'Asia/Ho_Chi_Minh') and user_id in ('0000006c-0000-0000-0000-000000000001', '0000006c-0000-0000-0000-000000000002')), true);
select set_config('p6.me', (select coalesce(sum(stars), 0)::text from v2.reward_ledger where stars > 0 and at >= (v2._vn_week_start()::timestamp at time zone 'Asia/Ho_Chi_Minh') and user_id = '0000006c-0000-0000-0000-000000000001'), true);

-- ===================== HS An =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0000006c-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.evaluate_badges()), 0, 'lần xét đầu: huy hiệu cũ coi như đã xem');
select ok(exists (select 1 from v2.user_badges where badge_id = 'streak-3' and user_id = auth.uid()), 'đạt "Ba ngày chăm chỉ" (3 ngày liền)');
select ok(not exists (select 1 from v2.user_badges where badge_id = 'streak-7'), 'chưa đạt 7 ngày');
select ok(((v2.get_badge_shelf() -> 'stats' ->> 'bestStreak')::int) = 3, 'kệ huy hiệu có số liệu chuỗi ngày');
select throws_ok($$ insert into v2.user_badges (user_id, badge_id) values (auth.uid(), 'streak-30') $$, '42501', null, 'HS không tự cấp huy hiệu');
select throws_ok($$ update v2.user_badges set badge_id = 'streak-30' $$, '42501', null, 'HS không sửa huy hiệu');
select throws_ok($$ select v2.grant_teacher_badge('p6-2a', array[auth.uid()], 'Tự tặng', 'star') $$, '42501', null, 'HS không tự tặng "Huy hiệu của cô"');
select throws_ok($$ insert into v2.reward_ledger (user_id, coins, reason, source_type) values (auth.uid(), 999, 'x', 'bonus') $$, '42501', null, 'HS không tự cộng xu');
select throws_ok($$ insert into v2.user_items (user_id, item_id, price) values (auth.uid(), 'bg-space', 0) $$, '42501', null, 'HS không tự thêm đồ');

select is((v2.buy_item('hat-crown') ->> 'coins')::int, 0, 'mua vương miện 40 xu: còn 0 xu');
select is((select coins from v2.wallets where user_id = auth.uid()), 0, 'ví: xu đã trừ (dòng sổ thưởng âm)');
select is((select stars from v2.wallets where user_id = auth.uid()), 40, 'sao không đổi khi mua');
select throws_ok($$ select v2.buy_item('hat-party') $$, 'P0001', null, 'không đủ xu thì không mua được');
select throws_ok($$ select v2.buy_item('hat-crown') $$, '23505', null, 'không mua trùng');
select throws_ok($$ select v2.equip_item('hat', 'hat-party') $$, '42501', null, 'không mặc đồ chưa có');
select throws_ok($$ select v2.equip_item('glasses', 'hat-crown') $$, '22023', null, 'mũ không đeo vào chỗ kính');
select is(v2.equip_item('hat', 'hat-crown') -> 'outfit' ->> 'hat', 'hat-crown', 'mặc vương miện');
select is(v2.equip_item('hat', null) -> 'outfit', '{}'::jsonb, 'tháo vương miện');

select is((v2.get_class_garden('p6-2a') ->> 'classStars')::int, current_setting('p6.cls')::int, 'vườn: tổng sao cả lớp tuần này');
select is(jsonb_array_length(v2.get_class_garden('p6-2a') -> 'students'), 0, 'HS không thấy sao từng bạn');
select is((v2.get_class_garden('p6-2a') -> 'me' ->> 'stars')::int, current_setting('p6.me')::int, 'HS thấy phần của mình');
select throws_ok($$ select v2.get_class_garden('p6-2b') $$, '42501', null, 'HS không xem vườn lớp khác');
select throws_ok($$ select v2.set_garden_goal('p6-2a', 100, 'sen') $$, '42501', null, 'HS không đặt mục tiêu');

-- ===================== GV =====================
select set_config('request.jwt.claims', '{"sub":"0000006b-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(v2.grant_teacher_badge('p6-2a', array['0000006c-0000-0000-0000-000000000001', '0000006c-0000-0000-0000-000000000003']::uuid[], 'Đọc to rõ ràng', 'sun')), 1, 'GV tặng huy hiệu: chỉ HS lớp mình');
select is((select (v2.set_garden_goal('p6-2a', 10, 'sen') -> 'collection' -> 0 ->> 'plant')), 'sen', 'GV đặt mục tiêu; lớp đạt → cây vào bộ sưu tập');

select * from finish();
rollback;
