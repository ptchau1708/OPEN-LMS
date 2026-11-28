import { ACTIVITY_TYPES, type ItemType, type SlideLayout } from '@openedu/contracts';
import type { IconName } from '@openedu/ui';

export const LAYOUTS: { id: SlideLayout; label: string; icon: IconName; hint: string }[] = [
  { id: 'title', label: 'Tiêu đề', icon: 'star', hint: 'Chữ lớn + linh vật' },
  { id: 'image-text', label: 'Ảnh + chữ', icon: 'image', hint: 'Ảnh cạnh đoạn chữ' },
  { id: 'fullscreen', label: 'Toàn màn hình', icon: 'video', hint: 'Ảnh, video (câu hỏi chen) hoặc nhúng trang web' },
  { id: 'activity', label: 'Hoạt động', icon: 'puzzle', hint: 'Một câu hỏi tương tác' },
  { id: 'compare', label: 'So sánh 2 cột', icon: 'menu', hint: 'Hai cột đặt cạnh nhau' },
  { id: 'game', label: 'Trò chơi lớp', icon: 'wheel', hint: 'Vòng quay, đua vịt, bom hẹn giờ' },
  { id: 'package', label: 'Gói HTML5', icon: 'upload', hint: 'H5P, SCORM, HTML' },
  { id: 'summary', label: 'Tổng kết', icon: 'trophy', hint: 'Ôn lại, sao thưởng' },
];
export const layoutMeta = (id: SlideLayout) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[1];

export const TYPE_ICON: Record<ItemType, IconName> = {
  MCQ: 'check', MCQ_MULTIPLE: 'check', MATCHING: 'puzzle', ORDERING: 'drag', DRAG_DROP: 'drag', SHORT_ANSWER: 'pencil',
  SENTENCE_SCRAMBLE: 'book', WORD_CLASSIFY: 'puzzle', FILL_IN_PASSAGE: 'pencil', INLINE_DROPDOWN: 'menu', LISTEN_CHOOSE: 'speaker',
  HOTSPOT: 'eye', DRAW: 'pencil', RECORD_READ: 'mic', MATH_MANIPULATIVE: 'clock', POLL: 'team', TRUE_FALSE_MULTI: 'check',
};
export const typeLabel = (t: ItemType) => ACTIVITY_TYPES.find((a) => a.type === t)?.label ?? t;

export function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
export function relTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} ngày trước`;
  return fmtDate(iso);
}
/** Giá trị cho <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(' ');
}
export function shorten(s: string, n = 90): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
