/** Luật thuần cho hàng đợi offline: lùi dần, phân loại lỗi, kiểm tra thời điểm trả lời. Bản server: supabase/functions/_shared/offline.ts. */
import type { ErrorClass } from './types';

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** Lỗi không rõ / tạm thời: thử tối đa chừng này lần rồi đánh dấu 'failed'. */
export const MAX_ATTEMPTS = 8;
/** Câu trả lời cũ hơn mức này server từ chối. */
export const MAX_ANSWER_AGE_MS = 14 * 86_400_000;
/** Lệch đồng hồ cho phép (máy HS chạy nhanh). */
export const CLOCK_SKEW_MS = 5 * 60_000;

/** Lùi dần có nhiễu: min(max, base·2^(n−1)) · [0.5, 1). */
export function backoffMs(attempts: number, rand: () => number = Math.random): number {
  const n = Math.max(1, attempts);
  const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(20, n - 1));
  return Math.round(cap * (0.5 + rand() * 0.5));
}

export type Plausibility = 'ok' | 'future' | 'stale' | 'invalid';

/** Thời điểm trả lời có hợp lý không (server dùng cùng luật). */
export function checkAnsweredAt(at: string | undefined, nowMs: number): Plausibility {
  if (!at) return 'ok';
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return 'invalid';
  if (t > nowMs + CLOCK_SKEW_MS) return 'future';
  if (t < nowMs - MAX_ANSWER_AGE_MS) return 'stale';
  return 'ok';
}

/** Thời điểm dùng để ghi: 'future' kẹp về hiện tại; còn lại giữ nguyên. */
export function clampAnsweredAt(at: string | undefined, nowMs: number): string {
  const p = checkAnsweredAt(at, nowMs);
  return p === 'ok' && at ? new Date(Date.parse(at)).toISOString() : new Date(nowMs).toISOString();
}

/** Lỗi khi máy không có mạng (wrapper tự ném khi offline mà chưa có bản lưu). */
export class OfflineError extends Error {
  readonly offline = true;
  constructor(message = 'Em đang không có mạng. Bài này chưa được tải về máy.') {
    super(message);
    this.name = 'OfflineError';
  }
}

const NET_RE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|timed? ?out|aborted|offline/i;

function fields(e: unknown): { name: string; message: string; status?: number; code?: string } {
  const o = (e && typeof e === 'object' ? e : {}) as { name?: unknown; message?: unknown; status?: unknown; code?: unknown; context?: { status?: unknown } };
  const status = typeof o.status === 'number' ? o.status : typeof o.context?.status === 'number' ? o.context.status : undefined;
  return { name: String(o.name ?? ''), message: String(o.message ?? e ?? ''), status, code: typeof o.code === 'string' ? o.code : undefined };
}

/**
 * network: mất mạng → dừng đồng bộ, thử lại sau. transient: 5xx/429/không rõ → lùi dần.
 * permanent: server từ chối (4xx, câu quá cũ…) → bỏ qua, không chặn hàng đợi.
 */
export function classifyError(e: unknown): ErrorClass {
  for (let cur: unknown = e, depth = 0; cur && depth < 4; depth++) {
    const f = fields(cur);
    if ((cur as { offline?: unknown }).offline === true) return 'network';
    if (/FunctionsFetchError|FunctionsRelayError|AbortError|TimeoutError/.test(f.name)) return 'network';
    if (f.name === 'TypeError' && NET_RE.test(f.message)) return 'network';
    if (typeof f.status === 'number') {
      if (f.status === 0) return 'network';
      if (f.status === 408 || f.status === 429 || f.status >= 500) return 'transient';
      if (f.status >= 400) return 'permanent';
    }
    if (f.code && /^(22|23|42|P0)/.test(f.code)) return 'permanent';
    if (NET_RE.test(f.message)) return 'network';
    if (/stale_answer|invalid_time|quá cũ/i.test(f.message)) return 'permanent';
    cur = (cur as { cause?: unknown }).cause;
  }
  return 'transient';
}

/** Mã ngẫu nhiên dạng UUID v4 (crypto.randomUUID nếu có — Safari 14 chưa có). */
export function newClientId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
