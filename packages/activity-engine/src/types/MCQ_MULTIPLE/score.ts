// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server.
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';

/**
 * Đúng khi chọn đúng y tập đáp án. Điểm = max(0, (số chọn đúng − số chọn chưa đúng) / số đáp án đúng).
 * parts: mọi id đáp án đúng → true (kể cả em chưa chọn — Player tự biết em có chọn hay không);
 *        id đã chọn mà không phải đáp án → false.
 */
export function score(item: ItemOf<'MCQ_MULTIPLE'>, r: ResponseOf<'MCQ_MULTIPLE'> | undefined): ScoreResult {
  const key = item.key;
  if (!key || !Array.isArray(key.correct)) return { graded: false, correct: false, score: 0 };
  const want = new Set(key.correct);
  const chosen = new Set(Array.isArray(r?.choices) ? r!.choices : []);
  let hits = 0;
  let wrongs = 0;
  const parts: Record<string, boolean> = {};
  want.forEach((id) => { parts[id] = true; });
  chosen.forEach((id) => {
    if (want.has(id)) hits++;
    else { wrongs++; parts[id] = false; }
  });
  if (want.size === 0) {
    const ok = chosen.size === 0;
    return { graded: true, correct: ok, score: ok ? 1 : 0, parts };
  }
  const correct = hits === want.size && wrongs === 0;
  const s = Math.max(0, (hits - wrongs) / want.size);
  return { graded: true, correct, score: correct ? 1 : Math.min(1, s), parts };
}

export function isComplete(_item: ItemOf<'MCQ_MULTIPLE'>, r: ResponseOf<'MCQ_MULTIPLE'> | undefined): boolean {
  return !!r && Array.isArray(r.choices) && r.choices.length >= 1;
}
