/**
 * Đấu trường (SQL 22): cài đặt của lớp cho phần chơi tự do, giải đấu loại trực tiếp, bảng xếp hạng theo mùa.
 */
import type { Grade, Item } from './items';
import type { MascotId } from './mascots';
import type { SubjectId } from './subjects';
import type { DuelInfo } from './duel';

export type ArenaScope = 'class' | 'grade';
export type ArenaSource = 'auto' | 'picked';
export type ArenaMode = 'duel' | 'tower';

/** Khung giờ mở cửa (giờ Việt Nam). days: 1 = thứ Hai … 7 = Chủ nhật. */
export interface ArenaHours {
  days: number[];
  /** 'HH:MM' */
  from: string;
  /** 'HH:MM' (có thể '24:00') */
  to: string;
}

export interface ArenaSettings {
  classId: string;
  enabled: boolean;
  /** Đấu 1–1 tự do: ghép với bạn trong lớp, hay cả khối. */
  scope: ArenaScope;
  /** Câu hỏi: tự động theo môn / khối, hay chỉ câu GV đã đưa vào Đấu trường. */
  source: ArenaSource;
  itemIds: string[];
  /** Rỗng = luôn mở. */
  hours: ArenaHours[];
  modes: ArenaMode[];
  seasonTitle?: string;
  /** Không có = tính từ đầu. */
  seasonStart?: string;
  updatedAt?: string;
}

export const DEFAULT_ARENA_SETTINGS: Omit<ArenaSettings, 'classId'> = {
  enabled: true, scope: 'class', source: 'auto', itemIds: [], hours: [], modes: ['duel', 'tower'],
};

export interface ArenaAccess {
  open: boolean;
  /** off = GV tắt · hours = ngoài giờ mở cửa */
  reason?: 'off' | 'hours';
  settings: ArenaSettings;
}

/* ---------------- Giải đấu loại trực tiếp ---------------- */
export type CupStatus = 'signup' | 'running' | 'finished' | 'cancelled';
export type CupSeeding = 'random' | 'mastery';
export type CupEntry = 'all' | 'signup';
export type CupPace = 'continuous' | 'daily';
export type CupDecision = 'play' | 'bye' | 'walkover' | 'seed' | 'teacher';

export interface CupInput {
  title: string;
  scope: ArenaScope;
  /** Lớp của giải (phạm vi khối: khối của lớp này). */
  classId: string;
  subject: SubjectId;
  source: ArenaSource;
  itemIds: string[];
  /** Số câu mỗi trận (3–10). */
  questions: number;
  seeding: CupSeeding;
  entry: CupEntry;
  /** ISO; trống = bắt đầu ngay. */
  startAt?: string;
  /** Thời gian mỗi vòng (phút, 2–1440). */
  roundMinutes: number;
  pace: CupPace;
}

export interface CupPlayer {
  userId: string;
  name: string;
  mascot: MascotId;
  color: string;
  classId?: string;
  className?: string;
  seed?: number;
  /** Vòng bị loại (không có = còn trong giải / vô địch). */
  outRound?: number;
}

export interface CupMatchResult {
  answered: number;
  correct: number;
  points: number;
  ms: number;
}

export interface CupMatch {
  round: number;
  slot: number;
  p1?: string;
  p2?: string;
  winner?: string;
  status: 'open' | 'done';
  decidedBy?: CupDecision;
  opensAt?: string;
  closesAt?: string;
  decidedAt?: string;
  /** Chỉ khi đã có kết quả. */
  result?: Record<string, CupMatchResult>;
  /** Trận đang mở: các bạn đã đấu xong. */
  done?: string[];
}

export interface Cup {
  id: string;
  title: string;
  scope: ArenaScope;
  classId?: string;
  className?: string;
  grade: Grade;
  subject: SubjectId;
  source: ArenaSource;
  /** Chỉ GV mở giải thấy. */
  itemIds?: string[];
  itemCount: number;
  questions: number;
  seeding: CupSeeding;
  entry: CupEntry;
  startAt: string;
  roundMinutes: number;
  pace: CupPace;
  status: CupStatus;
  /** Vòng hiện tại (0 = chưa bắt đầu). */
  round: number;
  /** Tổng số vòng. */
  rounds: number;
  champion?: string;
  runnerUp?: string;
  thirds: string[];
  note?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  players: CupPlayer[];
  matches: CupMatch[];
  me: { host: boolean; eligible: boolean; joined: boolean };
}

/** Trận của em ở vòng hiện tại (để vào đấu). */
export interface CupPlay {
  cupId: string;
  round: number;
  slot: number;
  closesAt?: string;
  opponent: CupPlayer;
  duel: DuelInfo;
  items: Item[];
  answered: { q: number; correct: boolean; points: number; ms: number }[];
}

/* ---------------- Bảng xếp hạng theo mùa ---------------- */
export interface ArenaRankRow {
  userId: string;
  name: string;
  mascot: MascotId;
  color: string;
  points: number;
  wins: number;
  played: number;
  rank: number;
}

export interface ArenaBoard {
  classId?: string;
  seasonTitle?: string;
  seasonStart?: string;
  /** Số HS của lớp. */
  total: number;
  /** GV: cả lớp. HS: top 10 (chỉ bạn có điểm). */
  rows: ArenaRankRow[];
  /** HS: vị trí của em. */
  me?: ArenaRankRow;
}

export interface ArenaSeason {
  id: string;
  classId: string;
  title: string;
  startedAt?: string;
  endedAt: string;
  top: ArenaRankRow[];
}

/** Điểm xếp hạng (giống SQL 22 v2._arena_points). */
export const ARENA_POINTS = {
  duelWin: 3, duelDraw: 1, botWin: 1, duelPerDay: 5,
  cupWin: 3, champion: 10, runnerUp: 6, third: 4,
} as const;
/** Sao thưởng giải đấu (giống SQL 22). */
export const CUP_STARS = { win: 2, played: 1, champion: 10, runnerUp: 6, third: 4 } as const;
export const CUP_MAX_PLAYERS = 256;
export const CUP_QUESTION_SECONDS = 20;
