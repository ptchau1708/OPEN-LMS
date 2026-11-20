/**
 * Lời nhắc cho AI chấm bài làm (THUẦN — chép sang supabase/functions/_shared/assess).
 * Demo (OpenRouter trực tiếp từ trình duyệt) và Edge Function `ai-grade` dùng CÙNG mã này.
 * Không gửi tên / thông tin cá nhân HS cho nhà cung cấp AI.
 */
import { SKILL_BY_CODE, SUBJECTS, MISCONCEPTIONS, type Rubric, type WorkTask } from '@openedu/contracts';

export const DEFAULT_GRADER_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
/** Phiên bản lời nhắc (đổi khi sửa nội dung lời nhắc — snapshot test sẽ báo). */
export const GRADE_PROMPT_VERSION = 'grade-v1';

export interface GradePromptInput {
  task: Pick<WorkTask, 'title' | 'prompt' | 'subject' | 'grade'>;
  rubric: Rubric;
  /** Bài đánh máy (nếu có). */
  text?: string;
  /** Số ảnh bài làm gửi kèm. */
  imageCount: number;
}

export interface GradePrompt {
  system: string;
  user: string;
}

/** Khuôn JSON yêu cầu AI trả về (viết trong lời nhắc). */
export const GRADE_JSON_SHAPE = `{
  "transcript": ["<chữ chép lại từ ảnh 1>", "..."],
  "criteria": [{ "criterionId": "<id>", "points": <số>, "comment": "<nhận xét ngắn>", "evidence": "<trích câu/dòng trong bài>" }],
  "strengths": ["<điểm mạnh>"],
  "issues": [{ "text": "<lỗi / điều cần sửa>", "skill": "<mã kĩ năng>", "misconception": "<mã quan niệm sai>", "location": "<vd: dòng 3, ảnh 1>" }],
  "feedbackStudent": "<2–4 câu>",
  "feedbackTeacher": "<chẩn đoán ngắn>",
  "feedbackParent": "<lời lẽ đơn giản + 1 gợi ý ở nhà>",
  "skills": [{ "code": "<mã kĩ năng>", "evidence": "dung|sai|chua-ro" }],
  "confidence": <0..1>,
  "flags": ["unreadable|off-topic|possible-copy|low-confidence"]
}`;

export function buildGradeSystem(): string {
  return [
    'Bạn là một giáo viên tiểu học Việt Nam nhiều kinh nghiệm, chấm bài theo tinh thần Thông tư 27/2020: động viên, cụ thể, công bằng.',
    'Nhiệm vụ: chấm MỘT bài làm của học sinh CHỈ theo tiêu chí (rubric) được cho. Không tự thêm tiêu chí, không trừ điểm vì chữ xấu nếu vẫn đọc được.',
    'Quy tắc:',
    '1. Nếu có ảnh: chép lại (transcript) TRUNG THỰC chữ viết tay của em, giữ nguyên lỗi chính tả và cách trình bày, mỗi ảnh một phần tử. Chỗ không đọc được ghi [không đọc được]. Không sửa bài khi chép.',
    '2. Chấm từng tiêu chí: "points" từ 0 đến điểm tối đa của tiêu chí (được dùng số lẻ 0,5). "evidence" trích nguyên văn câu/dòng làm căn cứ.',
    '3. Chữ khó đọc hoặc ảnh mờ: nói rõ trong feedbackTeacher, thêm cờ "unreadable", hạ "confidence". Bài không đúng đề: cờ "off-topic". Giống hệt bài mẫu từng chữ: cờ "possible-copy". Không chắc: cờ "low-confidence".',
    '4. "confidence" (0..1) là mức chắc chắn của chính bạn về điểm đã cho.',
    '5. feedbackStudent: 2–4 câu ngắn, gọi học sinh là "em", khen điều làm tốt TRƯỚC, sau đó MỘT bước cụ thể để làm tốt hơn. Không dùng từ nặng nề (sai bét, kém, dở, tệ, lười…), không so sánh với bạn khác, KHÔNG nhắc tới AI hay máy chấm.',
    '6. feedbackTeacher: chẩn đoán ngắn gọn cho giáo viên (lỗi kiến thức hay lỗi cẩn thận, kĩ năng nào cần củng cố).',
    '7. feedbackParent: lời lẽ đơn giản, không thuật ngữ, kèm đúng 1 gợi ý phụ huynh làm cùng con ở nhà trong 5–10 phút.',
    '8. "skills": với mỗi mã kĩ năng được liệt kê, ghi "dung" (bài thể hiện em làm được), "sai" (bài thể hiện em chưa làm được) hoặc "chua-ro". Chỉ dùng mã đã cho. "misconception" chỉ dùng mã đã cho (nếu khớp), nếu không thì bỏ trống.',
    '9. Viết tiếng Việt có dấu. CHỈ trả về MỘT đối tượng JSON hợp lệ đúng khuôn dưới đây, không thêm chữ nào ngoài JSON, không dùng ```.',
    GRADE_JSON_SHAPE,
  ].join('\n');
}

function criteriaBlock(rubric: Rubric): string {
  return rubric.criteria
    .map((c) => {
      const lv = c.levels?.length ? `\n    Mức: ${c.levels.map((l) => `${l.label} (${l.points} đ): ${l.descriptor}`).join(' | ')}` : '';
      return `  - id "${c.id}" · ${c.name} · tối đa ${c.points} điểm: ${c.description}${lv}`;
    })
    .join('\n');
}

/** Quan niệm sai liên quan tới các kĩ năng của rubric (để AI có mã mà dùng). */
function misconceptionBlock(rubric: Rubric): string {
  const set = new Set(rubric.skills);
  const list = Object.values(MISCONCEPTIONS).filter((m) => set.has(m.skill) || (m.rootSkill && set.has(m.rootSkill)));
  return list.length ? list.map((m) => `  - ${m.code}: ${m.text}`).join('\n') : '  (không có)';
}

export function buildGradeUser(input: GradePromptInput): string {
  const { task, rubric } = input;
  const subject = SUBJECTS[task.subject]?.name ?? task.subject;
  const lines: string[] = [
    `Môn: ${subject} · Lớp ${task.grade}`,
    `Bài: ${task.title}`,
    'Đề bài:',
    '"""',
    task.prompt.text.trim(),
    '"""',
    `Thang điểm: ${rubric.maxScore} (tổng điểm tối đa các tiêu chí: ${rubric.criteria.reduce((a, c) => a + c.points, 0)}).`,
    'Tiêu chí chấm:',
    criteriaBlock(rubric),
    'Kĩ năng cần đánh giá:',
    rubric.skills.length ? rubric.skills.map((c) => `  - ${c}: ${SKILL_BY_CODE[c]?.short ?? c}`).join('\n') : '  (không có)',
    'Mã quan niệm sai có thể dùng:',
    misconceptionBlock(rubric),
  ];
  if (rubric.modelAnswer?.trim()) lines.push('Bài giải / bài mẫu tham khảo (học sinh có thể làm cách khác vẫn đúng):', '"""', rubric.modelAnswer.trim(), '"""');
  if (rubric.aiNotes?.trim()) lines.push(`Lưu ý của giáo viên: ${rubric.aiNotes.trim()}`);
  if (input.imageCount > 0) lines.push(`Bài làm của em gồm ${input.imageCount} ảnh chụp đính kèm (theo thứ tự ảnh 1, 2…).`);
  const text = input.text?.trim();
  if (text) lines.push('Bài làm đánh máy của em:', '"""', text, '"""');
  if (!text && input.imageCount === 0) lines.push('(Em chưa viết gì.)');
  lines.push('Hãy chấm và trả về JSON.');
  return lines.join('\n');
}

export function buildGradePrompt(input: GradePromptInput): GradePrompt {
  return { system: buildGradeSystem(), user: buildGradeUser(input) };
}

type Json = Record<string, unknown>;

/** Thân yêu cầu OpenRouter (chat/completions, ảnh dạng image_url: URL có ký hoặc dataURL). */
export function buildOpenRouterBody(p: GradePrompt, imageUrls: string[], model = DEFAULT_GRADER_MODEL): Json {
  const content: Json[] = [{ type: 'text', text: p.user }];
  for (const url of imageUrls) content.push({ type: 'image_url', image_url: { url } });
  return {
    model,
    messages: [
      { role: 'system', content: p.system },
      { role: 'user', content },
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  };
}

/** Thân yêu cầu Gemini REST generateContent (ảnh inline_data base64). */
export function buildGeminiBody(p: GradePrompt, images: { mimeType: string; data: string }[], model = DEFAULT_GEMINI_MODEL): Json {
  const parts: Json[] = [{ text: p.user }, ...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.data } }))];
  const generationConfig: Json = { temperature: 0.2, maxOutputTokens: 3000, responseMimeType: 'application/json' };
  if (model.includes('flash')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return { systemInstruction: { parts: [{ text: p.system }] }, contents: [{ role: 'user', parts }], generationConfig };
}

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function extractOpenRouterText(data: unknown): string {
  const choices = isObj(data) && Array.isArray(data.choices) ? data.choices : [];
  const msg = isObj(choices[0]) && isObj(choices[0].message) ? choices[0].message : null;
  const c = msg ? msg.content : null;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => (isObj(x) && typeof x.text === 'string' ? x.text : '')).join('');
  return '';
}

export function extractGeminiText(data: unknown): string {
  const cands = isObj(data) && Array.isArray(data.candidates) ? data.candidates : [];
  const content = isObj(cands[0]) && isObj(cands[0].content) ? cands[0].content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  return parts.map((x) => (isObj(x) && typeof x.text === 'string' ? x.text : '')).join('');
}
