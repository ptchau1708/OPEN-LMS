/**
 * Chấm một lần làm bài (thuần): mỗi câu điểm từng phần × điểm của ô; quy về thang 10 kiểu KTĐK
 * (TT27: số nguyên 1–10, không cho điểm 0, không điểm thập phân — làm tròn 0,5 lên).
 * Demo chấm bằng hàm này; Edge Function `grade` (action exam-finalize) có bản Deno tương đương trong
 * supabase/functions/grade/exam.ts — sửa luật ở đây thì sửa cả bên đó.
 */
import type { AnyResponse, ExamAnswer, ExamItemResult, ExamSlot, ExamStudentResult, Item, ScoreResult } from '@openedu/contracts';

export type ExamScoreFn = (item: Item, response: AnyResponse | undefined) => ScoreResult;

export interface AttemptScore {
  results: ExamItemResult[];
  score: number;
  maxScore: number;
  score10: number;
  correct: number;
  total: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Điểm thang 10: số nguyên, 0,5 làm tròn lên, tối thiểu 1. */
export function toScore10(score: number, maxScore: number): number {
  if (!(maxScore > 0)) return 1;
  const x = (Math.max(0, score) / maxScore) * 10;
  return Math.min(10, Math.max(1, Math.floor(x + 0.5 + 1e-9)));
}

export function scoreAttempt(slots: ExamSlot[], items: Record<string, Item | undefined>, answers: Record<string, ExamAnswer | undefined>, score: ExamScoreFn): AttemptScore {
  const results: ExamItemResult[] = [];
  let total = 0;
  let max = 0;
  let correct = 0;
  for (const s of slots) {
    if (!s.itemId) continue;
    const item = items[s.itemId];
    max += s.points;
    const ans = answers[s.itemId];
    let res: ScoreResult = { graded: true, correct: false, score: 0 };
    if (item && ans?.response !== undefined && ans.response !== null) {
      try {
        res = score(item, ans.response);
      } catch {
        res = { graded: true, correct: false, score: 0 };
      }
    }
    const frac = Number.isFinite(res.score) ? Math.min(1, Math.max(0, res.score)) : 0;
    const ok = !!res.graded && !!res.correct;
    const earned = r2(frac * s.points);
    if (ok) correct++;
    total += earned;
    results.push({ itemId: s.itemId, slotId: s.id, correct: ok, score: frac, earned, points: s.points });
  }
  total = r2(total);
  max = r2(max);
  return { results, score: total, maxScore: max, score10: toScore10(total, max), correct, total: results.length };
}

/** Gợi ý mức cho GV từ điểm KTĐK (T ≥ 9, H ≥ 5, còn lại C) — chỉ tham khảo. */
export function levelFromScore10(s: number): 'T' | 'H' | 'C' {
  return s >= 9 ? 'T' : s >= 5 ? 'H' : 'C';
}

/** Kết quả cho HS: chưa công bố thì không có điểm. `order` = id câu theo thứ tự em đã làm. */
export function studentResultView(
  base: { examId: string; title: string; submittedAt?: string | null },
  released: boolean,
  scored: Pick<AttemptScore, 'results' | 'score' | 'maxScore' | 'score10'> | null,
  order: string[],
): ExamStudentResult {
  if (!released || !scored) return { ...base, released: false };
  const by = new Map(scored.results.map((r) => [r.itemId, r]));
  const perQuestion = order.filter((id) => by.has(id)).map((id, i) => ({ no: i + 1, correct: !!by.get(id)?.correct }));
  return {
    ...base,
    released: true,
    score10: scored.score10,
    score: scored.score,
    maxScore: scored.maxScore,
    correct: scored.results.filter((r) => r.correct).length,
    total: scored.results.length,
    perQuestion,
  };
}
