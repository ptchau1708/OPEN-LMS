/** Thông báo bản demo: lưu trên trình duyệt, mỗi người một danh sách, có vài tin mẫu theo vai trò. */
import type { AppNotification, NotifyPrefs, Profile } from '@openedu/contracts';
import { DEFAULT_NOTIFY_PREFS } from '@openedu/contracts';

interface Store { items: Record<string, AppNotification[]>; prefs: Record<string, NotifyPrefs>; seeded: Record<string, true>; next: number }
const KEY = 'oe.notify.demo.v1';
const listeners = new Set<() => void>();

function read(): Store {
  try {
    const s = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Store | null;
    if (s && typeof s === 'object') return { items: s.items ?? {}, prefs: s.prefs ?? {}, seeded: s.seeded ?? {}, next: s.next ?? 1 };
  } catch { /* làm lại */ }
  return { items: {}, prefs: {}, seeded: {}, next: 1 };
}
function write(s: Store) {
  globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  listeners.forEach((f) => f());
}

function seedFor(u: Profile): Omit<AppNotification, 'id'>[] {
  const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const n = (kind: string, title: string, body: string, link: string, h: number, ref: Record<string, unknown> = {}) => ({ kind, title, body, link, ref, count: 1, at: at(h), readAt: null });
  if (u.role === 'teacher' || u.role === 'admin') {
    return [
      n('gv-tin-nhan', 'Bố bạn Ngọc Lan (phụ huynh Ngọc Lan)', 'Chào cô, sáng mai cháu Lan đi khám răng nên xin vào lớp muộn một tiết ạ.', '/phu-huynh?the=tin-nhan&em=u-lan4a2', 20, { studentId: 'u-lan4a2' }),
      n('gv-nop-bai', '3 bài mới cần chấm: Tả cây bàng', 'Minh Hải vừa nộp bài.', '/cham-bai', 26),
      n('gv-lien-ket', '1 phụ huynh mới liên kết', 'Bố bạn Ngọc Lan (Bố) của Ngọc Lan', '/phu-huynh?the=lien-ket', 48),
    ];
  }
  if (u.role === 'parent') {
    return [
      n('ph-thong-bao', 'Cô Thu: Họp phụ huynh cuối học kì I', 'Kính mời quý phụ huynh dự họp lúc 8:00 sáng thứ Bảy tuần sau.', '/phu-huynh?tin=ph-demo-1', 26, { postId: 'ph-demo-1' }),
      n('ph-khen', 'Con được cô khen: Chú ý nghe giảng', '', '/phu-huynh', 30),
      n('ph-ban-tin', 'Bản tin tuần của con đã có', 'Xem con học thế nào trong tuần.', '/phu-huynh', 70),
    ];
  }
  return [
    n('hs-bai-moi', 'Bài mới: Ôn tập cuối tuần', 'Hạn: 20:00 Chủ nhật', '/', 3),
    n('hs-khen', 'Em được cô khen: Chú ý nghe giảng', '+1 điểm thi đua', '/toi', 26),
  ];
}

export const demoNotify = {
  subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
  list(u: Profile): AppNotification[] {
    const s = read();
    if (!s.seeded[u.id]) {
      s.seeded[u.id] = true;
      s.items[u.id] = [...seedFor(u).map((x) => ({ ...x, id: s.next++ })), ...(s.items[u.id] ?? [])];
      write(s);
    }
    return [...(s.items[u.id] ?? [])].sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
  },
  add(userIds: string[], x: Omit<AppNotification, 'id' | 'at' | 'readAt' | 'count'>) {
    const s = read();
    for (const id of userIds) (s.items[id] ??= []).push({ ...x, id: s.next++, at: new Date().toISOString(), readAt: null, count: 1 });
    write(s);
  },
  read(userId: string, ids?: number[]): number {
    const s = read();
    let n = 0;
    for (const it of s.items[userId] ?? []) if (!it.readAt && (!ids || ids.includes(it.id))) { it.readAt = new Date().toISOString(); n++; }
    write(s);
    return n;
  },
  markRef(userId: string, key: string, value: string) {
    const s = read();
    for (const it of s.items[userId] ?? []) if (!it.readAt && it.ref?.[key] === value) it.readAt = new Date().toISOString();
    write(s);
  },
  prefs(userId: string): NotifyPrefs { return { ...DEFAULT_NOTIFY_PREFS, ...(read().prefs[userId] ?? {}), devices: 0 }; },
  savePrefs(userId: string, p: Partial<NotifyPrefs>): NotifyPrefs {
    const s = read();
    s.prefs[userId] = { ...this.prefs(userId), ...p, devices: 0 };
    write(s);
    return s.prefs[userId]!;
  },
};
