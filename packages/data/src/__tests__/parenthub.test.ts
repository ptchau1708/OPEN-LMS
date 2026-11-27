import { beforeEach, describe, expect, it } from 'vitest';
import { defaultShareModes, SHARE_KINDS } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import { DemoSchoolSource, setSchoolSource } from '../school';
import { getNotify, getParentHub, parentHubError } from '..';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
};

async function login(username: string) {
  const ds = new DemoDataSource({ storage: new MemoryStorage(), relayUrl: 'ws://127.0.0.1:1' });
  await ds.signIn(username, '123456');
  setSchoolSource(ds, new DemoSchoolSource(ds));
  return ds;
}

describe('Phụ huynh — danh mục và mặc định', () => {
  it('mặc định: nhắc nhở thầy/cô duyệt, còn lại tự động; mục theo ngày mới có chế độ duyệt', () => {
    const d = defaultShareModes();
    expect(d.reminders).toBe('review');
    expect(Object.entries(d).filter(([k]) => k !== 'reminders').every(([, m]) => m === 'auto')).toBe(true);
    expect(SHARE_KINDS.filter((k) => k.modes.includes('review')).map((k) => k.kind).sort()).toEqual(['attendance', 'praise', 'reminders', 'tt27', 'works']);
  });
  it('lỗi thiếu SQL 23 → hướng dẫn chạy tệp', () => {
    expect(parentHubError({ code: 'PGRST202', message: 'Could not find the function v2.parent_inbox' }, 'x').message).toMatch(/SQL 23/);
    expect(parentHubError({ message: 'Lớp đang tắt nhắn tin với thầy/cô.' }, 'x').message).toBe('Lớp đang tắt nhắn tin với thầy/cô.');
  });
});

describe('Phụ huynh — bản demo', () => {
  beforeEach(() => mem.clear());

  it('GV: lưu cài đặt, gửi thông báo, xem đã đọc / xác nhận', async () => {
    const ds = await login('cothu');
    const hub = getParentHub(ds);
    const s = await hub.saveSettings('c-4a', { modes: { ...defaultShareModes(), study: 'off' }, msgFrom: '07:00', msgTo: '20:00' });
    expect(s.modes.study).toBe('off');
    expect(s.msgFrom).toBe('07:00');
    await expect(hub.saveSettings('c-4a', { msgFrom: '20:00', msgTo: '07:00' })).rejects.toThrow(/trước giờ kết thúc/);
    const p = await hub.createPost({ classId: 'c-4a', audience: 'class', title: 'Họp phụ huynh', body: 'Thứ Bảy 8:00', ackRequired: true });
    expect(p.sent).toBe(true);
    const list = await hub.listPosts('c-4a');
    expect(list[0]!.title).toBe('Họp phụ huynh');
    const d = await hub.postDetail(p.id);
    expect(d.students!.length).toBeGreaterThan(0);
    expect((await hub.recallPost(p.id)).recalled).toBe(true);
    await expect(hub.createPost({ classId: 'c-4a', audience: 'students', studentIds: [], title: 'x', body: '', ackRequired: false })).rejects.toThrow(/ít nhất một em/);
  });

  it('GV: hàng chờ duyệt có nhắc nhở; gửi xong hàng chờ trống', async () => {
    const ds = await login('cothu');
    const hub = getParentHub(ds);
    const q = await hub.queue('c-4a');
    expect(q.every((i) => i.kind === 'reminders')).toBe(true);
    if (q.length) {
      expect(await hub.release([{ kind: q[0]!.kind, refId: q[0]!.refId }], 'sent', 'Nhờ bố mẹ nhắc con')).toBe(1);
      expect((await hub.queue('c-4a')).some((i) => i.refId === q[0]!.refId)).toBe(false);
    }
  });

  it('PH: hộp thư có thông báo mẫu, xác nhận, nhắn thầy/cô', async () => {
    const ds = await login('phuhuynh4a');
    const hub = getParentHub(ds);
    const box = await hub.inbox('u-lan4a2');
    expect(box.posts.some((p) => p.title === 'Họp phụ huynh cuối học kì I')).toBe(true);
    const r = await hub.readPost('ph-demo-1', true);
    expect(r.ackedAt).toBeTruthy();
    const m = await hub.send('u-lan4a2', 'Dạ, gia đình sẽ dự họp ạ.');
    expect(m.mine).toBe(true);
    const t = await hub.thread('u-lan4a2');
    expect(t.messages.at(-1)!.body).toBe('Dạ, gia đình sẽ dự họp ạ.');
    await expect(hub.inbox('u-an2a1')).rejects.toThrow(/liên kết/);
  });

  it('Chuông: tin mẫu theo vai trò, đánh dấu đã đọc, cài đặt giờ yên lặng', async () => {
    const ds = await login('cothu');
    const n = getNotify(ds);
    const l = await n.list();
    expect(l.unread).toBeGreaterThan(0);
    expect(l.items.some((x) => x.kind === 'gv-tin-nhan')).toBe(true);
    await n.read();
    expect((await n.list()).unread).toBe(0);
    await n.test();
    expect((await n.list()).unread).toBe(1);
    expect((await n.savePrefs({ quietFrom: null, quietTo: null, pushOff: ['gv-nop-bai'] })).pushOff).toEqual(['gv-nop-bai']);
    expect((await n.pushInfo()).ready).toBe(false);
    await expect(n.subscribe({ endpoint: 'https://x', p256dh: 'a', auth: 'b' }, 'gv')).rejects.toThrow(/demo/);
  });
});
