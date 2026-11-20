/**
 * Luật thời điểm cho câu trả lời đồng bộ muộn từ hàng đợi offline — CHÉP từ packages/data/src/offline/policy.ts
 * (kiểm thử ở packages/data/src/__tests__/offline.test.ts). Sửa ở đây thì sửa cả bên đó.
 */
export const MAX_ANSWER_AGE_MS = 14 * 86_400_000;
export const CLOCK_SKEW_MS = 5 * 60_000;
export type Plausibility = 'ok' | 'future' | 'stale' | 'invalid';

export function checkAnsweredAt(at: string | undefined, nowMs: number): Plausibility {
  if (!at) return 'ok';
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return 'invalid';
  if (t > nowMs + CLOCK_SKEW_MS) return 'future';
  if (t < nowMs - MAX_ANSWER_AGE_MS) return 'stale';
  return 'ok';
}

/** Khóa idempotency hợp lệ: 8–64 kí tự [A-Za-z0-9-_:]. */
export function validClientEventId(v: unknown): string | undefined {
  return typeof v === 'string' && /^[A-Za-z0-9_:-]{8,64}$/.test(v) ? v : undefined;
}
