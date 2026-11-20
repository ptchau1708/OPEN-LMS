/**
 * Chấm điểm THUẦN (không React, không DOM). Dùng ở trình duyệt, Node và Edge Function (Deno).
 * Không import file .tsx vào đây.
 */
import type { AnyResponse, Item, ItemOf, ItemType, ResponseOf, ScoreResult } from '@openedu/contracts';
import * as MCQ from './types/MCQ/score';
import * as MCQ_MULTIPLE from './types/MCQ_MULTIPLE/score';
import * as MATCHING from './types/MATCHING/score';
import * as ORDERING from './types/ORDERING/score';
import * as DRAG_DROP from './types/DRAG_DROP/score';
import * as SHORT_ANSWER from './types/SHORT_ANSWER/score';
import * as SENTENCE_SCRAMBLE from './types/SENTENCE_SCRAMBLE/score';
import * as WORD_CLASSIFY from './types/WORD_CLASSIFY/score';
import * as FILL_IN_PASSAGE from './types/FILL_IN_PASSAGE/score';
import * as INLINE_DROPDOWN from './types/INLINE_DROPDOWN/score';
import * as LISTEN_CHOOSE from './types/LISTEN_CHOOSE/score';
import * as HOTSPOT from './types/HOTSPOT/score';
import * as DRAW from './types/DRAW/score';
import * as RECORD_READ from './types/RECORD_READ/score';
import * as MATH_MANIPULATIVE from './types/MATH_MANIPULATIVE/score';
import * as POLL from './types/POLL/score';

interface Scorer<T extends ItemType> {
  score: (item: ItemOf<T>, r: ResponseOf<T> | undefined) => ScoreResult;
  isComplete: (item: ItemOf<T>, r: ResponseOf<T> | undefined) => boolean;
}

export const SCORERS: { [K in ItemType]: Scorer<K> } = {
  MCQ: MCQ as unknown as Scorer<'MCQ'>,
  MCQ_MULTIPLE: MCQ_MULTIPLE as unknown as Scorer<'MCQ_MULTIPLE'>,
  MATCHING: MATCHING as unknown as Scorer<'MATCHING'>,
  ORDERING: ORDERING as unknown as Scorer<'ORDERING'>,
  DRAG_DROP: DRAG_DROP as unknown as Scorer<'DRAG_DROP'>,
  SHORT_ANSWER: SHORT_ANSWER as unknown as Scorer<'SHORT_ANSWER'>,
  SENTENCE_SCRAMBLE: SENTENCE_SCRAMBLE as unknown as Scorer<'SENTENCE_SCRAMBLE'>,
  WORD_CLASSIFY: WORD_CLASSIFY as unknown as Scorer<'WORD_CLASSIFY'>,
  FILL_IN_PASSAGE: FILL_IN_PASSAGE as unknown as Scorer<'FILL_IN_PASSAGE'>,
  INLINE_DROPDOWN: INLINE_DROPDOWN as unknown as Scorer<'INLINE_DROPDOWN'>,
  LISTEN_CHOOSE: LISTEN_CHOOSE as unknown as Scorer<'LISTEN_CHOOSE'>,
  HOTSPOT: HOTSPOT as unknown as Scorer<'HOTSPOT'>,
  DRAW: DRAW as unknown as Scorer<'DRAW'>,
  RECORD_READ: RECORD_READ as unknown as Scorer<'RECORD_READ'>,
  MATH_MANIPULATIVE: MATH_MANIPULATIVE as unknown as Scorer<'MATH_MANIPULATIVE'>,
  POLL: POLL as unknown as Scorer<'POLL'>,
};

const UNGRADED: ItemType[] = ['DRAW', 'RECORD_READ', 'POLL'];

/** Chấm một câu trả lời. Item thiếu key (máy HS ở chế độ Supabase) trả về graded=false. */
export function scoreItem(item: Item, response: AnyResponse | undefined): ScoreResult {
  const s = SCORERS[item.type] as unknown as Scorer<ItemType>;
  if (!item.key && !UNGRADED.includes(item.type)) return { graded: false, correct: false, score: 0 };
  return s.score(item as never, response as never);
}

/** Đã đủ để bấm "Kiểm tra" chưa. */
export function isComplete(item: Item, response: AnyResponse | undefined): boolean {
  if (response === undefined) return false;
  return (SCORERS[item.type] as unknown as Scorer<ItemType>).isComplete(item as never, response as never);
}
