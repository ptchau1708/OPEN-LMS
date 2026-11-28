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

describe('WORD_CLASSIFY distractors (thẻ nhiễu)', () => {
  const base = {
    id: 'wc-x', type: 'WORD_CLASSIFY' as const, grade: 5 as const, subject: 'tieng-viet' as const, prompt: { text: 'Xếp từ' },
    payload: {
      words: [{ id: 'w1', text: 'chạy' }, { id: 'w2', text: 'đẹp' }, { id: 'w3', text: 'và' }],
      groups: [{ id: 'g1', label: 'Động từ' }, { id: 'g2', label: 'Tính từ' }],
      distractors: true,
    },
    key: { placement: { w1: 'g1', w2: 'g2' } },
  };
  it('distractor left in tray counts as right', () => {
    expect(score(base, { placement: { w1: 'g1', w2: 'g2' } })).toMatchObject({ correct: true, score: 1, parts: { w3: true } });
  });
  it('distractor placed in a group is wrong', () => {
    const r = score(base, { placement: { w1: 'g1', w2: 'g2', w3: 'g1' } });
    expect(r.correct).toBe(false);
    expect(r.parts).toMatchObject({ w3: false });
  });
  it('without the flag, an unkeyed word is never right (old behaviour)', () => {
    const { distractors: _d, ...p } = base.payload;
    expect(score({ ...base, payload: p }, { placement: { w1: 'g1', w2: 'g2' } }).correct).toBe(false);
  });
  it('isComplete: one placed word is enough when distractors are on', () => {
    expect(isComplete(base, { placement: { w1: 'g1' } })).toBe(true);
    expect(isComplete(base, { placement: {} })).toBe(false);
  });
});
