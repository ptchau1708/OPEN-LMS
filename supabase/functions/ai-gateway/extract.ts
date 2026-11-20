/**
 * ai-gateway — task 'extract_items': AI CHÉP LẠI câu hỏi từ ảnh chụp / PDF đề (docs/PHASE7_QUESTION_BANK.md).
 *
 * Vào:  input { fileBase64, mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf', grade?, subject? }
 *       Tệp ≤ 4 MB (sau giải mã base64); kiểm tra chữ kí đầu tệp khớp mimeType.
 * Ra:   { text, items, provider }  items: Item[] đã qua CÙNG bộ kiểm tra `normalizeItem` với generate_items. CHƯA lưu.
 *       - Đề không ghi đáp án và AI cũng không nêu → item có đáp án RỖNG (MCQ: key.correct = '', SHORT_ANSWER: accepted = [])
 *         để màn hình soát báo "Thiếu đáp án".
 *       - Đáp án do AI tự giải (đề không ghi) → item có thẻ 'dap-an-ai' để màn hình soát nhắc GV kiểm tra.
 * Chỉ GV/admin; dùng chung hạn mức 'generate'. Không lưu tệp ở đâu cả.
 */
import type { Item, ItemType, SubjectId } from '../_shared/scoring/contracts.ts';
import { HttpError, isObject, type JsonObject } from '../_shared/http.ts';

export const EXTRACT_FILE_MAX_BYTES = 4 * 1024 * 1024;
/** Thân yêu cầu tối đa khi task = extract_items (base64 của 4 MB ≈ 5,6 MB + phần còn lại). */
export const EXTRACT_BODY_MAX_BYTES = 6_000_000;
export const EXTRACT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const EXTRACT_TYPES: ItemType[] = ['MCQ', 'MCQ_MULTIPLE', 'SHORT_ANSWER', 'MATCHING', 'ORDERING', 'FILL_IN_PASSAGE'];
const MAX_ITEMS = 40;
export const AI_ANSWER_TAG = 'dap-an-ai';

export interface LlmFile {
  mimeType: string;
  /** base64 thuần (không có tiền tố data:). */
  data: string;
}

export interface ExtractDeps {
  complete: (r: { system: string; user: string; json: boolean; temperature: number; maxTokens: number; file?: LlmFile; timeoutMs?: number }) => Promise<{ text: string; provider: string }>;
  normalizeItem: (raw: unknown, grade: 1 | 2 | 3 | 4 | 5, subject: SubjectId, allowed: Set<string>) => Item | null;
  parseLooseJson: (text: string) => unknown;
  /** Lược đồ JSON mẫu theo dạng (ITEM_SCHEMAS của ai-gateway). */
  schemas: Record<string, string>;
  subjectName: (s: SubjectId) => string;
  takeQuota: () => Promise<boolean>;
  quotaMessage: string;
}

function sniff(b64: string): string | null {
  let head: string;
  try {
    head = atob(b64.slice(0, 24));
  } catch {
    return null;
  }
  const c = (i: number): number => head.charCodeAt(i);
  if (c(0) === 0xff && c(1) === 0xd8 && c(2) === 0xff) return 'image/jpeg';
  if (c(0) === 0x89 && head.slice(1, 4) === 'PNG') return 'image/png';
  if (head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') return 'image/webp';
  if (head.slice(0, 4) === '%PDF') return 'application/pdf';
  return null;
}

function decodedBytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function systemExtract(grade: number | null, subject: SubjectId | null, deps: ExtractDeps): string {
  return [
    'Bạn là trợ lý nhập liệu cho giáo viên tiểu học Việt Nam. Tệp đính kèm là ảnh chụp hoặc PDF một đề kiểm tra / phiếu bài tập.',
    `${subject && subject !== 'khac' ? `Môn ${deps.subjectName(subject)}. ` : ''}${grade ? `Lớp ${grade}. ` : ''}Hãy CHÉP LẠI TRUNG THÀNH từng câu hỏi trong tệp thành JSON.`,
    'Quy tắc:',
    '- Giữ nguyên lời văn, số liệu, đơn vị, dấu tiếng Việt; KHÔNG sửa đề, KHÔNG thêm câu, KHÔNG bỏ câu đọc được. Bỏ "Câu 1:", số điểm, tên trường, họ tên.',
    '- Phân số viết a/b; số thập phân giữ dấu phẩy; phép nhân ×, phép chia : như trong đề.',
    '- Câu trắc nghiệm → MCQ (hoặc MCQ_MULTIPLE nếu đề yêu cầu chọn nhiều); câu tự luận / điền số → SHORT_ANSWER; nối cột → MATCHING; sắp xếp → ORDERING; điền vào chỗ trống trong đoạn → FILL_IN_PASSAGE.',
    '- Câu có nhiều ý a), b), c) cần trả lời riêng → tách mỗi ý thành một item, nhắc lại lời dẫn.',
    '- Câu phải nhìn hình mới làm được mà không mô tả được bằng chữ → bỏ qua câu đó.',
    '- Đáp án: nếu đề ĐÃ GHI đáp án (khoanh, đánh dấu, bảng đáp án) thì dùng đáp án đó và đặt "answerInSource": true.',
    '  Nếu đề KHÔNG ghi đáp án: tự giải cẩn thận, điền vào "key" và đặt "answerInSource": false. Không chắc → để "key": null.',
    '- Mỗi item có thể có "difficulty" ("nhan-biet" | "ket-noi" | "van-dung").',
    `Chỉ trả về JSON hợp lệ dạng {"items":[...]} (tối đa ${MAX_ITEMS} item), không thêm lời nào ngoài JSON. Tệp không có câu hỏi → {"items":[]}.`,
    'Cấu trúc từng dạng:',
    ...EXTRACT_TYPES.map((t) => `- ${deps.schemas[t]}`),
  ].join('\n');
}

/**
 * Item thiếu / sai đáp án vẫn giữ lại (để GV điền): thử kiểm tra với đáp án giữ chỗ, đạt thì trả item với đáp án RỖNG.
 * Chỉ áp dụng cho MCQ / MCQ_MULTIPLE / SHORT_ANSWER; dạng khác thiếu đáp án thì loại.
 */
function normalizeLenient(raw: unknown, grade: 1 | 2 | 3 | 4 | 5, subject: SubjectId, allowed: Set<string>, deps: ExtractDeps): Item | null {
  const strict = deps.normalizeItem(raw, grade, subject, allowed);
  if (strict) {
    if (isObject(raw) && raw.answerInSource === false) (strict as { tags?: string[] }).tags = [...(strict.tags ?? []), AI_ANSWER_TAG];
    return strict;
  }
  if (!isObject(raw)) return null;
  const payload = isObject(raw.payload) ? raw.payload : {};
  const opts = Array.isArray(payload.options) ? payload.options : [];
  const firstId = isObject(opts[0]) && typeof opts[0].id === 'string' && opts[0].id.trim() ? opts[0].id.trim() : 'a';
  let probe: JsonObject | null = null;
  if (raw.type === 'MCQ') probe = { ...raw, key: { correct: firstId } };
  else if (raw.type === 'MCQ_MULTIPLE') probe = { ...raw, key: { correct: [firstId] } };
  else if (raw.type === 'SHORT_ANSWER') probe = { ...raw, key: { accepted: ['?'] } };
  if (!probe) return null;
  const item = deps.normalizeItem(probe, grade, subject, allowed);
  if (!item) return null;
  const blank = item as unknown as { key: JsonObject; payload: JsonObject };
  if (raw.type === 'MCQ') blank.key = { correct: '' };
  else if (raw.type === 'MCQ_MULTIPLE') blank.key = { correct: [] };
  else {
    blank.key = { accepted: [] };
    delete blank.payload.inputMode;
  }
  return item;
}

export async function handleExtract(input: JsonObject, deps: ExtractDeps, opts: { grade: 1 | 2 | 3 | 4 | 5 | null; subject: SubjectId | null }): Promise<{ text: string; items: Item[]; provider: string }> {
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : '';
  if (!(EXTRACT_MIME as readonly string[]).includes(mimeType)) {
    throw new HttpError(400, 'Chỉ nhận ảnh JPG, PNG, WEBP hoặc tệp PDF.', 'bad_request');
  }
  let data = typeof input.fileBase64 === 'string' ? input.fileBase64.trim() : '';
  const comma = data.startsWith('data:') ? data.indexOf(',') : -1;
  if (comma >= 0) data = data.slice(comma + 1);
  if (!data) throw new HttpError(400, 'Thiếu tệp ảnh hoặc PDF.', 'bad_request');
  if (decodedBytes(data) > EXTRACT_FILE_MAX_BYTES) {
    throw new HttpError(413, 'Tệp quá lớn (tối đa 4 MB). Thầy cô chụp từng trang hoặc tách PDF nhỏ hơn nhé.', 'too_large');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) throw new HttpError(400, 'Tệp gửi lên không đọc được.', 'bad_request');
  if (sniff(data) !== mimeType) throw new HttpError(400, 'Nội dung tệp không khớp định dạng (JPG, PNG, WEBP, PDF).', 'bad_request');

  if (!(await deps.takeQuota())) throw new HttpError(429, deps.quotaMessage, 'quota');

  const r = await deps.complete({
    system: systemExtract(opts.grade, opts.subject, deps),
    user: 'Chép lại các câu hỏi trong tệp đính kèm thành JSON theo đúng quy tắc.',
    json: true,
    temperature: 0.1,
    maxTokens: 8000,
    file: { mimeType, data },
    timeoutMs: 60_000,
  });
  const parsed = deps.parseLooseJson(r.text);
  const rawItems = Array.isArray(parsed) ? parsed : isObject(parsed) && Array.isArray(parsed.items) ? parsed.items : [];
  const allowed = new Set<string>(EXTRACT_TYPES);
  const grade = opts.grade ?? 3;
  const subject = opts.subject ?? 'khac';
  const items = rawItems
    .slice(0, MAX_ITEMS * 2)
    .map((x) => normalizeLenient(x, grade, subject, allowed, deps))
    .filter((x): x is Item => x !== null)
    .slice(0, MAX_ITEMS);
  if (items.length === 0) {
    throw new HttpError(502, 'AI không đọc được câu hỏi nào trong tệp này. Thầy cô thử ảnh rõ hơn, hoặc dán văn bản / dùng mẫu Excel nhé.', 'ai_bad_output');
  }
  return { text: r.text, items, provider: r.provider };
}
