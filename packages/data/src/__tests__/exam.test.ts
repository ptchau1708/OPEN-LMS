import { describe, expect, it } from 'vitest';
import { cellKey, type ExamAnswer, type ExamMatrix, type Item } from '@openedu/contracts';
import { scoreItem } from '@openedu/activity-engine';
import { SEED_ITEMS } from '../seed';
import { correctResponse } from '../seed/synthetic-4a';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import {
  DEMO_EXAM_ID,
  EXAM_EXTRA_ITEMS,
  MATRIX_TOAN4_CK1,
  MATRIX_TOAN5_GK1,
  arrangeForStudent,
  arrangeIds,
  attemptSeed,
  generatePaper,
  getExamService,
  itemLevel,
  itemQType,
  matrixTotals,
  openSlots,
  scoreAttempt,
  shuffleOptions,
  summarizeIntegrity,
  toScore10,
  validateMatrix,
} from '../exam';

const BANK: Item[] = [...SEED_ITEMS, ...EXAM_EXTRA_ITEMS];
const ids = (xs: { itemId: string | null }[]) => xs.map((s) => s.itemId).filter((x): x is string => !!x);

describe('ma trận đề', () => {
  it('2 ma trận mẫu: 10 điểm, hợp lệ', () => {
    for (const m of [MATRIX_TOAN4_CK1, MATRIX_TOAN5_GK1]) {
      expect(validateMatrix(m)).toEqual([]);
      expect(matrixTotals(m).points).toBe(10);
    }
    expect(matrixTotals(MATRIX_TOAN4_CK1).questions).toBe(14);
  });

  it('mức: thẻ muc: ưu tiên, rồi difficulty, thiếu → Mức 1 ước lượng; dạng TN/TL', () => {
    expect(itemLevel({ difficulty: 'van-dung', tags: ['muc:2'] })).toEqual({ level: 2, inferred: false });
    expect(itemLevel({ difficulty: 'ket-noi' })).toEqual({ level: 2, inferred: false });
    expect(itemLevel({})).toEqual({ level: 1, inferred: true });
    expect(itemQType(BANK.find((i) => i.type === 'SHORT_ANSWER')!)).toBe('tl');
    expect(itemQType(BANK.find((i) => i.type === 'ORDERING')!)).toBe('tn');
    expect(itemQType(BANK.find((i) => i.type === 'DRAW')!)).toBeNull();
  });

  it('sinh đề A/B: đủ câu, không trùng trong mỗi đề, đúng mức/dạng, TN trước TL, tất định theo seed', () => {
    for (const m of [MATRIX_TOAN4_CK1, MATRIX_TOAN5_GK1]) {
      const { paper, shortfalls } = generatePaper(m, BANK, { seed: 42 });
      expect(openSlots(paper)).toEqual([]);
      expect(shortfalls.every((s) => s.missing === 0)).toBe(true);
      for (const v of ['A', 'B'] as const) {
        const list = ids(paper[v]);
        expect(new Set(list).size).toBe(list.length);
        expect(list.length).toBe(matrixTotals(m).questions);
        const firstTl = paper[v].findIndex((s) => s.qtype === 'tl');
        expect(paper[v].slice(firstTl).every((s) => s.qtype === 'tl')).toBe(true);
        for (const s of paper[v]) {
          const it = BANK.find((i) => i.id === s.itemId)!;
          expect(itemLevel(it).level).toBe(s.level);
          expect(itemQType(it)).toBe(s.qtype);
          expect(m.rows.find((r) => r.id === s.rowId)!.skills.some((k) => it.skills?.includes(k))).toBe(true);
        }
      }
      // B khác A ở phần lớn câu; câu dùng lại được báo.
      const a = new Set(ids(paper.A));
      const reused = ids(paper.B).filter((x) => a.has(x)).length;
      expect(reused).toBe(shortfalls.reduce((n, s) => n + s.reusedInB, 0));
      expect(reused).toBeLessThan(ids(paper.B).length / 2);
      expect(generatePaper(m, BANK, { seed: 42 }).paper).toEqual(paper);
    }
  });

  it('thiếu câu → báo rõ "Thiếu N câu Mức 3 – …"', () => {
    const m: ExamMatrix = { ...MATRIX_TOAN4_CK1, cells: { ...MATRIX_TOAN4_CK1.cells, [cellKey('PT', 3)]: { tn: 2, tl: 4, points: 1 } } };
    const { paper, shortfalls } = generatePaper(m, BANK, { seed: 1 });
    const msg = shortfalls.map((s) => s.message);
    expect(msg).toContain('Thiếu 2 câu Mức 3 – Các phép tính với số tự nhiên (tự luận)');
    expect(msg.some((x) => /^Thiếu 2 câu Mức 3 – Các phép tính .* \(trắc nghiệm\)$/.test(x))).toBe(true);
    expect(openSlots(paper).filter((o) => o.variant === 'A').length).toBe(4);
  });

  it('tránh câu dùng gần đây khi còn câu khác', () => {
    const first = generatePaper(MATRIX_TOAN4_CK1, BANK, { seed: 3 }).paper;
    const recent = Object.fromEntries(ids(first.A).map((x) => [x, 1]));
    const second = generatePaper(MATRIX_TOAN4_CK1, BANK, { seed: 3, recent }).paper;
    const overlap = ids(second.A).filter((x) => recent[x]).length;
    expect(overlap).toBeLessThan(ids(first.A).length / 2);
  });
});

describe('xáo trộn theo em', () => {
  const items = generatePaper(MATRIX_TOAN4_CK1, BANK, { seed: 9 }).paper.A.map((s) => BANK.find((i) => i.id === s.itemId)!);
  it('tất định theo seed, khác em khác thứ tự, giữ TN trước TL, giữ đủ câu', () => {
    const s1 = attemptSeed('ex', 'u1', 1);
    const a = arrangeForStudent(items, s1);
    expect(arrangeForStudent(items, s1)).toEqual(a);
    expect(a.map((i) => i.id).sort()).toEqual(items.map((i) => i.id).sort());
    expect(arrangeForStudent(items, attemptSeed('ex', 'u2', 1)).map((i) => i.id)).not.toEqual(a.map((i) => i.id));
    const q = a.map((i) => itemQType(i));
    expect(q.indexOf('tl')).toBeGreaterThan(q.lastIndexOf('tn'));
    expect(arrangeIds(items.map((i) => ({ id: i.id, qtype: itemQType(i) === 'tl' ? 'tl' : 'tn' })), s1)).toEqual(a.map((i) => i.id));
  });
  it('xáo lựa chọn nhưng giữ id; thẻ giu-thu-tu thì giữ', () => {
    const mcq = BANK.find((i) => i.type === 'MCQ' && i.payload.options.length === 4)! as Item & { type: 'MCQ' };
    const orders = new Set([1, 2, 3, 4, 5, 6].map((sd) => (shuffleOptions(mcq, sd) as typeof mcq).payload.options.map((o) => o.id).join('')));
    expect(orders.size).toBeGreaterThan(1);
    for (const o of orders) expect(o.split('').sort().join('')).toBe(mcq.payload.options.map((x) => x.id).sort().join(''));
    expect(shuffleOptions({ ...mcq, tags: ['giu-thu-tu'] }, 5)).toEqual({ ...mcq, tags: ['giu-thu-tu'] });
  });
});

describe('chấm điểm', () => {
  it('thang 10 kiểu KTĐK', () => {
    expect(toScore10(0, 10)).toBe(1);
    expect(toScore10(4.5, 10)).toBe(5);
    expect(toScore10(4.49, 10)).toBe(4);
    expect(toScore10(6.5, 13)).toBe(5);
    expect(toScore10(10, 10)).toBe(10);
  });
  it('điểm từng câu × điểm ô; bỏ trống = 0', () => {
    const { paper } = generatePaper(MATRIX_TOAN4_CK1, BANK, { seed: 5 });
    const items = Object.fromEntries(BANK.map((i) => [i.id, i]));
    const answers: Record<string, ExamAnswer> = {};
    paper.A.forEach((s, i) => { if (i % 2 === 0) answers[s.itemId!] = { response: correctResponse(items[s.itemId!]), ms: 10_000, savedAt: '' }; });
    const r = scoreAttempt(paper.A, items, answers, scoreItem);
    const expected = paper.A.filter((_, i) => i % 2 === 0).reduce((a, s) => a + s.points, 0);
    expect(r.maxScore).toBe(10);
    expect(r.score).toBeCloseTo(expected);
    expect(r.correct).toBe(Math.ceil(paper.A.length / 2));
    expect(r.score10).toBe(toScore10(expected, 10));
  });
});

describe('chống gian lận nhẹ', () => {
  it('tóm tắt trung tính, không có gì → không có dòng nào', () => {
    expect(summarizeIntegrity({ events: [], answers: {} }).lines).toEqual([]);
    const s = summarizeIntegrity({
      events: [
        { kind: 'hidden', at: '2026-11-15T01:00:00Z', awayMs: 40_000 },
        { kind: 'blur', at: '2026-11-15T01:05:00Z', awayMs: 40_000 },
        { kind: 'hidden', at: '2026-11-15T01:06:00Z' },
        { kind: 'fullscreen-exit', at: '2026-11-15T01:07:00Z' },
        { kind: 'paste-blocked', at: '2026-11-15T01:08:00Z' },
        { kind: 'duplicate-session', at: '2026-11-15T01:09:00Z' },
      ],
      answers: Object.fromEntries([1, 2, 3, 4].map((i) => [`q${i}`, { response: { choice: 'a' }, ms: i < 4 ? 1500 : 30_000, savedAt: '' }])),
    });
    expect(s.lines).toEqual([
      'Rời màn hình 3 lần (tổng 1 phút 20 giây)',
      'Thoát toàn màn hình 1 lần',
      'Thử dán chữ 1 lần (máy đã chặn)',
      'Bài được mở cùng lúc ở máy hoặc tab khác (1 lần)',
      'Trả lời rất nhanh 3 câu (dưới 3 giây)',
    ]);
    expect(s.timeline[0].kind).toBe('duplicate-session');
  });
});

describe('DemoExamService — làm bài từ đầu đến cuối', () => {
  it('HS bắt đầu, lưu, rời màn hình, nộp; GV thấy điểm + ghi chú; TT27 có điểm KTĐK; làm lại', async () => {
    const ds = new DemoDataSource({ storage: new MemoryStorage(), relayUrl: 'ws://127.0.0.1:1' });
    const svc = getExamService(ds);
    await ds.signIn('lan4a2', '123456');
    const cards = await svc.listMyExams('u-lan4a2');
    expect(cards.find((c) => c.examId === DEMO_EXAM_ID)?.state).toBe('open');
    const sess = await svc.startExam(DEMO_EXAM_ID, 'tab-aaaaaaaa');
    expect(sess.items.length).toBe(14);
    expect(sess.items.every((i) => !('key' in i) || i.key === undefined)).toBe(true);
    expect((await svc.startExam(DEMO_EXAM_ID, 'tab-bbbbbbbb')).otherSession).toBe(true);
    const full = Object.fromEntries((await ds.getItems(sess.items.map((i) => i.id))).map((i) => [i.id, i]));
    for (const it of sess.items.slice(0, 10)) await svc.saveAnswer(sess.attemptId, it.id, { response: correctResponse(full[it.id]), ms: 12_000 });
    await expect(svc.saveAnswer(sess.attemptId, 'it-khong-co', { response: { choice: 'a' }, ms: 1 })).rejects.toThrow(/không có trong bài/);
    await svc.logIntegrity(sess.attemptId, [{ kind: 'hidden', at: new Date().toISOString(), awayMs: 5000 }, { kind: 'bad' as 'blur', at: 'x' }]);
    const res = await svc.submitExam(sess.attemptId);
    expect(res.released).toBe(true);
    expect(res.correct).toBe(10);
    expect(res.perQuestion?.slice(0, 10).every((q) => q.correct)).toBe(true);
    await expect(svc.saveAnswer(sess.attemptId, sess.items[11].id, { response: { text: '1' }, ms: 1 })).rejects.toThrow(/nộp bài/);
    const events = await ds.listEvents({ userId: 'u-lan4a2', limit: 500 });
    expect(events.filter((e) => e.objectType === 'exam').length).toBe(14);
    // bắt đầu lại không tạo lần làm mới
    expect((await svc.startExam(DEMO_EXAM_ID, 'tab-cccccccc')).status).toBe('submitted');

    await ds.signIn('cothu', '123456');
    const rep = await svc.getReport(DEMO_EXAM_ID);
    const lan = rep.students.find((s) => s.student.id === 'u-lan4a2')!;
    expect(lan.attempt?.score10).toBe(res.score10);
    expect(lan.integrity?.lines).toContain('Rời màn hình 1 lần (tổng 5 giây)');
    expect(lan.integrity?.lines.some((l) => l.startsWith('Bài được mở cùng lúc'))).toBe(true);
    expect(rep.submitted).toBe(7);
    expect(rep.notStarted).toBe(1);
    expect(rep.distribution.reduce((a, b) => a + b, 0)).toBe(7);
    expect(rep.questions.every((q) => q.p === null || (q.p >= 0 && q.p <= 1))).toBe(true);
    expect(rep.cells.length).toBeGreaterThan(5);
    const sug = await ds.suggestTt27('u-lan4a2', 'CK1');
    expect(sug.subjects.toan?.score).toBe(res.score10);
    expect(sug.basis.some((b) => b.includes('điểm KTĐK'))).toBe(true);
    await svc.allowRetake(DEMO_EXAM_ID, 'u-lan4a2');

    await ds.signIn('lan4a2', '123456');
    expect((await svc.startExam(DEMO_EXAM_ID, 'tab-dddddddd')).attemptNo).toBe(2);
  });
});
