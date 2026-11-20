/**
 * Edge Function `grade` — action 'exam-finalize': chấm và nộp một lần làm bài kiểm tra (Phase 6, docs/PHASE6_EXAM.md).
 *
 * Vào: { action: 'exam-finalize', attemptId }
 *   - HS chủ bài: nộp bài (đang làm). GV của lớp / admin: chỉ nộp hộ bài đã QUÁ GIỜ (hết giờ + 30 giây).
 * Làm: đọc đề + câu trả lời + đáp án bằng service role, chấm bằng scoreItem (cùng mã với trình duyệt),
 *   quy điểm thang 10 (toScore10 — bản Deno của packages/data/src/exam/scoring.ts), ghi v2.exam_record_results
 *   (một giao dịch: điểm + learning_events 'exam' có kĩ năng), rồi tính lại skill_mastery. Không cộng sao.
 * Ra: như v2.exam_my_result — chưa công bố thì không có điểm.
 */
import { scoreItem } from '../_shared/scoring/scoring.ts';
import type { AnyResponse, Item } from '../_shared/scoring/contracts.ts';
import { HttpError, requireString } from '../_shared/http.ts';
import { fromPgError, isStaff, type AdminClient, type Caller } from '../_shared/supabase.ts';
import { refreshMastery } from '../_shared/mastery-store.ts';
import { detectMisconceptions, isGradedType } from '../_shared/mastery/index.ts';

type Row = Record<string, unknown>;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Điểm KTĐK: số nguyên 1–10, 0,5 làm tròn lên (giống packages/data/src/exam/scoring.ts). */
export function toScore10(score: number, max: number): number {
  if (!(max > 0)) return 1;
  return Math.min(10, Math.max(1, Math.floor((Math.max(0, score) / max) * 10 + 0.5 + 1e-9)));
}

export async function handleExamFinalize(admin: AdminClient, caller: Caller, body: Row): Promise<unknown> {
  const attemptId = requireString(body.attemptId, 'attemptId', 64);
  const at = await admin.from('exam_attempts').select('*').eq('id', attemptId).maybeSingle();
  if (at.error) throw fromPgError(at.error);
  const a = at.data as Row | null;
  if (!a) throw new HttpError(404, 'Không tìm thấy bài làm.', 'not_found');
  const ex = await admin.from('exams').select('*').eq('id', a.exam_id).maybeSingle();
  if (ex.error) throw fromPgError(ex.error);
  const e = ex.data as Row | null;
  if (!e) throw new HttpError(404, 'Không tìm thấy bài kiểm tra.', 'not_found');

  const overdue = Date.parse(String(a.deadline_at)) + 30_000 < Date.now();
  if (a.student_id !== caller.id) {
    let teacher = caller.role === 'admin';
    if (!teacher && isStaff(caller)) {
      const c = await admin.from('classes').select('teacher_id').eq('id', e.class_id).maybeSingle();
      const m = await admin.from('class_members').select('user_id').eq('class_id', e.class_id).eq('user_id', caller.id).eq('role', 'teacher').maybeSingle();
      teacher = (c.data as Row | null)?.teacher_id === caller.id || !!m.data;
    }
    if (!teacher) throw new HttpError(403, 'Em chỉ nộp được bài của mình.', 'forbidden');
    if (!overdue) throw new HttpError(409, 'Bài của em này chưa hết giờ.', 'conflict');
  }

  if (a.status === 'in-progress') {
    const variant = String(a.variant);
    const slots = (((e.paper as Row)?.[variant] ?? []) as Row[]).filter((s) => typeof s.itemId === 'string' && s.itemId);
    const ids = slots.map((s) => String(s.itemId));
    const [items, keys, answers, tags] = await Promise.all([
      admin.from('items').select('id, type, grade, subject, prompt, payload, tags').in('id', ids),
      admin.from('item_keys').select('item_id, key').in('item_id', ids),
      admin.from('exam_answers').select('item_id, response, ms').eq('attempt_id', attemptId),
      admin.from('item_skills').select('item_id, skill_code, position').in('item_id', ids).order('position'),
    ]);
    for (const r of [items, keys, answers, tags]) if (r.error) throw fromPgError(r.error);
    const keyOf = new Map(((keys.data ?? []) as Row[]).map((k) => [String(k.item_id), k.key]));
    const itemOf = new Map(((items.data ?? []) as Row[]).map((r) => [String(r.id), { ...r, key: keyOf.get(String(r.id)) } as unknown as Item]));
    const ansOf = new Map(((answers.data ?? []) as Row[]).map((r) => [String(r.item_id), r]));
    const skillsOf = new Map<string, string[]>();
    for (const t of (tags.data ?? []) as Row[]) skillsOf.set(String(t.item_id), [...(skillsOf.get(String(t.item_id)) ?? []), String(t.skill_code)]);

    const results: Row[] = [];
    const events: Row[] = [];
    let score = 0;
    let max = 0;
    for (const s of slots) {
      const id = String(s.itemId);
      const item = itemOf.get(id);
      const points = Number(s.points) || 0;
      max += points;
      const ans = ansOf.get(id);
      let frac = 0;
      let ok = false;
      if (item && ans && ans.response !== null && ans.response !== undefined) {
        try {
          const r = scoreItem(item, ans.response as AnyResponse);
          frac = Number.isFinite(r.score) ? Math.min(1, Math.max(0, r.score)) : 0;
          ok = !!r.graded && !!r.correct;
        } catch (err) {
          console.warn('exam score error', id, err);
        }
      }
      const earned = r2(frac * points);
      score += earned;
      results.push({ itemId: id, slotId: s.id, correct: ok, score: frac, earned, points });
      if (item && isGradedType(item.type)) {
        events.push({
          itemId: id, correct: ok, score: frac, durationMs: ans ? Number(ans.ms) || 0 : 0,
          skills: skillsOf.get(id) ?? [], misconceptions: ok || !ans ? [] : detectMisconceptions(item, ans.response),
        });
      }
    }
    score = r2(score);
    max = r2(max);
    const rec = await admin.rpc('exam_record_results', {
      p_attempt: attemptId, p_results: results, p_score: score, p_max: max, p_score10: toScore10(score, max),
      p_auto: overdue || a.student_id !== caller.id, p_events: events,
    });
    if (rec.error) throw fromPgError(rec.error);
    const skills = [...new Set(events.flatMap((x) => x.skills as string[]))];
    if (rec.data === true && skills.length) {
      try {
        await refreshMastery(admin, String(a.student_id), skills);
      } catch (err) {
        console.warn('exam mastery update failed', attemptId, err);
      }
    }
  }

  // Trả kết quả theo chế độ công bố (đọc lại sau khi ghi).
  const again = await admin.from('exam_attempts').select('*').eq('id', attemptId).maybeSingle();
  if (again.error) throw fromPgError(again.error);
  const done = again.data as Row;
  const released = e.results_policy === 'immediate' || !!e.released_at;
  const base = { examId: e.id, title: e.title, submittedAt: done.submitted_at, released };
  if (!released) return base;
  const slots = (((e.paper as Row)?.[String(done.variant)] ?? []) as Row[]).filter((s) => s.itemId);
  return {
    ...base,
    score: Number(done.score), maxScore: Number(done.max_score), score10: Number(done.score10), seed: Number(done.seed),
    results: ((done.results ?? []) as Row[]).map((r) => ({ itemId: r.itemId, correct: r.correct === true })),
    entries: slots.map((s) => ({ id: s.itemId, qtype: s.qtype === 'tl' ? 'tl' : 'tn' })),
  };
}
