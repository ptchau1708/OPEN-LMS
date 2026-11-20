import { describe, expect, it } from 'vitest';
import type { ClassInfo, GuardianCode, LearningEvent, Profile, SkillMastery, Tt27Evaluation } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import {
  DEMO_SIBLING_CODE,
  DemoSchoolSource,
  buildClassReportRow,
  buildParentDigest,
  checkRedeem,
  codeStatus,
  generateGuardianCode,
  generateStudentAccounts,
  givenNameSlug,
  isWellFormedCode,
  normalizeParentLogin,
  parseNameList,
  teacherUsername,
  toCsv,
  toTsv,
  tt27Rows,
  aggregateGradeHeatmap,
} from '../school';

let clock = new Date('2026-11-12T10:00:00+07:00');
function setup() {
  const storage = new MemoryStorage();
  const ds = new DemoDataSource({ storage, now: () => clock, relayUrl: 'ws://127.0.0.1:1', score: () => ({ graded: true, correct: true, score: 1 }) });
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return { ds, school: new DemoSchoolSource(ds, { rand }) };
}

describe('mã liên kết phụ huynh', () => {
  it('sinh 8 kí tự trong bảng chữ dễ đọc, kiểm tra trạng thái', () => {
    const c = generateGuardianCode();
    expect(c).toHaveLength(8);
    expect(isWellFormedCode(c)).toBe(true);
    expect(isWellFormedCode('ABCD-EF0O')).toBe(false);
    const now = new Date('2026-11-12T00:00:00Z');
    const base: GuardianCode = { code: c, studentId: 's', classId: 'c', createdBy: 't', createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 86_400_000).toISOString() };
    expect(codeStatus(base, now)).toBe('active');
    expect(codeStatus(base, new Date(now.getTime() + 2 * 86_400_000))).toBe('expired');
    expect(codeStatus({ ...base, usedAt: now.toISOString() }, now)).toBe('used');
    expect(codeStatus({ ...base, revokedAt: now.toISOString() }, now)).toBe('revoked');
    expect(checkRedeem(base, now, { guardians: 4, alreadyLinked: false })).toMatchObject({ ok: false });
    expect(checkRedeem(base, now, { guardians: 3, alreadyLinked: false })).toEqual({ ok: true });
  });

  it('vòng đời: GV tạo mã → phụ huynh đăng ký bằng mã → mã đã dùng; thêm con bằng mã mẫu; GV gỡ liên kết', async () => {
    clock = new Date('2026-11-12T10:00:00+07:00');
    const { ds, school } = setup();
    await ds.signIn('cothu', '123456');
    const codes = await school.createGuardianCodes('c-4a');
    expect(codes).toHaveLength(8);
    expect(new Set(codes.map((c) => c.code)).size).toBe(8);
    // Mã cũ còn hiệu lực của Vy bị thu hồi khi tạo mã mới.
    const all = await school.listGuardianCodes('c-4a');
    expect(all.find((c) => c.code === 'QWTR4A6M')?.revokedAt).toBeTruthy();
    await expect(school.createGuardianCodes('c-2a')).rejects.toThrow(/lớp mình/);
    const khoa = codes.find((c) => c.studentId === 'u-khoa4a3') as GuardianCode;
    await ds.signOut();

    await expect(school.registerParent({ login: '0912 345 678', password: '12', name: 'Mẹ Khoa', code: khoa.code })).rejects.toThrow(/6 kí tự/);
    await expect(school.registerParent({ login: '0912 345 678', password: 'matkhau1', name: 'Mẹ Khoa', code: 'ZZZZZZZZ' })).rejects.toThrow(/Mã chưa đúng/);
    const parent = await school.registerParent({ login: '+84 912 345 678', password: 'matkhau1', name: 'Mẹ Khoa', code: khoa.code.toLowerCase().replace(/(....)/, '$1-') });
    expect(parent.role).toBe('parent');
    expect(parent.username).toBe('0912345678');
    expect((await ds.getCurrentUser())?.id).toBe(parent.id);
    expect((await ds.listChildren(parent.id)).map((c) => c.id)).toEqual(['u-khoa4a3']);
    // Đăng nhập lại bằng mật khẩu riêng.
    await ds.signOut();
    await expect(ds.signIn('0912345678', '123456')).rejects.toThrow();
    await ds.signIn('0912345678', 'matkhau1');
    // Mã đã dùng không dùng lại được.
    await expect(school.redeemGuardianCode(khoa.code)).resolves.toMatchObject({ alreadyLinked: true });
    await ds.signOut();
    await expect(school.registerParent({ login: 'bo.khoa@gmail.com', password: 'matkhau2', name: 'Bố Khoa', code: khoa.code })).rejects.toThrow(/đã được dùng/);

    // Phụ huynh mẫu thêm con thứ hai bằng mã in sẵn.
    await ds.signIn('phuhuynh4a', '123456');
    const r = await school.redeemGuardianCode(DEMO_SIBLING_CODE);
    expect(r.child.name).toBe('Bảo Chi');
    expect((await ds.listChildren('u-phuhuynh4a')).map((c) => c.id).sort()).toEqual(['u-chi2a3', 'u-lan4a2']);

    // GV xem & gỡ liên kết.
    await ds.signIn('cothu', '123456');
    const links = await school.listGuardianLinks('c-4a');
    expect(links.map((l) => l.studentName).sort()).toEqual(['Ngọc Lan', 'Đăng Khoa'].sort());
    expect(links.find((l) => l.studentId === 'u-khoa4a3')?.parentLogin).toBe('0912***678');
    await school.revokeGuardianLink(parent.id, 'u-khoa4a3');
    expect(await ds.listChildren(parent.id)).toEqual([]);
  });

  it('mã hết hạn sau 14 ngày; nhập sai quá 10 lần/ngày bị chặn', async () => {
    clock = new Date('2026-11-12T10:00:00+07:00');
    const { ds, school } = setup();
    await ds.signIn('colan', '123456');
    const [c] = await school.createGuardianCodes('c-2a', ['u-binh2a2']);
    clock = new Date(clock.getTime() + 15 * 86_400_000);
    await ds.signIn('phuhuynh', '123456');
    await expect(school.redeemGuardianCode(c.code)).rejects.toThrow(/hết hạn/);
    for (let i = 0; i < 9; i++) await expect(school.redeemGuardianCode('AAAAAAAA')).rejects.toThrow();
    await expect(school.redeemGuardianCode('AAAAAAAA')).rejects.toThrow(/quá nhiều lần/);
  });
});

describe('tài khoản hàng loạt', () => {
  it('tách danh sách dán từ Excel, bỏ STT, tiêu đề, dòng trống', () => {
    expect(parseNameList('STT\tHọ và tên\n1\tNguyễn Văn An\n2. Trần Thị Bích  Ngọc\n\n3) Lê Đức Anh;Nam\n  Phạm Quỳnh   Chi ')).toEqual(['Nguyễn Văn An', 'Trần Thị Bích Ngọc', 'Lê Đức Anh', 'Phạm Quỳnh Chi']);
  });
  it('bỏ dấu, theo số thứ tự trong lớp, không trùng cả trường', () => {
    expect(givenNameSlug('Nguyễn Thị Ngọc Ánh')).toBe('anh');
    expect(givenNameSlug('Đặng Đức')).toBe('duc');
    const acc = generateStudentAccounts(['Nguyễn Văn An', 'Lê Thu Ân', 'Trần Đức', 'Phạm An'], '4B', ['an4b1', 'an4b2', 'duc4b3'], 1);
    expect(acc.map((a) => a.username)).toEqual(['an4b3', 'an4b4', 'duc4b4', 'an4b5']);
    expect(new Set(acc.map((a) => a.username)).size).toBe(4);
    for (const a of acc) expect(a.password).toMatch(/^[1-9]\d{5}$/);
    expect(teacherUsername('Nguyễn Thị Thu', ['thunt'])).toBe('thunt2');
  });
  it('admin tạo HS cho lớp mới, HS đăng nhập được bằng mật khẩu sinh ra', async () => {
    const { ds, school } = setup();
    await ds.signIn('admin', '123456');
    const t = await school.createTeacher({ name: 'Trần Văn Bình' });
    expect(t.username).toBe('binhtv');
    const cls = await school.saveClass({ name: '5a', grade: 5, teacherId: t.userId });
    expect(cls.name).toBe('5A');
    const slips = await school.bulkCreateStudents(cls.id, parseNameList('Hoàng Minh Anh\nVũ Bảo Ngọc'));
    expect(slips.map((s) => s.username)).toEqual(['anh5a1', 'ngoc5a2']);
    expect((await ds.listStudents(cls.id)).map((s) => s.name)).toEqual(['Hoàng Minh Anh', 'Vũ Bảo Ngọc']);
    const reset = await school.resetPassword(slips[0].userId);
    await ds.signOut();
    await expect(ds.signIn('anh5a1', slips[0].password)).rejects.toThrow();
    expect((await ds.signIn('anh5a1', reset.password)).grade).toBe(5);
    await expect(school.bulkCreateStudents(cls.id, ['X'])).rejects.toThrow(/quản trị/);
  });
});

describe('báo cáo trường', () => {
  it('dòng lớp: HS hoạt động, đúng, thành thạo TB (≥ 3 lần), lỗ hổng, chuyên cần, TT27', () => {
    const cls: ClassInfo = { id: 'c', name: '3A', grade: 3, teacherId: 't', studentIds: ['a', 'b', 'c'], teams: [] };
    const ev = (userId: string, verb: LearningEvent['verb'], correct?: boolean, objectType: LearningEvent['objectType'] = 'item'): LearningEvent => ({ id: Math.random().toString(), userId, verb, objectType, objectId: 'x', at: '2026-11-10T03:00:00Z', ...(correct !== undefined ? { result: { correct } } : {}) });
    const m = (userId: string, p: number, attempts: number, level: SkillMastery['level']): SkillMastery => ({ userId, skillCode: 'T3.X', level, p, attempts, correctStreak: 0, distinctDays: 1, misconceptions: {}, reviewStage: 0, wasGap: false, recentWrong: [] });
    const row = buildClassReportRow({
      cls,
      events: [ev('a', 'answered', true), ev('a', 'answered', false), ev('b', 'answered', true), ev('b', 'completed', undefined, 'lesson'), ev('zz', 'answered', true)],
      masteries: { a: [m('a', 0.9, 5, 'vung')], b: [m('b', 0.4, 4, 'can-on'), m('b', 1, 1, 'dang-hoc')] },
      attendance: [{ classId: 'c', date: '2026-11-10', entries: { a: 'co-mat', b: 'muon', c: 'vang-co-phep' } }],
      tt27: [{ studentId: 'a', status: 'final' } as Tt27Evaluation, { studentId: 'b', status: 'draft' } as Tt27Evaluation],
      worksApproved: 2,
    });
    expect(row).toMatchObject({ students: 3, activeStudents: 2, answered: 3, lessonsCompleted: 1, studentsWithGaps: 1, tt27Final: 1, worksApproved: 2 });
    expect(row.correctRate).toBeCloseTo(2 / 3);
    expect(row.avgMastery).toBeCloseTo(0.65);
    expect(row.attendanceRate).toBeCloseTo(2 / 3);
  });

  it('demo: admin thấy cả trường, GV chỉ lớp mình; bản đồ khối gộp lớp', async () => {
    clock = new Date();
    const { ds, school } = setup();
    await ds.signIn('admin', '123456');
    const o = await school.getSchoolOverview();
    expect(o.rows.map((r) => r.name)).toEqual(['1B', '2A', '3C', '4A']);
    expect(o.students).toBe(14);
    const r4 = o.rows.find((r) => r.name === '4A');
    expect(r4?.avgMastery).toBeGreaterThan(0.3);
    expect(r4?.studentsWithGaps).toBeGreaterThan(0);
    expect(o.mastery.some((m) => m.grade === 4 && m.subject === 'toan' && m.avgMastery !== null)).toBe(true);
    await ds.signIn('cothu', '123456');
    expect((await school.getSchoolOverview()).rows.map((r) => r.name)).toEqual(['4A']);
    const hm = await school.getGradeHeatmap(4, 'toan');
    expect(hm.classes.map((c) => c.name)).toEqual(['4A']);
    expect(hm.skills.length).toBeGreaterThan(5);
    const code = hm.skills[0].code;
    expect(hm.total[code].n).toBe(hm.cells['c-4a'][code].n);
    await ds.signIn('hai4a1', '123456');
    await expect(school.getSchoolOverview()).rejects.toThrow(/thầy cô/);
  });

  it('gộp bản đồ nhiệt nhiều lớp: p trung bình có trọng số số HS', () => {
    const hm = (id: string, ps: number[]) => ({
      classId: id, subject: 'toan' as const, grade: 4 as const, generatedAt: '',
      students: ps.map((_, i) => ({ id: `${id}${i}`, name: '', avatarMascot: '', avatarColor: '' })),
      skills: [{ code: 'K', short: 'K', topic: 't', strand: 'SO' as never, grade: 4 as const }],
      cells: Object.fromEntries(ps.map((p, i) => [`${id}${i}`, { K: { level: (p >= 0.85 ? 'vung' : 'can-on') as 'vung', p, attempts: 3 } }])),
      skillSummary: {},
    });
    const g = aggregateGradeHeatmap(4, 'toan', [{ classId: 'a', name: '4A', heatmap: hm('a', [1, 0.5]) }, { classId: 'b', name: '4B', heatmap: hm('b', [0.2]) }]);
    expect(g.cells.a.K).toMatchObject({ n: 2, avgP: 0.75 });
    expect(g.total.K.n).toBe(3);
    expect(g.total.K.avgP).toBeCloseTo(1.7 / 3);
    expect(g.total.K.counts.vung).toBe(1);
  });
});

describe('xuất CSV', () => {
  it('CSV có BOM, trích dẫn dấu phẩy/ngoặc kép/xuống dòng, chặn công thức, số thập phân dấu phẩy', () => {
    const csv = toCsv([['Tên', 'Nhận xét', 'Điểm'], ['Lan', 'Giỏi, "chăm"\nngoan', 8.5], ['=CMD()', null, -2]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Giỏi, ""chăm""\nngoan"');
    expect(csv).toContain('"8,5"');
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain(',-2');
    expect(toTsv([['a\tb', 'c\nd']])).toBe('a b\tc d');
  });
  it('TT27: mọi HS có dòng; cột môn Mức / Điểm / Nhận xét', () => {
    const st = [{ id: 's1', name: 'Minh Hải', username: 'hai4a1' }, { id: 's2', name: 'Ngọc Lan', username: 'lan4a2' }] as Profile[];
    const e = { studentId: 's1', classId: 'c', termId: 'GK1', schoolYear: '2026-2027', subjects: { toan: { level: 'T', comment: 'Tính nhanh', score: 9 } }, qualities: { 'yeu-nuoc': 'T', 'nhan-ai': 'Đ', 'cham-chi': 'T', 'trung-thuc': 'T', 'trach-nhiem': 'Đ' }, competencies: { 'tu-chu-tu-hoc': 'T' }, generalComment: 'Con ngoan.', status: 'final' } as Tt27Evaluation;
    const rows = tt27Rows(st, [e], ['toan', 'tieng-viet'], ['tu-chu-tu-hoc']);
    expect(rows[0].slice(0, 6)).toEqual(['STT', 'Mã HS', 'Họ và tên', 'Toán - Mức đạt', 'Toán - Điểm KTĐK', 'Toán - Nhận xét']);
    expect(rows[1].slice(0, 6)).toEqual([1, 'hai4a1', 'Minh Hải', 'T', 9, 'Tính nhanh']);
    expect(rows[1].slice(-2)).toEqual(['Con ngoan.', 'Đã chốt']);
    expect(rows[2].slice(-1)).toEqual(['Chưa đánh giá']);
  });
});

describe('phụ huynh', () => {
  it('chuẩn hoá email / số điện thoại', () => {
    expect(normalizeParentLogin(' Me.Lan@Gmail.com ')).toEqual({ ok: true, username: 'me.lan@gmail.com', kind: 'email' });
    expect(normalizeParentLogin('84 912.345.678')).toMatchObject({ ok: true, username: '0912345678' });
    expect(normalizeParentLogin('0912-34')).toMatchObject({ ok: false });
    expect(normalizeParentLogin('84912345678')).toMatchObject({ ok: true, username: '0912345678' });
    expect(normalizeParentLogin('12345')).toMatchObject({ ok: false });
  });
  it('bản tin tuần: 7 ngày từ thứ Hai, chỉ TT27 đã chốt, lời nhắn của cô', async () => {
    clock = new Date();
    const { ds, school } = setup();
    await ds.signIn('phuhuynh4a', '123456');
    const d = await school.getParentDigest('u-lan4a2');
    expect(d.days).toHaveLength(7);
    expect(d.days[0].label).toBe('T2');
    expect(d.isCurrentWeek).toBe(true);
    expect(d.tt27?.generalComment).toBeTruthy();
    expect(d.tt27?.subjects.length).toBeGreaterThan(0);
    await expect(school.getParentDigest('u-hai4a1')).rejects.toThrow(/chưa liên kết/);
    const prev = await school.getParentDigest('u-lan4a2', new Date(Date.parse(d.weekStart) - 3 * 86_400_000).toISOString());
    expect(Date.parse(d.weekStart) - Date.parse(prev.weekStart)).toBe(7 * 86_400_000);
    expect(prev.isCurrentWeek).toBe(false);
  });
  it('buildParentDigest bỏ TT27 nháp', () => {
    const child = { id: 'k', name: 'Bé', role: 'student' } as Profile;
    const d = buildParentDigest({ now: new Date('2026-11-12T05:00:00Z'), child, events: [], rewards: [], works: [], attendance: [], behaviorLogs: [], behaviors: [], tt27: [{ studentId: 'k', status: 'draft', termId: 'GK1', schoolYear: '2026-2027' } as Tt27Evaluation] });
    expect(d.tt27).toBeNull();
    expect(d.weekStart).toBe('2026-11-08T17:00:00.000Z');
    expect(d.headline).toMatch(/chưa học/);
  });
});
