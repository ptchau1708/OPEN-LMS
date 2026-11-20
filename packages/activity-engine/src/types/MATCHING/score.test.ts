import { describe, expect, it } from 'vitest';
import { score, isComplete } from './score';
import { sample } from './sample';

describe('MATCHING score', () => {
  const item = sample();
  it('đúng hết', () => {
    const r = score(item, { pairs: { ...item.key!.pairs } });
    expect(r).toMatchObject({ graded: true, correct: true, score: 1 });
    expect(Object.values(r.parts!).every(Boolean)).toBe(true);
  });
  it('sai hết (đổi vòng)', () => {
    const r = score(item, { pairs: { l1: 'r2', l2: 'r3', l3: 'r4', l4: 'r1' } });
    expect(r).toMatchObject({ graded: true, correct: false, score: 0 });
  });
  it('đúng một phần', () => {
    const r = score(item, { pairs: { l1: 'r1', l2: 'r2', l3: 'r4', l4: 'r3' } });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(0.5);
    expect(r.parts).toEqual({ l1: true, l2: true, l3: false, l4: false });
  });
  it('chưa trả lời / thiếu cặp', () => {
    expect(score(item, undefined)).toMatchObject({ graded: true, correct: false, score: 0 });
    expect(score(item, { pairs: { l1: 'r1' } }).score).toBeCloseTo(0.25);
  });
  it('thiếu key → không chấm', () => {
    expect(score({ ...item, key: undefined }, { pairs: { l1: 'r1' } })).toEqual({ graded: false, correct: false, score: 0 });
  });
  it('isComplete khi mọi thẻ trái đã nối', () => {
    expect(isComplete(item, undefined)).toBe(false);
    expect(isComplete(item, { pairs: { l1: 'r1', l2: 'r2', l3: 'r3' } })).toBe(false);
    expect(isComplete(item, { pairs: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' } })).toBe(true);
  });
});
