#!/usr/bin/env node
// Chạy toàn bộ ETL OpenLMS (public) → OPEN-EDU (v2) theo đúng thứ tự, ghi nhật ký từng bước và báo cáo đối soát.
//
//   node tools/migrate-v1/run.mjs --db "$DATABASE_URL" --dry-run     # chạy thử: mọi thứ trong 1 giao dịch rồi ROLLBACK
//   node tools/migrate-v1/run.mjs --db "$DATABASE_URL"               # chạy thật (mỗi bước 1 giao dịch, chạy lại được)
//   node tools/migrate-v1/run.mjs --db ... --only 05,06              # chỉ vài bước (luôn kèm 00 và 91)
//   node tools/migrate-v1/run.mjs --db ... --cleanup                 # chạy thật rồi xóa schema tạm v1etl
//
// --db nhận chuỗi kết nối Postgres (Supabase → Project Settings → Database → Connection string, dạng "Session pooler")
// hoặc tên CSDL; bỏ trống thì dùng DATABASE_URL / biến PG* của psql. Cần `psql` (PostgreSQL client ≥ 15).
// Đầu ra: <out>/reconcile-<thời điểm>.md|.csv và <out>/migrate-<thời điểm>.jsonl (mặc định tools/migrate-v1/reports/, đã gitignore).
// Mã thoát: 0 = khớp; 1 = lỗi SQL; 3 = có hạng mục lệch (trừ khi --allow-diff).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDriver, diffRows, parseArgs, parseCsv, parseOutput, selectSteps, stamp, summarizeTags, toCsv, toMarkdown } from './lib.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
let opt;
try { opt = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
if (opt.help) { console.log(readHelp()); process.exit(0); }

const db = opt.db ?? process.env.DATABASE_URL ?? null;
const steps = selectSteps(opt.only);
const runId = stamp();
const outDir = opt.out ? resolve(opt.out) : join(DIR, 'reports');
mkdirSync(outDir, { recursive: true });
const logFile = join(outDir, `migrate-${runId}${opt.dryRun ? '-dry' : ''}.jsonl`);
const log = (o) => appendFileSync(logFile, JSON.stringify({ run: runId, dryRun: opt.dryRun, at: new Date().toISOString(), ...o }) + '\n');

console.log(`${opt.dryRun ? 'CHẠY THỬ (không ghi)' : 'CHẠY THẬT'} · ${steps.length} bước · nhật ký ${logFile}`);
log({ event: 'start', steps });

const args = ['-X', '-v', 'ON_ERROR_STOP=1', '--no-psqlrc'];
if (db) args.push('-d', db);
const child = spawn('psql', args, { stdio: ['pipe', 'pipe', 'pipe'] });
let out = ''; let err = ''; let buf = ''; let stepStart = Date.now(); let current = null;

child.stdout.on('data', (d) => {
  const s = d.toString(); out += s; buf += s;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (line.startsWith('@@STEP ')) { current = line.slice(7); stepStart = Date.now(); if (process.stdout.isTTY) process.stdout.write(`… ${current}`); }
    else if (line.startsWith('@@DONE ')) {
      const st = parseOutput(out).steps.find((x) => x.file === current);
      const sum = summarizeTags(st?.tags ?? []); const ms = Date.now() - stepStart;
      process.stdout.write(`${process.stdout.isTTY ? '\r' : ''}✓ ${current.padEnd(18)} ${String(ms).padStart(6)} ms · ghi ${sum.insert} · sửa ${sum.update} · xóa ${sum.delete} · ${sum.statements} lệnh\n`);
      log({ event: 'step', file: current, ms, ...sum, tags: st?.tags ?? [] });
      current = null;
    }
  }
});
child.stderr.on('data', (d) => { err += d.toString(); });
child.on('error', (e) => { console.error(`Không chạy được psql: ${e.message}`); process.exit(1); });
child.stdin.end(buildDriver(steps, { dir: DIR, dryRun: opt.dryRun, cleanup: opt.cleanup }));

child.on('close', (code) => {
  const errors = err.split('\n').filter((l) => /ERROR|FATAL|lỗi/i.test(l));
  if (code !== 0) {
    if (current) process.stdout.write(`\r✗ ${current}\n`);
    console.error(errors.join('\n') || err);
    log({ event: 'error', file: current, code, stderr: err.slice(-4000) });
    console.error(opt.dryRun ? 'Chạy thử thất bại — không có gì được ghi.' : `Bước ${current ?? '?'} lỗi và đã tự hoàn tác; các bước trước đã ghi. Sửa rồi chạy lại (an toàn).`);
    process.exit(1);
  }
  const rows = parseCsv(parseOutput(out).csv ?? '');
  const meta = [`Thời điểm: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    `Chế độ: ${opt.dryRun ? 'chạy thử (đã ROLLBACK)' : 'chạy thật'}`, `Bước: ${steps.join(', ')}`];
  const base = join(outDir, `reconcile-${runId}${opt.dryRun ? '-dry' : ''}`);
  writeFileSync(`${base}.md`, toMarkdown(rows, { meta }));
  writeFileSync(`${base}.csv`, toCsv(rows));
  const bad = diffRows(rows);
  log({ event: 'reconcile', rows, diff: bad.length });
  console.log('\n' + toMarkdown(rows).split('\n').slice(2).join('\n'));
  console.log(`Báo cáo: ${base}.md, ${base}.csv`);
  process.exit(bad.length && !opt.allowDiff ? 3 : 0);
});

function readHelp() {
  return `node tools/migrate-v1/run.mjs [--db <conn>] [--dry-run] [--only 05,06] [--out reports] [--cleanup] [--allow-diff]`;
}
