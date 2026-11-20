#!/usr/bin/env node
/**
 * Kiểm thử đầu–cuối "Đăng nhập bằng OPEN-EDU" (docs/KET_NOI_APP_NGOAI.md) ở chế độ demo. KHÔNG nằm trong `pnpm e2e`.
 *
 *   VITE_DATA_MODE=demo VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= pnpm --filter @openedu/learner exec vite build --outDir /tmp/dist-learner-demo
 *   node tools/connect-e2e.mjs --dist /tmp/dist-learner-demo [--shots <thư mục ảnh>]
 *
 * Tự dựng 3 máy chủ tĩnh: app học sinh (4711), trang mẫu ở origin được phép (4713) và ở origin KHÔNG được phép (4714).
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dist = resolve(val('--dist', join(ROOT, 'apps/learner/dist')));
const shots = val('--shots', '');
if (!existsSync(join(dist, 'index.html'))) { console.error(`Không thấy ${dist}/index.html — build bản demo của app học sinh trước (xem đầu tệp).`); process.exit(2); }
if (shots) mkdirSync(shots, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png' };
function serve(dir, port, spa) {
  const srv = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let file = join(dir, path);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) {
      if (!spa) { res.writeHead(404).end('not found'); return; }
      file = join(dir, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok, fail) => { srv.once('error', fail); srv.listen(port, 'localhost', () => ok(srv)); });
}

const LEARNER = 'http://localhost:4711';
const SAMPLE = `http://localhost:4713/doc-hieu-mau.html?learner=${encodeURIComponent(LEARNER)}`;
const SAMPLE_BAD = `http://localhost:4714/doc-hieu-mau.html?learner=${encodeURIComponent(LEARNER)}`;

let failed = 0;
const check = (ok, name, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok || !extra ? '' : ` — ${extra}`}`); if (!ok) failed++; };
const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, `connect-${name}.png`) }); };

const servers = await Promise.all([serve(dist, 4711, true), serve(join(ROOT, 'examples/connect'), 4713, false), serve(join(ROOT, 'examples/connect'), 4714, false)]);
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
try {
  /** Mở trang mẫu, bấm nút đăng nhập, trả về cửa sổ bật lên. */
  async function openPopup(ctx, url) {
    const page = await ctx.newPage();
    const messages = [];
    await page.exposeFunction('__log', (m) => messages.push(m));
    await page.addInitScript(() => window.addEventListener('message', (e) => window.__log({ origin: e.origin, data: e.data })));
    await page.goto(url);
    const btn = page.getByRole('button', { name: 'Đăng nhập bằng OPEN-EDU' });
    await btn.waitFor();
    const [popup] = await Promise.all([page.waitForEvent('popup'), btn.click()]);
    await popup.waitForLoadState('domcontentloaded');
    return { page, popup, messages };
  }
  const ctxOpts = { locale: 'vi-VN', serviceWorkers: 'block', viewport: { width: 1100, height: 800 } };

  // ---------- 1. Luồng chính: đăng nhập → xin phép → Cho phép → trang mẫu nhận tin ----------
  {
    const ctx = await browser.newContext(ctxOpts);
    const { page, popup, messages } = await openPopup(ctx, SAMPLE);
    await shot(page, '1-sample');
    const u = new URL(popup.url());
    check(u.origin === LEARNER && u.searchParams.get('origin') === 'http://localhost:4713' && (u.searchParams.get('state') ?? '').length >= 16, 'cửa sổ bật lên mở /ket-noi kèm app, origin, state');
    await popup.getByText('Minh An', { exact: false }).first().click(); // màn đăng nhập demo
    await popup.getByRole('button', { name: 'Cho phép' }).waitFor();
    check(await popup.getByText('«Đọc hiểu vui»').count() > 0, 'màn xin phép hiện tên app');
    check(await popup.getByText('http://localhost:4713').count() > 0, 'màn xin phép hiện origin của app');
    await shot(popup, '2-consent');
    await Promise.all([popup.waitForEvent('close'), popup.getByRole('button', { name: 'Cho phép' }).click()]);
    await page.getByText('Chào Minh An', { exact: false }).waitFor();
    const msg = messages.find((m) => m.data && m.data.type === 'openedu:connect');
    check(!!msg && msg.origin === LEARNER, 'tin nhắn đến từ origin app học sinh');
    check(!!msg && msg.data.user && msg.data.user.name === 'Minh An' && !!msg.data.user.id && 'className' in msg.data.user, 'tin nhắn có id, tên, lớp');
    check(!!msg && msg.data.state === u.searchParams.get('state'), 'state khớp');
    check(!!msg && msg.data.token === null && msg.data.api === null, 'chế độ demo: token null');
    check(!!msg && !/refresh/i.test(JSON.stringify(msg.data)), 'không có refresh token trong tin nhắn');
    check(await page.getByRole('button', { name: /Minh An.*Thoát/ }).count() === 1, 'nút đổi thành “👋 Minh An … — Thoát”');
    await shot(page, '3-signed-in');

    // làm bài + ghi kết quả (demo: không ghi)
    await page.locator('input[name=q1][value="1"]').check();
    await page.locator('input[name=q2][value="0"]').check();
    await page.locator('input[name=q3][value="1"]').check();
    await page.getByRole('button', { name: 'Nộp bài' }).click();
    await page.getByText('Em đúng 2/3 câu').waitFor();
    await page.getByText('chế độ demo: không ghi dữ liệu').waitFor();
    const rec = await page.evaluate(() => window.__lastRecord);
    check(rec && rec.demo === true && rec.saved === false, 'record() ở demo trả { saved:false, demo:true }');
    await shot(page, '4-result');

    // tải lại: phiên giữ trong sessionStorage; Thoát thì quên
    await page.reload();
    await page.getByText('Chào Minh An', { exact: false }).waitFor();
    check(true, 'tải lại trang vẫn nhớ người dùng (sessionStorage)');
    await page.getByRole('button', { name: /Thoát/ }).click();
    await page.getByRole('button', { name: 'Đăng nhập bằng OPEN-EDU' }).waitFor();
    check(await page.evaluate(() => window.OpenEdu.getUser()) === null, 'Thoát: quên người dùng');

    // đã đăng nhập sẵn ở app học sinh → vào thẳng màn xin phép; bấm Không
    const [popup2] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Đăng nhập bằng OPEN-EDU' }).click()]);
    await popup2.getByRole('button', { name: 'Không', exact: true }).waitFor();
    const err = page.evaluate(() => new Promise((ok) => window.addEventListener('message', (e) => { if (e.data && e.data.type === 'openedu:connect') ok(e.data); })));
    await popup2.getByRole('button', { name: 'Không', exact: true }).click();
    const denied = await err;
    check(denied.error === 'denied' && !denied.user && !denied.token, 'bấm Không: nhận { error: "denied" }, không có dữ liệu');
    await ctx.close();
  }

  // ---------- 2. Origin không được đăng kí ----------
  {
    const ctx = await browser.newContext(ctxOpts);
    const { page, popup, messages } = await openPopup(ctx, SAMPLE_BAD);
    await popup.getByText('Minh An', { exact: false }).first().click();
    await popup.getByText('Địa chỉ này chưa được nhà trường cho phép').waitFor();
    await shot(popup, '5-origin-refused');
    check(await popup.getByRole('button', { name: 'Cho phép' }).count() === 0, 'origin lạ: không có nút Cho phép');
    await page.waitForFunction(() => true);
    await new Promise((r) => setTimeout(r, 300));
    const msg = messages.find((m) => m.data && m.data.type === 'openedu:connect');
    check(!!msg && msg.data.error === 'origin_not_allowed' && !msg.data.user && !msg.data.token, 'origin lạ: chỉ nhận mã lỗi, không có tên hay token');
    await ctx.close();
  }

  // ---------- 3. Giả mạo origin: trang ở 4714 mở cửa sổ khai origin=4713 ----------
  {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const messages = [];
    await page.exposeFunction('__log', (m) => messages.push(m));
    await page.addInitScript(() => window.addEventListener('message', (e) => window.__log({ origin: e.origin, data: e.data })));
    await page.goto(SAMPLE_BAD);
    await page.getByRole('button', { name: 'Đăng nhập bằng OPEN-EDU' }).waitFor();
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.evaluate((l) => { window.open(`${l}/ket-noi?app=doc-hieu-mau&origin=${encodeURIComponent('http://localhost:4713')}&state=gia-mao-state-1234567890`, 'x', 'popup=yes,width=460,height=700'); }, LEARNER),
    ]);
    await popup.getByText('Minh An', { exact: false }).first().click();
    await popup.getByRole('button', { name: 'Cho phép' }).click();
    await new Promise((r) => setTimeout(r, 800));
    check(messages.filter((m) => m.data && m.data.type === 'openedu:connect').length === 0, 'khai gian origin: trình duyệt không giao tin cho trang giả mạo');
    await ctx.close();
  }

  // ---------- 4. Mở thẳng /ket-noi (không có cửa sổ mở ra nó) / thiếu tham số ----------
  {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    await page.goto(`${LEARNER}/ket-noi?app=doc-hieu-mau&origin=${encodeURIComponent('http://localhost:4713')}&state=abcdefgh12345678`);
    await page.getByText('Trang này dùng để kết nối ứng dụng khác').waitFor();
    check(true, 'mở thẳng /ket-noi: từ chối, không xin phép');
    await shot(page, '6-no-opener');
    await ctx.close();
  }
} catch (e) {
  failed++;
  console.error('✗ lỗi khi chạy:', e);
} finally {
  await browser.close();
  for (const s of servers) s.close();
}
console.log(failed ? `\n${failed} mục KHÔNG đạt` : '\nTất cả đều đạt');
process.exit(failed ? 1 : 0);
