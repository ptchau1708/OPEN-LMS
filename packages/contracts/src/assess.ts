/**
 * Bài làm viết tay / đánh máy, tiêu chí chấm (rubric), AI chấm bài và GV duyệt (docs/PHASE4_API.md).
 * Luật thuần (prompt, kiểm tra JSON, tính điểm/mức, chấm mẫu): packages/data/src/assess (chép sang
 * supabase/functions/_shared/assess bằng tools/sync-scoring.mjs).
 */
import type { Grade } from './items';
import type { SubjectId } from './subjects';

/** Mức đạt theo Thông tư 27/2020: T = Hoàn thành tốt · H = Hoàn thành · C = Chưa hoàn thành. */
export type Tt27Level = 'T' | 'H' | 'C';

export const TT27_LEVEL_LABEL: Record<Tt27Level, string> = {
  T: 'Hoàn thành tốt',
  H: 'Hoàn thành',
  C: 'Chưa hoàn thành',
};

export interface RubricLevel {
  /** Vd "Tốt", "Đạt", "Cần cố gắng". */
  label: string;
  points: number;
  descriptor: string;
}

export interface RubricCriterion {
  id: string;
  /** Vd "Lời giải đúng". */
  name: string;
  /** Chấm cái gì, cho GV và AI. */
  description: string;
  /** Điểm tối đa của tiêu chí. Tổng `points` của các tiêu chí nên bằng `Rubric.maxScore` (khác thì quy đổi theo tỉ lệ). */
  points: number;
  /** Tuỳ chọn: các mức mô tả (để AI chọn mức gần nhất). */
  levels?: RubricLevel[];
  /** Kĩ năng tiêu chí này thể hiện (mặc định: Rubric.skills). */
  skills?: string[];
}

export interface Rubric {
  id: string;
  title: string;
  subject: SubjectId;
  grade: Grade;
  /** Thang điểm, mặc định 10. */
  maxScore: number;
  criteria: RubricCriterion[];
  /** Bài giải / bài văn mẫu (HS không đọc được ở Supabase). */
  modelAnswer?: string;
  /** Mã kĩ năng (SKILL_BY_CODE) bài làm thể hiện. */
  skills: string[];
  /** Dặn riêng cho người chấm (AI), vd "chấp nhận cả cách giải sơ đồ đoạn thẳng". */
  aiNotes?: string;
  ownerId?: string;
  updatedAt?: string;
}

export interface WorkTask {
  id: string;
  title: string;
  /** Đề bài: chữ + ảnh tuỳ chọn (URL). */
  prompt: { text: string; image?: string };
  subject: SubjectId;
  grade: Grade;
  rubricId: string;
  classId: string;
  /** Rỗng = cả lớp. */
  studentIds: string[];
  dueAt?: string;
  allowPhoto: boolean;
  allowText: boolean;
  createdBy: string;
  createdAt?: string;
}

export interface WorkImage {
  /** Demo: URL ảnh mẫu hoặc dataURL JPEG. Supabase: URL có ký (hết hạn ~1 giờ) — đọc lại khi cần. */
  url: string;
  width: number;
  height: number;
  /** Supabase: đường dẫn trong bucket `submissions` (<task>/<student>/<file>.jpg). */
  path?: string;
}

export type SubmissionKind = 'photo' | 'text' | 'mixed';

/**
 * submitted → grading → graded | needs-review | error → approved (GV duyệt) | returned (GV trả lại để làm lại).
 * HS/phụ huynh chỉ thấy điểm & nhận xét khi approved (hoặc lời nhắn của GV khi returned).
 */
export type SubmissionStatus = 'submitted' | 'grading' | 'graded' | 'needs-review' | 'approved' | 'returned' | 'error';

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  submitted: 'Đã nộp',
  grading: 'Đang chấm',
  graded: 'Chờ duyệt',
  'needs-review': 'Cần thầy/cô xem',
  approved: 'Đã duyệt',
  returned: 'Trả lại để làm lại',
  error: 'Chưa chấm được',
};

export interface Submission {
  id: string;
  taskId: string;
  studentId: string;
  classId?: string;
  kind: SubmissionKind;
  text?: string;
  images: WorkImage[];
  /** 'teacher' = GV chụp/tải bài làm trên giấy hộ HS. */
  submittedBy: 'student' | 'teacher';
  /** Người bấm nộp (id GV khi submittedBy = 'teacher'). */
  submitterId?: string;
  status: SubmissionStatus;
  /** Lỗi khi chấm (status 'error'), tiếng Việt. */
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

export type GradeFlag = 'unreadable' | 'off-topic' | 'possible-copy' | 'low-confidence';

export const GRADE_FLAG_LABEL: Record<GradeFlag, string> = {
  unreadable: 'Chữ khó đọc',
  'off-topic': 'Lạc đề',
  'possible-copy': 'Có thể chép bài',
  'low-confidence': 'AI chưa chắc chắn',
};

export interface CriterionScore {
  criterionId: string;
  points: number;
  max: number;
  comment: string;
  /** Trích dẫn câu/dòng trong bài làm làm bằng chứng. */
  evidence?: string;
}

export interface GradeIssue {
  text: string;
  skill?: string;
  /** Mã MISCONCEPTIONS (nếu khớp). */
  misconception?: string;
  /** Vd "dòng 3", "ảnh 1". */
  location?: string;
}

export type SkillEvidence = 'dung' | 'sai' | 'chua-ro';

export interface AiGrade {
  submissionId: string;
  /** Chữ chép lại từ ảnh (OCR chữ viết tay), mỗi ảnh một phần tử. Bài đánh máy: [] . */
  transcript: string[];
  criteria: CriterionScore[];
  total: number;
  max: number;
  level: Tt27Level;
  strengths: string[];
  issues: GradeIssue[];
  /** Cho HS: 2–4 câu ngắn, xưng "em", khen trước, một bước tiếp theo. Không nhắc tới AI. */
  feedbackStudent: string;
  /** Cho GV: chẩn đoán ngắn gọn. */
  feedbackTeacher: string;
  /** Cho phụ huynh: lời lẽ đơn giản + 1 gợi ý ở nhà. */
  feedbackParent: string;
  skills: { code: string; evidence: SkillEvidence }[];
  /** 0..1 */
  confidence: number;
  flags: GradeFlag[];
  /** Mô hình đã chấm, vd 'google/gemini-2.5-flash'; chấm mẫu: MOCK_GRADER_MODEL. */
  model: string;
  /** true = chấm mẫu (demo), hiện nhãn MOCK_GRADER_LABEL. */
  mock?: boolean;
  createdAt: string;
}

export const MOCK_GRADER_MODEL = 'mock/demo';
export const MOCK_GRADER_LABEL = 'Chấm mẫu (demo)';
/** Dưới ngưỡng này (hoặc có cờ) → needs-review. */
export const GRADE_REVIEW_CONFIDENCE = 0.7;

/** Phần GV chốt (sửa từ AiGrade). */
export interface GradeFinal {
  total: number;
  max: number;
  level: Tt27Level;
  criteria: { criterionId: string; points: number; comment: string }[];
  feedbackStudent: string;
  feedbackParent: string;
  feedbackTeacher?: string;
}

/**
 * approved: đồng ý bản AI · edited: GV sửa rồi duyệt · regrade: chấm lại bằng AI ·
 * redo: trả bài cho HS làm lại (status 'returned', `note` hiện cho HS).
 */
export type ReviewDecision = 'approved' | 'edited' | 'regrade' | 'redo';

export interface GradeReview {
  submissionId: string;
  teacherId: string;
  /** Bỏ trống với 'approved' (lấy nguyên bản AI) và 'regrade'. Với 'edited' có thể chỉ gửi phần sửa. */
  final?: Partial<GradeFinal>;
  decision: ReviewDecision;
  note?: string;
  /**
   * GV tự chấm (không cần AI): gửi kèm decision 'edited' và `final` { level?, total?, criteria?, feedback… }.
   * Máy chủ tạo bản chấm của GV (AiGrade model 'manual/teacher') rồi duyệt luôn.
   */
  manual?: boolean;
  at: string;
}

/** Submission kèm điểm AI, duyệt của GV (và đề, rubric khi getSubmission). */
export interface SubmissionDetail extends Submission {
  studentName?: string;
  taskTitle?: string;
  task?: WorkTask;
  rubric?: Rubric;
  /** Ẩn với HS/phụ huynh khi chưa duyệt. */
  grade?: AiGrade;
  review?: GradeReview;
  /** Kết quả chốt (review.final ghép lên grade) — chỉ có khi đã duyệt. */
  final?: GradeFinal;
}

/** Một bài đã duyệt cho hồ sơ HS / phụ huynh. */
export interface StudentWorkEntry {
  submissionId: string;
  taskId: string;
  title: string;
  subject: SubjectId;
  at: string;
  level: Tt27Level;
  total: number;
  max: number;
  /** Nhận xét cho HS (bản chốt). */
  comment: string;
  parentComment: string;
  teacherComment?: string;
  /** Ảnh đầu tiên (nếu là bài chụp). */
  thumbnail?: string;
  kind: SubmissionKind;
  skills: string[];
  /** GV đã sửa bản AI? */
  edited: boolean;
  mock?: boolean;
}

export interface StudentWorkSummary {
  /** Mới nhất trước, tối đa 6. */
  latest: StudentWorkEntry[];
  counts: Record<Tt27Level, number>;
  /** So tỉ lệ điểm 2 bài gần nhất với 2 bài trước đó (cần ≥ 3 bài). */
  trend: 'tien-bo' | 'on-dinh' | 'giam' | null;
  /** Bài đã nộp nhưng chưa duyệt. */
  pending: number;
}

export interface SubmitWorkInput {
  taskId: string;
  studentId: string;
  text?: string;
  /** Ảnh: Blob/File hoặc dataURL. Demo nén về JPEG ≤ 1600 px; Supabase tải lên bucket `submissions`. */
  images?: (Blob | string)[];
  /** Mặc định 'student'. 'teacher' = GV nộp hộ (bài trên giấy). */
  submittedBy?: 'student' | 'teacher';
  /** Gọi chấm AI ngay sau khi nộp (mặc định false). */
  autoGrade?: boolean;
  /** Khóa chống nộp trùng khi gửi lại từ hàng đợi offline. */
  clientEventId?: string;
}

export interface SubmissionFilter {
  taskId?: string;
  studentId?: string;
  classId?: string;
  status?: SubmissionStatus | SubmissionStatus[];
}

export interface WorkTaskFilter {
  classId?: string;
  /** Bài giao cho HS này (theo lớp + studentIds). */
  studentId?: string;
  createdBy?: string;
}

export interface RubricFilter {
  subject?: SubjectId;
  grade?: Grade;
  ownerId?: string;
}
