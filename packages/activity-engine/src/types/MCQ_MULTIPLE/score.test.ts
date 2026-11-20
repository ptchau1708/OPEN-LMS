import { describe, expect, it } from 'vitest';
import { isComplete, score } from './score';
import { sample } from './sample';

describe('MCQ_MULTIPLE score', () => {
  const item = sample(); // đúng: a, c, d (3 đáp án)
  it('exact set is correct (order does not matter)', () => {
    expect(score(item, { choices: ['d', 'a', 'c'] })).toMatchObject({ graded: true, correct: true, score: 1 });
  });
  it('partial: 2 of 3, no wrongs', () => {
    const r = score(item, { choices: ['a', 'c'] });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.parts).toEqual({ a: true, c: true, d: true });
  });
  it('partial with a wrong pick: (hits − wrongs) / correctCount', () => {
    const r = score(item, { choices: ['a', 'c', 'b'] });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(1 / 3);
    expect(r.parts).toMatchObject({ b: false, a: true });
  });
  it('all options picked is not correct', () => {
    const r = score(item, { choices: ['a', 'b', 'c', 'd', 'e'] });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(1 / 3);
  });
  it('score never below zero', () => {
    expect(score(item, { choices: ['b', 'e'] }).score).toBe(0);
  });
  it('duplicate ids in response counted once', () => {
    expect(score(item, { choices: ['a', 'a', 'c', 'd'] }).correct).toBe(true);
  });
  it('missing key', () => {
    const { key: _k, ...noKey } = item;
    expect(score(noKey, { choices: ['a'] })).toEqual({ graded: false, correct: false, score: 0 });
  });
  it('isComplete: at least one', () => {
    expect(isComplete(item, { choices: [] })).toBe(false);
    expect(isComplete(item, { choices: ['e'] })).toBe(true);
  });
});
