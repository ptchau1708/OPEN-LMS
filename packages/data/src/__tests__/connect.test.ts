import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  activityRatio, buildConnectSnippet, isAllowedOrigin, normalizeOrigin, parseConnectRequest, parseOrigins, summarizeExternal,
  type ExternalActivity,
} from '../connect';
import { DEMO_CONNECT_APP_ID, DemoConnectSource } from '../connect/demo';
import { MemoryStorage } from '../storage';

describe('connect: origin', () => {
  it('chuẩn hóa origin hợp lệ', () => {
    expect(normalizeOrigin(' https://Doc.Truong.edu.vn/ ')).toBe('https://doc.truong.edu.vn');
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeOrigin('http://127.0.0.1:4713')).toBe('http://127.0.0.1:4713');
    expect(normalizeOrigin('https://a.vn:443')).toBe('https://a.vn');
    expect(normalizeOrigin('https://a.vn:8443')).toBe('https://a.vn:8443');
  });
  it('từ chối thứ không phải origin', () => {
    for (const bad of ['*', 'https://*.truong.edu.vn', 'https://a.vn/duong-dan', 'http://doc.truong.edu.vn', 'file:///C:/bai.html', 'null', 'a.vn', 'https://', 'javascript:alert(1)', 'https://a.vn?x=1', 'https://user@a.vn']) {
      expect(normalizeOrigin(bad), bad).toBeNull();
    }
  });
  it('tách ô nhập nhiều dòng, bỏ trùng, báo dòng sai', () => {
    expect(parseOrigins('https://a.vn\nhttps://A.vn/ , http://localhost:3000\nsai-roi')).toEqual({ origins: ['https://a.vn', 'http://localhost:3000'], invalid: ['sai-roi'] });
  });
  it('so khớp chính xác, không theo tiền tố', () => {
    const allowed = ['https://doc.truong.edu.vn'];
    expect(isAllowedOrigin('https://doc.truong.edu.vn', allowed)).toBe(true);
    expect(isAllowedOrigin('https://doc.truong.edu.vn.xau.com', allowed)).toBe(false);
    expect(isAllowedOrigin('https://xdoc.truong.edu.vn', allowed)).toBe(false);
    expect(isAllowedOrigin('http://doc.truong.edu.vn', allowed)).toBe(false);
    expect(isAllowedOrigin('null', ['null'])).toBe(false);
    expect(isAllowedOrigin('*', ['*'])).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
  });
  it('đọc tham số trang /ket-noi', () => {
    expect(parseConnectRequest('?app=doc-hieu&origin=https%3A%2F%2Fa.vn&state=abcdefgh12345678')).toEqual({ appId: 'doc-hieu', origin: 'https://a.vn', state: 'abcdefgh12345678' });
    expect(parseConnectRequest('?app=doc-hieu&origin=https%3A%2F%2Fa.vn%2Fx&state=abcdefgh12345678')).toBeNull();
    expect(parseConnectRequest('?app=doc-hieu&origin=*&state=abcdefgh12345678')).toBeNull();
    expect(parseConnectRequest('?app=Doc Hieu&origin=https%3A%2F%2Fa.vn&state=abcdefgh12345678')).toBeNull();
    expect(parseConnectRequest('?app=doc-hieu&origin=https%3A%2F%2Fa.vn&state=ngan')).toBeNull();
    expect(parseConnectRequest('')).toBeNull();
  });
});

const act = (o: Partial<ExternalActivity>): ExternalActivity => ({
  id: 'x', userId: 'u', appId: 'a', appName: 'A', activityId: '', title: '', kind: 'reading', score: null, maxScore: null, correct: null, total: null,
  durationSec: null, completed: true, detail: {}, skills: [], at: '2026-11-01T00:00:00Z', ...o,
});

describe('connect: tóm tắt', () => {
  it('tỉ lệ đúng', () => {
    expect(activityRatio(act({ score: 8, maxScore: 10 }))).toBe(0.8);
    expect(activityRatio(act({ correct: 1, total: 4 }))).toBe(0.25);
    expect(activityRatio(act({ score: 5 }))).toBeNull();
    expect(activityRatio(act({ correct: 3, total: 0 }))).toBeNull();
  });
  it('gộp theo app, app dùng gần nhất trước', () => {
    const s = summarizeExternal([
      act({ appId: 'a', appName: 'A', correct: 1, total: 2, durationSec: 60, at: '2026-11-01T00:00:00Z' }),
      act({ appId: 'b', appName: 'B', at: '2026-11-03T00:00:00Z' }),
      act({ appId: 'a', appName: 'A', correct: 2, total: 2, durationSec: 30, at: '2026-11-02T00:00:00Z' }),
    ]);
    expect(s).toEqual([
      { appId: 'b', appName: 'B', count: 1, avgPercent: null, totalSec: 0, lastAt: '2026-11-03T00:00:00Z' },
      { appId: 'a', appName: 'A', count: 2, avgPercent: 75, totalSec: 90, lastAt: '2026-11-02T00:00:00Z' },
    ]);
  });
  it('mã nhúng điền sẵn địa chỉ và mã app', () => {
    const s = buildConnectSnippet('https://hoc.truong.edu.vn/', 'doc-hieu');
    expect(s).toContain('<script src="https://hoc.truong.edu.vn/openedu-connect.js"></script>');
    expect(s).toContain("OpenEdu.init({ learnerUrl: 'https://hoc.truong.edu.vn', appId: 'doc-hieu' })");
  });
});

describe('connect: nguồn demo', () => {
  it('có app mẫu, dòng mẫu, không trao token', async () => {
    const d = new DemoConnectSource(new MemoryStorage());
    expect((await d.getApp(DEMO_CONNECT_APP_ID))?.allowedOrigins).toContain('http://localhost:4713');
    expect((await d.listActivities('u-an2a1')).length).toBeGreaterThan(2);
    expect(await d.listActivities('khong-co')).toEqual([]);
    expect(await d.getAccess()).toBeNull();
  });
  it('thêm / tắt / xóa app; từ chối origin sai', async () => {
    const d = new DemoConnectSource(new MemoryStorage());
    await d.saveApp({ id: 'toan-vui', name: 'Toán vui', description: '', allowedOrigins: ['https://toan.vn'], enabled: true }, true);
    await expect(d.saveApp({ id: 'toan-vui', name: 'Trùng', description: '', allowedOrigins: [], enabled: true }, true)).rejects.toThrow(/đã có/);
    await expect(d.saveApp({ id: 'x-y', name: 'X', description: '', allowedOrigins: ['https://a.vn/x'], enabled: true }, true)).rejects.toThrow(/origin/);
    await d.saveApp({ id: 'toan-vui', name: 'Toán vui', description: '', allowedOrigins: ['https://toan.vn'], enabled: false }, false);
    expect(await d.getApp('toan-vui')).toBeNull();
    await d.deleteApp('toan-vui');
    expect((await d.listApps()).some((a) => a.id === 'toan-vui')).toBe(false);
    await expect(d.deleteApp(DEMO_CONNECT_APP_ID)).rejects.toThrow(/không xóa được/);
  });
});

/* SDK apps/learner/public/openedu-connect.js (tệp tĩnh ES5/UMD) — nạp như CommonJS để thử phần làm sạch dữ liệu. */
describe('connect: SDK openedu-connect.js', () => {
  const sdkPath = fileURLToPath(new URL('../../../../apps/learner/public/openedu-connect.js', import.meta.url));
  const mod = { exports: {} as Record<string, (...a: unknown[]) => any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function('module', readFileSync(sdkPath, 'utf8'))(mod);
  const sdk = mod.exports;

  it('viết kiểu ES5 (không let/const/=>/template)', () => {
    const src = readFileSync(sdkPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/\b(let|const)\s/.test(src)).toBe(false);
    expect(src.includes('=>')).toBe(false);
    expect(src.includes('`')).toBe(false);
  });
  it('không bao giờ postMessage / nhận từ origin "*"', () => {
    const src = readFileSync(sdkPath, 'utf8');
    expect(src).toContain('ev.origin !== c.learnerOrigin');
    expect(src).not.toMatch(/postMessage\(/);
  });
  it('kẹp và làm sạch dữ liệu ghi', () => {
    const p = sdk._clean({
      activityId: 'b'.repeat(500), title: 't'.repeat(500), kind: 'Reading Vui!', score: 12, maxScore: 10, correct: 9, total: 5,
      durationSec: 1e9, detail: { big: 'x'.repeat(20000) }, skills: ['A', 'A', 5, 'B'], userId: 'ke-khac',
    });
    expect(p.activityId).toHaveLength(120);
    expect(p.title).toHaveLength(200);
    expect(p.kind).toBe('readingvui');
    expect(p.score).toBe(10);
    expect(p.correct).toBe(5);
    expect(p.durationSec).toBe(86400);
    expect(p.detail).toEqual({ truncated: true });
    expect(p.skills).toEqual(['A', 'B']);
    expect(p.completed).toBe(true);
    expect('userId' in p).toBe(false);
  });
  it('bỏ số không hợp lệ, giữ detail nhỏ', () => {
    const p = sdk._clean({ score: NaN, correct: '3', total: -2, completed: false, detail: { answers: [1, 2] } });
    expect(p.score).toBeNull();
    expect(p.correct).toBeNull();
    expect(p.total).toBe(0);
    expect(p.completed).toBe(false);
    expect(p.detail).toEqual({ answers: [1, 2] });
    expect(sdk._clean(undefined).kind).toBe('other');
  });
  it('record() khi chưa init / chưa đăng nhập thì báo lỗi rõ', async () => {
    await expect(sdk.record({})).rejects.toThrow(/init/);
  });

  /* Hàng đợi + gọi REST: chạy SDK với một "window" giả. */
  function boot(opts: { session?: unknown; queue?: unknown; fetch: (url: string, init: { headers: Record<string, string>; body: string }) => Promise<unknown> }) {
    const mem = (init: Record<string, string>) => {
      const m = new Map(Object.entries(init));
      return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    };
    const win = {
      sessionStorage: mem(opts.session ? { 'openedu:session:doc-hieu': JSON.stringify(opts.session) } : {}),
      localStorage: mem(opts.queue ? { 'openedu:queue:doc-hieu': JSON.stringify(opts.queue) } : {}),
      document: { createElement: () => { const a = { protocol: '', host: '', set href(v: string) { const u = new URL(v); a.protocol = u.protocol; a.host = u.host; } }; return a; } },
      location: { origin: 'https://doc.truong.edu.vn' },
      addEventListener: () => undefined,
      setTimeout: () => 0,
      fetch: opts.fetch,
    };
    const m = { exports: {} as Record<string, (...a: unknown[]) => any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function('module', 'window', readFileSync(sdkPath, 'utf8'))(m, win);
    m.exports.init({ learnerUrl: 'https://hoc.truong.edu.vn/', appId: 'doc-hieu' });
    return { sdk: m.exports, win, queue: () => JSON.parse(win.localStorage.getItem('openedu:queue:doc-hieu') ?? '[]') as { userId: string; payload: { clientId: string } }[] };
  }
  const live = (userId = 'u1', expiresAt = Date.now() / 1000 + 3000) => ({ user: { id: userId, name: 'An' }, token: { accessToken: 'TOK', expiresAt }, api: { url: 'https://x.supabase.co', anonKey: 'ANON' }, demo: false });
  const okRes = (id: string) => ({ ok: true, status: 200, json: () => Promise.resolve(id) });
  const errRes = (status: number, message: string) => ({ ok: false, status, text: () => Promise.resolve(JSON.stringify({ message })) });

  it('record() gọi đúng RPC với đúng header, xong thì hàng đợi trống', async () => {
    const calls: { url: string; headers: Record<string, string>; body: { p: Record<string, unknown> } }[] = [];
    const t = boot({ session: live(), fetch: (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return Promise.resolve(okRes('row-1')); } });
    const r = await t.sdk.record({ title: 'Bài 1', kind: 'reading', correct: 2, total: 3 });
    expect(r).toMatchObject({ saved: true, id: 'row-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://x.supabase.co/rest/v1/rpc/record_external_activity');
    expect(calls[0]!.headers).toMatchObject({ apikey: 'ANON', Authorization: 'Bearer TOK', 'Content-Profile': 'v2' });
    expect(calls[0]!.body.p).toMatchObject({ appId: 'doc-hieu', title: 'Bài 1', correct: 2, total: 3, clientId: r.clientId });
    expect(t.queue()).toEqual([]);
  });
  it('mất mạng → cất hàng đợi; 401 → báo hết phiên, vẫn giữ; lỗi 400 → bỏ và reject', async () => {
    const off = boot({ session: live(), fetch: () => Promise.reject(new Error('offline')) });
    expect(await off.sdk.record({ title: 'A' })).toMatchObject({ saved: false, queued: true, reason: 'offline' });
    expect(off.queue()).toHaveLength(1);

    const exp = boot({ session: live(), fetch: () => Promise.resolve(errRes(401, 'JWT expired')) });
    let expired = 0;
    exp.sdk.on('expired', () => { expired++; });
    expect(await exp.sdk.record({ title: 'A' })).toMatchObject({ saved: false, queued: true, reason: 'expired' });
    expect(expired).toBe(1);
    expect(exp.queue()).toHaveLength(1);
    expect(exp.sdk.isSignedIn()).toBe(false);
    expect(exp.sdk.getUser()).toMatchObject({ id: 'u1' });

    const bad = boot({ session: live(), fetch: () => Promise.resolve(errRes(403, 'Ứng dụng chưa được nhà trường đăng kí hoặc đã tắt.')) });
    await expect(bad.sdk.record({ title: 'A' })).rejects.toThrow(/đã tắt/);
    expect(bad.queue()).toEqual([]);
  });
  it('token hết hạn sẵn → không gọi mạng, cất hàng đợi; chưa đăng nhập → reject', async () => {
    let n = 0;
    const t = boot({ session: live('u1', Date.now() / 1000 - 10), fetch: () => { n++; return Promise.resolve(okRes('x')); } });
    expect(await t.sdk.record({ title: 'A' })).toMatchObject({ queued: true, reason: 'expired' });
    expect(n).toBe(0);
    const none = boot({ fetch: () => Promise.resolve(okRes('x')) });
    await expect(none.sdk.record({ title: 'A' })).rejects.toThrow(/Chưa đăng nhập/);
  });
  it('khi đăng nhập lại: chỉ gửi hàng đợi của đúng học sinh đó (máy dùng chung)', async () => {
    const sent: string[] = [];
    const item = (userId: string, clientId: string) => ({ userId, queuedAt: Date.now(), payload: { appId: 'doc-hieu', clientId } });
    const t = boot({ session: live('u1'), queue: [item('u2', 'cua-ban-khac'), item('u1', 'cua-minh-1'), item('u1', 'cua-minh-2')], fetch: (_u, init) => { sent.push(JSON.parse(init.body).p.clientId); return Promise.resolve(okRes('ok')); } });
    await t.sdk.flush(); // init() đã tự flush; gọi lại để chờ xong
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.sort()).toEqual(['cua-minh-1', 'cua-minh-2']);
    expect(t.queue().map((q) => q.payload.clientId)).toEqual(['cua-ban-khac']);
    expect(t.sdk.pendingCount()).toBe(0);
  });
});
