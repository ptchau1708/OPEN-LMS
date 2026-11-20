// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server.
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';

/** Không chấm: GV nghe bản ghi. */
export function score(_item: ItemOf<'RECORD_READ'>, _r: ResponseOf<'RECORD_READ'> | undefined): ScoreResult {
  return { graded: false, correct: false, score: 0 };
}

/** Đã có bản ghi. */
export function isComplete(_item: ItemOf<'RECORD_READ'>, r: ResponseOf<'RECORD_READ'> | undefined): boolean {
  return !!r && (!!r.audioUrl || (typeof r.durationSec === 'number' && r.durationSec > 0));
}
