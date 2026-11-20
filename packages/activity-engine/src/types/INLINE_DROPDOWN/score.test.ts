import { describe, expect, it } from 'vitest';
import type { ItemOf } from '@openedu/contracts';
import { isComplete, score } from './score';
import { sample } from './sample';

const full = { d1: 'is', d2: 'am', d3: 'is', d4: 'are' };

describe('INLINE_DROPDOWN score', () => {
  const item = sample();
  it('sample: each key is one of its dropdown choices; English prompt', () => {
    Object.entries(item.key!.blanks).forEach(([id, c]) => {
      expect(item.payload.dropdowns[id].map((x) => x.id)).toContain(c);
    });
    expect(item.prompt.lang).toBe('en-US');
  });
  it('all correct', () => {
    expect(score(item, { blanks: full })).toMatchObject({ correct: true, score: 1 });
  });
  it('partial', () => {
    const r = score(item, { blanks: { ...full, d2: 'is' } });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(0.75);
    expect(r.parts).toEqual({ d1: true, d2: false, d3: true, d4: true });
  });
  it('teacher wrote the key as text: compared by choice text', () => {
    const t: ItemOf<'INLINE_DROPDOWN'> = {
      ...item,
      payload: { passage: 'I {{d1}} Mai.', dropdowns: { d1: [{ id: 'x1', text: 'am' }, { id: 'x2', text: 'is' }] } },
      key: { blanks: { d1: 'AM' } },
    };
    expect(score(t, { blanks: { d1: 'x1' } }).correct).toBe(true);
    expect(score(t, { blanks: { d1: 'x2' } }).correct).toBe(false);
  });
  it('missing key', () => {
    const { key: _k, ...noKey } = item;
    expect(score(noKey, { blanks: full }).graded).toBe(false);
  });
  it('isComplete', () => {
    expect(isComplete(item, { blanks: { d1: 'is' } })).toBe(false);
    expect(isComplete(item, { blanks: full })).toBe(true);
  });
});
