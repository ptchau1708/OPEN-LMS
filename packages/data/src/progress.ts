import type { LessonProgress } from '@openedu/contracts';

/** Ghép tiến độ: slide đã xong hợp lại, câu trả lời giữ kết quả tốt nhất, không xóa completedAt. */
export function mergeProgress(prev: LessonProgress | undefined, next: LessonProgress, nowIso: string): LessonProgress {
  if (!prev) return { ...next, completedSlides: [...new Set(next.completedSlides ?? [])], answers: { ...(next.answers ?? {}) }, updatedAt: nowIso };
  const answers: LessonProgress['answers'] = { ...prev.answers };
  for (const [k, v] of Object.entries(next.answers ?? {})) {
    const old = answers[k];
    answers[k] = old ? { correct: old.correct || v.correct, score: Math.max(old.score, v.score) } : v;
  }
  const out: LessonProgress = {
    userId: next.userId,
    lessonId: next.lessonId,
    slideIndex: typeof next.slideIndex === 'number' ? next.slideIndex : prev.slideIndex,
    completedSlides: [...new Set([...(prev.completedSlides ?? []), ...(next.completedSlides ?? [])])],
    answers,
    starsEarned: Math.max(prev.starsEarned ?? 0, next.starsEarned ?? 0),
    updatedAt: nowIso,
  };
  const completedAt = prev.completedAt ?? next.completedAt;
  if (completedAt) out.completedAt = completedAt;
  return out;
}
