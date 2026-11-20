#!/usr/bin/env node
// Kiểm thử tích hợp ETL trên dữ liệu mẫu (cần psql + CSDL đã nạp migrations — xem tools/run-db-tests.sh --plain --migrate).
//   node tools/migrate-v1/test/fixture-test.mjs --db openedu_test
// Kiểm tra: chạy thử không ghi gì · chạy thật khớp đối soát · chạy lại không đổi số dòng (idempotent) ·
// dữ liệu mới bên app cũ được lấy thêm (đồng bộ hằng đêm) · không ghi đè bản GV đã sửa trên app mới.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const i = process.argv.indexOf('--db');
const db = i > 0 ? process.argv[i + 1] : process.env.TEST_DB ?? 'openedu_test';
const out = mkdtempSync(join(tmpdir(), 'migrate-v1-'));
const sql = (q) => execFileSync('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', q], { encoding: 'utf8' }).trim();
const run = (...a) => spawnSync('node', [join(HERE, '..', 'run.mjs'), '--db', db, '--out', out, ...a], { encoding: 'utf8' });
const COUNT = `select string_agg(t || '=' || n, ' ' order by t) from (
  select 'profiles' t, count(*) n from v2.profiles union all select 'classes', count(*) from v2.classes
  union all select 'members', count(*) from v2.class_members union all select 'items', count(*) from v2.items
  union all select 'keys', count(*) from v2.item_keys union all select 'lessons', count(*) from v2.lessons
  union all select 'ledger', count(*) from v2.reward_ledger union all select 'stars', coalesce(sum(stars), 0) from v2.reward_ledger
  union all select 'tasks', count(*) from v2.work_tasks union all select 'subs', count(*) from v2.submissions
  union all select 'ai', count(*) from v2.ai_grades union all select 'reviews', count(*) from v2.grade_reviews
  union all select 'tt27', count(*) from v2.tt27_evaluations) x`;
let n = 0;
const ok = (cond, msg, detail = '') => { assert.ok(cond, `${msg}\n${detail}`); console.log(`ok ${++n} - ${msg}`); };

execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', join(HERE, 'fixture.sql')], { stdio: ['ignore', 'ignore', 'inherit'] });
const before = sql(COUNT);

let r = run('--dry-run');
ok(r.status === 0, 'chạy thử thành công', r.stdout + r.stderr);
ok(sql(COUNT) === before, 'chạy thử không ghi gì vào v2');
ok(sql(`select to_regnamespace('v1etl') is null`) === 't', 'chạy thử không để lại schema v1etl');

r = run();
ok(r.status === 0, 'chạy thật: đối soát khớp', r.stdout + r.stderr);
const first = sql(COUNT);
ok(first !== before, `đã chuyển dữ liệu: ${first}`);

r = run();
ok(r.status === 0, 'chạy lần 2 thành công');
ok(sql(COUNT) === first, 'chạy lại không đổi số dòng (idempotent)');

// Đồng bộ: app cũ có thêm kết quả + nhận xét; GV đã sửa một phiếu TT27 trên app mới.
sql(`insert into public.exam_results values ('r5','e1','11111111-1111-1111-1111-000000000003', 6, 10, '{}', 1730000900000, null)`);
sql(`update v2.tt27_evaluations set data = data - '_v1' || '{"generalComment":"GV sửa"}', updated_by = '11111111-1111-1111-1111-000000000001'
     where student_id = '11111111-1111-1111-1111-000000000002'`);
sql(`update public.tt27_comments set comment = 'Đổi bên app cũ' where id = 't3'`);
r = run('--only', '06');
ok(r.status === 0, 'đồng bộ bước 06 thành công', r.stdout + r.stderr);
ok(sql(`select count(*) from v2.submissions`) === '3', 'kết quả mới bên app cũ được thêm');
ok(sql(`select data ->> 'generalComment' from v2.tt27_evaluations where student_id = '11111111-1111-1111-1111-000000000002'`) === 'GV sửa',
  'không ghi đè phiếu TT27 GV đã sửa trên app mới');
ok(sql(`select status from v2.submissions where text like '%6/10'`) === 'approved', 'kết quả cũ không có AI chấm → đã duyệt');
ok(sql(`select status from v2.submissions where text like '%4,5/10'`) === 'needs-review', 'AI chấm cũ chưa duyệt → chờ GV duyệt');

r = run('--cleanup', '--allow-diff');
ok(r.status === 0 && sql(`select to_regnamespace('v1etl') is null`) === 't', '--cleanup xóa schema tạm v1etl');
console.log(`1..${n}\n# báo cáo trong ${out}`);
