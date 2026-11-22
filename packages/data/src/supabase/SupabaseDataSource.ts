/**
 * Nguồn dữ liệu Supabase (schema v2) theo docs/SUPABASE_API.md.
 *
 * ⚠ CHƯA KIỂM THỬ với một project Supabase thật (môi trường dựng mã không có mạng tới Supabase).
 * Những giả định cần đối chiếu với migrations được đánh dấu "GIẢ ĐỊNH".
 */
import { packSession, unpackSession } from '../sessionPack';
import { normalizeParentLogin } from '../school/login';
import { NO_REAL_EMAIL_TEXT, isSystemEmail, newPasswordProblem } from '../password';
import {
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
  type LearningEvent,
  type Lesson,
  type LessonFilter,
  type LessonProgress,
  type LiveChannel,
  type LiveRole,
  type LiveSessionInfo,
  type MascotId,
  type Passport,
  type Profile,
  type RewardEntry,
  type ScoreResult,
  type StudentSettings,
  type SubjectId,
  type SubmitAnswerInput,
  type SubmitAnswerResult,
  type CompleteLessonOptions,
  type Task,
  type Wallet,
  schoolYearOf,
  type AttendanceRecord,
  type Behavior,
  type BehaviorLog,
  type ClassLeaderboard,
  type GradeReview,
  type RecordBehaviorInput,
  type Rubric,
  type RubricFilter,
  type StudentWorkEntry,
  type SubmissionDetail,
  type SubmissionFilter,
  type SubmitWorkInput,
  type Tt27Evaluation,
  type Tt27Suggestion,
  type Tt27TermId,
  type WorkTask,
  type WorkTaskFilter,
} from '@openedu/contracts';
import { mergeFinal } from '../assess';
import { attendanceSummary, classLeaderboard, defaultBehaviors, suggestTt27, vnWeekStart, workEntryOf } from '../engagement';
import { getExamService } from '../exam/service';
import { compressWorkImage } from '../workImage';
import {
  fromAiGradeRow,
  fromBehavior,
  fromBehaviorLog,
  fromReview,
  fromRubric,
  fromSubmission,
  fromTt27,
  fromWorkTask,
  groupAttendance,
  imagePaths,
  one,
  toRubricRow,
  toTt27Row,
  toWorkTaskRow,
} from './assessMapping';
import { mergeProgress } from '../progress';
import { readEnv } from '../env';
import { dayKey } from '../rewards';
import { buildTodayTasks } from '../tasks';
import { classHeatmap, masteryFromRow, planRemediation, studentGroupsByGap, type ItemLike, type StudentLite } from '../mastery';
import { buildParentSummary, buildStudentProfile, type LessonLite } from '../profile';
import { foldVietnamese } from '../text';
import { getSupabaseClient, type V2Client } from './client';
import {
  fromAssignment,
  fromClass,
  fromCourse,
  fromEvent,
  fromItem,
  fromLesson,
  fromLiveInfo,
  fromPackage,
  fromPassport,
  fromProfile,
  fromProgress,
  fromReward,
  fromWallet,
  pick,
  toAssignmentRow,
  toEventRow,
  toItemJson,
  toLessonJson,
  toPackageRow,
  toProgressRow,
  type Row,
} from './mapping';
import { SupabaseLiveChannel } from './SupabaseLiveChannel';

const SUBMISSION_SELECT = '*, work_tasks(title, subject, rubric_id), ai_grades(data), grade_reviews(*), student:profiles!submissions_student_id_fkey(name)';
const BUCKET = 'submissions';

/** Dữ liệu thêm cho hồ sơ (RPC get_student_extras). */
interface Extras {
  works: StudentWorkEntry[];
  workPending: number;
  behaviors: Behavior[];
  behaviorLogs: BehaviorLog[];
  attendance: AttendanceRecord[];
  tt27: Tt27Evaluation | null;
}

const CLASS_SELECT = '*, class_members(user_id, role, team_id), class_teams(id, name, color)';
const LESSON_SELECT = '*, lesson_slides(id, position, layout, data)';

interface PgError {
  message: string;
  code?: string;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function fail(e: PgError | Error | null | undefined, vi: string): never {
  const detail = e && 'message' in e ? e.message : '';
  // Giữ mã lỗi / HTTP status / lỗi gốc để hàng đợi offline phân biệt mất mạng với server từ chối (offline/policy.ts).
  const err = new Error(detail ? `${vi} (${detail})` : vi) as Error & { cause?: unknown; code?: string; status?: number };
  if (e) {
    err.cause = e;
    const x = e as { code?: unknown; status?: unknown; context?: { status?: unknown } };
    if (typeof x.code === 'string' && x.code) err.code = x.code;
    const st = typeof x.status === 'number' ? x.status : typeof x.context?.status === 'number' ? x.context.status : undefined;
    if (st !== undefined) err.status = st;
  }
  throw err;
}

/** Tên đăng nhập ngắn của HS (an2a1) → email trong Supabase Auth. GIẢ ĐỊNH: <username>@<VITE_STUDENT_EMAIL_DOMAIN>. */
export function usernameToEmail(username: string): string {
  const u = username.trim().toLowerCase();
  if (u.includes('@')) return u;
  const domain = readEnv('VITE_STUDENT_EMAIL_DOMAIN') ?? 'openlms.edu';
  // Phase 5: phụ huynh đăng nhập bằng số điện thoại → <số>@parent.<miền> (xem school/login.ts).
  const p = normalizeParentLogin(u);
  if (p.ok && p.kind === 'phone') return `${p.username}@parent.${domain}`;
  return `${u}@${domain}`;
}

export class SupabaseDataSource implements DataSource {
  readonly mode = 'supabase' as const;
  private clientP: Promise<V2Client>;
  private recordEventUnavailable = false;

  constructor(client?: V2Client | Promise<V2Client>) {
    this.clientP = client ? Promise.resolve(client) : getSupabaseClient();
  }

  private db(): Promise<V2Client> {
    return this.clientP;
  }

  private async me(): Promise<string | null> {
    const sb = await this.db();
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  }

  /* ================= đăng nhập ================= */
  async getCurrentUser(): Promise<Profile | null> {
    const id = await this.me();
    if (!id) return null;
    const sb = await this.db();
    const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) fail(error, 'Không tải được hồ sơ người dùng');
    if (!data) return null;
    const p = fromProfile(data as Row);
    // Cờ “mật khẩu tạm” nằm trong app_metadata (chỉ máy chủ ghi được) — docs/MAT_KHAU.md.
    const { data: s } = await sb.auth.getSession();
    if (s.session?.user.app_metadata?.must_change_password === true) p.mustChangePassword = true;
    return p;
  }

  async changePassword(current: string, next: string): Promise<void> {
    const bad = newPasswordProblem(next, current);
    if (bad) throw new Error(bad);
    const sb = await this.db();
    const { data: u } = await sb.auth.getUser();
    const email = u.user?.email;
    if (!email) throw new Error('Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi đổi mật khẩu nhé.');
    const check = await sb.auth.signInWithPassword({ email, password: current });
    if (check.error) throw new Error(check.error.status === 429 ? 'Thử sai nhiều lần quá. Đợi vài phút rồi thử lại nhé.' : 'Mật khẩu hiện tại chưa đúng.');
    await this.setNewPassword(sb, next);
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const e = (email ?? '').trim().toLowerCase();
    if (isSystemEmail(e)) throw new Error(NO_REAL_EMAIL_TEXT);
    const sb = await this.db();
    const { error } = await sb.auth.resetPasswordForEmail(e, { redirectTo });
    if (error) throw new Error(error.status === 429 ? 'Đã gửi nhiều thư quá. Đợi khoảng một giờ rồi thử lại nhé.' : 'Chưa gửi được thư. Thử lại sau nhé.');
  }

  async completePasswordReset(next: string): Promise<void> {
    const bad = newPasswordProblem(next);
    if (bad) throw new Error(bad);
    const sb = await this.db();
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error('Link đặt lại mật khẩu đã hết hạn hoặc đã dùng. Gửi lại thư mới nhé.');
    await this.setNewPassword(sb, next);
  }

  private async setNewPassword(sb: V2Client, next: string): Promise<void> {
    const { error } = await sb.auth.updateUser({ password: next });
    if (error) {
      const code = (error as { code?: string }).code ?? '';
      if (code === 'same_password') throw new Error('Mật khẩu mới phải khác mật khẩu cũ.');
      if (code === 'weak_password') throw new Error('Mật khẩu này yếu quá, chọn mật khẩu khác nhé.');
      if (code === 'reauthentication_needed') throw new Error('Cần đăng nhập lại rồi mới đổi được mật khẩu.');
      throw new Error('Chưa đổi được mật khẩu. Thử lại sau nhé.');
    }
    // Bỏ cờ “mật khẩu tạm” (máy chủ) rồi lấy phiên mới để app thấy cờ đã bỏ. Thử 2 lần.
    for (let i = 0; i < 2; i++) {
      const r = await sb.functions.invoke('school-admin', { body: { action: 'password-changed' } });
      if (!r.error) break;
    }
    await sb.auth.refreshSession();
  }

  async signIn(username: string, password: string): Promise<Profile> {
    const sb = await this.db();
    const { data, error } = await sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error || !data.user) throw new Error('Tên đăng nhập hoặc mật khẩu chưa đúng. Em thử lại nhé!');
    const profile = await this.getCurrentUser();
    if (!profile) throw new Error('Tài khoản chưa có hồ sơ trên hệ thống. Nhờ thầy cô kiểm tra giúp nhé.');
    return profile;
  }

  async signOut(): Promise<void> {
    const sb = await this.db();
    await sb.auth.signOut();
  }

  /** Đăng nhập chung: đóng gói phiên rồi bỏ phiên ở app này mà KHÔNG gọi máy chủ (signOut sẽ thu hồi luôn phiên). */
  async exportSession(): Promise<string | null> {
    const sb = await this.db();
    const { data } = await sb.auth.getSession();
    const s = data.session;
    if (!s) return null;
    await sb.auth.stopAutoRefresh();
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.includes('-auth-token')) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* không có localStorage */ }
    return packSession({ a: s.access_token, r: s.refresh_token });
  }

  async importSession(packed: string): Promise<Profile | null> {
    const t = unpackSession(packed);
    if (!t?.a || !t.r) return null;
    const sb = await this.db();
    const { error } = await sb.auth.setSession({ access_token: t.a, refresh_token: t.r });
    if (error) return null;
    return this.getCurrentUser();
  }

  async listDemoUsers(): Promise<Profile[]> {
    return [];
  }

  async updateSettings(userId: string, settings: Partial<StudentSettings>): Promise<Profile> {
    const sb = await this.db();
    const { data: cur, error: e1 } = await sb.from('profiles').select('settings').eq('id', userId).maybeSingle();
    if (e1) fail(e1, 'Không lưu được cài đặt');
    const merged = { ...((cur as Row | null)?.settings as object | undefined), ...settings };
    const { data, error } = await sb.from('profiles').update({ settings: merged }).eq('id', userId).select('*').single();
    if (error) fail(error, 'Không lưu được cài đặt');
    return fromProfile(data as Row);
  }

  /** Ngoài hợp đồng: các con của phụ huynh (guardian_links). */
  async listChildren(parentId: string): Promise<Profile[]> {
    const sb = await this.db();
    const { data: links, error } = await sb.from('guardian_links').select('student_id').eq('parent_id', parentId);
    if (error) fail(error, 'Không tải được danh sách con');
    const ids = ((links ?? []) as Row[]).map((l) => String(l.student_id));
    if (!ids.length) return [];
    const { data, error: e2 } = await sb.from('profiles').select('*').in('id', ids);
    if (e2) fail(e2, 'Không tải được danh sách con');
    return ((data ?? []) as Row[]).map(fromProfile);
  }

  /* ================= lớp ================= */
  async listClasses(teacherId?: string): Promise<ClassInfo[]> {
    const sb = await this.db();
    let q = sb.from('classes').select(CLASS_SELECT).order('name');
    if (teacherId) q = q.eq('teacher_id', teacherId);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được danh sách lớp');
    return ((data ?? []) as Row[]).map(fromClass);
  }

  async getClass(classId: string): Promise<ClassInfo | null> {
    const sb = await this.db();
    const { data, error } = await sb.from('classes').select(CLASS_SELECT).eq('id', classId).maybeSingle();
    if (error) fail(error, 'Không tải được thông tin lớp');
    return data ? fromClass(data as Row) : null;
  }

  async listStudents(classId: string): Promise<Profile[]> {
    const sb = await this.db();
    const { data: members, error } = await sb.from('class_members').select('user_id').eq('class_id', classId).eq('role', 'student');
    if (error) fail(error, 'Không tải được danh sách học sinh');
    const ids = ((members ?? []) as Row[]).map((m) => String(m.user_id));
    if (!ids.length) return [];
    const { data, error: e2 } = await sb.from('profiles').select('*').in('id', ids).order('name');
    if (e2) fail(e2, 'Không tải được danh sách học sinh');
    return ((data ?? []) as Row[]).map(fromProfile);
  }

  /* ================= nội dung ================= */
  async listLessons(filter: LessonFilter = {}): Promise<Lesson[]> {
    const sb = await this.db();
    let q = sb.from('lessons').select(LESSON_SELECT).order('updated_at', { ascending: false });
    if (filter.subject) q = q.eq('subject', filter.subject);
    if (filter.grade) q = q.eq('grade', filter.grade);
    if (filter.ownerId) q = q.eq('owner_id', filter.ownerId);
    if (filter.status) q = q.eq('status', filter.status);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được danh sách bài giảng');
    let list = ((data ?? []) as Row[]).map(fromLesson);
    if (filter.search) {
      const n = foldVietnamese(filter.search);
      list = list.filter((l) => foldVietnamese(`${l.title} ${l.description ?? ''}`).includes(n));
    }
    return list;
  }

  async getLesson(id: string): Promise<Lesson | null> {
    const sb = await this.db();
    const { data, error } = await sb.rpc('get_lesson', { p_id: id });
    if (error) fail(error, 'Không tải được bài giảng');
    return data ? fromLesson(data as Row) : null;
  }

  async saveLesson(lesson: Lesson): Promise<Lesson> {
    const sb = await this.db();
    const { data, error } = await sb.rpc('save_lesson', { p_lesson: toLessonJson(lesson) });
    if (error) fail(error, 'Không lưu được bài giảng');
    return fromLesson(data as Row);
  }

  async deleteLesson(id: string): Promise<void> {
    const sb = await this.db();
    const { error } = await sb.from('lessons').delete().eq('id', id);
    if (error) fail(error, 'Không xóa được bài giảng');
  }

  async listItems(filter: ItemFilter = {}): Promise<Item[]> {
    const sb = await this.db();
    // Bảng items không chứa đáp án; GV cần key thì mở từng item (getItem → get_items).
    let q = sb.from('items').select('*, item_skills(skill_code, position)').order('updated_at', { ascending: false }).limit(500);
    if (filter.subject) q = q.eq('subject', filter.subject);
    if (filter.grade) q = q.eq('grade', filter.grade);
    if (filter.type) q = q.eq('type', filter.type);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được ngân hàng câu hỏi');
    let list = ((data ?? []) as Row[]).map(fromItem);
    if (filter.search) {
      const n = foldVietnamese(filter.search);
      list = list.filter((it) => foldVietnamese(`${it.prompt.text} ${it.skill ?? ''} ${(it.tags ?? []).join(' ')}`).includes(n));
    }
    return list;
  }

  async getItem(id: string): Promise<Item | null> {
    const [it] = await this.getItems([id]);
    return it ?? null;
  }

  async getItems(ids: string[]): Promise<Item[]> {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return [];
    const sb = await this.db();
    const { data, error } = await sb.rpc('get_items', { p_ids: uniq });
    if (error) fail(error, 'Không tải được câu hỏi');
    const list = (Array.isArray(data) ? (data as Row[]) : []).map(fromItem);
    await this.attachSkills(list);
    const byId = new Map(list.map((x) => [x.id, x]));
    return uniq.map((id) => byId.get(id)).filter((x): x is Item => !!x);
  }

  /** get_items không trả skills: đọc item_skills rồi gắn vào (lỗi thì bỏ qua — không làm hỏng việc học). */
  private async attachSkills(list: Item[]): Promise<void> {
    const ids = list.filter((i) => !i.skills?.length).map((i) => i.id);
    if (!ids.length) return;
    const sb = await this.db();
    const { data, error } = await sb.from('item_skills').select('item_id, skill_code, position').in('item_id', ids);
    if (error || !data) return;
    const by: Record<string, { c: string; p: number }[]> = {};
    for (const r of data as Row[]) (by[String(r.item_id)] ??= []).push({ c: String(r.skill_code), p: Number(r.position ?? 0) });
    for (const it of list) if (by[it.id]) it.skills = by[it.id].sort((a, b) => a.p - b.p).map((x) => x.c);
  }

  async saveItem(item: Item): Promise<Item> {
    const sb = await this.db();
    const { data, error } = await sb.rpc('save_item', { p_item: toItemJson(item) });
    if (error) fail(error, 'Không lưu được câu hỏi');
    const saved = fromItem(data as Row);
    if (item.skills) {
      // Gắn mã kĩ năng (RLS: GV/admin). Thay toàn bộ danh sách cũ.
      const del = await sb.from('item_skills').delete().eq('item_id', saved.id);
      if (del.error) fail(del.error, 'Đã lưu câu hỏi nhưng chưa lưu được mã kĩ năng');
      const rows = item.skills.filter((c) => SKILL_BY_CODE[c]).map((c, i) => ({ item_id: saved.id, skill_code: c, position: i }));
      if (rows.length) {
        const ins = await sb.from('item_skills').insert(rows);
        if (ins.error) fail(ins.error, 'Đã lưu câu hỏi nhưng chưa lưu được mã kĩ năng');
      }
      saved.skills = rows.map((r) => r.skill_code);
    }
    return saved;
  }

  async deleteItem(id: string): Promise<void> {
    const sb = await this.db();
    const { error } = await sb.from('items').delete().eq('id', id);
    if (error) fail(error, 'Không xóa được câu hỏi');
  }

  async listCourses(filter: { subject?: SubjectId; grade?: Grade } = {}): Promise<Course[]> {
    const sb = await this.db();
    // GIẢ ĐỊNH: course_nodes(course_id → courses.id, lesson_id, position).
    let q = sb.from('courses').select('*, course_nodes(lesson_id, position)');
    if (filter.subject) q = q.eq('subject', filter.subject);
    if (filter.grade) q = q.eq('grade', filter.grade);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được khóa học');
    return ((data ?? []) as Row[]).map(fromCourse);
  }

  async listPackages(): Promise<ContentPackage[]> {
    const sb = await this.db();
    const { data, error } = await sb.from('packages').select('*').order('created_at', { ascending: false });
    if (error) fail(error, 'Không tải được gói nội dung');
    return ((data ?? []) as Row[]).map(fromPackage);
  }

  async getPackage(id: string): Promise<ContentPackage | null> {
    const sb = await this.db();
    const { data, error } = await sb.from('packages').select('*').eq('id', id).maybeSingle();
    if (error) fail(error, 'Không tải được gói nội dung');
    return data ? fromPackage(data as Row) : null;
  }

  async savePackage(pkg: ContentPackage): Promise<ContentPackage> {
    const sb = await this.db();
    const { data, error } = await sb.from('packages').upsert(toPackageRow(pkg)).select('*').single();
    if (error) fail(error, 'Không lưu được gói nội dung');
    return fromPackage(data as Row);
  }

  /* ================= giao bài & học ================= */
  async listAssignments(filter: { classId?: string; studentId?: string }): Promise<Assignment[]> {
    const sb = await this.db();
    if (filter.studentId) {
      const { data: prof } = await sb.from('profiles').select('class_id').eq('id', filter.studentId).maybeSingle();
      const classId = filter.classId ?? (pick<string>(prof as Row | null, 'classId') || undefined);
      const out = new Map<string, Assignment>();
      if (classId) {
        const { data, error } = await sb.from('assignments').select('*').eq('class_id', classId);
        if (error) fail(error, 'Không tải được bài được giao');
        for (const a of ((data ?? []) as Row[]).map(fromAssignment)) if (!a.studentIds.length || a.studentIds.includes(filter.studentId)) out.set(a.id, a);
      }
      const { data: direct, error: e2 } = await sb.from('assignments').select('*').contains('student_ids', [filter.studentId]);
      if (e2) fail(e2, 'Không tải được bài được giao');
      for (const a of ((direct ?? []) as Row[]).map(fromAssignment)) out.set(a.id, a);
      return [...out.values()].sort((a, b) => b.openAt.localeCompare(a.openAt));
    }
    let q = sb.from('assignments').select('*').order('open_at', { ascending: false });
    if (filter.classId) q = q.eq('class_id', filter.classId);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được bài được giao');
    return ((data ?? []) as Row[]).map(fromAssignment);
  }

  async createAssignment(a: Omit<Assignment, 'id'>): Promise<Assignment> {
    const sb = await this.db();
    const { data, error } = await sb.from('assignments').insert(toAssignmentRow(a)).select('*').single();
    if (error) fail(error, 'Không giao được bài');
    return fromAssignment(data as Row);
  }

  async getTodayTasks(userId: string): Promise<Task[]> {
    const sb = await this.db();
    const { data: prof, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) fail(error, 'Không tải được nhiệm vụ hôm nay');
    if (!prof) return [];
    const user = fromProfile(prof as Row);
    const assignments = await this.listAssignments({ studentId: userId });
    const lessonIds = [...new Set(assignments.filter((a) => a.targetType === 'lesson').map((a) => a.targetId))];
    const pkgIds = [...new Set(assignments.filter((a) => a.targetType === 'package').map((a) => a.targetId))];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [lessonsRes, progressRes, eventsRes, arenaRes, pkgRes] = await Promise.all([
      lessonIds.length ? sb.from('lessons').select('*, lesson_slides(id, position, layout)').in('id', lessonIds) : Promise.resolve({ data: [], error: null }),
      lessonIds.length ? sb.from('lesson_progress').select('*').eq('user_id', userId).in('lesson_id', lessonIds) : Promise.resolve({ data: [], error: null }),
      lessonIds.length || pkgIds.length
        ? sb.from('learning_events').select('object_id, lesson_id, verb').eq('user_id', userId).in('verb', ['started', 'viewed']).limit(500)
        : Promise.resolve({ data: [], error: null }),
      sb.from('reward_ledger').select('id, at').eq('user_id', userId).eq('source_type', 'arena').gte('at', startOfDay.toISOString()),
      pkgIds.length ? sb.from('packages').select('*').in('id', pkgIds) : Promise.resolve({ data: [], error: null }),
    ]);
    const lessons: Record<string, Lesson> = {};
    for (const r of (lessonsRes.data ?? []) as Row[]) {
      const l = fromLesson(r);
      lessons[l.id] = l;
    }
    const progress: Record<string, LessonProgress> = {};
    for (const r of (progressRes.data ?? []) as Row[]) {
      const p = fromProgress(r);
      progress[p.lessonId] = p;
    }
    const opened = new Set<string>();
    for (const r of (eventsRes.data ?? []) as Row[]) opened.add(String(r.lesson_id ?? r.object_id));
    const packages: Record<string, ContentPackage> = {};
    for (const r of (pkgRes.data ?? []) as Row[]) {
      const p = fromPackage(r);
      packages[p.id] = p;
    }
    const today = dayKey(new Date());
    const arenaPlaysToday = ((arenaRes.data ?? []) as Row[]).filter((r) => dayKey(String(r.at)) === today).length;
    const remediation = user.role === 'student' ? await this.getRemediationSets(userId).catch(() => [] as RemediationSet[]) : [];
    return buildTodayTasks({ user, assignments, lessons, packages, progress, openedLessonIds: opened, arenaPlaysToday, remediation });
  }

  async getProgress(userId: string, lessonId: string): Promise<LessonProgress | null> {
    const sb = await this.db();
    const { data, error } = await sb.from('lesson_progress').select('*').eq('user_id', userId).eq('lesson_id', lessonId).maybeSingle();
    if (error) fail(error, 'Không tải được tiến độ');
    return data ? fromProgress(data as Row) : null;
  }

  async saveProgress(p: LessonProgress): Promise<void> {
    // Đọc–ghép–ghi để không mất câu trả lời (complete_lesson tính sao từ answers). Không nguyên tử — chấp nhận ở mức một HS một máy.
    const prev = await this.getProgress(p.userId, p.lessonId);
    const merged = mergeProgress(prev ?? undefined, p, new Date().toISOString());
    const sb = await this.db();
    const { error } = await sb.from('lesson_progress').upsert(toProgressRow(merged), { onConflict: 'user_id,lesson_id' });
    if (error) fail(error, 'Không lưu được tiến độ');
  }

  async recordEvent(e: Omit<LearningEvent, 'id' | 'at'>): Promise<void> {
    // learning_events "chỉ ghi qua RPC/Edge Function" nhưng hợp đồng chưa có RPC ghi sự kiện (started/viewed…).
    // GIẢ ĐỊNH: v2.record_event(p_event jsonb). Nếu chưa có hàm này thì bỏ qua (không làm hỏng việc học).
    if (this.recordEventUnavailable) return;
    const sb = await this.db();
    const { error } = await sb.rpc('record_event', { p_event: toEventRow(e) });
    if (error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message))) this.recordEventUnavailable = true;
  }

  async listEvents(filter: { userId?: string; lessonId?: string; limit?: number }): Promise<LearningEvent[]> {
    const sb = await this.db();
    let q = sb.from('learning_events').select('*').order('at', { ascending: false }).limit(filter.limit ?? 100);
    if (filter.userId) q = q.eq('user_id', filter.userId);
    if (filter.lessonId) q = q.eq('lesson_id', filter.lessonId);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được nhật ký học tập');
    return ((data ?? []) as Row[]).map(fromEvent);
  }

  async submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
    const sb = await this.db();
    const { userId, item, response, context } = input;
    // Hợp đồng grade nhận context { lessonId, assignmentId, liveSessionId, slideIndex }; gửi thêm slideId, source (server bỏ qua nếu không dùng).
    const { data, error } = await sb.functions.invoke('grade', {
      body: {
        itemId: item.id,
        response,
        attempt: input.attempt,
        context: { lessonId: context.lessonId, assignmentId: context.assignmentId, slideId: context.slideId, source: context.source },
        // Hàng đợi offline: khóa chống trùng + thời điểm trả lời thật (server kiểm tra ≤ 14 ngày).
        ...(input.clientEventId ? { clientEventId: input.clientEventId } : {}),
        ...(input.answeredAt ? { answeredAt: input.answeredAt } : {}),
      },
    });
    if (error) fail(error as Error, 'Chưa nộp được câu trả lời, em thử lại nhé');
    const r = (data ?? {}) as Row;
    const graded = r.graded !== false;
    const result: ScoreResult = { graded, correct: !!r.correct, score: Number(r.score ?? 0) || 0 };
    if (r.parts && typeof r.parts === 'object') result.parts = r.parts as Record<string, boolean>;
    const starsAwarded = Number(pick(r, 'starsAwarded') ?? 0) || 0;
    const walletRow = pick<Row>(r, 'wallet');
    const award: AwardResult | undefined = walletRow ? { wallet: fromWallet(walletRow, userId), newlyUnlocked: pick<MascotId[]>(r, 'newlyUnlocked') ?? [] } : undefined;

    if (context.lessonId && context.slideId) {
      // Lưu kết quả vào lesson_progress.answers — complete_lesson tính sao thưởng từ đây.
      const answer = { correct: graded ? result.correct : true, score: graded ? result.score : 1 };
      await this.saveProgress({
        userId,
        lessonId: context.lessonId,
        slideIndex: (await this.getProgress(userId, context.lessonId))?.slideIndex ?? 0,
        completedSlides: [],
        answers: { [context.slideId]: answer },
        starsEarned: 0,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }
    return { result, starsAwarded, ...(award ? { award } : {}) };
  }

  /** Edge Function `ai-gateway` (task 'hint'): server tự đọc đáp án, lọc lộ đáp án. Lỗi bất kì → gợi ý chung tại máy (chỉ từ item.hint). */
  async getHint(input: HintInput): Promise<HintResult> {
    // Tải lười: mã gợi ý không nằm trong gói tải đầu của app HS.
    const local = (await import('../hint')).localHint(input.item, input.response, input.attempt);
    try {
      const sb = await this.db();
      const { data, error } = await sb.functions.invoke('ai-gateway', {
        body: { task: 'hint', input: { itemId: input.item.id, response: input.response, attempt: local.level } },
      });
      const r = (data ?? {}) as Row;
      const text = typeof r.text === 'string' ? r.text.trim() : '';
      if (error || !text) return local;
      return { text, provider: r.provider === 'ai' ? 'ai' : 'fallback', level: local.level };
    } catch {
      return local;
    }
  }

  async completeLesson(userId: string, lessonId: string, opts?: CompleteLessonOptions): Promise<AwardResult & { starsAwarded: number }> {
    const before = await this.getWallet(userId).catch(() => null);
    const sb = await this.db();
    // p_completed_at: thời điểm hoàn thành thật khi đồng bộ từ hàng đợi offline (migration 20261113000010).
    const { data, error } = await sb.rpc('complete_lesson', opts?.completedAt ? { p_lesson_id: lessonId, p_completed_at: opts.completedAt } : { p_lesson_id: lessonId });
    if (error) fail(error, 'Chưa ghi nhận được bài hoàn thành');
    const r = (data ?? {}) as Row;
    const wallet = fromWallet(pick<Row>(r, 'wallet') ?? null, userId);
    const given = pick<number>(r, 'starsAwarded');
    const starsAwarded = typeof given === 'number' ? given : Math.max(0, wallet.stars - (before?.stars ?? wallet.stars));
    return { wallet, newlyUnlocked: pick<MascotId[]>(r, 'newlyUnlocked') ?? [], starsAwarded };
  }

  /* ================= phần thưởng ================= */
  async getWallet(userId: string): Promise<Wallet> {
    const sb = await this.db();
    // GIẢ ĐỊNH: VIEW wallets(user_id, stars, coins, xp, level, streak_days).
    const { data, error } = await sb.from('wallets').select('*').eq('user_id', userId).maybeSingle();
    if (error) fail(error, 'Không tải được ví sao');
    return fromWallet((data as Row | null) ?? null, userId);
  }

  async award(entry: Omit<RewardEntry, 'id' | 'at'>): Promise<AwardResult> {
    // Supabase: chỉ GV thưởng cho HS, tối đa 5 sao/lần (server kiểm tra).
    const sb = await this.db();
    const { data, error } = await sb.rpc('award_bonus', { p_user: entry.userId, p_stars: Math.round(entry.stars), p_reason: entry.reason });
    if (error) fail(error, 'Chưa thưởng được sao');
    const r = (data ?? {}) as Row;
    const walletRow = pick<Row>(r, 'wallet') ?? r;
    return { wallet: fromWallet(walletRow, entry.userId), newlyUnlocked: pick<MascotId[]>(r, 'newlyUnlocked') ?? [] };
  }

  async listRewards(userId: string, limit = 50): Promise<RewardEntry[]> {
    const sb = await this.db();
    const { data, error } = await sb.from('reward_ledger').select('*').eq('user_id', userId).order('at', { ascending: false }).limit(limit);
    if (error) fail(error, 'Không tải được lịch sử sao');
    return ((data ?? []) as Row[]).map(fromReward);
  }

  async getPassport(userId: string): Promise<Passport> {
    const sb = await this.db();
    const { data, error } = await sb.from('passports').select('*').eq('user_id', userId).maybeSingle();
    if (error) fail(error, 'Không tải được hộ chiếu khám phá');
    return fromPassport((data as Row | null) ?? null, userId);
  }

  async setCompanion(userId: string, mascot: MascotId): Promise<Passport> {
    const sb = await this.db();
    const { data, error } = await sb.rpc('set_companion', { p_mascot: mascot });
    if (error) fail(error, 'Em cần mở khóa bạn này trước nhé');
    return fromPassport(data as Row, userId);
  }

  /* ================= thành thạo, lỗ hổng, hồ sơ (migration 20261111000001_v2_skills) ================= */
  async getSkillMastery(userId: string): Promise<SkillMastery[]> {
    const sb = await this.db();
    const { data, error } = await sb.from('skill_mastery').select('*').eq('user_id', userId).order('skill_code');
    if (error) fail(error, 'Không tải được mức thành thạo kĩ năng');
    return ((data ?? []) as Row[]).map(masteryFromRow);
  }

  /**
   * Câu hỏi gắn với các kĩ năng (để lập bộ ôn tập). RLS của items quyết định HS thấy câu nào.
   * GIẢ ĐỊNH: PostgREST nhúng được items qua khóa ngoại item_skills.item_id.
   */
  private async itemsForSkills(codes: string[]): Promise<ItemLike[]> {
    const uniq = [...new Set(codes)].filter(Boolean);
    if (!uniq.length) return [];
    const sb = await this.db();
    const { data, error } = await sb.from('item_skills').select('skill_code, position, items(id, type, difficulty, grade, subject)').in('skill_code', uniq).limit(2000);
    if (error) fail(error, 'Không tải được câu hỏi ôn tập');
    const by = new Map<string, ItemLike & { _s: { c: string; p: number }[] }>();
    for (const r of (data ?? []) as Row[]) {
      const it = (Array.isArray(r.items) ? r.items[0] : r.items) as Row | undefined;
      if (!it) continue;
      const id = String(it.id);
      const cur = by.get(id) ?? { id, type: String(it.type) as Item['type'], difficulty: (it.difficulty ?? undefined) as Item['difficulty'], _s: [] };
      cur._s.push({ c: String(r.skill_code), p: Number(r.position ?? 0) });
      by.set(id, cur);
    }
    return [...by.values()].map(({ _s, ...it }) => ({ ...it, skills: _s.sort((a, b) => a.p - b.p).map((x) => x.c) }));
  }

  private skillsOfInterest(masteries: SkillMastery[]): string[] {
    const out: string[] = [];
    for (const m of masteries) {
      if (m.level !== 'can-on' && m.reviewStage === 0 && !(m.level === 'dang-hoc' && m.p < 0.7)) continue;
      out.push(m.skillCode, ...(SKILL_BY_CODE[m.skillCode]?.prereqs ?? []));
    }
    return out;
  }

  private async classRaw(classId: string): Promise<{ grade: Grade; students: StudentLite[]; masteriesByUser: Record<string, SkillMastery[]> }> {
    const sb = await this.db();
    const { data, error } = await sb.rpc('get_class_heatmap', { p_class: classId });
    if (error) fail(error, 'Không tải được bản đồ kĩ năng của lớp');
    const r = (data ?? {}) as Row;
    const cls = (pick<Row>(r, 'class') ?? {}) as Row;
    const students = ((pick<Row[]>(r, 'students') ?? []) as Row[]).map(fromProfile);
    const masteriesByUser: Record<string, SkillMastery[]> = {};
    for (const s of students) masteriesByUser[s.id] = [];
    for (const m of ((pick<Row[]>(r, 'masteries') ?? []) as Row[]).map(masteryFromRow)) (masteriesByUser[m.userId] ??= []).push(m);
    return {
      grade: (Number(cls.grade) || 1) as Grade,
      students: students.map((s) => ({ id: s.id, name: s.name, avatarMascot: s.avatarMascot, avatarColor: s.avatarColor })),
      masteriesByUser,
    };
  }

  private static bySubject(map: Record<string, SkillMastery[]>, subject: SubjectId): Record<string, SkillMastery[]> {
    return Object.fromEntries(Object.entries(map).map(([k, list]) => [k, list.filter((m) => SKILL_BY_CODE[m.skillCode]?.subject === subject)]));
  }

  async getClassHeatmap(classId: string, subject: SubjectId = 'toan'): Promise<ClassHeatmap> {
    const raw = await this.classRaw(classId);
    return classHeatmap({ classId, grade: raw.grade, subject, students: raw.students, masteriesByUser: SupabaseDataSource.bySubject(raw.masteriesByUser, subject), now: new Date() });
  }

  async getGapGroups(classId: string, subject: SubjectId = 'toan'): Promise<GapGroup[]> {
    const raw = await this.classRaw(classId);
    const masteriesByUser = SupabaseDataSource.bySubject(raw.masteriesByUser, subject);
    const items = await this.itemsForSkills(Object.values(masteriesByUser).flatMap((l) => this.skillsOfInterest(l)));
    return studentGroupsByGap({ students: raw.students, masteriesByUser, items });
  }

  async getRemediationSets(userId: string): Promise<RemediationSet[]> {
    const masteries = await this.getSkillMastery(userId);
    const items = await this.itemsForSkills(this.skillsOfInterest(masteries));
    return planRemediation({ userId, masteries, items, now: new Date() });
  }

  async submitRemediationResult(userId: string, setId: string, results: RemediationAnswer[]): Promise<RemediationOutcome> {
    // Server tự đếm đúng/sai từ learning_events của các câu (không tin kết quả từ máy HS).
    const set = (await this.getRemediationSets(userId).catch(() => [] as RemediationSet[])).find((s) => s.id === setId);
    const sb = await this.db();
    const { data, error } = await sb.functions.invoke('grade', {
      body: { action: 'remediation', setId, itemIds: results.map((r) => r.itemId), rootSkill: set?.rootSkill },
    });
    if (error) fail(error as Error, 'Chưa ghi nhận được bài ôn tập, em thử lại nhé');
    const r = (data ?? {}) as Row;
    const mastery = masteryFromRow((pick<Row>(r, 'mastery') ?? {}) as Row);
    return {
      setId,
      skillCode: String(pick(r, 'skillCode') ?? mastery.skillCode),
      passed: !!pick(r, 'passed'),
      correct: Number(pick(r, 'correct') ?? 0),
      total: Number(pick(r, 'total') ?? results.length),
      mastery,
      message: String(pick(r, 'message') ?? ''),
    };
  }

  private static lessonsFromRaw(rows: Row[]): Record<string, LessonLite> {
    const out: Record<string, LessonLite> = {};
    for (const l of rows) {
      const id = String(l.id);
      out[id] = { id, title: String(l.title ?? ''), subject: String(l.subject ?? 'khac') as SubjectId, slides: arr(l.slide_ids).map((x) => ({ id: String(x) })) };
    }
    return out;
  }

  async getStudentProfile(userId: string): Promise<StudentProfile> {
    const sb = await this.db();
    const [{ data, error }, extras] = await Promise.all([sb.rpc('get_student_profile', { p_user: userId }), this.extras(userId)]);
    if (error) fail(error, 'Không tải được hồ sơ học sinh');
    const r = (data ?? {}) as Row;
    const profileRow = pick<Row>(r, 'profile');
    if (!profileRow) throw new Error('Không tìm thấy học sinh này.');
    const student = fromProfile(profileRow);
    const clsRow = pick<Row>(r, 'class');
    const masteries = arr(r.masteries).map((x) => masteryFromRow(x as Row));
    const items = await this.itemsForSkills(this.skillsOfInterest(masteries)).catch(() => [] as ItemLike[]);
    return buildStudentProfile({
      now: new Date(),
      student,
      cls: clsRow ? fromClass(clsRow) : null,
      teacherName: clsRow ? (pick<string>(clsRow, 'teacherName') ?? undefined) : undefined,
      wallet: fromWallet(pick<Row>(r, 'wallet') ?? null, userId),
      passport: fromPassport(pick<Row>(r, 'passport') ?? null, userId),
      masteries,
      items,
      assignments: arr(r.assignments).map((x) => fromAssignment(x as Row)),
      lessons: SupabaseDataSource.lessonsFromRaw(arr(r.lessons) as Row[]),
      progress: arr(r.progress).map((x) => fromProgress(x as Row)),
      events: arr(r.events).map((x) => fromEvent(x as Row)),
      rewards: arr(r.rewards).map((x) => fromReward(x as Row)),
      works: extras.works,
      workPending: extras.workPending,
      behaviorLogs: extras.behaviorLogs,
      behaviors: extras.behaviors,
      attendance: extras.attendance,
      tt27: extras.tt27,
    });
  }

  async getParentSummary(childId: string): Promise<ParentSummary> {
    const sb = await this.db();
    const [{ data, error }, extras] = await Promise.all([sb.rpc('get_parent_summary', { p_child: childId }), this.extras(childId)]);
    if (error) fail(error, 'Không tải được tóm tắt cho phụ huynh');
    const r = (data ?? {}) as Row;
    const profileRow = pick<Row>(r, 'profile');
    if (!profileRow) throw new Error('Không tìm thấy học sinh này.');
    const masteries = arr(r.masteries).map((x) => masteryFromRow(x as Row));
    const items = await this.itemsForSkills(this.skillsOfInterest(masteries)).catch(() => [] as ItemLike[]);
    return buildParentSummary({
      now: new Date(),
      child: fromProfile(profileRow),
      masteries,
      events: arr(r.events).map((x) => fromEvent(x as Row)),
      rewards: arr(r.rewards).map((x) => fromReward(x as Row)),
      items,
      works: extras.works,
      behaviorLogs: extras.behaviorLogs,
      behaviors: extras.behaviors,
      attendance: extras.attendance,
    });
  }

  /* ================= Phase 4: bài làm & AI chấm ================= */
  /** Phần thêm của hồ sơ; lỗi (vd chưa chạy migration Phase 4) → rỗng, không làm hỏng hồ sơ. */
  private async extras(userId: string): Promise<Extras> {
    const empty: Extras = { works: [], workPending: 0, behaviors: [], behaviorLogs: [], attendance: [], tt27: null };
    const sb = await this.db();
    const { data, error } = await sb.rpc('get_student_extras', { p_user: userId });
    if (error || !data) return empty;
    const r = data as Row;
    const works: StudentWorkEntry[] = [];
    const rows = arr(r.works) as Row[];
    const urls = await this.signUrls(rows.flatMap((w) => imagePaths(one(w.submission) ?? {})));
    for (const w of rows) {
      const subRow = one(w.submission);
      const taskRow = one(w.task);
      if (!subRow || !taskRow) continue;
      const sub = fromSubmission(subRow, urls);
      const task = fromWorkTask(taskRow);
      const grade = w.grade && typeof w.grade === 'object' ? (w.grade as unknown as SubmissionDetail['grade']) : undefined;
      const review = fromReview(one(w.review), sub.id);
      const entry = grade ? workEntryOf({ ...sub, task, taskTitle: task.title, grade, review, final: mergeFinal(grade, review) }) : null;
      if (entry) works.push(entry);
    }
    const behaviors = (arr(r.behaviors) as Row[]).map(fromBehavior);
    const classId = behaviors[0]?.classId ?? '';
    return {
      works,
      workPending: Number(r.workPending) || 0,
      behaviors: behaviors.length ? behaviors : defaultBehaviors(classId),
      behaviorLogs: (arr(r.behaviorLogs) as Row[]).map(fromBehaviorLog),
      attendance: groupAttendance(arr(r.attendance) as Row[]),
      tt27: r.tt27 ? fromTt27(r.tt27 as Row) : null,
    };
  }

  private async signUrls(paths: string[]): Promise<Record<string, string>> {
    const uniq = [...new Set(paths.filter(Boolean))];
    if (!uniq.length) return {};
    const sb = await this.db();
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(uniq, 3600);
    const out: Record<string, string> = {};
    for (const x of data ?? []) if (x.path && x.signedUrl) out[x.path] = x.signedUrl;
    return out;
  }

  private async detailsFromRows(rows: Row[]): Promise<SubmissionDetail[]> {
    const urls = await this.signUrls(rows.flatMap(imagePaths));
    return rows.map((r) => {
      const sub = fromSubmission(r, urls);
      const t = one(r.work_tasks);
      const grade = fromAiGradeRow(one(r.ai_grades));
      const review = fromReview(one(r.grade_reviews), sub.id);
      const st = one(r.student);
      return {
        ...sub,
        ...(st?.name ? { studentName: String(st.name) } : {}),
        ...(t?.title ? { taskTitle: String(t.title) } : {}),
        ...(grade ? { grade } : {}),
        ...(review ? { review } : {}),
        ...(grade && sub.status === 'approved' ? { final: mergeFinal(grade, review) } : {}),
      };
    });
  }

  async listRubrics(filter: RubricFilter = {}): Promise<Rubric[]> {
    const sb = await this.db();
    let q = sb.from('rubrics').select('*').order('updated_at', { ascending: false });
    if (filter.subject) q = q.eq('subject', filter.subject);
    if (filter.grade) q = q.eq('grade', filter.grade);
    if (filter.ownerId) q = q.eq('owner_id', filter.ownerId);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được tiêu chí chấm');
    return ((data ?? []) as Row[]).map(fromRubric);
  }

  async getRubric(id: string): Promise<Rubric | null> {
    const sb = await this.db();
    const { data, error } = await sb.from('rubrics').select('*').eq('id', id).maybeSingle();
    if (error) fail(error, 'Không tải được tiêu chí chấm');
    return data ? fromRubric(data as Row) : null;
  }

  async saveRubric(r: Rubric): Promise<Rubric> {
    const sb = await this.db();
    const { data, error } = await sb.from('rubrics').upsert(toRubricRow(r)).select('*').single();
    if (error) fail(error, 'Chưa lưu được tiêu chí chấm');
    return fromRubric(data as Row);
  }

  async deleteRubric(id: string): Promise<void> {
    const sb = await this.db();
    const { error } = await sb.from('rubrics').delete().eq('id', id);
    if (error) fail(error, 'Chưa xoá được tiêu chí chấm (có thể đang dùng cho một bài làm)');
  }

  async listWorkTasks(filter: WorkTaskFilter = {}): Promise<WorkTask[]> {
    const sb = await this.db();
    let q = sb.from('work_tasks').select('*').order('created_at', { ascending: false });
    if (filter.classId) q = q.eq('class_id', filter.classId);
    if (filter.createdBy) q = q.eq('created_by', filter.createdBy);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được danh sách bài làm');
    let list = ((data ?? []) as Row[]).map(fromWorkTask);
    if (filter.studentId) {
      const sid = filter.studentId;
      const { data: m } = await sb.from('class_members').select('class_id').eq('user_id', sid);
      const { data: p } = await sb.from('profiles').select('class_id').eq('id', sid).maybeSingle();
      const classes = new Set([...((m ?? []) as Row[]).map((x) => String(x.class_id)), ...(p && (p as Row).class_id ? [String((p as Row).class_id)] : [])]);
      list = list.filter((t) => classes.has(t.classId) && (!t.studentIds.length || t.studentIds.includes(sid)));
    }
    return list;
  }

  async getWorkTask(id: string): Promise<WorkTask | null> {
    const sb = await this.db();
    const { data, error } = await sb.from('work_tasks').select('*').eq('id', id).maybeSingle();
    if (error) fail(error, 'Không tải được bài làm');
    return data ? fromWorkTask(data as Row) : null;
  }

  async saveWorkTask(t: WorkTask): Promise<WorkTask> {
    const sb = await this.db();
    const { data, error } = await sb.from('work_tasks').upsert(toWorkTaskRow(t)).select('*').single();
    if (error) fail(error, 'Chưa lưu được bài làm');
    return fromWorkTask(data as Row);
  }

  async deleteWorkTask(id: string): Promise<void> {
    const sb = await this.db();
    const { error } = await sb.from('work_tasks').delete().eq('id', id);
    if (error) fail(error, 'Chưa xoá được bài làm');
  }

  async submitWork(input: SubmitWorkInput): Promise<SubmissionDetail> {
    const sb = await this.db();
    const task = await this.getWorkTask(input.taskId);
    if (!task) throw new Error('Không tìm thấy bài làm này.');
    const text = input.text?.trim() ?? '';
    const raw = input.images ?? [];
    if (!text && !raw.length) throw new Error('Em viết bài hoặc chụp ảnh bài làm rồi bấm nộp nhé.');
    if (raw.length > 6) throw new Error('Mỗi bài nộp tối đa 6 ảnh.');
    if (input.clientEventId) {
      // Gửi lại từ hàng đợi offline: đã nộp rồi thì trả bài cũ (không tải ảnh lần hai).
      const dup = await sb.from('submissions').select(SUBMISSION_SELECT).eq('student_id', input.studentId).eq('client_event_id', input.clientEventId).maybeSingle();
      if (!dup.error && dup.data) return { ...(await this.detailsFromRows([dup.data as Row]))[0], task };
    }
    const images: { path: string; width: number; height: number }[] = [];
    for (const r of raw) {
      const im = await compressWorkImage(r);
      const blob = im.blob ?? (await (await fetch(im.url)).blob());
      const path = `${task.id}/${input.studentId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) fail(up.error, 'Chưa tải được ảnh lên, em thử lại nhé');
      images.push({ path, width: im.width, height: im.height });
    }
    const { data, error } = await sb
      .from('submissions')
      .insert({
        task_id: task.id,
        student_id: input.studentId,
        class_id: task.classId,
        kind: images.length && text ? 'mixed' : images.length ? 'photo' : 'text',
        text: text || null,
        images,
        submitted_by: input.submittedBy ?? 'student',
        ...(input.clientEventId ? { client_event_id: input.clientEventId } : {}),
        status: 'submitted',
      })
      .select(SUBMISSION_SELECT)
      .single();
    if (error) fail(error, 'Chưa nộp được bài');
    const sub = (await this.detailsFromRows([data as Row]))[0];
    if (input.autoGrade) return this.requestAiGrade(sub.id);
    return { ...sub, task };
  }

  async requestAiGrade(submissionId: string): Promise<SubmissionDetail> {
    const sb = await this.db();
    const { data, error } = await sb.functions.invoke('ai-grade', { body: { submissionId } });
    if (error) fail(error, 'Chưa chấm được bài');
    return data as SubmissionDetail;
  }

  async listSubmissions(filter: SubmissionFilter = {}): Promise<SubmissionDetail[]> {
    const sb = await this.db();
    let q = sb.from('submissions').select(SUBMISSION_SELECT).order('created_at', { ascending: false }).limit(500);
    if (filter.taskId) q = q.eq('task_id', filter.taskId);
    if (filter.studentId) q = q.eq('student_id', filter.studentId);
    if (filter.classId) q = q.eq('class_id', filter.classId);
    if (filter.status) q = Array.isArray(filter.status) ? q.in('status', filter.status) : q.eq('status', filter.status);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được danh sách bài nộp');
    return this.detailsFromRows((data ?? []) as Row[]);
  }

  async getSubmission(id: string): Promise<SubmissionDetail | null> {
    const sb = await this.db();
    const { data, error } = await sb.from('submissions').select(SUBMISSION_SELECT).eq('id', id).maybeSingle();
    if (error) fail(error, 'Không tải được bài nộp');
    if (!data) return null;
    const d = (await this.detailsFromRows([data as Row]))[0];
    const task = await this.getWorkTask(d.taskId);
    // HS/phụ huynh không đọc được rubrics (RLS) → null.
    const rubric = task ? await this.getRubric(task.rubricId).catch(() => null) : null;
    return { ...d, ...(task ? { task } : {}), ...(rubric ? { rubric } : {}), ...(d.grade && d.status === 'approved' ? { final: mergeFinal(d.grade, d.review, rubric ?? undefined) } : {}) };
  }

  async reviewGrade(review: Omit<GradeReview, 'at'> & { at?: string }): Promise<SubmissionDetail> {
    const sb = await this.db();
    const { data, error } = await sb.functions.invoke('ai-grade', { body: { action: 'review', review } });
    if (error) fail(error, 'Chưa duyệt được bài');
    return data as SubmissionDetail;
  }

  async getStudentWork(studentId: string): Promise<StudentWorkEntry[]> {
    return (await this.extras(studentId)).works;
  }

  /* ================= Phase 4: TT27, thi đua, điểm danh ================= */
  async listTt27(filter: { classId?: string; studentId?: string; termId?: Tt27TermId; schoolYear?: string }): Promise<Tt27Evaluation[]> {
    const sb = await this.db();
    let q = sb.from('tt27_evaluations').select('*');
    if (filter.classId) q = q.eq('class_id', filter.classId);
    if (filter.studentId) q = q.eq('student_id', filter.studentId);
    if (filter.termId) q = q.eq('term_id', filter.termId);
    if (filter.schoolYear) q = q.eq('school_year', filter.schoolYear);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được đánh giá định kì');
    return ((data ?? []) as Row[]).map(fromTt27);
  }

  async saveTt27(e: Tt27Evaluation): Promise<Tt27Evaluation> {
    const sb = await this.db();
    const row = toTt27Row({ ...e, schoolYear: e.schoolYear || schoolYearOf() });
    const { data, error } = await sb.from('tt27_evaluations').upsert(row, { onConflict: 'student_id,term_id,school_year' }).select('*').single();
    if (error) fail(error, 'Chưa lưu được đánh giá');
    return fromTt27(data as Row);
  }

  async suggestTt27(studentId: string, termId: Tt27TermId): Promise<Tt27Suggestion> {
    const sb = await this.db();
    const [{ data: p }, masteries, extras] = await Promise.all([sb.from('profiles').select('*').eq('id', studentId).maybeSingle(), this.getSkillMastery(studentId), this.extras(studentId)]);
    if (!p) throw new Error('Không tìm thấy học sinh này.');
    const student = fromProfile(p as Row);
    const now = new Date();
    return suggestTt27({
      student,
      classId: student.classId ?? '',
      termId,
      now,
      masteries,
      works: extras.works,
      behaviorLogs: extras.behaviorLogs,
      attendance: attendanceSummary(extras.attendance, studentId, now),
      examScores: await getExamService(this).examScores(studentId).catch(() => []), // Phase 6: điểm KTĐK
    });
  }

  async listBehaviors(classId: string): Promise<Behavior[]> {
    const sb = await this.db();
    const { data, error } = await sb.from('behaviors').select('*').eq('class_id', classId).order('position');
    if (error) fail(error, 'Không tải được danh sách thi đua');
    const list = ((data ?? []) as Row[]).map(fromBehavior);
    return list.length ? list : defaultBehaviors(classId);
  }

  async saveBehavior(b: Behavior): Promise<Behavior> {
    const sb = await this.db();
    const { count } = await sb.from('behaviors').select('id', { count: 'exact', head: true }).eq('class_id', b.classId);
    if (!count) {
      // Lớp chưa có danh sách riêng: lưu danh sách mặc định trước để giữ các hành vi cũ.
      await sb.from('behaviors').upsert(defaultBehaviors(b.classId).map((x, i) => ({ class_id: x.classId, id: x.id, label: x.label, points: x.points, icon: x.icon, kind: x.kind, position: i })));
    }
    const id = b.id || `bh-${Date.now().toString(36)}`;
    const points = Math.max(-5, Math.min(5, Math.round(b.points) || 0));
    const { data, error } = await sb
      .from('behaviors')
      .upsert({ class_id: b.classId, id, label: b.label, points, icon: b.icon, kind: points >= 0 ? 'positive' : 'needs-work' })
      .select('*')
      .single();
    if (error) fail(error, 'Chưa lưu được hành vi');
    return fromBehavior(data as Row);
  }

  async listBehaviorLogs(filter: { classId?: string; studentId?: string; from?: string; to?: string; limit?: number }): Promise<BehaviorLog[]> {
    const sb = await this.db();
    let q = sb.from('behavior_logs').select('*').order('at', { ascending: false }).limit(filter.limit ?? 500);
    if (filter.classId) q = q.eq('class_id', filter.classId);
    if (filter.studentId) q = q.eq('student_id', filter.studentId);
    if (filter.from) q = q.gte('at', filter.from);
    if (filter.to) q = q.lte('at', filter.to);
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được nhật kí thi đua');
    return ((data ?? []) as Row[]).map(fromBehaviorLog);
  }

  async recordBehavior(input: RecordBehaviorInput): Promise<BehaviorLog[]> {
    const sb = await this.db();
    const { data, error } = await sb.rpc('record_behavior', { p_class: input.classId, p_behavior: input.behaviorId, p_students: input.studentIds, p_note: input.note ?? null });
    if (error) fail(error, 'Chưa ghi được thi đua');
    return (arr(data) as Row[]).map(fromBehaviorLog);
  }

  async undoBehavior(logId: string): Promise<void> {
    const sb = await this.db();
    const { error } = await sb.rpc('undo_behavior', { p_log: logId });
    if (error) fail(error, 'Chưa hoàn tác được');
  }

  async getClassLeaderboard(classId: string, range: { from?: string; to?: string } = {}): Promise<ClassLeaderboard> {
    const now = new Date();
    const from = range.from ?? vnWeekStart(now);
    const to = range.to ?? now.toISOString();
    const [cls, students, logs] = await Promise.all([this.getClass(classId), this.listStudents(classId), this.listBehaviorLogs({ classId, from, to, limit: 5000 })]);
    if (!cls) throw new Error('Không tìm thấy lớp này.');
    return classLeaderboard({ cls, students, logs, from, to });
  }

  async listAttendance(classId: string, range: { from?: string; to?: string } = {}): Promise<AttendanceRecord[]> {
    const sb = await this.db();
    let q = sb.from('attendance').select('class_id, date, student_id, status').eq('class_id', classId).order('date', { ascending: false }).limit(5000);
    if (range.from) q = q.gte('date', range.from.slice(0, 10));
    if (range.to) q = q.lte('date', range.to.slice(0, 10));
    const { data, error } = await q;
    if (error) fail(error, 'Không tải được điểm danh');
    return groupAttendance((data ?? []) as Row[]);
  }

  async saveAttendance(r: AttendanceRecord): Promise<AttendanceRecord> {
    const sb = await this.db();
    const rows = Object.entries(r.entries).map(([student_id, status]) => ({ class_id: r.classId, date: r.date, student_id, status, updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error } = await sb.from('attendance').upsert(rows, { onConflict: 'class_id,date,student_id' });
      if (error) fail(error, 'Chưa lưu được điểm danh');
    }
    return (await this.listAttendance(r.classId, { from: r.date, to: r.date }))[0] ?? { classId: r.classId, date: r.date, entries: {} };
  }

  /* ================= trực tiếp ================= */
  async createLiveSession(lessonId: string, classId?: string): Promise<LiveSessionInfo> {
    const sb = await this.db();
    const { data, error } = await sb.rpc('start_live', { p_lesson_id: lessonId, p_class_id: classId ?? null });
    if (error) fail(error, 'Chưa mở được lớp học trực tiếp');
    const info = fromLiveInfo(data as Row);
    if (!info) throw new Error('Máy chủ không trả về mã lớp học trực tiếp.');
    return info;
  }

  async findLiveSession(pin: string): Promise<LiveSessionInfo | null> {
    const clean = (pin ?? '').replace(/\D/g, '');
    if (clean.length !== 6) return null;
    const sb = await this.db();
    const { data, error } = await sb.rpc('find_live', { p_pin: clean });
    if (error) fail(error, 'Chưa tìm được lớp học');
    return fromLiveInfo((data as Row | null) ?? null);
  }

  async openLiveChannel(sessionId: string, role: LiveRole): Promise<LiveChannel> {
    const sb = await this.db();
    const me = await this.getCurrentUser();
    const ch = new SupabaseLiveChannel(sb, sessionId, role, me);
    await ch.whenReady(4000);
    return ch;
  }
}
