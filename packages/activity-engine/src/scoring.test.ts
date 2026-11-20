import { describe, expect, it } from 'vitest';
import type { Item } from '@openedu/contracts';
import { isComplete, scoreItem } from './scoring';
import { sample as mcq } from './types/MCQ/sample';
import { sample as mcqm } from './types/MCQ_MULTIPLE/sample';
import { sample as listen } from './types/LISTEN_CHOOSE/sample';
import { sample as poll } from './types/POLL/sample';
import { sample as short } from './types/SHORT_ANSWER/sample';
import { sample as fill } from './types/FILL_IN_PASSAGE/sample';
import { sample as dropdown } from './types/INLINE_DROPDOWN/sample';
import { sample as hotspot } from './types/HOTSPOT/sample';

const cases: { item: Item; right: unknown; wrong: unknown }[] = [
  { item: mcq(), right: { choice: 'b' }, wrong: { choice: 'a' } },
  { item: mcqm(), right: { choices: ['a', 'c', 'd'] }, wrong: { choices: ['b'] } },
  { item: listen(), right: { choice: 'ga' }, wrong: { choice: 'ca' } },
  { item: short(), right: { text: '52' }, wrong: { text: '51' } },
  { item: fill(), right: { blanks: { b1: 'đâm', b2: 'chao', b3: 'rực rỡ', b4: 'náo nức' } }, wrong: { blanks: { b1: 'rụng' } } },
  { item: dropdown(), right: { blanks: { d1: 'is', d2: 'am', d3: 'is', d4: 'are' } }, wrong: { blanks: { d1: 'am' } } },
  { item: hotspot(), right: { regions: ['ca-cam', 'ca-vang'] }, wrong: { regions: ['meo'] } },
];

describe('scoreItem dispatch', () => {
  for (const c of cases) {
    it(`${c.item.type}: right / wrong`, () => {
      expect(scoreItem(c.item, c.right as never)).toMatchObject({ graded: true, correct: true, score: 1 });
      expect(scoreItem(c.item, c.wrong as never)).toMatchObject({ graded: true, correct: false });
      expect(isComplete(c.item, c.right as never)).toBe(true);
    });
    it(`${c.item.type}: item without key → graded=false`, () => {
      const { key: _k, ...noKey } = c.item as Item & { key?: unknown };
      expect(scoreItem(noKey as Item, c.right as never)).toEqual({ graded: false, correct: false, score: 0 });
    });
  }

  it('POLL is ungraded with or without key', () => {
    const p = poll();
    expect(scoreItem(p, { choice: 'meo' }).graded).toBe(false);
    expect(isComplete(p, { choice: 'meo' })).toBe(true);
    expect(isComplete(p, undefined)).toBe(false);
  });

  it('isComplete is false for undefined response', () => {
    expect(isComplete(mcq(), undefined)).toBe(false);
    expect(isComplete(hotspot(), undefined)).toBe(false);
  });
});
