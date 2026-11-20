// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server.
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';

/** Thăm dò ý kiến: không chấm, mọi lựa chọn đều được. */
export function score(_item: ItemOf<'POLL'>, _r: ResponseOf<'POLL'> | undefined): ScoreResult {
  return { graded: false, correct: false, score: 0 };
}

export function isComplete(_item: ItemOf<'POLL'>, r: ResponseOf<'POLL'> | undefined): boolean {
  return !!r && typeof r.choice === 'string' && r.choice.length > 0;
}
