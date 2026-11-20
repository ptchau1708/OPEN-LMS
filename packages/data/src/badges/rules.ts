/**
 * Phase 6 — quy tắc THUẦN: huy hiệu, xu, Vườn lớp. Demo dùng trực tiếp; Supabase tính lại trên máy chủ
 * (migration 20261113000009_v2_rewards.sql — cùng ngưỡng, cùng mốc lớn lên của cây).
 */
import {
  BADGES,
  type BadgeDef,
  type BadgeProgress,
  type BadgeRule,
  type BadgeStats,
  type Behavior,
  type BehaviorLog,
  type ClassGarden,
  type GardenGoal,
  type GardenPlot,
  type GrowthStage,
  type LearningEvent,
  type MascotId,
  type PlantKind,
  type RewardEntry,
  type ShopItem,
  type SubjectId,
} from '@openedu/contracts';
import { vnDayKey } from '../mastery';
import { foldVietnamese } from '../text';

const DAY = 86_400_000;

/* ======================= huy hiệu ======================= */
export interface BadgeStatsInput {
  userId: string;
  events: LearningEvent[];
  rewards: RewardEntry[];
  behaviorLogs: BehaviorLog[];
  behaviors?: Behavior[];
  /** lessonId → môn. */
  lessonSubject: Record<string, SubjectId>;
}

/** Chuỗi ngày liên tiếp dài nhất (ngày YYYY-MM-DD, không cần sắp xếp). */
export function longestRun(days: Iterable<string>): number {
  const sorted = [...new Set(days)].sort();
  let best = 0, run = 0, prev = NaN;
  for (const d of sorted) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = t - prev === DAY ? run + 1 : 1;
    prev = t;
    if (run > best) best = run;
  }
  return best;
}

/** Hành vi "giúp đỡ bạn": id mặc định hoặc nhãn có chữ "giúp". */
export function isHelpBehavior(id: string, label?: string): boolean {
  return id === 'bh-giup-ban' || (!!label && foldVietnamese(label).includes('giup'));
}

export function badgeStatsFrom(inp: BadgeStatsInput): BadgeStats {
  const ev = inp.events.filter((e) => e.userId === inp.userId);
  const rw = inp.rewards.filter((r) => r.userId === inp.userId);
  const logs = inp.behaviorLogs.filter((l) => l.studentId === inp.userId);

  const learnDays = rw.filter((r) => r.sourceType !== 'shop' && (r.stars > 0 || r.xp > 0)).map((r) => vnDayKey(r.at));
  const lessons = new Set<string>();
  for (const r of rw) if (r.sourceType === 'lesson' && r.sourceId) lessons.add(r.sourceId);
  for (const e of ev) if (e.verb === 'completed' && e.objectType === 'lesson') lessons.add(e.objectId);
  const bySubject: Partial<Record<SubjectId, number>> = {};
  for (const id of lessons) {
    const s = inp.lessonSubject[id];
    if (s) bySubject[s] = (bySubject[s] ?? 0) + 1;
  }
  const workTop = new Set<string>();
  for (const e of ev) {
    const lv = (e.result?.response as { level?: string } | undefined)?.level;
    if (e.objectType === 'work' && lv === 'T') workTop.add(e.objectId.replace(/:sai$/, ''));
  }
  const duels = ev.filter((e) => e.objectType === 'arena' && e.verb === 'completed' && e.objectId.startsWith('duel:'));
  const live = new Set<string>();
  for (const e of ev) if (e.verb === 'joined' && e.objectType === 'live') live.add(e.liveSessionId ?? e.objectId);
  const liveDays = new Set(rw.filter((r) => r.sourceType === 'live').map((r) => vnDayKey(r.at)));
  const labels = new Map((inp.behaviors ?? []).map((b) => [b.id, b.label]));

  return {
    bestStreak: longestRun(learnDays),
    lessons: lessons.size,
    lessonsBySubject: bySubject,
    remediationPassed: ev.filter((e) => e.objectType === 'remediation' && e.verb === 'completed' && e.result?.correct === true).length,
    workApproved: new Set(rw.filter((r) => r.sourceType === 'work').map((r) => r.sourceId ?? r.id)).size,
    workTop: workTop.size,
    duels: new Set(duels.map((e) => e.objectId)).size,
    duelWins: new Set(duels.filter((e) => e.result?.correct === true).map((e) => e.objectId)).size,
    towerCorrect: rw.filter((r) => r.sourceType === 'arena' && !(r.sourceId ?? '').startsWith('duel:')).length,
    behaviorPoints: logs.reduce((s, l) => s + Math.max(0, l.points), 0),
    liveClasses: Math.max(live.size, liveDays.size),
    helpCount: logs.filter((l) => l.points > 0 && isHelpBehavior(l.behaviorId, labels.get(l.behaviorId))).length,
  };
}

export function statValue(s: BadgeStats, r: BadgeRule): number {
  switch (r.kind) {
    case 'streak': return s.bestStreak;
    case 'lessons': return r.subject ? s.lessonsBySubject[r.subject] ?? 0 : s.lessons;
    case 'remediation': return s.remediationPassed;
    case 'work': return s.workApproved;
    case 'workTop': return s.workTop;
    case 'duels': return s.duels;
    case 'duelWins': return s.duelWins;
    case 'tower': return s.towerCorrect;
    case 'behavior': return s.behaviorPoints;
    case 'live': return s.liveClasses;
    case 'help': return s.helpCount;
  }
}

export function badgeProgress(s: BadgeStats, defs: BadgeDef[] = BADGES): BadgeProgress[] {
  return defs.map((b) => {
    const value = statValue(s, b.rule);
    return { badgeId: b.id, value, min: b.rule.min, earned: value >= b.rule.min };
  });
}

/** Huy hiệu vừa đủ điều kiện mà chưa có. */
export function newlyEarnedBadges(s: BadgeStats, have: Iterable<string>, defs: BadgeDef[] = BADGES): string[] {
  const got = new Set(have);
  return badgeProgress(s, defs).filter((p) => p.earned && !got.has(p.badgeId)).map((p) => p.badgeId);
}

/* ======================= xu ======================= */
/** Mỗi sao kiếm được kèm 1 xu (demo, Edge Function và `_award` trên máy chủ). */
export const COINS_PER_STAR = 1;
export function coinsForStars(stars: number): number {
  return Math.max(0, Math.floor(stars)) * COINS_PER_STAR;
}

export type PurchaseCheck = { ok: true; after: number } | { ok: false; reason: 'owned' | 'poor' | 'unknown'; need?: number };
export function checkPurchase(balance: number, item: ShopItem | undefined, owned: readonly string[]): PurchaseCheck {
  if (!item) return { ok: false, reason: 'unknown' };
  if (owned.includes(item.id)) return { ok: false, reason: 'owned' };
  if (balance < item.price) return { ok: false, reason: 'poor', need: item.price - balance };
  return { ok: true, after: balance - item.price };
}

/** Dòng sổ thưởng khi mua: xu âm, không sao, không điểm kinh nghiệm. */
export function purchaseEntry(userId: string, item: ShopItem): Omit<RewardEntry, 'id' | 'at'> {
  return { userId, stars: 0, coins: -item.price, xp: 0, reason: `Đổi xu lấy: ${item.name}`, sourceType: 'shop', sourceId: item.id };
}

/* ======================= Vườn lớp ======================= */
/** Mốc sao trong tuần của cây riêng mỗi HS: mầm 1 · cây non 5 · nụ 12 · hoa 20. */
export const PERSONAL_STAGE_STARS = [0, 1, 5, 12, 20] as const;
/** Mốc tỉ lệ mục tiêu của cây lớp / cây tổ: mầm > 0 · cây non 25% · nụ 60% · hoa 100%. */
export const CLASS_STAGE_RATIO = [0, 0, 0.25, 0.6, 1] as const;

export function personalStage(stars: number): GrowthStage {
  let st = 0;
  for (let i = 1; i < PERSONAL_STAGE_STARS.length; i++) if (stars >= PERSONAL_STAGE_STARS[i]) st = i;
  return st as GrowthStage;
}

export function goalStage(progress: number): GrowthStage {
  if (!(progress > 0)) return 0;
  let st = 1;
  for (let i = 2; i < CLASS_STAGE_RATIO.length; i++) if (progress >= CLASS_STAGE_RATIO[i]) st = i;
  return st as GrowthStage;
}

/** Mục tiêu mặc định: 25 sao mỗi HS, làm tròn lên bội 10, ít nhất 50. */
export function defaultGoalTarget(studentCount: number): number {
  return Math.max(50, Math.ceil((studentCount * 25) / 10) * 10);
}

const PLANT_ROTATION: PlantKind[] = ['huong-duong', 'sen', 'hoa-dao', 'cuc', 'ca-chua', 'xuong-rong'];
/** Cây mặc định của tuần (xoay vòng theo số tuần). */
export function defaultPlant(weekStart: string): PlantKind {
  const n = Math.floor(Date.parse(weekStart) / (7 * DAY));
  return PLANT_ROTATION[((n % PLANT_ROTATION.length) + PLANT_ROTATION.length) % PLANT_ROTATION.length];
}

/** Tổng sao (dương) từng HS kiếm từ `fromIso`. */
export function starsSince(rewards: RewardEntry[], fromIso: string): Record<string, number> {
  const t = Date.parse(fromIso);
  const out: Record<string, number> = {};
  for (const r of rewards) if (r.stars > 0 && Date.parse(r.at) >= t) out[r.userId] = (out[r.userId] ?? 0) + r.stars;
  return out;
}

/** Dữ liệu thô của vườn (máy chủ trả về cùng dạng sau khi đã lọc quyền xem). */
export interface GardenRaw {
  classId: string;
  className: string;
  grade: number;
  weekStart: string;
  goal: { targetStars: number; plant: PlantKind; custom: boolean };
  classStars: number;
  studentCount: number;
  /** Chỉ GV: từng HS. */
  students: { id: string; name: string; mascot?: MascotId; stars: number; teamId?: string }[];
  teams: { id: string; name: string; color: string; stars: number; members: number }[];
  collection: { weekStart: string; plant: PlantKind }[];
  me?: { id: string; stars: number; teamId?: string };
}

export function assembleGarden(raw: GardenRaw): ClassGarden {
  const target = Math.max(1, raw.goal.targetStars);
  const progress = Math.min(1, raw.classStars / target);
  const teamMode = raw.grade <= 3 && raw.teams.length > 0;
  const plots: GardenPlot[] = [];
  if (teamMode) {
    for (const t of raw.teams) {
      const share = (target * Math.max(1, t.members)) / Math.max(1, raw.studentCount);
      plots.push({ id: t.id, kind: 'team', name: t.name, color: t.color, stars: t.stars, stage: goalStage(t.stars / share), members: t.members, isMe: !!raw.me && raw.me.teamId === t.id });
    }
  }
  for (const s of raw.students) plots.push({ id: s.id, kind: 'student', name: s.name, mascot: s.mascot, stars: s.stars, stage: personalStage(s.stars) });
  if (raw.me && !raw.students.some((s) => s.id === raw.me?.id)) {
    plots.push({ id: raw.me.id, kind: 'student', stars: raw.me.stars, stage: personalStage(raw.me.stars), isMe: true });
  }
  const goal: GardenGoal = { weekStart: raw.weekStart, targetStars: target, plant: raw.goal.plant, custom: raw.goal.custom };
  return {
    classId: raw.classId,
    className: raw.className,
    grade: raw.grade,
    weekStart: raw.weekStart,
    goal,
    classStars: raw.classStars,
    progress,
    stage: goalStage(progress),
    teamMode,
    plots,
    collection: raw.collection,
    ...(raw.me ? { me: { stars: raw.me.stars, stage: personalStage(raw.me.stars), ...(raw.me.teamId ? { teamId: raw.me.teamId } : {}) } } : {}),
    studentCount: raw.studentCount,
  };
}

/** Sao còn thiếu để cây lớp nở hoa. */
export function starsToGoal(g: Pick<ClassGarden, 'classStars' | 'goal'>): number {
  return Math.max(0, g.goal.targetStars - g.classStars);
}

/** Màn hình lớp: ô từng HS không tên, không số sao, id ẩn (chỉ còn giai đoạn cây). */
export function anonymizeGarden(g: ClassGarden): ClassGarden {
  let i = 0;
  return { ...g, me: undefined, plots: g.plots.map((p) => (p.kind === 'student' ? { id: `p${++i}`, kind: 'student', stars: 0, stage: p.stage } : { ...p, isMe: false })) };
}
