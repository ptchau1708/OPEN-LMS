import { describe, expect, it } from 'vitest';
import { score, isComplete } from './score';
import { sample } from './sample';

describe('DRAG_DROP score', () => {
  const item = sample();
  it('đúng hết', () => {
    expect(score(item, { placement: { ...item.key!.placement } })).toMatchObject({ graded: true, correct: true, score: 1 });
  });
  it('sai hết', () => {
    const swapped = Object.fromEntries(Object.entries(item.key!.placement).map(([t, z]) => [t, z === 'z1' ? 'z2' : 'z1']));
    expect(score(item, { placement: swapped })).toMatchObject({ correct: false, score: 0 });
  });
  it('đúng một phần', () => {
    const r = score(item, { placement: { t1: 'z1', t2: 'z2', t3: 'z2' } });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(2 / 6);
    expect(r.parts).toMatchObject({ t1: true, t2: true, t3: false, t4: false });
  });
  it('chưa trả lời', () => {
    expect(score(item, undefined)).toMatchObject({ graded: true, correct: false, score: 0 });
  });
  it('thiếu key → không chấm', () => {
    expect(score({ ...item, key: undefined }, { placement: {} })).toEqual({ graded: false, correct: false, score: 0 });
  });
  it('isComplete khi mọi thẻ đã vào ô có thật', () => {
    expect(isComplete(item, { placement: { t1: 'z1' } })).toBe(false);
    expect(isComplete(item, { placement: { ...item.key!.placement, t6: 'khong-co' } })).toBe(false);
    expect(isComplete(item, { placement: { t1: 'z2', t2: 'z2', t3: 'z2', t4: 'z2', t5: 'z2', t6: 'z2' } })).toBe(true);
  });
});
