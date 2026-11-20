import { describe, expect, it } from 'vitest';
import { score, isComplete } from './score';
import { sample } from './sample';

describe('ORDERING score', () => {
  const item = sample();
  it('đúng thứ tự', () => {
    const r = score(item, { order: ['n2', 'n4', 'n5', 'n7', 'n9'] });
    expect(r).toMatchObject({ graded: true, correct: true, score: 1 });
    expect(Object.values(r.parts!).every(Boolean)).toBe(true);
  });
  it('sai thứ tự: 0 điểm, parts theo vị trí', () => {
    const r = score(item, { order: ['n2', 'n5', 'n4', 'n7', 'n9'] });
    expect(r).toMatchObject({ graded: true, correct: false, score: 0 });
    expect(r.parts).toEqual({ n2: true, n4: false, n5: false, n7: true, n9: true });
  });
  it('chưa xếp đủ', () => {
    const r = score(item, { order: ['n2', 'n4'] });
    expect(r.correct).toBe(false);
    expect(r.parts).toMatchObject({ n2: true, n4: true, n9: false });
    expect(score(item, undefined)).toMatchObject({ graded: true, correct: false, score: 0 });
  });
  it('hai thẻ cùng chữ đổi chỗ vẫn đúng', () => {
    const dup = { ...item, payload: { items: [{ id: 'a', text: '3' }, { id: 'b', text: '3' }, { id: 'c', text: '5' }] }, key: { order: ['a', 'b', 'c'] } };
    expect(score(dup, { order: ['b', 'a', 'c'] }).correct).toBe(true);
  });
  it('thiếu key → không chấm', () => {
    expect(score({ ...item, key: undefined }, { order: ['n2'] })).toEqual({ graded: false, correct: false, score: 0 });
  });
  it('isComplete khi đã dùng hết thẻ', () => {
    expect(isComplete(item, { order: ['n2', 'n4', 'n5', 'n7'] })).toBe(false);
    expect(isComplete(item, { order: ['n9', 'n4', 'n5', 'n7', 'n2'] })).toBe(true);
    expect(isComplete(item, undefined)).toBe(false);
  });
});
