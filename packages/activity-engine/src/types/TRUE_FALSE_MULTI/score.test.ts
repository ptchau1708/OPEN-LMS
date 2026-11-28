import { describe, expect, it } from 'vitest';
import { fractionFor, isComplete, score } from './score';
import { sample } from './sample';

describe('TRUE_FALSE_MULTI score', () => {
  const item = sample(); // a Đ, b S, c Đ, d S
  it('all four right → correct, score 1', () => {
    expect(score(item, { picks: { a: true, b: false, c: true, d: false } })).toMatchObject({ graded: true, correct: true, score: 1 });
  });
  it('progressive table for 4 statements: 1→0.2, 2→0.4, 3→0.65', () => {
    expect(score(item, { picks: { a: true, b: true, c: false, d: true } }).score).toBeCloseTo(0.2);
    expect(score(item, { picks: { a: true, b: false, c: false, d: true } }).score).toBeCloseTo(0.4);
    const r = score(item, { picks: { a: true, b: false, c: true, d: true } });
    expect(r.score).toBeCloseTo(0.65);
    expect(r.correct).toBe(false);
    expect(r.parts).toEqual({ a: true, b: true, c: true, d: false });
  });
  it('unanswered statements count as wrong', () => {
    const r = score(item, { picks: { a: true } });
    expect(r.score).toBeCloseTo(0.2);
    expect(r.parts).toMatchObject({ b: false, c: false, d: false });
  });
  it('non-4 counts split evenly', () => {
    expect(fractionFor(2, 3)).toBeCloseTo(2 / 3);
    expect(fractionFor(0, 0)).toBe(0);
  });
  it('without key → not graded', () => {
    const { key: _k, ...noKey } = item;
    expect(score(noKey as typeof item, { picks: {} }).graded).toBe(false);
  });
  it('garbage response does not throw', () => {
    expect(score(item, { picks: null as unknown as Record<string, boolean> }).score).toBe(0);
    expect(score(item, undefined).correct).toBe(false);
  });
  it('isComplete only when every statement has a pick', () => {
    expect(isComplete(item, { picks: { a: true, b: false, c: true } })).toBe(false);
    expect(isComplete(item, { picks: { a: true, b: false, c: true, d: true } })).toBe(true);
    expect(isComplete(item, undefined)).toBe(false);
  });
});
