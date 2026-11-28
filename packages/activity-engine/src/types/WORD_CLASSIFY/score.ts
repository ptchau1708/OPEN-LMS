// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server.
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';

/**
 * Điểm từng phần = số từ đặt đúng ô / tổng số từ. Đúng hoàn toàn khi mọi từ đúng ô.
 * Câu có thẻ nhiễu (payload.distractors): từ không có trong key.placement phải được để lại khay.
 * parts: theo id từ.
 */
export function score(item: ItemOf<'WORD_CLASSIFY'>, r: ResponseOf<'WORD_CLASSIFY'> | undefined): ScoreResult {
  const key = item.key;
  if (!key) return { graded: false, correct: false, score: 0 };
  const list = item.payload.words;
  const given = (r && r.placement) || {};
  const parts: Record<string, boolean> = {};
  let ok = 0;
  const extra = !!item.payload.distractors;
  const zones = new Set(item.payload.groups.map((z) => z.id));
  for (const t of list) {
    const want = key.placement[t.id];
    // Thẻ nhiễu (không có trong đáp án): đúng khi em để lại trong khay.
    const good = want === undefined ? extra && !zones.has(given[t.id]) : given[t.id] === want;
    parts[t.id] = good;
    if (good) ok++;
  }
  const total = list.length;
  return { graded: true, correct: total > 0 && ok === total, score: total ? ok / total : 0, parts };
}

/** Mọi từ đã được đặt vào một ô có thật (câu có thẻ nhiễu: đã đặt ít nhất một từ). */
export function isComplete(item: ItemOf<'WORD_CLASSIFY'>, r: ResponseOf<'WORD_CLASSIFY'> | undefined): boolean {
  if (!r || !r.placement) return false;
  const list = item.payload.words;
  const zones = new Set(item.payload.groups.map((z) => z.id));
  // Có thẻ nhiễu: em không cần xếp hết, chỉ cần đã xếp ít nhất một thẻ.
  if (item.payload.distractors) return list.some((t) => zones.has(r.placement[t.id]));
  return list.length > 0 && list.every((t) => zones.has(r.placement[t.id]));
}
