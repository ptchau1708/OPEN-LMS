import { describe, expect, it } from 'vitest';
import { isComplete, score } from './score';
import { sample } from './sample';

describe('LISTEN_CHOOSE score', () => {
  const item = sample();
  it('sample has something to listen to and a valid key', () => {
    expect(item.prompt.speak).toBeTruthy();
    expect(item.payload.options.map((o) => o.id)).toContain(item.key!.correct);
  });
  it('correct', () => {
    expect(score(item, { choice: 'ga' })).toMatchObject({ graded: true, correct: true, score: 1, parts: { ga: true } });
  });
  it('wrong', () => {
    expect(score(item, { choice: 'ca' })).toMatchObject({ correct: false, score: 0, parts: { ga: true, ca: false } });
  });
  it('missing key', () => {
    const { key: _k, ...noKey } = item;
    expect(score(noKey, { choice: 'ga' }).graded).toBe(false);
  });
  it('isComplete', () => {
    expect(isComplete(item, undefined)).toBe(false);
    expect(isComplete(item, { choice: 'la' })).toBe(true);
  });
});
