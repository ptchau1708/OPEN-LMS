-- pgTAP: Trang học dạng cây (migration 20261123000002_v2_page_tree.sql).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('000000e2-0000-0000-0000-000000000001', 'pt-gv@test.local', '{"role":"teacher","name":"Cô Thu"}');
insert into v2.classes (id, name, grade, teacher_id) values
  ('pt-5a', '5A', 5, '000000e2-0000-0000-0000-000000000001'), ('pt-5b', '5B', 5, '000000e2-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"000000e2-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into v2.class_pages (id, class_id, title, kind, body, created_by) values ('00000000-0000-0000-0000-0000000000a1', 'pt-5a', 'Tiếng Việt', 'section', 'Các bài đọc của lớp', auth.uid()) $$, 'tạo trang nội dung (không cần địa chỉ)');
select lives_ok($$ insert into v2.class_pages (id, class_id, title, kind, parent_id, created_by) values ('00000000-0000-0000-0000-0000000000a2', 'pt-5a', 'Tuần 12', 'section', '00000000-0000-0000-0000-0000000000a1', auth.uid()) $$, 'trang con');
select lives_ok($$ insert into v2.class_pages (id, class_id, title, kind, url, parent_id, created_by) values ('00000000-0000-0000-0000-0000000000a3', 'pt-5a', 'Bài đọc: Cây bàng', 'link', 'https://youtube.com/x', '00000000-0000-0000-0000-0000000000a2', auth.uid()) $$, 'trang web nhúng trong trang con');
select throws_ok($$ insert into v2.class_pages (class_id, title, kind, created_by) values ('pt-5a', 'Thiếu địa chỉ', 'link', auth.uid()) $$, '23514', null, 'trang web vẫn phải có địa chỉ');
select throws_ok($$ insert into v2.class_pages (class_id, title, kind, parent_id, created_by) values ('pt-5b', 'Lớp khác', 'section', '00000000-0000-0000-0000-0000000000a1', auth.uid()) $$, '23514', 'Trang cha phải thuộc cùng lớp.', 'trang cha phải cùng lớp');
select throws_ok($$ update v2.class_pages set parent_id = '00000000-0000-0000-0000-0000000000a3' where id = '00000000-0000-0000-0000-0000000000a1' $$, '23514', 'Không chuyển trang vào trong trang con của nó được.', 'không tạo vòng lặp');
select lives_ok($$ insert into v2.class_pages (id, class_id, title, kind, parent_id, created_by) values ('00000000-0000-0000-0000-0000000000a4', 'pt-5a', 'Tầng 4', 'section', '00000000-0000-0000-0000-0000000000a3', auth.uid()) $$, 'tầng 4 được');
select throws_ok($$ insert into v2.class_pages (class_id, title, kind, parent_id, created_by) values ('pt-5a', 'Tầng 5', 'section', '00000000-0000-0000-0000-0000000000a4', auth.uid()) $$, '23514', 'Trang con sâu tối đa 4 tầng.', 'sâu tối đa 4 tầng');
select lives_ok($$ delete from v2.class_pages where id = '00000000-0000-0000-0000-0000000000a2' $$, 'xóa trang cha');
select is((select parent_id from v2.class_pages where id = '00000000-0000-0000-0000-0000000000a3'), null, 'trang con không mất, lên thành trang gốc');

select * from finish();
rollback;
