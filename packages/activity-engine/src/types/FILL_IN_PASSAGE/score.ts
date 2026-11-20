// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server (cùng shared/text.ts).
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';
import { answersMatch, blankIds, normalizeText } from '../../shared/text';

/** Các chỗ trống được chấm: có trong đoạn văn và có đáp án. */
function gradedIds(item: ItemOf<'FILL_IN_PASSAGE'>, blanks: Record<string, string[]>): string[] {
  const inPassage = blankIds(item.payload?.passage ?? '').filter((id) => Array.isArray(blanks[id]));
  return inPassage.length ? inPassage : Object.keys(blanks);
}

/**
 * Điểm = số chỗ trống đúng / tổng số chỗ trống. parts: id chỗ trống → đúng/sai.
 * Đáp án có thể ghi chữ hoặc id thẻ trong kho từ (được đổi sang chữ của thẻ).
 */
export function score(item: ItemOf<'FILL_IN_PASSAGE'>, r: ResponseOf<'FILL_IN_PASSAGE'> | undefined): ScoreResult {
  const key = item.key;
  if (!key || !key.blanks || typeof key.blanks !== 'object') return { graded: false, correct: false, score: 0 };
  const ids = gradedIds(item, key.blanks);
  if (!ids.length) return { graded: false, correct: false, score: 0 };
  const bank = item.payload?.bank ?? [];
  const given = r?.blanks ?? {};
  const parts: Record<string, boolean> = {};
  let hits = 0;
  for (const id of ids) {
    const accepted = (key.blanks[id] ?? []).map((a) => bank.find((c) => c.id === a)?.text ?? a);
    const ok = answersMatch(given[id] ?? '', accepted, false);
    parts[id] = ok;
    if (ok) hits++;
  }
  return { graded: true, correct: hits === ids.length, score: hits / ids.length, parts };
}

/** Đủ khi mọi chỗ trống trong đoạn văn đã điền. */
export function isComplete(item: ItemOf<'FILL_IN_PASSAGE'>, r: ResponseOf<'FILL_IN_PASSAGE'> | undefined): boolean {
  if (!r || !r.blanks) return false;
  const ids = blankIds(item.payload?.passage ?? '');
  if (!ids.length) return false;
  return ids.every((id) => normalizeText(r.blanks[id] ?? '').length > 0);
}
