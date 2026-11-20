import { describe, expect, it } from 'vitest';
import { isComplete, score } from './score';
import { sample } from './sample';

describe('MCQ score', () => {
  const item = sample();
  it('sample is valid: key points to an existing option', () => {
    expect(item.payload.options.map((o) => o.id)).toContain(item.key!.correct);
  });
  it('correct answer', () => {
    expect(score(item, { choice: 'b' })).toEqual({ graded: true, correct: true, score: 1, parts: { b: true } });
  });
  it('wrong answer marks chosen false and correct true', () => {
    const r = score(item, { choice: 'a' });
    expect(r.correct).toBe(false);
    expect(r.score).toBe(0);
    expect(r.parts).toEqual({ b: true, a: false });
  });
  it('no response', () => {
    const r = score(item, undefined);
    expect(r).toMatchObject({ graded: true, correct: false, score: 0 });
  });
  it('missing key → not graded', () => {
    const { key: _k, ...noKey } = item;
    expect(score(noKey, { choice: 'b' })).toEqual({ graded: false, correct: false, score: 0 });
  });
  it('isComplete', () => {
    expect(isComplete(item, undefined)).toBe(false);
    expect(isComplete(item, { choice: '' })).toBe(false);
    expect(isComplete(item, { choice: 'c' })).toBe(true);
  });
});
