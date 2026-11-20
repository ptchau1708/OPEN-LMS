import { describe, expect, it } from 'vitest';
import type { ItemOf } from '@openedu/contracts';
import { isComplete, score } from './score';
import { sample } from './sample';
import { blankIds, parseBlanks } from '../../shared/text';

const full = { b1: 'đâm', b2: 'chao', b3: 'rực rỡ', b4: 'náo nức' };

describe('FILL_IN_PASSAGE score', () => {
  const item = sample();
  it('sample: every blank has an answer that is in the bank', () => {
    const bank = item.payload.bank!.map((c) => c.text);
    blankIds(item.payload.passage).forEach((id) => {
      expect(item.key!.blanks[id]?.length).toBeGreaterThan(0);
      expect(bank).toContain(item.key!.blanks[id][0]);
    });
  });
  it('all correct', () => {
    expect(score(item, { blanks: full })).toMatchObject({ graded: true, correct: true, score: 1 });
  });
  it('partial credit = fraction of blanks', () => {
    const r = score(item, { blanks: { ...full, b2: 'rụng', b4: '' } });
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(0.5);
    expect(r.parts).toEqual({ b1: true, b2: false, b3: true, b4: false });
  });
  it('normalization + alternative answers', () => {
    expect(score(item, { blanks: { ...full, b3: '  Rực   rỡ ', b4: 'háo hức' } }).correct).toBe(true);
  });
  it('key may reference bank chip ids', () => {
    const byId: ItemOf<'FILL_IN_PASSAGE'> = { ...item, key: { blanks: { b1: ['w1'], b2: ['w2'], b3: ['w3'], b4: ['w4'] } } };
    expect(score(byId, { blanks: full }).correct).toBe(true);
  });
  it('missing key / empty key', () => {
    const { key: _k, ...noKey } = item;
    expect(score(noKey, { blanks: full }).graded).toBe(false);
    expect(score({ ...item, key: { blanks: {} } }, { blanks: full }).graded).toBe(false);
  });
  it('isComplete: every blank filled', () => {
    expect(isComplete(item, { blanks: { b1: 'đâm' } })).toBe(false);
    expect(isComplete(item, { blanks: { ...full, b2: ' ' } })).toBe(false);
    expect(isComplete(item, { blanks: full })).toBe(true);
  });
});

describe('parseBlanks', () => {
  it('splits text and blanks, tolerates spaces in tokens', () => {
    expect(parseBlanks('A {{b1}} B {{ b2 }}.')).toEqual([
      { type: 'text', text: 'A ' },
      { type: 'blank', id: 'b1' },
      { type: 'text', text: ' B ' },
      { type: 'blank', id: 'b2' },
      { type: 'text', text: '.' },
    ]);
    expect(blankIds('{{x}}{{x}}{{y}}')).toEqual(['x', 'y']);
    expect(parseBlanks('')).toEqual([]);
  });
});
