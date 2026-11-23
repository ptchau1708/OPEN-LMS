/**
 * Thi đua trong lớp học trực tiếp (Kahoot / Quizizz / thẻ giấy) — THUẦN, không React, không activity-engine.
 *
 * - Điểm một câu: đúng → 500..1000 theo tốc độ (trả lời ngay = 1000, hết giờ = 500) + thưởng chuỗi 100 × (số câu đúng liên
 *   tiếp trước đó, tối đa 5). Sai/không trả lời → 0 và mất chuỗi.
 * - Máy GV là nơi tính điểm (đọc câu trả lời đã được server/relay chấm), rồi gửi lệnh 'game-tally' — điểm nằm trong state
 *   nên TV, HS, GV vào lại đều thấy đúng.
 * - Thời gian trả lời đo bằng ĐỒNG HỒ MÁY GV (lúc mở câu → lúc máy GV nhận được câu trả lời) để không lệch giờ giữa các máy.
 */
import type { Lesson, LiveGain, LiveGame, LiveGameMode, LivePaperCard, LiveResponse, LiveState } from '@openedu/contracts';

export const GAME_MAX_POINTS = 1000;
export const GAME_MIN_POINTS = 500;
export const GAME_STREAK_BONUS = 100;
export const GAME_STREAK_CAP = 5;
/** Câu không đếm ngược / chế độ self: mốc tính điểm tốc độ. */
export const GAME_DEFAULT_SECONDS = 30;
export const PAPER_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type PaperLetter = (typeof PAPER_LETTERS)[number];

export const GAME_MODE_LABEL: Record<LiveGameMode, { name: string; hint: string }> = {
  class: { name: 'Thi đua cả lớp', hint: 'Kiểu Kahoot: cả lớp cùng một câu trên TV, GV bấm câu tiếp, ai đúng và nhanh được nhiều điểm.' },
  self: { name: 'Tự làm theo nhịp', hint: 'Kiểu Quizizz: mỗi em tự làm lần lượt trên máy, bảng xếp hạng chạy trực tiếp trên TV.' },
  paper: { name: 'Thẻ giấy', hint: 'HS không cần máy: giơ thẻ in sẵn (xoay A/B/C/D lên trên), GV quét bằng camera điện thoại.' },
};

export function emptyGame(mode: LiveGameMode, seconds: number, cards?: LivePaperCard[]): LiveGame {
  return {
    mode,
    seconds: Number.isFinite(seconds) && seconds >= 0 ? Math.min(600, Math.floor(seconds)) : GAME_DEFAULT_SECONDS,
    points: {},
    correct: {},
    answered: {},
    streak: {},
    tallied: [],
    ...(mode === 'self' ? { done: {} } : {}),
    ...(mode === 'paper' ? { cards: cards ?? [], paper: {} } : {}),
  };
}

/** Các slide câu hỏi (layout activity) theo thứ tự. */
export function gameQuestionSlides(lesson: Pick<Lesson, 'slides'> | null | undefined): number[] {
  const out: number[] = [];
  (lesson?.slides ?? []).forEach((s, i) => {
    if (s.layout === 'activity' && (s.itemId || s.item)) out.push(i);
  });
  return out;
}

export function slideItemIdOf(lesson: Pick<Lesson, 'slides'> | null | undefined, slideIndex: number): string | undefined {
  const s = lesson?.slides[slideIndex];
  return s?.itemId ?? s?.item?.id;
}

/** Điểm một câu. */
export function questionPoints(correct: boolean, elapsedMs: number, limitSeconds: number, streakBefore: number): number {
  if (!correct) return 0;
  const limit = (limitSeconds > 0 ? limitSeconds : GAME_DEFAULT_SECONDS) * 1000;
  const r = Math.min(1, Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs / limit : 1));
  const base = Math.round((GAME_MAX_POINTS - (GAME_MAX_POINTS - GAME_MIN_POINTS) * r) / 10) * 10;
  return base + GAME_STREAK_BONUS * Math.min(GAME_STREAK_CAP, Math.max(0, streakBefore));
}

const rkey = (r: Pick<LiveResponse, 'userId' | 'slideIndex' | 'itemId'>) => `${r.userId}|${r.slideIndex}|${r.itemId}`;
export { rkey as gameResponseKey };

/** Câu trả lời ĐẦU TIÊN của mỗi em cho một câu (thi đua không cho sửa). */
export function firstPerStudent(responses: LiveResponse[], itemId: string, slideIndex: number, seenAt?: Record<string, number>): LiveResponse[] {
  const by = new Map<string, LiveResponse>();
  for (const r of responses) {
    if (r.itemId !== itemId || r.slideIndex !== slideIndex) continue;
    const p = by.get(r.userId);
    const t = (x: LiveResponse) => seenAt?.[rkey(x)] ?? Date.parse(x.at);
    if (!p || t(r) < t(p)) by.set(r.userId, r);
  }
  return [...by.values()];
}

/**
 * Tính điểm một câu ở chế độ class: mọi HS trong `roster` (người chơi) — ai không trả lời được 0 điểm (mất chuỗi).
 * `isCorrect` trả undefined với câu không chấm được (vd thăm dò) → không cộng, không tính đã trả lời.
 */
export function tallyClassQuestion(a: {
  game: LiveGame;
  slideIndex: number;
  itemId: string;
  responses: LiveResponse[];
  roster: string[];
  openedAt: number;
  seenAt?: Record<string, number>;
  isCorrect: (r: LiveResponse) => boolean | undefined;
}): LiveGain[] {
  const first = firstPerStudent(a.responses, a.itemId, a.slideIndex, a.seenAt);
  const byUser = new Map(first.map((r) => [r.userId, r]));
  const users = [...new Set([...a.roster, ...byUser.keys()])];
  const out: LiveGain[] = [];
  for (const u of users) {
    const r = byUser.get(u);
    if (!r) {
      out.push({ userId: u, points: 0, correct: false, answered: false });
      continue;
    }
    const ok = a.isCorrect(r);
    if (ok === undefined) continue;
    const t = a.seenAt?.[rkey(r)] ?? Date.parse(r.at);
    out.push({ userId: u, points: questionPoints(ok, t - a.openedAt, a.game.seconds, a.game.streak[u] ?? 0), correct: ok });
  }
  return out;
}

/**
 * Chế độ self: điểm cho các câu trả lời MỚI (chưa có trong game.done). Thời gian một câu = lúc nhận câu này − lúc nhận câu
 * trước của em đó (câu đầu: − lúc bắt đầu). Chuỗi tính theo thứ tự em trả lời.
 */
export function tallySelfResponses(a: {
  game: LiveGame;
  responses: LiveResponse[];
  questions: { slideIndex: number; itemId: string }[];
  startedAt: number;
  seenAt?: Record<string, number>;
  isCorrect: (r: LiveResponse) => boolean | undefined;
}): LiveGain[] {
  const qset = new Set(a.questions.map((q) => `${q.slideIndex}|${q.itemId}`));
  const t = (r: LiveResponse) => a.seenAt?.[rkey(r)] ?? Date.parse(r.at);
  const firsts = new Map<string, LiveResponse>();
  for (const r of a.responses) {
    if (!qset.has(`${r.slideIndex}|${r.itemId}`)) continue;
    const k = `${r.userId}|${r.slideIndex}`;
    const p = firsts.get(k);
    if (!p || t(r) < t(p)) firsts.set(k, r);
  }
  const byUser = new Map<string, LiveResponse[]>();
  for (const r of firsts.values()) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  const out: LiveGain[] = [];
  for (const [u, list] of byUser) {
    list.sort((x, y) => t(x) - t(y));
    const done = new Set(a.game.done?.[u] ?? []);
    let streak = a.game.streak[u] ?? 0;
    let prev = a.startedAt;
    for (const r of list) {
      const at = t(r);
      if (!done.has(r.slideIndex)) {
        const ok = a.isCorrect(r);
        if (ok !== undefined) {
          const pts = questionPoints(ok, at - prev, a.game.seconds, streak);
          out.push({ userId: u, points: pts, correct: ok, slideIndex: r.slideIndex });
          streak = ok ? streak + 1 : 0;
        }
      }
      prev = Math.max(prev, at);
    }
  }
  return out;
}

/** Chế độ giấy: điểm theo đáp án quét được (không tính tốc độ: mỗi câu đúng 1000 + chuỗi). */
export function tallyPaperQuestion(game: LiveGame, slideIndex: number, correctLetter: string | null): LiveGain[] {
  const ans = game.paper?.[String(slideIndex)] ?? {};
  const out: LiveGain[] = [];
  for (const c of game.cards ?? []) {
    const a = ans[c.userId];
    if (!a) {
      out.push({ userId: c.userId, points: 0, correct: false, answered: false });
      continue;
    }
    if (!correctLetter) continue;
    const ok = a === correctLetter;
    out.push({ userId: c.userId, points: questionPoints(ok, 0, game.seconds, game.streak[c.userId] ?? 0), correct: ok });
  }
  return out;
}

/** Áp lệnh tính điểm (dùng trong reducer). Bỏ qua câu đã tính (class/paper) hoặc câu đã có trong done (self). */
export function applyGains(game: LiveGame, gains: LiveGain[], slideIndex?: number): LiveGame {
  if (slideIndex !== undefined && game.tallied.includes(slideIndex)) return game;
  const g: LiveGame = {
    ...game,
    points: { ...game.points },
    correct: { ...game.correct },
    answered: { ...game.answered },
    streak: { ...game.streak },
    ...(game.done ? { done: { ...game.done } } : {}),
  };
  const last: Record<string, number> = {};
  for (const x of gains) {
    if (!x || typeof x.userId !== 'string') continue;
    if (x.slideIndex !== undefined) {
      const d = g.done?.[x.userId] ?? [];
      if (d.includes(x.slideIndex)) continue;
      g.done = { ...(g.done ?? {}), [x.userId]: [...d, x.slideIndex] };
    }
    const pts = Number.isFinite(x.points) ? Math.max(0, Math.round(x.points)) : 0;
    g.points[x.userId] = (g.points[x.userId] ?? 0) + pts;
    if (x.answered !== false) g.answered[x.userId] = (g.answered[x.userId] ?? 0) + 1;
    if (x.correct) g.correct[x.userId] = (g.correct[x.userId] ?? 0) + 1;
    g.streak[x.userId] = x.correct ? (g.streak[x.userId] ?? 0) + 1 : 0;
    last[x.userId] = (last[x.userId] ?? 0) + pts;
  }
  g.lastGain = slideIndex !== undefined || !game.lastGain ? last : { ...game.lastGain, ...last };
  if (slideIndex !== undefined) g.tallied = [...game.tallied, slideIndex];
  return g;
}

export interface GameRankRow {
  userId: string;
  name: string;
  mascot?: string;
  color?: string;
  teamId?: string;
  points: number;
  correct: number;
  answered: number;
  streak: number;
  /** Hạng (bằng điểm cùng hạng). */
  rank: number;
  /** Chế độ self: số câu đã làm. */
  done: number;
}

/** Người chơi: HS đã vào phòng; chế độ giấy: HS có thẻ. */
export function gamePlayers(state: Pick<LiveState, 'participants' | 'game'>): { userId: string; name: string; mascot?: string; color?: string; teamId?: string }[] {
  const g = state.game;
  if (g?.mode === 'paper') return (g.cards ?? []).map((c) => ({ userId: c.userId, name: c.name }));
  return state.participants.filter((p) => p.userId !== 'bang-lop').map((p) => ({ userId: p.userId, name: p.name, mascot: p.mascot, color: p.color, ...(p.teamId ? { teamId: p.teamId } : {}) }));
}

export function gameLeaderboard(state: Pick<LiveState, 'participants' | 'game'>): GameRankRow[] {
  const g = state.game;
  if (!g) return [];
  const rows = gamePlayers(state).map((p) => ({
    ...p,
    points: g.points[p.userId] ?? 0,
    correct: g.correct[p.userId] ?? 0,
    answered: g.answered[p.userId] ?? 0,
    streak: g.streak[p.userId] ?? 0,
    done: g.done?.[p.userId]?.length ?? 0,
    rank: 0,
  }));
  rows.sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name, 'vi'));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

/** Tổng điểm theo đội (tổ) khi có chia đội. */
export function gameTeamBoard(state: Pick<LiveState, 'participants' | 'game' | 'teams'>): { id: string; name: string; color: string; points: number; members: number }[] {
  const lb = gameLeaderboard(state);
  return state.teams
    .map((t) => {
      const m = lb.filter((r) => r.teamId === t.id);
      return { id: t.id, name: t.name, color: t.color, points: m.reduce((a, r) => a + r.points, 0), members: m.length };
    })
    .filter((t) => t.members > 0)
    .sort((a, b) => b.points - a.points);
}

/* ------------------------------------------------------------------ */
/* Thẻ giấy                                                            */
/* ------------------------------------------------------------------ */
const CARD_PREFIX = 'OE1-';
export const PAPER_MAX_CARDS = 60;

export function paperCardCode(card: number): string {
  return `${CARD_PREFIX}${card}`;
}

export function parsePaperCode(text: string | null | undefined): number | null {
  const m = /^OE1-(\d{1,3})$/.exec((text ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= PAPER_MAX_CARDS ? n : null;
}

/** Thẻ theo thứ tự danh sách lớp (thêm HS mới → số tiếp theo, số cũ giữ nguyên). */
export function paperCardsFor(students: { id: string; name: string }[]): LivePaperCard[] {
  return students.slice(0, PAPER_MAX_CARDS).map((s, i) => ({ card: i + 1, userId: s.id, name: s.name }));
}

/**
 * Chữ đang ở phía trên theo hướng mã QR trong ảnh. Thẻ in: A ở trên, B bên phải, C ở dưới, D bên trái (chữ quay ra ngoài).
 * HS xoay thẻ cho chữ mình chọn lên trên. `topLeft → topRight` là cạnh trên của mã QR (theo hướng của mã), toạ độ ảnh (y hướng xuống).
 */
export function paperLetterFromCorners(topLeft: { x: number; y: number }, topRight: { x: number; y: number }): PaperLetter {
  const deg = (Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x) * 180) / Math.PI;
  if (deg > -45 && deg <= 45) return 'A';
  if (deg > -135 && deg <= -45) return 'B';
  if (deg > 45 && deg <= 135) return 'D';
  return 'C';
}

/** Có dùng được ở chế độ giấy không: chọn 1 đáp án, 2–4 lựa chọn. */
export function paperFriendly(item: { type: string; payload?: unknown } | undefined): boolean {
  if (!item || (item.type !== 'MCQ' && item.type !== 'LISTEN_CHOOSE')) return false;
  const opts = (item.payload as { options?: unknown[] } | undefined)?.options;
  return Array.isArray(opts) && opts.length >= 2 && opts.length <= 4;
}
