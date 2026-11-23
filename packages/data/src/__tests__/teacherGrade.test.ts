import { describe, expect, it } from 'vitest';
import type { AnyResponse, Item, Rubric, ScoreResult } from '@openedu/contracts';
import { isTeacherGrade, suggestTotal, teacherGrade, TEACHER_GRADER_MODEL } from '../assess';
import { DemoDataSource } from '../demo/DemoDataSource';
import { SEED_RUBRICS, WORK_TASK_IDS } from '../seed';
import { MemoryStorage } from '../storage';

const NOW = new Date('2026-11-11T10:00:00+07:00');
const fakeScore = (_i: Item, _r: AnyResponse | undefined): ScoreResult => ({ graded: true, correct: true, score: 1 });
const demo = () => new DemoDataSource({ storage: new MemoryStorage(), now: () => NOW, relayUrl: 'ws://127.0.0.1:1', score: fakeScore });
const R4 = SEED_RUBRICS.find((r) => r.id === 'rb-toan4-tong-hieu') as Rubric;

describe('GV tự chấm', () => {
  it('chỉ chọn mức → điểm gợi ý, câu nhận xét mẫu, tin cậy 1, không cờ', () => {
    const g = teacherGrade({ submissionId: 's', rubric: R4, level: 'H', now: NOW.toISOString() });
    expect(g.model).toBe(TEACHER_GRADER_MODEL);
    expect(isTeacherGrade(g)).toBe(true);
    expect(g.level).toBe('H');
    expect(g.total).toBe(suggestTotal('H', R4.maxScore));
    expect(g.confidence).toBe(1);
    expect(g.flags).toEqual([]);
    expect(g.feedbackStudent.length).toBeGreaterThan(10);
    expect(g.criteria.map((c) => c.criterionId)).toEqual(R4.criteria.map((c) => c.id));
  });

  it('nhập điểm → mức tự tính; GV chọn mức khác thì giữ mức GV', () => {
    expect(teacherGrade({ submissionId: 's', rubric: R4, total: 8.5, now: '' }).level).toBe('T');
    expect(teacherGrade({ submissionId: 's', rubric: R4, total: 3, now: '' }).level).toBe('C');
    const g = teacherGrade({ submissionId: 's', rubric: R4, total: 7.5, level: 'T', feedbackStudent: 'Em giỏi lắm', now: '' });
    expect([g.level, g.total, g.feedbackStudent]).toEqual(['T', 7.5, 'Em giỏi lắm']);
    expect(teacherGrade({ submissionId: 's', rubric: R4, total: 99, now: '' }).total).toBe(R4.maxScore);
  });

  it('chấm theo tiêu chí → tổng từ tiêu chí; thiếu mức và điểm → lỗi', () => {
    const full = R4.criteria.map((c) => ({ criterionId: c.id, points: c.points }));
    const g = teacherGrade({ submissionId: 's', rubric: R4, criteria: full, now: '' });
    expect([g.total, g.level]).toEqual([R4.maxScore, 'T']);
    expect(() => teacherGrade({ submissionId: 's', rubric: R4, now: '' })).toThrow(/chọn mức/);
  });

  it('demo: bài chưa có điểm AI → GV tự chấm → duyệt, cộng sao, HS thấy nhận xét', async () => {
    const ds = demo();
    await ds.signIn('cothu', '123456');
    const vy = (await ds.listSubmissions({ taskId: WORK_TASK_IDS.toan4 })).find((s) => s.studentId === 'u-vy4a6')!;
    expect(vy.grade).toBeUndefined();
    const stars = (await ds.getWallet('u-vy4a6')).stars;
    const done = await ds.reviewGrade({ submissionId: vy.id, teacherId: 'u-cothu', decision: 'edited', manual: true, final: { level: 'T', total: 9, feedbackStudent: 'Em trình bày rõ ràng, cô khen.' } });
    expect(done.status).toBe('approved');
    expect(done.final?.level).toBe('T');
    expect(done.final?.total).toBe(9);
    expect(done.final?.feedbackStudent).toBe('Em trình bày rõ ràng, cô khen.');
    expect(isTeacherGrade(done.grade)).toBe(true);
    expect((await ds.getWallet('u-vy4a6')).stars).toBe(stars + 3);
    await expect(ds.reviewGrade({ submissionId: vy.id, teacherId: 'u-cothu', decision: 'edited', manual: true, final: {} })).rejects.toThrow(/chọn mức/);
    // tự chấm lại: không cộng sao lần nữa
    const again = await ds.reviewGrade({ submissionId: vy.id, teacherId: 'u-cothu', decision: 'edited', manual: true, final: { level: 'H' } });
    expect(again.final?.level).toBe('H');
    expect((await ds.getWallet('u-vy4a6')).stars).toBe(stars + 3);
    await ds.signIn('vy4a6', '123456');
    const mine = await ds.getSubmission(vy.id);
    expect(mine?.final?.level).toBe('H');
  });
});
