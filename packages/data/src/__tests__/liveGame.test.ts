import { describe, expect, it } from 'vitest';
import type { LiveResponse } from '@openedu/contracts';
import {
  applyLiveCommand, createInitialLiveState, emptyGame, gameLeaderboard, paperCardsFor, paperLetterFromCorners, parsePaperCode, paperCardCode,
  questionPoints, tallyClassQuestion, tallyPaperQuestion, tallySelfResponses,
} from '../index';

const T0 = Date.parse('2026-11-23T08:00:00Z');
const resp = (userId: string, slideIndex: number, at: number, correct: boolean): LiveResponse => ({ sessionId: 's', userId, itemId: `it${slideIndex}`, slideIndex, response: { choice: 'a' } as never, correct, at: new Date(at).toISOString() });

describe('thi đua — điểm', () => {
  it('đúng ngay 1000, hết giờ 500, sai 0, chuỗi +100 (tối đa +500)', () => {
    expect(questionPoints(true, 0, 20, 0)).toBe(1000);
    expect(questionPoints(true, 20_000, 20, 0)).toBe(500);
    expect(questionPoints(true, 10_000, 20, 0)).toBe(750);
    expect(questionPoints(true, 99_000, 20, 0)).toBe(500);
    expect(questionPoints(false, 0, 20, 3)).toBe(0);
    expect(questionPoints(true, 0, 20, 2)).toBe(1200);
    expect(questionPoints(true, 0, 20, 9)).toBe(1500);
  });

  it('class: lấy câu đầu tiên, người không trả lời mất chuỗi; tally hai lần không cộng trùng', () => {
    let st = createInitialLiveState({ sessionId: 's', pin: '123456' });
    st = { ...st, participants: [{ userId: 'a', name: 'An', mascot: 'nghe', color: '#f00' }, { userId: 'b', name: 'Bình', mascot: 'nghe', color: '#0f0' }, { userId: 'c', name: 'Chi', mascot: 'nghe', color: '#00f' }] };
    st = applyLiveCommand(st, { type: 'game-setup', game: { mode: 'class', seconds: 20 } }, new Date(T0));
    st = { ...st, game: { ...st.game!, streak: { c: 2 } } };
    const responses = [resp('a', 1, T0 + 2000, true), resp('a', 1, T0 + 5000, false), resp('b', 1, T0 + 10_000, false)];
    const gains = tallyClassQuestion({ game: st.game!, slideIndex: 1, itemId: 'it1', responses, roster: ['a', 'b', 'c'], openedAt: T0, isCorrect: (r) => r.correct });
    expect(gains).toEqual([
      { userId: 'a', points: 950, correct: true },
      { userId: 'b', points: 0, correct: false },
      { userId: 'c', points: 0, correct: false, answered: false },
    ]);
    st = applyLiveCommand(st, { type: 'game-tally', slideIndex: 1, gains }, new Date(T0 + 30_000));
    const again = applyLiveCommand(st, { type: 'game-tally', slideIndex: 1, gains }, new Date(T0 + 31_000));
    expect(again).toBe(st);
    expect(st.game!.points).toEqual({ a: 950, b: 0, c: 0 });
    expect(st.game!.answered).toEqual({ a: 1, b: 1 });
    expect(st.game!.streak).toEqual({ a: 1, b: 0, c: 0 });
    expect(st.game!.lastGain).toEqual({ a: 950, b: 0, c: 0 });
    const lb = gameLeaderboard(st);
    expect(lb.map((r) => [r.name, r.rank])).toEqual([['An', 1], ['Bình', 2], ['Chi', 2]]);
  });

  it('open đặt openedAt, tắt bảng xếp hạng; game-board bật', () => {
    let st = applyLiveCommand(createInitialLiveState({ sessionId: 's', pin: '1' }), { type: 'game-setup', game: { mode: 'class', seconds: 10 } });
    st = applyLiveCommand(st, { type: 'game-board', show: true });
    expect(st.game!.board).toBe(true);
    st = applyLiveCommand(st, { type: 'open', itemId: 'x', seconds: 10 }, new Date(T0));
    expect(st.game!.board).toBe(false);
    expect(st.game!.openedAt).toBe(new Date(T0).toISOString());
  });

  it('self: thời gian mỗi câu tính từ câu trước của em; câu đã tính không tính lại', () => {
    let st = applyLiveCommand(createInitialLiveState({ sessionId: 's', pin: '1' }), { type: 'game-setup', game: { mode: 'self', seconds: 20 } });
    const qs = [{ slideIndex: 1, itemId: 'it1' }, { slideIndex: 2, itemId: 'it2' }];
    const r1 = [resp('a', 1, T0 + 4000, true)];
    const g1 = tallySelfResponses({ game: st.game!, responses: r1, questions: qs, startedAt: T0, isCorrect: (r) => r.correct });
    expect(g1).toEqual([{ userId: 'a', points: 900, correct: true, slideIndex: 1 }]);
    st = applyLiveCommand(st, { type: 'game-tally', gains: g1 });
    const r2 = [...r1, resp('a', 2, T0 + 6000, true)];
    const g2 = tallySelfResponses({ game: st.game!, responses: r2, questions: qs, startedAt: T0, isCorrect: (r) => r.correct });
    expect(g2).toEqual([{ userId: 'a', points: 1050, correct: true, slideIndex: 2 }]); // 2 giây → 950 + chuỗi 100
    st = applyLiveCommand(st, { type: 'game-tally', gains: [...g1, ...g2] });
    expect(st.game!.points.a).toBe(1950);
    expect(st.game!.done!.a).toEqual([1, 2]);
  });

  it('giấy: mã thẻ, hướng thẻ → chữ, chấm theo chữ đúng', () => {
    expect(parsePaperCode(paperCardCode(7))).toBe(7);
    expect(parsePaperCode('OE1-0')).toBeNull();
    expect(parsePaperCode('xyz')).toBeNull();
    expect(paperLetterFromCorners({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe('A');
    expect(paperLetterFromCorners({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe('B'); // thẻ xoay ngược chiều kim: cạnh phải lên trên
    expect(paperLetterFromCorners({ x: 10, y: 0 }, { x: 0, y: 0 })).toBe('C');
    expect(paperLetterFromCorners({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe('D');
    const cards = paperCardsFor([{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình' }, { id: 'c', name: 'Chi' }]);
    let st = applyLiveCommand(createInitialLiveState({ sessionId: 's', pin: '1' }), { type: 'game-setup', game: { mode: 'paper', seconds: 0, cards } });
    st = applyLiveCommand(st, { type: 'paper-answer', slideIndex: 1, answers: { a: 'B', b: 'C', c: 'B' } });
    st = applyLiveCommand(st, { type: 'paper-answer', slideIndex: 1, answers: { c: null, x: 'Z' } });
    expect(st.game!.paper!['1']).toEqual({ a: 'B', b: 'C' });
    const gains = tallyPaperQuestion(st.game!, 1, 'B');
    expect(gains.map((g) => [g.userId, g.points])).toEqual([['a', 1000], ['b', 0], ['c', 0]]);
    st = applyLiveCommand(st, { type: 'game-tally', slideIndex: 1, gains });
    expect(gameLeaderboard(st).map((r) => r.name)).toEqual(['An', 'Bình', 'Chi']);
  });
});
