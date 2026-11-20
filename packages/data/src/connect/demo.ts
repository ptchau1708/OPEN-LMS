/**
 * Cầu nối với app ngoài — bản demo: sổ đăng kí + vài dòng mẫu trong localStorage (khóa `connect`).
 * Lưu ý: app học sinh và app giáo viên demo chạy ở hai origin khác nhau nên KHÔNG chung localStorage —
 * vì vậy app mẫu `doc-hieu-mau` luôn có sẵn ở cả hai. Demo không có máy chủ: không trao token, không ghi kết quả.
 */
import { createDefaultStorage, readJson, writeJson, type KVStorage } from '../storage';
import { APP_ID_RE, MAX_ORIGINS, normalizeOrigin } from './rules';
import type { ConnectSource, ExternalActivity, ExternalApp, ExternalAppInput, ExternalAppPublic } from './types';

const KEY = 'connect';
const MIN = 60_000;
const DAY = 86_400_000;

interface Store { stamp: string; apps: ExternalApp[]; activities: ExternalActivity[] }

export const DEMO_CONNECT_APP_ID = 'doc-hieu-mau';
/** Các origin thử nghiệm của trang mẫu examples/connect/doc-hieu-mau.html. */
export const DEMO_CONNECT_ORIGINS = ['http://localhost:3000', 'http://localhost:4713', 'http://127.0.0.1:4713', 'http://localhost:8080'];

function seed(now: Date, stamp: string): Store {
  const t = now.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();
  const apps: ExternalApp[] = [
    { id: DEMO_CONNECT_APP_ID, name: 'Đọc hiểu vui', description: 'Trang đọc hiểu mẫu (examples/connect/doc-hieu-mau.html).', allowedOrigins: [...DEMO_CONNECT_ORIGINS], enabled: true, createdAt: iso(t - 20 * DAY) },
    { id: 'luyen-chu', name: 'Luyện chữ đẹp', description: 'Tệp HTML luyện viết của tổ Tiếng Việt.', allowedOrigins: ['https://luyenchu.truong.edu.vn'], enabled: true, createdAt: iso(t - 9 * DAY) },
  ];
  const row = (n: number, userId: string, appId: string, appName: string, title: string, kind: string, correct: number, total: number, sec: number, ago: number): ExternalActivity => ({
    id: `ext-demo-${n}`, userId, appId, appName, activityId: `bai-${n}`, title, kind,
    score: Math.round((correct / total) * 100) / 10, maxScore: 10, correct, total, durationSec: sec, completed: true, detail: {}, skills: [], at: iso(t - ago),
  });
  const activities = [
    row(1, 'u-an2a1', DEMO_CONNECT_APP_ID, 'Đọc hiểu vui', 'Chú sẻ nhỏ và bông hoa bằng lăng', 'reading', 3, 3, 240, 3 * 60 * MIN),
    row(2, 'u-an2a1', DEMO_CONNECT_APP_ID, 'Đọc hiểu vui', 'Cây xoài của ông em', 'reading', 4, 5, 310, DAY + 2 * 60 * MIN),
    row(3, 'u-an2a1', DEMO_CONNECT_APP_ID, 'Đọc hiểu vui', 'Mùa thu của em', 'reading', 2, 5, 420, 3 * DAY),
    row(4, 'u-an2a1', 'luyen-chu', 'Luyện chữ đẹp', 'Viết chữ hoa A, Ă, Â', 'writing', 7, 10, 600, 2 * DAY),
    row(5, 'u-binh2a2', DEMO_CONNECT_APP_ID, 'Đọc hiểu vui', 'Chú sẻ nhỏ và bông hoa bằng lăng', 'reading', 2, 3, 280, 5 * 60 * MIN),
    row(6, 'u-binh2a2', DEMO_CONNECT_APP_ID, 'Đọc hiểu vui', 'Cây xoài của ông em', 'reading', 5, 5, 200, 4 * DAY),
  ];
  return { stamp, apps, activities };
}

export class DemoConnectSource implements ConnectSource {
  constructor(private storage: KVStorage = createDefaultStorage(), private now: () => Date = () => new Date()) {}

  private load(): Store {
    // Bộ dữ liệu mẫu được nạp lại (resetDemo) → làm mới theo.
    const stamp = readJson<{ seededAt?: string } | null>(this.storage, 'meta', null)?.seededAt ?? '';
    const cur = readJson<Store | null>(this.storage, KEY, null);
    if (cur && cur.stamp === stamp && Array.isArray(cur.apps)) return cur;
    const s = seed(this.now(), stamp);
    writeJson(this.storage, KEY, s);
    return s;
  }

  async listApps(): Promise<ExternalApp[]> {
    return this.load().apps.map((a) => ({ ...a, allowedOrigins: [...a.allowedOrigins] }));
  }
  async saveApp(i: ExternalAppInput, isNew: boolean): Promise<void> {
    const s = this.load();
    if (!APP_ID_RE.test(i.id)) throw new Error('Mã ứng dụng chỉ gồm chữ thường, số và gạch nối (2–40 kí tự).');
    if (!i.name.trim()) throw new Error('Hãy nhập tên ứng dụng.');
    if (i.allowedOrigins.length > MAX_ORIGINS || i.allowedOrigins.some((o) => normalizeOrigin(o) !== o)) throw new Error('Địa chỉ (origin) chưa đúng dạng.');
    const at = s.apps.findIndex((a) => a.id === i.id);
    if (isNew) {
      if (at >= 0) throw new Error('Mã ứng dụng này đã có. Hãy chọn mã khác.');
      s.apps.push({ ...i, name: i.name.trim(), description: i.description.trim(), createdAt: this.now().toISOString() });
    } else {
      const old = s.apps[at];
      if (!old) throw new Error('Không tìm thấy ứng dụng.');
      s.apps[at] = { ...old, ...i, name: i.name.trim(), description: i.description.trim() };
      for (const a of s.activities) if (a.appId === i.id) a.appName = i.name.trim();
    }
    writeJson(this.storage, KEY, s);
  }
  async deleteApp(id: string): Promise<void> {
    const s = this.load();
    if (s.activities.some((a) => a.appId === id)) throw new Error('Ứng dụng này đã có dữ liệu của học sinh nên không xóa được. Hãy tắt nó đi.');
    s.apps = s.apps.filter((a) => a.id !== id);
    writeJson(this.storage, KEY, s);
  }
  async getApp(id: string): Promise<ExternalAppPublic | null> {
    const a = this.load().apps.find((x) => x.id === id && x.enabled);
    return a ? { id: a.id, name: a.name, allowedOrigins: [...a.allowedOrigins] } : null;
  }
  async listActivities(userId: string, limit = 50): Promise<ExternalActivity[]> {
    return this.load().activities.filter((a) => a.userId === userId).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
  }
  async getAccess(): Promise<null> {
    return null;
  }
}
