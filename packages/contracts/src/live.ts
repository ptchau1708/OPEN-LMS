import type { AnyResponse, Item } from './items';
import type { Lesson } from './lessons';
import type { MascotId } from './mascots';

export type LivePhase = 'lobby' | 'slide' | 'activity-open' | 'activity-closed' | 'reveal' | 'ended';

export interface LiveTeam {
  id: string;
  name: string;
  color: string;
  stars: number;
}

export interface LiveParticipant {
  userId: string;
  name: string;
  mascot: MascotId;
  color: string;
  teamId?: string;
}

/** Trạng thái phiên — nguồn chuẩn khi vào lại sau rớt mạng. */
export interface LiveState {
  sessionId: string;
  /** Mã 6 chữ số. */
  pin: string;
  lessonId: string;
  /** Ở chế độ demo (relay), bài giảng gửi kèm để máy HS và TV không cần tải riêng. */
  lesson?: Lesson;
  /**
   * Ở chế độ demo (relay): item của các slide hoạt động, gửi kèm để máy HS và TV hiển thị và tự chấm.
   * Chế độ demo không bảo mật đáp án — ở chế độ Supabase trường này bỏ trống, máy HS tải item không có key.
   */
  items?: Record<string, Item>;
  slideIndex: number;
  phase: LivePhase;
  /** Item đang mở (slide activity). */
  activeItemId?: string;
  /** Thời điểm hết giờ (ISO) khi mở hoạt động có đếm ngược. */
  timerEndsAt?: string;
  /** Khóa màn hình HS: "Nhìn lên bảng nhé!". */
  locked: boolean;
  /** Chế độ đội (tổ) để thi đua; rỗng = cá nhân. */
  teams: LiveTeam[];
  participants: LiveParticipant[];
  /** Sao theo học sinh trong phiên. */
  studentStars: Record<string, number>;
  /** Chế độ thi đua (đố vui kiểu Kahoot / Quizizz / thẻ giấy). Không có = lớp học trực tiếp thường. */
  game?: LiveGame;
  updatedAt: string;
}

/**
 * class: cả lớp cùng câu, GV bấm câu tiếp (kiểu Kahoot) · self: mỗi em tự làm theo nhịp riêng, bảng xếp hạng chạy trực tiếp
 * (kiểu Quizizz) · paper: HS giơ thẻ giấy A/B/C/D, GV quét bằng camera điện thoại (kiểu Quizizz Paper mode / Plickers).
 */
export type LiveGameMode = 'class' | 'self' | 'paper';

/** Một học sinh dùng thẻ giấy số `card`. */
export interface LivePaperCard {
  card: number;
  userId: string;
  name: string;
}

export interface LiveGame {
  mode: LiveGameMode;
  /** Giây mỗi câu (class, paper); 0 = không đếm ngược. Với self: thời gian tính điểm tốc độ mỗi câu. */
  seconds: number;
  /** Điểm thi đua theo học sinh (đúng + nhanh + chuỗi). */
  points: Record<string, number>;
  /** Số câu đúng. */
  correct: Record<string, number>;
  /** Số câu đã trả lời. */
  answered: Record<string, number>;
  /** Chuỗi đúng liên tiếp hiện tại. */
  streak: Record<string, number>;
  /** self: các câu (slideIndex) đã tính điểm của từng em. */
  done?: Record<string, number[]>;
  /** slideIndex của các câu đã tính điểm (class, paper). */
  tallied: number[];
  /** Điểm cộng ở câu vừa tính (để TV hiện "+850"). */
  lastGain?: Record<string, number>;
  /** Thời điểm mở câu hiện tại (máy GV). */
  openedAt?: string;
  /** TV đang hiện bảng xếp hạng. */
  board?: boolean;
  /** self: đã bắt đầu / thời điểm hết giờ cả bài (ISO, tuỳ chọn). */
  startedAt?: string;
  endsAt?: string;
  /** paper: thẻ của từng HS. */
  cards?: LivePaperCard[];
  /** paper: câu trả lời quét được theo câu: slideIndex → userId → 'A' | 'B' | 'C' | 'D'. */
  paper?: Record<string, Record<string, string>>;
}

/** Điểm thêm khi tính một câu. */
export interface LiveGain {
  userId: string;
  points: number;
  correct: boolean;
  /** false = không trả lời (vẫn mất chuỗi). */
  answered?: boolean;
  /** Chế độ self: câu của em này (bỏ qua nếu đã tính). */
  slideIndex?: number;
}

export type LiveCommand =
  | { type: 'go'; slideIndex: number }
  | { type: 'open'; itemId: string; seconds?: number }
  | { type: 'close' }
  | { type: 'reveal' }
  | { type: 'lock'; locked: boolean }
  | { type: 'award'; target: { kind: 'team' | 'student'; id: string }; stars: number }
  | { type: 'set-teams'; teams: LiveTeam[] }
  | { type: 'assign-team'; userId: string; teamId: string }
  | { type: 'end' }
  /* ---- thi đua ---- */
  | { type: 'game-setup'; game: Pick<LiveGame, 'mode' | 'seconds'> & { cards?: LivePaperCard[] } }
  | { type: 'game-tally'; slideIndex?: number; gains: LiveGain[] }
  | { type: 'game-board'; show: boolean }
  | { type: 'game-start'; endsAt?: string }
  | { type: 'paper-answer'; slideIndex: number; answers: Record<string, string | null> };

export interface LiveResponse {
  sessionId: string;
  userId: string;
  itemId: string;
  slideIndex: number;
  response: AnyResponse;
  correct?: boolean;
  score?: number;
  at: string;
}

/** Tin nhận được trên kênh. */
export type LiveMessage =
  | { kind: 'state'; state: LiveState }
  | { kind: 'response'; response: LiveResponse }
  | { kind: 'presence'; participants: LiveParticipant[] };

export type LiveRole = 'teacher' | 'screen' | 'student';

/**
 * Kênh trực tiếp. Hai bản cài đặt trong packages/data:
 * - RelayLiveChannel: WebSocket tới tools/live-relay (demo, chạy được trong mạng LAN của lớp).
 * - SupabaseLiveChannel: Supabase Realtime (broadcast + presence) + RPC ghi câu trả lời.
 */
export interface LiveChannel {
  readonly sessionId: string;
  readonly role: LiveRole;
  getState(): LiveState | null;
  subscribe(handler: (msg: LiveMessage) => void): () => void;
  /** Chỉ GV gửi lệnh. */
  send(cmd: LiveCommand): Promise<void>;
  /** HS vào phòng. */
  join(p: LiveParticipant): Promise<void>;
  /** HS gửi câu trả lời; server/relay chấm nếu có key. */
  respond(r: Omit<LiveResponse, 'at' | 'correct' | 'score'>): Promise<{ correct?: boolean; score?: number }>;
  /** Danh sách câu trả lời của slide hiện tại (GV, TV). */
  responses(slideIndex: number): LiveResponse[];
  close(): void;
}

export interface LiveSessionInfo {
  sessionId: string;
  pin: string;
  lessonId: string;
  lessonTitle: string;
}

/** Item đang mở, kèm theo trạng thái — tiện cho TV/HS. */
export interface LiveActiveItem {
  item: Item;
  slideIndex: number;
}
