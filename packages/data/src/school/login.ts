/** Tên đăng nhập phụ huynh: email hoặc số điện thoại Việt Nam (thuần). */
export type ParentLogin = { ok: true; username: string; kind: 'email' | 'phone' } | { ok: false; reason: string };

/** "0912 345 678" / "+84 912 345 678" → "0912345678"; email → chữ thường. */
export function normalizeParentLogin(input: string): ParentLogin {
  const v = (input ?? '').trim();
  if (!v) return { ok: false, reason: 'Bố mẹ nhập email hoặc số điện thoại nhé.' };
  if (v.includes('@')) {
    const e = v.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? { ok: true, username: e, kind: 'email' } : { ok: false, reason: 'Email chưa đúng dạng (ví dụ: me.lan@gmail.com).' };
  }
  let d = v.replace(/[\s.\-()]/g, '');
  if (d.startsWith('+84')) d = `0${d.slice(3)}`;
  else if (d.startsWith('84') && d.length === 11) d = `0${d.slice(2)}`;
  return /^0\d{9}$/.test(d) ? { ok: true, username: d, kind: 'phone' } : { ok: false, reason: 'Số điện thoại cần 10 chữ số, bắt đầu bằng 0.' };
}

/** Supabase Auth cần email: số điện thoại → "<số>@parent.<miền>" (không gửi thư tới địa chỉ này). */
export function parentLoginEmail(username: string, domain = 'openlms.edu'): string {
  return username.includes('@') ? username : `${username}@parent.${domain}`;
}
