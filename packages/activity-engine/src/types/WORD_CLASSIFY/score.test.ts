import { describe, expect, it } from 'vitest';
import { score, isComplete } from './score';
import { sample } from './sample';

describe('WORD_CLASSIFY score', () => {
  const item = sample();
  it('đúng hết', () => {
    expect(score(item, { placement: { ...item.key!.placement } })).toMatchObject({ graded: true, correct: true, score: 1 });
  });
  it('đúng một phần', () => {
    const r = score(item, { placement: { ...item.key!.placement, w1: 'g2', w2: 'g1' } });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(4 / 6);
    expect(r.parts).toMatchObject({ w1: false, w2: false, w3: true });
  });
  it('sai hết / chưa trả lời', () => {
    const wrong = Object.fromEntries(Object.entries(item.key!.placement).map(([w, g]) => [w, g === 'g1' ? 'g2' : 'g1']));
    expect(score(item, { placement: wrong }).score).toBe(0);
    expect(score(item, undefined)).toMatchObject({ graded: true, score: 0 });
  });
  it('thiếu key → không chấm', () => {
    expect(score({ ...item, key: undefined }, { placement: {} }).graded).toBe(false);
  });
  it('isComplete', () => {
    expect(isComplete(item, { placement: { w1: 'g1' } })).toBe(false);
    expect(isComplete(item, { placement: { ...item.key!.placement } })).toBe(true);
  });
});
