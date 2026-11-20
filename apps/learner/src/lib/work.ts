import type { RemediationSet, SubmissionDetail, Tt27Level } from '@openedu/contracts';
import { safeGet, safeSet } from './util';

/** Trạng thái bài viết theo góc nhìn HS (không lộ trạng thái chấm AI). */
export type WorkState = 'todo' | 'waiting' | 'feedback' | 'redo';

export function workState(sub: SubmissionDetail | undefined): WorkState {
  if (!sub) return 'todo';
  if (sub.status === 'approved') return 'feedback';
  if (sub.status === 'returned') return 'redo';
  return 'waiting';
}

export const workPath = (taskId: string) => `/bai-viet/${encodeURIComponent(taskId)}`;

/** Sao nhận khi được duyệt (khớp approvalReward: C 1 · H 2 · T 3). */
export const LEVEL_STARS: Record<Tt27Level, number> = { T: 3, H: 2, C: 1 };
export const LEVEL_CHEER: Record<Tt27Level, string> = { T: 'Tuyệt vời!', H: 'Làm tốt lắm!', C: 'Mình cùng cố thêm nhé!' };

/** "Cô Thu" → "cô", "Thầy Nam" → "thầy", không rõ → "thầy cô". */
export function teacherWord(name?: string): string {
  const n = (name ?? '').trim().toLowerCase();
  if (n.indexOf('cô') === 0) return 'cô';
  if (n.indexOf('thầy') === 0) return 'thầy';
  return 'thầy cô';
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

const seenKey = (subId: string) => `ln-work-seen:${subId}`;
export const isSeen = (subId: string) => safeGet(seenKey(subId)) === '1';
export const markSeen = (subId: string) => safeSet(seenKey(subId), '1');

export const draftKey = (studentId: string, taskId: string) => `ln-work-draft:${studentId}:${taskId}`;
export function clearDraft(key: string) {
  try { window.localStorage.removeItem(key); } catch { /* bỏ qua */ }
}

/** Tách lời nhắn: phần khen + "bước tiếp theo" (câu cuối mang tính gợi ý). */
export function splitFeedback(text: string, fallbackNext?: string): { praise: string; next: string | null } {
  const parts = (text.match(/[^.!?…]+[.!?…]*/g) ?? []).map((x) => x.trim()).filter(Boolean);
  const hint = /(em (nên|hãy|thử|nhớ|cần)|lần sau|nhớ |thử |hãy |cần )/i;
  for (let i = parts.length - 1; i >= 1; i--) {
    if (hint.test(parts[i])) return { praise: parts.filter((_, j) => j !== i).join(' '), next: parts[i] };
  }
  return { praise: text, next: fallbackNext ?? null };
}

/** Kĩ năng còn yếu trong bài đã duyệt → bộ ôn tương ứng (nếu có). */
export function weakSet(sub: SubmissionDetail | undefined, sets: RemediationSet[] | undefined): RemediationSet | null {
  const g = sub?.grade;
  if (!g || !sets?.length) return null;
  const weak = g.skills.filter((s) => s.evidence === 'sai').map((s) => s.code);
  g.issues.forEach((i) => { if (i.skill) weak.push(i.skill); });
  if (!weak.length) return null;
  return sets.find((s) => weak.indexOf(s.skillCode) >= 0) ?? sets.find((s) => weak.indexOf(s.rootSkill) >= 0) ?? null;
}

/** Xoay ảnh dataURL 90° theo chiều kim đồng hồ. */
export function rotateDataUrl(url: string): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalHeight; c.height = im.naturalWidth;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('Chưa xoay được ảnh.')); return; }
      ctx.translate(c.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(im, 0, 0);
      resolve({ url: c.toDataURL('image/jpeg', 0.85), width: c.width, height: c.height });
    };
    im.onerror = () => reject(new Error('Chưa xoay được ảnh.'));
    im.src = url;
  });
}
