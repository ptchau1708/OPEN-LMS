/**
 * Edge Function `grade` — action 'onthi-finalize': chấm và nộp một lần làm bài luyện Ôn thi (docs/ON_THI.md).
 *
 * Vào: { action: 'onthi-finalize', attemptId }
 *   - HS chủ bài: nộp bài. Thầy/cô / quản trị: chỉ nộp hộ bài đã QUÁ GIỜ (hết giờ + 30 giây).
 * Làm: đọc bài + câu trả lời + đáp án bằng service role, chấm bằng scoreItem / isComplete (cùng mã với trình duyệt),
 *   quy điểm theo kiểu bài (onThiPoints — bản Deno của packages/data/src/onthi/scoring.ts), ghi v2.onthi_record_results.
 *   Không cộng sao, không ghi sự kiện học tập (đây là bài luyện thi thử).
 * Ra: như v2.onthi_result (kèm đáp án khi bài luyện cho xem lại có đáp án).
 */
import { isComplete, scoreItem } from '../_shared/scoring/scoring.ts';
import type { AnyResponse, Item, ScoreResult } from '../_shared/scoring/contracts.ts';
import { HttpError, requireString } from '../_shared/http.ts';
import { fromPgError, isStaff, type AdminClient, type Caller } from '../_shared/supabase.ts';

type Row = Record<string, unknown>;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Giống packages/data/src/onthi/scoring.ts: cả-hoặc-không; kiểu VioEdu + Đúng – Sai nhiều ý: điểm lũy tiến. */
export function onThiPoints(style: string, type: string, r: Pick<ScoreResult, 'graded' | 'correct' | 'score'>, points: number): number {
  if (!r.graded) return 0;
  if (style === 'vio' && type === 'TRUE_FALSE_MULTI') return r2(Math.max(0, Math.min(1, Number(r.score) || 0)) * points);
  return r.correct ? points : 0;
}

export async function handleOnThiFinalize(admin: AdminClient, caller: Caller, body: Row): Promise<unknown> {
  const attemptId = requireString(body.attemptId, 'attemptId', 64);
  const at = await admin.from('onthi_attempts').select('*').eq('id', attemptId).maybeSingle();
  if (at.error) throw fromPgError(at.error);
  const a = at.data as Row | null;
  if (!a) throw new HttpError(404, 'Không tìm thấy bài làm.', 'not_found');
  const st = await admin.from('onthi_sets').select('*').eq('id', a.set_id).maybeSingle();
  if (st.error) throw fromPgError(st.error);
  const s = st.data as Row | null;
  if (!s) throw new HttpError(404, 'Không tìm thấy bài luyện.', 'not_found');

  const overdue = Date.parse(String(a.deadline_at)) + 30_000 < Date.now();
  if (a.student_id !== caller.id) {
    if (!isStaff(caller)) throw new HttpError(403, 'Em chỉ nộp được bài của mình.', 'forbidden');
    if (!overdue) throw new HttpError(409, 'Bài của em này chưa hết giờ.', 'conflict');
  }

  if (a.status === 'in-progress') {
    const ids = ((s.item_ids ?? []) as string[]).filter((x) => typeof x === 'string');
    const [items, keys, answers] = await Promise.all([
      admin.from('items').select('id, type, grade, subject, prompt, payload, tags').in('id', ids),
      admin.from('item_keys').select('item_id, key').in('item_id', ids),
      admin.from('onthi_answers').select('item_id, response, ms').eq('attempt_id', attemptId),
    ]);
    for (const r of [items, keys, answers]) if (r.error) throw fromPgError(r.error);
    const keyOf = new Map(((keys.data ?? []) as Row[]).map((k) => [String(k.item_id), k.key]));
    const itemOf = new Map(((items.data ?? []) as Row[]).map((r) => [String(r.id), { ...r, key: keyOf.get(String(r.id)) } as unknown as Item]));
    const ansOf = new Map(((answers.data ?? []) as Row[]).map((r) => [String(r.item_id), r]));
    const style = String(s.style);
    const points = Number(s.points) || 0;
    const results: Row[] = [];
    let score = 0;
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    for (const id of ids) {
      const item = itemOf.get(id);
      const ans = ansOf.get(id);
      const resp = ans && ans.response !== null && ans.response !== undefined ? (ans.response as AnyResponse) : undefined;
      let answered = false;
      let res: ScoreResult = { graded: false, correct: false, score: 0 };
      if (item && resp !== undefined) {
        try { answered = isComplete(item, resp); } catch { answered = true; }
        if (answered) {
          try { res = scoreItem(item, resp); } catch (err) { console.warn('onthi score error', id, err); res = { graded: true, correct: false, score: 0 }; }
        }
      }
      const earned = answered && item ? onThiPoints(style, String(item.type), res, points) : 0;
      const ok = answered && !!res.graded && !!res.correct;
      if (!answered) skipped++;
      else if (ok) correct++;
      else wrong++;
      score += earned;
      results.push({ itemId: id, type: item ? item.type : 'MCQ', answered, correct: ok, earned, points, ms: ans ? Math.max(0, Number(ans.ms) || 0) : 0 });
    }
    const rec = await admin.rpc('onthi_record_results', {
      p_attempt: attemptId, p_results: results, p_score: r2(score), p_max: r2(ids.length * points),
      p_correct: correct, p_wrong: wrong, p_skipped: skipped, p_auto: overdue || a.student_id !== caller.id,
    });
    if (rec.error) throw fromPgError(rec.error);
    return rec.data;
  }
  // Đã nộp: onthi_record_results không ghi lại, chỉ trả kết quả cũ.
  const rec = await admin.rpc('onthi_record_results', { p_attempt: attemptId, p_results: [], p_score: 0, p_max: 0, p_correct: 0, p_wrong: 0, p_skipped: 0, p_auto: false });
  if (rec.error) throw fromPgError(rec.error);
  return rec.data;
}
