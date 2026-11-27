/** Mã liên kết phụ huynh: sinh, chuẩn hoá, trạng thái, kiểm tra khi dùng (thuần, có kiểm thử). */
import {
  GUARDIAN_CODE_ALPHABET,
  GUARDIAN_CODE_LENGTH,
  GUARDIAN_CODE_TTL_DAYS,
  MAX_GUARDIANS_PER_CHILD,
  type GuardianCode,
  type GuardianCodeStatus,
} from '@openedu/contracts';

const DAY = 86_400_000;

/** Số ngẫu nhiên 0..1: mặc định crypto (nếu có), tiêm được khi kiểm thử. */
export type Rand = () => number;
export function secureRandom(): number {
  try {
    const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
    if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] / 4_294_967_296;
  } catch {
    /* không có crypto */
  }
  return Math.random();
}

export function generateGuardianCode(rand: Rand = secureRandom): string {
  let s = '';
  for (let i = 0; i < GUARDIAN_CODE_LENGTH; i++) s += GUARDIAN_CODE_ALPHABET[Math.floor(rand() * GUARDIAN_CODE_ALPHABET.length) % GUARDIAN_CODE_ALPHABET.length];
  return s;
}

/** "abcd-efgh " → "ABCDEFGH" (viết hoa, bỏ dấu cách / gạch nối). */
export function normalizeCode(input: string): string {
  return (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isWellFormedCode(code: string): boolean {
  const c = normalizeCode(code);
  return c.length === GUARDIAN_CODE_LENGTH && [...c].every((ch) => GUARDIAN_CODE_ALPHABET.includes(ch));
}

/** "ABCDEFGH" → "ABCD-EFGH" (để in). */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export function codeExpiry(createdAt: Date): string {
  return new Date(createdAt.getTime() + GUARDIAN_CODE_TTL_DAYS * DAY).toISOString();
}

export function codeStatus(c: GuardianCode, now: Date): GuardianCodeStatus {
  if (c.revokedAt) return 'revoked';
  if (c.usedAt) return 'used';
  if (Date.parse(c.expiresAt) <= now.getTime()) return 'expired';
  return 'active';
}

export type RedeemCheck = { ok: true } | { ok: false; reason: string };

/** Kiểm tra một lần dùng mã. `guardians`: số phụ huynh đã liên kết với HS; `alreadyLinked`: người gọi đã liên kết. */
export function checkRedeem(code: GuardianCode | undefined, now: Date, ctx: { guardians: number; alreadyLinked: boolean }): RedeemCheck {
  if (!code) return { ok: false, reason: 'Mã chưa đúng. Bố mẹ kiểm tra lại 8 kí tự trên phiếu nhé.' };
  const st = codeStatus(code, now);
  if (st === 'revoked') return { ok: false, reason: 'Mã này đã được thầy/cô thu hồi. Xin nhờ thầy/cô in mã mới.' };
  if (st === 'used') return { ok: false, reason: 'Mã này đã được dùng. Mỗi mã chỉ dùng một lần — xin nhờ thầy/cô cấp mã mới.' };
  if (st === 'expired') return { ok: false, reason: 'Mã đã hết hạn (14 ngày). Xin nhờ thầy/cô cấp mã mới.' };
  if (ctx.alreadyLinked) return { ok: true };
  if (ctx.guardians >= MAX_GUARDIANS_PER_CHILD) return { ok: false, reason: `Con đã có đủ ${MAX_GUARDIANS_PER_CHILD} tài khoản phụ huynh. Xin liên hệ thầy/cô để gỡ bớt.` };
  return { ok: true };
}

/** Che bớt email / số điện thoại cho GV xem: "me.lan@gmail.com" → "me***@gmail.com", "0912345678" → "0912***678". */
export function maskLogin(login?: string): string | undefined {
  if (!login) return undefined;
  const at = login.indexOf('@');
  if (at > 0) {
    const [u, d] = [login.slice(0, at), login.slice(at + 1)];
    if (d.startsWith('parent.')) return maskLogin(u);
    return `${u.slice(0, 2)}***@${d}`;
  }
  return login.length > 7 ? `${login.slice(0, 4)}***${login.slice(-3)}` : `${login.slice(0, 2)}***`;
}
