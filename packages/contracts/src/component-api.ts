/**
 * Hợp đồng giao diện giữa các gói React. Các gói cài đặt đúng chữ ký này để app dùng chung.
 * - @openedu/activity-engine: ActivityView, scoreItem, isComplete, emptyResponse
 * - @openedu/lesson-player: SelfPacedPlayer, LiveStudentView, BigScreenSlide, PackageHost
 */
import type { AnyResponse, Item, ScoreResult } from './items';
import type { ContentPackage, Lesson, LessonProgress, Slide } from './lessons';
import type { LiveChannel, LiveResponse, LiveState } from './live';
import type { StudentSettings } from './users';

export type ActivityMode = 'player' | 'bigscreen';

export interface ActivityViewProps {
  item: Item;
  value?: AnyResponse;
  onChange: (value: AnyResponse) => void;
  /** Khóa thao tác (đã nộp, hết giờ, GV khóa). */
  disabled?: boolean;
  /** Hiện đáp án đúng/sai (cần item.key). */
  reveal?: boolean;
  /** Kết quả chấm để tô màu từng phần khi reveal. */
  result?: ScoreResult;
  /** 'player' cho máy HS; 'bigscreen' cho TV (chữ to, cả lớp lên bảng chạm). */
  mode?: ActivityMode;
  /** Chữ to cho lớp 1–2. */
  bigText?: boolean;
}

/** Callback khi học sinh trả lời một slide hoạt động trong lúc tự học. */
export interface AnswerEvent {
  slide: Slide;
  item: Item;
  response: AnyResponse;
  result: ScoreResult;
  attempts: number;
  durationMs: number;
}

export interface SelfPacedPlayerProps {
  lesson: Lesson;
  /** item theo id cho các slide dùng itemId. */
  items: Record<string, Item>;
  packages?: Record<string, ContentPackage>;
  progress?: LessonProgress | null;
  settings?: Partial<StudentSettings>;
  onProgress?: (p: { slideIndex: number; completedSlideIds: string[] }) => void;
  onAnswer?: (e: AnswerEvent) => void;
  /** Gọi khi xem tới slide cuối; app cộng thưởng và hiện màn chúc mừng. */
  onComplete?: (summary: { correct: number; total: number; stars: number }) => void;
  onExit?: () => void;
  /** Đang mất mạng: câu có chấm nhưng máy không có đáp án → "Đã lưu — sẽ chấm khi có mạng" (không hiện sao ngay). */
  pendingFeedback?: boolean;
  /**
   * Xin gợi ý từng bước khi em làm chưa đúng (không lộ đáp án — app gọi DataSource.getHint). Có → hiện nút "Gợi ý cho em".
   * `attempt` là mức gợi ý 1..3. Chỉ dùng cho tự học; không truyền trong bài kiểm tra, lớp trực tiếp, thi đấu.
   */
  onHint?: (req: { item: Item; response: AnyResponse; attempt: number }) => Promise<{ text: string }>;
}

export interface LiveStudentViewProps {
  channel: LiveChannel;
  items: Record<string, Item>;
  me: { userId: string; name: string };
  settings?: Partial<StudentSettings>;
}

export interface BigScreenSlideProps {
  slide: Slide;
  items: Record<string, Item>;
  state: LiveState;
  responses: LiveResponse[];
  packages?: Record<string, ContentPackage>;
}

export interface PackageHostProps {
  pkg: ContentPackage;
  /** Origin được phép gửi postMessage (origin nội dung). Mặc định lấy từ pkg.baseUrl. */
  allowedOrigin?: string;
  onResult?: (r: { score?: number; completed?: boolean; raw?: unknown }) => void;
  height?: number | string;
}

export type ScoreFn = (item: Item, response: AnyResponse | undefined) => ScoreResult;
