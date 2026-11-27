-- pgTAP: SQL 25 (20261128000002_v2_linh_vat_moi.sql) — 14 linh vật, 4 bạn mới mở khóa sau Công Múa.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(3);
select is((select count(*)::int from v2.mascots), 14, 'có 14 linh vật');
select is((select array_agg(id order by position) from v2.mascots where position >= 9), array['cong', 'sutu', 'gautuyet', 'canhcut', 'lacda'], 'thứ tự mở khóa: sau Công Múa là 4 bạn mới');
select ok((select bool_and(a.unlock_stars < b.unlock_stars) from v2.mascots a join v2.mascots b on b.position = a.position + 1), 'mốc sao tăng dần');
select * from finish();
rollback;
