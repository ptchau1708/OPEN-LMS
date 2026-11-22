/**
 * Phase 5 — tài khoản phụ huynh thật, mã liên kết, báo cáo trường, quản trị (docs/PHASE5_API.md).
 * Tách khỏi DataSource: app lấy `SchoolSource` qua `getSchoolSource()` / hook trong `@openedu/data`.
 */
import type { Grade } from './items';
import type { SubjectId } from './subjects';
import type { StudentWorkEntry, Tt27Level } from './assess';
import type { Tt27Rating, Tt27TermId } from './engagement';
import type { MasteryLevel } from './mastery';
import type { Profile, Role } from './users';

/* ======================= mã liên kết phụ huynh ======================= */
/** 8 kí tự, bỏ 0/O/1/I/L cho dễ đọc khi in. */
export const GUARDIAN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const GUARDIAN_CODE_LENGTH = 8;
export const GUARDIAN_CODE_TTL_DAYS = 14;
export const MAX_GUARDIANS_PER_CHILD = 4;
/** Số lần nhập sai mã tối đa mỗi tài khoản / ngày (chống dò mã). */
export const MAX_CODE_ATTEMPTS_PER_DAY = 10;

export interface GuardianCode {
  code: string;
  studentId: string;
  studentName?: string;
  classId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedBy?: string;
  revokedAt?: string;
}
export type GuardianCodeStatus = 'active' | 'used' | 'expired' | 'revoked';
export const GUARDIAN_CODE_STATUS_LABEL: Record<GuardianCodeStatus, string> = {
  active: 'Còn hiệu lực',
  used: 'Đã dùng',
  expired: 'Hết hạn',
  revoked: 'Đã thu hồi',
};

export interface GuardianLinkInfo {
  parentId: string;
  parentName: string;
  /** Email hoặc số điện thoại đăng nhập (đã che bớt cho GV). */
  parentLogin?: string;
  studentId: string;
  studentName: string;
  relation?: string;
  createdAt: string;
}

export interface ParentRegisterInput {
  /** Email hoặc số điện thoại (dùng làm tên đăng nhập). */
  login: string;
  password: string;
  name: string;
  /** Mã liên kết của con (bắt buộc khi tự đăng ký). */
  code: string;
  relation?: string;
}

export interface RedeemResult {
  child: Profile;
  alreadyLinked: boolean;
}

/* ======================= bản tin tuần cho phụ huynh ======================= */
export interface ParentDigest {
  childId: string;
  childName: string;
  className?: string;
  /** Thứ Hai 0 giờ (giờ VN), ISO. */
  weekStart: string;
  /** Hết Chủ nhật (hoặc bây giờ nếu tuần hiện tại). */
  weekEnd: string;
  isCurrentWeek: boolean;
  headline: string;
  days: { date: string; label: string; active: boolean; answered: number; stars: number }[];
  totals: { daysActive: number; answered: number; correctRate: number | null; stars: number; lessonsCompleted: number; remediationPassed: number };
  /** Bài viết GV đã duyệt trong tuần (mới trước). */
  works: StudentWorkEntry[];
  attendance: { days: number; present: number; late: number; excused: number; unexcused: number } | null;
  behavior: { points: number; positive: number; needsWork: number; topPositive?: string } | null;
  /** Kết quả TT27 gần nhất đã chốt (status 'final'). */
  tt27: ParentTt27 | null;
  /** Gợi ý ở nhà (≤ 3). */
  tips: string[];
}

export interface ParentTt27 {
  termId: Tt27TermId;
  schoolYear: string;
  subjects: { subject: SubjectId; level: Tt27Level; comment: string; score?: number }[];
  qualities: { key: string; rating: Tt27Rating }[];
  competencies: { key: string; rating: Tt27Rating }[];
  /** "Lời nhắn của cô" = generalComment. */
  generalComment: string;
  teacherName?: string;
  updatedAt?: string;
}

/* ======================= báo cáo trường ======================= */
export interface ReportRange {
  /** ISO; mặc định thứ Hai tuần này. */
  from?: string;
  to?: string;
}

export interface ClassReportRow {
  classId: string;
  name: string;
  grade: Grade;
  teacherId?: string;
  teacherName?: string;
  students: number;
  /** HS có ít nhất 1 hoạt động trong khoảng. */
  activeStudents: number;
  lessonsCompleted: number;
  answered: number;
  correctRate: number | null;
  /** Trung bình p (0..1) các kĩ năng đã làm ≥ 3 lần; null nếu chưa có. */
  avgMastery: number | null;
  /** Số HS có ≥ 1 kĩ năng 'can-on'. */
  studentsWithGaps: number;
  /** 30 ngày: (có mặt + muộn) / số lượt điểm danh. */
  attendanceRate: number | null;
  tt27Final: number;
  worksApproved: number;
}

export interface MasteryByGradeSubject {
  grade: Grade;
  subject: SubjectId;
  students: number;
  avgMastery: number | null;
  /** Tỉ lệ ô (HS × kĩ năng đã làm) ở mức 'vung'. */
  secureRate: number | null;
}

export interface SchoolOverview {
  generatedAt: string;
  range: { from: string; to: string };
  schoolYear: string;
  termId: Tt27TermId;
  classes: number;
  teachers: number;
  students: number;
  activeStudents: number;
  lessonsCompleted: number;
  answered: number;
  correctRate: number | null;
  attendanceRate: number | null;
  /** % HS đã có TT27 'final' cho kì hiện tại. */
  tt27FinalRate: number | null;
  ai: { gradedInRange: number; usedToday: number; dailyQuota: number };
  mastery: MasteryByGradeSubject[];
  rows: ClassReportRow[];
}

export interface GradeHeatmapCell {
  /** Số HS đã làm kĩ năng này. */
  n: number;
  avgP: number;
  counts: Record<MasteryLevel, number>;
}
export interface GradeHeatmap {
  grade: Grade;
  subject: SubjectId;
  classes: { classId: string; name: string; students: number }[];
  skills: { code: string; short: string; topic: string }[];
  /** cells[classId][skillCode]; vắng = chưa ai làm. */
  cells: Record<string, Record<string, GradeHeatmapCell>>;
  /** Cả khối theo kĩ năng. */
  total: Record<string, GradeHeatmapCell>;
}

/* ======================= quản trị ======================= */
export interface SchoolSettings {
  schoolName: string;
  schoolYear: string;
  termId: Tt27TermId;
  /** Hạn mức chấm AI / GV / ngày (Edge Function đọc AI_DAILY_LIMIT_GRADE; ở đây để hiển thị). */
  aiDailyQuota: number;
}

export interface SchoolUser {
  id: string;
  role: Role;
  name: string;
  username?: string;
  classId?: string;
  className?: string;
  grade?: Grade;
  /** GV: các lớp chủ nhiệm. */
  classIds?: string[];
}

export interface SaveClassInput {
  /** Rỗng = tạo mới. */
  id?: string;
  name: string;
  grade: Grade;
  teacherId?: string | null;
}

/** Phiếu tài khoản để in (mật khẩu chỉ hiện một lần). */
export interface AccountSlip {
  userId: string;
  role: Role;
  name: string;
  username: string;
  password: string;
  /** Mật khẩu tạm: người dùng phải đổi ở lần đăng nhập sau (phụ huynh, giáo viên). */
  temporary?: boolean;
  classId?: string;
  className?: string;
}

export interface CreateTeacherInput {
  name: string;
  /** Tên đăng nhập ngắn (cothu) hoặc email. Rỗng = tự sinh từ tên. */
  username?: string;
  password?: string;
}

/**
 * Nguồn dữ liệu Phase 5 (demo + Supabase). Quyền: GV chỉ lớp mình; admin toàn trường; phụ huynh chỉ con mình.
 */
export interface SchoolSource {
  /* ---- mã liên kết & phụ huynh ---- */
  /** Sinh mã mới (thu hồi mã còn hiệu lực cũ của cùng HS). Rỗng = cả lớp. */
  createGuardianCodes(classId: string, studentIds?: string[]): Promise<GuardianCode[]>;
  listGuardianCodes(classId: string): Promise<GuardianCode[]>;
  revokeGuardianCode(code: string): Promise<void>;
  listGuardianLinks(classId: string): Promise<GuardianLinkInfo[]>;
  revokeGuardianLink(parentId: string, studentId: string): Promise<void>;
  /** Phụ huynh tự đăng ký bằng mã của con → đăng nhập luôn. */
  registerParent(input: ParentRegisterInput): Promise<Profile>;
  /** Phụ huynh đã đăng nhập thêm con bằng mã. */
  redeemGuardianCode(code: string): Promise<RedeemResult>;
  getParentDigest(childId: string, weekStart?: string): Promise<ParentDigest>;

  /* ---- báo cáo ---- */
  getSchoolOverview(range?: ReportRange): Promise<SchoolOverview>;
  getGradeHeatmap(grade: Grade, subject?: SubjectId): Promise<GradeHeatmap>;

  /* ---- quản trị (admin) ---- */
  getSchoolSettings(): Promise<SchoolSettings>;
  saveSchoolSettings(s: SchoolSettings): Promise<SchoolSettings>;
  listSchoolUsers(filter?: { role?: Role; classId?: string }): Promise<SchoolUser[]>;
  saveClass(input: SaveClassInput): Promise<{ id: string; name: string; grade: Grade; teacherId?: string }>;
  createTeacher(input: CreateTeacherInput): Promise<AccountSlip>;
  /** Danh sách "Họ tên" → tài khoản HS (tên đăng nhập kiểu an4a1 + mật khẩu). */
  bulkCreateStudents(classId: string, names: string[]): Promise<AccountSlip[]>;
  resetPassword(userId: string): Promise<AccountSlip>;
}
