// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server.
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';

/**
 * - multiple = true: phải chạm đúng y tập vùng; điểm từng phần max(0, (đúng − chưa đúng) / số vùng đúng).
 * - multiple = false: chỉ chọn một vùng; đúng nếu vùng đó nằm trong key.correct (có thể có nhiều vùng đều đúng).
 * parts: id vùng đúng → true; id vùng đã chạm mà chưa đúng → false.
 */
export function score(item: ItemOf<'HOTSPOT'>, r: ResponseOf<'HOTSPOT'> | undefined): ScoreResult {
  const key = item.key;
  if (!key || !Array.isArray(key.correct)) return { graded: false, correct: false, score: 0 };
  const want = new Set(key.correct);
  const chosen = new Set(Array.isArray(r?.regions) ? r!.regions : []);
  const parts: Record<string, boolean> = {};
  want.forEach((id) => { parts[id] = true; });
  let hits = 0;
  let wrongs = 0;
  chosen.forEach((id) => {
    if (want.has(id)) hits++;
    else { wrongs++; parts[id] = false; }
  });
  if (!item.payload?.multiple) {
    const correct = chosen.size === 1 && hits === 1;
    return { graded: true, correct, score: correct ? 1 : 0, parts };
  }
  if (want.size === 0) {
    const ok = chosen.size === 0;
    return { graded: true, correct: ok, score: ok ? 1 : 0, parts };
  }
  const correct = hits === want.size && wrongs === 0;
  return { graded: true, correct, score: correct ? 1 : Math.max(0, Math.min(1, (hits - wrongs) / want.size)), parts };
}

export function isComplete(_item: ItemOf<'HOTSPOT'>, r: ResponseOf<'HOTSPOT'> | undefined): boolean {
  return !!r && Array.isArray(r.regions) && r.regions.length >= 1;
}
