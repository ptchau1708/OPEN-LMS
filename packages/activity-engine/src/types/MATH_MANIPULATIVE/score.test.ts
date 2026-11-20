import { describe, expect, it } from 'vitest';
import { score, isComplete } from './score';
import { sample, sampleClock, clockPromptText } from './sample';

describe('MATH_MANIPULATIVE score', () => {
  const item = sample();
  it('que tính: 26 + 7 = 33, đáp án nằm trong lựa chọn', () => {
    expect(item.payload.kind).toBe('sticks');
    if (item.payload.kind === 'sticks') {
      expect(item.payload.operands[0] + item.payload.operands[1]).toBe(item.key!.value);
      expect(item.payload.choices).toContain(item.key!.value);
    }
    expect(score(item, { value: 33 })).toMatchObject({ graded: true, correct: true, score: 1 });
  });
  it('sai', () => {
    expect(score(item, { value: 23 })).toMatchObject({ graded: true, correct: false, score: 0 });
    expect(score(item, { value: Number.NaN }).correct).toBe(false);
    expect(score(item, undefined).correct).toBe(false);
  });
  it('đồng hồ: giờ 12 tiếng', () => {
    const c = sampleClock();
    expect(score(c, { value: 210 }).correct).toBe(true);
    expect(score(c, { value: 210 + 720 }).correct).toBe(true);
    expect(score(c, { value: 180 }).correct).toBe(false);
    expect(clockPromptText(210)).toBe('Em hãy quay kim để đồng hồ chỉ 3 giờ 30 phút.');
    expect(clockPromptText(0)).toBe('Em hãy quay kim để đồng hồ chỉ 12 giờ.');
  });
  it('thiếu key → không chấm', () => {
    expect(score({ ...item, key: undefined }, { value: 33 })).toEqual({ graded: false, correct: false, score: 0 });
  });
  it('isComplete khi đã có số', () => {
    expect(isComplete(item, undefined)).toBe(false);
    expect(isComplete(item, { value: Number.NaN })).toBe(false);
    expect(isComplete(item, { value: 0 })).toBe(true);
  });
});
