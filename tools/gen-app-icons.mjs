#!/usr/bin/env node
// Sinh ảnh nguồn icon + màn hình chờ (splash) cho app Android/iOS từ linh vật Nghé Tí (packages/ui Mascot).
//   node tools/gen-app-icons.mjs [--mascot nghe] [--out apps/learner/resources]
// Đầu ra (đúng bố cục @capacitor/assets): icon-only.png, icon-foreground.png, icon-background.png (1024²),
// splash.png, splash-dark.png (2732²), cùng pwa-192.png, pwa-512.png, mascot.svg.
// Sau đó: pnpm --filter @openedu/learner exec capacitor-assets generate  (sinh mọi kích thước Android/iOS).
// Cần: node_modules đã cài (esbuild đi kèm vite) + Python Playwright có Chromium (`pip install playwright && playwright install chromium`).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const mascot = arg('--mascot', 'nghe');
const out = resolve(arg('--out', join(ROOT, 'apps/learner/resources')));
const BRAND = '#2f7bf6', SKY = '#eaf4ff', NIGHT = '#14213d';

// 1) Kết xuất <Mascot> thành SVG tĩnh (esbuild của vite, React SSR).
const req = createRequire(realpathSync(join(ROOT, 'apps/learner/node_modules/vite/package.json')));
const esbuild = req('esbuild');
const tmp = join(tmpdir(), `openedu-icons-${process.pid}`);
mkdirSync(tmp, { recursive: true });
const entry = join(tmp, 'entry.tsx');
writeFileSync(entry, `import { renderToStaticMarkup } from 'react-dom/server';
import { Mascot } from ${JSON.stringify(join(ROOT, 'packages/ui/src/mascots/Mascot.tsx'))};
export const svg = (id: any, mood: any) => renderToStaticMarkup(<Mascot id={id} mood={mood} size={1000} title="" />);`);
await esbuild.build({
  entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: join(tmp, 'entry.cjs'),
  nodePaths: [join(ROOT, 'apps/learner/node_modules'), join(ROOT, 'packages/ui/node_modules')], logLevel: 'error',
  alias: { '@openedu/contracts': join(ROOT, 'packages/contracts/src/index.ts') },
});
const { svg } = createRequire(import.meta.url)(join(tmp, 'entry.cjs'));
const face = svg(mascot, 'happy').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
const wave = svg(mascot, 'wave').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'mascot.svg'), face);

// 2) Bố cục từng ảnh (HTML) → PNG bằng Chromium.
const page = (w, bg, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${w}px;height:${w}px;overflow:hidden;background:${bg}}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.c svg{display:block}
.t{font:800 ${Math.round(w * 0.055)}px "Baloo 2","Nunito",system-ui,sans-serif;letter-spacing:.02em;margin-top:${Math.round(w * 0.02)}px}
</style></head><body>${body}</body></html>`;
const sized = (s, px) => s.replace(/width="\d+"/, `width="${px}"`).replace(/height="\d+"/, `height="${px}"`);
const jobs = [
  // Icon nền xanh bo tròn do hệ điều hành cắt; linh vật nằm trong vùng an toàn 66 % (adaptive icon Android).
  ['icon-only.png', 1024, page(1024, BRAND, `<div class="c">${sized(face, 760)}</div>`), false],
  ['icon-foreground.png', 1024, page(1024, 'transparent', `<div class="c">${sized(face, 600)}</div>`), true],
  ['icon-background.png', 1024, page(1024, BRAND, ''), false],
  ['splash.png', 2732, page(2732, SKY, `<div class="c">${sized(wave, 900)}<div class="t" style="color:${BRAND}">OPEN-EDU</div></div>`), false],
  ['splash-dark.png', 2732, page(2732, NIGHT, `<div class="c">${sized(wave, 900)}<div class="t" style="color:#fff">OPEN-EDU</div></div>`), false],
  ['pwa-512.png', 512, page(512, BRAND, `<div class="c">${sized(face, 380)}</div>`), false],
  ['pwa-192.png', 192, page(192, BRAND, `<div class="c">${sized(face, 142)}</div>`), false],
];
for (const [name, w, html] of jobs) writeFileSync(join(tmp, name + '.html'), html);
const py = `
import json, sys
from playwright.sync_api import sync_playwright
jobs = json.loads(sys.argv[1]); tmp = sys.argv[2]; out = sys.argv[3]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w, transparent in jobs:
        pg = b.new_page(viewport={'width': w, 'height': w})
        pg.goto('file://' + tmp + '/' + name + '.html'); pg.wait_for_timeout(150)
        pg.screenshot(path=out + '/' + name, omit_background=transparent)
        pg.close()
    b.close()
`;
const r = spawnSync('python3', ['-c', py, JSON.stringify(jobs.map(([n, w, , t]) => [n, w, t])), tmp, out], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0) { console.error('Không kết xuất được PNG (cần Python Playwright + Chromium).'); process.exit(1); }
console.log(`Đã sinh ${jobs.length} ảnh + mascot.svg vào ${out}`);
