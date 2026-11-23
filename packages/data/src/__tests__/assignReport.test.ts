import { describe, expect, it } from 'vitest';
import type { Assignment, LearningEvent, Lesson } from '@openedu/contracts';
import { buildAssignmentReport, inPeriod, needsRetry, periodRange, roundsOf } from '../assignReport';
import { reportXlsx } from '../export/assignReportXlsx';
import { readXlsx } from '../export/xlsx';

const lesson = { id: 'l1', title: 'LT', subject: 'toan', grade: 5, ownerId: 't', status: 'published', updatedAt: '', slides: [
  { id: 's1', layout: 'activity', itemId: 'i1' }, { id: 's2', layout: 'title' }, { id: 's3', layout: 'activity', itemId: 'i2' }, { id: 's4', layout: 'activity', itemId: 'i3' },
] } as unknown as Lesson;
const a: Assignment = { id: 'a1', targetType: 'lesson', targetId: 'l1', title: 'Luyện tập', classId: 'c', studentIds: [], openAt: '2026-11-20T01:00:00Z', dueAt: '2026-11-21T13:00:00Z', createdBy: 't' };
let n = 0;
const ans = (u: string, item: string, at: string, correct: boolean, score?: number, as = 'a1'): LearningEvent =>
  ({ id: `e${++n}`, userId: u, verb: 'answered', objectType: 'item', objectId: item, assignmentId: as, at, result: { correct, ...(score !== undefined ? { score } : {}) } }) as LearningEvent;
const students = [{ id: 'an', name: 'An' }, { id: 'binh', name: 'Bình' }, { id: 'chi', name: 'Chi' }];

describe('báo cáo bài giao', () => {
  const events = [
    // An: sai câu 1 lần đầu rồi làm lại đúng; đúng 2, 3 → 100%, đúng ngay lần đầu 2, xong đúng hạn.
    ans('an', 'i1', '2026-11-20T02:00:00Z', false), ans('an', 'i1', '2026-11-20T02:01:00Z', true),
    ans('an', 'i2', '2026-11-20T02:03:00Z', true), ans('an', 'i3', '2026-11-20T02:05:00Z', true),
    // Bình: xong sau hạn, câu 3 nửa điểm.
    ans('binh', 'i1', '2026-11-21T14:00:00Z', true), ans('binh', 'i2', '2026-11-21T14:02:00Z', false), ans('binh', 'i3', '2026-11-21T14:04:00Z', false, 0.5),
    // Sự kiện của lần giao khác không tính.
    ans('chi', 'i1', '2026-11-20T03:00:00Z', true, undefined, 'a-khac'),
  ];
  const r = buildAssignmentReport({ assignment: a, lesson, students, events, now: new Date('2026-11-23T00:00:00Z') });

  it('điểm từng em theo lần trả lời cuối, đúng ngay lần đầu, muộn / quá hạn', () => {
    const an = r.students.find((s) => s.studentId === 'an')!;
    expect(an).toMatchObject({ status: 'hoan-thanh', answered: 3, total: 3, percent: 100, firstTry: 2, late: false, minutes: 5 });
    const binh = r.students.find((s) => s.studentId === 'binh')!;
    expect(binh).toMatchObject({ status: 'hoan-thanh', percent: 50, late: true });
    const chi = r.students.find((s) => s.studentId === 'chi')!;
    expect(chi).toMatchObject({ status: 'chua-lam', percent: null, overdue: true });
    expect(r.summary).toEqual({ assigned: 3, started: 2, completed: 2, late: 1, overdue: 1, avgPercent: 75 });
  });

  it('tỉ lệ đúng từng câu theo thứ tự trong bài', () => {
    expect(r.questions.map((q) => [q.itemId, q.percent])).toEqual([['i1', 100], ['i2', 50], ['i3', 50]]);
  });

  it('em cần giao lại: chưa xong hoặc dưới 80%', () => {
    expect(needsRetry(r).sort()).toEqual(['binh', 'chi']);
  });

  it('chỉ tính HS được giao riêng', () => {
    const r2 = buildAssignmentReport({ assignment: { ...a, studentIds: ['an'] }, lesson, students, events });
    expect(r2.students.map((s) => s.studentId)).toEqual(['an']);
  });

  it('các lượt giao lại nối về lần đầu', () => {
    const a2 = { ...a, id: 'a2', parentId: 'a1', round: 2, openAt: '2026-11-25T01:00:00Z' };
    const other = { ...a, id: 'x', targetId: 'l9' };
    expect(roundsOf(a2, [other, a2, a]).map((x) => x.id)).toEqual(['a1', 'a2']);
  });

  it('xuất Excel 4 trang tính đọc lại được', () => {
    const bytes = reportXlsx({ title: 'Tuần 16/11 – 22/11/2026', className: '5A2', reports: [r], itemLabel: (id) => `Câu ${id}` });
    const wb = readXlsx(bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Tổng hợp', 'Điểm theo học sinh', 'Chi tiết', 'Câu hỏi']);
    const grid = wb.sheets[1]!.rows;
    expect(grid.flat()).toContain('Quá hạn');
  });
});

describe('đợt báo cáo (giờ Việt Nam)', () => {
  const at = new Date('2026-11-23T01:00:00Z'); // 08:00 thứ Hai 23/11/2026 giờ VN
  it('ngày, tuần (thứ Hai → CN), tháng', () => {
    expect(periodRange('ngay', at)).toMatchObject({ from: '2026-11-22T17:00:00.000Z', to: '2026-11-23T17:00:00.000Z', label: 'Ngày 23/11/2026' });
    expect(periodRange('tuan', new Date('2026-11-22T10:00:00Z'))).toMatchObject({ from: '2026-11-15T17:00:00.000Z', label: 'Tuần 16/11/2026 – 22/11/2026' });
    expect(periodRange('thang', at)).toMatchObject({ from: '2026-10-31T17:00:00.000Z', to: '2026-11-30T17:00:00.000Z', label: 'Tháng 11/2026' });
    expect(periodRange('thang', new Date('2026-12-15T00:00:00Z')).to).toBe('2026-12-31T17:00:00.000Z');
  });
  it('học kì I / II theo năm học', () => {
    expect(periodRange('hoc-ki', at).label).toBe('Học kì I năm học 2026–2027');
    expect(periodRange('hoc-ki', new Date('2027-03-01T00:00:00Z')).label).toBe('Học kì II năm học 2026–2027');
    expect(periodRange('hoc-ki', new Date('2027-01-15T10:00:00Z')).label).toBe('Học kì I năm học 2026–2027');
  });
  it('lần giao thuộc đợt theo ngày mở', () => {
    const w = periodRange('tuan', at);
    expect(inPeriod({ openAt: '2026-11-23T02:00:00Z' }, w)).toBe(true);
    expect(inPeriod({ openAt: '2026-11-22T16:59:00Z' }, w)).toBe(false);
  });
});

describe('giao lại & quá hạn — việc hôm nay của HS (demo)', () => {
  it('lượt mới làm lại từ đầu; quá hạn + khóa → không mở được', async () => {
    const { DemoDataSource } = await import('../demo/DemoDataSource');
    const { MemoryStorage } = await import('../storage');
    const ds = new DemoDataSource({ storage: new MemoryStorage(), relayUrl: 'ws://127.0.0.1:1' });
    await ds.signIn('colan', '123456');
    const me = (await ds.getCurrentUser())!;
    const cls = (await ds.listClasses(me.id))[0]!;
    const lesson = (await ds.listLessons({})).find((l) => l.grade === cls.grade && l.slides.some((s) => s.itemId))!;
    const H = 3_600_000;
    const past = new Date(Date.now() - H).toISOString();
    const a1 = await ds.createAssignment({ targetType: 'lesson', targetId: lesson.id, title: 'L1', classId: cls.id, studentIds: [], openAt: new Date(Date.now() - 3 * H).toISOString(), createdBy: me.id });
    const lock = await ds.createAssignment({ targetType: 'lesson', targetId: lesson.id, title: 'Khóa', classId: cls.id, studentIds: [], openAt: new Date(Date.now() - 2 * H).toISOString(), dueAt: past, createdBy: me.id, latePolicy: 'lock', parentId: a1.id, round: 2 });
    await ds.signOut();
    const sid = cls.studentIds[0]!;
    const stu = (await ds.listStudents(cls.id)).find((s) => s.id === sid)!;
    await ds.signIn(stu.username!, '123456');
    await ds.saveProgress({ userId: sid, lessonId: lesson.id, slideIndex: 2, completedSlides: [lesson.slides[0]!.id], answers: {}, starsEarned: 0, updatedAt: new Date(Date.now() - 2.5 * H).toISOString() });
    await expect(ds.startAssignment(lock.id)).rejects.toThrow(/hết hạn/);
    const tasks = await ds.getTodayTasks(sid);
    const t = tasks.find((x) => x.targetId === lesson.id)!;
    expect(t).toMatchObject({ assignmentId: lock.id, locked: true });
  });
});
