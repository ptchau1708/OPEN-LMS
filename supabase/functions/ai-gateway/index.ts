/**
 * Edge Function `ai-gateway` — cổng AI duy nhất (khóa API chỉ nằm trong secrets).
 *
 * Vào:  { task, input }
 *   task 'generate_items'  (GV/admin) input { text?, topic?, skillCodes?, skillTexts?, difficultyMix?, grade, subject?, count?, types? }
 *        → { text, items }  items: Item[] (có key) để đưa vào trình soạn của GV, CHƯA lưu.
 *        Cần `text` (nội dung SGK ≥ 20 kí tự) HOẶC `topic` / `skillTexts` (soạn theo chủ đề, yêu cầu cần đạt).
 *   task 'extract_items'   (GV/admin) input { fileBase64, mimeType (image/jpeg|png|webp|application/pdf), grade?, subject? } — tệp ≤ 4 MB
 *        → { text, items }  AI chép lại câu hỏi từ ảnh / PDF đề (./extract.ts, docs/PHASE7_QUESTION_BANK.md). Hạn mức chung nhóm 'generate'.
 *   task 'lesson_outline'  (GV/admin) input { topic, grade, subject?, minutes?, text? }
 *        → { text, outline } outline: { title, minutes, slides: { layout, title, text?, teacherNotes? }[] }
 *   task 'encourage'       (mọi người) input { mood?: 'correct'|'retry'|'complete', correct?, total?, subject?, streakDays? }
 *        → { text }  một câu khích lệ ngắn. Không gửi tên/thông tin cá nhân của HS cho nhà cung cấp AI.
 *   task 'hint'            (mọi người) input { itemId, response, attempt: 1..3 }
 *        → { text, provider: 'ai' | 'fallback', level }  gợi ý từng bước khi HS làm sai, KHÔNG lộ đáp án (./hint.ts, docs/PHASE7_AI_HINT.md).
 * Ra luôn có `text` và `provider` ('openrouter' | 'gemini' | 'fallback'; riêng 'hint': 'ai' | 'fallback').
 *
 * Thứ tự gọi: OpenRouter (OPENROUTER_API_KEY, OPENROUTER_MODEL mặc định google/gemini-2.5-flash)
 *             → Gemini REST (GEMINI_API_KEY, GEMINI_MODEL mặc định gemini-2.5-flash).
 * Hạn mức/ngày (v2.ai_usage): AI_DAILY_LIMIT_GENERATE (mặc định 60 lượt/GV), AI_DAILY_LIMIT_ENCOURAGE (30 lượt/người),
 *                             AI_DAILY_LIMIT_HINT (40 lượt/HS — nhóm 'hint', migration 20261117000001).
 */
import type { Item, ItemType, SubjectId } from '../_shared/scoring/contracts.ts';
import { HttpError, isObject, type JsonObject, readJsonObject, serveJson } from '../_shared/http.ts';
import { adminClient, fromPgError, isStaff, requireCaller } from '../_shared/supabase.ts';
import { handleHint } from './hint.ts';
import { EXTRACT_BODY_MAX_BYTES, handleExtract, type LlmFile } from './extract.ts';

type Task = 'generate_items' | 'lesson_outline' | 'encourage' | 'hint' | 'extract_items';
type Provider = 'openrouter' | 'gemini' | 'fallback';

const SUBJECT_IDS: readonly SubjectId[] = [
  'toan', 'tieng-viet', 'tieng-anh', 'dao-duc', 'lich-su-dia-li', 'khoa-hoc', 'tin-hoc', 'cong-nghe', 'gdtc', 'am-nhac', 'mi-thuat', 'hdtn', 'tnxh', 'khac',
];
const SUBJECT_NAMES: Record<SubjectId, string> = {
  toan: 'Toán', 'tieng-viet': 'Tiếng Việt', 'tieng-anh': 'Tiếng Anh', 'dao-duc': 'Đạo đức', 'lich-su-dia-li': 'Lịch sử và Địa lí',
  'khoa-hoc': 'Khoa học', 'tin-hoc': 'Tin học', 'cong-nghe': 'Công nghệ', gdtc: 'Giáo dục thể chất', 'am-nhac': 'Âm nhạc',
  'mi-thuat': 'Mĩ thuật', hdtn: 'Hoạt động trải nghiệm', tnxh: 'Tự nhiên và Xã hội', khac: 'Khác',
};
const GENERATABLE: readonly ItemType[] = [
  'MCQ', 'MCQ_MULTIPLE', 'SHORT_ANSWER', 'MATCHING', 'ORDERING', 'SENTENCE_SCRAMBLE', 'FILL_IN_PASSAGE', 'WORD_CLASSIFY',
];
const OUTLINE_LAYOUTS = new Set(['title', 'image-text', 'fullscreen', 'activity', 'compare', 'game', 'summary']);

/* ------------------------------------------------------------------ */
/* Gọi mô hình                                                         */
/* ------------------------------------------------------------------ */
interface LlmRequest {
  system: string;
  user: string;
  json: boolean;
  temperature: number;
  maxTokens: number;
  /** Ảnh / PDF đính kèm (task extract_items). */
  file?: LlmFile;
  timeoutMs?: number;
}

const TIMEOUT_MS = 25_000;

async function fetchJson(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Nội dung người dùng kèm tệp cho OpenRouter: ảnh → image_url (data URL, như ai-grade); PDF → file. */
function openRouterParts(text: string, f: LlmFile): JsonObject[] {
  const url = `data:${f.mimeType};base64,${f.data}`;
  return [
    { type: 'text', text },
    f.mimeType === 'application/pdf' ? { type: 'file', file: { filename: 'de-bai.pdf', file_data: url } } : { type: 'image_url', image_url: { url } },
  ];
}

async function callOpenRouter(r: LlmRequest, key: string): Promise<string> {
  const model = Deno.env.get('OPENROUTER_MODEL') || 'google/gemini-2.5-flash';
  const body: JsonObject = {
    model,
    messages: [
      { role: 'system', content: r.system },
      { role: 'user', content: r.file ? openRouterParts(r.user, r.file) : r.user },
    ],
    temperature: r.temperature,
    max_tokens: r.maxTokens,
  };
  if (r.json) body.response_format = { type: 'json_object' };
  const data = await fetchJson('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('APP_URL') || 'https://open-edu.app',
      'X-Title': 'OPEN-EDU',
    },
    body: JSON.stringify(body),
  }, r.timeoutMs);
  const choices = isObject(data) && Array.isArray(data.choices) ? data.choices : [];
  const msg = isObject(choices[0]) && isObject(choices[0].message) ? choices[0].message : null;
  const content = msg ? msg.content : null;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const joined = content.map((p) => (isObject(p) && typeof p.text === 'string' ? p.text : '')).join('');
    if (joined.trim()) return joined;
  }
  throw new Error('OpenRouter trả về rỗng');
}

async function callGemini(r: LlmRequest, key: string): Promise<string> {
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
  const generationConfig: JsonObject = { temperature: r.temperature, maxOutputTokens: r.maxTokens };
  if (r.json) generationConfig.responseMimeType = 'application/json';
  // Gemini 2.5 Flash "suy nghĩ" tốn token đầu ra — tắt để trả lời nhanh và không bị cắt.
  if (model.includes('flash')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: r.system }] },
        // Tệp đính kèm (extract_items): inline_data base64 như ai-grade.
        contents: [{ role: 'user', parts: r.file ? [{ text: r.user }, { inline_data: { mime_type: r.file.mimeType, data: r.file.data } }] : [{ text: r.user }] }],
        generationConfig,
      }),
    },
    r.timeoutMs,
  );
  const cands = isObject(data) && Array.isArray(data.candidates) ? data.candidates : [];
  const content = isObject(cands[0]) && isObject(cands[0].content) ? cands[0].content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  const text = parts.map((p) => (isObject(p) && typeof p.text === 'string' ? p.text : '')).join('');
  if (text.trim()) return text;
  throw new Error('Gemini trả về rỗng');
}

async function complete(r: LlmRequest): Promise<{ text: string; provider: Provider }> {
  const errors: string[] = [];
  const orKey = Deno.env.get('OPENROUTER_API_KEY');
  if (orKey) {
    try {
      return { text: await callOpenRouter(r, orKey), provider: 'openrouter' };
    } catch (e) {
      errors.push(`openrouter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const gKey = Deno.env.get('GEMINI_API_KEY');
  if (gKey) {
    try {
      return { text: await callGemini(r, gKey), provider: 'gemini' };
    } catch (e) {
      errors.push(`gemini: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.error('ai-gateway: all providers failed', errors);
  throw new HttpError(503, orKey || gKey ? 'Trợ lý AI đang bận, thầy cô thử lại sau ít phút nhé.' : 'Chưa cấu hình khóa AI trên máy chủ.', 'ai_unavailable');
}

/* ------------------------------------------------------------------ */
/* Tiện ích                                                            */
/* ------------------------------------------------------------------ */
function parseLooseJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start < 0 || end < start) throw new HttpError(502, 'AI trả về dữ liệu không đọc được, thầy cô thử lại nhé.', 'ai_bad_output');
  try {
    return JSON.parse(t.slice(start, end + 1)) as unknown;
  } catch {
    throw new HttpError(502, 'AI trả về dữ liệu không đọc được, thầy cô thử lại nhé.', 'ai_bad_output');
  }
}

function str(v: unknown, max = 2000): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function gradeOf(v: unknown): 1 | 2 | 3 | 4 | 5 {
  const g = intIn(v, 1, 5, 0);
  if (!g) throw new HttpError(400, 'Cần chọn lớp từ 1 đến 5.', 'bad_request');
  return g as 1 | 2 | 3 | 4 | 5;
}

function subjectOf(v: unknown): SubjectId {
  return typeof v === 'string' && (SUBJECT_IDS as readonly string[]).includes(v) ? (v as SubjectId) : 'khac';
}

interface ChoiceOut {
  id: string;
  text: string;
}

/** Danh sách lựa chọn: chấp nhận ["a","b"] hoặc [{id,text}]; id duy nhất. */
function choices(v: unknown, min: number, max: number): ChoiceOut[] | null {
  if (!Array.isArray(v) || v.length < min || v.length > max) return null;
  const out: ChoiceOut[] = [];
  const ids = new Set<string>();
  v.forEach((c, i) => {
    const fallbackId = String.fromCharCode(97 + i);
    const id = isObject(c) ? (str(c.id, 40) ?? fallbackId) : fallbackId;
    const text = isObject(c) ? str(c.text, 300) : str(c, 300);
    if (text && !ids.has(id)) {
      ids.add(id);
      out.push({ id, text });
    }
  });
  return out.length === v.length ? out : null;
}

function isPermutation(order: unknown, ids: string[]): order is string[] {
  return Array.isArray(order) && order.length === ids.length && ids.every((id) => order.includes(id));
}

/** Kiểm tra + chuẩn hóa một item do AI sinh. Trả null nếu không dùng được. */
function normalizeItem(raw: unknown, grade: 1 | 2 | 3 | 4 | 5, subject: SubjectId, allowed: Set<string>): Item | null {
  if (!isObject(raw) || typeof raw.type !== 'string' || !allowed.has(raw.type)) return null;
  const promptText = isObject(raw.prompt) ? str(raw.prompt.text, 1000) : str(raw.prompt, 1000);
  if (!promptText) return null;
  const payloadIn = isObject(raw.payload) ? raw.payload : {};
  const keyIn = isObject(raw.key) ? raw.key : {};
  let payload: JsonObject;
  let key: JsonObject;

  switch (raw.type as ItemType) {
    case 'MCQ': {
      const options = choices(payloadIn.options, 2, 6);
      const correct = str(keyIn.correct, 40);
      if (!options || !correct || !options.some((o) => o.id === correct)) return null;
      payload = { options };
      key = { correct };
      break;
    }
    case 'MCQ_MULTIPLE': {
      const options = choices(payloadIn.options, 2, 8);
      const correct = Array.isArray(keyIn.correct) ? keyIn.correct.filter((x): x is string => typeof x === 'string') : [];
      if (!options || correct.length === 0 || !correct.every((c) => options.some((o) => o.id === c))) return null;
      payload = { options };
      key = { correct: [...new Set(correct)] };
      break;
    }
    case 'SHORT_ANSWER': {
      const accepted = Array.isArray(keyIn.accepted)
        ? keyIn.accepted.map((a) => (typeof a === 'number' ? String(a) : a)).filter((a): a is string => typeof a === 'string' && a.trim() !== '')
        : [];
      if (accepted.length === 0) return null;
      payload = accepted.every((a) => /^-?\d+([.,]\d+)?$/.test(a.trim())) ? { inputMode: 'numeric' } : {};
      const unit = str(payloadIn.unit, 20);
      if (unit) payload.unit = unit;
      key = { accepted: accepted.map((a) => a.trim()) };
      break;
    }
    case 'MATCHING': {
      const left = choices(payloadIn.left, 2, 8);
      const right = choices(payloadIn.right, 2, 8);
      const pairs = isObject(keyIn.pairs) ? keyIn.pairs : null;
      if (!left || !right || !pairs) return null;
      const ok = left.every((l) => typeof pairs[l.id] === 'string' && right.some((r) => r.id === pairs[l.id]));
      if (!ok) return null;
      payload = { left, right };
      key = { pairs: Object.fromEntries(left.map((l) => [l.id, pairs[l.id] as string])) };
      break;
    }
    case 'ORDERING': {
      const items = choices(payloadIn.items, 2, 10);
      if (!items || !isPermutation(keyIn.order, items.map((i) => i.id))) return null;
      payload = { items };
      key = { order: keyIn.order as string[] };
      break;
    }
    case 'SENTENCE_SCRAMBLE': {
      const words = choices(payloadIn.words, 2, 15);
      if (!words || !isPermutation(keyIn.order, words.map((w) => w.id))) return null;
      payload = { words };
      key = { order: keyIn.order as string[] };
      break;
    }
    case 'FILL_IN_PASSAGE': {
      const passage = str(payloadIn.passage, 2000);
      const blanksIn = isObject(keyIn.blanks) ? keyIn.blanks : null;
      if (!passage || !blanksIn) return null;
      const ids = [...passage.matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)].map((m) => m[1]);
      if (ids.length === 0) return null;
      const blanks: Record<string, string[]> = {};
      for (const id of ids) {
        const v = blanksIn[id];
        const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x.trim() !== '');
        if (list.length === 0) return null;
        blanks[id] = list.map((x) => x.trim());
      }
      payload = { passage };
      const bank = choices(payloadIn.bank, 1, 20);
      if (bank) payload.bank = bank;
      key = { blanks };
      break;
    }
    case 'WORD_CLASSIFY': {
      const words = choices(payloadIn.words, 2, 16);
      const groupsRaw = Array.isArray(payloadIn.groups) ? payloadIn.groups : [];
      const groups = groupsRaw
        .map((g, i) => (isObject(g) ? { id: str(g.id, 40) ?? `g${i + 1}`, label: str(g.label, 100) ?? '' } : null))
        .filter((g): g is { id: string; label: string } => !!g && g.label !== '');
      const placement = isObject(keyIn.placement) ? keyIn.placement : null;
      if (!words || groups.length < 2 || !placement) return null;
      if (!words.every((w) => groups.some((g) => g.id === placement[w.id]))) return null;
      payload = { words, groups };
      key = { placement: Object.fromEntries(words.map((w) => [w.id, placement[w.id] as string])) };
      break;
    }
    default:
      return null;
  }

  const difficulty = typeof raw.difficulty === 'string' && ['nhan-biet', 'ket-noi', 'van-dung'].includes(raw.difficulty)
    ? raw.difficulty
    : undefined;
  const item: JsonObject = {
    id: crypto.randomUUID(),
    type: raw.type,
    grade,
    subject,
    prompt: { text: promptText },
    payload,
    key,
    stars: 1,
    tags: ['ai'],
  };
  if (difficulty) item.difficulty = difficulty;
  const hint = str(raw.hint, 300);
  if (hint) item.hint = hint;
  const explanation = str(raw.explanation, 600);
  if (explanation) item.explanation = explanation;
  // Đã kiểm tra payload/key theo từng dạng ở trên.
  return item as unknown as Item;
}

/* ------------------------------------------------------------------ */
/* Lời nhắc                                                            */
/* ------------------------------------------------------------------ */
const ITEM_SCHEMAS: Record<string, string> = {
  MCQ: '{"type":"MCQ","prompt":{"text":"..."},"payload":{"options":[{"id":"a","text":"..."},{"id":"b","text":"..."}]},"key":{"correct":"a"}}',
  MCQ_MULTIPLE: '{"type":"MCQ_MULTIPLE","prompt":{"text":"..."},"payload":{"options":[{"id":"a","text":"..."},...]},"key":{"correct":["a","c"]}}',
  SHORT_ANSWER: '{"type":"SHORT_ANSWER","prompt":{"text":"..."},"payload":{"unit":"cm"},"key":{"accepted":["52","năm mươi hai"]}}',
  MATCHING: '{"type":"MATCHING","prompt":{"text":"Nối ..."},"payload":{"left":[{"id":"l1","text":"..."}],"right":[{"id":"r1","text":"..."}]},"key":{"pairs":{"l1":"r1"}}}',
  ORDERING: '{"type":"ORDERING","prompt":{"text":"Sắp xếp ..."},"payload":{"items":[{"id":"i1","text":"..."}]},"key":{"order":["i1","i2","i3"]}}',
  SENTENCE_SCRAMBLE: '{"type":"SENTENCE_SCRAMBLE","prompt":{"text":"Xếp các từ thành câu"},"payload":{"words":[{"id":"w1","text":"Em"}]},"key":{"order":["w1","w2"]}}',
  FILL_IN_PASSAGE: '{"type":"FILL_IN_PASSAGE","prompt":{"text":"Điền từ"},"payload":{"passage":"Mùa {{b1}} hoa nở.","bank":[{"id":"x1","text":"xuân"}]},"key":{"blanks":{"b1":["xuân"]}}}',
  WORD_CLASSIFY: '{"type":"WORD_CLASSIFY","prompt":{"text":"Xếp từ vào nhóm"},"payload":{"words":[{"id":"w1","text":"chạy"}],"groups":[{"id":"g1","label":"Từ chỉ hoạt động"},{"id":"g2","label":"Từ chỉ sự vật"}]},"key":{"placement":{"w1":"g1"}}}',
};

function systemGenerate(grade: number, subject: SubjectId, types: ItemType[]): string {
  return [
    `Bạn là trợ lý soạn câu hỏi cho giáo viên tiểu học Việt Nam (Chương trình GDPT 2018), môn ${SUBJECT_NAMES[subject]}, lớp ${grade}.`,
    'Viết bằng tiếng Việt có dấu, câu ngắn, rõ, hợp lứa tuổi; bám sát nội dung SGK được cung cấp; không bịa kiến thức ngoài bài.',
    'Mỗi câu chỉ có MỘT cách hiểu; đáp án chắc chắn đúng; phương án nhiễu hợp lý, không đánh đố.',
    'Chỉ trả về JSON hợp lệ dạng {"items":[...]} — không thêm lời giải thích ngoài JSON.',
    'Mỗi item có thể có "difficulty" ("nhan-biet" | "ket-noi" | "van-dung"), "hint" (gợi ý ngắn) và "explanation" (giải thích ngắn).',
    'Chỉ dùng các dạng sau, đúng cấu trúc:',
    ...types.map((t) => `- ${ITEM_SCHEMAS[t]}`),
  ].join('\n');
}

function systemOutline(grade: number, subject: SubjectId, minutes: number): string {
  return [
    `Bạn là trợ lý thiết kế bài giảng tương tác cho giáo viên tiểu học Việt Nam, môn ${SUBJECT_NAMES[subject]}, lớp ${grade}, khoảng ${minutes} phút.`,
    'Cấu trúc gợi ý: khởi động → khám phá → luyện tập → vận dụng → tổng kết. 6–14 slide.',
    'Chỉ trả về JSON hợp lệ: {"title":"...","minutes":35,"slides":[{"layout":"title|image-text|fullscreen|activity|compare|game|summary","title":"...","text":"...","teacherNotes":"..."}]}',
    'Slide "activity" ghi trong "text" ý tưởng câu hỏi (dạng câu hỏi + nội dung). "teacherNotes" là lời dặn ngắn cho GV.',
    'Viết tiếng Việt có dấu, ngắn gọn, thân thiện với học sinh.',
  ].join('\n');
}

const ENCOURAGE_SYSTEM = [
  'Bạn là một bạn linh vật vui vẻ trong ứng dụng học tập cho học sinh tiểu học Việt Nam.',
  'Viết MỘT câu khích lệ bằng tiếng Việt có dấu, tối đa 20 từ, xưng "mình", gọi "em".',
  'Ấm áp, cụ thể, khen nỗ lực; KHÔNG dùng từ "sai", "kém", "dở"; không hỏi lại; tối đa 1 emoji.',
  'Chỉ trả về câu đó, không ngoặc kép.',
].join('\n');

const FALLBACK: Record<string, string[]> = {
  correct: ['Giỏi quá! Em làm đúng rồi đó!', 'Tuyệt vời! Mình rất tự hào về em!', 'Chính xác! Em tiến bộ nhanh ghê!'],
  retry: ['Gần đúng rồi! Em thử lại một lần nữa nhé!', 'Không sao đâu, mình cùng thử lại nào!', 'Em cố lên, lần này chắc chắn được!'],
  complete: ['Em đã học xong bài rồi! Giỏi lắm!', 'Hoàn thành rồi! Mình thưởng em một tràng pháo tay!', 'Em chăm quá! Hẹn em ở bài tiếp theo nhé!'],
};

function fallbackEncourage(mood: string): string {
  const list = FALLBACK[mood] ?? FALLBACK.correct;
  return list[Math.floor(Math.random() * list.length)];
}

/* ------------------------------------------------------------------ */
/* Hạn mức                                                             */
/* ------------------------------------------------------------------ */
function limitFor(bucket: 'generate' | 'encourage' | 'hint'): number {
  const name = bucket === 'generate' ? 'AI_DAILY_LIMIT_GENERATE' : bucket === 'hint' ? 'AI_DAILY_LIMIT_HINT' : 'AI_DAILY_LIMIT_ENCOURAGE';
  const fallback = bucket === 'generate' ? 60 : bucket === 'hint' ? 40 : 30;
  const n = Number(Deno.env.get(name));
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** true nếu lấy được 1 lượt. */
async function takeQuota(userId: string, bucket: 'generate' | 'encourage' | 'hint'): Promise<boolean> {
  const { data, error } = await adminClient().rpc('ai_quota_take', { p_user: userId, p_bucket: bucket, p_limit: limitFor(bucket) });
  if (error) throw fromPgError(error);
  return typeof data === 'number';
}

/* ------------------------------------------------------------------ */
/* Xử lý                                                               */
/* ------------------------------------------------------------------ */
serveJson(async (req) => {
  const caller = await requireCaller(req);
  // extract_items gửi kèm ảnh/PDF (≤ 4 MB) nên đọc thân tới ~6 MB; các tác vụ khác vẫn bị giới hạn 100 KB như cũ.
  const body = await readJsonObject(req, EXTRACT_BODY_MAX_BYTES);
  const task = body.task as Task;
  if (task !== 'extract_items' && (Number(req.headers.get('Content-Length') ?? '0') > 100_000 || JSON.stringify(body).length > 100_000)) {
    throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.', 'too_large');
  }
  const input = isObject(body.input) ? body.input : {};

  if (task === 'encourage') {
    const mood = typeof input.mood === 'string' && input.mood in FALLBACK ? input.mood : 'correct';
    if (!(await takeQuota(caller.id, 'encourage'))) return { text: fallbackEncourage(mood), provider: 'fallback' };
    const facts: string[] = [`Tình huống: ${mood === 'retry' ? 'em vừa trả lời chưa đúng, cần động viên thử lại' : mood === 'complete' ? 'em vừa học xong một bài' : 'em vừa trả lời đúng'}.`];
    const correct = intIn(input.correct, 0, 1000, -1);
    const total = intIn(input.total, 1, 1000, -1);
    if (correct >= 0 && total > 0) facts.push(`Kết quả: đúng ${Math.min(correct, total)}/${total} câu.`);
    const subj = subjectOf(input.subject);
    if (subj !== 'khac') facts.push(`Môn: ${SUBJECT_NAMES[subj]}.`);
    const streak = intIn(input.streakDays, 1, 3650, 0);
    if (streak > 1) facts.push(`Em đã học ${streak} ngày liên tiếp.`);
    try {
      const r = await complete({ system: ENCOURAGE_SYSTEM, user: facts.join('\n'), json: false, temperature: 0.9, maxTokens: 120 });
      const text = r.text.replace(/^["“”'\s]+|["“”'\s]+$/g, '').split('\n')[0].slice(0, 200);
      return text ? { text, provider: r.provider } : { text: fallbackEncourage(mood), provider: 'fallback' };
    } catch {
      return { text: fallbackEncourage(mood), provider: 'fallback' };
    }
  }

  if (task === 'hint') {
    return handleHint(req, caller, input, { complete, takeQuota: () => takeQuota(caller.id, 'hint') });
  }

  if (task === 'extract_items') {
    if (!isStaff(caller)) throw new HttpError(403, 'Chỉ thầy cô mới dùng được trợ lý soạn bài.', 'forbidden');
    const g = intIn(input.grade, 1, 5, 0);
    return handleExtract(input, {
      complete,
      normalizeItem,
      parseLooseJson,
      schemas: ITEM_SCHEMAS,
      subjectName: (s) => SUBJECT_NAMES[s],
      takeQuota: () => takeQuota(caller.id, 'generate'),
      quotaMessage: `Hôm nay thầy cô đã dùng hết ${limitFor('generate')} lượt AI. Mai dùng tiếp nhé.`,
    }, { grade: g ? (g as 1 | 2 | 3 | 4 | 5) : null, subject: typeof input.subject === 'string' ? subjectOf(input.subject) : null });
  }

  if (task !== 'generate_items' && task !== 'lesson_outline') {
    throw new HttpError(400, 'Tác vụ AI không hợp lệ (generate_items, lesson_outline, encourage, hint, extract_items).', 'bad_task');
  }
  if (!isStaff(caller)) throw new HttpError(403, 'Chỉ thầy cô mới dùng được trợ lý soạn bài.', 'forbidden');
  const grade = gradeOf(input.grade);
  const subject = subjectOf(input.subject);

  if (task === 'generate_items') {
    const text = str(input.text, 12_000);
    // Soạn theo chủ đề / yêu cầu cần đạt khi không dán SGK (ngân hàng câu hỏi — Phase 7).
    const gTopic = str(input.topic, 300);
    const skillTexts = Array.isArray(input.skillTexts) ? input.skillTexts.map((x) => str(x, 400)).filter((x): x is string => !!x).slice(0, 8) : [];
    const skillCodes = Array.isArray(input.skillCodes) ? input.skillCodes.map((x) => str(x, 40)).filter((x): x is string => !!x).slice(0, 8) : [];
    if ((!text || text.length < 20) && !gTopic && skillTexts.length === 0) {
      throw new HttpError(400, 'Hãy dán nội dung SGK (ít nhất vài câu) hoặc nhập chủ đề / chọn kĩ năng để AI soạn câu hỏi.', 'bad_request');
    }
    const mixIn = isObject(input.difficultyMix) ? input.difficultyMix : {};
    const mix = (['nhan-biet', 'ket-noi', 'van-dung'] as const).map((k) => [k, intIn(mixIn[k], 0, 20, 0)] as const).filter(([, n]) => n > 0);
    const count = intIn(input.count, 1, 20, 5);
    const wanted = Array.isArray(input.types)
      ? input.types.filter((t): t is ItemType => typeof t === 'string' && (GENERATABLE as readonly string[]).includes(t))
      : [];
    const types = wanted.length ? wanted : ['MCQ', 'SHORT_ANSWER', 'MATCHING', 'FILL_IN_PASSAGE'] as ItemType[];
    if (!(await takeQuota(caller.id, 'generate'))) {
      throw new HttpError(429, `Hôm nay thầy cô đã dùng hết ${limitFor('generate')} lượt AI. Mai dùng tiếp nhé.`, 'quota');
    }
    const r = await complete({
      system: systemGenerate(grade, subject, types),
      user: [
        text && text.length >= 20 ? `Soạn ${count} câu hỏi từ nội dung SGK sau:\n"""\n${text}\n"""` : `Soạn ${count} câu hỏi${gTopic ? ` về chủ đề: ${gTopic}` : ''}.`,
        skillTexts.length ? `Bám sát yêu cầu cần đạt (CT GDPT 2018):\n${skillTexts.map((t) => `- ${t}`).join('\n')}` : '',
        mix.length ? `Phân bố mức độ: ${mix.map(([k, n]) => `${n} câu "${k}"`).join(', ')}. Ghi "difficulty" cho từng câu.` : '',
      ].filter(Boolean).join('\n'),
      json: true,
      temperature: 0.4,
      maxTokens: 6000,
    });
    const parsed = parseLooseJson(r.text);
    const rawItems = Array.isArray(parsed) ? parsed : isObject(parsed) && Array.isArray(parsed.items) ? parsed.items : [];
    const allowed = new Set<string>(types);
    const items = rawItems
      .map((x) => normalizeItem(x, grade, subject, allowed))
      .filter((x): x is Item => x !== null)
      .slice(0, count);
    if (items.length === 0) throw new HttpError(502, 'AI chưa soạn được câu hỏi hợp lệ, thầy cô thử lại hoặc rút gọn nội dung nhé.', 'ai_bad_output');
    if (skillCodes.length) for (const it of items) (it as { skills?: string[] }).skills = skillCodes;
    return { text: r.text, items, provider: r.provider };
  }

  // lesson_outline
  const topic = str(input.topic, 500);
  if (!topic) throw new HttpError(400, 'Hãy nhập tên bài hoặc chủ đề.', 'bad_request');
  const minutes = intIn(input.minutes, 5, 120, 35);
  const sgk = str(input.text, 8000);
  if (!(await takeQuota(caller.id, 'generate'))) {
    throw new HttpError(429, `Hôm nay thầy cô đã dùng hết ${limitFor('generate')} lượt AI. Mai dùng tiếp nhé.`, 'quota');
  }
  const r = await complete({
    system: systemOutline(grade, subject, minutes),
    user: `Bài: ${topic}` + (sgk ? `\nNội dung SGK:\n"""\n${sgk}\n"""` : ''),
    json: true,
    temperature: 0.6,
    maxTokens: 4000,
  });
  const parsed = parseLooseJson(r.text);
  const slidesIn = isObject(parsed) && Array.isArray(parsed.slides) ? parsed.slides : [];
  const slides = slidesIn
    .filter(isObject)
    .map((s) => {
      const layout = typeof s.layout === 'string' && OUTLINE_LAYOUTS.has(s.layout) ? s.layout : 'image-text';
      const out: JsonObject = { layout, title: str(s.title, 200) ?? '' };
      const t = str(s.text, 1500);
      if (t) out.text = t;
      const n = str(s.teacherNotes, 800);
      if (n) out.teacherNotes = n;
      return out;
    })
    .slice(0, 20);
  const outline = {
    title: (isObject(parsed) ? str(parsed.title, 200) : null) ?? topic,
    minutes: isObject(parsed) ? intIn(parsed.minutes, 5, 120, minutes) : minutes,
    slides,
  };
  return { text: r.text, outline, provider: r.provider };
});
