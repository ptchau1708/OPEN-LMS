/**
 * Phase 5 — SchoolSource trên Supabase (migration 20261113000001_v2_school.sql + Edge Function `school-admin`).
 * ⚠ CHƯA KIỂM THỬ với project thật (môi trường dựng mã không có mạng tới Supabase).
 */
import {
  SKILL_BY_CODE,
  type AccountSlip,
  type ClassReportRow,
  type CreateTeacherInput,
  type DataSource,
  type Grade,
  type GradeHeatmap,
  type GradeHeatmapCell,
  type GuardianCode,
  type GuardianLinkInfo,
  type MasteryLevel,
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
  type SubjectId,
} from '@openedu/contracts';
import { vnWeekStart } from '../engagement';
import { readEnv } from '../env';
import { getSupabaseClient, type V2Client } from '../supabase/client';
import { fromProfile, type Row } from '../supabase/mapping';
import { normalizeCode } from './codes';
import { digestFromDataSource } from './generic';
import { normalizeParentLogin, parentLoginEmail } from './login';
import { buildSchoolOverview } from './reports';

interface PgError { message: string; code?: string }
function fail(e: PgError | Error | null | undefined, vi: string): never {
  const detail = e && 'message' in e ? e.message : '';
  // Lỗi do RPC raise (tiếng Việt) giữ nguyên.
  if (detail && /[À-ỹ]/.test(detail)) throw new Error(detail);
  throw new Error(detail ? `${vi} (${detail})` : vi);
}
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

function fromCode(r: Row): GuardianCode {
  return {
    code: String(r.code),
    studentId: String(r.student_id),
    ...(r.student_name ? { studentName: String(r.student_name) } : {}),
    classId: String(r.class_id),
    createdBy: String(r.created_by ?? ''),
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
    ...(r.used_at ? { usedAt: String(r.used_at) } : {}),
    ...(r.used_by ? { usedBy: String(r.used_by) } : {}),
    ...(r.revoked_at ? { revokedAt: String(r.revoked_at) } : {}),
  };
}

export class SupabaseSchoolSource implements SchoolSource {
  private clientP: Promise<V2Client>;
  constructor(private ds: DataSource, client?: V2Client | Promise<V2Client>) {
    this.clientP = client ? Promise.resolve(client) : getSupabaseClient();
  }
  private db(): Promise<V2Client> {
    return this.clientP;
  }
  private async rpc<T>(fn: string, args: Record<string, unknown>, vi: string): Promise<T> {
    const sb = await this.db();
    const { data, error } = await sb.rpc(fn, args);
    if (error) fail(error, vi);
    return data as T;
  }
  private async admin<T>(body: Record<string, unknown>, vi: string): Promise<T> {
    const sb = await this.db();
    const { data, error } = await sb.functions.invoke('school-admin', { body });
    if (error) {
      // FunctionsHttpError: thông báo tiếng Việt nằm trong body { error }.
      const ctx = (error as { context?: Response }).context;
      let msg = '';
      try { msg = ctx ? String(((await ctx.json()) as { error?: string }).error ?? '') : ''; } catch { /* bỏ qua */ }
      throw new Error(msg || vi);
    }
    return data as T;
  }

  /* ---------- mã liên kết ---------- */
  async createGuardianCodes(classId: string, studentIds?: string[]): Promise<GuardianCode[]> {
    const rows = await this.rpc<Row[]>('create_guardian_codes', { p_class: classId, p_students: studentIds?.length ? studentIds : null }, 'Chưa tạo được mã liên kết');
    return (rows ?? []).map(fromCode);
  }
  async listGuardianCodes(classId: string): Promise<GuardianCode[]> {
    const rows = await this.rpc<Row[]>('list_guardian_codes', { p_class: classId }, 'Chưa tải được mã liên kết');
    return (rows ?? []).map(fromCode);
  }
  async revokeGuardianCode(code: string): Promise<void> {
    await this.rpc('revoke_guardian_code', { p_code: normalizeCode(code) }, 'Chưa thu hồi được mã');
  }
  async listGuardianLinks(classId: string): Promise<GuardianLinkInfo[]> {
    const rows = await this.rpc<Row[]>('list_guardian_links', { p_class: classId }, 'Chưa tải được danh sách phụ huynh');
    return (rows ?? []).map((r) => ({
      parentId: String(r.parent_id),
      parentName: String(r.parent_name ?? 'Phụ huynh'),
      ...(r.parent_login ? { parentLogin: String(r.parent_login) } : {}),
      studentId: String(r.student_id),
      studentName: String(r.student_name ?? ''),
      ...(r.relation ? { relation: String(r.relation) } : {}),
      createdAt: String(r.created_at),
    }));
  }
  async revokeGuardianLink(parentId: string, studentId: string): Promise<void> {
    await this.rpc('revoke_guardian_link', { p_parent: parentId, p_student: studentId }, 'Chưa gỡ được liên kết');
  }
  async registerParent(input: ParentRegisterInput): Promise<Profile> {
    const login = normalizeParentLogin(input.login);
    if (!login.ok) throw new Error(login.reason);
    await this.admin({ action: 'register-parent', login: login.username, password: input.password, name: input.name, code: normalizeCode(input.code), relation: input.relation }, 'Chưa tạo được tài khoản');
    const domain = readEnv('VITE_STUDENT_EMAIL_DOMAIN') ?? 'openlms.edu';
    return this.ds.signIn(parentLoginEmail(login.username, domain), input.password);
  }
  async redeemGuardianCode(code: string): Promise<RedeemResult> {
    const r = await this.rpc<Row>('redeem_guardian_code', { p_code: normalizeCode(code), p_relation: null }, 'Chưa liên kết được');
    return { child: fromProfile((r.child ?? {}) as Row), alreadyLinked: !!r.already_linked };
  }
  async getParentDigest(childId: string, weekStart?: string): Promise<ParentDigest> {
    return digestFromDataSource(this.ds, childId, weekStart, new Date());
  }

  /* ---------- báo cáo ---------- */
  async getSchoolOverview(range: ReportRange = {}): Promise<SchoolOverview> {
    const now = new Date();
    const from = range.from ?? vnWeekStart(now);
    const to = range.to ?? now.toISOString();
    const r = await this.rpc<Row>('school_report', { p_from: from, p_to: to }, 'Chưa tải được báo cáo');
    const settings = this.settingsOf(r.settings as Row | undefined);
    const rows: ClassReportRow[] = ((r.classes ?? []) as Row[]).map((c) => {
      const answered = num(c.answered);
      return {
        classId: String(c.id),
        name: String(c.name),
        grade: num(c.grade) as Grade,
        ...(c.teacher_id ? { teacherId: String(c.teacher_id) } : {}),
        ...(c.teacher_name ? { teacherName: String(c.teacher_name) } : {}),
        students: num(c.students),
        activeStudents: num(c.active),
        lessonsCompleted: num(c.lessons_completed),
        answered,
        correctRate: answered ? num(c.correct) / answered : null,
        avgMastery: numOrNull(c.avg_p),
        studentsWithGaps: num(c.gap_students),
        attendanceRate: num(c.att_total) ? num(c.att_present) / num(c.att_total) : null,
        tt27Final: num(c.tt27_final),
        worksApproved: num(c.works_approved),
      };
    });
    const overview = buildSchoolOverview({
      now,
      range: { from, to },
      schoolYear: settings.schoolYear,
      termId: settings.termId,
      rows,
      classes: [],
      masteries: {},
      teachers: num(r.teachers),
      ai: { gradedInRange: num((r.ai as Row | undefined)?.range), usedToday: num((r.ai as Row | undefined)?.today), dailyQuota: settings.aiDailyQuota },
      attendance: { present: num((r.attendance as Row | undefined)?.present), total: num((r.attendance as Row | undefined)?.total) },
    });
    overview.mastery = ((r.mastery ?? []) as Row[]).map((m) => ({
      grade: num(m.grade) as Grade,
      subject: String(m.subject) as SubjectId,
      students: num(m.students),
      avgMastery: numOrNull(m.avg_p),
      secureRate: num(m.cells) ? num(m.secure) / num(m.cells) : null,
    }));
    return overview;
  }

  async getGradeHeatmap(grade: Grade, subject: SubjectId = 'toan'): Promise<GradeHeatmap> {
    const r = await this.rpc<Row>('grade_skill_report', { p_grade: grade, p_subject: subject }, 'Chưa tải được bản đồ khối');
    const classes = ((r.classes ?? []) as Row[]).map((c) => ({ classId: String(c.id), name: String(c.name), students: num(c.students) }));
    const cells: GradeHeatmap['cells'] = Object.fromEntries(classes.map((c) => [c.classId, {}]));
    const total: GradeHeatmap['total'] = {};
    const codes = new Set<string>();
    const LV: MasteryLevel[] = ['chua-hoc', 'dang-hoc', 'can-on', 'vung'];
    for (const x of (r.cells ?? []) as Row[]) {
      const code = String(x.skill_code);
      const counts = Object.fromEntries(LV.map((l) => [l, num((x.counts as Row | undefined)?.[l])])) as Record<MasteryLevel, number>;
      const cell: GradeHeatmapCell = { n: num(x.n), avgP: num(x.avg_p), counts };
      (cells[String(x.class_id)] ??= {})[code] = cell;
      codes.add(code);
      const t = (total[code] ??= { n: 0, avgP: 0, counts: Object.fromEntries(LV.map((l) => [l, 0])) as Record<MasteryLevel, number> });
      t.avgP = (t.avgP * t.n + cell.avgP * cell.n) / Math.max(1, t.n + cell.n);
      t.n += cell.n;
      for (const l of LV) t.counts[l] += counts[l];
    }
    const skills = [...codes]
      .filter((c) => SKILL_BY_CODE[c])
      .sort((a, b) => SKILL_BY_CODE[a].grade - SKILL_BY_CODE[b].grade || a.localeCompare(b))
      .map((c) => ({ code: c, short: SKILL_BY_CODE[c].short, topic: SKILL_BY_CODE[c].topic }));
    return { grade, subject, classes, skills, cells, total };
  }

  /* ---------- quản trị ---------- */
  private settingsOf(r: Row | undefined | null): SchoolSettings {
    const d = (r ?? {}) as Row;
    const now = new Date();
    const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return {
      schoolName: String(d.schoolName ?? ''),
      schoolYear: String(d.schoolYear ?? `${y}-${y + 1}`),
      termId: (d.termId ?? 'GK1') as SchoolSettings['termId'],
      aiDailyQuota: num(d.aiDailyQuota ?? 200),
    };
  }
  async getSchoolSettings(): Promise<SchoolSettings> {
    const sb = await this.db();
    const { data, error } = await sb.from('school_settings').select('data').maybeSingle();
    if (error) fail(error, 'Chưa tải được cài đặt trường');
    return this.settingsOf((data as Row | null)?.data as Row | undefined);
  }
  async saveSchoolSettings(s: SchoolSettings): Promise<SchoolSettings> {
    const r = await this.rpc<Row>('admin_save_settings', { p_data: s }, 'Chưa lưu được cài đặt');
    return this.settingsOf(r);
  }
  async listSchoolUsers(filter: { role?: Role; classId?: string } = {}): Promise<SchoolUser[]> {
    const rows = await this.rpc<Row[]>('admin_list_users', { p_role: filter.role ?? null, p_class: filter.classId ?? null }, 'Chưa tải được danh sách tài khoản');
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      role: String(r.role) as Role,
      name: String(r.name ?? ''),
      ...(r.username ? { username: String(r.username) } : {}),
      ...(r.class_id ? { classId: String(r.class_id) } : {}),
      ...(r.class_name ? { className: String(r.class_name) } : {}),
      ...(r.grade ? { grade: num(r.grade) as Grade } : {}),
      ...(Array.isArray(r.class_ids) ? { classIds: (r.class_ids as unknown[]).map(String) } : {}),
    }));
  }
  async saveClass(input: SaveClassInput): Promise<{ id: string; name: string; grade: Grade; teacherId?: string }> {
    const r = await this.rpc<Row>('admin_save_class', { p_class: { id: input.id || null, name: input.name, grade: input.grade, teacher_id: input.teacherId || null } }, 'Chưa lưu được lớp');
    return { id: String(r.id), name: String(r.name), grade: num(r.grade) as Grade, ...(r.teacher_id ? { teacherId: String(r.teacher_id) } : {}) };
  }
  async createTeacher(input: CreateTeacherInput): Promise<AccountSlip> {
    return this.admin<AccountSlip>({ action: 'create-teacher', ...input }, 'Chưa tạo được tài khoản giáo viên');
  }
  async bulkCreateStudents(classId: string, names: string[]): Promise<AccountSlip[]> {
    const r = await this.admin<{ slips: AccountSlip[] }>({ action: 'create-students', classId, names }, 'Chưa tạo được tài khoản học sinh');
    return r.slips ?? [];
  }
  async resetPassword(userId: string): Promise<AccountSlip> {
    return this.admin<AccountSlip>({ action: 'reset-password', userId }, 'Chưa đặt lại được mật khẩu');
  }
}
