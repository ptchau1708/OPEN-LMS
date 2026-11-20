import { describe, expect, it } from 'vitest';
import type { ItemOf } from '@openedu/contracts';
import { isComplete, score } from './score';
import { sample } from './sample';
import { answersMatch, normalizeText, parseNumberCandidates, unifyToneMarks } from '../../shared/text';

describe('SHORT_ANSWER score', () => {
  const item = sample(); // 52, đơn vị cm
  it('correct number', () => {
    expect(score(item, { text: '52' })).toMatchObject({ graded: true, correct: true, score: 1 });
  });
  it('accepts spaces, leading zero and the unit typed by the child', () => {
    expect(score(item, { text: '  052 ' }).correct).toBe(true);
    expect(score(item, { text: '52 cm' }).correct).toBe(true);
    expect(score(item, { text: '52cm' }).correct).toBe(true);
  });
  it('wrong', () => {
    expect(score(item, { text: '42' })).toMatchObject({ correct: false, score: 0, parts: { answer: false } });
    expect(score(item, { text: '' }).correct).toBe(false);
  });
  it('missing key', () => {
    const { key: _k, ...noKey } = item;
    expect(score(noKey, { text: '52' })).toEqual({ graded: false, correct: false, score: 0 });
  });
  it('text answers: case-insensitive by default, case-sensitive on request', () => {
    const t: ItemOf<'SHORT_ANSWER'> = { ...item, payload: { inputMode: 'text' }, key: { accepted: ['Hà Nội'] } };
    expect(score(t, { text: 'hà   nội' }).correct).toBe(true);
    const cs: ItemOf<'SHORT_ANSWER'> = { ...t, key: { accepted: ['Hà Nội'], caseSensitive: true } };
    expect(score(cs, { text: 'hà nội' }).correct).toBe(false);
    expect(score(cs, { text: 'Hà Nội' }).correct).toBe(true);
  });
  it('isComplete', () => {
    expect(isComplete(item, { text: '   ' })).toBe(false);
    expect(isComplete(item, { text: '5' })).toBe(true);
  });
});

describe('text helpers', () => {
  it('normalizeText: NFC, trim, collapse spaces, lowercase', () => {
    const decomposed = 'Hòa'.normalize('NFD');
    expect(normalizeText(`  ${decomposed}   BÌNH `)).toBe('hoà bình');
    expect(normalizeText('Mèo', true)).toBe('Mèo');
  });
  it('old/new tone placement are the same word', () => {
    expect(unifyToneMarks('hòa')).toBe('hoà');
    expect(unifyToneMarks('khỏe')).toBe('khoẻ');
    expect(unifyToneMarks('thủy')).toBe('thuỷ');
    expect(unifyToneMarks('HÒA')).toBe('HOÀ');
    expect(unifyToneMarks('hoàng')).toBe('hoàng');
    expect(answersMatch('hòa bình', ['hoà bình'])).toBe(true);
  });
  it('numbers: comma or dot decimals, thousands separators', () => {
    expect(answersMatch('2,5', ['2.5'])).toBe(true);
    expect(answersMatch('2.5', ['2,5'])).toBe(true);
    expect(answersMatch('1.000', ['1000'])).toBe(true);
    expect(answersMatch('1 000', ['1000'])).toBe(true);
    expect(answersMatch('07', ['7'])).toBe(true);
    expect(answersMatch('2,6', ['2,5'])).toBe(false);
    expect(parseNumberCandidates('abc')).toEqual([]);
    expect(parseNumberCandidates('−3')).toEqual([-3]);
  });
  it('ignores trailing punctuation, rejects empty', () => {
    expect(answersMatch('con mèo.', ['con mèo'])).toBe(true);
    expect(answersMatch('', ['x'])).toBe(false);
    expect(answersMatch('x', [])).toBe(false);
  });
});
