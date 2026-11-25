-- pgTAP: cài đặt cá nhân đồng bộ (v2.user_prefs) + kĩ năng theo chủ đề CT 2018 (SQL 18).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000e8-0000-0000-0000-000000000001', 'pf-gv@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('000000e8-0000-0000-0000-000000000002', 'pf-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}');

-- Kĩ năng các môn mới đã có trong danh mục
select ok((select count(*) from v2.skills where strand = 'CHU-DE') > 300, 'có kĩ năng theo chủ đề CT 2018');
select ok(exists (select 1 from v2.skills where subject = 'khoa-hoc' and grade = 4), 'có kĩ năng Khoa học lớp 4');
select ok(exists (select 1 from v2.skills where subject = 'tin-hoc' and grade = 3), 'có kĩ năng Tin học lớp 3');
select is((select count(distinct subject)::int from v2.skills where strand = 'CHU-DE'), 13, '13 môn ngoài Toán có kĩ năng (gồm Tiếng dân tộc thiểu số — SQL 20)');
select throws_ok($$ insert into v2.skills (code, subject, grade, strand, topic, text, short) values ('X1.A.B', 'toan', 1, 'LA', 't', 'mô tả', 'ngắn') $$, '23514', null, 'mạch lạ bị chặn');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000e8-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into v2.user_prefs (user_id, key, value) values (auth.uid(), 'ban-do-mon.c-4a', '{"subjects":["toan","khoa-hoc"]}') $$, 'GV lưu cài đặt của mình');
select lives_ok($$ insert into v2.user_prefs (user_id, key, value) values (auth.uid(), 'ban-do-mon.c-4a', '{"subjects":["toan"]}')
  on conflict (user_id, key) do update set value = excluded.value $$, 'ghi đè (upsert) được');
select is((select value->'subjects'->>0 from v2.user_prefs where key = 'ban-do-mon.c-4a'), 'toan', 'đọc lại đúng giá trị mới');
select throws_ok($$ insert into v2.user_prefs (user_id, key, value) values ('000000e8-0000-0000-0000-000000000002', 'x', '1') $$, '42501', null, 'không ghi hộ người khác');
select throws_ok($$ insert into v2.user_prefs (user_id, key, value) values (auth.uid(), 'Khoá Lạ', '1') $$, '23514', null, 'khoá sai định dạng bị chặn');

select set_config('request.jwt.claims', '{"sub":"000000e8-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from v2.user_prefs), 0, 'GV khác không thấy cài đặt của cô Thu');
update v2.user_prefs set value = '{"subjects":["am-nhac"]}' where key = 'ban-do-mon.c-4a';
delete from v2.user_prefs where key = 'ban-do-mon.c-4a';

reset role;
select is((select value->'subjects'->>0 from v2.user_prefs where key = 'ban-do-mon.c-4a'), 'toan', 'GV khác không sửa, không xoá được');
set local role anon;
select throws_ok($$ select * from v2.user_prefs $$, '42501', null, 'khách (anon) không đọc được');

select * from finish();
rollback;
