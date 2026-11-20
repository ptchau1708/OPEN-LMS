import { describe, expect, it } from 'vitest';
import { score, isComplete } from './score';
import { sample } from './sample';

describe('RECORD_READ score', () => {
  const item = sample();
  it('không chấm', () => {
    expect(score(item, { audioUrl: 'blob:x', durationSec: 12 })).toEqual({ graded: false, correct: false, score: 0 });
  });
  it('mẫu hợp lệ', () => {
    expect(item.payload.maxSeconds).toBe(30);
    expect(item.payload.text.length).toBeGreaterThan(20);
  });
  it('isComplete khi có bản ghi', () => {
    expect(isComplete(item, undefined)).toBe(false);
    expect(isComplete(item, { durationSec: 0 })).toBe(false);
    expect(isComplete(item, { audioUrl: 'blob:abc', durationSec: 8.2 })).toBe(true);
  });
});
