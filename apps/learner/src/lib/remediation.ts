import type { Task } from '@openedu/contracts';

/** Nhiệm vụ ôn tập (bộ ôn từ getRemediationSets): kind 'practice', targetId = 'rem:<user>:<skill>:<stage>'. */
export function isReviewTask(t: Task): boolean {
  return t.kind === 'practice' && t.targetId.indexOf('rem:') === 0;
}

/** Chặng ôn của bộ (0 = lần đầu; 1..3 = lần ôn lại thứ n). */
export function remStage(setId: string): number {
  const n = Number(setId.split(':').pop());
  return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 0;
}

export function remPath(setId: string): string {
  return `/on-tap/${encodeURIComponent(setId)}`;
}
