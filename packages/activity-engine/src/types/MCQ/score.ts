// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server.
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';

/**
 * parts (để tô màu khi hiện đáp án):
 *   id đáp án đúng → true; id học sinh chọn nhưng chưa đúng → false; các lựa chọn khác không có mặt.
 */
export function score(item: ItemOf<'MCQ'>, r: ResponseOf<'MCQ'> | undefined): ScoreResult {
  const key = item.key;
  if (!key || typeof key.correct !== 'string') return { graded: false, correct: false, score: 0 };
  const choice = r?.choice;
  const correct = !!choice && choice === key.correct;
  const parts: Record<string, boolean> = { [key.correct]: true };
  if (choice && !correct) parts[choice] = false;
  return { graded: true, correct, score: correct ? 1 : 0, parts };
}

export function isComplete(_item: ItemOf<'MCQ'>, r: ResponseOf<'MCQ'> | undefined): boolean {
  return !!r && typeof r.choice === 'string' && r.choice.length > 0;
}
