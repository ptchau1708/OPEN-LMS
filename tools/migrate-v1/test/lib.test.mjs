// node --test tools/migrate-v1/test/   (không cần CSDL)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEPS, buildDriver, diffRows, parseArgs, parseCsv, parseOutput, selectSteps, stamp, summarizeTags, tagRows, toCsv, toMarkdown,
} from '../lib.mjs';

test('parseArgs', () => {
  assert.deepEqual(parseArgs(['--db', 'postgres://x', '-n', '--only', '05, 06']),
    { dryRun: true, db: 'postgres://x', only: ['05', '06'], out: null, cleanup: false, allowDiff: false, help: false });
  assert.throws(() => parseArgs(['--dry-run', '--cleanup']), /không dùng cùng/);
  assert.throws(() => parseArgs(['--xyz']), /Tham số lạ/);
});

test('selectSteps luôn kèm 00 và 91, giữ thứ tự', () => {
  assert.deepEqual(selectSteps(null), STEPS);
  assert.deepEqual(selectSteps(['06', '03']), ['00_prepare.sql', '03_items.sql', '06_history.sql', '91_reconcile.sql']);
});

test('buildDriver: dry-run bọc một giao dịch và ROLLBACK', () => {
  const d = buildDriver(['00_prepare.sql', '91_reconcile.sql'], { dir: "/a/b'c", dryRun: true });
  assert.match(d, /^\\set ON_ERROR_STOP on/);
  assert.equal(d.match(/^begin;$/gm).length, 1);
  assert.equal(d.match(/^commit;$/gm), null);
  assert.ok(d.trimEnd().endsWith('rollback;'));
  assert.ok(d.includes("\\i '/a/b''c/00_prepare.sql'"), 'đường dẫn được trích dẫn an toàn');
});

test('buildDriver: chạy thật mỗi bước một giao dịch, cleanup sau đối soát', () => {
  const d = buildDriver(['00_prepare.sql', '01_people.sql'], { dir: '/x', dryRun: false, cleanup: true });
  assert.equal(d.match(/^begin;$/gm).length, 2);
  assert.equal(d.match(/^commit;$/gm).length, 2);
  assert.ok(d.indexOf('@@ENDCSV') < d.indexOf('99_cleanup.sql'));
  assert.ok(!/rollback/.test(d));
});

test('tagRows / summarizeTags', () => {
  assert.equal(tagRows('INSERT 0 12'), 12);
  assert.equal(tagRows('UPDATE 3'), 3);
  assert.equal(tagRows('CREATE VIEW'), null);
  assert.deepEqual(summarizeTags(['INSERT 0 2', 'INSERT 0 5', 'UPDATE 1', 'DELETE 4', 'CREATE FUNCTION']),
    { insert: 7, update: 1, delete: 4, statements: 5 });
});

test('parseOutput tách bước, tag và CSV', () => {
  const out = [
    '@@STEP 01_people.sql', 'BEGIN', 'INSERT 0 6', ' cột ', '-----', ' 1', '(1 row)', 'COMMIT', '@@DONE 01_people.sql',
    '@@CSV', 'hạng_mục,cũ,bỏ_qua,mới,lệch,trạng_thái,ghi_chú', '"Lớp, khối",2,0,2,0,OK,', '@@ENDCSV',
  ].join('\n');
  const p = parseOutput(out);
  assert.equal(p.steps.length, 1);
  assert.deepEqual(p.steps[0], { file: '01_people.sql', tags: ['BEGIN', 'INSERT 0 6', 'COMMIT'], done: true });
  const rows = parseCsv(p.csv);
  assert.equal(rows[0]['hạng_mục'], 'Lớp, khối');
  assert.equal(rows[0]['mới'], '2');
});

test('parseCsv: ngoặc kép, xuống dòng trong ô, CRLF', () => {
  const rows = parseCsv('a,b\r\n"x ""y""","dòng 1\ndòng 2"\r\n');
  assert.deepEqual(rows, [{ a: 'x "y"', b: 'dòng 1\ndòng 2' }]);
  assert.deepEqual(parseCsv(''), []);
});

test('toCsv ↔ parseCsv khứ hồi', () => {
  const rows = [{ 'hạng_mục': 'A, "b"', 'cũ': '1', 'bỏ_qua': '0', 'mới': '1', 'lệch': '0', 'trạng_thái': 'OK', 'ghi_chú': 'x\ny' }];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test('toMarkdown đánh dấu hạng mục lệch', () => {
  const rows = [
    { 'hạng_mục': 'Lớp', 'cũ': '2', 'bỏ_qua': '0', 'mới': '2', 'lệch': '0', 'trạng_thái': 'OK', 'ghi_chú': 'a|b' },
    { 'hạng_mục': 'TT27', 'cũ': '4', 'bỏ_qua': '0', 'mới': '3', 'lệch': '1', 'trạng_thái': 'LỆCH', 'ghi_chú': '' },
  ];
  const md = toMarkdown(rows, { meta: ['Chế độ: thử'] });
  assert.match(md, /^# Đối soát/);
  assert.match(md, /- Chế độ: thử/);
  assert.match(md, /\| Lớp \| 2 \| 0 \| 2 \| 0 \| OK \| a\/b \|/);
  assert.match(md, /\*\*LỆCH\*\*/);
  assert.match(md, /\*\*1 hạng mục lệch\*\*/);
  assert.equal(diffRows(rows).length, 1);
  assert.match(toMarkdown(rows.slice(0, 1)), /Tất cả hạng mục khớp/);
});

test('stamp', () => {
  assert.equal(stamp(new Date('2026-11-13T02:03:04Z')), '20261113-020304');
});
