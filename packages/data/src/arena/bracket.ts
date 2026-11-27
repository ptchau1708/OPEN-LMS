/**
 * Nhánh đấu loại trực tiếp — THUẦN, giống hệt SQL 22 (v2._cup_positions / _cup_begin / _cup_better / _cup_decide /
 * _cup_tick / _cup_finish). Bản demo dùng trực tiếp; app dùng để vẽ nhánh và gọi tên vòng.
 */
import type { CupDecision, CupMatch, CupMatchResult } from '@openedu/contracts';

/** Kích thước nhánh: luỹ thừa của 2 nhỏ nhất ≥ n (tối thiểu 2). */
export function bracketSize(n: number): number {
  let s = 2;
  while (s < n) s *= 2;
  return s;
}

export function roundsFor(n: number): number {
  return Math.round(Math.log2(bracketSize(n)));
}

/** Thứ tự hạt giống theo vị trí trong nhánh: [1,2] → [1,4,2,3] → [1,8,4,5,2,7,3,6]… */
export function seedPositions(size: number): number[] {
  let p = [1, 2];
  while (p.length < size) {
    const k = p.length * 2;
    p = p.flatMap((x) => [x, k + 1 - x]);
  }
  return p;
}

export interface SeededPlayer { userId: string; seed: number }
export interface RoundWindow { opensAt?: string; closesAt?: string }

/** Vòng 1: hạt giống cao gặp hạt giống thấp; thiếu người → miễn đấu (bye). */
export function buildFirstRound(players: SeededPlayer[], w: RoundWindow = {}, now = new Date().toISOString()): CupMatch[] {
  const bySeed = new Map(players.map((p) => [p.seed, p.userId]));
  const size = bracketSize(players.length);
  const pos = seedPositions(size);
  const out: CupMatch[] = [];
  for (let j = 0; j < size / 2; j++) {
    const a = bySeed.get(pos[2 * j]!);
    const b = bySeed.get(pos[2 * j + 1]!);
    if (!a && !b) continue;
    const bye = !a || !b;
    out.push({
      round: 1, slot: j, p1: a ?? b, ...(a && b ? { p2: b } : {}), ...w,
      status: bye ? 'done' : 'open',
      ...(bye ? { winner: (a ?? b)!, decidedBy: 'bye' as const, decidedAt: now } : {}),
    });
  }
  return out;
}

/** Vòng sau: người thắng slot 2k gặp người thắng slot 2k+1. */
export function buildNextRound(prev: CupMatch[], w: RoundWindow = {}, now = new Date().toISOString()): CupMatch[] {
  const sorted = [...prev].sort((a, b) => a.slot - b.slot);
  const round = (sorted[0]?.round ?? 0) + 1;
  const out: CupMatch[] = [];
  for (let k = 0; k * 2 < sorted.length; k++) {
    const a = sorted[2 * k]?.winner;
    const b = sorted[2 * k + 1]?.winner;
    const bye = !b;
    out.push({
      round, slot: k, ...(a ? { p1: a } : {}), ...(b ? { p2: b } : {}), ...w,
      status: bye ? 'done' : 'open',
      ...(bye && a ? { winner: a, decidedBy: 'bye' as const, decidedAt: now } : {}),
    });
  }
  return out;
}

export const EMPTY_RESULT: CupMatchResult = { answered: 0, correct: 0, points: 0, ms: 0 };

/** r1 hơn r2? Đúng nhiều hơn → điểm (tốc độ) → tổng thời gian ít hơn → hạt giống cao hơn (số nhỏ). */
export function better(r1: CupMatchResult, s1: number | undefined, r2: CupMatchResult, s2: number | undefined): boolean {
  if (r1.correct !== r2.correct) return r1.correct > r2.correct;
  if (r1.points !== r2.points) return r1.points > r2.points;
  if (r1.ms !== r2.ms) return r1.ms < r2.ms;
  return (s1 ?? 9999) <= (s2 ?? 9999);
}

/**
 * Quyết định một trận đang mở. force = hết giờ vòng. Trả null khi chưa quyết được (còn chờ bạn đấu).
 * Luật hết giờ: cả hai chưa đấu → hạt giống cao hơn; một bạn chưa đấu → bạn kia thắng; còn lại so kết quả.
 */
export function decideMatch(
  m: CupMatch, res: { p1?: CupMatchResult; p2?: CupMatchResult }, seeds: { p1?: number; p2?: number },
  questions: number, force: boolean, teacherWinner?: string,
): { winner: string; decidedBy: CupDecision; result: Record<string, CupMatchResult> } | null {
  if (m.status !== 'open' || !m.p1 || !m.p2) return null;
  const r1 = res.p1 ?? EMPTY_RESULT;
  const r2 = res.p2 ?? EMPTY_RESULT;
  const result = { [m.p1]: r1, [m.p2]: r2 };
  if (teacherWinner && (teacherWinner === m.p1 || teacherWinner === m.p2)) return { winner: teacherWinner, decidedBy: 'teacher', result };
  let by: CupDecision;
  if (r1.answered >= questions && r2.answered >= questions) by = 'play';
  else if (!force) return null;
  else if (r1.answered === 0 && r2.answered === 0) return { winner: (seeds.p1 ?? 9999) <= (seeds.p2 ?? 9999) ? m.p1 : m.p2, decidedBy: 'seed', result };
  else if (r1.answered === 0 || r2.answered === 0) return { winner: r1.answered > 0 ? m.p1 : m.p2, decidedBy: 'walkover', result };
  else by = 'play';
  return { winner: better(r1, seeds.p1, r2, seeds.p2) ? m.p1 : m.p2, decidedBy: by, result };
}

/** Vô địch, á quân, đồng hạng ba (thua bán kết; không tính trận miễn đấu). */
export function placements(matches: CupMatch[], rounds: number): { champion?: string; runnerUp?: string; thirds: string[] } {
  const final = matches.find((m) => m.round === rounds && m.slot === 0);
  const loser = (m: CupMatch) => (m.winner === m.p1 ? m.p2 : m.p1);
  const thirds = rounds >= 2
    ? matches.filter((m) => m.round === rounds - 1 && m.p1 && m.p2 && m.winner).map(loser).filter((x): x is string => !!x)
    : [];
  return { ...(final?.winner ? { champion: final.winner } : {}), ...(final?.winner && final.p2 ? { runnerUp: loser(final) } : {}), thirds };
}

/** Tên vòng: Chung kết, Bán kết, Tứ kết, Vòng 1/8…, hoặc "Vòng N". */
export function roundName(round: number, rounds: number): string {
  const left = rounds - round;
  if (left === 0) return 'Chung kết';
  if (left === 1) return 'Bán kết';
  if (left === 2) return 'Tứ kết';
  if (left === 3) return 'Vòng 1/8';
  return `Vòng ${round}`;
}

export const DECISION_TEXT: Record<CupDecision, string> = {
  play: 'thi đấu', bye: 'miễn đấu', walkover: 'bạn kia chưa đấu', seed: 'cả hai chưa đấu — hạt giống cao hơn đi tiếp', teacher: 'thầy/cô chọn',
};
