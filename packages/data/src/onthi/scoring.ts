/**
 * Ôn thi — phần THUẦN dùng chung cho demo và kiểm thử (Edge Function `grade` có bản Deno tương đương ở
 * supabase/functions/grade/onthi.ts: onThiPoints, summarize).
 */
import type {
  AnyResponse,
  Item,
  OnThiBest,
  OnThiBoardRow,
  OnThiCard,
  OnThiItemResult,
  OnThiSet,
  OnThiStyle,
  ScoreResult,
} from '@openedu/contracts';

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Điểm một câu: cả-hoặc-không (đúng hết mới được điểm). Riêng kiểu VioEdu, câu Đúng – Sai nhiều ý lấy điểm lũy tiến
 * (score của bộ chấm: 4 ý → 0,2 / 0,4 / 0,65 / 1).
 */
export function onThiPoints(style: OnThiStyle, type: Item['type'], r: Pick<ScoreResult, 'graded' | 'correct' | 'score'>, points: number): number {
  if (!r.graded) return 0;
  if (style === 'vio' && type === 'TRUE_FALSE_MULTI') return r2(Math.max(0, Math.min(1, Number(r.score) || 0)) * points);
  return r.correct ? points : 0;
}

export interface SummaryInput {
  style: OnThiStyle;
  points: number;
  items: Item[];
  answers: Record<string, { response: AnyResponse | null; ms: number } | undefined>;
  score: (item: Item, response: AnyResponse | undefined) => ScoreResult;
  isComplete: (item: Item, response: AnyResponse | undefined) => boolean;
}

export interface Summary {
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  skipped: number;
  items: OnThiItemResult[];
}

/** Chấm cả bài. Câu chưa làm xong (isComplete = false) tính là bỏ qua, không tính là sai. */
export function summarize(x: SummaryInput): Summary {
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  const items: OnThiItemResult[] = [];
  for (const it of x.items) {
    const a = x.answers[it.id];
    const resp = a && a.response !== null && a.response !== undefined ? a.response : undefined;
    let answered = false;
    try { answered = resp !== undefined && x.isComplete(it, resp); } catch { answered = resp !== undefined; }
    let res: ScoreResult = { graded: false, correct: false, score: 0 };
    if (answered) {
      try { res = x.score(it, resp); } catch { res = { graded: true, correct: false, score: 0 }; }
    }
    const earned = answered ? onThiPoints(x.style, it.type, res, x.points) : 0;
    const ok = answered && !!res.graded && !!res.correct;
    if (!answered) skipped++;
    else if (ok) correct++;
    else wrong++;
    score += earned;
    items.push({ itemId: it.id, type: it.type, answered, correct: ok, earned, points: x.points, ms: Math.max(0, Math.round(a?.ms ?? 0)) });
  }
  return { score: r2(score), maxScore: r2(x.items.length * x.points), correct, wrong, skipped, items };
}

/** So sánh hai kết quả: điểm cao hơn → thời gian ngắn hơn → ít câu sai hơn → làm sớm hơn. */
export function compareOnThi(a: Pick<OnThiBest, 'score' | 'durationMs' | 'wrong' | 'at'>, b: Pick<OnThiBest, 'score' | 'durationMs' | 'wrong' | 'at'>): number {
  return b.score - a.score || a.durationMs - b.durationMs || a.wrong - b.wrong || a.at.localeCompare(b.at);
}

/** Xếp hạng (hạng bằng nhau khi trùng cả điểm, thời gian, số câu sai). */
export function rankRows<T extends Omit<OnThiBoardRow, 'rank'> & { at: string }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort(compareOnThi);
  let rank = 0;
  return sorted.map((r, i) => {
    const p = sorted[i - 1];
    if (!p || p.score !== r.score || p.durationMs !== r.durationMs || p.wrong !== r.wrong) rank = i + 1;
    return { ...r, rank };
  });
}

/** Sắp các bài cùng nhóm (kiểu, khối, môn) theo thứ tự hiện. */
export function orderSets(sets: OnThiSet[]): OnThiSet[] {
  return [...sets].sort((a, b) => a.position - b.position || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
}

/**
 * Thẻ bài luyện cho em: khóa khi bài bật "khóa theo thứ tự" và em chưa đạt bài liền trước cùng môn.
 * `bestOf(setId)`: kết quả tốt nhất của em; `attemptsOf`: số lần đã nộp; `openOf`: lần đang làm.
 */
export function buildCards(
  sets: OnThiSet[],
  bestOf: (setId: string) => OnThiBest | undefined,
  attemptsOf: (setId: string) => number,
  openOf: (setId: string) => { attemptId: string; deadlineAt: string } | undefined,
): OnThiCard[] {
  const out: OnThiCard[] = [];
  const bySubject = new Map<string, OnThiSet[]>();
  for (const s of orderSets(sets)) bySubject.set(s.subject, [...(bySubject.get(s.subject) ?? []), s]);
  for (const list of bySubject.values()) {
    list.forEach((s, i) => {
      const prev = i > 0 ? list[i - 1] : undefined;
      const locked = !!(s.lockOrder && prev && !bestOf(prev.id)?.passed);
      const best = bestOf(s.id);
      const open = openOf(s.id);
      out.push({
        setId: s.id, style: s.style, title: s.title, subject: s.subject, grade: s.grade, questions: s.itemIds.length, minutes: s.minutes,
        points: s.points, maxScore: r2(s.itemIds.length * s.points), passScore: s.passScore, position: s.position, showBoard: s.showBoard,
        locked, ...(locked && prev ? { lockedBy: prev.title } : {}), attempts: attemptsOf(s.id), ...(best ? { best } : {}), ...(open ? { inProgress: open } : {}),
      });
    });
  }
  return out.sort((a, b) => a.subject.localeCompare(b.subject) || a.position - b.position);
}

/** Kiểm tra dữ liệu bài luyện trước khi lưu; trả về câu báo lỗi đầu tiên (hoặc null). */
export function validateSet(s: Pick<OnThiSet, 'title' | 'itemIds' | 'minutes' | 'points' | 'passScore'>, maxItems = 60): string | null {
  if (!s.title.trim()) return 'Bài luyện cần có tên.';
  if (s.title.trim().length > 120) return 'Tên bài luyện tối đa 120 kí tự.';
  if (!s.itemIds.length) return 'Bài luyện cần ít nhất 1 câu hỏi.';
  if (s.itemIds.length > maxItems) return `Bài luyện tối đa ${maxItems} câu.`;
  if (new Set(s.itemIds).size !== s.itemIds.length) return 'Có câu hỏi bị lặp trong bài luyện.';
  if (!(s.minutes >= 1 && s.minutes <= 180)) return 'Thời gian làm bài từ 1 đến 180 phút.';
  if (!(s.points > 0 && s.points <= 100)) return 'Điểm mỗi câu từ 0,5 đến 100.';
  const max = s.itemIds.length * s.points;
  if (!(s.passScore >= 0 && s.passScore <= max)) return `Mức đạt từ 0 đến ${r2(max)} điểm.`;
  return null;
}

/** "12:05" từ mili giây. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
