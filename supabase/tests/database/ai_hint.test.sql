begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;
select plan(6);
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000a1701', 'hint-hs@test.local');
insert into v2.profiles (id, role, name, grade) values ('00000000-0000-4000-8000-0000000a1701', 'student', 'HS gợi ý', 4)
  on conflict (id) do nothing;
set local role service_role;
select is(v2.ai_quota_take('00000000-0000-4000-8000-0000000a1701', 'hint', 2), 1, 'nhóm hạn mức hint: lượt 1');
select is(v2.ai_quota_take('00000000-0000-4000-8000-0000000a1701', 'hint', 2), 2, 'nhóm hạn mức hint: lượt 2');
select is(v2.ai_quota_take('00000000-0000-4000-8000-0000000a1701', 'hint', 2), null, 'hết lượt hint trong ngày → null');
select is(v2.ai_quota_take('00000000-0000-4000-8000-0000000a1701', 'encourage', 5), 1, 'nhóm encourage tính riêng, không bị hint ảnh hưởng');
select throws_ok($$ select v2.ai_quota_take('00000000-0000-4000-8000-0000000a1701', 'la', 5) $$, '23514', null, 'nhóm lạ vẫn bị ràng buộc chặn');
reset role;
select ok(not has_function_privilege('authenticated', 'v2.ai_quota_take(uuid, text, int)', 'execute'), 'HS không tự gọi được ai_quota_take');
select * from finish();
rollback;
