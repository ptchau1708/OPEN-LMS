/**
 * Đăng nhập chung (docs/DANG_NHAP_CHUNG.md): mọi người đăng nhập ở MỘT địa chỉ (app học sinh). Tài khoản giáo viên /
 * quản trị được chuyển sang app giáo viên KÈM PHIÊN (không phải gõ lại mật khẩu); HS / phụ huynh lỡ đăng nhập ở app
 * giáo viên thì được chuyển về app học sinh.
 *
 * Phiên đi theo phần # của địa chỉ (trình duyệt không gửi phần này lên máy chủ nào). App nhận đọc xong xóa ngay khỏi
 * thanh địa chỉ và lịch sử. App chuyển đi BỎ phiên của mình (không thu hồi trên máy chủ) — hai app không giữ chung một
 * refresh token (Supabase xoay vòng token; dùng lại token cũ sẽ bị coi là đánh cắp và thu hồi cả phiên).
 */
import type { DataSource } from '@openedu/contracts';
import { getDataSource } from './getDataSource';
import { unpackSession } from './sessionPack';

export { packSession, unpackSession, type PackedSession } from './sessionPack';

export const HANDOFF_KEY = 'oe_s';

/** Địa chỉ đích: <base><path>#oe_s=<phiên>. base không hợp lệ → null. */
export function handoffUrl(base: string, path = '/', packed: string | null = null): string | null {
  try {
    const u = new URL(path, base.replace(/\/+$/, '') + '/');
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = packed ? `${HANDOFF_KEY}=${packed}` : '';
    return u.toString();
  } catch {
    return null;
  }
}

/** Lấy chuỗi phiên từ phần # của địa chỉ (hoặc null). */
export function readHandoffHash(hash: string): string | null {
  const h = hash.replace(/^#/, '');
  if (!h) return null;
  const v = new URLSearchParams(h).get(HANDOFF_KEY);
  return v && unpackSession(v) ? v : null;
}

/** Chuyển sang app khác kèm phiên. Không chuyển được phiên (demo cũ, lỗi mạng…) thì vẫn chuyển — app đích hỏi đăng nhập. */
export async function handoffTo(base: string, path = '/', ds: DataSource = getDataSource()): Promise<void> {
  let packed: string | null = null;
  try {
    packed = (await ds.exportSession?.()) ?? null;
  } catch {
    packed = null;
  }
  const url = handoffUrl(base, path, packed) ?? handoffUrl(base, '/', packed);
  if (url) window.location.replace(url);
}

/** Gọi MỘT lần lúc app khởi động (trước khi vẽ): nhận phiên trong phần # nếu có. */
export async function consumeHandoff(ds: DataSource = getDataSource()): Promise<boolean> {
  if (typeof location === 'undefined') return false;
  const packed = readHandoffHash(location.hash);
  if (!packed) return false;
  // Xóa khỏi thanh địa chỉ + lịch sử trước khi làm gì khác.
  history.replaceState(history.state, '', location.pathname + location.search);
  try {
    return !!(await ds.importSession?.(packed));
  } catch {
    return false;
  }
}
