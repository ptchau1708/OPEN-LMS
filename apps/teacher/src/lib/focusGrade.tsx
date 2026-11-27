/**
 * Khối ưu tiên của giáo viên (mặc định lớp 5). Đồng bộ giữa các máy qua cài đặt cá nhân (v2.user_prefs, khoá "khoi.uu-tien").
 *  - Ô chọn lớp / khối khi tạo mới (bài giảng, câu hỏi, tiêu chí, ma trận đề, kĩ năng…): lớp đang chọn, nếu không có thì khối ưu tiên.
 *  - Bộ lọc thư viện (ngân hàng câu hỏi, bài giảng): mặc định khối ưu tiên, vẫn chọn được "Mọi lớp".
 *  - Danh sách lớp, bài giảng, câu hỏi: khối ưu tiên lên đầu, rồi đến khối gần nhất.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ClassInfo, Grade } from '@openedu/contracts';
import { useClasses as useDataClasses, usePref } from '@openedu/data';

export const FOCUS_GRADE_KEY = 'khoi.uu-tien';
export const DEFAULT_FOCUS_GRADE: Grade = 5;
export const GRADES: Grade[] = [1, 2, 3, 4, 5];

export const isGrade = (v: unknown): v is Grade => v === 1 || v === 2 || v === 3 || v === 4 || v === 5;

interface FocusCtx { grade: Grade; set: (g: Grade) => void; saving: boolean; synced: boolean }
const Ctx = createContext<FocusCtx>({ grade: DEFAULT_FOCUS_GRADE, set: () => undefined, saving: false, synced: false });

export function FocusGradeProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const p = usePref<number>(userId, FOCUS_GRADE_KEY);
  const grade = isGrade(p.value) ? p.value : DEFAULT_FOCUS_GRADE;
  const { set, saving, synced } = p;
  const value = useMemo<FocusCtx>(() => ({ grade, set: (g) => set(g), saving, synced }), [grade, set, saving, synced]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Khối ưu tiên hiện tại (mặc định 5). */
export function useFocusGrade(): FocusCtx {
  return useContext(Ctx);
}

/** Khối mặc định cho một biểu mẫu: khối của lớp đang chọn, không có thì khối ưu tiên. */
export function useDefaultGrade(cls?: { grade?: number } | null): Grade {
  const focus = useFocusGrade().grade;
  return isGrade(cls?.grade) ? cls.grade : focus;
}

/** Thứ tự ưu tiên của một khối: khối ưu tiên = 0, rồi khối gần nhất (bằng nhau thì khối lớn hơn trước). */
export function gradeRank(g: number | undefined, focus: Grade): number {
  if (!isGrade(g)) return 99;
  const d = Math.abs(g - focus);
  return d * 2 + (g > focus ? 0 : 1) - (d === 0 ? 1 : 0);
}

/** Sắp xếp (ổn định) theo khối ưu tiên — giữ nguyên thứ tự cũ trong cùng một khối. */
export function byFocus<T>(list: readonly T[], focus: Grade, grade: (x: T) => number | undefined): T[] {
  return list.map((x, i) => [x, i] as const)
    .sort((a, b) => gradeRank(grade(a[0]), focus) - gradeRank(grade(b[0]), focus) || a[1] - b[1])
    .map(([x]) => x);
}

/**
 * Như useClasses của @openedu/data nhưng lớp thuộc khối ưu tiên đứng đầu (lớp mặc định khi mở trang),
 * trong cùng khối xếp theo tên lớp.
 */
export function useClasses(teacherId?: string) {
  const focus = useFocusGrade().grade;
  const q = useDataClasses(teacherId);
  const data = useMemo(
    () => (q.data ? byFocus([...q.data].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true })), focus, (c: ClassInfo) => c.grade) : q.data),
    [q.data, focus],
  );
  return { ...q, data } as typeof q;
}
