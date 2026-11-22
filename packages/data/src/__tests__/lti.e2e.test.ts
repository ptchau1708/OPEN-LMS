/**
 * Đầu-cuối THẬT với app ngoài viết bằng FastAPI + pylti1p3 (examples/lti-fastapi):
 *  • mở app ở thẻ mới (cookie state) → app gửi điểm (AGS) + xAPI (câu trả lời có mã kĩ năng, hoàn thành bài);
 *  • mở trong khung KHÔNG cookie (lưu trạng thái qua nền tảng: lti.put_data / lti.get_data — mô phỏng phần JS);
 *  • giáo viên chọn bài (Deep Linking) → Trang học của lớp → học sinh mở đúng bài.
 * Chạy khi có Python + các gói trong examples/lti-fastapi/requirements.txt:
 *   LTI_E2E_PYTHON=/đường/dẫn/python pnpm --filter @openedu/data test lti.e2e
 * Không có biến → bỏ qua.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LtiPlatformStorage, MemoryLtiStore, handleLti, toolConfigJson, launchStartUrl, type LtiDeps } from '../lti';

const PY = process.env.LTI_E2E_PYTHON;
const EXAMPLE = fileURLToPath(new URL('../../../../examples/lti-fastapi', import.meta.url));
const PPORT = 18731;
const TPORT = 18732;
const ISS = `http://127.0.0.1:${PPORT}/functions/v1/lti`;
const AUTH = `http://127.0.0.1:${PPORT}/lti/auth`;
const TOOL = `http://127.0.0.1:${TPORT}`;

class Jar {
  private m = new Map<string, string>();
  keep(r: Response) { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); this.m.set(kv.slice(0, i), kv.slice(i + 1)); } }
  get header() { return [...this.m].map(([k, v]) => `${k}=${v}`).join('; '); }
}
/** Trang "app học sinh" giả: khung nhúng + trả lời lti.put_data / get_data bằng LtiPlatformStorage thật (exposeFunction). */
const HOST_HTML = `<!doctype html><meta charset="utf-8"><body><iframe id="f" style="width:900px;height:500px"></iframe><script>
window.addEventListener('message', async function (ev) {
  if (!ev.data || typeof ev.data.subject !== 'string') return;
  var r = await window.ltiHandle(ev.origin, ev.data);
  if (r) ev.source.postMessage(r, ev.origin);
});
document.getElementById('f').src = new URLSearchParams(location.search).get('src');
</script>`;
/** Trang /lti/auth giả (giống LtiAuth.tsx): gọi /authorize bằng phiên của HS rồi tự gửi biểu mẫu. */
const AUTH_HTML = `<!doctype html><meta charset="utf-8"><body><script>
var p = Object.fromEntries(new URLSearchParams(location.search));
fetch('/functions/v1/lti/authorize', { method: 'POST', headers: { Authorization: 'Bearer tok-u-hs1', 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
  .then(function (r) { return r.json(); }).then(function (o) {
    var f = document.createElement('form'); f.method = 'POST'; f.action = o.action;
    Object.keys(o.fields).forEach(function (k) { var i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = o.fields[k]; f.appendChild(i); });
    document.body.appendChild(f); f.submit();
  });
</script>`;
const dataOf = (html: string): Record<string, string> => JSON.parse((/var d = (\{[\s\S]*?\});/.exec(html) as RegExpExecArray)[1]);
const tokenOf = (html: string): string => JSON.parse((/window\.APP_TOKEN = ("[^"]+")/.exec(html) as RegExpExecArray)[1]);

describe.skipIf(!PY)('LTI 1.3 + Deep Linking + xAPI đầu-cuối với pylti1p3 (FastAPI)', () => {
  let server: Server;
  let tool: ChildProcess;
  const store = new MemoryLtiStore({
    tools: [{ appId: 'luyen-doc', name: 'Luyện đọc hiểu', clientId: 'cid-123', deploymentId: 'dep-1', loginUrl: `${TOOL}/lti/login`, launchUrl: `${TOOL}/lti/launch`, deepLinkUrl: `${TOOL}/lti/chon-bai`, redirectUris: [], jwksUrl: `${TOOL}/lti/jwks`, enabled: true }],
    users: [
      { id: 'u-hs1', name: 'Nguyễn Minh An', role: 'student', username: 'minhan', email: 'minhan@openlms.edu', grade: 5 },
      { id: 'u-gv1', name: 'Cô Thu', role: 'teacher', username: 'cothu' },
    ],
    contexts: [{ id: 'c-5a1', name: '5A1', grade: 5, learners: ['u-hs1'], teachers: ['u-gv1'] }],
  });
  const deps: LtiDeps = {
    store, issuer: ISS,
    authenticate: async (req) => (req.headers.get('Authorization') ?? '').replace(/^Bearer tok-/, '') || null,
    corsOrigin: () => '*',
    fetchJson: async (u) => (await fetch(u)).json(),
  };
  const authorize = async (uid: string, auth: URL) => {
    const r = await fetch(`${ISS}/authorize`, { method: 'POST', headers: { Authorization: `Bearer tok-${uid}`, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(auth.searchParams)) });
    const out = await r.json() as { action: string; fields: Record<string, string> };
    expect(r.status, JSON.stringify(out)).toBe(200);
    return out;
  };
  const post = (url: string, fields: Record<string, string>, jar?: Jar) => fetch(url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(jar ? { Cookie: jar.header } : {}) }, body: new URLSearchParams(fields).toString() });

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://x').pathname;
      if (pathname === '/host' || pathname === '/lti/auth') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pathname === '/host' ? HOST_HTML : AUTH_HTML);
        return;
      }
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = Buffer.concat(chunks);
      const r = await handleLti(new Request(`http://127.0.0.1:${PPORT}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, ...(body.length ? { body } : {}) }), deps);
      res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
      res.end(Buffer.from(await r.arrayBuffer()));
    });
    await new Promise<void>((ok) => server.listen(PPORT, '127.0.0.1', ok));
    const dir = mkdtempSync(path.join(tmpdir(), 'lti-tool-'));
    cpSync(EXAMPLE, dir, { recursive: true });
    execFileSync(PY as string, ['make_keys.py'], { cwd: dir });
    writeFileSync(path.join(dir, 'lti_config.json'), JSON.stringify(toolConfigJson(ISS, AUTH, { clientId: 'cid-123', deploymentId: 'dep-1' }), null, 2));
    tool = spawn(PY as string, ['-m', 'uvicorn', 'app:app', '--port', String(TPORT), '--host', '127.0.0.1'], { cwd: dir, env: { ...process.env, APP_URL: TOOL, APP_SECRET: 'x'.repeat(32) }, stdio: ['ignore', 'pipe', 'pipe'] });
    tool.stderr?.on('data', (d) => { if (process.env.LTI_E2E_VERBOSE) process.stderr.write(d); });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${TOOL}/lti/jwks`)).ok) return; } catch { /* chưa lên */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('app FastAPI chưa chạy được');
  }, 30_000);
  afterAll(() => { tool?.kill(); server?.close(); });

  it('thẻ mới: mở app → AGS + xAPI (câu trả lời có kĩ năng, hoàn thành bài)', async () => {
    const jar = new Jar();
    const r1 = await fetch(launchStartUrl(store.data.tools[0], ISS, 'u-hs1', 'c-5a1'), { redirect: 'manual' });
    expect(r1.status).toBe(302);
    jar.keep(r1);
    const auth = new URL(r1.headers.get('location') as string);
    expect(auth.origin + auth.pathname).toBe(AUTH);
    const out = await authorize('u-hs1', auth);
    const r3 = await post(out.action, out.fields, jar);
    const html = await r3.text();
    expect(r3.status, html).toBe(200);
    expect(html).toContain('Chào Nguyễn Minh An');
    const bearer = { Authorization: `Bearer ${tokenOf(html)}`, 'Content-Type': 'application/json' };

    const a = await fetch(`${TOOL}/api/tra-loi`, { method: 'POST', headers: bearer, body: JSON.stringify({ bai: '3', cau: '2', cau_hoi: 'Ý chính của đoạn 1?', dung: false, ky_nang: ['TV5-DH-YCHINH'], giay: 45 }) });
    expect(a.status, await a.clone().text()).toBe(200);
    expect(store.xapi.at(-1)?.row).toMatchObject({ userId: 'u-hs1', verb: 'http://adlnet.gov/expapi/verbs/answered', success: false, skills: ['TV5-DH-YCHINH'], durationSec: 45, objectName: 'Ý chính của đoạn 1?' });

    const r4 = await fetch(`${TOOL}/api/ket-qua`, { method: 'POST', headers: bearer, body: JSON.stringify({ diem: 8, diem_toi_da: 10, bai: 'Bài 3 - Cây bàng', nhan_xet: 'Đọc hiểu tốt' }) });
    expect(r4.status, await r4.clone().text()).toBe(200);
    expect(store.scores).toHaveLength(1);
    expect(store.scores[0].score).toMatchObject({ userId: 'u-hs1', scoreGiven: 8, scoreMaximum: 10, comment: 'Bài 3 - Cây bàng — Đọc hiểu tốt' });
    expect(store.xapi.at(-1)?.row).toMatchObject({ verb: 'http://adlnet.gov/expapi/verbs/completed', raw: 8, max: 10 });
    // Không có token của app → bị từ chối.
    expect((await fetch(`${TOOL}/api/ket-qua`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"diem":1}' })).status).toBe(401);
  }, 30_000);

  it('trong khung, KHÔNG cookie: lưu state qua nền tảng (put_data / get_data) rồi mở được', async () => {
    const storage = new LtiPlatformStorage(() => [TOOL]);
    const r1 = await fetch(launchStartUrl(store.data.tools[0], ISS, 'u-hs1', 'c-5a1', { storageTarget: '_parent' }), { redirect: 'manual' });
    expect(r1.status).toBe(200);
    expect(r1.headers.getSetCookie()).toEqual([]);
    const d1 = dataOf(await r1.text());
    // (JS của app) lti.put_data → OPEN-EDU trả lời
    expect(storage.handle(TOOL, { subject: 'lti.put_data', message_id: 'a', key: `lti_state_${d1.state}`, value: d1.state })).toMatchObject({ value: d1.state });
    const out = await authorize('u-hs1', new URL(d1.url));
    const r2 = await post(out.action, out.fields);
    const d2 = dataOf(await r2.text());
    // (JS của app) lti.get_data → đúng state → gửi lại kèm proof
    const got = storage.handle(TOOL, { subject: 'lti.get_data', message_id: 'b', key: `lti_state_${d2.state}` }) as { value: string };
    expect(got.value).toBe(d2.state);
    const r3 = await post(d2.action, { id_token: d2.id_token, state: d2.state, lti_storage_proof: d2.proof });
    const html = await r3.text();
    expect(r3.status, html).toBe(200);
    expect(html).toContain('Chào Nguyễn Minh An');
    // Proof chỉ dùng một lần.
    expect((await post(d2.action, { id_token: d2.id_token, state: d2.state, lti_storage_proof: d2.proof })).status).not.toBe(200);
  }, 30_000);

  it('Deep Linking: giáo viên chọn bài → Trang học → học sinh mở đúng bài', async () => {
    const jar = new Jar();
    const r1 = await fetch(launchStartUrl(store.data.tools[0], ISS, 'u-gv1', 'dl:c-5a1'), { redirect: 'manual' });
    jar.keep(r1);
    const out = await authorize('u-gv1', new URL(r1.headers.get('location') as string));
    expect(out.action).toBe(`${TOOL}/lti/chon-bai`);
    const picker = await (await post(out.action, out.fields, jar)).text();
    expect(picker).toContain('Bài 3 - Cây bàng');
    const t = (/name='t' value='([^']+)'/.exec(picker) as RegExpExecArray)[1];
    const done = await (await fetch(`${TOOL}/lti/chon-bai/xong`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `t=${encodeURIComponent(t)}&bai=3` })).text();
    // Trang tự gửi biểu mẫu (JWT kí bằng khóa của app) về OPEN-EDU.
    const action = (/action="([^"]+)"/.exec(done) as RegExpExecArray)[1];
    const jwt = (/name="JWT" value="([^"]+)"/.exec(done) as RegExpExecArray)[1];
    expect(action).toBe(`${ISS}/deep-link`);
    const back = await post(action, { JWT: jwt });
    expect(back.status).toBe(200);
    expect(await back.text()).toContain('Đã thêm 1 bài');
    expect(store.data.pages).toEqual([expect.objectContaining({ title: 'Bài 3 - Cây bàng', contextId: 'c-5a1', custom: { bai: '3' }, scoreMaximum: 10, tag: 'bai-3' })]);

    const page = store.data.pages?.[0];
    const hs = new Jar();
    const s1 = await fetch(launchStartUrl(store.data.tools[0], ISS, 'u-hs1', `page:${page?.id}`, { targetLinkUri: page?.url }), { redirect: 'manual' });
    hs.keep(s1);
    const o = await authorize('u-hs1', new URL(s1.headers.get('location') as string));
    const html = await (await post(o.action, o.fields, hs)).text();
    expect(html).toContain('Bài: 3');
  }, 30_000);

  it('trình duyệt thật (Chromium): mở trong khung, app lưu state qua nền tảng bằng postMessage', async () => {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const storage = new LtiPlatformStorage(() => [TOOL]);
      const seen: string[] = [];
      await page.exposeFunction('ltiHandle', (origin: string, data: unknown) => { seen.push(`${origin} ${(data as { subject?: string })?.subject}`); return storage.handle(origin, data); });
      const src = launchStartUrl(store.data.tools[0], ISS, 'u-hs1', 'c-5a1', { storageTarget: '_parent' });
      await page.goto(`http://127.0.0.1:${PPORT}/host?src=${encodeURIComponent(src)}`);
      const frame = page.frameLocator('#f');
      await frame.getByText('Chào Nguyễn Minh An').waitFor({ timeout: 15_000 });
      expect(seen).toEqual([`${TOOL} lti.put_data`, `${TOOL} lti.get_data`]);
      expect((await page.context().cookies(TOOL)).filter((c) => c.name.startsWith('lti1p3'))).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 40_000);
});
