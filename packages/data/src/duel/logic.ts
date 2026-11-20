/** Đấu 1–1 — logic thuần: điểm, chọn câu, bạn Robo, thắng/thua, sao thưởng. */
import {
  DUEL_DAILY_REWARDED,
  DUEL_QUESTIONS,
  DUEL_SECONDS,
  DUEL_STARS_PLAY,
  DUEL_STARS_WIN,
  type DuelAnswerReport,
  type DuelBotStep,
  type DuelOutcome,
  type Item,
  type ItemType,
  type SkillMastery,
} from '@openedu/contracts';

/** Dạng câu trả lời nhanh, chấm tự động — hợp với đấu tính giờ. */
export const DUEL_TYPES: ItemType[] = ['MCQ', 'LISTEN_CHOOSE', 'SHORT_ANSWER', 'MATH_MANIPULATIVE', 'MCQ_MULTIPLE', 'ORDERING'];
export const DUEL_LIMIT_MS = DUEL_SECONDS * 1000;
export const DUEL_BASE_POINTS = 100;
export const DUEL_SPEED_BONUS = 50;

/** PRNG mulberry32 — cùng hạt giống ⇒ cùng dãy số trên mọi máy. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(list: readonly T[], seed: number): T[] {
  const r = seededRandom(seed);
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function randomCode(rand: () => number = Math.random): string {
  return String(1000 + Math.floor(rand() * 9000));
}

/** Điểm một câu: đúng = 100 + thưởng tốc độ 0–50 (càng nhanh càng nhiều); chưa đúng / hết giờ = 0. */
export function duelPoints(correct: boolean, ms: number, limitMs = DUEL_LIMIT_MS): number {
  if (!correct) return 0;
  const t = Math.min(limitMs, Math.max(0, ms));
  return DUEL_BASE_POINTS + Math.round(DUEL_SPEED_BONUS * (1 - t / limitMs));
}

export function timeoutReport(q: number): DuelAnswerReport {
  return { q, correct: false, points: 0, ms: DUEL_LIMIT_MS, timedOut: true };
}

export function totalPoints(list: (DuelAnswerReport | undefined)[] | undefined): number {
  return (list ?? []).reduce((s, r) => s + (r?.points ?? 0), 0);
}
export function totalCorrect(list: (DuelAnswerReport | undefined)[] | undefined): number {
  return (list ?? []).reduce((s, r) => s + (r?.correct ? 1 : 0), 0);
}

/** Thắng/hoà/thua: điểm nhiều hơn thắng; bằng điểm → nhiều câu đúng hơn; vẫn bằng → hoà. Bỏ cuộc → người kia thắng. */
export function decideWinner(a: string, b: string, answers: Record<string, (DuelAnswerReport | undefined)[]>, forfeitBy?: string): string | null {
  if (forfeitBy === a) return b;
  if (forfeitBy === b) return a;
  const pa = totalPoints(answers[a]);
  const pb = totalPoints(answers[b]);
  if (pa !== pb) return pa > pb ? a : b;
  const ca = totalCorrect(answers[a]);
  const cb = totalCorrect(answers[b]);
  if (ca !== cb) return ca > cb ? a : b;
  return null;
}

export function outcomeFor(me: string, winner: string | null): DuelOutcome {
  return winner == null ? 'draw' : winner === me ? 'win' : 'lose';
}

/** Sao của một trận: tham gia 1, thắng +2; hết lượt trong ngày → 0. Người bỏ cuộc không được sao. */
export function duelStars(outcome: DuelOutcome, rewardedToday: number, forfeited = false): { stars: number; capped: boolean } {
  if (forfeited) return { stars: 0, capped: false };
  if (rewardedToday >= DUEL_DAILY_REWARDED) return { stars: 0, capped: true };
  return { stars: DUEL_STARS_PLAY + (outcome === 'win' ? DUEL_STARS_WIN : 0), capped: false };
}

/**
 * Chọn 7 câu: đúng khối lớp + môn, dạng trả lời nhanh; ưu tiên câu thuộc kĩ năng em đang học / cần ôn,
 * rồi trộn bằng hạt giống (hai bạn cùng thứ tự). Thiếu câu thì lấy thêm câu khác của môn.
 */
export function pickDuelItems(pool: Item[], opts: { seed: number; mastery?: SkillMastery[]; count?: number }): Item[] {
  const count = opts.count ?? DUEL_QUESTIONS;
  const fast = pool.filter((i) => DUEL_TYPES.indexOf(i.type) >= 0);
  const learning = new Set((opts.mastery ?? []).filter((m) => m.level === 'dang-hoc' || m.level === 'can-on').map((m) => m.skillCode));
  const sorted = seededShuffle(fast.slice().sort((a, b) => a.id.localeCompare(b.id)), opts.seed);
  const prefer = sorted.filter((i) => (i.skills ?? []).some((s) => learning.has(s)));
  const rest = sorted.filter((i) => prefer.indexOf(i) < 0);
  // Tối đa ~4/7 câu ưu tiên để trận vẫn đa dạng.
  const nPrefer = Math.min(prefer.length, Math.ceil(count * 0.6));
  const chosen = [...prefer.slice(0, nPrefer), ...rest].slice(0, count);
  if (chosen.length < count) for (const i of prefer.slice(nPrefer)) if (chosen.length < count) chosen.push(i);
  return seededShuffle(chosen, opts.seed ^ 0x5bd1e995);
}

/** Độ khó bạn Robo theo mức thành thạo của em: tỉ lệ đúng 45–85 %, thời gian trả lời trung bình 5–11 giây. */
export interface BotProfile {
  accuracy: number;
  meanMs: number;
}

export function botProfileFor(mastery: SkillMastery[] | undefined, subjectSkills?: (code: string) => boolean): BotProfile {
  const list = (mastery ?? []).filter((m) => (subjectSkills ? subjectSkills(m.skillCode) : true));
  const avg = list.length ? list.reduce((s, m) => s + (Number.isFinite(m.p) ? m.p : 0.5), 0) / list.length : 0.5;
  // Robo hơi kém em một chút để em có cơ hội thắng, nhưng không quá dễ.
  const accuracy = Math.round(Math.min(0.85, Math.max(0.45, 0.4 + avg * 0.45)) * 100) / 100;
  const meanMs = Math.round(11_000 - avg * 6_000);
  return { accuracy, meanMs };
}

/** Kế hoạch trả lời của Robo: tất định theo hạt giống; thời gian lệch ±40 %, trong khoảng 2,5–18 giây. */
export function botPlan(profile: BotProfile, seed: number, count = DUEL_QUESTIONS): DuelBotStep[] {
  const r = seededRandom(seed ^ 0x9e3779b9);
  return Array.from({ length: count }, () => {
    const correct = r() < profile.accuracy;
    const jitter = 0.6 + r() * 0.8;
    const ms = Math.round(Math.min(18_000, Math.max(2_500, profile.meanMs * jitter * (correct ? 1 : 1.15))));
    return { correct, ms };
  });
}

export function botReport(plan: DuelBotStep[], q: number): DuelAnswerReport {
  const s = plan[q] ?? { correct: false, ms: DUEL_LIMIT_MS };
  return { q, correct: s.correct, ms: s.ms, points: duelPoints(s.correct, s.ms) };
}
