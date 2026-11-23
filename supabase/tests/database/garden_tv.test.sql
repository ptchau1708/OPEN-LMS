-- pgTAP: Vườn lớp trên TV bằng khóa (migration 20261122000002_v2_garden_tv.sql).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000c2-0000-0000-0000-000000000001', 'gt-gv1@test.local', '{"role":"teacher","name":"Cô Thu"}'),
  ('000000c2-0000-0000-0000-000000000002', 'gt-gv2@test.local', '{"role":"teacher","name":"Thầy Nam"}'),
  ('000000c3-0000-0000-0000-000000000001', 'gtan@openlms.edu', '{"role":"student","name":"An"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('gt-5a', '5A', 5, '000000c2-0000-0000-0000-000000000001'),
  ('gt-5b', '5B', 5, '000000c2-0000-0000-0000-000000000002');
insert into v2.class_members (class_id, user_id, role) values ('gt-5a', '000000c3-0000-0000-0000-000000000001', 'student');

select ok(not has_table_privilege('anon', 'v2.garden_tv_keys', 'select'), 'khách không đọc được bảng khóa');
select ok(not has_function_privilege('anon', 'v2.garden_tv_key(text, boolean)', 'execute'), 'khách không tạo được khóa');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000c2-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table k (v text) on commit drop;
grant all on k to anon, authenticated;
insert into k select v2.garden_tv_key('gt-5a');
select ok((select length(v) from k) >= 40, 'GV lớp tạo được khóa TV');
select is(v2.garden_tv_key('gt-5a'), (select v from k), 'gọi lại → cùng khóa (link TV cũ vẫn dùng được)');
select throws_ok($$ select v2.garden_tv_key('gt-5b') $$, '42501', null, 'GV không tạo khóa cho lớp người khác');

select set_config('request.jwt.claims', '{"sub":"000000c3-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select v2.garden_tv_key('gt-5a') $$, '42501', null, 'học sinh không tạo khóa');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((v2.get_class_garden_tv('gt-5a', (select v from k)))->>'className', '5A', 'TV (khách) xem được vườn bằng đúng khóa');
select is((v2.get_class_garden_tv('gt-5a', (select v from k)))->'students', '[]'::jsonb, 'TV không thấy từng học sinh');
select throws_ok($$ select v2.get_class_garden_tv('gt-5b', (select v from k)) $$, '42501', null, 'khóa lớp này không mở lớp khác');
select throws_ok($$ select v2.get_class_garden_tv('gt-5a', 'sai') $$, '42501', null, 'khóa sai bị từ chối');
select throws_ok($$ select v2.get_class_garden('gt-5a') $$, '42501', null, 'khách vẫn không gọi được hàm vườn thường');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000c2-0000-0000-0000-000000000001","role":"authenticated"}', true);
select isnt(v2.garden_tv_key('gt-5a', true), (select v from k), 'Đổi link → khóa mới, link cũ hết hiệu lực');

select * from finish();
rollback;
