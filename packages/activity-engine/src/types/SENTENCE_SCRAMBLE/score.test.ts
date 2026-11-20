import { describe, expect, it } from 'vitest';
import { score, isComplete } from './score';
import { sample } from './sample';

describe('SENTENCE_SCRAMBLE score', () => {
  const item = sample();
  it('câu đúng', () => {
    expect(score(item, { order: ['w1', 'w2', 'w3', 'w4'] })).toMatchObject({ graded: true, correct: true, score: 1 });
  });
  it('câu sai: 0 điểm, parts theo vị trí', () => {
    const r = score(item, { order: ['w1', 'w3', 'w2', 'w4'] });
    expect(r).toMatchObject({ correct: false, score: 0 });
    expect(r.parts).toEqual({ w1: true, w2: false, w3: false, w4: true });
  });
  it('chưa dùng hết từ', () => {
    const r = score(item, { order: ['w1', 'w2'] });
    expect(r.correct).toBe(false);
    expect(r.parts).toMatchObject({ w1: true, w2: true, w3: false, w4: false });
  });
  it('thiếu key → không chấm', () => {
    expect(score({ ...item, key: undefined }, { order: [] }).graded).toBe(false);
  });
  it('isComplete khi dùng hết từ', () => {
    expect(isComplete(item, { order: ['w1', 'w2', 'w3'] })).toBe(false);
    expect(isComplete(item, { order: ['w4', 'w3', 'w2', 'w1'] })).toBe(true);
  });
});
