/**
 * Đánh giá định kì theo Thông tư 27/2020, thi đua (điểm nề nếp), điểm danh (docs/PHASE4_API.md).
 */
import type { Tt27Level } from './assess';
import type { SubjectId } from './subjects';

/* ======================= TT27 ======================= */
/** GK1 giữa HK I · CK1 cuối HK I · GK2 giữa HK II · CN cuối năm. */
export type Tt27TermId = 'GK1' | 'CK1' | 'GK2' | 'CN';

export const TT27_TERM_LABEL: Record<Tt27TermId, string> = {
  GK1: 'Giữa học kì I',
  CK1: 'Cuối học kì I',
  GK2: 'Giữa học kì II',
  CN: 'Cuối năm học',
};

/** Phẩm chất / năng lực: T = Tốt · Đ = Đạt · C = Cần cố gắng. */
export type Tt27Rating = 'T' | 'Đ' | 'C';

export const TT27_RATING_LABEL: Record<Tt27Rating, string> = { T: 'Tốt', Đ: 'Đạt', C: 'Cần cố gắng' };

export type Tt27Quality = 'yeu-nuoc' | 'nhan-ai' | 'cham-chi' | 'trung-thuc' | 'trach-nhiem';

export const TT27_QUALITY_LABEL: Record<Tt27Quality, string> = {
  'yeu-nuoc': 'Yêu nước',
  'nhan-ai': 'Nhân ái',
  'cham-chi': 'Chăm chỉ',
  'trung-thuc': 'Trung thực',
  'trach-nhiem': 'Trách nhiệm',
};

/** Năng lực chung (3) + năng lực đặc thù (7). */
export type Tt27Competency =
  | 'tu-chu-tu-hoc'
  | 'giao-tiep-hop-tac'
  | 'gqvd-sang-tao'
  | 'ngon-ngu'
  | 'tinh-toan'
  | 'khoa-hoc'
  | 'cong-nghe'
  | 'tin-hoc'
  | 'tham-mi'
  | 'the-chat';

export const TT27_COMPETENCY_LABEL: Record<Tt27Competency, string> = {
  'tu-chu-tu-hoc': 'Tự chủ và tự học',
  'giao-tiep-hop-tac': 'Giao tiếp và hợp tác',
  'gqvd-sang-tao': 'Giải quyết vấn đề và sáng tạo',
  'ngon-ngu': 'Ngôn ngữ',
  'tinh-toan': 'Tính toán',
  'khoa-hoc': 'Khoa học',
  'cong-nghe': 'Công nghệ',
  'tin-hoc': 'Tin học',
  'tham-mi': 'Thẩm mĩ',
  'the-chat': 'Thể chất',
};

export interface Tt27SubjectResult {
  level: Tt27Level;
  comment: string;
  /** Điểm bài kiểm tra định kì (cuối kì; lớp 4–5 Toán, Tiếng Việt…), thang 10. */
  score?: number;
}

export interface Tt27Evaluation {
  studentId: string;
  classId: string;
  termId: Tt27TermId;
  /** Vd '2026-2027'. Mặc định năm học hiện tại (schoolYearOf). */
  schoolYear: string;
  subjects: Partial<Record<SubjectId, Tt27SubjectResult>>;
  qualities: Record<Tt27Quality, Tt27Rating>;
  competencies: Partial<Record<Tt27Competency, Tt27Rating>>;
  generalComment: string;
  /** final: HS/phụ huynh thấy được. */
  status: 'draft' | 'final';
  updatedBy?: string;
  updatedAt?: string;
}

/** Bản nháp do suggestTt27 soạn (GV luôn sửa). */
export interface Tt27Suggestion extends Tt27Evaluation {
  /** Căn cứ từng phần, cho GV: "12 kĩ năng vững, 2 cần ôn", "3 bài viết đã duyệt: 2 T, 1 H"… */
  basis: string[];
}

/** Năm học chứa ngày `d` (năm học bắt đầu tháng 9). */
export function schoolYearOf(d: Date = new Date()): string {
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/* ======================= thi đua ======================= */
export interface Behavior {
  id: string;
  classId: string;
  label: string;
  /** +1/+2 (tích cực) hoặc −1/−2 (cần cố gắng). */
  points: number;
  /** Emoji hoặc tên biểu tượng ngắn. */
  icon: string;
  kind: 'positive' | 'needs-work';
}

export interface BehaviorLog {
  id: string;
  studentId: string;
  classId: string;
  behaviorId: string;
  points: number;
  note?: string;
  teamId?: string;
  at: string;
  /** id GV ghi. */
  by: string;
}

export interface RecordBehaviorInput {
  classId: string;
  behaviorId: string;
  /** Một hoặc nhiều HS (ghi cả tổ / cả lớp). */
  studentIds: string[];
  note?: string;
  by: string;
}

export interface LeaderboardRow {
  id: string;
  name: string;
  color?: string;
  points: number;
  positive: number;
  needsWork: number;
}

export interface ClassLeaderboard {
  classId: string;
  from: string;
  to: string;
  /** Lớp 1–3: 'team' (thi đua theo tổ trước). Lớp 4–5: 'student'. */
  mode: 'team' | 'student';
  teams: LeaderboardRow[];
  students: LeaderboardRow[];
}

/* ======================= điểm danh ======================= */
export type AttendanceStatus = 'co-mat' | 'vang-co-phep' | 'vang-khong-phep' | 'muon';

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  'co-mat': 'Có mặt',
  'vang-co-phep': 'Vắng có phép',
  'vang-khong-phep': 'Vắng không phép',
  muon: 'Đi muộn',
};

export interface AttendanceRecord {
  classId: string;
  /** YYYY-MM-DD (giờ Việt Nam). */
  date: string;
  entries: Record<string, AttendanceStatus>;
}

/* ======================= tóm tắt trong hồ sơ HS ======================= */
export interface BehaviorSummary {
  /** 7 ngày gần nhất. */
  weekPoints: number;
  weekPositive: number;
  weekNeedsWork: number;
  /** Nhãn hành vi tích cực hay gặp nhất (30 ngày), vd "Hăng hái phát biểu". */
  topPositive: string[];
  topNeedsWork: string[];
  /** Mới nhất trước, tối đa 10. */
  recent: { at: string; label: string; icon: string; points: number; note?: string }[];
}

export interface AttendanceSummary {
  /** 30 ngày gần nhất có điểm danh. */
  days: number;
  present: number;
  late: number;
  excused: number;
  unexcused: number;
  /** 0..1, null nếu chưa có ngày nào. */
  rate: number | null;
  /** Mới nhất trước, tối đa 5 ngày vắng/muộn. */
  recentAbsences: { date: string; status: AttendanceStatus }[];
}
