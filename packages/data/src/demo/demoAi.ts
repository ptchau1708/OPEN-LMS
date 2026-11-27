/**
 * CHỈ CHẾ ĐỘ DEMO: gọi OpenRouter thẳng từ trình duyệt bằng VITE_DEMO_AI_KEY, dùng chung lời nhắc + bộ kiểm tra JSON
 * với Edge Function `ai-grade`. ⚠ Khóa nằm trong mã JS gửi xuống máy người dùng → ai mở DevTools cũng đọc được.
 * Chỉ dùng cho máy trình diễn / thử nghiệm với khóa giới hạn hạn mức; triển khai thật dùng Supabase (`ai-grade`).
 */
import type { AiGrade, Rubric, Submission, WorkTask } from '@openedu/contracts';
import { buildGradePrompt, buildOpenRouterBody, DEFAULT_GRADER_MODEL, extractOpenRouterText, gradeFromModelText } from '../assess';
import { readEnv } from '../env';
import { imageUrlToDataUrl } from '../workImage';

export function demoAiEnabled(): boolean {
  return !!readEnv('VITE_DEMO_AI_KEY');
}

export async function demoAiGrade(input: { task: WorkTask; rubric: Rubric; submission: Submission; now: string; fetchImpl?: typeof fetch }): Promise<AiGrade> {
  const key = readEnv('VITE_DEMO_AI_KEY');
  if (!key) throw new Error('Chưa cấu hình VITE_DEMO_AI_KEY.');
  const model = readEnv('VITE_DEMO_AI_MODEL') ?? DEFAULT_GRADER_MODEL;
  const { task, rubric, submission } = input;
  const prompt = buildGradePrompt({ task, rubric, text: submission.text, imageCount: submission.images.length });
  const images = await Promise.all(submission.images.map((i) => imageUrlToDataUrl(i.url)));
  const doFetch = input.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await doFetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'OPEN-EDU demo' },
      body: JSON.stringify(buildOpenRouterBody(prompt, images, model)),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Trợ lý chấm bài đang bận (mã ${res.status}). Thầy/cô thử lại sau nhé.`);
    const text = extractOpenRouterText(await res.json());
    return gradeFromModelText(text, { rubric, submissionId: submission.id, model, now: input.now, imageCount: submission.images.length }).grade;
  } finally {
    clearTimeout(timer);
  }
}
