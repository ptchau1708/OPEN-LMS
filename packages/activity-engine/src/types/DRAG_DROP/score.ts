// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server.
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';

/**
 * Điểm từng phần = số thẻ đặt đúng ô / tổng số thẻ. Đúng hoàn toàn khi mọi thẻ đúng ô.
 * parts: theo id thẻ.
 */
export function score(item: ItemOf<'DRAG_DROP'>, r: ResponseOf<'DRAG_DROP'> | undefined): ScoreResult {
  const key = item.key;
  if (!key) return { graded: false, correct: false, score: 0 };
  const list = item.payload.tokens;
  const given = (r && r.placement) || {};
  const parts: Record<string, boolean> = {};
  let ok = 0;
  for (const t of list) {
    const want = key.placement[t.id];
    const good = want !== undefined && given[t.id] === want;
    parts[t.id] = good;
    if (good) ok++;
  }
  const total = list.length;
  return { graded: true, correct: total > 0 && ok === total, score: total ? ok / total : 0, parts };
}

/** Mọi thẻ đã được đặt vào một ô có thật. */
export function isComplete(item: ItemOf<'DRAG_DROP'>, r: ResponseOf<'DRAG_DROP'> | undefined): boolean {
  if (!r || !r.placement) return false;
  const list = item.payload.tokens;
  const zones = new Set(item.payload.zones.map((z) => z.id));
  return list.length > 0 && list.every((t) => zones.has(r.placement[t.id]));
}
