#!/usr/bin/env node
// Kiểm tra ngân sách dung lượng: chunk JS chính (entry trong dist/index.html) của app học sinh ≤ 170 KB gzip.
//   node tools/check-budget.mjs                         # apps/learner/dist, 170 KB
//   node tools/check-budget.mjs --dist apps/teacher/dist --budget 300 [--json]
// In thêm (không chặn): tổng JS/CSS tải ban đầu (entry + modulepreload + stylesheet) và 5 chunk lớn nhất.
// Mã thoát 1 khi vượt ngân sách, 2 khi thiếu dist (chưa build).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, relative } from 'node:path';

const args = process.argv.slice(2);
const val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dist = resolve(val('--dist', 'apps/learner/dist'));
const budgetKb = Number(val('--budget', '170'));
const asJson = args.includes('--json');

const html = join(dist, 'index.html');
if (!existsSync(html)) { console.error(`Không thấy ${html} — chạy build trước.`); process.exit(2); }
const page = readFileSync(html, 'utf8');

const strip = (u) => u.replace(/^\//, '').split('?')[0];
const entry = [...page.matchAll(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/g)].map((m) => strip(m[1]))
  .filter((u) => !/registerSW|workbox/.test(u));
if (!entry.length) { console.error('Không tìm thấy <script type="module" src> trong index.html'); process.exit(2); }
const preload = [...page.matchAll(/<link[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/g)].map((m) => strip(m[1]));
const css = [...page.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)].map((m) => strip(m[1]))
  .filter((u) => !/^https?:/.test(u));

const gz = (f) => { const b = readFileSync(join(dist, f)); return { file: f, raw: b.length, gzip: gzipSync(b, { level: 9 }).length }; };
const kb = (n) => (n / 1024).toFixed(1);
const main = entry.map(gz);
const initial = [...new Set([...entry, ...preload])].map(gz);
const styles = css.map(gz);
const allJs = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))
  .map((f) => ({ file: `assets/${f}`, raw: statSync(join(dist, 'assets', f)).size })).sort((a, b) => b.raw - a.raw);
const top = allJs.slice(0, 5).flatMap((x) => { try { return [gz(x.file)]; } catch { return []; } }); // dist có thể đang được build lại

const mainGzip = main.reduce((s, x) => s + x.gzip, 0);
const ok = mainGzip <= budgetKb * 1024;
const report = {
  dist: relative(process.cwd(), dist) || '.', budgetKb, ok,
  main: { files: main, gzipKb: Number(kb(mainGzip)) },
  initialJs: { files: initial.length, gzipKb: Number(kb(initial.reduce((s, x) => s + x.gzip, 0))) },
  initialCss: { files: styles.length, gzipKb: Number(kb(styles.reduce((s, x) => s + x.gzip, 0))) },
  totalJs: { files: allJs.length, rawKb: Number(kb(allJs.reduce((s, x) => s + x.raw, 0))) },
  largest: top.map((x) => ({ file: x.file, rawKb: Number(kb(x.raw)), gzipKb: Number(kb(x.gzip)) })),
};

if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Ngân sách ${report.dist}: chunk chính ≤ ${budgetKb} KB gzip`);
  for (const f of main) console.log(`  ${ok ? '✓' : '✗'} ${f.file}  ${kb(f.raw)} KB → ${kb(f.gzip)} KB gzip`);
  console.log(`  JS tải ban đầu (entry + modulepreload, ${initial.length} tệp): ${report.initialJs.gzipKb} KB gzip`);
  console.log(`  CSS ban đầu (${styles.length} tệp): ${report.initialCss.gzipKb} KB gzip · tổng JS ${allJs.length} chunk ${report.totalJs.rawKb} KB (chưa nén)`);
  console.log('  Chunk lớn nhất: ' + report.largest.map((x) => `${x.file.replace('assets/', '')} ${x.gzipKb} KB`).join(', '));
  console.log(ok ? 'ĐẠT' : `VƯỢT ngân sách ${kb(mainGzip - budgetKb * 1024)} KB`);
}
process.exit(ok ? 0 : 1);
