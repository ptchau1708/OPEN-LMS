import { describe, expect, it } from 'vitest';
import type { Item, LiveResponse } from '@openedu/contracts';
import { computeLiveStats } from './liveStats';

const base = { grade: 1 as const, subject: 'toan' as const, prompt: { text: 'Chọn số lớn nhất' } };

const mcq: Item = {
  ...base,
  id: 'q1',
  type: 'MCQ',
  payload: { options: [{ id: 'a', text: '3' }, { id: 'b', text: '7' }, { id: 'c', image: 'emoji:🍎' }] },
  key: { correct: 'b' },
};

const multi: Item = {
  ...base,
  id: 'q2',
  type: 'MCQ_MULTIPLE',
  payload: { options: [{ id: 'a', text: '2' }, { id: 'b', text: '4' }, { id: 'c', text: '5' }] },
  key: { correct: ['a', 'b'] },
};

const poll: Item = { ...base, id: 'q3', type: 'POLL', payload: { options: [{ id: 'x', text: 'Thích' }, { id: 'y', text: 'Không' }] } };

const short: Item = { ...base, id: 'q4', type: 'SHORT_ANSWER', payload: {}, key: { accepted: ['10'] } };

function r(userId: string, itemId: string, response: unknown, extra: Partial<LiveResponse> = {}, at = '2026-11-06T10:00:00Z'): LiveResponse {
  return { sessionId: 's', userId, itemId, slideIndex: 0, response: response as LiveResponse['response'], at, ...extra };
}

describe('computeLiveStats', () => {
  it('đếm theo lựa chọn và tự chấm MCQ khi có key', () => {
    const s = computeLiveStats(mcq, [r('u1', 'q1', { choice: 'b' }), r('u2', 'q1', { choice: 'a' }), r('u3', 'q1', { choice: 'b' }), r('u4', 'other', { choice: 'b' })]);
    expect(s.kind).toBe('choice');
    expect(s.answered).toBe(3);
    expect(s.correct).toBe(2);
    expect(s.graded).toBe(true);
    expect([...s.options].sort((a, b) => a.id.localeCompare(b.id)).map((o) => o.count)).toEqual([1, 2, 0]);
    expect(s.options.find((o) => o.correct)?.id).toBe('b');
    const ci = s.options.findIndex((o) => o.id === 'c');
    expect(s.options[ci].label).toBe('ABC'[ci]);
  });

  it('mỗi học sinh chỉ tính câu gửi sau cùng', () => {
    const s = computeLiveStats(mcq, [r('u1', 'q1', { choice: 'a' }, {}, '2026-11-06T10:00:00Z'), r('u1', 'q1', { choice: 'b' }, {}, '2026-11-06T10:00:05Z')]);
    expect(s.answered).toBe(1);
    expect([...s.options].sort((a, b) => a.id.localeCompare(b.id)).map((o) => o.count)).toEqual([0, 1, 0]);
    expect(s.correct).toBe(1);
  });

  it('MCQ_MULTIPLE: đếm từng lựa chọn, đúng khi đủ và không thừa', () => {
    const s = computeLiveStats(multi, [r('u1', 'q2', { choices: ['a', 'b'] }), r('u2', 'q2', { choices: ['a'] }), r('u3', 'q2', { choices: ['b', 'a', 'c'] })]);
    expect([...s.options].sort((a, b) => a.id.localeCompare(b.id)).map((o) => o.count)).toEqual([3, 2, 1]);
    expect(s.correct).toBe(1);
  });

  it('ưu tiên kết quả chấm của server', () => {
    const s = computeLiveStats(mcq, [r('u1', 'q1', { choice: 'a' }, { correct: true })]);
    expect(s.correct).toBe(1);
  });

  it('POLL không chấm', () => {
    const s = computeLiveStats(poll, [r('u1', 'q3', { choice: 'x' }), r('u2', 'q3', { choice: 'x' })]);
    expect(s.graded).toBe(false);
    expect(s.correct).toBe(0);
    expect(s.options.every((o) => !o.correct)).toBe(true);
    expect(s.options[0].count).toBe(2);
  });

  it('dạng khác: chỉ đếm số bạn trả lời và số bạn đúng', () => {
    const s = computeLiveStats(short, [r('u1', 'q4', { text: '10' }, { correct: true }), r('u2', 'q4', { text: '9' }, { correct: false }), r('u3', 'q4', { text: '1' })]);
    expect(s.kind).toBe('other');
    expect(s.options).toEqual([]);
    expect(s.answered).toBe(3);
    expect(s.correct).toBe(1);
    expect(s.graded).toBe(true);
  });
});
