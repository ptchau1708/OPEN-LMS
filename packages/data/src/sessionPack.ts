/** Đóng gói phiên cho đăng nhập chung (handoff.ts). Thuần, không phụ thuộc. */
export interface PackedSession {
  v: 1;
  /** Supabase: access token + refresh token. */
  a?: string;
  r?: string;
  /** Demo: mã người dùng. */
  d?: string;
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function packSession(p: Omit<PackedSession, 'v'>): string {
  return b64urlEncode(JSON.stringify({ v: 1, ...p }));
}

export function unpackSession(s: string): PackedSession | null {
  if (!s || s.length > 16_000 || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const o = JSON.parse(b64urlDecode(s)) as Record<string, unknown>;
    if (!o || o.v !== 1) return null;
    const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
    const out: PackedSession = { v: 1, a: str(o.a), r: str(o.r), d: str(o.d) };
    if (!(out.a && out.r) && !out.d) return null;
    return out;
  } catch {
    return null;
  }
}

