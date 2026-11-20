/**
 * Lịch sử học tập tổng hợp ~2 tuần cho lớp 4A (tất định: RNG có hạt giống theo tên đăng nhập).
 * Mỗi HS một "hồ sơ" khác nhau để bản đồ nhiệt / lỗ hổng / nhóm có nội dung ý nghĩa:
 *   Hải: giỏi đều · Lan: hổng phân số do chưa vững quy đồng · Khoa: cẩn thận chưa tốt, hay quên nhớ ·
 *   Mai: tốt lớp 4, nhưng thử sức lớp 5 (Leo tháp) thì so sánh số thập phân theo "độ dài" ·
 *   Tuấn: tiến bộ dần (rút gọn phân số yếu → đã qua 2 chặng ôn, đến hạn ôn lại hôm nay) ·
 *   Vy: cũng hổng quy đồng + rút gọn chưa tối giản · Nam: yếu số lớp triệu, làm tròn ·
 *   Thảo: trung bình, ít làm, đôi khi quên nhớ.
 */
import type { AnyResponse, Item, LearningEvent, LessonProgress, RewardEntry } from '@openedu/contracts';
import { answerAnnotations, detectMisconceptions, remediationSetId } from '../mastery';

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Xác suất đúng + quan niệm sai ưu tiên khi sai, theo kĩ năng chính của câu và số ngày trước. */
type Rule = { p: number; mis?: string[] };
interface StudentPlan {
  id: string;
  /** Xác suất có học trong một ngày. */
  activeRate: number;
  perDay: [number, number];
  base: number;
  rules: Record<string, Rule | ((daysAgo: number) => Rule)>;
  /** Thêm câu lớp 5 (Leo tháp). */
  grade5?: boolean;
}

export const PLANS_4A: StudentPlan[] = [
  { id: 'u-hai4a1', activeRate: 0.85, perDay: [5, 8], base: 0.97, rules: {} },
  {
    id: 'u-lan4a2',
    activeRate: 0.8,
    perDay: [5, 7],
    base: 0.93,
    rules: {
      'T4.PS.QUY-DONG': { p: 0.2, mis: ['QUY-DONG-CHI-NHAN-MAU'] },
      'T4.PSPT.CONG-TRU': { p: 0.2, mis: ['CONG-TU-CONG-MAU', 'KHONG-QUY-DONG'] },
      'T4.PS.SO-SANH': { p: 0.35, mis: ['KHONG-QUY-DONG'] },
      'T4.PS.LON-NHAT': { p: 0.35, mis: ['KHONG-QUY-DONG'] },
      'T4.PS.TINH-CHAT': { p: 0.85 },
    },
  },
  {
    id: 'u-khoa4a3',
    activeRate: 0.8,
    perDay: [5, 8],
    base: 0.94,
    rules: { 'T4.PT.CONG-TRU': { p: 0.3, mis: ['QUEN-NHO'] }, 'T4.PT.NHAN-2-CS': { p: 0.55, mis: ['NHAN-QUEN-LUI-HANG'] } },
  },
  {
    id: 'u-mai4a4',
    activeRate: 0.85,
    perDay: [5, 7],
    base: 0.95,
    grade5: true,
    rules: {
      'T5.STP.SO-SANH': { p: 0.15, mis: ['SO-SANH-STP-THEO-DO-DAI'] },
      'T5.STP.SAP-XEP': { p: 0.2, mis: ['SO-SANH-STP-THEO-DO-DAI'] },
      'T5.STP.CAU-TAO': { p: 0.4 },
      'T5.STP.DOC-VIET': { p: 0.9 },
      'T5.STP.LAM-TRON': { p: 0.6, mis: ['LAM-TRON-CAT-BO'] },
    },
  },
  {
    id: 'u-tuan4a5',
    activeRate: 0.85,
    perDay: [5, 7],
    base: 0.92,
    rules: {
      'T4.PS.RUT-GON': (d) => (d >= 7 ? { p: 0.15, mis: ['RUT-GON-CHUA-TOI-GIAN'] } : { p: 0.95 }),
      'T4.PS.TINH-CHAT': (d) => (d >= 7 ? { p: 0.45, mis: ['CONG-CUNG-SO-TU-MAU'] } : { p: 0.95 }),
    },
  },
  {
    id: 'u-vy4a6',
    activeRate: 0.75,
    perDay: [4, 7],
    base: 0.88,
    rules: {
      'T4.PS.QUY-DONG': { p: 0.3, mis: ['QUY-DONG-CHI-NHAN-MAU'] },
      'T4.PSPT.CONG-TRU': { p: 0.3, mis: ['CONG-TU-CONG-MAU'] },
      'T4.PS.RUT-GON': { p: 0.4, mis: ['RUT-GON-CHUA-TOI-GIAN'] },
      'T4.PS.TINH-CHAT': { p: 0.85 },
    },
  },
  {
    id: 'u-nam4a7',
    activeRate: 0.75,
    perDay: [4, 7],
    base: 0.88,
    rules: {
      'T4.STN.DOC-VIET': { p: 0.35, mis: ['DOC-SO-NHAM-LOP'] },
      'T4.STN.GIA-TRI-CHU-SO': { p: 0.25, mis: ['GIA-TRI-CHU-SO-NHAM-HANG'] },
      'T4.STN.LAM-TRON': { p: 0.25, mis: ['LAM-TRON-CAT-BO', 'LAM-TRON-SAI-HANG'] },
      'T4.STN.SAP-XEP': { p: 0.5 },
    },
  },
  { id: 'u-thao4a8', activeRate: 0.5, perDay: [3, 5], base: 0.85, rules: { 'T4.PT.CONG-TRU': { p: 0.35, mis: ['QUEN-NHO'] } } },
];

const POOL_TYPES = new Set(['MCQ', 'MCQ_MULTIPLE', 'SHORT_ANSWER', 'ORDERING', 'DRAG_DROP']);

export function correctResponse(it: Item): AnyResponse {
  switch (it.type) {
    case 'MCQ':
      return { choice: it.key!.correct };
    case 'MCQ_MULTIPLE':
      return { choices: [...it.key!.correct] };
    case 'SHORT_ANSWER':
      return { text: it.key!.accepted[0] };
    case 'ORDERING':
      return { order: [...it.key!.order] };
    case 'DRAG_DROP':
      return { placement: { ...it.key!.placement } };
    default:
      throw new Error(`synthetic: chưa hỗ trợ ${it.type}`);
  }
}

/** Câu trả lời SAI, ưu tiên thể hiện một trong các quan niệm sai `prefer`. Trả về kèm điểm từng phần. */
export function wrongResponse(it: Item, prefer: string[], rng: Rng): { response: AnyResponse; score: number } {
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rng() * xs.length) % xs.length];
  const table = (it.key as { misconceptions?: Record<string, string> } | null)?.misconceptions ?? {};
  const tableKeys = (codes: string[]) => Object.entries(table).filter(([, c]) => codes.includes(c)).map(([k]) => k);
  switch (it.type) {
    case 'MCQ': {
      const wrong = it.payload.options.filter((o) => o.id !== it.key!.correct);
      const pref = wrong.filter((o) => prefer.includes(o.misconception ?? table[o.id] ?? ''));
      return { response: { choice: pick(pref.length ? pref : wrong).id }, score: 0 };
    }
    case 'MCQ_MULTIPLE': {
      const correct = it.key!.correct;
      const wrong = it.payload.options.filter((o) => !correct.includes(o.id));
      const pref = wrong.filter((o) => prefer.includes(o.misconception ?? ''));
      const extra = pick(pref.length ? pref : wrong).id;
      return { response: { choices: [...correct.slice(0, correct.length - 1), extra] }, score: 0 };
    }
    case 'SHORT_ANSWER': {
      const pref = tableKeys(prefer);
      const any = Object.keys(table);
      return { response: { text: pref.length ? pick(pref) : any.length ? pick(any) : '0' }, score: 0 };
    }
    case 'ORDERING': {
      const pref = tableKeys(prefer);
      const order = pref.length ? pick(pref).split(',') : [...it.key!.order].reverse();
      return { response: { order }, score: 0 };
    }
    case 'DRAG_DROP': {
      const placement = { ...it.key!.placement };
      const pref = tableKeys(prefer);
      const zones = it.payload.zones.map((z) => z.id);
      if (pref.length) {
        const [tok, zone] = pick(pref).split('>');
        placement[tok] = zone;
      } else {
        const tok = it.payload.tokens[0].id;
        placement[tok] = zones.find((z) => z !== placement[tok]) ?? zones[0];
      }
      const n = it.payload.tokens.length;
      const ok = it.payload.tokens.filter((t) => placement[t.id] === it.key!.placement[t.id]).length;
      return { response: { placement }, score: n ? ok / n : 0 };
    }
    default:
      throw new Error(`synthetic: chưa hỗ trợ ${it.type}`);
  }
}

export interface SyntheticOutput {
  events: LearningEvent[];
  rewards: RewardEntry[];
  progress: LessonProgress[];
}

/**
 * Sinh lịch sử. `at(daysAgo, hour, minute)` do seed/index.ts truyền vào (giờ địa phương, không vượt "bây giờ").
 */
export function buildSynthetic4A(items: Item[], at: (daysAgo: number, hour: number, minute?: number) => string, lessonId: string): SyntheticOutput {
  const events: LearningEvent[] = [];
  const rewards: RewardEntry[] = [];
  const progress: LessonProgress[] = [];
  const g4 = items.filter((i) => i.subject === 'toan' && i.grade === 4 && POOL_TYPES.has(i.type) && i.key);
  const g3 = items.filter((i) => i.subject === 'toan' && i.grade === 3 && POOL_TYPES.has(i.type) && i.key);
  const g5 = items.filter((i) => i.subject === 'toan' && i.grade === 5 && POOL_TYPES.has(i.type) && i.key && (i.skills ?? []).some((s) => s.startsWith('T5.STP')));
  let ev = 0;
  let rw = 0;

  for (const plan of PLANS_4A) {
    const rng = mulberry32(hash(plan.id));
    const rewarded = new Set<string>();
    for (let d = 13; d >= 0; d--) {
      if (d > 0 && rng() > plan.activeRate) continue;
      const n = plan.perDay[0] + Math.floor(rng() * (plan.perDay[1] - plan.perDay[0] + 1));
      const pool = [...g4, ...(d % 4 === 0 ? g3 : []), ...(plan.grade5 && d % 2 === 0 ? g5 : [])];
      const chosen: Item[] = [];
      if (plan.grade5 && d % 2 === 0) chosen.push(...g5.filter(() => rng() < 0.6));
      // Mỗi ngày 2 câu thuộc phần "đặc trưng" của HS để hồ sơ rõ nét.
      const focus = g4.filter((i) => plan.rules[(i.skills ?? [])[0] ?? '']);
      for (let k = 0; k < 2 && focus.length; k++) {
        const it = focus[Math.floor(rng() * focus.length)];
        if (!chosen.includes(it)) chosen.push(it);
      }
      while (chosen.length < n + (plan.grade5 && d % 2 === 0 ? 2 : 0) && chosen.length < pool.length) {
        const it = pool[Math.floor(rng() * pool.length)];
        if (!chosen.includes(it)) chosen.push(it);
      }
      let minute = 5 + Math.floor(rng() * 20);
      const hour = 16 + Math.floor(rng() * 4);
      for (const it of chosen) {
        const main = (it.skills ?? [])[0] ?? '';
        const r = plan.rules[main];
        const rule: Rule = typeof r === 'function' ? r(d) : r ?? { p: plan.base };
        const ok = rng() < rule.p;
        const { response, score } = ok ? { response: correctResponse(it), score: 1 } : wrongResponse(it, rule.mis ?? [], rng);
        const ann = answerAnnotations(it, response, ok);
        const isArena = it.grade === 5;
        const t = at(d, hour, Math.min(59, (minute += 1 + Math.floor(rng() * 3))));
        events.push({
          id: `ev-4a-${++ev}`,
          userId: plan.id,
          verb: 'answered',
          objectType: 'item',
          objectId: it.id,
          result: { correct: ok, score, durationMs: 15_000 + Math.floor(rng() * 60_000), response, skills: ann.skills, misconceptions: ok ? [] : detectMisconceptions(it, response) },
          at: t,
        });
        const src = `${it.id}@${isArena ? 'arena' : 'practice'}`;
        if (ok && !rewarded.has(src)) {
          rewarded.add(src);
          rewards.push({ id: `rw-4a-${++rw}`, userId: plan.id, stars: 1, coins: 1, xp: 10, reason: `Trả lời đúng: ${it.prompt.text.slice(0, 38)}`, sourceType: isArena ? 'arena' : 'item', sourceId: src, at: t });
        }
      }
    }
  }

  /* ---- Tuấn: qua bộ ôn "Rút gọn phân số" (chặng 1) rồi lần ôn lại thứ nhất (chặng 2) → đến hạn ôn lại hôm nay ---- */
  const tuan = 'u-tuan4a5';
  const rg = 'T4.PS.RUT-GON';
  events.push(
    { id: `ev-4a-${++ev}`, userId: tuan, verb: 'completed', objectType: 'remediation', objectId: remediationSetId(tuan, rg, 0), result: { correct: true, score: 0.8, correctCount: 4, total: 5, skills: [rg, 'T4.PS.TINH-CHAT'] }, at: at(4, 17, 30) },
    { id: `ev-4a-${++ev}`, userId: tuan, verb: 'completed', objectType: 'remediation', objectId: remediationSetId(tuan, rg, 1), result: { correct: true, score: 1, correctCount: 3, total: 3, skills: [rg] }, at: at(3, 7, 0) },
  );

  /* ---- bài giảng Phân số (giao cho 4A) ---- */
  const slides = Array.from({ length: 8 }, (_, i) => `${lessonId}-s${i + 1}`);
  const done = (userId: string, daysAgo: number, stars: number) => {
    progress.push({ userId, lessonId, slideIndex: 7, completedSlides: slides, answers: {}, starsEarned: stars, completedAt: at(daysAgo, 18, 40), updatedAt: at(daysAgo, 18, 40) });
    events.push(
      { id: `ev-4a-${++ev}`, userId, verb: 'started', objectType: 'lesson', objectId: lessonId, lessonId, assignmentId: 'as-4a-phan-so', at: at(daysAgo, 18, 10) },
      { id: `ev-4a-${++ev}`, userId, verb: 'completed', objectType: 'lesson', objectId: lessonId, lessonId, assignmentId: 'as-4a-phan-so', result: { score: stars }, at: at(daysAgo, 18, 40) },
    );
    rewards.push({ id: `rw-4a-${++rw}`, userId, stars, coins: stars, xp: stars * 10 + 20, reason: 'Hoàn thành bài: Phân số', sourceType: 'lesson', sourceId: lessonId, at: at(daysAgo, 18, 40) });
  };
  done('u-hai4a1', 3, 5);
  done('u-tuan4a5', 2, 4);
  done('u-mai4a4', 1, 5);
  for (const [userId, n] of [['u-lan4a2', 4], ['u-khoa4a3', 2], ['u-vy4a6', 3]] as const) {
    progress.push({ userId, lessonId, slideIndex: n, completedSlides: slides.slice(0, n), answers: {}, starsEarned: 0, updatedAt: at(1, 19, 0) });
    events.push({ id: `ev-4a-${++ev}`, userId, verb: 'started', objectType: 'lesson', objectId: lessonId, lessonId, assignmentId: 'as-4a-phan-so', at: at(1, 18, 50) });
  }

  /* ---- lớp học trực tiếp hôm kia ---- */
  const live = 'live-4a-demo';
  for (const userId of ['u-hai4a1', 'u-lan4a2', 'u-khoa4a3', 'u-mai4a4', 'u-tuan4a5', 'u-vy4a6', 'u-nam4a7']) {
    events.push({ id: `ev-4a-${++ev}`, userId, verb: 'joined', objectType: 'live', objectId: live, liveSessionId: live, at: at(2, 9, 0) });
  }
  rewards.push(
    { id: `rw-4a-${++rw}`, userId: 'u-hai4a1', stars: 3, coins: 3, xp: 30, reason: 'Cô Thu khen: Em giảng bài cho bạn rất dễ hiểu', sourceType: 'behavior', at: at(2, 10, 0) },
    { id: `rw-4a-${++rw}`, userId: 'u-tuan4a5', stars: 2, coins: 2, xp: 20, reason: 'Cô Thu khen: Em tiến bộ rõ rệt phần phân số', sourceType: 'behavior', at: at(1, 10, 0) },
    { id: `rw-4a-${++rw}`, userId: 'u-mai4a4', stars: 6, coins: 6, xp: 60, reason: 'Leo tháp: lên tới tầng 9', sourceType: 'arena', sourceId: 'leo-thap', at: at(0, 7, 0) },
  );
  return { events, rewards, progress };
}
