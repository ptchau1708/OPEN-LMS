begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;
select plan(5);

-- Mô phỏng GoTrue Admin API: chèn người dùng chỉ có provider, rồi MỚI cập nhật app_metadata.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000a0001', 'gv.moi@openlms.edu', '{"provider":"email"}', '{"name":"Cô Mới"}');
select is((select role from v2.profiles where id = '00000000-0000-0000-0000-0000000a0001'), 'student', 'lúc vừa chèn chưa có role → student (hành vi cũ)');
update auth.users set raw_app_meta_data = '{"provider":"email","role":"teacher","username":"comoi"}' where id = '00000000-0000-0000-0000-0000000a0001';
select is((select role from v2.profiles where id = '00000000-0000-0000-0000-0000000a0001'), 'teacher', 'cập nhật app_metadata → hồ sơ thành teacher');
select is((select username from v2.profiles where id = '00000000-0000-0000-0000-0000000a0001'), 'comoi', 'tên đăng nhập được nạp');

-- user_metadata KHÔNG được nâng quyền
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000a0002', 'xau@openlms.edu', '{"provider":"email"}', '{"name":"X"}');
update auth.users set raw_user_meta_data = '{"name":"X","role":"admin"}' where id = '00000000-0000-0000-0000-0000000a0002';
select is((select role from v2.profiles where id = '00000000-0000-0000-0000-0000000a0002'), 'student', 'user_metadata.role không nâng quyền');

-- Vai trò lạ trong app_metadata bị bỏ qua
update auth.users set raw_app_meta_data = '{"provider":"email","role":"superuser"}' where id = '00000000-0000-0000-0000-0000000a0002';
select is((select role from v2.profiles where id = '00000000-0000-0000-0000-0000000a0002'), 'student', 'role lạ bị bỏ qua');

select * from finish();
rollback;
