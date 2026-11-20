/**
 * Nạp kho nội dung mẫu (câu hỏi + bài giảng + tiêu chí chấm) vào nguồn dữ liệu thật qua chính các hàm lưu của app
 * (saveItem / saveLesson / saveRubric) — nên đúng cấu trúc, đúng quyền, và chạy lại được (id cố định → ghi đè, không nhân đôi).
 * Dùng cho quản trị ở lần cài đầu trên Supabase (kho câu hỏi trống). Chế độ demo đã có sẵn nội dung nên không cần.
 */
import type { DataSource } from '@openedu/contracts';

export interface ImportProgress { done: number; total: number; label: string }
export interface ImportReport { items: number; lessons: number; rubrics: number; failed: { id: string; error: string }[] }

async function pool<T>(list: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, async () => {
    while (i < list.length) { const x = list[i++]!; await fn(x); }
  }));
}

export async function importSampleContent(ds: DataSource, ownerId: string, onProgress?: (p: ImportProgress) => void): Promise<ImportReport> {
  const { buildSeed } = await import('./index');
  const seed = buildSeed();
  // Slide gói HTML5 mẫu cần origin nội dung riêng — bỏ khỏi bản nạp.
  const lessons = seed.lessons.map((l) => ({ ...l, ownerId, slides: l.slides.filter((s) => !s.packageId) }));
  const rubrics = seed.rubrics.map((r) => ({ ...r, ownerId }));
  const total = seed.items.length + lessons.length + rubrics.length;
  const rep: ImportReport = { items: 0, lessons: 0, rubrics: 0, failed: [] };
  let done = 0;
  const step = (label: string) => { done++; onProgress?.({ done, total, label }); };
  const fail = (id: string, e: unknown) => rep.failed.push({ id, error: e instanceof Error ? e.message : String(e) });

  await pool(seed.items, 4, async (it) => {
    try { await ds.saveItem(it); rep.items++; } catch (e) { fail(it.id, e); }
    step('Câu hỏi');
  });
  // Bài giảng sau câu hỏi (slide tham chiếu câu hỏi).
  for (const l of lessons) {
    try { await ds.saveLesson(l); rep.lessons++; } catch (e) { fail(l.id, e); }
    step('Bài giảng');
  }
  for (const r of rubrics) {
    try { await ds.saveRubric(r as typeof r); rep.rubrics++; } catch (e) { fail(r.id, e); }
    step('Tiêu chí chấm');
  }
  return rep;
}
