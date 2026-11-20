// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server.
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';

/**
 * Điểm từng phần = số thẻ trái nối đúng / tổng số thẻ trái. Đúng hoàn toàn khi mọi cặp đúng.
 * parts: theo id thẻ TRÁI. Thẻ trái không có trong key (thẻ nhiễu) đúng khi không được nối.
 */
export function score(item: ItemOf<'MATCHING'>, r: ResponseOf<'MATCHING'> | undefined): ScoreResult {
  const key = item.key;
  if (!key) return { graded: false, correct: false, score: 0 };
  const left = item.payload.left;
  const given = (r && r.pairs) || {};
  const parts: Record<string, boolean> = {};
  let ok = 0;
  for (const l of left) {
    const want = key.pairs[l.id];
    const got = given[l.id];
    const good = want === undefined ? got === undefined : got === want;
    parts[l.id] = good;
    if (good) ok++;
  }
  const total = left.length;
  const s = total ? ok / total : 0;
  return { graded: true, correct: total > 0 && ok === total, score: s, parts };
}

/** Mọi thẻ trái đã được nối. */
export function isComplete(item: ItemOf<'MATCHING'>, r: ResponseOf<'MATCHING'> | undefined): boolean {
  if (!r || !r.pairs) return false;
  const left = item.payload.left;
  return left.length > 0 && left.every((l) => typeof r.pairs[l.id] === 'string' && r.pairs[l.id] !== '');
}
