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
  updatedAt: string;
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
  | { type: 'end' };

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
