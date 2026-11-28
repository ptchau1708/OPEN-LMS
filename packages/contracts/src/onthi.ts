/**
 * Ôn thi (docs/ON_THI.md): hai trang luyện cho học sinh với các dạng câu tương tự sân chơi Trạng Nguyên và
 * Đấu trường VioEdu. Chỉ mô phỏng dạng câu và cách chấm, không chép cấu trúc vòng thi.
 *
 *  - Bài luyện: thầy/cô tạo cho CẢ KHỐI (từ tệp Word mẫu hoặc chọn từ ngân hàng), có đồng hồ cả bài.
 *      Kiểu Trạng Nguyên: 10 điểm/câu, chấm cả-hoặc-không, lưới câu để nhảy qua lại, mức đạt mặc định 80%.
 *      Kiểu VioEdu: 1 điểm/câu, sai không trừ, từng câu một có nút Bỏ qua, thanh nhịp; câu Đúng – Sai nhiều ý
 *      tính điểm lũy tiến. Bảng xếp hạng: điểm → thời gian → số câu sai.
 *  - Luyện theo dạng: em chọn một dạng câu rồi làm liền vài câu, biết đúng sai ngay (không tính hạng).
 */
import type { AnyResponse, Grade, Item, ItemType } from './items';
import type { SubjectId } from './subjects';

export type OnThiStyle = 'tn' | 'vio';

export interface OnThiStyleMeta {
  id: OnThiStyle;
  title: string;
  /** Điểm mặc định mỗi câu. */
  points: number;
  /** Số phút mặc định cho 30 câu. */
  minutes: number;
  /** Môn mặc định của bài luyện mới. */
  subject: SubjectId;
  /** Nhịp gợi ý (giây/câu) cho thanh nhịp — chỉ kiểu VioEdu. */
  paceSec?: number;
  /** Các dạng câu thường gặp (thứ tự hiện ở "Luyện theo dạng"). */
  types: ItemType[];
}

export const ONTHI_STYLES: Record<OnThiStyle, OnThiStyleMeta> = {
  tn: {
    id: 'tn',
    title: 'Ôn thi Trạng Nguyên',
    points: 10,
    minutes: 30,
    subject: 'tieng-viet',
    types: ['MCQ', 'SHORT_ANSWER', 'FILL_IN_PASSAGE', 'MATCHING', 'ORDERING', 'SENTENCE_SCRAMBLE', 'WORD_CLASSIFY', 'INLINE_DROPDOWN', 'MCQ_MULTIPLE', 'DRAG_DROP'],
  },
  vio: {
    id: 'vio',
    title: 'Ôn thi Đấu trường VIOEDU',
    points: 1,
    minutes: 20,
    subject: 'toan',
    paceSec: 40,
    types: ['MCQ', 'MCQ_MULTIPLE', 'SHORT_ANSWER', 'INLINE_DROPDOWN', 'MATCHING', 'FILL_IN_PASSAGE', 'TRUE_FALSE_MULTI', 'ORDERING'],
  },
};

/** Mức đạt mặc định: 80% điểm tối đa (30 câu kiểu Trạng Nguyên: 240/300). */
export const ONTHI_PASS_RATIO = 0.8;
/** Nhận câu trả lời trễ tối đa sau hạn (mạng chậm). */
export const ONTHI_GRACE_MS = 30_000;
export const ONTHI_MAX_ITEMS = 60;
/** Số câu mỗi lượt "Luyện theo dạng". */
export const ONTHI_PRACTICE_SIZE = 10;

/** Mức đạt mặc định cho n câu. */
export function defaultPassScore(style: OnThiStyle, n: number, points = ONTHI_STYLES[style].points): number {
  return Math.round(n * points * ONTHI_PASS_RATIO * 100) / 100;
}

/** Số phút gợi ý theo số câu (giữ nhịp của kiểu thi), tối thiểu 5 phút. */
export function defaultMinutes(style: OnThiStyle, n: number): number {
  const per = ONTHI_STYLES[style].minutes / 30;
  return Math.max(5, Math.round(n * per));
}

export interface OnThiSet {
  id: string;
  style: OnThiStyle;
  title: string;
  /** Bài luyện dành cho cả khối này. */
  grade: Grade;
  subject: SubjectId;
  itemIds: string[];
  minutes: number;
  points: number;
  /** Mức đạt (điểm), 0 ≤ passScore ≤ số câu × points. */
  passScore: number;
  /** Phải đạt bài liền trước (cùng kiểu, khối, môn; theo `position`) mới mở bài này. */
  lockOrder: boolean;
  position: number;
  /** Hiện bảng xếp hạng (10 bạn đầu + vị trí của em). */
  showBoard: boolean;
  /** Xem lại bài: hiện đáp án đúng và giải thích. */
  revealAnswers: boolean;
  status: 'draft' | 'published';
  /** Số em đã nộp bài (chỉ có trong danh sách của thầy/cô). */
  done?: number;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type OnThiSetInput = Omit<OnThiSet, 'id' | 'done' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'> & { id?: string };

export interface OnThiBest {
  attemptId: string;
  score: number;
  durationMs: number;
  wrong: number;
  passed: boolean;
  at: string;
}

/** Thẻ bài luyện ở trang của em. */
export interface OnThiCard {
  setId: string;
  style: OnThiStyle;
  title: string;
  subject: SubjectId;
  grade: Grade;
  questions: number;
  minutes: number;
  points: number;
  maxScore: number;
  passScore: number;
  position: number;
  showBoard: boolean;
  locked: boolean;
  /** Tên bài phải đạt trước. */
  lockedBy?: string;
  attempts: number;
  best?: OnThiBest;
  inProgress?: { attemptId: string; deadlineAt: string };
}

export interface OnThiSavedAnswer {
  response: AnyResponse | null;
  ms: number;
}

export interface OnThiSession {
  attemptId: string;
  setId: string;
  style: OnThiStyle;
  title: string;
  minutes: number;
  points: number;
  maxScore: number;
  passScore: number;
  startedAt: string;
  deadlineAt: string;
  serverNow: string;
  /** Ở chế độ Supabase không có đáp án. */
  items: Item[];
  answers: Record<string, OnThiSavedAnswer>;
}

export interface OnThiItemResult {
  itemId: string;
  type: ItemType;
  answered: boolean;
  correct: boolean;
  earned: number;
  points: number;
  ms: number;
}

export interface OnThiResult {
  attemptId: string;
  setId: string;
  style: OnThiStyle;
  title: string;
  score: number;
  maxScore: number;
  passScore: number;
  passed: boolean;
  correct: number;
  wrong: number;
  skipped: number;
  durationMs: number;
  submittedAt: string;
  items: OnThiItemResult[];
  /** Câu trả lời của em (để xem lại). */
  responses: Record<string, AnyResponse | null>;
  /** Đáp án (itemId → key) khi bài cho xem đáp án. */
  keys?: Record<string, unknown>;
  /** Điểm cao nhất của em ở bài này (gồm lần này) và lần này có phải cao nhất mới không. */
  best: number;
  newBest: boolean;
}

export interface OnThiBoardRow {
  rank: number;
  studentId: string;
  name: string;
  className?: string;
  mascot?: string;
  color?: string;
  score: number;
  durationMs: number;
  wrong: number;
}

export interface OnThiBoard {
  setId: string;
  /** Số bạn đã có điểm. */
  total: number;
  rows: OnThiBoardRow[];
  me?: OnThiBoardRow | null;
  /** Thầy/cô tắt bảng xếp hạng. */
  hidden?: boolean;
}

export interface OnThiReportRow {
  studentId: string;
  name: string;
  classId?: string;
  className?: string;
  attempts: number;
  best?: OnThiBest;
}

export interface OnThiReport {
  set: OnThiSet;
  /** Học sinh trong phạm vi thầy/cô được xem (người tạo bài / quản trị: cả khối; thầy/cô khác: lớp mình). */
  students: OnThiReportRow[];
  /** Theo câu: số lượt làm và số lượt đúng (lấy lần làm tốt nhất của mỗi em). */
  items: { itemId: string; type: ItemType; tried: number; correct: number }[];
}

export interface OnThiService {
  /* Thầy/cô */
  listSets(filter?: { style?: OnThiStyle; grade?: Grade }): Promise<OnThiSet[]>;
  saveSet(input: OnThiSetInput): Promise<OnThiSet>;
  deleteSet(id: string): Promise<void>;
  report(setId: string): Promise<OnThiReport>;
  /* Học sinh */
  myCards(style: OnThiStyle): Promise<OnThiCard[]>;
  start(setId: string): Promise<OnThiSession>;
  saveAnswer(attemptId: string, itemId: string, answer: OnThiSavedAnswer): Promise<void>;
  submit(attemptId: string): Promise<OnThiResult>;
  result(attemptId: string): Promise<OnThiResult>;
  board(setId: string): Promise<OnThiBoard>;
  /** Số câu có thể luyện theo từng dạng (từ các bài luyện đã mở cho khối của em). */
  practiceTypes(style: OnThiStyle): Promise<{ type: ItemType; count: number }[]>;
  /** Tối đa ONTHI_PRACTICE_SIZE câu ngẫu nhiên của một dạng. Chấm từng câu bằng submitAnswer như bài luyện tập. */
  practiceItems(style: OnThiStyle, type: ItemType): Promise<Item[]>;
}
