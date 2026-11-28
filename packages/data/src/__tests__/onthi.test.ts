import { describe, expect, it } from 'vitest';
import { defaultMinutes, defaultPassScore, type Item, type ScoreResult } from '@openedu/contracts';
import { isComplete, scoreItem } from '@openedu/activity-engine';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import { buildCards, compareOnThi, getOnThiService, onThiPoints, rankRows, summarize, validateSet } from '../onthi';
import { rightAnswer } from '../onthi/seed';
import { ONTHI_TOAN5_ITEMS, ONTHI_TV5_ITEMS } from '../seed';

const R = (graded: boolean, correct: boolean, score: number): ScoreResult => ({ graded, correct, score });

describe('Ôn thi — chấm điểm', () => {
  it('cả-hoặc-không; Đúng – Sai nhiều ý ở kiểu VioEdu tính lũy tiến', () => {
    expect(onThiPoints('tn', 'MATCHING', R(true, false, 0.75), 10)).toBe(0);
    expect(onThiPoints('tn', 'MATCHING', R(true, true, 1), 10)).toBe(10);
    expect(onThiPoints('vio', 'MCQ_MULTIPLE', R(true, false, 0.66), 1)).toBe(0);
    expect(onThiPoints('vio', 'TRUE_FALSE_MULTI', R(true, false, 0.65), 1)).toBe(0.65);
    expect(onThiPoints('tn', 'TRUE_FALSE_MULTI', R(true, false, 0.65), 10)).toBe(0);
    expect(onThiPoints('vio', 'MCQ', R(false, false, 0), 1)).toBe(0);
  });

  it('mức đạt và thời gian mặc định', () => {
    expect(defaultPassScore('tn', 30)).toBe(240);
    expect(defaultPassScore('vio', 30)).toBe(24);
    expect(defaultMinutes('tn', 30)).toBe(30);
    expect(defaultMinutes('vio', 30)).toBe(20);
    expect(defaultMinutes('vio', 3)).toBe(5);
  });

  it('summarize: câu đúng / sai / bỏ qua; câu làm dở tính là bỏ qua', () => {
    const items: Item[] = ONTHI_TOAN5_ITEMS.slice(0, 4);
    const [a, b, c, d] = items;
    const answers = {
      [a.id]: { response: rightAnswer(a), ms: 1000 },
      [b.id]: { response: { choice: 'a' }, ms: 2000 }, // sai (đúng là b)
      [d.id]: { response: { choices: [] }, ms: 500 }, // chọn nhiều nhưng chưa chọn gì → bỏ qua
    };
    void c;
    const s = summarize({ style: 'vio', points: 1, items, answers, score: scoreItem, isComplete });
    expect([s.score, s.maxScore, s.correct, s.wrong, s.skipped]).toEqual([1, 4, 1, 1, 2]);
    expect(s.items.map((x) => x.answered)).toEqual([true, true, false, false]);
  });

  it('mọi câu mẫu: câu trả lời đúng được trọn điểm', () => {
    for (const style of ['tn', 'vio'] as const) {
      const items = style === 'tn' ? ONTHI_TV5_ITEMS : ONTHI_TOAN5_ITEMS;
      const answers = Object.fromEntries(items.map((i) => [i.id, { response: rightAnswer(i), ms: 1 }]));
      const s = summarize({ style, points: style === 'tn' ? 10 : 1, items, answers, score: scoreItem, isComplete });
      expect(s.score, style).toBe(s.maxScore);
      expect(s.skipped, style).toBe(0);
    }
  });

  it('xếp hạng: điểm → thời gian → số câu sai; hạng bằng nhau khi trùng cả ba', () => {
    const base = { name: 'x', at: '2026-11-28T00:00:00Z' };
    const rows = rankRows([
      { ...base, studentId: 'a', score: 20, durationMs: 9000, wrong: 1 },
      { ...base, studentId: 'b', score: 20, durationMs: 8000, wrong: 3 },
      { ...base, studentId: 'c', score: 25, durationMs: 20000, wrong: 0 },
      { ...base, studentId: 'd', score: 20, durationMs: 8000, wrong: 3 },
      { ...base, studentId: 'e', score: 20, durationMs: 8000, wrong: 2 },
    ]);
    expect(rows.map((r) => `${r.studentId}${r.rank}`)).toEqual(['c1', 'e2', 'b3', 'd3', 'a5']);
    expect(compareOnThi({ score: 5, durationMs: 1, wrong: 0, at: 'a' }, { score: 5, durationMs: 1, wrong: 0, at: 'b' })).toBeLessThan(0);
  });

  it('khóa theo thứ tự: chỉ mở khi đạt bài liền trước cùng môn', () => {
    const mk = (id: string, position: number, lockOrder: boolean, subject: 'toan' | 'tieng-viet' = 'tieng-viet') => ({
      id, style: 'tn' as const, title: id, grade: 5 as const, subject, itemIds: ['x'], minutes: 5, points: 10, passScore: 8,
      lockOrder, position, showBoard: true, revealAnswers: true, status: 'published' as const,
    });
    const sets = [mk('b2', 2, true), mk('b1', 1, false), mk('t1', 1, true, 'toan')];
    const none = buildCards(sets, () => undefined, () => 0, () => undefined);
    expect(none.map((c) => `${c.setId}:${c.locked}`)).toEqual(['b1:false', 'b2:true', 't1:false']);
    expect(none.find((c) => c.setId === 'b2')?.lockedBy).toBe('b1');
    const passed = buildCards(sets, (id) => (id === 'b1' ? { attemptId: 'a', score: 10, durationMs: 1, wrong: 0, passed: true, at: '' } : undefined), () => 1, () => undefined);
    expect(passed.find((c) => c.setId === 'b2')?.locked).toBe(false);
  });

  it('validateSet', () => {
    const ok = { title: 'Bài 1', itemIds: ['a', 'b'], minutes: 5, points: 10, passScore: 16 };
    expect(validateSet(ok)).toBeNull();
    expect(validateSet({ ...ok, title: ' ' })).toMatch(/tên/);
    expect(validateSet({ ...ok, itemIds: ['a', 'a'] })).toMatch(/lặp/);
    expect(validateSet({ ...ok, passScore: 21 })).toMatch(/Mức đạt/);
    expect(validateSet({ ...ok, minutes: 0 })).toMatch(/phút/);
  });
});

describe('Ôn thi — chế độ demo', () => {
  const make = () => new DemoDataSource({ storage: new MemoryStorage(), relayUrl: 'ws://127.0.0.1:1' });

  it('HS lớp 5A: thấy bài mẫu, bài 2 Tiếng Việt khóa; làm bài 1, nộp, đạt → mở bài 2; bảng xếp hạng', async () => {
    const ds = make();
    await ds.signIn('khang5a1', '123456');
    const svc = getOnThiService(ds);
    const cards = await svc.myCards('tn');
    expect(cards.map((c) => [c.title, c.locked])).toEqual([['Tiếng Việt 5 – Bài luyện 1', false], ['Tiếng Việt 5 – Bài luyện 2', true]]);
    expect(cards[0].maxScore).toBe(80);
    expect(cards[0].passScore).toBe(64);
    await expect(svc.start(cards[1].setId)).rejects.toThrow(/cần đạt bài/);

    const sess = await svc.start(cards[0].setId);
    expect(sess.items.length).toBe(8);
    expect(sess.items.every((i) => !('key' in i))).toBe(true);
    const full = await ds.getItems(sess.items.map((i) => i.id));
    for (const it of full) await svc.saveAnswer(sess.attemptId, it.id, { response: rightAnswer(it), ms: 3000 });
    const again = await svc.start(cards[0].setId);
    expect(again.attemptId).toBe(sess.attemptId);
    expect(Object.keys(again.answers).length).toBe(8);

    const res = await svc.submit(sess.attemptId);
    expect([res.score, res.maxScore, res.passed, res.correct, res.wrong, res.skipped, res.newBest]).toEqual([80, 80, true, 8, 0, 0, false]);
    expect(Object.keys(res.keys ?? {}).length).toBe(8);
    await expect(svc.saveAnswer(sess.attemptId, full[0].id, { response: null, ms: 0 })).rejects.toThrow(/đã nộp/);

    const after = await svc.myCards('tn');
    expect(after[1].locked).toBe(false);
    expect(after[0].best?.score).toBe(80);

    const board = await svc.board(cards[0].setId);
    expect(board.me?.rank).toBe(1);
    expect(board.rows.length).toBe(4);
    expect(board.rows[0].name).toBe('Minh Khang');
  });

  it('kiểu VioEdu: bỏ qua câu không tính sai; Đúng – Sai nhiều ý được điểm lũy tiến', async () => {
    const ds = make();
    await ds.signIn('khang5a1', '123456');
    const svc = getOnThiService(ds);
    const [card] = await svc.myCards('vio');
    const sess = await svc.start(card.setId);
    const tf = (await ds.getItems(sess.items.map((i) => i.id))).find((i) => i.type === 'TRUE_FALSE_MULTI')!;
    const truth = (tf.key as { truth: Record<string, boolean> }).truth;
    const ids = Object.keys(truth);
    await svc.saveAnswer(sess.attemptId, tf.id, { response: { picks: { ...truth, [ids[3]]: !truth[ids[3]] } }, ms: 9000 }); // đúng 3/4 ý
    const res = await svc.submit(sess.attemptId);
    expect(res.score).toBe(0.65);
    expect([res.correct, res.wrong, res.skipped]).toEqual([0, 1, sess.items.length - 1]);
  });

  it('thầy/cô: tạo bài luyện cho khối, kiểm tra hợp lệ, xem kết quả cả khối', async () => {
    const ds = make();
    await ds.signIn('thayquang', '123456');
    const svc = getOnThiService(ds);
    expect((await svc.listSets({ grade: 5 })).length).toBe(4);
    const items = ONTHI_TV5_ITEMS.slice(0, 3).map((i) => i.id);
    await expect(svc.saveSet({ style: 'tn', title: 'Lạ', grade: 5, subject: 'tieng-viet', itemIds: ['it-toan2-que-26-7'], minutes: 5, points: 10, passScore: 0, lockOrder: false, position: 3, showBoard: true, revealAnswers: true, status: 'published' }))
      .rejects.toThrow(/lớp 5/);
    const saved = await svc.saveSet({ style: 'tn', title: 'Bài luyện mới', grade: 5, subject: 'tieng-viet', itemIds: items, minutes: 5, points: 10, passScore: 24, lockOrder: false, position: 3, showBoard: false, revealAnswers: true, status: 'published' });
    expect(saved.createdByName).toBe('Thầy Quang');
    const rep = await svc.report('ot-set-tn-1');
    expect(rep.students.length).toBe(4);
    expect(rep.students.filter((s) => s.best).length).toBe(3);
    expect(rep.items.length).toBe(8);
    expect(rep.items.every((i) => i.tried <= 3)).toBe(true);

    await ds.signOut();
    await ds.signIn('ngan5a2', '123456');
    const hidden = await svc.board(saved.id);
    expect(hidden.hidden).toBe(true);
    const types = await svc.practiceTypes('vio');
    expect(types.find((t) => t.type === 'TRUE_FALSE_MULTI')?.count).toBe(2);
    const pr = await svc.practiceItems('tn', 'MATCHING');
    expect(pr.length).toBeGreaterThan(0);
    expect(pr.every((i) => i.type === 'MATCHING')).toBe(true);
  });

  it('chỉ học sinh mở được bài; HS khối khác không thấy bài khối 5', async () => {
    const ds = make();
    await ds.signIn('lan4a2', '123456');
    const svc = getOnThiService(ds);
    expect(await svc.myCards('tn')).toEqual([]);
    await expect(svc.start('ot-set-tn-1')).rejects.toThrow(/Không tìm thấy/);
    await ds.signOut();
    await ds.signIn('thayquang', '123456');
    await expect(svc.myCards('tn')).rejects.toThrow(/học sinh/);
  });
});
