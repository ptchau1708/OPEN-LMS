import { EMBED_FRAME_ORIGINS_DEFAULT } from './defaults';

/** Origin của một địa chỉ bất kì người dùng dán vào (bỏ đường dẫn); null nếu không hợp lệ. Chỉ https (hoặc localhost). */
export function siteOrigin(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  if (u.protocol === 'https:' && /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(u.hostname) && u.hostname.includes('.')) return u.origin.toLowerCase();
  if (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return u.origin.toLowerCase();
  return null;
}

/** Địa chỉ trang học (link) có thuộc danh sách được phép không. */
export function isEmbeddable(url: string, origins: readonly string[]): boolean {
  const o = siteOrigin(url);
  if (!o) return false;
  try { new URL(url); } catch { return false; }
  return origins.includes(o);
}

export { EMBED_FRAME_ORIGINS_DEFAULT };
