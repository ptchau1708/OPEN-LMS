import { describe, expect, it } from 'vitest';
import { score, isComplete } from './score';
import { sample } from './sample';

describe('DRAW score', () => {
  const item = sample();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  it('không chấm', () => {
    expect(score(item, { dataUrl: png })).toEqual({ graded: false, correct: false, score: 0 });
    expect(score(item, undefined).graded).toBe(false);
  });
  it('isComplete khi hình không rỗng', () => {
    expect(isComplete(item, undefined)).toBe(false);
    expect(isComplete(item, { dataUrl: '' })).toBe(false);
    expect(isComplete(item, { dataUrl: png })).toBe(true);
  });
});
