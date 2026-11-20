/**
 * Máy trạng thái một trận Đấu 1–1 (thuần, không hẹn giờ — thời gian truyền vào qua `at`).
 * waiting → countdown (3 s) → question (20 s) → reveal (2,5 s) → … → finished.
 * Hai máy tự chạy cùng nhịp; chủ phòng gửi 'round' để đồng bộ khi máy kia chậm.
 */
import { DUEL_FORFEIT_MS, DUEL_QUESTIONS, type DuelAnswerReport, type DuelReaction } from '@openedu/contracts';
import { DUEL_LIMIT_MS, timeoutReport } from './logic';

export const DUEL_COUNTDOWN_MS = 3000;
export const DUEL_REVEAL_MS = 2500;
/** Chờ thêm sau khi hết giờ cho câu trả lời đang chấm / đang gửi. */
export const DUEL_GRACE_MS = 4000;
/** Im lặng quá lâu → hiện "bạn đang mất kết nối". */
export const DUEL_QUIET_MS = 6000;

export type DuelPhase = 'waiting' | 'countdown' | 'question' | 'reveal' | 'finished';

export interface DuelMatchState {
  phase: DuelPhase;
  q: number;
  total: number;
  me: string;
  opp: string;
  isHost: boolean;
  /** Thời điểm bắt đầu pha hiện tại (ms). */
  phaseAt: number;
  answers: Record<string, (DuelAnswerReport | undefined)[]>;
  /** Câu em đang chờ chấm (không tự tính hết giờ khi đang chấm). */
  pendingQ: number | null;
  oppSeen: boolean;
  oppLastSeen: number;
  forfeitBy?: string;
  reaction?: { from: string; emoji: DuelReaction; at: number };
}

export type DuelEvent =
  | { type: 'seen'; at: number }
  | { type: 'round'; q: number; at: number }
  | { type: 'answer'; userId: string; report: DuelAnswerReport; at: number }
  | { type: 'pending'; q: number | null }
  | { type: 'react'; from: string; emoji: DuelReaction; at: number }
  | { type: 'leave'; from: string; at: number }
  | { type: 'tick'; at: number };

export function createMatchState(opts: { me: string; opp: string; isHost: boolean; at: number; total?: number; oppPresent?: boolean }): DuelMatchState {
  return {
    phase: opts.oppPresent ? 'countdown' : 'waiting',
    q: 0,
    total: opts.total ?? DUEL_QUESTIONS,
    me: opts.me,
    opp: opts.opp,
    isHost: opts.isHost,
    phaseAt: opts.at,
    answers: { [opts.me]: [], [opts.opp]: [] },
    pendingQ: null,
    oppSeen: !!opts.oppPresent,
    oppLastSeen: opts.at,
  };
}

function setAnswer(s: DuelMatchState, userId: string, r: DuelAnswerReport): DuelMatchState {
  const list = (s.answers[userId] ?? []).slice();
  const prev = list[r.q];
  // Câu trả lời thật thay được ô "hết giờ" tạm; không ghi đè câu trả lời thật.
  if (prev && !prev.timedOut) return s;
  if (prev && prev.timedOut && r.timedOut) return s;
  list[r.q] = r;
  return { ...s, answers: { ...s.answers, [userId]: list } };
}

function bothAnswered(s: DuelMatchState, q: number): boolean {
  return !!s.answers[s.me]?.[q] && !!s.answers[s.opp]?.[q];
}

function maybeReveal(s: DuelMatchState, at: number): DuelMatchState {
  if (s.phase === 'question' && bothAnswered(s, s.q)) return { ...s, phase: 'reveal', phaseAt: at };
  return s;
}

function finish(s: DuelMatchState, at: number, forfeitBy?: string): DuelMatchState {
  if (s.phase === 'finished') return s;
  return { ...s, phase: 'finished', phaseAt: at, pendingQ: null, ...(forfeitBy ? { forfeitBy } : {}) };
}

export function duelReducer(s: DuelMatchState, e: DuelEvent): DuelMatchState {
  if (s.phase === 'finished' && e.type !== 'react') return s;
  switch (e.type) {
    case 'seen': {
      const next = { ...s, oppLastSeen: Math.max(s.oppLastSeen, e.at), oppSeen: true };
      return s.phase === 'waiting' ? { ...next, phase: 'countdown', phaseAt: e.at } : next;
    }
    case 'round': {
      // Đồng bộ theo chủ phòng: chỉ tiến lên, không lùi.
      if (s.isHost || e.q >= s.total) return s;
      if (e.q > s.q || ((s.phase === 'countdown' || s.phase === 'waiting') && e.q === s.q)) {
        return maybeReveal({ ...s, phase: 'question', q: e.q, phaseAt: e.at, pendingQ: null }, e.at);
      }
      return s;
    }
    case 'answer': {
      if (e.report.q < 0 || e.report.q >= s.total) return s;
      let next = setAnswer(s, e.userId, e.report);
      if (e.userId === s.me && next.pendingQ === e.report.q) next = { ...next, pendingQ: null };
      return maybeReveal(next, e.at);
    }
    case 'pending':
      return { ...s, pendingQ: e.q };
    case 'react':
      return { ...s, reaction: { from: e.from, emoji: e.emoji, at: e.at } };
    case 'leave':
      return e.from === s.opp ? finish(s, e.at, s.opp) : s;
    case 'tick': {
      const at = e.at;
      if (at - s.oppLastSeen > DUEL_FORFEIT_MS) return finish(s, at, s.opp);
      const dt = at - s.phaseAt;
      if (s.phase === 'countdown' && dt >= DUEL_COUNTDOWN_MS) return maybeReveal({ ...s, phase: 'question', q: 0, phaseAt: at }, at);
      if (s.phase === 'question') {
        let next = s;
        if (!next.answers[s.me]?.[s.q] && dt >= DUEL_LIMIT_MS && (next.pendingQ !== s.q || dt >= DUEL_LIMIT_MS + DUEL_GRACE_MS)) {
          next = setAnswer({ ...next, pendingQ: null }, s.me, timeoutReport(s.q));
        }
        if (!next.answers[s.opp]?.[s.q] && dt >= DUEL_LIMIT_MS + DUEL_GRACE_MS) next = setAnswer(next, s.opp, timeoutReport(s.q));
        return maybeReveal(next, at);
      }
      if (s.phase === 'reveal' && dt >= DUEL_REVEAL_MS) {
        if (s.q + 1 >= s.total) return finish(s, at);
        return maybeReveal({ ...s, phase: 'question', q: s.q + 1, phaseAt: at, pendingQ: null }, at);
      }
      return s;
    }
  }
  return s;
}

/** Thời gian còn lại của câu hiện tại (ms). */
export function remainingMs(s: DuelMatchState, at: number): number {
  if (s.phase !== 'question') return 0;
  return Math.max(0, DUEL_LIMIT_MS - (at - s.phaseAt));
}

export function oppQuiet(s: DuelMatchState, at: number): boolean {
  return s.phase !== 'finished' && s.oppSeen && at - s.oppLastSeen > DUEL_QUIET_MS;
}
