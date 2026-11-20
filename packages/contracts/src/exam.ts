/**
 * Phase 6 — Đề kiểm tra theo ma trận (kiểu TT27) và làm bài trực tuyến có chống gian lận nhẹ (docs/PHASE6_EXAM.md).
 *
 * Ma trận: hàng = mạch kiến thức / nhóm kĩ năng, cột = 3 mức (Mức 1 nhận biết, Mức 2 kết nối, Mức 3 vận dụng),
 * ô = số câu trắc nghiệm (TN) + tự luận ngắn (TL) và điểm mỗi câu. Mức của câu hỏi: thẻ `muc:1|2|3` (ưu tiên)
 * hoặc `difficulty` (nhan-biet → 1, ket-noi → 2, van-dung → 3); câu không có cả hai coi là Mức 1 (ước lượng).
 */
import type { AnyResponse, Grade, Item } from './items';
import type { SubjectId } from './subjects';
import type { Tt27TermId } from './engagement';
import type { Profile } from './users';

export type ExamLevel = 1 | 2 | 3;
export const EXAM_LEVELS: ExamLevel[] = [1, 2, 3];
export const EXAM_LEVEL_LABEL: Record<ExamLevel, string> = { 1: 'Mức 1', 2: 'Mức 2', 3: 'Mức 3' };
export const EXAM_LEVEL_HINT: Record<ExamLevel, string> = { 1: 'Nhận biết', 2: 'Kết nối', 3: 'Vận dụng' };

/** tn = trắc nghiệm (chọn, nối, sắp xếp, kéo thả…), tl = tự luận ngắn (điền số / từ). */
export type ExamQType = 'tn' | 'tl';
export const EXAM_QTYPE_LABEL: Record<ExamQType, string> = { tn: 'trắc nghiệm', tl: 'tự luận' };

export interface MatrixRow {
  id: string;
  /** Tên mạch kiến thức hiển thị trên đề, vd 'Phân số'. */
  label: string;
  /** Mã kĩ năng (SKILLS) thuộc hàng này — câu hỏi khớp nếu có ít nhất một mã trùng. */
  skills: string[];
}

export interface MatrixCell {
  tn: number;
  tl: number;
  /** Điểm mỗi câu (bội của 0,25). */
  points: number;
}

/** Khóa ô: `${rowId}:${level}`. */
export function cellKey(rowId: string, level: ExamLevel): string {
  return `${rowId}:${level}`;
}

export interface ExamMatrix {
  id: string;
  title: string;
  subject: SubjectId;
  grade: Grade;
  termId?: Tt27TermId;
  rows: MatrixRow[];
  cells: Record<string, MatrixCell>;
  /** Thời gian làm bài gợi ý (phút). */
  durationMin: number;
  ownerId?: string;
  updatedAt?: string;
}

export interface ExamSlot {
  id: string;
  /** Số thứ tự câu trên đề (1…). */
  no: number;
  rowId: string;
  level: ExamLevel;
  qtype: ExamQType;
  points: number;
  /** null = chưa có câu phù hợp trong ngân hàng (thiếu). */
  itemId: string | null;
}

export type ExamVariant = 'A' | 'B';

/** Hai đề A/B cùng cấu trúc ô (cùng id slot), khác câu khi ngân hàng đủ. */
export interface ExamPaper {
  A: ExamSlot[];
  B: ExamSlot[];
}

export interface ExamShortfall {
  rowId: string;
  rowLabel: string;
  level: ExamLevel;
  qtype: ExamQType;
  /** Số câu còn thiếu cho đề A. */
  missing: number;
  /** Số câu đề B phải dùng lại của đề A (ngân hàng không đủ câu khác). */
  reusedInB: number;
  /** "Thiếu 2 câu Mức 3 – Phân số (tự luận)". */
  message: string;
}

export interface GenerateResult {
  paper: ExamPaper;
  shortfalls: ExamShortfall[];
}

export type ExamResultsPolicy = 'immediate' | 'after-release';

export interface Exam {
  id: string;
  title: string;
  matrixId?: string;
  subject: SubjectId;
  grade: Grade;
  termId?: Tt27TermId;
  classId: string;
  /** Rỗng / không có = cả lớp. */
  studentIds?: string[];
  durationMin: number;
  openAt: string;
  closeAt: string;
  resultsPolicy: ExamResultsPolicy;
  releasedAt?: string | null;
  /** Số lần làm mặc định (1). GV cho làm lại từng em bằng allowRetake. */
  maxAttempts: number;
  /** 'A' = mọi em làm đề A; 'AB' = máy chia ngẫu nhiên đề A hoặc B cho từng em. */
  onlineVariants: 'A' | 'AB';
  /** Gợi ý bật toàn màn hình khi bắt đầu (máy tính bảng / PC). */
  fullscreenPrompt: boolean;
  status: 'draft' | 'published';
  /** Tên hàng của ma trận lúc ra đề (để báo cáo theo ô). */
  rows: { id: string; label: string }[];
  paper: ExamPaper;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/* ================= chống gian lận nhẹ ================= */
export type IntegrityKind = 'blur' | 'hidden' | 'fullscreen-exit' | 'paste-blocked' | 'duplicate-session' | 'resume';

export interface IntegrityEvent {
  kind: IntegrityKind;
  at: string;
  /** Thời gian rời màn hình (ms) — có ở sự kiện quay lại. */
  awayMs?: number;
  /** id câu đang làm. */
  itemId?: string;
}

export interface IntegritySummary {
  leaves: number;
  awayMs: number;
  fullscreenExits: number;
  pasteBlocked: number;
  duplicateSessions: number;
  resumes: number;
  /** Số câu trả lời nhanh bất thường (< FAST_ANSWER_MS với câu đã trả lời). */
  fastAnswers: number;
  /** Cả bài nộp trong < 25% thời gian và đúng ≥ 90%. */
  veryFastFinish: boolean;
  /** Câu mô tả trung tính cho GV: "Rời màn hình 3 lần (tổng 1 phút 20 giây)". Rỗng = không có gì đáng chú ý. */
  lines: string[];
  /** Mốc thời gian (để GV xem lại), mới trước, tối đa 50. */
  timeline: IntegrityEvent[];
}

/* ================= bài làm ================= */
export interface ExamAnswer {
  response: AnyResponse;
  /** Tổng thời gian em ở câu này (ms, máy đo). */
  ms: number;
  flagged?: boolean;
  savedAt: string;
}

export type ExamAttemptStatus = 'in-progress' | 'submitted';

export interface ExamItemResult {
  itemId: string;
  slotId: string;
  correct: boolean;
  /** 0..1 */
  score: number;
  /** Điểm đạt được (= score × points). */
  earned: number;
  points: number;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  studentId: string;
  attemptNo: number;
  variant: ExamVariant;
  seed: number;
  startedAt: string;
  deadlineAt: string;
  submittedAt?: string | null;
  /** true = hết giờ, máy tự nộp. */
  autoSubmitted?: boolean;
  status: ExamAttemptStatus;
  answers: Record<string, ExamAnswer>;
  integrity: IntegrityEvent[];
  /** Có sau khi chấm (chỉ GV / server). */
  results?: ExamItemResult[];
  score?: number;
  maxScore?: number;
  /** Điểm thang 10 làm tròn kiểu KTĐK (số nguyên 1–10, không có điểm 0). */
  score10?: number;
  retakeAllowed?: boolean;
}

/** Thẻ đề trên trang Hôm nay của HS. */
export interface ExamStudentCard {
  examId: string;
  title: string;
  subject: SubjectId;
  durationMin: number;
  openAt: string;
  closeAt: string;
  questions: number;
  state: 'upcoming' | 'open' | 'in-progress' | 'submitted' | 'closed';
  /** Có thể xem điểm. */
  resultReady: boolean;
  canRetake: boolean;
}

/** Phiên làm bài gửi xuống máy HS: KHÔNG có đáp án, câu và lựa chọn đã xáo theo `seed`. */
export interface ExamSession {
  exam: Pick<Exam, 'id' | 'title' | 'subject' | 'grade' | 'durationMin' | 'closeAt' | 'resultsPolicy' | 'fullscreenPrompt'>;
  attemptId: string;
  attemptNo: number;
  variant: ExamVariant;
  seed: number;
  startedAt: string;
  deadlineAt: string;
  /** Thời gian máy chủ lúc trả về (để tính lệch đồng hồ). */
  serverNow: string;
  /** Câu theo thứ tự hiển thị cho em này. */
  items: Item[];
  points: Record<string, number>;
  answers: Record<string, ExamAnswer>;
  status: ExamAttemptStatus;
  /** Bài đang mở ở một máy/tab khác cách đây < 45 giây. */
  otherSession: boolean;
}

export interface ExamStudentResult {
  examId: string;
  title: string;
  released: boolean;
  /** Khi chưa công bố chỉ có `submittedAt`. */
  submittedAt?: string | null;
  score10?: number;
  score?: number;
  maxScore?: number;
  correct?: number;
  total?: number;
  /** Đúng/chưa đúng theo số câu (thứ tự em đã làm). */
  perQuestion?: { no: number; correct: boolean }[];
}

/* ================= báo cáo GV ================= */
export interface ExamReportStudent {
  student: Profile;
  attempt: ExamAttempt | null;
  /** Gợi ý mức (T ≥ 9 · H ≥ 5 · C) — GV quyết định. */
  level?: 'T' | 'H' | 'C';
  integrity: IntegritySummary | null;
  /** Đang làm và đã quá hạn (chưa nộp). */
  overdue: boolean;
}

export interface ExamReportQuestion {
  slotId: string;
  no: number;
  variant: ExamVariant;
  itemId: string;
  rowId: string;
  level: ExamLevel;
  qtype: ExamQType;
  /** Số em làm câu này. */
  n: number;
  /** Độ khó p = điểm TB 0..1 (null khi chưa ai làm). */
  p: number | null;
}

export interface ExamReportCell {
  rowId: string;
  rowLabel: string;
  level: ExamLevel;
  n: number;
  p: number | null;
}

export interface ExamReport {
  exam: Exam;
  students: ExamReportStudent[];
  submitted: number;
  inProgress: number;
  notStarted: number;
  /** Số em theo điểm 1..10 (chỉ số 0 bỏ trống). */
  distribution: number[];
  mean: number | null;
  questions: ExamReportQuestion[];
  cells: ExamReportCell[];
}

/** Điểm KTĐK dùng cho gợi ý TT27. */
export interface ExamScoreEntry {
  examId: string;
  title: string;
  subject: SubjectId;
  termId?: Tt27TermId;
  score10: number;
  at: string;
}

export interface ExamFilter {
  classId?: string;
  status?: Exam['status'];
}

/**
 * Dịch vụ đề kiểm tra — tách khỏi DataSource: `getExamService(ds)` / hook `useExamService()`.
 * Demo: localStorage (chung kho với DemoDataSource). Supabase: bảng v2.exam_* + RPC exam_* + Edge Function grade (action exam-finalize).
 */
export interface ExamService {
  /* ma trận */
  listMatrices(): Promise<ExamMatrix[]>;
  saveMatrix(m: ExamMatrix): Promise<ExamMatrix>;
  deleteMatrix(id: string): Promise<void>;
  /** Sinh đề A/B từ ngân hàng (có đáp án — chỉ GV); tránh câu đã dùng trong 60 ngày. */
  generate(matrix: ExamMatrix, opts?: { seed?: number; classId?: string }): Promise<GenerateResult>;
  /** Câu có thể thay vào một ô (cùng hàng, mức, dạng), câu chưa dùng gần đây trước. */
  candidates(matrix: ExamMatrix, slot: ExamSlot, exclude: string[]): Promise<Item[]>;
  /* đề */
  listExams(filter?: ExamFilter): Promise<Exam[]>;
  getExam(id: string): Promise<Exam | null>;
  saveExam(e: Exam): Promise<Exam>;
  deleteExam(id: string): Promise<void>;
  getReport(examId: string): Promise<ExamReport>;
  releaseResults(examId: string): Promise<Exam>;
  allowRetake(examId: string, studentId: string): Promise<void>;
  /* học sinh */
  listMyExams(studentId: string): Promise<ExamStudentCard[]>;
  /** Bắt đầu hoặc tiếp tục. `sessionId` ngẫu nhiên mỗi tab — phát hiện mở trùng. */
  startExam(examId: string, sessionId: string): Promise<ExamSession>;
  saveAnswer(attemptId: string, itemId: string, answer: Omit<ExamAnswer, 'savedAt'>): Promise<void>;
  logIntegrity(attemptId: string, events: IntegrityEvent[]): Promise<void>;
  /** Mỗi ~20 giây. otherSession = có máy/tab khác cũng đang mở bài. */
  heartbeat(attemptId: string, sessionId: string): Promise<{ otherSession: boolean; deadlineAt: string }>;
  submitExam(attemptId: string): Promise<ExamStudentResult>;
  getMyResult(examId: string): Promise<ExamStudentResult | null>;
  /** Điểm KTĐK đã công bố của HS (gợi ý TT27). */
  examScores(studentId: string): Promise<ExamScoreEntry[]>;
}
