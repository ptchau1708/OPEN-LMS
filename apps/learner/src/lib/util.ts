import { createContext, useContext } from 'react';
import type { Profile, StudentSettings } from '@openedu/contracts';
import { SUBJECTS, type SubjectId } from '@openedu/contracts';

export function resolveSettings(p?: Profile | null): StudentSettings {
  const g = p?.grade;
  const student = !p || p.role === 'student';
  const d: StudentSettings = { bigText: student && (!g || g <= 2), autoRead: g === 1, sound: true, reducedMotion: false };
  const s = { ...d, ...(p?.settings ?? {}) };
  if (!student) s.bigText = false;
  return s;
}

export const MeContext = createContext<Profile | null>(null);
/** Người dùng đã đăng nhập (chỉ dùng bên trong route được bảo vệ). */
export function useMe(): Profile {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe ngoài route bảo vệ');
  return me;
}

export function subjectColor(id: SubjectId | undefined): string {
  const s = SUBJECTS[id ?? 'khac'] ?? SUBJECTS.khac;
  return `var(${s.colorVar}, ${s.color})`;
}

export function safeGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
export function safeSet(key: string, v: string): void {
  try { window.localStorage.setItem(key, v); } catch { /* bỏ qua */ }
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
function startOfDay(d: Date): number { const x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x.getTime(); }
export function daysFromToday(iso: string): number {
  return Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86400000);
}
export function dayLabel(iso: string): string {
  const n = daysFromToday(iso);
  if (n === 0) return 'Hôm nay';
  if (n === -1) return 'Hôm qua';
  if (n === 1) return 'Ngày mai';
  const d = new Date(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
}
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function dueLabel(iso: string): { text: string; late: boolean } {
  const n = daysFromToday(iso);
  if (n < 0) return { text: 'Đã quá hạn', late: true };
  if (n === 0) return { text: 'Hạn hôm nay', late: false };
  if (n === 1) return { text: 'Hạn ngày mai', late: false };
  return { text: `Còn ${n} ngày`, late: false };
}

export function partOfDay(h = new Date().getHours()): string {
  if (h < 11) return 'Chào buổi sáng';
  if (h < 13) return 'Buổi trưa vui vẻ';
  if (h < 18) return 'Chào buổi chiều';
  return 'Buổi tối ấm áp';
}

export function teacherUrl(): string {
  const v = import.meta.env.VITE_TEACHER_URL as string | undefined;
  return v && v.trim() ? v.trim() : `${location.protocol}//${location.hostname}:5174`;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

export function errText(e: unknown, fallback = 'Có trục trặc nhỏ. Em thử lại nhé!'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
