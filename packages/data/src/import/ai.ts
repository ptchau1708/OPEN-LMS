/**
 * Gọi AI cho ngân hàng câu hỏi (Edge Function `ai-gateway`):
 *  - generate_items: AI soạn câu hỏi từ nội dung SGK hoặc từ chủ đề / kĩ năng.
 *  - extract_items:  AI chép lại câu hỏi từ ảnh chụp / PDF.
 * Chế độ demo không có máy chủ AI → trả BẢN MẪU (đánh dấu `demo: true`) để GV thử luồng soát – lưu.
 */
import { SKILL_BY_CODE, type DataSource, type Grade, type Item, type ItemBase, type ItemType, type SubjectId } from '@openedu/contracts';
import { unzlibSync } from 'fflate';
import { getSupabaseClient } from '../supabase/client';
import { compressWorkImage } from '../workImage';
import { makeMcq, makeShort, newRowId, type DraftItem, type ImportDefaults } from './types';

export type AiErrorCode = 'ai_unavailable' | 'quota' | 'too_large' | 'ai_bad_output' | 'forbidden' | 'bad_request' | 'network' | 'error';

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(message: string, code: AiErrorCode = 'error') {
    super(message);
    this.code = code;
  }
  /** true: máy chủ chưa có khóa AI (hoặc AI không dùng được) — nên chuyển sang cách không cần AI. */
  get needsKey(): boolean {
    return this.code === 'ai_unavailable';
  }
}

/** Dạng AI soạn được (khớp GENERATABLE trong ai-gateway). */
export const AI_ITEM_TYPES: ItemType[] = ['MCQ', 'MCQ_MULTIPLE', 'SHORT_ANSWER', 'MATCHING', 'ORDERING', 'SENTENCE_SCRAMBLE', 'FILL_IN_PASSAGE', 'WORD_CLASSIFY'];

export type DifficultyMix = Partial<Record<NonNullable<ItemBase['difficulty']>, number>>;

export interface AiGenerateInput {
  /** Nội dung SGK dán vào (≥ 20 kí tự) — hoặc để trống và dùng topic / skillCodes. */
  text?: string;
  topic?: string;
  skillCodes?: string[];
  grade: Grade;
  subject: SubjectId;
  count: number;
  types?: ItemType[];
  difficultyMix?: DifficultyMix;
}

export interface AiExtractInput {
  fileBase64: string;
  mimeType: string;
  grade?: Grade;
  subject?: SubjectId;
}

export interface AiItemsResult {
  drafts: DraftItem[];
  demo: boolean;
  provider?: string;
}

export const AI_FILE_MAX_BYTES = 4 * 1024 * 1024;
export const AI_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Chia `count` câu theo kiểu phối mức độ. */
export function difficultyMix(count: number, preset: 'even' | 'easy' | 'hard' | NonNullable<ItemBase['difficulty']>): DifficultyMix {
  if (preset === 'nhan-biet' || preset === 'ket-noi' || preset === 'van-dung') return { [preset]: count };
  const w = preset === 'easy' ? [0.5, 0.3, 0.2] : preset === 'hard' ? [0.2, 0.3, 0.5] : [0.34, 0.33, 0.33];
  const nb = Math.round(count * w[0]);
  const kn = Math.min(count - nb, Math.round(count * w[1]));
  return { 'nhan-biet': nb, 'ket-noi': kn, 'van-dung': Math.max(0, count - nb - kn) };
}

function toDrafts(items: Item[], d: ImportDefaults, demo: boolean): DraftItem[] {
  return items.map((item) => ({
    rowId: newRowId(),
    item: { ...item, ...(d.skills?.length && !item.skills?.length ? { skills: [...d.skills] } : {}) } as Item,
    source: 'ai' as const,
    notes: [],
    ...(demo ? { demo: true } : {}),
    given: item.difficulty ? { difficulty: true } : {},
  }));
}

async function invoke(task: string, input: Record<string, unknown>): Promise<{ items?: Item[]; provider?: string }> {
  let sb: Awaited<ReturnType<typeof getSupabaseClient>>;
  try {
    sb = await getSupabaseClient();
  } catch {
    throw new AiError('Chưa kết nối được máy chủ. Thầy/cô kiểm tra mạng rồi thử lại nhé.', 'network');
  }
  const { data, error } = await sb.functions.invoke('ai-gateway', { body: { task, input } });
  if (error) {
    // FunctionsHttpError: thông báo tiếng Việt + mã nằm trong body { error, code }.
    const ctx = (error as { context?: Response }).context;
    let msg = '';
    let code = '';
    try {
      const body = ctx && typeof ctx.json === 'function' ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      msg = String(body?.error ?? '');
      code = String(body?.code ?? '');
    } catch { /* bỏ qua */ }
    const known: AiErrorCode[] = ['ai_unavailable', 'quota', 'too_large', 'ai_bad_output', 'forbidden', 'bad_request'];
    // Máy chủ bản cũ chưa có tác vụ extract_items → báo rõ.
    if (code === 'bad_task') throw new AiError('Máy chủ chưa cập nhật chức năng này (cần triển khai lại Edge Function ai-gateway).', 'ai_unavailable');
    throw new AiError(msg || 'AI chưa trả lời được, thầy/cô thử lại sau nhé.', (known as string[]).includes(code) ? (code as AiErrorCode) : ctx ? 'error' : 'network');
  }
  return (data ?? {}) as { items?: Item[]; provider?: string };
}

export async function aiGenerateItems(ds: DataSource, input: AiGenerateInput): Promise<AiItemsResult> {
  const d: ImportDefaults = { grade: input.grade, subject: input.subject, ...(input.skillCodes?.length ? { skills: input.skillCodes } : {}) };
  if (ds.mode !== 'supabase') return { drafts: toDrafts(demoGenerate(input), d, true), demo: true };
  const skills = (input.skillCodes ?? []).filter((c) => SKILL_BY_CODE[c]);
  const res = await invoke('generate_items', {
    grade: input.grade,
    subject: input.subject,
    count: input.count,
    ...(input.types?.length ? { types: input.types } : {}),
    ...(input.text?.trim() ? { text: input.text.trim() } : {}),
    ...(input.topic?.trim() ? { topic: input.topic.trim() } : {}),
    ...(skills.length ? { skillCodes: skills, skillTexts: skills.map((c) => SKILL_BY_CODE[c].text) } : {}),
    ...(input.difficultyMix ? { difficultyMix: input.difficultyMix } : {}),
  });
  if (!Array.isArray(res.items) || !res.items.length) throw new AiError('AI chưa soạn được câu hỏi hợp lệ, thầy/cô thử lại nhé.', 'ai_bad_output');
  return { drafts: toDrafts(res.items, d, false), demo: false, ...(res.provider ? { provider: res.provider } : {}) };
}

export async function aiExtractItems(ds: DataSource, input: AiExtractInput): Promise<AiItemsResult> {
  const d: ImportDefaults = { grade: input.grade ?? 5, subject: input.subject ?? 'khac' };
  if (!AI_FILE_TYPES.includes(input.mimeType)) throw new AiError('Chỉ nhận ảnh JPG, PNG, WEBP hoặc tệp PDF.', 'bad_request');
  if (base64Bytes(input.fileBase64) > AI_FILE_MAX_BYTES) throw new AiError('Tệp quá lớn (tối đa 4 MB). Thầy/cô chụp từng trang hoặc tách PDF nhỏ hơn nhé.', 'too_large');
  if (ds.mode !== 'supabase') return { drafts: toDrafts(demoExtract(d), d, true), demo: true };
  const res = await invoke('extract_items', {
    fileBase64: input.fileBase64,
    mimeType: input.mimeType,
    ...(input.grade ? { grade: input.grade } : {}),
    ...(input.subject ? { subject: input.subject } : {}),
  });
  if (!Array.isArray(res.items) || !res.items.length) throw new AiError('AI không đọc được câu hỏi nào trong tệp này.', 'ai_bad_output');
  return { drafts: toDrafts(res.items, d, false), demo: false, ...(res.provider ? { provider: res.provider } : {}) };
}

/* ---------------- chuẩn bị tệp ---------------- */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

export interface PreparedAiFile {
  fileBase64: string;
  mimeType: string;
  bytes: number;
  /** PDF có lớp chữ chọn được → dán văn bản sẽ nhanh hơn và không tốn lượt AI. */
  pdfHasText?: boolean;
}

/** Ảnh: thu nhỏ về JPEG cạnh dài ≤ 1600 px ngay trên trình duyệt. PDF: giữ nguyên, kiểm tra ≤ 4 MB. */
export async function prepareAiFile(file: Blob): Promise<PreparedAiFile> {
  const type = file.type || '';
  if (type === 'application/pdf') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfHasText = pdfLooksTextual(bytes);
    if (bytes.length > AI_FILE_MAX_BYTES) {
      throw new AiError(`Tệp PDF nặng ${(bytes.length / 1048576).toFixed(1)} MB — vượt mức 4 MB. ${pdfHasText ? 'PDF này chọn được chữ: thầy/cô chép chữ rồi dán vào ô văn bản là nhanh nhất.' : 'Thầy/cô chụp ảnh từng trang hoặc tách PDF nhỏ hơn nhé.'}`, 'too_large');
    }
    return { fileBase64: bytesToBase64(bytes), mimeType: type, bytes: bytes.length, pdfHasText };
  }
  if (!type.startsWith('image/')) throw new AiError('Chỉ nhận ảnh (JPG, PNG, WEBP) hoặc tệp PDF.', 'bad_request');
  let img: Awaited<ReturnType<typeof compressWorkImage>>;
  try {
    img = await compressWorkImage(file);
  } catch {
    throw new AiError('Không mở được ảnh này. Thầy/cô chọn ảnh khác nhé (ảnh HEIC của iPhone cần đổi sang JPG).', 'bad_request');
  }
  const m = img.url.match(/^data:([^;,]+);base64,(.*)$/);
  if (!m) throw new AiError('Không đọc được ảnh này.', 'bad_request');
  const mimeType = AI_FILE_TYPES.includes(m[1]) ? m[1] : 'image/jpeg';
  const bytes = base64Bytes(m[2]);
  if (bytes > AI_FILE_MAX_BYTES) throw new AiError('Ảnh quá lớn sau khi nén. Thầy/cô chụp gần hơn hoặc cắt bớt nhé.', 'too_large');
  return { fileBase64: m[2], mimeType, bytes };
}

/**
 * Đoán PDF có lớp chữ (không phải bản quét): giải nén vài luồng nội dung và tìm toán tử vẽ chữ Tj / TJ.
 * Chỉ để GỢI Ý cho GV; sai cũng không sao.
 */
export function pdfLooksTextual(bytes: Uint8Array): boolean {
  try {
    const dec = new TextDecoder('latin1');
    const head = dec.decode(bytes.subarray(0, Math.min(bytes.length, 6 * 1024 * 1024)));
    if (!head.startsWith('%PDF')) return false;
    if (!/\/Font\b/.test(head)) return false;
    let hits = 0;
    let tried = 0;
    const re = /stream\r?\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(head)) && tried < 60) {
      const start = m.index + m[0].length;
      const end = head.indexOf('endstream', start);
      if (end < 0) break;
      re.lastIndex = end;
      if (end - start > 2 * 1024 * 1024 || end - start < 20) continue;
      const dict = head.slice(Math.max(0, m.index - 300), m.index);
      if (/\/Subtype\s*\/Image|\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode/.test(dict)) continue;
      tried++;
      let content = head.slice(start, end);
      if (/\/FlateDecode/.test(dict)) {
        try {
          let stop = end;
          while (stop > start && (bytes[stop - 1] === 10 || bytes[stop - 1] === 13)) stop--;
          let raw: Uint8Array;
          try {
            raw = unzlibSync(bytes.subarray(start, stop));
          } catch {
            raw = unzlibSync(bytes.subarray(start, end));
          }
          content = dec.decode(raw.subarray(0, 200_000));
        } catch {
          continue;
        }
      }
      const n = (content.match(/(?:\)|\]|>)\s*T[jJ]\b/g) ?? []).length;
      hits += n;
      if (hits >= 15) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* ---------------- bản mẫu của chế độ demo ---------------- */
function rnd(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const LEVELS: NonNullable<ItemBase['difficulty']>[] = ['nhan-biet', 'ket-noi', 'van-dung'];

function levelsFor(count: number, mix?: DifficultyMix): (ItemBase['difficulty'] | undefined)[] {
  if (!mix) return Array.from({ length: count }, () => undefined);
  const out: ItemBase['difficulty'][] = [];
  for (const l of LEVELS) for (let i = 0; i < (mix[l] ?? 0); i++) out.push(l);
  return Array.from({ length: count }, (_x, i) => out[i]);
}

/** Demo: Toán → phép tính thật theo lớp (đáp án đúng); môn khác / có văn bản → câu giữ chỗ từ các câu trong văn bản. */
export function demoGenerate(input: AiGenerateInput): Item[] {
  const d: ImportDefaults = { grade: input.grade, subject: input.subject };
  const count = Math.max(1, Math.min(20, Math.round(input.count) || 5));
  const types = input.types?.length ? input.types : (['MCQ', 'SHORT_ANSWER'] as ItemType[]);
  const levels = levelsFor(count, input.difficultyMix);
  const r = rnd(count * 31 + input.grade * 7 + (input.topic ?? input.text ?? '').length);
  const out: Item[] = [];
  const sentences = (input.text ?? '').split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 12);
  for (let i = 0; i < count; i++) {
    const wantMcq = types.includes('MCQ') && (!types.includes('SHORT_ANSWER') || i % 2 === 0);
    let item: Item;
    if (input.subject === 'toan' && !sentences.length) {
      const max = [10, 50, 500, 5000, 50000][input.grade - 1];
      const lv = levels[i] ?? 'nhan-biet';
      const a = 2 + Math.floor(r() * max);
      const b = 2 + Math.floor(r() * (lv === 'nhan-biet' ? Math.min(max, 9) : max));
      const mul = input.grade >= 3 && lv !== 'nhan-biet' && i % 3 === 2;
      const sub = !mul && i % 2 === 1;
      const x = mul ? 2 + (a % 8) : sub ? Math.max(a, b) : a;
      const y = mul ? 2 + (b % 8) : sub ? Math.min(a, b) : b;
      const ans = mul ? x * y : sub ? x - y : x + y;
      const expr = `${x} ${mul ? '×' : sub ? '−' : '+'} ${y}`;
      const story = lv === 'van-dung' && !mul;
      const prompt = story
        ? sub ? `Một cửa hàng có ${x} quyển vở, đã bán ${y} quyển. Hỏi cửa hàng còn lại bao nhiêu quyển vở?` : `Lớp em trồng được ${x} cây, lớp bạn trồng được ${y} cây. Hỏi cả hai lớp trồng được bao nhiêu cây?`
        : `Tính: ${expr} = ?`;
      if (wantMcq || !types.includes('SHORT_ANSWER')) {
        const wrong = [ans + 1, Math.max(0, ans - 1), ans + 10].filter((w, k, arr) => w !== ans && arr.indexOf(w) === k);
        const all = [ans, ...wrong].slice(0, 4);
        const rot = Math.floor(r() * all.length);
        const opts = [...all.slice(rot), ...all.slice(0, rot)];
        item = makeMcq(prompt, opts.map(String), [opts.indexOf(ans)], d);
      } else item = makeShort(prompt, [String(ans)], d);
      item.explanation = `${expr} = ${ans}`;
    } else {
      const s = sentences.length ? sentences[i % sentences.length] : `${input.topic?.trim() || 'Chủ đề'} — ý ${i + 1}`;
      const short = s.length > 110 ? `${s.slice(0, 107)}…` : s;
      item = makeMcq(`Theo bài học: "${short}" — nhận định nào đúng?`, ['Đáp án đúng (thầy/cô sửa lại)', 'Phương án nhiễu 1', 'Phương án nhiễu 2', 'Phương án nhiễu 3'], [0], d);
    }
    if (levels[i]) item.difficulty = levels[i];
    item.tags = ['ai', 'demo'];
    out.push(item);
  }
  return out;
}

/** Demo: 3 câu mẫu thay cho kết quả AI đọc ảnh / PDF. */
export function demoExtract(d: ImportDefaults): Item[] {
  const items = [
    makeMcq('Số gồm 3 chục và 5 đơn vị là:', ['53', '35', '305', '8'], [1], d),
    makeMcq('Hình nào có 4 cạnh bằng nhau và 4 góc vuông?', ['Hình tam giác', 'Hình chữ nhật', 'Hình vuông', 'Hình tròn'], [2], d),
    makeShort('Tính: 48 + 27 = …', ['75'], d),
  ];
  items.forEach((it) => { it.tags = ['ai', 'demo']; });
  return items;
}
