/**
 * Hoạt động (item) — đơn vị nội dung dùng chung cho bài giảng, luyện tập, kiểm tra, Đấu trường và màn hình TV.
 * Mỗi dạng có: payload (nội dung hiển thị), key (đáp án — KHÔNG gửi xuống máy học sinh ở chế độ Supabase),
 * response (câu trả lời học sinh). Thêm dạng mới = thêm một nhánh ở đây + một thư mục trong activity-engine.
 */
import type { SubjectId } from './subjects';

export type Grade = 1 | 2 | 3 | 4 | 5;

export type ItemType =
  | 'MCQ'
  | 'MCQ_MULTIPLE'
  | 'MATCHING'
  | 'ORDERING'
  | 'DRAG_DROP'
  | 'SHORT_ANSWER'
  | 'SENTENCE_SCRAMBLE'
  | 'WORD_CLASSIFY'
  | 'FILL_IN_PASSAGE'
  | 'INLINE_DROPDOWN'
  | 'LISTEN_CHOOSE'
  | 'HOTSPOT'
  | 'DRAW'
  | 'RECORD_READ'
  | 'MATH_MANIPULATIVE'
  | 'POLL'
  | 'TRUE_FALSE_MULTI';

/** Một lựa chọn / thẻ / từ. `image` là URL hoặc "emoji:🐟" (hiển thị emoji cỡ lớn). */
export interface Choice {
  id: string;
  text?: string;
  image?: string;
  /** Câu đọc to khi chạm vào lựa chọn (lớp 1–2). Mặc định đọc `text`. */
  speak?: string;
  /**
   * Mã quan niệm sai (MISCONCEPTIONS trong skills-misconceptions.ts) khi HS chọn lựa chọn SAI này, vd 'CONG-TU-CONG-MAU'.
   * Ở chế độ Supabase, client chuyển trường này sang `key.misconceptions` khi lưu (không lộ đáp án cho HS).
   */
  misconception?: string;
}

/** Đề bài chung cho mọi dạng. */
export interface Prompt {
  text: string;
  image?: string;
  /** URL âm thanh sinh sẵn (TTS ở server). Nếu không có, dùng `speak` hoặc `text` với giọng của trình duyệt. */
  audio?: string;
  /** Câu cho máy đọc to (mặc định = text). Với LISTEN_CHOOSE đây là nội dung phải nghe. */
  speak?: string;
  /** Ngôn ngữ đọc to, mặc định 'vi-VN'. Tiếng Anh dùng 'en-US'. */
  lang?: 'vi-VN' | 'en-US';
}

export interface HotspotRegion {
  id: string;
  shape: 'circle' | 'rect';
  /** Toạ độ theo % chiều rộng/cao ảnh (0–100). circle: x,y là tâm, r theo % chiều rộng. rect: x,y góc trái trên, w,h. */
  x: number;
  y: number;
  r?: number;
  w?: number;
  h?: number;
  label?: string;
}

export type ManipulativeKind = 'sticks' | 'clock';

/* ---------- payload theo dạng ---------- */
export interface PayloadMap {
  MCQ: { options: Choice[]; columns?: 1 | 2 | 4 };
  MCQ_MULTIPLE: { options: Choice[]; columns?: 1 | 2 | 4 };
  MATCHING: { left: Choice[]; right: Choice[] };
  ORDERING: { items: Choice[]; direction?: 'horizontal' | 'vertical' };
  DRAG_DROP: { tokens: Choice[]; zones: { id: string; label: string; image?: string }[] };
  SHORT_ANSWER: { placeholder?: string; inputMode?: 'text' | 'numeric'; unit?: string };
  SENTENCE_SCRAMBLE: { words: Choice[] };
  /**
   * distractors: có thẻ nhiễu (thẻ không thuộc nhóm nào — key.placement không có id đó). HS để thẻ nhiễu ở lại khay;
   * không bắt buộc xếp hết thẻ mới được nộp.
   */
  WORD_CLASSIFY: { words: Choice[]; groups: { id: string; label: string; color?: string }[]; distractors?: boolean };
  /** passage chứa chỗ trống dạng {{b1}}. bank: kho từ để kéo vào (nếu có); không có bank thì học sinh gõ. */
  FILL_IN_PASSAGE: { passage: string; bank?: Choice[] };
  /** passage chứa {{d1}}; mỗi ô là một danh sách chọn. */
  INLINE_DROPDOWN: { passage: string; dropdowns: Record<string, Choice[]> };
  LISTEN_CHOOSE: { options: Choice[]; columns?: 1 | 2 | 4 };
  HOTSPOT: { image: string; aspect: number; regions: HotspotRegion[]; multiple?: boolean };
  DRAW: { background?: string; colors?: string[] };
  RECORD_READ: { text: string; maxSeconds: number };
  /**
   * sticks: que tính. operands + op tạo phép tính (vd [26,7] '+'); học sinh gộp/tách bó chục rồi chọn hoặc nhập kết quả.
   * clock: đồng hồ kim; học sinh kéo kim. Giá trị trả lời = số phút kể từ 0:00 (0–719).
   */
  MATH_MANIPULATIVE:
    | { kind: 'sticks'; operands: number[]; op: '+' | '-'; choices?: number[] }
    | { kind: 'clock'; showDigital?: boolean };
  POLL: { options: Choice[] };
  /** 2–6 nhận định; với mỗi nhận định HS chọn Đúng hoặc Sai. */
  TRUE_FALSE_MULTI: { statements: Choice[] };
}

/* ---------- đáp án theo dạng ---------- */
/**
 * Phần mở rộng chung của đáp án: câu trả lời SAI → mã quan niệm sai. Khóa theo dạng:
 * MCQ / MCQ_MULTIPLE / LISTEN_CHOOSE: id lựa chọn · SHORT_ANSWER: câu trả lời (so sánh sau chuẩn hoá, số "0,5" = "0.5") ·
 * MATH_MANIPULATIVE: String(value) · ORDERING / SENTENCE_SCRAMBLE: các id nối bằng "," ·
 * DRAG_DROP / WORD_CLASSIFY: "<idThẻ>><idÔ>" · FILL_IN_PASSAGE / INLINE_DROPDOWN: "<idChỗTrống>=<giá trị>" ·
 * MATCHING: "<idTrái>><idPhải>" · HOTSPOT: id vùng.
 */
export interface KeyExtras {
  misconceptions?: Record<string, string>;
}

export interface KeyMap {
  MCQ: { correct: string } & KeyExtras;
  MCQ_MULTIPLE: { correct: string[] } & KeyExtras;
  MATCHING: { pairs: Record<string, string> } & KeyExtras;
  ORDERING: { order: string[] } & KeyExtras;
  DRAG_DROP: { placement: Record<string, string> } & KeyExtras;
  SHORT_ANSWER: { accepted: string[]; caseSensitive?: boolean } & KeyExtras;
  SENTENCE_SCRAMBLE: { order: string[] } & KeyExtras;
  WORD_CLASSIFY: { placement: Record<string, string> } & KeyExtras;
  FILL_IN_PASSAGE: { blanks: Record<string, string[]> } & KeyExtras;
  INLINE_DROPDOWN: { blanks: Record<string, string> } & KeyExtras;
  LISTEN_CHOOSE: { correct: string } & KeyExtras;
  HOTSPOT: { correct: string[] } & KeyExtras;
  DRAW: null;
  RECORD_READ: null;
  MATH_MANIPULATIVE: { value: number } & KeyExtras;
  POLL: null;
  /** id nhận định → true (Đúng) / false (Sai). */
  TRUE_FALSE_MULTI: { truth: Record<string, boolean> } & KeyExtras;
}

/* ---------- câu trả lời theo dạng ---------- */
export interface ResponseMap {
  MCQ: { choice: string };
  MCQ_MULTIPLE: { choices: string[] };
  MATCHING: { pairs: Record<string, string> };
  ORDERING: { order: string[] };
  DRAG_DROP: { placement: Record<string, string> };
  SHORT_ANSWER: { text: string };
  SENTENCE_SCRAMBLE: { order: string[] };
  WORD_CLASSIFY: { placement: Record<string, string> };
  FILL_IN_PASSAGE: { blanks: Record<string, string> };
  INLINE_DROPDOWN: { blanks: Record<string, string> };
  LISTEN_CHOOSE: { choice: string };
  HOTSPOT: { regions: string[] };
  DRAW: { dataUrl: string };
  RECORD_READ: { audioUrl?: string; durationSec: number };
  MATH_MANIPULATIVE: { value: number };
  POLL: { choice: string };
  TRUE_FALSE_MULTI: { picks: Record<string, boolean> };
}

export interface ItemBase<T extends ItemType = ItemType> {
  id: string;
  type: T;
  grade: Grade;
  subject: SubjectId;
  /** Mô tả kĩ năng dạng chữ tự do (cũ, giữ để tương thích). Dùng `skills` cho mã chuẩn. */
  skill?: string;
  /** Mã yêu cầu cần đạt trong danh mục SKILLS (vd 'T4.PS.RUT-GON'). Mục đầu tiên là kĩ năng chính. */
  skills?: string[];
  difficulty?: 'nhan-biet' | 'ket-noi' | 'van-dung';
  prompt: Prompt;
  payload: PayloadMap[T];
  /** Có ở chế độ demo và ở phía GV. Ở chế độ Supabase, máy HS nhận item không có key. */
  key?: KeyMap[T];
  hint?: string;
  explanation?: string;
  /** Sao thưởng khi đúng, mặc định 1. */
  stars?: number;
  tags?: string[];
  updatedAt?: string;
}

export type Item = { [K in ItemType]: ItemBase<K> }[ItemType];
export type ItemOf<T extends ItemType> = ItemBase<T>;
export type ResponseOf<T extends ItemType> = ResponseMap[T];
export type AnyResponse = ResponseMap[ItemType];

export interface ScoreResult {
  /** false với DRAW, RECORD_READ, POLL (không chấm). */
  graded: boolean;
  correct: boolean;
  /** 0..1, có điểm từng phần với MATCHING, DRAG_DROP, FILL_IN_PASSAGE… */
  score: number;
  /** Đúng/sai theo từng phần (id lựa chọn, id ô trống, id thẻ) để tô màu khi hiện đáp án. */
  parts?: Record<string, boolean>;
}

export interface ActivityMeta {
  type: ItemType;
  label: string;
  /** Mô tả ngắn cho GV. */
  description: string;
  graded: boolean;
  /** true = dạng mới thêm cho tiểu học trong OPEN-EDU. */
  isNew: boolean;
}

export const ACTIVITY_TYPES: ActivityMeta[] = [
  { type: 'MCQ', label: 'Chọn 1 đáp án', description: 'Chạm vào một đáp án đúng.', graded: true, isNew: false },
  { type: 'MCQ_MULTIPLE', label: 'Chọn nhiều đáp án', description: 'Chạm vào tất cả đáp án đúng.', graded: true, isNew: false },
  { type: 'MATCHING', label: 'Nối cặp', description: 'Nối mỗi thẻ bên trái với thẻ hợp bên phải.', graded: true, isNew: false },
  { type: 'ORDERING', label: 'Sắp xếp thứ tự', description: 'Kéo các thẻ theo đúng thứ tự.', graded: true, isNew: false },
  { type: 'DRAG_DROP', label: 'Kéo thả vào ô', description: 'Kéo thẻ vào đúng ô.', graded: true, isNew: false },
  { type: 'SHORT_ANSWER', label: 'Điền ngắn', description: 'Gõ số hoặc từ.', graded: true, isNew: false },
  { type: 'SENTENCE_SCRAMBLE', label: 'Sắp xếp câu', description: 'Xếp các từ thành câu đúng.', graded: true, isNew: false },
  { type: 'WORD_CLASSIFY', label: 'Phân loại từ', description: 'Đưa từ vào đúng nhóm.', graded: true, isNew: false },
  { type: 'FILL_IN_PASSAGE', label: 'Điền vào đoạn văn', description: 'Điền từ vào chỗ trống trong đoạn.', graded: true, isNew: false },
  { type: 'INLINE_DROPDOWN', label: 'Chọn trong câu', description: 'Chọn từ đúng ngay trong câu.', graded: true, isNew: false },
  { type: 'LISTEN_CHOOSE', label: 'Nghe và chọn', description: 'Nghe máy đọc rồi chọn đáp án — cho lớp 1–2.', graded: true, isNew: true },
  { type: 'HOTSPOT', label: 'Chạm vào hình', description: 'Chạm đúng vùng trên tranh.', graded: true, isNew: true },
  { type: 'DRAW', label: 'Vẽ và tô', description: 'Vẽ, tô màu rồi nộp hình; GV xem.', graded: false, isNew: true },
  { type: 'RECORD_READ', label: 'Ghi âm đọc to', description: 'Đọc to đoạn văn, ghi âm gửi GV nghe.', graded: false, isNew: true },
  { type: 'MATH_MANIPULATIVE', label: 'Đồ dùng toán', description: 'Que tính, đồng hồ kim.', graded: true, isNew: true },
  { type: 'POLL', label: 'Thăm dò ý kiến', description: 'Không chấm; cả lớp cùng chọn khi trình chiếu.', graded: false, isNew: true },
  { type: 'TRUE_FALSE_MULTI', label: 'Đúng – Sai nhiều ý', description: 'Mỗi nhận định chọn Đúng hoặc Sai (2–6 ý).', graded: true, isNew: true },
];
