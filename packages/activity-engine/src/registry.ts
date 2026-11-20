import type { ItemType } from '@openedu/contracts';
import type { TypeModule } from './shared/typeApi';
import * as MCQ from './types/MCQ/index';
import * as MCQ_MULTIPLE from './types/MCQ_MULTIPLE/index';
import * as MATCHING from './types/MATCHING/index';
import * as ORDERING from './types/ORDERING/index';
import * as DRAG_DROP from './types/DRAG_DROP/index';
import * as SHORT_ANSWER from './types/SHORT_ANSWER/index';
import * as SENTENCE_SCRAMBLE from './types/SENTENCE_SCRAMBLE/index';
import * as WORD_CLASSIFY from './types/WORD_CLASSIFY/index';
import * as FILL_IN_PASSAGE from './types/FILL_IN_PASSAGE/index';
import * as INLINE_DROPDOWN from './types/INLINE_DROPDOWN/index';
import * as LISTEN_CHOOSE from './types/LISTEN_CHOOSE/index';
import * as HOTSPOT from './types/HOTSPOT/index';
import * as DRAW from './types/DRAW/index';
import * as RECORD_READ from './types/RECORD_READ/index';
import * as MATH_MANIPULATIVE from './types/MATH_MANIPULATIVE/index';
import * as POLL from './types/POLL/index';

export const REGISTRY: { [K in ItemType]: TypeModule<K> } = {
  MCQ: MCQ as unknown as TypeModule<'MCQ'>,
  MCQ_MULTIPLE: MCQ_MULTIPLE as unknown as TypeModule<'MCQ_MULTIPLE'>,
  MATCHING: MATCHING as unknown as TypeModule<'MATCHING'>,
  ORDERING: ORDERING as unknown as TypeModule<'ORDERING'>,
  DRAG_DROP: DRAG_DROP as unknown as TypeModule<'DRAG_DROP'>,
  SHORT_ANSWER: SHORT_ANSWER as unknown as TypeModule<'SHORT_ANSWER'>,
  SENTENCE_SCRAMBLE: SENTENCE_SCRAMBLE as unknown as TypeModule<'SENTENCE_SCRAMBLE'>,
  WORD_CLASSIFY: WORD_CLASSIFY as unknown as TypeModule<'WORD_CLASSIFY'>,
  FILL_IN_PASSAGE: FILL_IN_PASSAGE as unknown as TypeModule<'FILL_IN_PASSAGE'>,
  INLINE_DROPDOWN: INLINE_DROPDOWN as unknown as TypeModule<'INLINE_DROPDOWN'>,
  LISTEN_CHOOSE: LISTEN_CHOOSE as unknown as TypeModule<'LISTEN_CHOOSE'>,
  HOTSPOT: HOTSPOT as unknown as TypeModule<'HOTSPOT'>,
  DRAW: DRAW as unknown as TypeModule<'DRAW'>,
  RECORD_READ: RECORD_READ as unknown as TypeModule<'RECORD_READ'>,
  MATH_MANIPULATIVE: MATH_MANIPULATIVE as unknown as TypeModule<'MATH_MANIPULATIVE'>,
  POLL: POLL as unknown as TypeModule<'POLL'>,
};
