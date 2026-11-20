import { statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnyResponse, Item, Rubric, ScoreResult } from '@openedu/contracts';
import {
  approvalEvents,
  buildGeminiBody,
  buildGradePrompt,
  buildOpenRouterBody,
  closeTruncated,
  gradeFromModelText,
  levelFor,
  mergeFinal,
  mockGrade,
  parseLooseJson,
  PHOTO_SAMPLES,
  sanitizeStudentFeedback,
  statusAfterGrade,
  totalFromCriteria,
  validateAiGrade,
} from '../assess';
import { DemoDataSource } from '../demo/DemoDataSource';
import { classLeaderboard, suggestTt27, vnWeekStart } from '../engagement';
import { SEED_RUBRICS, WORK_TASK_IDS } from '../seed';
import { MemoryStorage } from '../storage';

const NOW = new Date('2026-11-11T10:00:00+07:00');
const fakeScore = (_i: Item, _r: AnyResponse | undefined): ScoreResult => ({ graded: true, correct: true, score: 1 });
const demo = () => new DemoDataSource({ storage: new MemoryStorage(), now: () => NOW, relayUrl: 'ws://127.0.0.1:1', score: fakeScore });
const rubric = (id: string): Rubric => SEED_RUBRICS.find((r) => r.id === id) as Rubric;
const R4 = rubric('rb-toan4-tong-hieu');
const TASK4 = { title: 'Hai lớp trồng cây', subject: 'toan' as const, grade: 4 as const, prompt: { text: 'Hai lớp 4A và 4B trồng được tất cả 96 cây. Lớp 4A trồng được nhiều hơn lớp 4B 18 cây. Hỏi mỗi lớp trồng được bao nhiêu cây?' } };
const ctx = { rubric: R4, submissionId: 's1', model: 'test/model', now: NOW.toISOString(), imageCount: 0 };

describe('assess — lời nhắc', () => {
  it('lời nhắc ổn định (snapshot), không chứa tên HS, có tiêu chí + mã kĩ năng + quan niệm sai', () => {
    const p = buildGradePrompt({ task: TASK4, rubric: R4, text: 'Bài giải ...', imageCount: 1 });
    expect(p.system).toMatchSnapshot('system');
    expect(p.user).toMatchSnapshot('user');
    expect(p.user).toContain('id "tinh-toan"');
    expect(p.user).toContain('T4.GQ.BA-BUOC');
    expect(p.user).toContain('QUEN-NHO');
    expect(p.system).toMatch(/KHÔNG nhắc tới AI/);
    const or = buildOpenRouterBody(p, ['data:image/jpeg;base64,AAA']);
    expect(JSON.stringify(or)).toContain('"image_url"');
    expect(or.model).toBe('google/gemini-2.5-flash');
    const gm = buildGeminiBody(p, [{ mimeType: 'image/jpeg', data: 'AAA' }]) as { contents: { parts: unknown[] }[] };
    expect(gm.contents[0].parts).toHaveLength(2);
  });
});

describe('assess — đọc & sửa JSON', () => {
  it('bỏ ```, chữ thừa, dấu phẩy thừa; đóng ngoặc khi bị cắt', () => {
    expect(parseLooseJson('Đây là kết quả:\n```json\n{"a":1,}\n```').value).toEqual({ a: 1 });
    expect(parseLooseJson('{"a":[1,2,],"b":"x"}').value).toEqual({ a: [1, 2], b: 'x' });
    expect(closeTruncated('{"a":[{"b":1},{"c":"dở')).toBe('{"a":[{"b":1},{}]}');
    expect(parseLooseJson('{"criteria":[{"criterionId":"x","points":2}],"feedbackStudent":"Em làm').value).toEqual({ criteria: [{ criterionId: 'x', points: 2 }] });
    expect(() => parseLooseJson('không có json')).toThrow();
  });

  it('kẹp điểm, tính lại tổng & mức từ tiêu chí, bù tiêu chí thiếu, gắn cờ khi độ tin cậy thấp', () => {
    const { grade, repairs } = validateAiGrade(
      {
        criteria: [
          { criterionId: 'phuong-phap', points: 5, comment: 'ok' },
          { criterionId: 'tinh-toan', points: '3,5', comment: 'ok' },
          { criterionId: 'loi-giai', points: -1 },
        ],
        total: 10,
        confidence: 85,
        feedbackStudent: 'Em làm sai phép cộng. AI thấy em cố gắng. Lần sau em kiểm tra lại nhé!',
        skills: [{ code: 'T4.GQ.BA-BUOC', evidence: 'dung' }, { code: 'KHONG-CO', evidence: 'dung' }],
        issues: [{ text: 'Quên nhớ', misconception: 'QUEN-NHO' }, { text: 'x', misconception: 'BIA' }],
        flags: ['unreadable', 'lạ'],
      },
      ctx,
    );
    expect(grade.criteria.map((c) => c.points)).toEqual([3, 3.5, 0, 0]);
    expect(grade.total).toBe(6.5);
    expect(grade.level).toBe('H');
    expect(repairs.join('|')).toMatch(/kẹp điểm tiêu chí phuong-phap/);
    expect(repairs.join('|')).toMatch(/thiếu tiêu chí dap-so/);
    expect(repairs.join('|')).toMatch(/tổng AI 10/);
    expect(grade.confidence).toBeLessThan(0.7); // 0.85 − 0.2 (thiếu 1 tiêu chí) − 0.1 (nhiều chỗ sửa)
    expect(grade.flags).toEqual(['unreadable', 'low-confidence']);
    expect(grade.feedbackStudent).toBe('Em làm chưa đúng phép cộng. Lần sau em kiểm tra lại nhé!');
    expect(grade.skills).toEqual([
      { code: 'T4.GQ.BA-BUOC', evidence: 'dung' },
      { code: 'T4.PT.CONG-TRU', evidence: 'chua-ro' },
    ]);
    expect(grade.issues.map((i) => i.misconception)).toEqual(['QUEN-NHO', undefined]);
    expect(statusAfterGrade(grade)).toBe('needs-review');
  });

  it('mức TT27 và quy đổi thang', () => {
    expect([levelFor(8, 10), levelFor(7.5, 10), levelFor(5, 10), levelFor(4.5, 10)]).toEqual(['T', 'H', 'H', 'C']);
    expect(totalFromCriteria([3, 3], { maxScore: 10, criteria: [{ points: 4 }, { points: 4 }] as Rubric['criteria'] })).toEqual({ total: 7.5, max: 10 });
    expect(sanitizeStudentFeedback('Bài kém quá. Em ngoan.')).toBe('Bài chưa tốt quá. Em ngoan.');
    expect(sanitizeStudentFeedback('Em giúp ai đó rất tốt.')).toBe('Em giúp ai đó rất tốt.');
  });

  it('gradeFromModelText: JSON bọc ``` → AiGrade đủ trường', () => {
    const text = '```json\n' + JSON.stringify({ transcript: [], criteria: SEED_RUBRICS[0].criteria.map((c) => ({ criterionId: c.id, points: c.points, comment: 'Tốt' })), confidence: 0.9, feedbackStudent: 'Em làm tốt lắm!', feedbackParent: 'Con làm tốt.', feedbackTeacher: 'Vững.' }) + '\n```';
    const { grade, repairs } = gradeFromModelText(text, ctx);
    expect(grade).toMatchObject({ total: 10, max: 10, level: 'T', flags: [], model: 'test/model' });
    expect(repairs[0]).toBe('đã sửa định dạng JSON');
  });
});

describe('assess — chấm mẫu', () => {
  const sub = (id: string, text?: string, images: { url: string; width: number; height: number }[] = []) => ({ id, text, images });

  it('bài đánh máy: nhầm số lớn/số bé → C, quan niệm sai TONG-HIEU-NHAM-SO', () => {
    const g = mockGrade({ task: TASK4, rubric: R4, submission: sub('a', 'Lớp 4A trồng được là: (96 - 18) : 2 = 39 (cây)\nLớp 4B trồng được là: 39 - 18 = 21 (cây)\nĐáp số: 39 cây và 21 cây'), now: NOW.toISOString() });
    expect(g.mock).toBe(true);
    expect(g.level).toBe('C');
    expect(g.issues.some((i) => i.misconception === 'TONG-HIEU-NHAM-SO')).toBe(true);
    expect(g.feedbackStudent).not.toMatch(/\bsai\b|AI/);
  });

  it('ảnh mẫu: Hải T; Khoa quên nhớ, độ tin cậy thấp → cần GV xem; ảnh lạ → không đọc được', () => {
    const hai = mockGrade({ task: TASK4, rubric: R4, submission: sub('h', undefined, [{ url: '/x/toan4-hai-AbC.png', width: 1, height: 1 }]), now: NOW.toISOString() });
    expect([hai.level, hai.total, hai.transcript.length]).toEqual(['T', 10, 1]);
    const khoa = mockGrade({ task: TASK4, rubric: R4, submission: sub('k', undefined, [{ url: 'toan4-khoa.png', width: 1, height: 1 }]), now: NOW.toISOString() });
    expect(khoa.issues.find((i) => i.misconception === 'QUEN-NHO')).toBeTruthy();
    expect(statusAfterGrade(khoa)).toBe('needs-review');
    const lan = mockGrade({ task: { ...TASK4, subject: 'tieng-viet' }, rubric: rubric('rb-tv4-ta-con-vat'), submission: sub('l', undefined, [{ url: 'tv4-lan.png', width: 1, height: 1 }]), now: NOW.toISOString() });
    expect(lan.level).toBe('T');
    const unk = mockGrade({ task: TASK4, rubric: R4, submission: sub('u', undefined, [{ url: 'data:image/jpeg;base64,AAA', width: 1, height: 1 }]), now: NOW.toISOString() });
    expect(unk.flags).toContain('unreadable');
    expect(unk.confidence).toBeLessThanOrEqual(0.1);
  });

  it('ảnh mẫu nhỏ hơn 120 KB', () => {
    for (const s of PHOTO_SAMPLES) expect(statSync(path.join(__dirname, '..', 'seed', 'work-images', `${s.key}.png`)).size).toBeLessThanOrEqual(120 * 1024);
  });
});

describe('assess — duyệt bài → thành thạo, sao, hồ sơ', () => {
  it('approvalEvents: đúng/sai tách sự kiện, weight 2', () => {
    const g = mockGrade({ task: TASK4, rubric: R4, submission: { id: 'k', images: [{ url: 'toan4-khoa.png', width: 1, height: 1 }] }, now: NOW.toISOString() });
    const ev = approvalEvents({ submissionId: 'k', studentId: 'u', taskId: 't', taskTitle: 'T', rubric: R4, grade: g, final: mergeFinal(g, undefined) });
    expect(ev.map((e) => [e.objectId, e.result?.correct, e.result?.weight])).toEqual([
      ['work:k', true, 2],
      ['work:k:sai', false, 2],
    ]);
    expect(ev[1].result?.misconceptions).toEqual(['QUEN-NHO']);
  });

  it('demo: chấm Vy → duyệt có sửa → sự kiện + sao + mastery + hồ sơ + phụ huynh', async () => {
    const ds = demo();
    const list = await ds.listSubmissions({ taskId: WORK_TASK_IDS.toan4 });
    const vy = list.find((s) => s.studentId === 'u-vy4a6');
    expect(vy?.status).toBe('submitted');
    const before = (await ds.getSkillMastery('u-vy4a6')).find((m) => m.skillCode === 'T4.GQ.BA-BUOC')?.attempts ?? 0;
    const starsBefore = (await ds.getWallet('u-vy4a6')).stars;
    const graded = await ds.requestAiGrade(vy!.id);
    expect(graded.grade?.level).toBe('C');
    expect(graded.status).toBe('graded');
    // HS chưa thấy điểm khi chưa duyệt
    await ds.signIn('vy4a6', '123456');
    expect((await ds.getSubmission(vy!.id))?.grade).toBeUndefined();
    await ds.signIn('cothu', '123456');
    const done = await ds.reviewGrade({ submissionId: vy!.id, teacherId: 'u-cothu', decision: 'edited', final: { criteria: [{ criterionId: 'phuong-phap', points: 2, comment: 'Biết dùng sơ đồ' }] } });
    expect(done.status).toBe('approved');
    expect(done.final?.total).toBe(graded.grade!.total + 1);
    expect(done.final?.level).toBe('H'); // 4,5 → 5,5: GV sửa nâng mức → 2 sao
    const after = (await ds.getSkillMastery('u-vy4a6')).find((m) => m.skillCode === 'T4.GQ.BA-BUOC');
    expect(after?.attempts).toBe(before + 2);
    expect(after?.misconceptions['TONG-HIEU-NHAM-SO']).toBe(1);
    expect((await ds.getWallet('u-vy4a6')).stars).toBe(starsBefore + 2);
    // duyệt lại không cộng sao / sự kiện trùng
    await ds.reviewGrade({ submissionId: vy!.id, teacherId: 'u-cothu', decision: 'approved' });
    expect((await ds.getSkillMastery('u-vy4a6')).find((m) => m.skillCode === 'T4.GQ.BA-BUOC')?.attempts).toBe(before + 2);
    expect((await ds.getWallet('u-vy4a6')).stars).toBe(starsBefore + 2);
    const prof = await ds.getStudentProfile('u-vy4a6');
    expect(prof.work.latest[0].submissionId).toBe(vy!.id);
    expect(prof.timeline.some((t) => t.kind === 'work')).toBe(true);
    expect(prof.behavior).not.toBeNull();
    expect(prof.attendance?.days).toBeGreaterThan(5);
    expect(prof.tt27?.termId).toBe('GK1');
  });

  it('demo seed: trạng thái bài nộp, hồ sơ & tóm tắt phụ huynh của Ngọc Lan', async () => {
    const ds = demo();
    const all = await ds.listSubmissions();
    const by = (s: string) => all.filter((x) => x.status === s).length;
    expect(by('approved')).toBe(7);
    expect(by('needs-review')).toBeGreaterThanOrEqual(2);
    expect(by('submitted')).toBe(2);
    const lan = await ds.getStudentProfile('u-lan4a2');
    expect(lan.work.latest.length).toBe(2);
    expect(lan.work.latest.some((w) => w.thumbnail && w.kind === 'photo')).toBe(true);
    const ps = await ds.getParentSummary('u-lan4a2');
    expect(ps.work?.tip).toBeTruthy();
    expect(ps.sentences.some((s) => s.includes('được thầy cô nhận xét'))).toBe(true);
    // phụ huynh không thấy bài chưa duyệt của bạn khác
    await ds.signIn('phuhuynh4a', '123456');
    const seen = await ds.listSubmissions();
    expect(seen.every((x) => x.studentId === 'u-lan4a2' && x.status === 'approved')).toBe(true);
  });
});

describe('TT27 & thi đua', () => {
  it('suggestTt27: nháp có mức môn, nhận xét kiểu GV, phẩm chất/năng lực, căn cứ', async () => {
    const ds = demo();
    const s = await ds.suggestTt27('u-lan4a2', 'CK1');
    expect(s.status).toBe('draft');
    expect(s.subjects.toan?.level).toMatch(/[THC]/);
    expect(s.subjects.toan?.comment).toMatch(/Cần rèn thêm|cẩn thận/);
    expect(s.subjects['tieng-viet']?.level).toBe('T');
    expect(Object.keys(s.qualities)).toHaveLength(5);
    expect(s.basis.join(' ')).toMatch(/bài viết đã duyệt/);
    const saved = await ds.saveTt27({ ...s, status: 'final' });
    expect((await ds.listTt27({ studentId: 'u-lan4a2', termId: 'CK1' }))[0].status).toBe('final');
    expect('basis' in saved).toBe(false);
  });

  it('suggestTt27 thuần: không dữ liệu → vẫn có nháp', () => {
    const s = suggestTt27({ student: { id: 'x', role: 'student', name: 'Bé Na', grade: 1, avatarMascot: 'nghe', avatarColor: '#000' }, classId: 'c', termId: 'GK1', now: NOW, masteries: [], works: [], behaviorLogs: [] });
    expect(s.basis[0]).toMatch(/Chưa có dữ liệu/);
    expect(s.generalComment).toMatch(/^Na ngoan/);
  });

  it('ghi thi đua → bảng tuần (2A theo tổ), cộng sao, hoàn tác', async () => {
    const ds = demo();
    const stars0 = (await ds.getWallet('u-an2a1')).stars;
    const logs = await ds.recordBehavior({ classId: 'c-2a', behaviorId: 'bh-giup-ban', studentIds: ['u-an2a1', 'u-chi2a3'], by: 'u-colan' });
    expect(logs).toHaveLength(2);
    expect((await ds.getWallet('u-an2a1')).stars).toBe(stars0 + 2);
    const lb = await ds.getClassLeaderboard('c-2a');
    expect(lb.mode).toBe('team');
    expect(lb.teams.map((t) => t.id)).toContain('t-2a-mat-troi');
    const team = lb.teams.find((t) => t.id === 't-2a-mat-troi')!;
    const members = lb.students.filter((s) => ['u-an2a1', 'u-chi2a3'].includes(s.id)).reduce((a, s) => a + s.points, 0);
    expect(team.points).toBe(members);
    await ds.undoBehavior(logs[0].id);
    expect((await ds.getWallet('u-an2a1')).stars).toBe(stars0);
    expect((await ds.getClassLeaderboard('c-4a')).mode).toBe('student');
  });

  it('classLeaderboard thuần + đầu tuần giờ Việt Nam', () => {
    expect(vnWeekStart(new Date('2026-11-11T10:00:00+07:00'))).toBe('2026-11-08T17:00:00.000Z'); // thứ Hai 9/11, 0 giờ VN
    const lb = classLeaderboard({
      cls: { id: 'c', name: 'C', grade: 4, teacherId: 't', studentIds: ['a', 'b'], teams: [] },
      students: [{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình' }],
      logs: [
        { id: '1', studentId: 'b', classId: 'c', behaviorId: 'x', points: 2, at: '2026-11-10T01:00:00Z', by: 't' },
        { id: '2', studentId: 'a', classId: 'c', behaviorId: 'y', points: -1, at: '2026-11-10T01:00:00Z', by: 't' },
        { id: '3', studentId: 'a', classId: 'c', behaviorId: 'x', points: 5, at: '2026-10-01T01:00:00Z', by: 't' },
      ],
      from: '2026-11-08T17:00:00.000Z',
      to: '2026-11-11T03:00:00.000Z',
    });
    expect(lb.students.map((s) => [s.id, s.points, s.needsWork])).toEqual([
      ['b', 2, 0],
      ['a', -1, 1],
    ]);
  });

  it('điểm danh: lưu, bỏ HS ngoài lớp / trạng thái lạ', async () => {
    const ds = demo();
    const r = await ds.saveAttendance({ classId: 'c-4a', date: '2026-11-11', entries: { 'u-hai4a1': 'muon', 'u-an2a1': 'co-mat', 'u-lan4a2': 'xyz' as never } });
    expect(r.entries).toEqual({ 'u-hai4a1': 'muon' });
    expect((await ds.listAttendance('c-4a', { from: '2026-11-11' }))[0].date).toBe('2026-11-11');
  });
});

describe('assess — demo gọi OpenRouter từ trình duyệt (VITE_DEMO_AI_KEY)', () => {
  it('dùng chung lời nhắc + bộ kiểm tra JSON; ảnh gửi dạng dataURL', async () => {
    const { setEnvOverrides } = await import('../env');
    const { demoAiGrade } = await import('../demo/demoAi');
    setEnvOverrides({ VITE_DEMO_AI_KEY: 'sk-test' });
    let sent: { model?: string; messages?: { content: unknown }[] } = {};
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      const content = JSON.stringify({ transcript: ['...'], criteria: R4.criteria.map((c) => ({ criterionId: c.id, points: c.points })), confidence: 0.95, feedbackStudent: 'Em làm tốt!' });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const g = await demoAiGrade({
        task: { id: 't', ...TASK4, rubricId: R4.id, classId: 'c', studentIds: [], allowPhoto: true, allowText: true, createdBy: 'x' },
        rubric: R4,
        submission: { id: 's', taskId: 't', studentId: 'u', kind: 'photo', images: [{ url: 'data:image/jpeg;base64,AAA', width: 1, height: 1 }], submittedBy: 'student', status: 'submitted', createdAt: NOW.toISOString() },
        now: NOW.toISOString(),
        fetchImpl,
      });
      expect(g).toMatchObject({ total: 10, level: 'T', model: 'google/gemini-2.5-flash' });
      expect(JSON.stringify(sent.messages?.[1].content)).toContain('data:image/jpeg;base64,AAA');
    } finally {
      setEnvOverrides({});
    }
  });
});
