begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;
select plan(6);
select is((select count(*)::int from pg_proc p where p.pronamespace = 'v2'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  0, 'không hàm v2 nào gọi được khi chưa đăng nhập');
select ok((select count(*) from pg_proc p where p.pronamespace = 'v2'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')) >= 100,
  'người đã đăng nhập vẫn giữ quyền gọi hàm');
select is((select count(*)::int from pg_class c where c.relnamespace = 'v2'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  0, 'mọi bảng v2 đều bật RLS');
select ok(has_function_privilege('anon', 'public.openedu_ping()', 'execute'), 'anon gọi được openedu_ping (giữ dự án hoạt động)');
select ok(not has_function_privilege('authenticated', 'v2.run_maintenance()', 'execute'), 'người dùng thường không chạy được bảo trì');
set local role service_role;
select ok((v2.run_maintenance() ? 'clientErrorsDeleted'), 'run_maintenance chạy được bằng service_role');
reset role;
select * from finish();
rollback;
