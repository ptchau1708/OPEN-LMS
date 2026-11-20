import { describe, expect, it } from 'vitest';
import { isComplete, score } from './score';
import { sample } from './sample';

describe('POLL score', () => {
  const item = sample();
  it('never graded', () => {
    expect(score(item, { choice: 'meo' })).toEqual({ graded: false, correct: false, score: 0 });
    expect(score(item, undefined).graded).toBe(false);
  });
  it('sample has no key', () => {
    expect(item.key).toBeUndefined();
    expect(item.payload.options.length).toBeGreaterThanOrEqual(2);
  });
  it('isComplete needs a choice', () => {
    expect(isComplete(item, undefined)).toBe(false);
    expect(isComplete(item, { choice: '' })).toBe(false);
    expect(isComplete(item, { choice: 'tho' })).toBe(true);
  });
});
