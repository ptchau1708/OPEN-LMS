#!/usr/bin/env node
/**
 * Vẽ ảnh "bài làm viết tay" mẫu (PNG ≤ 120 KB) cho chế độ demo từ packages/data/src/assess/samples.ts.
 *   node tools/gen-work-images.mjs
 * Cần Node ≥ 22.6 (bỏ kiểu TypeScript khi import .ts) và Playwright + Chromium (cài sẵn trong môi trường dựng mã).
 * Kết quả: packages/data/src/seed/work-images/<key>.png + sizes.json (kích thước để seed khai báo width/height).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'packages', 'data', 'src', 'seed', 'work-images');
const { PHOTO_SAMPLES } = await import(pathToFileURL(path.join(ROOT, 'packages/data/src/assess/samples.ts')).href);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const req = createRequire(import.meta.url);
  const globalRoot = path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules');
  ({ chromium } = req(path.join(globalRoot, 'playwright')));
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === ' ' ? '&nbsp;' : c);

function html(sample, idx) {
  const r = rng(1000 + idx * 7919);
  const LINE = 46;
  const rows = sample.lines
    .map((line, li) => {
      const sm = (sample.smudged ?? []).find((s) => s.line === li);
      const chars = [...line.normalize('NFC')]
        .map((c, ci) => {
          const rot = (r() - 0.5) * 7;
          const dy = (r() - 0.5) * 3.5;
          const sc = 0.94 + r() * 0.12;
          const blur = sm && ci >= sm.from && ci < sm.to;
          return `<span style="display:inline-block;transform:translateY(${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(2)});${blur ? 'filter:blur(2.2px);opacity:.75' : ''}">${esc(c)}</span>`;
        })
        .join('');
      const blot = sm ? `<i style="position:absolute;left:${34 + sm.from * 13}px;top:${4}px;width:${(sm.to - sm.from) * 13}px;height:34px;border-radius:45%;background:rgba(31,58,147,.28);filter:blur(5px)"></i>` : '';
      const indent = 6 + Math.round(r() * 10);
      return `<div class="row" style="padding-left:${indent}px;transform:rotate(${((r() - 0.5) * 0.8).toFixed(2)}deg)">${blot}${chars}</div>`;
    })
    .join('');
  return `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#fff}
  .paper{width:760px;padding:30px 24px 34px 70px;box-sizing:border-box;position:relative;
    background:#fffdf6 repeating-linear-gradient(to bottom,transparent 0,transparent ${LINE - 1}px,#a9c4ec ${LINE - 1}px,#a9c4ec ${LINE}px);
    background-position:0 18px}
  .paper:before{content:"";position:absolute;left:52px;top:0;bottom:0;width:2px;background:#ef9a9a}
  .row{position:relative;height:${LINE}px;line-height:${LINE}px;font-family:"TeX Gyre Chorus",cursive;font-size:30px;color:#1f3a93;white-space:nowrap}
  </style><div class="paper" id="p">${rows}</div>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 600 }, deviceScaleFactor: 1 });
await fs.mkdir(OUT, { recursive: true });
const sizes = {};
for (const [i, s] of PHOTO_SAMPLES.entries()) {
  await page.setContent(html(s, i));
  const el = await page.$('#p');
  const box = await el.boundingBox();
  const file = path.join(OUT, `${s.key}.png`);
  await el.screenshot({ path: file });
  const { size } = await fs.stat(file);
  sizes[s.key] = { width: Math.round(box.width), height: Math.round(box.height), bytes: size };
  console.log(`  ${s.key}.png ${Math.round(box.width)}×${Math.round(box.height)} ${(size / 1024).toFixed(0)} KB${size > 120 * 1024 ? '  ⚠ > 120 KB' : ''}`);
}
await fs.writeFile(path.join(OUT, 'sizes.json'), JSON.stringify(sizes, null, 2) + '\n');
await browser.close();
