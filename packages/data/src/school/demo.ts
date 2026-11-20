/**
 * Phase 5 — bản demo của SchoolSource: dùng chung kho localStorage với DemoDataSource (khóa users, classes,
 * guardians, session…) và thêm guardianCodes, passwords, codeAttempts, school. Mẫu nạp lười lần đầu.
 */
import {
  MAX_CODE_ATTEMPTS_PER_DAY,
  schoolYearOf,
  uid,
  type AccountSlip,
  type AiGrade,
  type AttendanceRecord,
  type ClassInfo,
  type CreateTeacherInput,
  type Grade,
  type GradeHeatmap,
  type GuardianCode,
  type GuardianLinkInfo,
  type LearningEvent,
  type ParentDigest,
  type ParentRegisterInput,
  type Profile,
  type RedeemResult,
  type ReportRange,
  type Role,
  type SaveClassInput,
  type SchoolOverview,
  type SchoolSettings,
  type SchoolSource,
  type SchoolUser,
  type SkillMastery,
  type Submission,
  type SubjectId,
  type Tt27Evaluation,
} from '@openedu/contracts';
import type { DemoDataSource } from '../demo/DemoDataSource';
import { vnWeekStart } from '../engagement';
import { vnDayKey } from '../mastery';
import { readJson, writeJson, type KVStorage } from '../storage';
import { generatePassword, generateStudentAccounts, slugAscii, teacherUsername } from './accounts';
import { checkRedeem, codeExpiry, codeStatus, generateGuardianCode, isWellFormedCode, maskLogin, normalizeCode, type Rand } from './codes';
import { digestFromDataSource } from './generic';
import { aggregateGradeHeatmap, attendanceCounts, buildClassReportRow, buildSchoolOverview } from './reports';
import { normalizeParentLogin } from './login';

const DAY = 86_400_000;
/** Mã mẫu: phụ huynh `phuhuynh4a` (bố Ngọc Lan) dùng để liên kết thêm con thứ hai — Bảo Chi lớp 2A. */
export const DEMO_SIBLING_CODE = 'CHAU2A3K';
export const DEMO_SIBLING_STUDENT = 'u-chi2a3';

interface SchoolStore {
  settings: SchoolSettings;
  /** "parentId|studentId" → thời điểm liên kết, quan hệ, tên đăng nhập. */
  links: Record<string, { createdAt: string; relation?: string }>;
}

const err = (m: string) => new Error(m);

export class DemoSchoolSource implements SchoolSource {
  private rand: Rand;
  constructor(private ds: DemoDataSource, opts: { rand?: Rand } = {}) {
    this.rand = opts.rand ?? Math.random;
  }

  /* ---------- kho ---------- */
  private async kv(): Promise<{ s: KVStorage; now: Date; changed: () => void }> {
    const { storage, now, changed } = await this.ds.schoolKv();
    if (storage.get('school') === null) this.seed(storage, now());
    return { s: storage, now: now(), changed };
  }
  private g<T>(s: KVStorage, k: string, fb: T): T {
    return readJson<T>(s, k, fb);
  }
  private p(s: KVStorage, k: string, v: unknown): void {
    writeJson(s, k, v);
  }

  private seed(s: KVStorage, now: Date): void {
    const at = (d: number) => new Date(now.getTime() - d * DAY).toISOString();
    const codes: GuardianCode[] = [
      { code: DEMO_SIBLING_CODE, studentId: DEMO_SIBLING_STUDENT, classId: 'c-2a', createdBy: 'u-colan', createdAt: at(2), expiresAt: codeExpiry(new Date(now.getTime() - 2 * DAY)) },
      { code: 'HAKM4A2P', studentId: 'u-lan4a2', classId: 'c-4a', createdBy: 'u-cothu', createdAt: at(20), expiresAt: codeExpiry(new Date(now.getTime() - 20 * DAY)), usedAt: at(19), usedBy: 'u-phuhuynh4a' },
      { code: 'QWTR4A6M', studentId: 'u-vy4a6', classId: 'c-4a', createdBy: 'u-cothu', createdAt: at(5), expiresAt: codeExpiry(new Date(now.getTime() - 5 * DAY)) },
    ];
    this.p(s, 'guardianCodes', codes);
    const store: SchoolStore = {
      settings: { schoolName: 'Trường Tiểu học Hòa Bình', schoolYear: schoolYearOf(now), termId: 'GK1', aiDailyQuota: 200 },
      links: { 'u-phuhuynh4a|u-lan4a2': { createdAt: at(19), relation: 'Bố' }, 'u-phuhuynh|u-an2a1': { createdAt: at(30), relation: 'Mẹ' } },
    };
    this.p(s, 'school', store);
  }

  private users(s: KVStorage): Profile[] {
    return this.g<Profile[]>(s, 'users', []);
  }
  private classes(s: KVStorage): ClassInfo[] {
    return this.g<ClassInfo[]>(s, 'classes', []);
  }
  private guardians(s: KVStorage): Record<string, string[]> {
    return this.g<Record<string, string[]>>(s, 'guardians', {});
  }
  private codes(s: KVStorage): GuardianCode[] {
    return this.g<GuardianCode[]>(s, 'guardianCodes', []);
  }
  private store(s: KVStorage): SchoolStore {
    return this.g<SchoolStore>(s, 'school', { settings: { schoolName: '', schoolYear: schoolYearOf(), termId: 'GK1', aiDailyQuota: 200 }, links: {} });
  }
  private viewer(s: KVStorage): Profile | undefined {
    const sess = this.g<{ userId: string } | null>(s, 'session', null);
    return sess ? this.users(s).find((u) => u.id === sess.userId) : undefined;
  }
  /** Không đăng nhập (kiểm thử) = admin. */
  private requireAdmin(s: KVStorage): void {
    const v = this.viewer(s);
    if (v && v.role !== 'admin') throw err('Chỉ quản trị trường mới làm được việc này.');
  }
  private requireClassStaff(s: KVStorage, classId: string): ClassInfo {
    const cls = this.classes(s).find((c) => c.id === classId);
    if (!cls) throw err('Không tìm thấy lớp này.');
    const v = this.viewer(s);
    if (v && v.role !== 'admin' && !(v.role === 'teacher' && cls.teacherId === v.id)) throw err('Thầy cô chỉ quản lí được lớp mình chủ nhiệm.');
    return cls;
  }
  /** Lớp người xem được báo cáo: admin tất cả, GV lớp mình. */
  private visibleClasses(s: KVStorage): ClassInfo[] {
    const v = this.viewer(s);
    const all = this.classes(s);
    if (!v || v.role === 'admin') return all;
    if (v.role === 'teacher') return all.filter((c) => c.teacherId === v.id);
    throw err('Chỉ thầy cô và quản trị xem được báo cáo.');
  }
  private studentName(s: KVStorage, id: string): string {
    return this.users(s).find((u) => u.id === id)?.name ?? id;
  }

  /* ================= mã liên kết ================= */
  async createGuardianCodes(classId: string, studentIds?: string[]): Promise<GuardianCode[]> {
    const { s, now } = await this.kv();
    const cls = this.requireClassStaff(s, classId);
    const ids = studentIds?.length ? studentIds.filter((id) => cls.studentIds.includes(id)) : cls.studentIds;
    const v = this.viewer(s);
    const list = this.codes(s);
    const taken = new Set(list.map((c) => c.code));
    const nowIso = now.toISOString();
    for (const c of list) if (ids.includes(c.studentId) && codeStatus(c, now) === 'active') c.revokedAt = nowIso;
    const fresh: GuardianCode[] = ids.map((sid) => {
      let code = generateGuardianCode(this.rand);
      while (taken.has(code)) code = generateGuardianCode(this.rand);
      taken.add(code);
      return { code, studentId: sid, classId, createdBy: v?.id ?? 'u-admin', createdAt: nowIso, expiresAt: codeExpiry(now) };
    });
    this.p(s, 'guardianCodes', [...list, ...fresh]);
    return fresh.map((c) => ({ ...c, studentName: this.studentName(s, c.studentId) }));
  }

  async listGuardianCodes(classId: string): Promise<GuardianCode[]> {
    const { s } = await this.kv();
    this.requireClassStaff(s, classId);
    return this.codes(s)
      .filter((c) => c.classId === classId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({ ...c, studentName: this.studentName(s, c.studentId) }));
  }

  async revokeGuardianCode(code: string): Promise<void> {
    const { s, now } = await this.kv();
    const list = this.codes(s);
    const c = list.find((x) => x.code === normalizeCode(code));
    if (!c) throw err('Không tìm thấy mã này.');
    this.requireClassStaff(s, c.classId);
    if (!c.usedAt && !c.revokedAt) c.revokedAt = now.toISOString();
    this.p(s, 'guardianCodes', list);
  }

  async listGuardianLinks(classId: string): Promise<GuardianLinkInfo[]> {
    const { s } = await this.kv();
    const cls = this.requireClassStaff(s, classId);
    const users = this.users(s);
    const meta = this.store(s).links;
    const out: GuardianLinkInfo[] = [];
    for (const [pid, kids] of Object.entries(this.guardians(s))) {
      const parent = users.find((u) => u.id === pid);
      for (const sid of kids) {
        if (!cls.studentIds.includes(sid)) continue;
        const m = meta[`${pid}|${sid}`];
        out.push({
          parentId: pid,
          parentName: parent?.name ?? 'Phụ huynh',
          parentLogin: maskLogin(parent?.username),
          studentId: sid,
          studentName: this.studentName(s, sid),
          ...(m?.relation ? { relation: m.relation } : {}),
          createdAt: m?.createdAt ?? new Date(0).toISOString(),
        });
      }
    }
    return out.sort((a, b) => cls.studentIds.indexOf(a.studentId) - cls.studentIds.indexOf(b.studentId));
  }

  async revokeGuardianLink(parentId: string, studentId: string): Promise<void> {
    const { s } = await this.kv();
    const kid = this.users(s).find((u) => u.id === studentId);
    if (!kid?.classId) throw err('Không tìm thấy học sinh này.');
    this.requireClassStaff(s, kid.classId);
    const g = this.guardians(s);
    g[parentId] = (g[parentId] ?? []).filter((id) => id !== studentId);
    this.p(s, 'guardians', g);
    const st = this.store(s);
    delete st.links[`${parentId}|${studentId}`];
    this.p(s, 'school', st);
  }

  /** Kiểm tra & dùng mã cho phụ huynh `parentId` (đã có tài khoản). */
  private consume(s: KVStorage, now: Date, parentId: string, rawCode: string, relation?: string): RedeemResult {
    const code = normalizeCode(rawCode);
    const day = vnDayKey(now.toISOString());
    const attempts = this.g<Record<string, number>>(s, 'codeAttempts', {});
    const akey = `${parentId}|${day}`;
    if ((attempts[akey] ?? 0) >= MAX_CODE_ATTEMPTS_PER_DAY) throw err('Bố mẹ đã nhập sai quá nhiều lần hôm nay. Xin thử lại vào ngày mai hoặc nhờ thầy cô kiểm tra mã.');
    const list = this.codes(s);
    const c = isWellFormedCode(code) ? list.find((x) => x.code === code) : undefined;
    const g = this.guardians(s);
    const guardiansOfChild = c ? Object.values(g).filter((kids) => kids.includes(c.studentId)).length : 0;
    const alreadyLinked = !!c && (g[parentId] ?? []).includes(c.studentId);
    // Dùng lại mã chính mình đã dùng (bấm hai lần, mở lại link) → không lỗi.
    if (c && alreadyLinked && c.usedBy === parentId) return { child: this.users(s).find((u) => u.id === c.studentId) as Profile, alreadyLinked: true };
    const check = checkRedeem(c, now, { guardians: guardiansOfChild, alreadyLinked });
    if (!check.ok || !c) {
      attempts[akey] = (attempts[akey] ?? 0) + 1;
      this.p(s, 'codeAttempts', attempts);
      throw err(check.ok ? 'Mã chưa đúng.' : check.reason);
    }
    c.usedAt = now.toISOString();
    c.usedBy = parentId;
    this.p(s, 'guardianCodes', list);
    if (!alreadyLinked) {
      g[parentId] = [...(g[parentId] ?? []), c.studentId];
      this.p(s, 'guardians', g);
      const st = this.store(s);
      st.links[`${parentId}|${c.studentId}`] = { createdAt: now.toISOString(), ...(relation ? { relation } : {}) };
      this.p(s, 'school', st);
    }
    const child = this.users(s).find((u) => u.id === c.studentId) as Profile;
    return { child, alreadyLinked };
  }

  async registerParent(input: ParentRegisterInput): Promise<Profile> {
    const { s, now, changed } = await this.kv();
    const login = normalizeParentLogin(input.login);
    if (!login.ok) throw err(login.reason);
    if ((input.password ?? '').length < 6) throw err('Mật khẩu cần ít nhất 6 kí tự.');
    const name = (input.name ?? '').trim();
    if (!name) throw err('Bố mẹ nhập tên hiển thị (ví dụ: Mẹ bé Lan) nhé.');
    const users = this.users(s);
    if (users.some((u) => (u.username ?? '').toLowerCase() === login.username)) throw err('Email / số điện thoại này đã có tài khoản. Bố mẹ chọn “Đã có tài khoản” để đăng nhập rồi nhập mã.');
    // Kiểm tra mã TRƯỚC khi tạo tài khoản (không tạo tài khoản rác khi mã sai).
    const code = normalizeCode(input.code);
    const c = this.codes(s).find((x) => x.code === code);
    const g = this.guardians(s);
    const pre = checkRedeem(c, now, { guardians: c ? Object.values(g).filter((k) => k.includes(c.studentId)).length : 0, alreadyLinked: false });
    if (!pre.ok) throw err(pre.reason);
    const parent: Profile = { id: uid('u-ph'), role: 'parent', name, username: login.username, avatarMascot: 'nghe', avatarColor: '#0ea5a4' };
    this.p(s, 'users', [...users, parent]);
    const pw = this.g<Record<string, string>>(s, 'passwords', {});
    pw[parent.id] = input.password;
    this.p(s, 'passwords', pw);
    this.consume(s, now, parent.id, code, input.relation);
    this.p(s, 'session', { userId: parent.id });
    changed();
    return parent;
  }

  async redeemGuardianCode(code: string): Promise<RedeemResult> {
    const { s, now } = await this.kv();
    const v = this.viewer(s);
    if (!v || v.role !== 'parent') throw err('Bố mẹ đăng nhập tài khoản phụ huynh trước khi nhập mã nhé.');
    return this.consume(s, now, v.id, code);
  }

  async getParentDigest(childId: string, weekStart?: string): Promise<ParentDigest> {
    const { s, now } = await this.kv();
    const v = this.viewer(s);
    if (v && v.role === 'parent' && !(this.guardians(s)[v.id] ?? []).includes(childId)) throw err('Tài khoản này chưa liên kết với học sinh đó.');
    if (v && v.role === 'student' && v.id !== childId) throw err('Em chỉ xem được bản tin của mình.');
    return digestFromDataSource(this.ds, childId, weekStart, now);
  }

  /* ================= báo cáo ================= */
  async getSchoolOverview(range: ReportRange = {}): Promise<SchoolOverview> {
    const { s, now } = await this.kv();
    const classes = this.visibleClasses(s);
    const settings = this.store(s).settings;
    const from = range.from ?? vnWeekStart(now);
    const to = range.to ?? now.toISOString();
    const users = this.users(s);
    const ids = new Set(classes.flatMap((c) => c.studentIds));
    const events = this.g<LearningEvent[]>(s, 'events', []).filter((e) => ids.has(e.userId) && e.at >= from && e.at <= to);
    const masteries: Record<string, SkillMastery[]> = {};
    for (const id of ids) masteries[id] = await this.ds.getSkillMastery(id);
    const attFrom = vnDayKey(new Date(now.getTime() - 30 * DAY).toISOString());
    const attendance = this.g<AttendanceRecord[]>(s, 'attendance', []).filter((r) => r.date >= attFrom);
    const tt27 = this.g<Tt27Evaluation[]>(s, 'tt27', []).filter((e) => e.termId === settings.termId && e.schoolYear === settings.schoolYear);
    const subs = this.g<Submission[]>(s, 'submissions', []);
    const rows = classes.map((cls) =>
      buildClassReportRow({
        cls,
        teacherName: users.find((u) => u.id === cls.teacherId)?.name,
        events,
        masteries,
        attendance,
        tt27,
        worksApproved: subs.filter((x) => cls.studentIds.includes(x.studentId) && x.status === 'approved').length,
      }),
    );
    const grades = Object.values(this.g<Record<string, AiGrade>>(s, 'aiGrades', {})).filter((x) => {
      const sub = subs.find((y) => y.id === x.submissionId);
      return !sub || ids.has(sub.studentId);
    });
    const today = vnDayKey(now.toISOString());
    const teacherIds = new Set(classes.map((c) => c.teacherId).filter(Boolean));
    return buildSchoolOverview({
      now,
      range: { from, to },
      schoolYear: settings.schoolYear,
      termId: settings.termId,
      rows,
      classes,
      masteries,
      teachers: teacherIds.size,
      ai: { gradedInRange: grades.filter((x) => x.createdAt >= from && x.createdAt <= to).length, usedToday: grades.filter((x) => vnDayKey(x.createdAt) === today).length, dailyQuota: settings.aiDailyQuota },
      attendance: attendanceCounts(attendance.filter((r) => classes.some((c) => c.id === r.classId)), ids),
    });
  }

  async getGradeHeatmap(grade: Grade, subject: SubjectId = 'toan'): Promise<GradeHeatmap> {
    const { s } = await this.kv();
    const classes = this.visibleClasses(s).filter((c) => c.grade === grade);
    const maps = [];
    for (const c of classes) maps.push({ classId: c.id, name: c.name, heatmap: await this.ds.getClassHeatmap(c.id, subject) });
    return aggregateGradeHeatmap(grade, subject, maps);
  }

  /* ================= quản trị ================= */
  async getSchoolSettings(): Promise<SchoolSettings> {
    const { s } = await this.kv();
    return this.store(s).settings;
  }

  async saveSchoolSettings(next: SchoolSettings): Promise<SchoolSettings> {
    const { s } = await this.kv();
    this.requireAdmin(s);
    if (!/^\d{4}-\d{4}$/.test(next.schoolYear)) throw err('Năm học có dạng 2026-2027.');
    const st = this.store(s);
    st.settings = { ...next, schoolName: next.schoolName.trim(), aiDailyQuota: Math.max(0, Math.round(next.aiDailyQuota)) };
    this.p(s, 'school', st);
    return st.settings;
  }

  async listSchoolUsers(filter: { role?: Role; classId?: string } = {}): Promise<SchoolUser[]> {
    const { s } = await this.kv();
    const v = this.viewer(s);
    if (v && v.role !== 'admin' && v.role !== 'teacher') throw err('Chỉ thầy cô và quản trị xem được danh sách này.');
    const classes = this.classes(s);
    const name = new Map(classes.map((c) => [c.id, c.name]));
    return this.users(s)
      .filter((u) => (!filter.role || u.role === filter.role) && (!filter.classId || u.classId === filter.classId))
      .map((u) => ({
        id: u.id,
        role: u.role,
        name: u.name,
        ...(u.username ? { username: u.username } : {}),
        ...(u.grade ? { grade: u.grade } : {}),
        ...(u.role === 'student' && u.classId ? { classId: u.classId, className: name.get(u.classId) } : {}),
        ...(u.role === 'teacher' ? { classIds: classes.filter((c) => c.teacherId === u.id).map((c) => c.id) } : {}),
      }))
      .sort((a, b) => a.role.localeCompare(b.role) || (a.className ?? '').localeCompare(b.className ?? '') || a.name.localeCompare(b.name, 'vi'));
  }

  async saveClass(input: SaveClassInput): Promise<{ id: string; name: string; grade: Grade; teacherId?: string }> {
    const { s } = await this.kv();
    this.requireAdmin(s);
    const name = input.name.trim().toUpperCase();
    if (!name) throw err('Nhập tên lớp (ví dụ 4B).');
    const classes = this.classes(s);
    if (classes.some((c) => c.name.toUpperCase() === name && c.id !== input.id)) throw err(`Trường đã có lớp ${name}.`);
    const teacherId = input.teacherId || '';
    let cls = input.id ? classes.find((c) => c.id === input.id) : undefined;
    if (input.id && !cls) throw err('Không tìm thấy lớp này.');
    if (cls) Object.assign(cls, { name, grade: input.grade, teacherId });
    else {
      let id = `c-${slugAscii(name) || uid()}`;
      while (classes.some((c) => c.id === id)) id = `${id}x`;
      cls = { id, name, grade: input.grade, teacherId, studentIds: [], teams: [] };
      classes.push(cls);
    }
    this.p(s, 'classes', classes);
    // Đổi khối lớp → khối của HS trong lớp; GV chưa có lớp chính → lớp này.
    const users = this.users(s);
    for (const u of users) {
      if (u.role === 'student' && u.classId === cls.id) u.grade = input.grade;
      if (u.role === 'teacher' && u.id === teacherId && !u.classId) u.classId = cls.id;
    }
    this.p(s, 'users', users);
    return { id: cls.id, name: cls.name, grade: cls.grade, ...(cls.teacherId ? { teacherId: cls.teacherId } : {}) };
  }

  async createTeacher(input: CreateTeacherInput): Promise<AccountSlip> {
    const { s } = await this.kv();
    this.requireAdmin(s);
    const name = input.name.trim();
    if (!name) throw err('Nhập họ tên giáo viên.');
    const users = this.users(s);
    const existing = users.map((u) => u.username ?? '');
    const username = (input.username?.trim().toLowerCase() || teacherUsername(name, existing)).replace(/\s+/g, '');
    if (existing.includes(username)) throw err(`Tên đăng nhập “${username}” đã có người dùng.`);
    const password = input.password?.trim() || generatePassword(this.rand);
    if (password.length < 6) throw err('Mật khẩu cần ít nhất 6 kí tự.');
    const t: Profile = { id: uid('u-gv'), role: 'teacher', name, username, avatarMascot: 'capybara', avatarColor: '#0ea5a4' };
    this.p(s, 'users', [...users, t]);
    this.setPassword(s, t.id, password);
    return { userId: t.id, role: 'teacher', name, username, password };
  }

  async bulkCreateStudents(classId: string, names: string[]): Promise<AccountSlip[]> {
    const { s, changed } = await this.kv();
    const classes = this.classes(s);
    const cls = classes.find((c) => c.id === classId);
    // Giống Edge Function school-admin: quản trị, hoặc GV chủ nhiệm của chính lớp đó.
    const who = this.viewer(s);
    if (who && who.role !== 'admin' && !(who.role === 'teacher' && cls?.teacherId === who.id)) throw err('Chỉ quản trị trường hoặc giáo viên chủ nhiệm của lớp mới tạo được tài khoản học sinh.');
    if (!cls) throw err('Không tìm thấy lớp này.');
    const clean = names.map((n) => n.trim()).filter(Boolean);
    if (!clean.length) throw err('Danh sách trống. Dán mỗi dòng một họ tên nhé.');
    if (clean.length > 60) throw err('Mỗi lần tạo tối đa 60 em.');
    const users = this.users(s);
    const accounts = generateStudentAccounts(clean, cls.name, users.map((u) => u.username ?? ''), cls.studentIds.length + 1, this.rand);
    const { defaultSettings } = await import('../seed');
    const COLORS = ['#2f7bf6', '#ff5d8f', '#20a974', '#8b5cf6', '#ff8a3d', '#0ea5a4', '#e8485f', '#64748b'];
    const MASCOTS = ['shiba', 'nghe', 'koala', 'panda', 'kiwi', 'capybara', 'cong', 'ga'] as const;
    const created: Profile[] = accounts.map((a, i) => ({
      id: `u-${a.username}`,
      role: 'student',
      name: a.name,
      username: a.username,
      grade: cls.grade,
      classId: cls.id,
      avatarMascot: MASCOTS[(cls.studentIds.length + i) % MASCOTS.length],
      avatarColor: COLORS[(cls.studentIds.length + i) % COLORS.length],
      settings: defaultSettings(cls.grade),
    }));
    this.p(s, 'users', [...users, ...created]);
    cls.studentIds.push(...created.map((u) => u.id));
    this.p(s, 'classes', classes);
    const pw = this.g<Record<string, string>>(s, 'passwords', {});
    accounts.forEach((a, i) => (pw[created[i].id] = a.password));
    this.p(s, 'passwords', pw);
    changed();
    return accounts.map((a, i) => ({ userId: created[i].id, role: 'student', name: a.name, username: a.username, password: a.password, classId: cls.id, className: cls.name }));
  }

  async resetPassword(userId: string): Promise<AccountSlip> {
    const { s } = await this.kv();
    const u = this.users(s).find((x) => x.id === userId);
    if (!u) throw err('Không tìm thấy tài khoản này.');
    const v = this.viewer(s);
    // Admin đặt lại mọi tài khoản (trừ phụ huynh — phụ huynh tự đổi); GV đặt lại cho HS lớp mình.
    if (v && v.role !== 'admin') {
      if (!(v.role === 'teacher' && u.role === 'student' && u.classId && this.classes(s).find((c) => c.id === u.classId)?.teacherId === v.id)) throw err('Thầy cô chỉ đặt lại mật khẩu cho học sinh lớp mình.');
    }
    if (u.role === 'parent') throw err('Phụ huynh tự đặt lại mật khẩu bằng email / số điện thoại.');
    const password = generatePassword(this.rand);
    this.setPassword(s, u.id, password);
    const cls = u.classId ? this.classes(s).find((c) => c.id === u.classId) : undefined;
    return { userId: u.id, role: u.role, name: u.name, username: u.username ?? '', password, ...(u.role === 'student' && cls ? { classId: cls.id, className: cls.name } : {}) };
  }

  private setPassword(s: KVStorage, userId: string, password: string): void {
    const pw = this.g<Record<string, string>>(s, 'passwords', {});
    pw[userId] = password;
    this.p(s, 'passwords', pw);
  }
}
