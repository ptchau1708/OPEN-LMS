/**
 * Link trong thư Supabase (đặt lại mật khẩu) — docs/MAT_KHAU.md.
 * Gọi MỘT lần ở main.tsx TRƯỚC khi tạo Supabase client:
 * - link khôi phục (#…type=recovery) mở ở trang khác (vd Site URL "/") → chuyển về /dat-lai-mat-khau, giữ nguyên phần #
 *   để supabase-js đọc phiên khôi phục;
 * - link hỏng / hết hạn (#error_code=…) → nhớ lại để trang /dat-lai-mat-khau báo rõ.
 */
const KEY = 'oe_auth_link_error';

export function captureAuthLink(): void {
  if (typeof location === 'undefined') return;
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  const q = new URLSearchParams(h);
  if (q.get('error_code') || q.get('error')) {
    try { sessionStorage.setItem(KEY, q.get('error_description') ?? q.get('error_code') ?? 'error'); } catch { /* bỏ qua */ }
    history.replaceState(history.state, '', location.pathname + location.search);
    return;
  }
  if (q.get('type') === 'recovery' && location.pathname !== '/dat-lai-mat-khau') {
    history.replaceState(history.state, '', `/dat-lai-mat-khau${location.hash}`);
  }
}

/** Đọc rồi xóa lỗi link (nếu có). */
export function takeAuthLinkError(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
