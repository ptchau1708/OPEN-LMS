import { contentOrigin as dataContentOrigin } from '@openedu/data';

function env(name: string): string | undefined {
  const v = (import.meta.env as Record<string, unknown>)[name];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function host(): string {
  return typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
}
/** Link mở màn hình lớp (TV) cho phiên — kèm mã lớp để TV xem được khi chưa đăng nhập (SQL 21). */
export function presentUrl(sessionId: string, pin?: string): string {
  const base = env('VITE_PRESENT_URL') ?? `http://${host()}:5175/`;
  try {
    const u = new URL(base);
    u.searchParams.set('s', sessionId);
    if (pin) u.searchParams.set('p', pin);
    return u.toString();
  } catch {
    return `${base}?s=${encodeURIComponent(sessionId)}${pin ? `&p=${encodeURIComponent(pin)}` : ''}`;
  }
}
/** Địa chỉ app học sinh — cũng là trang đăng nhập chung. */
export function learnerBase(): string {
  return (env('VITE_LEARNER_URL') ?? `http://${host()}:5173`).replace(/\/+$/, '');
}
/** Link học sinh vào lớp bằng mã PIN (cho mã QR). */
export function learnerUrl(pin: string): string {
  const base = (env('VITE_LEARNER_URL') ?? `http://${host()}:5173`).replace(/\/+$/, '');
  return `${base}/lop?pin=${encodeURIComponent(pin)}`;
}
export function contentOrigin(): string {
  return dataContentOrigin();
}
