/** Cầu nối với app ngoài — hàm thuần (kiểm thử: __tests__/connect.test.ts). */
import type { ExternalActivity } from './types';

export const APP_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** Trùng với ràng buộc CSDL: https bất kì, hoặc http chỉ cho localhost / 127.0.0.1. */
const ORIGIN_RE = /^(https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?|http:\/\/(localhost|127\.0\.0\.1))(:[0-9]{1,5})?$/;
export const MAX_ORIGINS = 20;

/**
 * Chuẩn hóa một origin người dùng gõ: bỏ khoảng trắng, chữ thường, bỏ dấu '/' cuối. Trả null nếu không phải origin hợp lệ
 * (có đường dẫn, có '*', http ngoài localhost, file://…).
 */
export function normalizeOrigin(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\/+$/, '');
  if (!ORIGIN_RE.test(s)) return null;
  try {
    // URL bỏ cổng mặc định (443/80) — giống giá trị location.origin của trình duyệt.
    const u = new URL(s);
    if (u.origin !== s && u.origin !== s.replace(/:(443|80)$/, '')) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Tách ô nhập nhiều origin (mỗi dòng / cách nhau bằng dấu phẩy, khoảng trắng). */
export function parseOrigins(text: string): { origins: string[]; invalid: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) continue;
    const o = normalizeOrigin(raw);
    if (!o) invalid.push(raw);
    else if (origins.indexOf(o) < 0) origins.push(o);
  }
  return { origins, invalid };
}

/** So khớp CHÍNH XÁC (không wildcard, không so tiền tố). */
export function isAllowedOrigin(origin: string | null | undefined, allowed: readonly string[]): boolean {
  if (!origin || origin === 'null' || origin === '*') return false;
  return allowed.indexOf(origin) >= 0;
}

export interface ConnectRequest { appId: string; origin: string; state: string }
/** Đọc ?app=&origin=&state= của trang /ket-noi. Trả null nếu thiếu / sai dạng. */
export function parseConnectRequest(search: string): ConnectRequest | null {
  const q = new URLSearchParams(search);
  const appId = q.get('app') ?? '';
  const origin = q.get('origin') ?? '';
  const state = q.get('state') ?? '';
  if (!APP_ID_RE.test(appId) || !/^[A-Za-z0-9_-]{8,128}$/.test(state)) return null;
  if (normalizeOrigin(origin) !== origin) return null;
  return { appId, origin, state };
}

/** Tỉ lệ đúng 0..1 của một hoạt động (ưu tiên điểm/điểm tối đa, rồi số câu đúng/tổng); null nếu không tính được. */
export function activityRatio(a: Pick<ExternalActivity, 'score' | 'maxScore' | 'correct' | 'total'>): number | null {
  if (a.score != null && a.maxScore != null && a.maxScore > 0) return Math.min(1, Math.max(0, a.score / a.maxScore));
  if (a.correct != null && a.total != null && a.total > 0) return Math.min(1, Math.max(0, a.correct / a.total));
  return null;
}

export interface ExternalAppSummary {
  appId: string;
  appName: string;
  count: number;
  /** Trung bình % đúng (0–100) của các lượt tính được; null nếu không có. */
  avgPercent: number | null;
  totalSec: number;
  lastAt: string;
}
/** Tóm tắt theo từng app, app dùng gần nhất trước. */
export function summarizeExternal(list: readonly ExternalActivity[]): ExternalAppSummary[] {
  const by = new Map<string, { s: ExternalAppSummary; sum: number; n: number }>();
  for (const a of list) {
    let e = by.get(a.appId);
    if (!e) by.set(a.appId, (e = { s: { appId: a.appId, appName: a.appName, count: 0, avgPercent: null, totalSec: 0, lastAt: a.at }, sum: 0, n: 0 }));
    e.s.count += 1;
    e.s.totalSec += a.durationSec ?? 0;
    if (a.at > e.s.lastAt) e.s.lastAt = a.at;
    const r = activityRatio(a);
    if (r != null) { e.sum += r; e.n += 1; }
  }
  return [...by.values()]
    .map((e) => ({ ...e.s, avgPercent: e.n ? Math.round((e.sum / e.n) * 100) : null }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

/** Đoạn mã dán vào app ngoài (trang quản trị hiển thị). */
export function buildConnectSnippet(learnerUrl: string, appId: string): string {
  const base = learnerUrl.replace(/\/+$/, '');
  return [
    `<script src="${base}/openedu-connect.js"></script>`,
    '<script>',
    `  OpenEdu.init({ learnerUrl: '${base}', appId: '${appId}' });`,
    '',
    '  // Gọi khi học sinh bấm nút "Đăng nhập bằng OPEN-EDU"',
    '  // (phải gọi ngay trong sự kiện bấm, nếu không trình duyệt chặn cửa sổ)',
    '  function dangNhap() {',
    '    OpenEdu.signIn().then(function (user) {',
    "      console.log('Xin chào', user.name, user.className);",
    '    }).catch(function (err) { alert(err.message); });',
    '  }',
    '',
    '  // Gọi khi học sinh làm xong một bài',
    '  function luuKetQua() {',
    '    OpenEdu.record({',
    "      activityId: 'bai-1', title: 'Tên bài đọc', kind: 'reading',",
    '      correct: 4, total: 5, durationSec: 180',
    '    });',
    '  }',
    '</script>',
  ].join('\n');
}
