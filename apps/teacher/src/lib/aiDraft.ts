import { uid, SUBJECTS, type DataSource, type Grade, type Item, type Slide, type SlideLayout, type SubjectId } from '@openedu/contracts';

export interface DraftResult { title: string; slides: Slide[]; items: Item[]; source: 'local' | 'ai'; note?: string }

function sentences(p: string): string[] {
  return (p.match(/[^.!?…]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

function mcqPlaceholder(paragraph: string, grade: Grade, subject: SubjectId): Item {
  const first = sentences(paragraph)[0] ?? paragraph;
  return {
    id: uid('it'),
    type: 'MCQ',
    grade,
    subject,
    prompt: { text: `Câu hỏi: ${first.length > 120 ? first.slice(0, 117) + '…' : first} — điều nào đúng?` },
    payload: { options: [{ id: 'a', text: 'Đáp án đúng (sửa lại)' }, { id: 'b', text: 'Đáp án nhiễu 1' }, { id: 'c', text: 'Đáp án nhiễu 2' }], columns: 1 },
    key: { correct: 'a' },
    tags: ['nhap-ai'],
  };
}

/** Soạn nháp bằng quy tắc đơn giản (chế độ demo): tiêu đề, mỗi đoạn một slide ảnh + chữ, 2 đoạn một câu hỏi, tổng kết. */
export function localDraft(text: string, grade: Grade, subject: SubjectId, topic?: string): DraftResult {
  const paras = text.split(/\n\s*\n|\r\n\s*\r\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 0);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = (topic && topic.trim()) || (lines[0] && lines[0].length <= 90 ? lines[0] : 'Bài học mới');
  const body = paras.length > 1 && paras[0] === title ? paras.slice(1) : paras.length === 1 && lines.length > 1 && lines[0] === title ? [lines.slice(1).join(' ')] : paras;
  const mascot = SUBJECTS[subject]?.mascot ?? 'nghe';
  const slides: Slide[] = [{ id: uid('s'), layout: 'title', title, text: 'Cùng khám phá bài học hôm nay nhé!', mascot }];
  const items: Item[] = [];
  body.forEach((p, i) => {
    const ss = sentences(p);
    const head = ss[0] && ss[0].length <= 60 ? ss[0].replace(/[.:!?]$/, '') : `Ý ${i + 1}`;
    slides.push({ id: uid('s'), layout: 'image-text', title: head, text: p, image: 'emoji:📘', teacherNotes: 'Nháp tự động — thay ảnh minh họa và rút gọn chữ cho phù hợp lứa tuổi.' });
    if (i % 2 === 1) {
      const it = mcqPlaceholder(p, grade, subject);
      items.push(it);
      slides.push({ id: uid('s'), layout: 'activity', title: 'Em thử trả lời nhé', itemId: it.id, teacherNotes: 'Câu hỏi giữ chỗ — sửa đề và đáp án trước khi dạy.' });
    }
  });
  if (body.length === 1) {
    const it = mcqPlaceholder(body[0], grade, subject);
    items.push(it);
    slides.push({ id: uid('s'), layout: 'activity', title: 'Em thử trả lời nhé', itemId: it.id });
  }
  const recap = body.map((p) => `• ${(sentences(p)[0] ?? p).slice(0, 90)}`).slice(0, 4).join('\n');
  slides.push({ id: uid('s'), layout: 'summary', title: 'Em đã học được gì?', text: recap || 'Em giỏi lắm!', mascot });
  return { title, slides, items, source: 'local' };
}

interface Outline { title: string; minutes?: number; slides: { layout: string; title: string; text?: string; teacherNotes?: string }[] }
type FnClient = { functions: { invoke: (n: string, o: { body: unknown }) => Promise<{ data: unknown; error: unknown }> } };

/** Lấy Supabase client nếu nguồn dữ liệu có (không có API công khai — xem báo cáo). */
async function supabaseClient(ds: DataSource): Promise<FnClient | null> {
  const x = ds as unknown as { getClient?: () => Promise<FnClient>; client?: FnClient; clientP?: Promise<FnClient> };
  try {
    if (typeof x.getClient === 'function') return await x.getClient();
    if (x.client?.functions) return x.client;
    if (x.clientP) return await x.clientP;
  } catch {
    return null;
  }
  return null;
}

const OK_LAYOUTS: SlideLayout[] = ['title', 'image-text', 'fullscreen', 'activity', 'compare', 'game', 'summary'];

export async function aiDraft(ds: DataSource, text: string, grade: Grade, subject: SubjectId, topic: string): Promise<DraftResult> {
  if (ds.mode !== 'supabase') return { ...localDraft(text, grade, subject, topic), note: 'demo' };
  const sb = await supabaseClient(ds);
  if (!sb) return { ...localDraft(text, grade, subject, topic), note: 'no-client' };
  const { data, error } = await sb.functions.invoke('ai-gateway', { body: { task: 'lesson_outline', input: { topic: topic || text.slice(0, 80), grade, subject, text } } });
  if (error) throw new Error(error instanceof Error ? error.message : 'AI chưa trả lời được, thầy/cô thử lại sau nhé.');
  const outline = (data as { outline?: Outline })?.outline;
  if (!outline || !Array.isArray(outline.slides)) throw new Error('AI trả về dữ liệu không hợp lệ.');
  const items: Item[] = [];
  const slides: Slide[] = outline.slides.map((s) => {
    const layout = (OK_LAYOUTS as string[]).includes(s.layout) ? (s.layout as SlideLayout) : 'image-text';
    const slide: Slide = { id: uid('s'), layout, title: s.title, ...(s.text ? { text: s.text } : {}), ...(s.teacherNotes ? { teacherNotes: s.teacherNotes } : {}) };
    if (layout === 'activity') {
      const it = mcqPlaceholder(s.text ?? s.title, grade, subject);
      items.push(it);
      slide.itemId = it.id;
    }
    return slide;
  });
  return { title: outline.title, slides, items, source: 'ai' };
}
