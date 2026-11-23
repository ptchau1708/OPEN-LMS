/**
 * Nguồn dữ liệu demo: chạy hoàn toàn trên máy (localStorage hoặc bộ nhớ), nội dung mẫu nạp lần đầu.
 * Lớp học trực tiếp dùng tools/live-relay (WebSocket trong mạng LAN).
 */
import { packSession, unpackSession } from '../sessionPack';
import { normalizeParentLogin } from '../school/login';
import { NO_REAL_EMAIL_TEXT, isSystemEmail, newPasswordProblem } from '../password';
import {
  uid,
  SKILL_BY_CODE,
  type Assignment,
  type AwardResult,
  type ClassHeatmap,
  type GapGroup,
  type HintInput,
  type HintResult,
  type ParentSummary,
  type RemediationAnswer,
  type RemediationOutcome,
  type RemediationSet,
  type SkillMastery,
  type StudentProfile,
  type ClassInfo,
  type ContentPackage,
  type Course,
  type DataSource,
  type Grade,
  type Item,
  type ItemFilter,
  type ItemType,
  type LearningEvent,
  type Lesson,
  type LessonFilter,
  type LessonProgress,
  type LiveChannel,
  type LiveParticipant,
  type LiveRole,
  type LiveSessionInfo,
  type LiveState,
  type MascotId,
  type Passport,
  type Profile,
  type RewardEntry,
  type StudentSettings,
  type SubjectId,
  type SubmitAnswerInput,
  type SubmitAnswerResult,
  type Task,
  type Wallet,
  schoolYearOf,
  type AiGrade,
  type AttendanceRecord,
  type AttendanceStatus,
  type Behavior,
  type BehaviorLog,
  type ClassLeaderboard,
  type GradeReview,
  type RecordBehaviorInput,
  type Rubric,
  type RubricFilter,
  type StudentWorkEntry,
  type Submission,
  type SubmissionDetail,
  type SubmissionFilter,
  type SubmitWorkInput,
  type Tt27Evaluation,
  type Tt27Suggestion,
  type Tt27TermId,
  type WorkTask,
  type WorkTaskFilter,
} from '@openedu/contracts';
import { approvalEvents, approvalReward, mergeFinal, mockGrade, statusAfterGrade, teacherGrade } from '../assess';
import { attendanceSummary, classLeaderboard, defaultBehaviors, suggestTt27, vnWeekStart, workEntryOf } from '../engagement';
import { getExamService } from '../exam/service';
import { compressWorkImage } from '../workImage';
import { demoAiEnabled, demoAiGrade } from './demoAi';
import { contentOrigin, relayHttpUrl, relayWsUrl } from '../env';
import { createInitialLiveState, randomPin } from '../live/reducer';
import { RelayLiveChannel, registerRoomOnRelay } from '../live/RelayLiveChannel';
import { loadScorer, type ScoreFn } from '../live/types';
import { computeWallet, dayKey, newlyUnlockable, normalizeReward } from '../rewards';
import { createDefaultStorage, readJson, writeJson, type KVStorage } from '../storage';
import { buildTodayTasks } from '../tasks';
import {
  answerAnnotations,
  classHeatmap,
  computeMastery,
  evaluateRemediation,
  parseRemediationSetId,
  planRemediation,
  remediationMessage,
  studentGroupsByGap,
  type ItemLike,
} from '../mastery';
import { buildParentSummary, buildStudentProfile } from '../profile';
import { matchesSearch } from '../text';
import { mergeProgress } from '../progress';

export { mergeProgress };

/* Khóa lưu trữ (đã có tiền tố openedu:v1: ở lớp storage). */
const K = {
  meta: 'meta',
  users: 'users',
  guardians: 'guardians',
  classes: 'classes',
  lessons: 'lessons',
  items: 'items',
  courses: 'courses',
  packages: 'packages',
  assignments: 'assignments',
  progress: 'progress',
  events: 'events',
  rewards: 'rewards',
  passports: 'passports',
  live: 'live',
  session: 'session',
  rubrics: 'rubrics',
  workTasks: 'workTasks',
  submissions: 'submissions',
  aiGrades: 'aiGrades',
  gradeReviews: 'gradeReviews',
  behaviors: 'behaviors',
  behaviorLogs: 'behaviorLogs',
  attendance: 'attendance',
  tt27: 'tt27',
  /* Phase 5 (school/demo.ts) — xoá khi nạp lại mẫu */
  passwords: 'passwords',
  guardianCodes: 'guardianCodes',
  codeAttempts: 'codeAttempts',
  school: 'school',
} as const;

const MAX_EVENTS = 6000;
/** Bộ nhớ đệm mức thành thạo theo HS: tính lại khi có sự kiện mới / đổi câu hỏi, hoặc sau 60 giây. */
const MASTERY_TTL_MS = 60_000;
const MAX_LIVE = 20;
export const UNGRADED_TYPES: ItemType[] = ['DRAW', 'RECORD_READ', 'POLL'];
const CONTENT_TOKEN = '{{CONTENT_ORIGIN}}';

export interface DemoOptions {
  storage?: KVStorage;
  relayUrl?: string;
  /** Ghi đè "bây giờ" (kiểm thử). */
  now?: () => Date;
  /** Ghi đè hàm chấm (kiểm thử). Mặc định tải scoreItem từ activity-engine. */
  score?: ScoreFn;
}

interface Meta {
  version: number;
  seededAt: string;
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

function friendly(msg: string): Error {
  return new Error(msg);
}

export class DemoDataSource implements DataSource {
  readonly mode = 'demo' as const;
  private storage: KVStorage;
  private relayUrl: string;
  private now: () => Date;
  private scoreOverride?: ScoreFn;
  private readyPromise: Promise<void> | null = null;
  private dataRev = 0;
  private masteryCache = new Map<string, { rev: number; at: number; list: SkillMastery[] }>();

  constructor(opts: DemoOptions = {}) {
    this.storage = opts.storage ?? createDefaultStorage();
    this.relayUrl = opts.relayUrl ?? relayWsUrl();
    this.now = opts.now ?? (() => new Date());
    this.scoreOverride = opts.score;
  }

  /* ================= lưu trữ & nạp mẫu ================= */
  private get<T>(key: string, fallback: T): T {
    return readJson<T>(this.storage, key, fallback);
  }
  private put(key: string, value: unknown): void {
    writeJson(this.storage, key, value);
  }

  private ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.ensureSeeded().catch((e) => {
        this.readyPromise = null;
        throw e;
      });
    }
    return this.readyPromise;
  }

  private async ensureSeeded(): Promise<void> {
    const seed = await import('../seed');
    const meta = this.get<Meta | null>(K.meta, null);
    if (meta && meta.version === seed.SEED_VERSION) return;
    this.writeSeed(seed);
  }

  private writeSeed(seed: typeof import('../seed')): void {
    const now = this.now();
    const data = seed.buildSeed(now);
    for (const k of Object.values(K)) this.storage.remove(k);
    this.put(K.users, data.users);
    this.put(K.guardians, data.guardians);
    this.put(K.classes, data.classes);
    this.put(K.lessons, Object.fromEntries(data.lessons.map((l) => [l.id, l])));
    this.put(K.items, Object.fromEntries(data.items.map((i) => [i.id, i])));
    this.put(K.courses, data.courses);
    this.put(K.packages, Object.fromEntries(data.packages.map((p) => [p.id, p])));
    this.put(K.assignments, data.assignments);
    this.put(K.progress, Object.fromEntries(data.progress.map((p) => [`${p.userId}|${p.lessonId}`, p])));
    this.put(K.events, data.events);
    this.put(K.rewards, data.rewards);
    // Hộ chiếu: mở theo số sao trong lịch sử mẫu.
    const passports: Record<string, Passport> = {};
    for (const u of data.users) {
      if (u.role !== 'student') continue;
      const total = computeWallet(u.id, data.rewards, now).stars;
      passports[u.id] = { userId: u.id, unlocked: ['nghe', ...newlyUnlockable(total, ['nghe'])], companion: 'nghe' };
    }
    this.put(K.passports, passports);
    this.put(K.live, {});
    this.put(K.rubrics, data.rubrics);
    this.put(K.workTasks, data.workTasks);
    this.put(K.submissions, data.submissions);
    this.put(K.aiGrades, data.aiGrades);
    this.put(K.gradeReviews, data.gradeReviews);
    this.put(K.behaviors, data.behaviors);
    this.put(K.behaviorLogs, data.behaviorLogs);
    this.put(K.attendance, data.attendance);
    this.put(K.tt27, data.tt27);
    this.put(K.meta, { version: seed.SEED_VERSION, seededAt: now.toISOString() } satisfies Meta);
    this.invalidateMastery();
  }

  private invalidateMastery(): void {
    this.dataRev++;
    this.masteryCache.clear();
  }

  /** Xóa mọi dữ liệu demo trên máy và nạp lại nội dung mẫu. */
  async resetDemo(): Promise<void> {
    const seed = await import('../seed');
    this.writeSeed(seed);
    this.readyPromise = Promise.resolve();
  }

  private users(): Profile[] {
    return this.get<Profile[]>(K.users, []);
  }
  private findUser(id: string): Profile | undefined {
    return this.users().find((u) => u.id === id);
  }
  private requireUser(id: string): Profile {
    const u = this.findUser(id);
    if (!u) throw friendly('Không tìm thấy tài khoản này.');
    return u;
  }
  private lessonsMap(): Record<string, Lesson> {
    return this.get<Record<string, Lesson>>(K.lessons, {});
  }
  private itemsMap(): Record<string, Item> {
    return this.get<Record<string, Item>>(K.items, {});
  }
  private rewards(): RewardEntry[] {
    return this.get<RewardEntry[]>(K.rewards, []);
  }
  private events(): LearningEvent[] {
    return this.get<LearningEvent[]>(K.events, []);
  }
  private progressMap(): Record<string, LessonProgress> {
    return this.get<Record<string, LessonProgress>>(K.progress, {});
  }
  private resolvePackage(p: ContentPackage): ContentPackage {
    return p.baseUrl.startsWith(CONTENT_TOKEN) ? { ...p, baseUrl: contentOrigin() + p.baseUrl.slice(CONTENT_TOKEN.length) } : p;
  }
  private async scorer(): Promise<ScoreFn> {
    return this.scoreOverride ?? loadScorer();
  }

  /* ================= đăng nhập ================= */
  async getCurrentUser(): Promise<Profile | null> {
    await this.ready();
    const s = this.get<{ userId: string } | null>(K.session, null);
    if (!s) return null;
    const u = this.findUser(s.userId);
    if (!u) return null;
    const out = clone(u);
    if (this.get<Record<string, boolean>>('mustChange', {})[u.id]) out.mustChangePassword = true;
    return out;
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.ready();
    const s = this.get<{ userId: string } | null>(K.session, null);
    if (!s) throw friendly('Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi đổi mật khẩu nhé.');
    const { DEMO_PASSWORD } = await import('../seed');
    const pw = this.get<Record<string, string>>(K.passwords, {});
    if ((current ?? '').trim() !== (pw[s.userId] ?? DEMO_PASSWORD)) throw friendly('Mật khẩu hiện tại chưa đúng.');
    const bad = newPasswordProblem(next, current);
    if (bad) throw friendly(bad);
    pw[s.userId] = next;
    this.put(K.passwords, pw);
    const mc = this.get<Record<string, boolean>>('mustChange', {});
    delete mc[s.userId];
    this.put('mustChange', mc);
  }

  async requestPasswordReset(email: string, _redirectTo?: string): Promise<void> {
    if (isSystemEmail(email)) throw friendly(NO_REAL_EMAIL_TEXT);
    throw friendly('Bản thử không gửi thư được. Trên hệ thống thật, thư đặt lại mật khẩu sẽ gửi tới email này.');
  }

  async signIn(username: string, password: string): Promise<Profile> {
    await this.ready();
    let raw = (username ?? '').trim().toLowerCase();
    if (!raw) throw friendly('Em nhập tên đăng nhập nhé.');
    const phone = raw.includes('@') ? null : normalizeParentLogin(raw);
    if (phone?.ok && phone.kind === 'phone') raw = phone.username;
    const name = raw.includes('@') ? raw.slice(0, raw.indexOf('@')) : raw;
    const user = this.users().find((u) => (u.username ?? '').toLowerCase() === raw) ?? this.users().find((u) => (u.username ?? '').toLowerCase() === name);
    if (!user) throw friendly('Không tìm thấy tài khoản này. Kiểm tra lại tên đăng nhập (ví dụ: an2a1), email hoặc số điện thoại nhé.');
    const { DEMO_PASSWORD } = await import('../seed');
    const own = this.get<Record<string, string>>(K.passwords, {})[user.id];
    if (own !== undefined ? (password ?? '').trim() !== own : (password ?? '').trim() !== DEMO_PASSWORD) throw friendly('Mật khẩu chưa đúng. Tài khoản mẫu dùng mật khẩu 123456.');
    this.put(K.session, { userId: user.id });
    return (await this.getCurrentUser()) ?? clone(user);
  }

  async signOut(): Promise<void> {
    this.storage.remove(K.session);
  }

  /** Đăng nhập chung (bản demo): chuyển mã người dùng sang app kia. Chỉ dữ liệu mẫu trong trình duyệt. */
  async exportSession(): Promise<string | null> {
    await this.ready();
    const s = this.get<{ userId: string } | null>(K.session, null);
    if (!s) return null;
    this.storage.remove(K.session);
    return packSession({ d: s.userId });
  }

  async importSession(packed: string): Promise<Profile | null> {
    await this.ready();
    const t = unpackSession(packed);
    const user = t?.d ? this.findUser(t.d) : undefined;
    if (!user) return null;
    this.put(K.session, { userId: user.id });
    return clone(user);
  }

  async listDemoUsers(): Promise<Profile[]> {
    await this.ready();
    return clone(this.users());
  }

  async updateSettings(userId: string, settings: Partial<StudentSettings>): Promise<Profile> {
    await this.ready();
    const { defaultSettings } = await import('../seed');
    const users = this.users();
    const i = users.findIndex((u) => u.id === userId);
    if (i < 0) throw friendly('Không tìm thấy tài khoản này.');
    const u = users[i];
    users[i] = { ...u, settings: { ...defaultSettings(u.grade), ...(u.settings ?? {}), ...settings } };
    this.put(K.users, users);
    return clone(users[i]);
  }

  /** Ngoài hợp đồng (Phase 5, school/demo.ts): kho khóa–giá trị đã nạp mẫu + đồng hồ. */
  async schoolKv(): Promise<{ storage: KVStorage; now: () => Date; changed: () => void }> {
    await this.ready();
    return { storage: this.storage, now: this.now, changed: () => this.invalidateMastery() };
  }

  /** Ngoài hợp đồng: các con của phụ huynh. */
  async listChildren(parentId: string): Promise<Profile[]> {
    await this.ready();
    const ids = this.get<Record<string, string[]>>(K.guardians, {})[parentId] ?? [];
    return clone(ids.map((id) => this.findUser(id)).filter((u): u is Profile => !!u));
  }

  /* ================= lớp ================= */
  async listClasses(teacherId?: string): Promise<ClassInfo[]> {
    await this.ready();
    const all = this.get<ClassInfo[]>(K.classes, []);
    return clone(teacherId ? all.filter((c) => c.teacherId === teacherId) : all);
  }

  async getClass(classId: string): Promise<ClassInfo | null> {
    await this.ready();
    return clone(this.get<ClassInfo[]>(K.classes, []).find((c) => c.id === classId) ?? null);
  }

  async listStudents(classId: string): Promise<Profile[]> {
    await this.ready();
    const cls = this.get<ClassInfo[]>(K.classes, []).find((c) => c.id === classId);
    const users = this.users().filter((u) => u.role === 'student' && u.classId === classId);
    const order = cls?.studentIds ?? [];
    users.sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.name.localeCompare(b.name, 'vi');
    });
    return clone(users);
  }

  /* ================= nội dung ================= */
  async listLessons(filter: LessonFilter = {}): Promise<Lesson[]> {
    await this.ready();
    const list = Object.values(this.lessonsMap()).filter(
      (l) =>
        (!filter.subject || l.subject === filter.subject) &&
        (!filter.grade || l.grade === filter.grade) &&
        (!filter.ownerId || l.ownerId === filter.ownerId) &&
        (!filter.status || l.status === filter.status) &&
        (!filter.search || matchesSearch(`${l.title} ${l.description ?? ''}`, filter.search)),
    );
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, 'vi'));
    return clone(list);
  }

  async getLesson(id: string): Promise<Lesson | null> {
    await this.ready();
    return clone(this.lessonsMap()[id] ?? null);
  }

  async saveLesson(lesson: Lesson): Promise<Lesson> {
    await this.ready();
    const map = this.lessonsMap();
    const saved: Lesson = {
      ...lesson,
      id: lesson.id || uid('l'),
      slides: (lesson.slides ?? []).map((s) => ({ ...s, id: s.id || uid('s') })),
      updatedAt: this.now().toISOString(),
    };
    map[saved.id] = saved;
    this.put(K.lessons, map);
    return clone(saved);
  }

  async deleteLesson(id: string): Promise<void> {
    await this.ready();
    const map = this.lessonsMap();
    delete map[id];
    this.put(K.lessons, map);
    const courses = this.get<Course[]>(K.courses, []).map((c) => ({ ...c, lessonIds: c.lessonIds.filter((x) => x !== id) }));
    this.put(K.courses, courses);
  }

  async listItems(filter: ItemFilter = {}): Promise<Item[]> {
    await this.ready();
    const list = Object.values(this.itemsMap()).filter(
      (it) =>
        (!filter.subject || it.subject === filter.subject) &&
        (!filter.grade || it.grade === filter.grade) &&
        (!filter.type || it.type === filter.type) &&
        (!filter.search || matchesSearch(`${it.prompt.text} ${it.skill ?? ''} ${(it.tags ?? []).join(' ')}`, filter.search)),
    );
    return clone(list);
  }

  async getItem(id: string): Promise<Item | null> {
    await this.ready();
    return clone(this.itemsMap()[id] ?? null);
  }

  async getItems(ids: string[]): Promise<Item[]> {
    await this.ready();
    const map = this.itemsMap();
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const id of ids) {
      if (seen.has(id) || !map[id]) continue;
      seen.add(id);
      out.push(map[id]);
    }
    return clone(out);
  }

  async saveItem(item: Item): Promise<Item> {
    await this.ready();
    const map = this.itemsMap();
    const saved = { ...item, id: item.id || uid('it'), updatedAt: this.now().toISOString() } as Item;
    map[saved.id] = saved;
    this.put(K.items, map);
    this.invalidateMastery();
    return clone(saved);
  }

  async deleteItem(id: string): Promise<void> {
    await this.ready();
    const map = this.itemsMap();
    delete map[id];
    this.put(K.items, map);
    this.invalidateMastery();
  }

  async listCourses(filter: { subject?: SubjectId; grade?: Grade } = {}): Promise<Course[]> {
    await this.ready();
    return clone(this.get<Course[]>(K.courses, []).filter((c) => (!filter.subject || c.subject === filter.subject) && (!filter.grade || c.grade === filter.grade)));
  }

  async listPackages(): Promise<ContentPackage[]> {
    await this.ready();
    return Object.values(this.get<Record<string, ContentPackage>>(K.packages, {})).map((p) => this.resolvePackage(p));
  }

  async getPackage(id: string): Promise<ContentPackage | null> {
    await this.ready();
    const p = this.get<Record<string, ContentPackage>>(K.packages, {})[id];
    return p ? this.resolvePackage(p) : null;
  }

  async savePackage(pkg: ContentPackage): Promise<ContentPackage> {
    await this.ready();
    const map = this.get<Record<string, ContentPackage>>(K.packages, {});
    const saved: ContentPackage = { ...pkg, id: pkg.id || uid('pkg'), createdAt: pkg.createdAt || this.now().toISOString() };
    map[saved.id] = saved;
    this.put(K.packages, map);
    return this.resolvePackage(saved);
  }

  /* ================= giao bài & học ================= */
  async listAssignments(filter: { classId?: string; studentId?: string }): Promise<Assignment[]> {
    await this.ready();
    let list = this.get<Assignment[]>(K.assignments, []);
    if (filter.classId) list = list.filter((a) => a.classId === filter.classId);
    if (filter.studentId) {
      const u = this.findUser(filter.studentId);
      list = list.filter((a) => (a.studentIds.length ? a.studentIds.includes(filter.studentId as string) : !!u?.classId && a.classId === u.classId));
    }
    return clone([...list].sort((a, b) => b.openAt.localeCompare(a.openAt)));
  }

  async startAssignment(assignmentId: string): Promise<void> {
    await this.ready();
    const s = this.get<{ userId: string } | null>(K.session, null);
    const a = this.get<Assignment[]>(K.assignments, []).find((x) => x.id === assignmentId);
    if (!s || !a) return;
    if (a.latePolicy === 'lock' && a.dueAt && Date.parse(a.dueAt) < this.now().getTime()) throw friendly('Bài này đã hết hạn nộp. Em hỏi thầy cô nhé.');
    if (a.targetType !== 'lesson') return;
    const key = `${s.userId}|${a.targetId}`;
    const all = this.get<Record<string, LessonProgress>>(K.progress, {});
    const p = all[key];
    if (p && Date.parse(p.updatedAt) < Date.parse(a.openAt)) {
      all[key] = { ...p, slideIndex: 0, completedSlides: [], answers: {}, completedAt: undefined, updatedAt: this.now().toISOString() };
      delete all[key]!.completedAt;
      this.put(K.progress, all);
    }
  }

  async createAssignment(a: Omit<Assignment, 'id'>): Promise<Assignment> {
    await this.ready();
    const list = this.get<Assignment[]>(K.assignments, []);
    const saved: Assignment = { ...a, id: uid('as'), studentIds: a.studentIds ?? [], openAt: a.openAt || this.now().toISOString() };
    list.push(saved);
    this.put(K.assignments, list);
    return clone(saved);
  }

  async getTodayTasks(userId: string): Promise<Task[]> {
    await this.ready();
    const user = this.findUser(userId);
    if (!user) return [];
    const now = this.now();
    const lessons = this.lessonsMap();
    const packages = this.get<Record<string, ContentPackage>>(K.packages, {});
    const progressAll = this.progressMap();
    const progress: Record<string, LessonProgress> = {};
    for (const p of Object.values(progressAll)) if (p.userId === userId) progress[p.lessonId] = p;
    const opened = new Set<string>();
    for (const e of this.events()) {
      if (e.userId !== userId) continue;
      if ((e.verb === 'started' || e.verb === 'viewed') && (e.lessonId || e.objectId)) opened.add(e.lessonId ?? e.objectId);
    }
    const today = dayKey(now);
    const arenaPlaysToday = this.rewards().filter((r) => r.userId === userId && r.sourceType === 'arena' && dayKey(r.at) === today).length;
    const remediation = user.role === 'student' ? this.planFor(userId, now) : [];
    return buildTodayTasks({ user, assignments: this.get<Assignment[]>(K.assignments, []), lessons, packages, progress, openedLessonIds: opened, arenaPlaysToday, remediation, now });
  }

  async getProgress(userId: string, lessonId: string): Promise<LessonProgress | null> {
    await this.ready();
    return clone(this.progressMap()[`${userId}|${lessonId}`] ?? null);
  }

  /** Ghép với bản đã lưu: không làm mất câu trả lời / slide đã xong khi app gửi bản thiếu. */
  async saveProgress(p: LessonProgress): Promise<void> {
    await this.ready();
    const map = this.progressMap();
    const key = `${p.userId}|${p.lessonId}`;
    map[key] = mergeProgress(map[key], p, this.now().toISOString());
    this.put(K.progress, map);
  }

  async recordEvent(e: Omit<LearningEvent, 'id' | 'at'>): Promise<void> {
    await this.ready();
    const list = this.events();
    list.push({ ...e, id: uid('ev'), at: this.now().toISOString() });
    if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
    this.put(K.events, list);
    this.dataRev++;
    this.masteryCache.delete(e.userId);
  }

  async listEvents(filter: { userId?: string; lessonId?: string; assignmentIds?: string[]; limit?: number }): Promise<LearningEvent[]> {
    await this.ready();
    const list = this.events()
      .filter((e) => (!filter.userId || e.userId === filter.userId) && (!filter.lessonId || e.lessonId === filter.lessonId) && (!filter.assignmentIds || (!!e.assignmentId && filter.assignmentIds.includes(e.assignmentId))))
      .sort((a, b) => b.at.localeCompare(a.at));
    return clone(list.slice(0, filter.limit ?? 100));
  }

  async submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
    await this.ready();
    const { userId, item, response, context } = input;
    const score = await this.scorer();
    const result = score(item, response);
    const ungraded = UNGRADED_TYPES.includes(item.type);
    await this.recordEvent({
      userId,
      verb: 'answered',
      objectType: 'item',
      objectId: item.id,
      ...(context.lessonId ? { lessonId: context.lessonId } : {}),
      ...(context.assignmentId ? { assignmentId: context.assignmentId } : {}),
      result: { correct: result.correct, score: result.score, response: response as unknown, ...answerAnnotations(item, response, result.graded && result.correct) },
    });

    let starsAwarded = 0;
    let award: AwardResult | undefined;
    if (ungraded || (result.graded && result.correct)) {
      const scope = context.lessonId ?? context.source ?? 'practice';
      const sourceId = `${item.id}@${scope}`;
      const sourceType: RewardEntry['sourceType'] = context.source === 'arena' ? 'arena' : 'item';
      const already = this.rewards().some((r) => r.userId === userId && r.sourceType === sourceType && r.sourceId === sourceId);
      if (!already) {
        const stars = ungraded ? 1 : Math.max(0, item.stars ?? 1);
        award = await this.award({
          userId,
          stars,
          coins: stars,
          xp: stars * 10,
          reason: ungraded ? `Em đã nộp bài: ${shortText(item.prompt.text)}` : `Trả lời đúng: ${shortText(item.prompt.text)}`,
          sourceType,
          sourceId,
        });
        starsAwarded = stars;
      }
    }

    if (context.lessonId && context.slideId) {
      const map = this.progressMap();
      const key = `${userId}|${context.lessonId}`;
      const prev = map[key];
      const answer = ungraded ? { correct: true, score: 1 } : { correct: result.graded && result.correct, score: result.graded ? result.score : 0 };
      map[key] = mergeProgress(
        prev,
        {
          userId,
          lessonId: context.lessonId,
          slideIndex: prev?.slideIndex ?? 0,
          completedSlides: prev?.completedSlides ?? [],
          answers: { [context.slideId]: answer },
          starsEarned: (prev?.starsEarned ?? 0) + starsAwarded,
          updatedAt: this.now().toISOString(),
        },
        this.now().toISOString(),
      );
      // mergeProgress lấy max sao; ở đây sao cộng dồn nên ghi đè lại cho chắc.
      map[key].starsEarned = (prev?.starsEarned ?? 0) + starsAwarded;
      this.put(K.progress, map);
    }
    return { result, starsAwarded, ...(award ? { award } : {}) };
  }

  /** Gợi ý theo quy tắc từ item + đáp án demo đang giữ (không gọi AI); ghi `hintsUsed` vào lần trả lời gần nhất. */
  async getHint(input: HintInput): Promise<HintResult> {
    await this.ready();
    const item = this.itemsMap()[input.item.id] ?? input.item;
    const hint = (await import('../hint')).localHint(item, input.response, input.attempt);
    if (input.userId) {
      const list = this.events();
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (e.userId !== input.userId || e.verb !== 'answered' || e.objectId !== item.id) continue;
        e.result = { ...e.result, hintsUsed: Math.max(e.result?.hintsUsed ?? 0, hint.level) };
        this.put(K.events, list);
        break;
      }
    }
    return hint;
  }

  async completeLesson(userId: string, lessonId: string): Promise<AwardResult & { starsAwarded: number }> {
    await this.ready();
    const lesson = this.lessonsMap()[lessonId];
    if (!lesson) throw friendly('Không tìm thấy bài giảng này.');
    const nowIso = this.now().toISOString();
    const map = this.progressMap();
    const key = `${userId}|${lessonId}`;
    const prev = map[key];
    const progress: LessonProgress = {
      userId,
      lessonId,
      slideIndex: Math.max(0, lesson.slides.length - 1),
      completedSlides: [...new Set([...(prev?.completedSlides ?? []), ...lesson.slides.map((s) => s.id)])],
      answers: prev?.answers ?? {},
      starsEarned: prev?.starsEarned ?? 0,
      completedAt: prev?.completedAt ?? nowIso,
      updatedAt: nowIso,
    };

    const already = this.rewards().some((r) => r.userId === userId && r.sourceType === 'lesson' && r.sourceId === lessonId);
    if (already) {
      map[key] = progress;
      this.put(K.progress, map);
      return { wallet: await this.getWallet(userId), newlyUnlocked: [], starsAwarded: 0 };
    }

    const items = this.itemsMap();
    let correct = 0;
    for (const s of lesson.slides) {
      const it = s.item ?? (s.itemId ? items[s.itemId] : undefined);
      if (!it || UNGRADED_TYPES.includes(it.type)) continue;
      if (progress.answers[s.id]?.correct) correct++;
    }
    const stars = Math.min(10, correct);
    const res = await this.award({
      userId,
      stars,
      coins: stars,
      xp: stars * 10 + 20,
      reason: `Hoàn thành bài: ${lesson.title}`,
      sourceType: 'lesson',
      sourceId: lessonId,
    });
    progress.starsEarned += stars;
    map[key] = progress;
    this.put(K.progress, map);
    await this.recordEvent({ userId, verb: 'completed', objectType: 'lesson', objectId: lessonId, lessonId, result: { score: correct } });
    return { ...res, starsAwarded: stars };
  }

  /* ================= phần thưởng ================= */
  async getWallet(userId: string): Promise<Wallet> {
    await this.ready();
    return computeWallet(userId, this.rewards(), this.now());
  }

  async award(entry: Omit<RewardEntry, 'id' | 'at'>): Promise<AwardResult> {
    await this.ready();
    const list = this.rewards();
    const e: RewardEntry = { ...normalizeReward(entry), id: uid('rw'), at: this.now().toISOString() };
    list.push(e);
    this.put(K.rewards, list);
    const wallet = computeWallet(entry.userId, list, this.now());
    const passports = this.get<Record<string, Passport>>(K.passports, {});
    const pp = passports[entry.userId] ?? { userId: entry.userId, unlocked: ['nghe'], companion: 'nghe' };
    const newlyUnlocked = newlyUnlockable(wallet.stars, pp.unlocked);
    if (newlyUnlocked.length || !passports[entry.userId]) {
      passports[entry.userId] = { ...pp, unlocked: [...pp.unlocked, ...newlyUnlocked] };
      this.put(K.passports, passports);
    }
    return { wallet, newlyUnlocked };
  }

  async listRewards(userId: string, limit = 50): Promise<RewardEntry[]> {
    await this.ready();
    return clone(
      this.rewards()
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit),
    );
  }

  async getPassport(userId: string): Promise<Passport> {
    await this.ready();
    const passports = this.get<Record<string, Passport>>(K.passports, {});
    const pp = passports[userId] ?? { userId, unlocked: ['nghe'] as MascotId[], companion: 'nghe' as MascotId };
    const total = computeWallet(userId, this.rewards(), this.now()).stars;
    const extra = newlyUnlockable(total, pp.unlocked);
    if (extra.length || !passports[userId]) {
      passports[userId] = { ...pp, unlocked: [...pp.unlocked, ...extra] };
      this.put(K.passports, passports);
    }
    return clone(passports[userId]);
  }

  async setCompanion(userId: string, mascot: MascotId): Promise<Passport> {
    const pp = await this.getPassport(userId);
    if (!pp.unlocked.includes(mascot)) throw friendly('Em cần thêm sao để mở khóa bạn này trước nhé!');
    const passports = this.get<Record<string, Passport>>(K.passports, {});
    passports[userId] = { ...pp, companion: mascot };
    this.put(K.passports, passports);
    return clone(passports[userId]);
  }

  /* ================= thành thạo, lỗ hổng, hồ sơ ================= */
  private itemLikes(): ItemLike[] {
    return Object.values(this.itemsMap());
  }

  /** Mức thành thạo của nhiều HS (đọc sự kiện một lần). */
  private masteriesFor(userIds: string[]): Record<string, SkillMastery[]> {
    const out: Record<string, SkillMastery[]> = {};
    const nowMs = this.now().getTime();
    const missing: string[] = [];
    for (const id of userIds) {
      const c = this.masteryCache.get(id);
      if (c && c.rev === this.dataRev && nowMs - c.at < MASTERY_TTL_MS) out[id] = c.list;
      else missing.push(id);
    }
    if (missing.length) {
      const want = new Set(missing);
      const byUser: Record<string, LearningEvent[]> = {};
      for (const e of this.events()) if (want.has(e.userId)) (byUser[e.userId] ??= []).push(e);
      const items = this.itemsMap();
      for (const id of missing) {
        const list = computeMastery(id, byUser[id] ?? [], items);
        this.masteryCache.set(id, { rev: this.dataRev, at: nowMs, list });
        out[id] = list;
      }
    }
    return out;
  }

  private planFor(userId: string, now: Date = this.now()): RemediationSet[] {
    return planRemediation({ userId, masteries: this.masteriesFor([userId])[userId], items: this.itemLikes(), now });
  }

  async getSkillMastery(userId: string): Promise<SkillMastery[]> {
    await this.ready();
    return clone(this.masteriesFor([userId])[userId]);
  }

  private classOrThrow(classId: string): ClassInfo {
    const cls = this.get<ClassInfo[]>(K.classes, []).find((c) => c.id === classId);
    if (!cls) throw friendly('Không tìm thấy lớp này.');
    return cls;
  }

  private bySubject(list: SkillMastery[], subject: SubjectId): SkillMastery[] {
    return list.filter((m) => SKILL_BY_CODE[m.skillCode]?.subject === subject);
  }

  async getClassHeatmap(classId: string, subject: SubjectId = 'toan'): Promise<ClassHeatmap> {
    await this.ready();
    const cls = this.classOrThrow(classId);
    const students = await this.listStudents(classId);
    const all = this.masteriesFor(students.map((s) => s.id));
    const masteriesByUser = Object.fromEntries(students.map((s) => [s.id, this.bySubject(all[s.id] ?? [], subject)]));
    return classHeatmap({
      classId,
      grade: cls.grade,
      subject,
      students: students.map((s) => ({ id: s.id, name: s.name, avatarMascot: s.avatarMascot, avatarColor: s.avatarColor })),
      masteriesByUser,
      now: this.now(),
    });
  }

  async getGapGroups(classId: string, subject: SubjectId = 'toan'): Promise<GapGroup[]> {
    await this.ready();
    this.classOrThrow(classId);
    const students = await this.listStudents(classId);
    const all = this.masteriesFor(students.map((s) => s.id));
    return studentGroupsByGap({
      students: students.map((s) => ({ id: s.id, name: s.name, avatarMascot: s.avatarMascot, avatarColor: s.avatarColor })),
      masteriesByUser: Object.fromEntries(students.map((s) => [s.id, this.bySubject(all[s.id] ?? [], subject)])),
      items: this.itemLikes(),
    });
  }

  async getRemediationSets(userId: string): Promise<RemediationSet[]> {
    await this.ready();
    return clone(this.planFor(userId));
  }

  async submitRemediationResult(userId: string, setId: string, results: RemediationAnswer[]): Promise<RemediationOutcome> {
    await this.ready();
    const parsed = parseRemediationSetId(setId);
    if (!parsed || parsed.userId !== userId) throw friendly('Không tìm thấy bộ ôn tập này.');
    const set = this.planFor(userId).find((s) => s.id === setId);
    const { correct, total, passed } = evaluateRemediation(results ?? []);
    if (!total) throw friendly('Em chưa làm câu nào trong bộ ôn tập.');
    const skills = [parsed.skillCode, ...(set && set.rootSkill !== parsed.skillCode ? [set.rootSkill] : [])];
    await this.recordEvent({
      userId,
      verb: 'completed',
      objectType: 'remediation',
      objectId: setId,
      result: { correct: passed, score: Math.round((correct / total) * 100) / 100, correctCount: correct, total, skills },
    });
    const mastery = this.masteriesFor([userId])[userId].find((m) => m.skillCode === parsed.skillCode);
    if (!mastery) throw friendly('Chưa tính được mức thành thạo, em thử lại nhé.');
    return { setId, skillCode: parsed.skillCode, passed, correct, total, mastery: clone(mastery), message: remediationMessage(passed, mastery.reviewStage, correct, total) };
  }

  async getStudentProfile(userId: string): Promise<StudentProfile> {
    await this.ready();
    const student = this.requireUser(userId);
    const classes = this.get<ClassInfo[]>(K.classes, []);
    const cls = classes.find((c) => c.id === student.classId) ?? classes.find((c) => c.studentIds.includes(userId)) ?? null;
    const teacher = cls ? this.findUser(cls.teacherId) : undefined;
    const events = this.events().filter((e) => e.userId === userId);
    return clone(
      buildStudentProfile({
        now: this.now(),
        student: clone(student),
        cls,
        teacherName: teacher?.name,
        wallet: await this.getWallet(userId),
        passport: await this.getPassport(userId),
        masteries: this.masteriesFor([userId])[userId],
        items: this.itemLikes(),
        assignments: this.get<Assignment[]>(K.assignments, []),
        lessons: this.lessonsMap(),
        progress: Object.values(this.progressMap()).filter((p) => p.userId === userId),
        events,
        rewards: this.rewards().filter((r) => r.userId === userId),
        works: this.workEntries(userId),
        workPending: this.subs().filter((x) => x.studentId === userId && !['approved', 'returned'].includes(x.status)).length,
        behaviorLogs: this.behaviorLogs().filter((l) => l.studentId === userId),
        behaviors: cls ? this.behaviorsOf(cls.id) : [],
        attendance: cls ? this.get<AttendanceRecord[]>(K.attendance, []).filter((r) => r.classId === cls.id) : [],
        tt27: this.latestTt27(userId),
      }),
    );
  }

  async getParentSummary(childId: string): Promise<ParentSummary> {
    await this.ready();
    const child = this.requireUser(childId);
    const from = this.now().getTime() - 15 * 86_400_000;
    return buildParentSummary({
      now: this.now(),
      child,
      masteries: this.masteriesFor([childId])[childId],
      events: this.events().filter((e) => e.userId === childId && new Date(e.at).getTime() >= from),
      rewards: this.rewards().filter((r) => r.userId === childId && new Date(r.at).getTime() >= from),
      items: this.itemLikes(),
      works: this.workEntries(childId),
      behaviorLogs: this.behaviorLogs().filter((l) => l.studentId === childId),
      behaviors: child.classId ? this.behaviorsOf(child.classId) : [],
      attendance: child.classId ? this.get<AttendanceRecord[]>(K.attendance, []).filter((r) => r.classId === child.classId) : [],
    });
  }

  /* ================= Phase 4: bài làm & AI chấm ================= */
  private viewer(): Profile | undefined {
    const s = this.get<{ userId: string } | null>(K.session, null);
    return s ? this.findUser(s.userId) : undefined;
  }
  /** Không đăng nhập (kiểm thử, công cụ) = xem như GV. */
  private viewerIsStaff(): boolean {
    const v = this.viewer();
    return !v || v.role === 'teacher' || v.role === 'admin';
  }
  private requireStaff(): void {
    if (!this.viewerIsStaff()) throw friendly('Chỉ thầy cô mới làm được việc này.');
  }
  private rubricsList(): Rubric[] {
    return this.get<Rubric[]>(K.rubrics, []);
  }
  private tasksList(): WorkTask[] {
    return this.get<WorkTask[]>(K.workTasks, []);
  }
  private subs(): Submission[] {
    return this.get<Submission[]>(K.submissions, []);
  }
  private gradesMap(): Record<string, AiGrade> {
    return this.get<Record<string, AiGrade>>(K.aiGrades, {});
  }
  private reviewsMap(): Record<string, GradeReview> {
    return this.get<Record<string, GradeReview>>(K.gradeReviews, {});
  }
  private putSub(sub: Submission): void {
    const list = this.subs();
    const i = list.findIndex((x) => x.id === sub.id);
    if (i >= 0) list[i] = sub;
    else list.push(sub);
    this.put(K.submissions, list);
  }

  private detailOf(sub: Submission, full: boolean): SubmissionDetail {
    const task = this.tasksList().find((t) => t.id === sub.taskId);
    const staff = this.viewerIsStaff();
    const visible = staff || sub.status === 'approved';
    const grade = this.gradesMap()[sub.id];
    const review = this.reviewsMap()[sub.id];
    const rubric = task ? this.rubricsList().find((r) => r.id === task.rubricId) : undefined;
    const d: SubmissionDetail = {
      ...sub,
      studentName: this.findUser(sub.studentId)?.name,
      ...(task ? { taskTitle: task.title } : {}),
      ...(full && task ? { task } : {}),
      ...(full && rubric && staff ? { rubric } : {}),
    };
    if (grade && visible) {
      d.grade = grade;
      if (sub.status === 'approved') d.final = mergeFinal(grade, review, rubric);
    }
    if (review && (visible || sub.status === 'returned')) d.review = staff || sub.status === 'approved' ? review : { ...review, final: undefined };
    return d;
  }

  private workEntries(studentId: string): StudentWorkEntry[] {
    return this.subs()
      .filter((x) => x.studentId === studentId && x.status === 'approved')
      .map((x) => workEntryOf(this.detailOf(x, true)))
      .filter((x): x is StudentWorkEntry => !!x)
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  async listRubrics(filter: RubricFilter = {}): Promise<Rubric[]> {
    await this.ready();
    return clone(
      this.rubricsList().filter((r) => (!filter.subject || r.subject === filter.subject) && (!filter.grade || r.grade === filter.grade) && (!filter.ownerId || r.ownerId === filter.ownerId)),
    );
  }

  async getRubric(id: string): Promise<Rubric | null> {
    await this.ready();
    return clone(this.rubricsList().find((r) => r.id === id) ?? null);
  }

  async saveRubric(r: Rubric): Promise<Rubric> {
    await this.ready();
    this.requireStaff();
    if (!r.title?.trim()) throw friendly('Thầy cô đặt tên cho tiêu chí chấm nhé.');
    if (!r.criteria?.length) throw friendly('Cần ít nhất một tiêu chí chấm.');
    const saved: Rubric = {
      ...r,
      id: r.id || uid('rb'),
      maxScore: r.maxScore > 0 ? r.maxScore : 10,
      criteria: r.criteria.map((c) => ({ ...c, id: c.id || uid('cr'), points: Math.max(0, Number(c.points) || 0) })),
      skills: r.skills ?? [],
      ownerId: r.ownerId ?? this.viewer()?.id,
      updatedAt: this.now().toISOString(),
    };
    const list = this.rubricsList().filter((x) => x.id !== saved.id);
    list.push(saved);
    this.put(K.rubrics, list);
    return clone(saved);
  }

  async deleteRubric(id: string): Promise<void> {
    await this.ready();
    this.requireStaff();
    if (this.tasksList().some((t) => t.rubricId === id)) throw friendly('Tiêu chí này đang dùng cho một bài làm — thầy cô xoá bài làm trước nhé.');
    this.put(K.rubrics, this.rubricsList().filter((r) => r.id !== id));
  }

  private taskApplies(t: WorkTask, studentId: string): boolean {
    const u = this.findUser(studentId);
    return t.studentIds.length ? t.studentIds.includes(studentId) : !!u && (u.classId === t.classId || this.get<ClassInfo[]>(K.classes, []).some((c) => c.id === t.classId && c.studentIds.includes(studentId)));
  }

  async listWorkTasks(filter: WorkTaskFilter = {}): Promise<WorkTask[]> {
    await this.ready();
    const list = this.tasksList().filter(
      (t) => (!filter.classId || t.classId === filter.classId) && (!filter.createdBy || t.createdBy === filter.createdBy) && (!filter.studentId || this.taskApplies(t, filter.studentId)),
    );
    return clone(list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')));
  }

  async getWorkTask(id: string): Promise<WorkTask | null> {
    await this.ready();
    return clone(this.tasksList().find((t) => t.id === id) ?? null);
  }

  async saveWorkTask(t: WorkTask): Promise<WorkTask> {
    await this.ready();
    this.requireStaff();
    if (!t.title?.trim() || !t.prompt?.text?.trim()) throw friendly('Thầy cô nhập tên bài và đề bài nhé.');
    if (!this.rubricsList().some((r) => r.id === t.rubricId)) throw friendly('Thầy cô chọn tiêu chí chấm (rubric) cho bài này nhé.');
    if (!t.allowPhoto && !t.allowText) throw friendly('Cần cho phép nộp ảnh hoặc đánh máy (ít nhất một cách).');
    const saved: WorkTask = { ...t, id: t.id || uid('wt'), studentIds: t.studentIds ?? [], createdBy: t.createdBy || this.viewer()?.id || '', createdAt: t.createdAt || this.now().toISOString() };
    const list = this.tasksList().filter((x) => x.id !== saved.id);
    list.push(saved);
    this.put(K.workTasks, list);
    return clone(saved);
  }

  async deleteWorkTask(id: string): Promise<void> {
    await this.ready();
    this.requireStaff();
    const gone = new Set(this.subs().filter((x) => x.taskId === id).map((x) => x.id));
    this.put(K.workTasks, this.tasksList().filter((t) => t.id !== id));
    this.put(K.submissions, this.subs().filter((x) => !gone.has(x.id)));
    const g = this.gradesMap();
    const rv = this.reviewsMap();
    for (const sid of gone) {
      delete g[sid];
      delete rv[sid];
    }
    this.put(K.aiGrades, g);
    this.put(K.gradeReviews, rv);
  }

  async submitWork(input: SubmitWorkInput): Promise<SubmissionDetail> {
    await this.ready();
    const task = this.tasksList().find((t) => t.id === input.taskId);
    if (!task) throw friendly('Không tìm thấy bài làm này.');
    this.requireUser(input.studentId);
    if (!this.taskApplies(task, input.studentId)) throw friendly('Bài này không giao cho em.');
    const by = input.submittedBy ?? 'student';
    const viewer = this.viewer();
    if (viewer?.role === 'student' && (viewer.id !== input.studentId || by !== 'student')) throw friendly('Em chỉ nộp được bài của mình thôi nhé.');
    const text = input.text?.trim() ?? '';
    const raw = input.images ?? [];
    if (!text && !raw.length) throw friendly('Em viết bài hoặc chụp ảnh bài làm rồi bấm nộp nhé.');
    if (raw.length && !task.allowPhoto) throw friendly('Bài này chỉ nộp bằng cách đánh máy.');
    if (text && !task.allowText && by === 'student') throw friendly('Bài này chỉ nộp bằng ảnh chụp.');
    if (raw.length > 6) throw friendly('Mỗi bài nộp tối đa 6 ảnh.');
    const images = [];
    for (const r of raw) {
      const { blob: _b, ...im } = await compressWorkImage(r);
      images.push(im);
    }
    const nowIso = this.now().toISOString();
    const sub: Submission = {
      id: uid('sub'),
      taskId: task.id,
      studentId: input.studentId,
      classId: task.classId,
      kind: images.length && text ? 'mixed' : images.length ? 'photo' : 'text',
      ...(text ? { text } : {}),
      images,
      submittedBy: by,
      ...(by === 'teacher' && viewer ? { submitterId: viewer.id } : {}),
      status: 'submitted',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.putSub(sub);
    if (input.autoGrade) return this.requestAiGrade(sub.id);
    return clone(this.detailOf(sub, true));
  }

  async requestAiGrade(submissionId: string): Promise<SubmissionDetail> {
    await this.ready();
    const sub = this.subs().find((x) => x.id === submissionId);
    if (!sub) throw friendly('Không tìm thấy bài nộp này.');
    const viewer = this.viewer();
    if (viewer && viewer.role !== 'teacher' && viewer.role !== 'admin' && viewer.id !== sub.studentId) throw friendly('Không có quyền chấm bài này.');
    if (sub.status === 'approved') throw friendly('Bài đã được duyệt — muốn chấm lại, thầy cô chọn "Chấm lại" khi duyệt.');
    const task = this.tasksList().find((t) => t.id === sub.taskId);
    const rubric = task ? this.rubricsList().find((r) => r.id === task.rubricId) : undefined;
    if (!task || !rubric) throw friendly('Bài này chưa có tiêu chí chấm.');
    this.putSub({ ...sub, status: 'grading', updatedAt: this.now().toISOString() });
    const nowIso = this.now().toISOString();
    let grade: AiGrade;
    try {
      grade = demoAiEnabled() ? await demoAiGrade({ task, rubric, submission: sub, now: nowIso }) : mockGrade({ task, rubric, submission: sub, now: nowIso });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chưa chấm được bài này.';
      this.putSub({ ...sub, status: 'error', error: msg, updatedAt: nowIso });
      throw friendly(msg);
    }
    const g = this.gradesMap();
    g[sub.id] = grade;
    this.put(K.aiGrades, g);
    const rv = this.reviewsMap();
    if (rv[sub.id]) {
      delete rv[sub.id];
      this.put(K.gradeReviews, rv);
    }
    const { error: _e, ...rest } = sub;
    const next: Submission = { ...rest, status: statusAfterGrade(grade), updatedAt: nowIso };
    this.putSub(next);
    return clone(this.detailOf(next, true));
  }

  async listSubmissions(filter: SubmissionFilter = {}): Promise<SubmissionDetail[]> {
    await this.ready();
    const st = filter.status ? (Array.isArray(filter.status) ? filter.status : [filter.status]) : null;
    const v = this.viewer();
    const kids = v?.role === 'parent' ? this.get<Record<string, string[]>>(K.guardians, {})[v.id] ?? [] : null;
    const list = this.subs().filter(
      (x) =>
        (!filter.taskId || x.taskId === filter.taskId) &&
        (!filter.studentId || x.studentId === filter.studentId) &&
        (!filter.classId || x.classId === filter.classId) &&
        (!st || st.includes(x.status)) &&
        (v?.role !== 'student' || x.studentId === v.id) &&
        (!kids || (kids.includes(x.studentId) && x.status === 'approved')),
    );
    return clone(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => this.detailOf(x, false)));
  }

  async getSubmission(id: string): Promise<SubmissionDetail | null> {
    await this.ready();
    const sub = this.subs().find((x) => x.id === id);
    return sub ? clone(this.detailOf(sub, true)) : null;
  }

  async reviewGrade(review: Omit<GradeReview, 'at'> & { at?: string }): Promise<SubmissionDetail> {
    await this.ready();
    this.requireStaff();
    const sub = this.subs().find((x) => x.id === review.submissionId);
    if (!sub) throw friendly('Không tìm thấy bài nộp này.');
    if (review.decision === 'regrade') {
      if (sub.status === 'approved') this.removeWorkEvents(sub.id);
      this.putSub({ ...sub, status: 'submitted' });
      return this.requestAiGrade(sub.id);
    }
    const nowIso = review.at ?? this.now().toISOString();
    const saved: GradeReview = { ...review, at: nowIso };
    const rv = this.reviewsMap();
    rv[sub.id] = saved;
    this.put(K.gradeReviews, rv);
    if (review.decision === 'redo') {
      if (sub.status === 'approved') this.removeWorkEvents(sub.id);
      const next: Submission = { ...sub, status: 'returned', updatedAt: nowIso };
      this.putSub(next);
      return clone(this.detailOf(next, true));
    }
    const task = this.tasksList().find((t) => t.id === sub.taskId);
    const rubric = task ? this.rubricsList().find((r) => r.id === task.rubricId) : undefined;
    if (review.manual) {
      const f = review.final ?? {};
      let g: AiGrade;
      try {
        g = teacherGrade({
          submissionId: sub.id, rubric: rubric ?? { criteria: [], maxScore: 10 }, now: nowIso,
          ...(f.level ? { level: f.level } : {}), ...(typeof f.total === 'number' ? { total: f.total } : {}), ...(f.criteria ? { criteria: f.criteria } : {}),
          ...(f.feedbackStudent !== undefined ? { feedbackStudent: f.feedbackStudent } : {}), ...(f.feedbackParent !== undefined ? { feedbackParent: f.feedbackParent } : {}),
          ...(f.feedbackTeacher !== undefined ? { feedbackTeacher: f.feedbackTeacher } : {}),
        });
      } catch (e) {
        throw friendly(e instanceof Error ? e.message : 'Thiếu mức hoặc điểm.');
      }
      const gm = this.gradesMap();
      gm[sub.id] = g;
      this.put(K.aiGrades, gm);
      const { final: _given, ...kept } = saved;
      rv[sub.id] = kept;
      this.put(K.gradeReviews, rv);
    }
    const grade = this.gradesMap()[sub.id];
    if (!grade) throw friendly('Bài chưa được chấm — thầy cô bấm "Tự chấm" hoặc "Chấm bằng AI" trước nhé.');
    const final = mergeFinal(grade, rv[sub.id], rubric);
    this.removeWorkEvents(sub.id);
    for (const e of approvalEvents({ submissionId: sub.id, studentId: sub.studentId, taskId: sub.taskId, taskTitle: task?.title ?? 'Bài làm', rubric: rubric ?? { skills: [] }, grade, final })) {
      await this.recordEvent(e);
    }
    const already = this.rewards().some((r) => r.userId === sub.studentId && r.sourceType === 'work' && r.sourceId === sub.id);
    if (!already) await this.award(approvalReward({ submissionId: sub.id, studentId: sub.studentId, taskTitle: task?.title ?? 'Bài làm', level: final.level }));
    const next: Submission = { ...sub, status: 'approved', updatedAt: nowIso };
    this.putSub(next);
    return clone(this.detailOf(next, true));
  }

  /** Bỏ sự kiện 'work' cũ của bài (duyệt lại / chấm lại) để thành thạo không tính trùng. */
  private removeWorkEvents(submissionId: string): void {
    const prefix = `work:${submissionId}`;
    const list = this.events();
    const kept = list.filter((e) => !(e.objectType === 'work' && (e.objectId === prefix || e.objectId.startsWith(`${prefix}:`))));
    if (kept.length !== list.length) {
      this.put(K.events, kept);
      this.invalidateMastery();
    }
  }

  async getStudentWork(studentId: string): Promise<StudentWorkEntry[]> {
    await this.ready();
    return clone(this.workEntries(studentId));
  }

  /* ================= Phase 4: TT27, thi đua, điểm danh ================= */
  private tt27List(): Tt27Evaluation[] {
    return this.get<Tt27Evaluation[]>(K.tt27, []);
  }
  private latestTt27(studentId: string): Tt27Evaluation | null {
    const order: Tt27TermId[] = ['GK1', 'CK1', 'GK2', 'CN'];
    const staff = this.viewerIsStaff();
    const list = this.tt27List()
      .filter((e) => e.studentId === studentId && (staff || e.status === 'final'))
      .sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || order.indexOf(b.termId) - order.indexOf(a.termId));
    return list[0] ?? null;
  }

  async listTt27(filter: { classId?: string; studentId?: string; termId?: Tt27TermId; schoolYear?: string }): Promise<Tt27Evaluation[]> {
    await this.ready();
    const staff = this.viewerIsStaff();
    return clone(
      this.tt27List().filter(
        (e) =>
          (!filter.classId || e.classId === filter.classId) &&
          (!filter.studentId || e.studentId === filter.studentId) &&
          (!filter.termId || e.termId === filter.termId) &&
          (!filter.schoolYear || e.schoolYear === filter.schoolYear) &&
          (staff || e.status === 'final'),
      ),
    );
  }

  async saveTt27(e: Tt27Evaluation): Promise<Tt27Evaluation> {
    await this.ready();
    this.requireStaff();
    this.requireUser(e.studentId);
    const saved: Tt27Evaluation = { ...e, schoolYear: e.schoolYear || schoolYearOf(this.now()), updatedBy: this.viewer()?.id ?? e.updatedBy, updatedAt: this.now().toISOString() };
    delete (saved as Partial<Tt27Suggestion>).basis;
    const key = (x: Tt27Evaluation) => `${x.studentId}|${x.termId}|${x.schoolYear}`;
    const list = this.tt27List().filter((x) => key(x) !== key(saved));
    list.push(saved);
    this.put(K.tt27, list);
    return clone(saved);
  }

  async suggestTt27(studentId: string, termId: Tt27TermId): Promise<Tt27Suggestion> {
    await this.ready();
    const student = this.requireUser(studentId);
    const classId = student.classId ?? this.get<ClassInfo[]>(K.classes, []).find((c) => c.studentIds.includes(studentId))?.id ?? '';
    const now = this.now();
    return suggestTt27({
      student,
      classId,
      termId,
      now,
      masteries: this.masteriesFor([studentId])[studentId],
      works: this.workEntries(studentId),
      behaviorLogs: this.behaviorLogs().filter((l) => l.studentId === studentId),
      attendance: attendanceSummary(this.get<AttendanceRecord[]>(K.attendance, []).filter((r) => r.classId === classId), studentId, now),
      examScores: await getExamService(this).examScores(studentId).catch(() => []), // Phase 6: điểm KTĐK
    });
  }

  private behaviorLogs(): BehaviorLog[] {
    return this.get<BehaviorLog[]>(K.behaviorLogs, []);
  }
  private behaviorsOf(classId: string): Behavior[] {
    const own = this.get<Behavior[]>(K.behaviors, []).filter((b) => b.classId === classId);
    return own.length ? own : defaultBehaviors(classId);
  }

  async listBehaviors(classId: string): Promise<Behavior[]> {
    await this.ready();
    return clone(this.behaviorsOf(classId));
  }

  async saveBehavior(b: Behavior): Promise<Behavior> {
    await this.ready();
    this.requireStaff();
    if (!b.label?.trim()) throw friendly('Thầy cô nhập tên hành vi nhé.');
    const all = this.get<Behavior[]>(K.behaviors, []);
    // Lớp chưa có danh sách riêng: chép danh sách mặc định trước.
    if (!all.some((x) => x.classId === b.classId)) all.push(...defaultBehaviors(b.classId));
    const saved: Behavior = { ...b, id: b.id || uid('bh'), points: Math.max(-5, Math.min(5, Math.round(b.points) || 0)), kind: b.points >= 0 ? 'positive' : 'needs-work' };
    const list = all.filter((x) => !(x.classId === saved.classId && x.id === saved.id));
    list.push(saved);
    this.put(K.behaviors, list);
    return clone(saved);
  }

  async listBehaviorLogs(filter: { classId?: string; studentId?: string; from?: string; to?: string; limit?: number }): Promise<BehaviorLog[]> {
    await this.ready();
    const list = this.behaviorLogs()
      .filter(
        (l) =>
          (!filter.classId || l.classId === filter.classId) &&
          (!filter.studentId || l.studentId === filter.studentId) &&
          (!filter.from || l.at >= filter.from) &&
          (!filter.to || l.at <= filter.to),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
    return clone(list.slice(0, filter.limit ?? 500));
  }

  async recordBehavior(input: RecordBehaviorInput): Promise<BehaviorLog[]> {
    await this.ready();
    this.requireStaff();
    const cls = this.classOrThrow(input.classId);
    const b = this.behaviorsOf(cls.id).find((x) => x.id === input.behaviorId);
    if (!b) throw friendly('Không tìm thấy hành vi này.');
    if (!input.studentIds?.length) throw friendly('Thầy cô chọn ít nhất một học sinh nhé.');
    const nowIso = this.now().toISOString();
    const logs = this.behaviorLogs();
    const out: BehaviorLog[] = [];
    for (const sid of [...new Set(input.studentIds)]) {
      if (!cls.studentIds.includes(sid)) continue;
      const team = cls.teams.find((t) => t.studentIds.includes(sid));
      const log: BehaviorLog = { id: uid('bl'), studentId: sid, classId: cls.id, behaviorId: b.id, points: b.points, ...(input.note ? { note: input.note } : {}), ...(team ? { teamId: team.id } : {}), at: nowIso, by: input.by };
      logs.push(log);
      out.push(log);
    }
    this.put(K.behaviorLogs, logs);
    if (b.points > 0) {
      for (const l of out) await this.award({ userId: l.studentId, stars: b.points, coins: b.points, xp: b.points * 10, reason: `Thầy cô khen: ${b.label}`, sourceType: 'behavior', sourceId: l.id });
    }
    return clone(out);
  }

  async undoBehavior(logId: string): Promise<void> {
    await this.ready();
    this.requireStaff();
    this.put(K.behaviorLogs, this.behaviorLogs().filter((l) => l.id !== logId));
    const rewards = this.rewards();
    const kept = rewards.filter((r) => !(r.sourceType === 'behavior' && r.sourceId === logId));
    if (kept.length !== rewards.length) this.put(K.rewards, kept);
  }

  async getClassLeaderboard(classId: string, range: { from?: string; to?: string } = {}): Promise<ClassLeaderboard> {
    await this.ready();
    const cls = this.classOrThrow(classId);
    const now = this.now();
    return classLeaderboard({ cls, students: await this.listStudents(classId), logs: this.behaviorLogs(), from: range.from ?? vnWeekStart(now), to: range.to ?? now.toISOString() });
  }

  async listAttendance(classId: string, range: { from?: string; to?: string } = {}): Promise<AttendanceRecord[]> {
    await this.ready();
    return clone(
      this.get<AttendanceRecord[]>(K.attendance, [])
        .filter((r) => r.classId === classId && (!range.from || r.date >= range.from.slice(0, 10)) && (!range.to || r.date <= range.to.slice(0, 10)))
        .sort((a, b) => b.date.localeCompare(a.date)),
    );
  }

  async saveAttendance(r: AttendanceRecord): Promise<AttendanceRecord> {
    await this.ready();
    this.requireStaff();
    const cls = this.classOrThrow(r.classId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw friendly('Ngày điểm danh không hợp lệ.');
    const ok: AttendanceStatus[] = ['co-mat', 'vang-co-phep', 'vang-khong-phep', 'muon'];
    const entries: Record<string, AttendanceStatus> = {};
    for (const [sid, st] of Object.entries(r.entries ?? {})) if (cls.studentIds.includes(sid) && ok.includes(st)) entries[sid] = st;
    const saved: AttendanceRecord = { classId: r.classId, date: r.date, entries };
    const list = this.get<AttendanceRecord[]>(K.attendance, []).filter((x) => !(x.classId === saved.classId && x.date === saved.date));
    list.push(saved);
    this.put(K.attendance, list);
    return clone(saved);
  }

  /* ================= trực tiếp ================= */
  private saveLiveState(s: LiveState): void {
    const map = this.get<Record<string, LiveState>>(K.live, {});
    map[s.sessionId] = s;
    const keys = Object.keys(map);
    if (keys.length > MAX_LIVE) {
      keys
        .sort((a, b) => map[a].updatedAt.localeCompare(map[b].updatedAt))
        .slice(0, keys.length - MAX_LIVE)
        .forEach((k) => delete map[k]);
    }
    this.put(K.live, map);
  }

  async createLiveSession(lessonId: string, classId?: string): Promise<LiveSessionInfo> {
    await this.ready();
    const lesson = this.lessonsMap()[lessonId];
    if (!lesson) throw friendly('Không tìm thấy bài giảng để mở lớp trực tiếp.');
    const itemsMap = this.itemsMap();
    const items: Record<string, Item> = {};
    for (const s of lesson.slides) {
      if (s.item) items[s.item.id] = s.item;
      if (s.itemId && itemsMap[s.itemId]) items[s.itemId] = itemsMap[s.itemId];
      for (const q of s.video?.questions ?? []) if (itemsMap[q.itemId]) items[q.itemId] = itemsMap[q.itemId];
    }
    let cls: ClassInfo | undefined;
    const classes = this.get<ClassInfo[]>(K.classes, []);
    if (classId) cls = classes.find((c) => c.id === classId);
    else {
      const me = this.get<{ userId: string } | null>(K.session, null);
      const u = me ? this.findUser(me.userId) : undefined;
      if (u?.role === 'teacher' && u.classId) cls = classes.find((c) => c.id === u.classId);
    }
    const state = createInitialLiveState({
      sessionId: uid('live'),
      pin: randomPin(),
      lesson,
      items,
      teams: (cls?.teams ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color, stars: 0 })),
      now: this.now(),
    });
    await registerRoomOnRelay(state, this.relayUrl);
    this.saveLiveState(state);
    return { sessionId: state.sessionId, pin: state.pin, lessonId, lessonTitle: lesson.title };
  }

  async findLiveSession(pin: string): Promise<LiveSessionInfo | null> {
    const clean = (pin ?? '').replace(/\D/g, '');
    if (clean.length !== 6) return null;
    let res: Response;
    try {
      res = await fetch(`${relayHttpUrl(this.relayUrl)}/pin/${clean}`, { cache: 'no-store' });
    } catch {
      throw friendly('Chưa kết nối được máy chủ lớp học. Em nhờ thầy cô kiểm tra Wi-Fi và máy chủ lớp (pnpm relay) nhé!');
    }
    if (res.status === 404) return null;
    if (!res.ok) throw friendly('Máy chủ lớp học đang bận, em thử lại sau một chút nhé.');
    const body = (await res.json()) as LiveSessionInfo;
    return body && body.sessionId ? body : null;
  }

  async openLiveChannel(sessionId: string, role: LiveRole): Promise<LiveChannel> {
    await this.ready();
    const classes = this.get<ClassInfo[]>(K.classes, []);
    const initialState = role === 'teacher' ? this.get<Record<string, LiveState>>(K.live, {})[sessionId] ?? null : null;
    const awarded = new Set<string>();
    const ch = new RelayLiveChannel(sessionId, role, {
      url: this.relayUrl,
      initialState,
      score: this.scoreOverride,
      onStateChange: role === 'teacher' ? (s) => this.saveLiveState(s) : undefined,
      prepareParticipant: (p: LiveParticipant, state: LiveState | null) => {
        if (p.teamId) return p;
        const teamIds = new Set((state?.teams ?? []).map((t) => t.id));
        for (const c of classes) {
          const t = c.teams.find((x) => x.studentIds.includes(p.userId) && (!teamIds.size || teamIds.has(x.id)));
          if (t) return { ...p, teamId: t.id };
        }
        return p;
      },
      onGraded:
        role === 'student'
          ? (r, item) => {
              // Cộng sao vào ví trên máy HS: lần đúng đầu tiên với mỗi câu trong phiên.
              void (async () => {
                await this.recordEvent({
                  userId: r.userId,
                  verb: 'answered',
                  objectType: 'item',
                  objectId: r.itemId,
                  liveSessionId: sessionId,
                  result: { correct: r.correct, score: r.score, response: r.response as unknown, ...answerAnnotations(item, r.response, !!r.correct) },
                });
                if (!r.correct) return;
                const sourceId = `${r.itemId}@live:${sessionId}`;
                if (awarded.has(sourceId) || this.rewards().some((x) => x.userId === r.userId && x.sourceId === sourceId)) return;
                awarded.add(sourceId);
                const stars = Math.max(0, item.stars ?? 1);
                await this.award({ userId: r.userId, stars, coins: stars, xp: stars * 10, reason: 'Trả lời đúng trong lớp học trực tiếp', sourceType: 'live', sourceId });
              })().catch(() => undefined);
            }
          : undefined,
    });
    await ch.whenReady(1500);
    return ch;
  }
}

function shortText(s: string, n = 40): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}


