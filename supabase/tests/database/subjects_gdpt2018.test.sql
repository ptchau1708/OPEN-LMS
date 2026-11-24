-- pgTAP: môn học theo CT GDPT 2018 (SQL 17).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000e1-0000-0000-0000-000000000001', 'mh-gv@test.local', '{"role":"teacher","name":"Cô Hoa"}');

select lives_ok($$ insert into v2.lessons (id, title, subject, grade, owner_id) values ('mh-ls', 'Bài LS&ĐL', 'lich-su-dia-li', 4, '000000e1-0000-0000-0000-000000000001') $$, 'bài giảng Lịch sử và Địa lí');
select lives_ok($$ insert into v2.lessons (id, title, subject, grade, owner_id) values ('mh-tin', 'Bài Tin học', 'tin-hoc', 3, '000000e1-0000-0000-0000-000000000001') $$, 'bài giảng Tin học');
select lives_ok($$ insert into v2.lessons (id, title, subject, grade, owner_id) values ('mh-cu', 'Bài TN&XH cũ', 'tnxh', 2, '000000e1-0000-0000-0000-000000000001') $$, 'dữ liệu TN&XH cũ vẫn hợp lệ');
select throws_ok($$ insert into v2.lessons (id, title, subject, grade, owner_id) values ('mh-x', 'Lạ', 'vat-li', 4, '000000e1-0000-0000-0000-000000000001') $$, '23514', null, 'môn lạ bị chặn');
select lives_ok($$ select v2._upsert_item('{"id":"mh-it1","type":"SHORT_ANSWER","grade":5,"subject":"cong-nghe","prompt":{"text":"Vật liệu làm chậu cây?"},"payload":{},"key":{"accepted":["nhựa"]}}'::jsonb,
  '000000e1-0000-0000-0000-000000000001', '000000e1-0000-0000-0000-000000000001', true) $$, 'lưu câu hỏi môn Công nghệ');
select throws_ok($$ select v2._upsert_item('{"id":"mh-it2","type":"SHORT_ANSWER","grade":5,"subject":"vat-li","prompt":{"text":"?"},"payload":{},"key":{"accepted":["x"]}}'::jsonb,
  '000000e1-0000-0000-0000-000000000001', '000000e1-0000-0000-0000-000000000001', true) $$, '22023', null, 'hàm lưu câu hỏi chặn môn lạ');
select ok(position('dao-duc' in pg_get_functiondef('v2.save_lesson(jsonb)'::regprocedure)) > 0, 'save_lesson nhận môn mới');

select * from finish();
rollback;
