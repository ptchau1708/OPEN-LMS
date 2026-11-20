/**
 * Tính SkillMastery cho từng (HS, kĩ năng) bằng cách "gập" các quan sát theo thời gian. THUẦN — chép sang Edge Function.
 *
 * Luật (ngưỡng ở constants.ts):
 *  - 0 lần làm → chua-hoc; < 3 lần → dang-hoc.
 *  - p = Σ wᵢ·scoreᵢ / Σ wᵢ, wᵢ = 0.5^(tuổi/10 ngày) (bất biến theo "bây giờ" — chỉ thứ tự thời gian quan trọng).
 *  - Bộ ôn tập ĐẠT: chặng +1 (tối đa 3), hẹn ôn lại +1 / +3 / +7 ngày; đạt lần ôn ở chặng 3 → xong lịch.
 *    Bộ ôn tập CHƯA ĐẠT, hoặc sai 3 câu liên tiếp khi đang ở chặng ≥ 1 → về chặng 0 và "cần ôn" tới khi đạt một bộ.
 *  - Thứ tự xét mức (khi ≥ 3 lần): cần ôn do trượt/tái phát → can-on · chặng 1–2 → dang-hoc (đang ôn) ·
 *    p < 0.6 → can-on · p ≥ 0.85 & đúng liên tiếp ≥ 3 & ≥ 2 ngày & (chưa vào luồng ôn, hoặc đã tới chặng 3) → vung ·
 *    còn lại → dang-hoc.
 *  - wasGap (thông tin): đã từng có lúc p < 0.6 (sau ≥ 3 lần) hoặc đã vào luồng ôn.
 */
import type { LearningEvent, MasteryLevel, ReviewStage, SkillMastery, WrongEvidence } from '@openedu/contracts';
import {
  DAY_MS,
  GAP_P,
  HALF_LIFE_DAYS,
  MASTERED_DAYS,
  MASTERED_P,
  MASTERED_STREAK,
  MIN_ATTEMPTS,
  RELAPSE_WRONG_STREAK,
  REVIEW_INTERVAL_DAYS,
} from './constants';
import { observationsFromEvents, type ItemLike, type Observation } from './observe';

interface State {
  attempts: number;
  hist: { t: number; score: number }[];
  streak: number;
  wrongStreak: number;
  days: Set<string>;
  lastAt?: string;
  misconceptions: Record<string, number>;
  recentWrong: WrongEvidence[];
  stage: ReviewStage;
  wasGap: boolean;
  /** Trượt bộ ôn / tái phát: giữ can-on tới khi đạt một bộ ôn. */
  mustRemediate: boolean;
  nextReviewAt?: string;
}

function newState(): State {
  return { attempts: 0, hist: [], streak: 0, wrongStreak: 0, days: new Set(), misconceptions: {}, recentWrong: [], stage: 0, wasGap: false, mustRemediate: false };
}

/** p có trọng số độ mới (tính tương đối với lần làm cuối). */
export function recencyWeightedP(hist: { t: number; score: number }[]): number {
  if (!hist.length) return 0;
  const ref = hist[hist.length - 1].t;
  let w = 0;
  let s = 0;
  for (const h of hist) {
    const wi = Math.pow(0.5, (ref - h.t) / (HALF_LIFE_DAYS * DAY_MS));
    w += wi;
    s += wi * h.score;
  }
  return w > 0 ? s / w : 0;
}

/** Ngày theo giờ Việt Nam (UTC+7) — khớp v2.today_vn() ở server. */
export function vnDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

function levelOf(s: State, p: number): MasteryLevel {
  if (s.attempts === 0) return 'chua-hoc';
  if (s.attempts < MIN_ATTEMPTS) return 'dang-hoc';
  if (s.mustRemediate) return 'can-on';
  if (s.stage === 1 || s.stage === 2) return 'dang-hoc';
  if (p < GAP_P) return 'can-on';
  if (p >= MASTERED_P && s.streak >= MASTERED_STREAK && s.days.size >= MASTERED_DAYS && (s.stage === 0 || s.stage === 3)) return 'vung';
  return 'dang-hoc';
}

function step(s: State, o: Observation): void {
  if (o.kind === 'answer') {
    s.attempts++;
    s.hist.push({ t: new Date(o.at).getTime(), score: o.score });
    s.days.add(vnDayKey(o.at));
    s.lastAt = o.at;
    if (o.correct) {
      s.streak++;
      s.wrongStreak = 0;
    } else {
      s.streak = 0;
      s.wrongStreak++;
      for (const c of o.misconceptions) s.misconceptions[c] = (s.misconceptions[c] ?? 0) + 1;
      s.recentWrong.unshift({ itemId: o.itemId, at: o.at, ...(o.misconceptions[0] ? { misconception: o.misconceptions[0] } : {}) });
      if (s.recentWrong.length > 3) s.recentWrong.length = 3;
    }
    if (s.attempts >= MIN_ATTEMPTS && recencyWeightedP(s.hist) < GAP_P) s.wasGap = true;
    if (s.stage > 0 && s.wrongStreak >= RELAPSE_WRONG_STREAK) {
      s.stage = 0;
      s.mustRemediate = true;
      s.nextReviewAt = undefined;
    }
  } else {
    s.wasGap = true;
    if (o.passed) {
      s.mustRemediate = false;
      if (s.stage < 3) {
        s.stage = (s.stage + 1) as ReviewStage;
        s.nextReviewAt = addDaysIso(o.at, REVIEW_INTERVAL_DAYS[s.stage - 1]);
      } else s.nextReviewAt = undefined;
    } else {
      s.stage = 0;
      s.mustRemediate = true;
      s.nextReviewAt = undefined;
    }
  }
}

function toMastery(userId: string, skillCode: string, s: State): SkillMastery {
  const p = Math.round(recencyWeightedP(s.hist) * 1000) / 1000;
  return {
    userId,
    skillCode,
    level: levelOf(s, p),
    p,
    attempts: s.attempts,
    correctStreak: s.streak,
    distinctDays: s.days.size,
    ...(s.lastAt ? { lastAt: s.lastAt } : {}),
    misconceptions: s.misconceptions,
    ...(s.nextReviewAt ? { nextReviewAt: s.nextReviewAt } : {}),
    reviewStage: s.stage,
    wasGap: s.wasGap,
    recentWrong: s.recentWrong,
  };
}

export interface ComputeOptions {
  /** Chỉ tính các kĩ năng này (Edge Function: kĩ năng của câu vừa trả lời). */
  onlySkills?: Iterable<string>;
}

/** Mức thành thạo từ danh sách quan sát (đã sắp theo thời gian). Kết quả sắp theo mã kĩ năng. */
export function computeMasteryFromObservations(userId: string, obs: Observation[], opts: ComputeOptions = {}): SkillMastery[] {
  const only = opts.onlySkills ? new Set(opts.onlySkills) : null;
  const states = new Map<string, State>();
  for (const o of obs) {
    for (const code of o.skills) {
      if (only && !only.has(code)) continue;
      let s = states.get(code);
      if (!s) {
        s = newState();
        states.set(code, s);
      }
      step(s, o);
    }
  }
  return [...states.entries()]
    .filter(([, s]) => s.attempts > 0 || s.stage > 0)
    .map(([code, s]) => toMastery(userId, code, s))
    .sort((a, b) => a.skillCode.localeCompare(b.skillCode));
}

/** Mức thành thạo của một HS từ learning_events của HS đó (lọc theo userId cho chắc). */
export function computeMastery(userId: string, events: LearningEvent[], items?: Record<string, ItemLike | undefined>, opts: ComputeOptions = {}): SkillMastery[] {
  const mine = events.filter((e) => e.userId === userId);
  return computeMasteryFromObservations(userId, observationsFromEvents(mine, items), opts);
}

/** Đếm số kĩ năng theo mức. */
export function countLevels(list: { level: MasteryLevel }[]): Record<MasteryLevel, number> {
  const c: Record<MasteryLevel, number> = { 'chua-hoc': 0, 'dang-hoc': 0, 'can-on': 0, vung: 0 };
  for (const m of list) c[m.level]++;
  return c;
}

/** Lần ôn lại đã đến hạn? */
export function isReviewDue(m: SkillMastery, now: Date): boolean {
  return !!m.nextReviewAt && m.reviewStage > 0 && new Date(m.nextReviewAt).getTime() <= now.getTime();
}
