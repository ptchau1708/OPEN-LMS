/**
 * Đấu 1–1 (Đấu trường): hai HS cùng lớp (hoặc HS với "bạn Robo") trả lời cùng 7 câu, cùng thứ tự.
 * Giao thức kênh (DuelWire) giống nhau ở demo (BroadcastChannel giữa các tab) và Supabase (Realtime `duel:{id}`).
 * Ở Supabase, điểm cuối cùng do server tính từ câu trả lời đã chấm ở Edge Function `grade` (context.duelId).
 */
import type { AnyResponse, Grade, Item } from './items';
import type { MascotId } from './mascots';
import type { SubjectId } from './subjects';
import type { AwardResult } from './data';

export const DUEL_QUESTIONS = 7;
export const DUEL_SECONDS = 20;
/** Không nghe thấy bạn trong 20 giây → thắng do bạn rời trận. */
export const DUEL_FORFEIT_MS = 20_000;
/** Chờ ghép bạn tối đa ~15 giây rồi mời đấu với bạn Robo. */
export const DUEL_MATCH_WAIT_MS = 15_000;
/** Số trận được cộng sao mỗi ngày (chống "cày" sao). */
export const DUEL_DAILY_REWARDED = 5;
export const DUEL_STARS_PLAY = 1;
export const DUEL_STARS_WIN = 2;
export const DUEL_REACTIONS = ['👏', '😮', '💪'] as const;
export type DuelReaction = (typeof DUEL_REACTIONS)[number];
export const DUEL_BOT_ID = 'bot-robo';

export interface DuelPlayer {
  userId: string;
  name: string;
  mascot: MascotId;
  color: string;
  isBot?: boolean;
}

export type DuelStatus = 'waiting' | 'playing' | 'finished' | 'cancelled';
export type DuelMode = 'queue' | 'code' | 'challenge' | 'bot';

/** Kế hoạch trả lời của bạn Robo cho từng câu (sinh trước, ở Supabase do server sinh). */
export interface DuelBotStep {
  correct: boolean;
  ms: number;
}

export interface DuelInfo {
  id: string;
  /** Mã phòng 4 chữ số. */
  code: string;
  mode: DuelMode;
  classId?: string;
  subject: SubjectId;
  grade: Grade;
  /** players[0] là chủ phòng (điều khiển nhịp câu hỏi). */
  players: DuelPlayer[];
  itemIds: string[];
  seed: number;
  botPlan?: DuelBotStep[];
  status: DuelStatus;
  createdAt: string;
}

/** Kết quả một câu của một người (không bao giờ chứa lựa chọn). */
export interface DuelAnswerReport {
  q: number;
  correct: boolean;
  points: number;
  ms: number;
  timedOut?: boolean;
}

export type DuelWire =
  | { t: 'hello'; from: string; player: DuelPlayer }
  | { t: 'ping'; from: string; q: number; answers: DuelAnswerReport[] }
  | { t: 'round'; from: string; q: number }
  | { t: 'answered'; from: string; report: DuelAnswerReport }
  | { t: 'react'; from: string; emoji: DuelReaction }
  | { t: 'end'; from: string }
  | { t: 'leave'; from: string }
  | { t: 'rematch'; from: string; duel?: DuelInfo };

/** Kênh hai chiều của một trận (không gửi lại cho chính mình). */
export interface DuelTransport {
  send(msg: DuelWire): void;
  subscribe(h: (msg: DuelWire) => void): () => void;
  close(): void;
}

export type DuelOutcome = 'win' | 'draw' | 'lose';

export interface DuelResult {
  duelId: string;
  scores: Record<string, number>;
  correct: Record<string, number>;
  winner: string | null;
  outcome: DuelOutcome;
  /** Người rời trận (thua do bỏ cuộc). */
  forfeitBy?: string;
  starsAwarded: number;
  /** Đã đủ số trận được cộng sao hôm nay. */
  capped: boolean;
  award?: AwardResult;
}

export interface DuelStats {
  userId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** 0..1 */
  winRate: number;
}

export interface DuelInvite {
  duelId: string;
  code: string;
  from: DuelPlayer;
  subject: SubjectId;
}

export interface DuelSeekOptions {
  me: DuelPlayer;
  classId?: string;
  grade: Grade;
  subject: SubjectId;
}

/** Sảnh chờ: ghép cặp, phòng mã 4 số, thách đấu bạn cùng lớp. */
export interface DuelLobby {
  /** "Tìm bạn": trả về khi đã có bạn vào trận. */
  seek(signal?: AbortSignal): Promise<DuelInfo>;
  /** Mở phòng có mã; `invitee` = thách đấu một bạn cụ thể. `ready` trả về khi bạn vào. */
  host(invitee?: string, signal?: AbortSignal): Promise<{ duel: DuelInfo; ready: Promise<DuelInfo> }>;
  join(code: string): Promise<DuelInfo>;
  bot(): Promise<DuelInfo>;
  /** Bạn cùng lớp đang mở Đấu 1–1. */
  online(): DuelPlayer[];
  onChange(h: () => void): () => void;
  onInvite(h: (inv: DuelInvite) => void): () => void;
  declineInvite(inv: DuelInvite): void;
  cancel(duelId?: string): Promise<void>;
  close(): void;
}

export interface DuelGradeInput {
  duel: DuelInfo;
  q: number;
  item: Item;
  response: AnyResponse;
  ms: number;
}

export interface DuelService {
  readonly mode: 'demo' | 'supabase';
  openLobby(opts: DuelSeekOptions): DuelLobby;
  openChannel(duel: DuelInfo, meId: string): DuelTransport;
  /** Chấm một câu (Supabase: Edge Function `grade` với context.duelId — server chấm và ghi). */
  grade(input: DuelGradeInput & { userId: string }): Promise<DuelAnswerReport>;
  /** Em để hết giờ một câu (Supabase: ghi 0 điểm để server biết em đã xong câu đó). */
  skip(input: { userId: string; duel: DuelInfo; q: number }): Promise<void>;
  /** Kết thúc: tính thắng/thua, cộng sao (tham gia 1, thắng +2, giới hạn theo ngày). */
  finish(duel: DuelInfo, meId: string, local: { answers: Record<string, DuelAnswerReport[]>; forfeitBy?: string }): Promise<DuelResult>;
  getStats(userId: string): Promise<DuelStats>;
}
