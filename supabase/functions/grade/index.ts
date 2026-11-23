/**
 * Edge Function `grade` — chấm câu trả lời ở server (máy HS không có đáp án).
 *
 * Vào:  { itemId, response, context?: { lessonId?, assignmentId?, liveSessionId?, slideIndex?, durationMs?, duelId?, duelQ? } }
 *       assignmentId của lần giao khóa bài khi quá hạn (late_policy 'lock') → 403 past_due.
 *       Có duelId (Đấu 1–1): ghi v2.duel_record_answer (điểm = đúng + thưởng tốc độ), learning_events 'arena', không cộng sao;
 *       ra thêm { points, ms }.
 * Ra:   { correct, score, graded, parts?, starsAwarded, wallet, newlyUnlocked, duplicate? }
 * Hàng đợi offline (docs/PHASE6_OFFLINE.md): thêm { clientEventId, answeredAt }. clientEventId đã nhận → trả kết quả cũ,
 *       không cộng sao lần hai (unique index learning_events (user_id, client_event_id)). answeredAt: tương lai → kẹp về
 *       hiện tại; cũ hơn 14 ngày → 422 'stale_answer'.
 *
 * 1. Xác thực người gọi (JWT của người dùng).
 * 2. Đọc item + đáp án bằng service role, chấm bằng mã scoring chép từ activity-engine (tools/sync-scoring.mjs).
 * 3. Gọi v2.record_grade (một giao dịch): learning_events, live_responses (nếu liveSessionId),
 *    cộng sao lần đúng ĐẦU TIÊN theo (HS, item, ngữ cảnh bài/lớp trực tiếp), lesson_progress.answers (nếu lessonId).
 * 4. Ghi kèm skills + misconceptions vào sự kiện (v2.annotate_answer) rồi tính lại skill_mastery cho các kĩ năng
 *    của câu bằng mã thuần _shared/mastery (chép từ packages/data/src/mastery). Lỗi ở bước này không làm hỏng việc chấm.
 *
 * Bài kiểm tra (Phase 6) — Vào: { action: 'exam-finalize', attemptId } → grade/exam.ts (chấm + nộp, điểm thang 10, sự kiện 'exam').
 * Chế độ bộ ôn tập — Vào: { action: 'remediation', setId, itemIds: string[], rootSkill? }
 *   Server tự đếm đúng/sai từ câu trả lời GẦN NHẤT (≤ 3 giờ) của từng item, ghi learning_events
 *   (completed/remediation), tính lại skill_mastery. Ra: { setId, skillCode, passed, correct, total, mastery, message }.
 */
import { scoreItem } from '../_shared/scoring/scoring.ts';
import type { AnyResponse, Item, ItemType, ScoreResult } from '../_shared/scoring/contracts.ts';
import {
  HttpError,
  isObject,
  optionalInt,
  optionalString,
  optionalUuid,
  readJsonObject,
  requireString,
  serveJson,
} from '../_shared/http.ts';
import { adminClient, fromPgError, requireCaller } from '../_shared/supabase.ts';
import { refreshMastery } from '../_shared/mastery-store.ts';
import { handleExamFinalize } from './exam.ts';
import { checkAnsweredAt, validClientEventId } from '../_shared/offline.ts';
import { SKILL_BY_CODE, type SkillMastery } from '../_shared/scoring/contracts.ts';
import {
  detectMisconceptions,
  evaluateRemediation,
  isGradedType,
  parseRemediationSetId,
  remediationMessage,
} from '../_shared/mastery/index.ts';

type Admin = ReturnType<typeof adminClient>;

/** refreshMastery: _shared/mastery-store.ts (dùng chung với ai-grade; tính cả bài làm 'work'). */

async function handleRemediation(admin: Admin, userId: string, body: Record<string, unknown>) {
  const setId = requireString(body.setId, 'setId', 300);
  const parsed = parseRemediationSetId(setId);
  if (!parsed || parsed.userId !== userId) throw new HttpError(400, 'Bộ ôn tập không hợp lệ.', 'bad_request');
  if (!SKILL_BY_CODE[parsed.skillCode]) throw new HttpError(400, 'Mã kĩ năng không có trong danh mục.', 'bad_request');
  const rootSkill = optionalString(body.rootSkill, 'rootSkill');
  const itemIds = Array.isArray(body.itemIds) ? [...new Set(body.itemIds.filter((x): x is string => typeof x === 'string' && x.length <= 128))] : [];
  if (itemIds.length < 1 || itemIds.length > 10) throw new HttpError(400, 'Cần 1–10 câu hỏi trong bộ ôn tập.', 'bad_request');

  // Câu trả lời gần nhất (≤ 3 giờ) của từng câu — không tin kết quả do máy HS gửi.
  const since = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const { data, error } = await admin
    .from('learning_events')
    .select('object_id, at, correct:result->correct')
    .eq('user_id', userId)
    .eq('verb', 'answered')
    .in('object_id', itemIds)
    .gte('at', since)
    .order('at', { ascending: false });
  if (error) throw fromPgError(error);
  const latest = new Map<string, boolean>();
  for (const r of (data ?? []) as Record<string, unknown>[]) if (!latest.has(String(r.object_id))) latest.set(String(r.object_id), r.correct === true);
  const { correct, total, passed } = evaluateRemediation(itemIds.map((id) => ({ itemId: id, correct: latest.get(id) === true })));

  const skills = [parsed.skillCode, ...(rootSkill && rootSkill !== parsed.skillCode && SKILL_BY_CODE[rootSkill] ? [rootSkill] : [])];
  const ins = await admin.from('learning_events').insert({
    user_id: userId,
    verb: 'completed',
    object_type: 'remediation',
    object_id: setId.slice(0, 128),
    result: { correct: passed, score: Math.round((correct / total) * 100) / 100, correctCount: correct, total, skills, itemIds },
  });
  if (ins.error) throw fromPgError(ins.error);
  const list = await refreshMastery(admin, userId, skills);
  const mastery = list.find((m) => m.skillCode === parsed.skillCode);
  if (!mastery) throw new HttpError(500, 'Chưa tính được mức thành thạo.', 'internal');
  return { setId, skillCode: parsed.skillCode, passed, correct, total, mastery, message: remediationMessage(passed, mastery.reviewStage, correct, total) };
}

const ITEM_TYPES: ReadonlySet<string> = new Set<ItemType>([
  'MCQ', 'MCQ_MULTIPLE', 'MATCHING', 'ORDERING', 'DRAG_DROP', 'SHORT_ANSWER', 'SENTENCE_SCRAMBLE', 'WORD_CLASSIFY',
  'FILL_IN_PASSAGE', 'INLINE_DROPDOWN', 'LISTEN_CHOOSE', 'HOTSPOT', 'DRAW', 'RECORD_READ', 'MATH_MANIPULATIVE', 'POLL',
]);

/** Hình vẽ (DRAW) gửi dạng dataUrl nên cho phép thân yêu cầu tới ~600 KB. */
const MAX_BODY_BYTES = 600_000;

interface ItemRow {
  id: string;
  type: string;
  grade: number;
  subject: string;
  skill: string | null;
  difficulty: string | null;
  prompt: unknown;
  payload: unknown;
  hint: string | null;
  explanation: string | null;
  stars: number;
  tags: string[] | null;
  updated_at: string;
}

interface RecordGradeResult {
  duplicate?: boolean;
  correct?: boolean;
  score?: number;
  starsAwarded: number;
  wallet: unknown;
  newlyUnlocked: string[];
}

function toItem(row: ItemRow, key: unknown): Item {
  const item: Record<string, unknown> = {
    id: row.id,
    type: row.type,
    grade: row.grade,
    subject: row.subject,
    prompt: row.prompt,
    payload: row.payload,
    stars: row.stars,
    tags: row.tags ?? [],
    updatedAt: row.updated_at,
  };
  if (row.skill) item.skill = row.skill;
  if (row.difficulty) item.difficulty = row.difficulty;
  if (key !== undefined && key !== null) item.key = key;
  // Dữ liệu đọc từ CSDL đã qua ràng buộc type/payload; ép kiểu về union Item của contracts.
  return item as unknown as Item;
}

function safeScore(item: Item, response: AnyResponse): ScoreResult {
  try {
    const r = scoreItem(item, response);
    const score = Number.isFinite(r.score) ? Math.min(1, Math.max(0, r.score)) : 0;
    return { graded: !!r.graded, correct: !!r.graded && !!r.correct, score, parts: r.parts };
  } catch (e) {
    // Câu trả lời sai định dạng không được làm sập hàm: coi như chưa đúng.
    console.warn('score error', item.id, e);
    return { graded: true, correct: false, score: 0 };
  }
}

serveJson(async (req) => {
  const caller = await requireCaller(req);
  const body = await readJsonObject(req, MAX_BODY_BYTES);
  if (body.action === 'remediation') return handleRemediation(adminClient(), caller.id, body);
  if (body.action === 'exam-finalize') return handleExamFinalize(adminClient(), caller, body);

  const itemId = requireString(body.itemId, 'itemId');
  if (!('response' in body) || body.response === undefined || body.response === null) {
    throw new HttpError(400, 'Thiếu câu trả lời ("response").', 'bad_request');
  }
  const response = body.response as AnyResponse;
  const ctx = isObject(body.context) ? body.context : {};
  const lessonId = optionalString(ctx.lessonId, 'context.lessonId');
  const assignmentId = optionalString(ctx.assignmentId, 'context.assignmentId');
  const liveSessionId = optionalUuid(ctx.liveSessionId, 'context.liveSessionId');
  const slideIndex = optionalInt(ctx.slideIndex, 'context.slideIndex', 0, 10_000);
  const durationMs = optionalInt(ctx.durationMs, 'context.durationMs', 0, 86_400_000);
  const clientEventId = validClientEventId(body.clientEventId);
  const answeredAtRaw = typeof body.answeredAt === 'string' ? body.answeredAt : undefined;
  const plaus = checkAnsweredAt(answeredAtRaw, Date.now());
  if (plaus === 'stale') throw new HttpError(422, 'stale_answer: câu trả lời đã quá 14 ngày nên không ghi nhận được.', 'stale_answer');
  const answeredAt = plaus === 'ok' && answeredAtRaw ? new Date(answeredAtRaw).toISOString() : null;

  const admin = adminClient();
  // Lần giao khóa bài khi quá hạn (SQL 13, late_policy = 'lock'): không nhận câu trả lời mới. Bản CSDL cũ chưa có cột → bỏ qua.
  if (assignmentId) {
    const { data: asg, error: ae } = await admin.from('assignments').select('due_at, late_policy').eq('id', assignmentId).maybeSingle();
    const a = asg as { due_at: string | null; late_policy?: string } | null;
    const answeredMs = answeredAt ? Date.parse(answeredAt) : Date.now();
    if (!ae && a?.late_policy === 'lock' && a.due_at && Date.parse(a.due_at) < answeredMs) {
      throw new HttpError(403, 'Bài này đã hết hạn nộp nên không nhận thêm câu trả lời.', 'past_due');
    }
  }
  const [itemRes, keyRes] = await Promise.all([
    admin
      .from('items')
      .select('id, type, grade, subject, skill, difficulty, prompt, payload, hint, explanation, stars, tags, updated_at')
      .eq('id', itemId)
      .maybeSingle(),
    admin.from('item_keys').select('key').eq('item_id', itemId).maybeSingle(),
  ]);
  if (itemRes.error) throw fromPgError(itemRes.error);
  if (keyRes.error) throw fromPgError(keyRes.error);
  if (!itemRes.data) throw new HttpError(404, 'Không tìm thấy câu hỏi.', 'not_found');
  const row = itemRes.data as ItemRow;
  if (!ITEM_TYPES.has(row.type)) throw new HttpError(400, `Dạng câu hỏi "${row.type}" chưa hỗ trợ chấm.`, 'invalid');

  const keyRow = keyRes.data as { key: unknown } | null;
  const item = toItem(row, keyRow ? keyRow.key : undefined);
  const result = safeScore(item, response);

  // Đấu 1–1: ghi vào v2.duel_answers + learning_events 'arena' (có kĩ năng); không cộng sao từng câu (sao tính ở duel_finish).
  const duelId = optionalUuid(ctx.duelId, 'context.duelId');
  if (duelId) {
    const duelQ = optionalInt(ctx.duelQ, 'context.duelQ', 0, 9);
    if (duelQ === undefined || duelQ === null) throw new HttpError(400, 'Thiếu số thứ tự câu trong trận ("context.duelQ").', 'bad_request');
    let skills: string[] = [];
    try {
      const tags = await admin.from('item_skills').select('skill_code, position').eq('item_id', itemId).order('position');
      if (tags.error) throw fromPgError(tags.error);
      skills = ((tags.data ?? []) as { skill_code: string }[]).map((t) => t.skill_code);
    } catch (e) {
      console.warn('duel skills lookup failed', itemId, e);
    }
    const misconceptions = result.correct || !isGradedType(item.type) ? [] : detectMisconceptions(item, response);
    const rec = await admin.rpc('duel_record_answer', {
      p_user: caller.id,
      p_duel: duelId,
      p_q: duelQ,
      p_item: itemId,
      p_correct: result.correct,
      p_score: result.score,
      p_ms: durationMs ?? 20_000,
      p_response: null,
      p_skills: skills,
      p_misconceptions: misconceptions,
    });
    if (rec.error) throw fromPgError(rec.error);
    const out = (rec.data ?? {}) as { points?: number; ms?: number; correct?: boolean; recorded?: boolean };
    let mastery: SkillMastery[] = [];
    if (out.recorded && skills.length && result.graded) {
      try {
        mastery = await refreshMastery(admin, caller.id, skills);
      } catch (e) {
        console.warn('mastery update failed', itemId, e);
      }
    }
    // Không trả parts/đáp án: bạn kia không thể suy ra lựa chọn.
    const correct = out.recorded === false && typeof out.correct === 'boolean' ? out.correct : result.correct;
    return { correct, score: result.score, graded: result.graded, points: out.points ?? 0, ms: out.ms ?? durationMs ?? 20_000, starsAwarded: 0, skills, mastery };
  }

  const { data, error } = await admin.rpc('record_grade', {
    p_user: caller.id,
    p_item_id: itemId,
    p_response: response,
    p_graded: result.graded,
    p_correct: result.correct,
    p_score: result.score,
    p_lesson_id: lessonId,
    p_assignment_id: assignmentId,
    p_live_session_id: liveSessionId,
    p_slide_index: slideIndex,
    p_duration_ms: durationMs,
    p_client_event_id: clientEventId ?? null,
    p_answered_at: answeredAt,
  });
  if (error) throw fromPgError(error);
  const rec = data as RecordGradeResult;
  if (rec.duplicate) {
    // Đã nhận lần trước: trả lại kết quả cũ, không tính lại thành thạo.
    return { correct: rec.correct ?? result.correct, score: rec.score ?? result.score, graded: result.graded, starsAwarded: 0, wallet: rec.wallet, newlyUnlocked: [], duplicate: true, skills: [], mastery: [] };
  }

  // Thành thạo kĩ năng: không để lỗi ở đây làm hỏng kết quả chấm.
  let mastery: SkillMastery[] = [];
  let skills: string[] = [];
  if (result.graded && isGradedType(item.type)) {
    try {
      const tags = await admin.from('item_skills').select('skill_code, position').eq('item_id', itemId).order('position');
      if (tags.error) throw fromPgError(tags.error);
      skills = ((tags.data ?? []) as { skill_code: string }[]).map((t) => t.skill_code);
      if (skills.length) {
        const misconceptions = result.correct ? [] : detectMisconceptions(item, response);
        const ann = await admin.rpc('annotate_answer', { p_user: caller.id, p_item_id: itemId, p_extra: { skills, misconceptions } });
        if (ann.error) throw fromPgError(ann.error);
        mastery = await refreshMastery(admin, caller.id, skills);
      }
    } catch (e) {
      console.warn('mastery update failed', itemId, e);
    }
  }

  return {
    skills,
    mastery,
    correct: result.correct,
    score: result.score,
    graded: result.graded,
    ...(result.parts ? { parts: result.parts } : {}),
    starsAwarded: rec.starsAwarded ?? 0,
    wallet: rec.wallet,
    newlyUnlocked: rec.newlyUnlocked ?? [],
  };
});
