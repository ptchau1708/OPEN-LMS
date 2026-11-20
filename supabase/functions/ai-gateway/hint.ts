/**
 * ai-gateway — task 'hint': gợi ý từng bước khi học sinh làm sai, KHÔNG lộ đáp án (docs/PHASE7_AI_HINT.md).
 *
 * Vào:  input { itemId, response (câu trả lời chưa đúng), attempt (1..3) }
 * Ra:   { text, provider: 'ai' | 'fallback', level }
 *
 * - Item + đáp án đọc bằng service role (như `grade`); không nhận đáp án từ máy HS, không bao giờ trả key.
 * - HS chỉ xin được gợi ý cho câu mình đọc được (RPC get_items bằng JWT của HS), không phải lúc đang làm bài kiểm tra
 *   hay đang trong trận Đấu 1–1 có câu đó.
 * - Lời nhắc + bộ lọc lộ đáp án + gợi ý theo quy tắc: mã thuần _shared/hint (chép từ packages/data/src/hint).
 * - Không có khóa AI / hết lượt / AI lỗi / câu trả lời của AI lộ đáp án → gợi ý theo quy tắc (provider 'fallback').
 * - Không gửi tên hay thông tin cá nhân của HS cho nhà cung cấp AI (chỉ đề bài, lựa chọn, câu trả lời).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { AnyResponse, Item } from '../_shared/scoring/contracts.ts';
import { scoreItem } from '../_shared/scoring/scoring.ts';
import { HttpError, isObject, type JsonObject } from '../_shared/http.ts';
import { adminClient, type Caller, env, fromPgError, isStaff } from '../_shared/supabase.ts';
import {
  acceptModelHint,
  buildHintPrompt,
  clampHintLevel,
  composeFallbackHint,
  type HintLevel,
  misconceptionFor,
  type MisconceptionLookup,
} from '../_shared/hint/index.ts';
import { detectMisconceptions, isGradedType } from '../_shared/mastery/index.ts';

export interface HintDeps {
  /** Gọi mô hình (hàm `complete` của ai-gateway). */
  complete: (r: { system: string; user: string; json: boolean; temperature: number; maxTokens: number }) => Promise<{ text: string }>;
  /** Lấy 1 lượt trong hạn mức 'hint' của người gọi; false = hết lượt. */
  takeQuota: () => Promise<boolean>;
}

export interface HintResponse {
  text: string;
  provider: 'ai' | 'fallback';
  level: HintLevel;
}

interface ItemRow {
  id: string;
  type: string;
  grade: number;
  subject: string;
  prompt: unknown;
  payload: unknown;
  hint: string | null;
}

const MAX_RESPONSE_BYTES = 8_000;

/** HS có đọc được câu này không (theo đúng quyền của get_items). */
async function studentCanRead(req: Request, itemId: string): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    db: { schema: 'v2' },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.rpc('get_items', { p_ids: [itemId] });
  if (error) throw fromPgError(error);
  return Array.isArray(data) && data.some((x) => isObject(x) && x.id === itemId);
}

/** Đang làm bài kiểm tra, hoặc đang trong trận đấu có câu này → không gợi ý. */
async function assertNotInContest(userId: string, itemId: string): Promise<void> {
  const admin = adminClient();
  const nowIso = new Date().toISOString();
  const exam = await admin
    .from('exam_attempts')
    .select('id')
    .eq('student_id', userId)
    .eq('status', 'in-progress')
    .gt('deadline_at', nowIso)
    .limit(1);
  if (exam.error) throw fromPgError(exam.error);
  if ((exam.data ?? []).length) throw new HttpError(403, 'Em đang làm bài kiểm tra nên chưa xin gợi ý được nhé.', 'exam_in_progress');
  const duel = await admin
    .from('duels')
    .select('id')
    .eq('status', 'playing')
    .contains('players', [userId])
    .contains('item_ids', [itemId])
    .gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString())
    .limit(1);
  if (duel.error) throw fromPgError(duel.error);
  if ((duel.data ?? []).length) throw new HttpError(403, 'Đang thi đấu nên chưa xin gợi ý được nhé.', 'duel_in_progress');
}

export async function handleHint(req: Request, caller: Caller, input: JsonObject, deps: HintDeps): Promise<HintResponse> {
  const itemId = typeof input.itemId === 'string' ? input.itemId.trim() : '';
  if (!itemId || itemId.length > 128) throw new HttpError(400, 'Thiếu mã câu hỏi ("itemId").', 'bad_request');
  const response = input.response;
  if (!isObject(response)) throw new HttpError(400, 'Thiếu câu trả lời ("response").', 'bad_request');
  if (JSON.stringify(response).length > MAX_RESPONSE_BYTES) throw new HttpError(413, 'Câu trả lời quá dài để xin gợi ý.', 'too_large');
  const level = clampHintLevel(input.attempt);

  if (!isStaff(caller)) {
    if (!(await studentCanRead(req, itemId))) throw new HttpError(404, 'Không tìm thấy câu hỏi.', 'not_found');
    await assertNotInContest(caller.id, itemId);
  }

  const admin = adminClient();
  const [itemRes, keyRes] = await Promise.all([
    admin.from('items').select('id, type, grade, subject, prompt, payload, hint').eq('id', itemId).maybeSingle(),
    admin.from('item_keys').select('key').eq('item_id', itemId).maybeSingle(),
  ]);
  if (itemRes.error) throw fromPgError(itemRes.error);
  if (keyRes.error) throw fromPgError(keyRes.error);
  if (!itemRes.data) throw new HttpError(404, 'Không tìm thấy câu hỏi.', 'not_found');
  const row = itemRes.data as ItemRow;
  const key = (keyRes.data as { key: unknown } | null)?.key;
  const base: Record<string, unknown> = { id: row.id, type: row.type, grade: row.grade, subject: row.subject, prompt: row.prompt, payload: row.payload };
  if (row.hint) base.hint = row.hint;
  if (key !== undefined && key !== null) base.key = key;
  // Dữ liệu đọc từ CSDL đã qua ràng buộc type/payload; ép kiểu về union Item của contracts (như `grade`).
  const item = base as unknown as Item;

  const fallback = (misconceptionHint?: string | null): HintResponse => ({
    text: composeFallbackHint({ item, level, misconceptionHint }),
    provider: 'fallback',
    level,
  });

  // Dạng không chấm, thiếu đáp án, hoặc câu trả lời thật ra đã đúng → chỉ gợi ý chung, không gọi AI.
  if (!isGradedType(item.type) || !item.key) return fallback();
  try {
    if (scoreItem(item, response as unknown as AnyResponse).correct) return fallback();
  } catch {
    /* câu trả lời sai định dạng: coi như chưa đúng */
  }

  // Lời nhắc quan niệm sai: ưu tiên bảng v2.misconceptions (trường có thể sửa), thiếu thì dùng danh mục trong mã.
  let lookup: MisconceptionLookup | undefined;
  try {
    const codes = detectMisconceptions(item, response);
    if (codes.length) {
      const m = await admin.from('misconceptions').select('code, text, kid_hint').in('code', codes);
      if (m.error) throw fromPgError(m.error);
      lookup = {};
      for (const r of (m.data ?? []) as { code: string; text: string | null; kid_hint: string | null }[]) {
        if (r.kid_hint) lookup[r.code] = { kidHint: r.kid_hint, ...(r.text ? { text: r.text } : {}) };
      }
    }
  } catch (e) {
    console.warn('hint: misconception lookup failed', itemId, e);
  }
  const misconception = misconceptionFor(item, response, lookup);

  // Ghi nhận em đã dùng gợi ý vào lần trả lời gần nhất của câu này (không làm hỏng việc gợi ý nếu lỗi).
  if (caller.role === 'student') {
    try {
      const ann = await admin.rpc('annotate_answer', { p_user: caller.id, p_item_id: itemId, p_extra: { hintsUsed: level } });
      if (ann.error) console.warn('hint: annotate failed', itemId, ann.error.message);
    } catch (e) {
      console.warn('hint: annotate failed', itemId, e);
    }
  }

  const rule = fallback(misconception?.kidHint);
  if (!Deno.env.get('OPENROUTER_API_KEY') && !Deno.env.get('GEMINI_API_KEY')) return rule;
  try {
    if (!(await deps.takeQuota())) return rule;
    const prompt = buildHintPrompt({ item, response, level, misconception });
    const r = await deps.complete({ system: prompt.system, user: prompt.user, json: false, temperature: 0.5, maxTokens: 260 });
    const text = acceptModelHint(r.text, item);
    if (!text) {
      console.warn('hint: model output rejected (empty or leaks the answer)', itemId, level);
      return rule;
    }
    return { text, provider: 'ai', level };
  } catch (e) {
    console.warn('hint: ai failed', itemId, e instanceof Error ? e.message : String(e));
    return rule;
  }
}
