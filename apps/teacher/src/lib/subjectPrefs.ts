/**
 * Môn hiện trên bản đồ kiến thức — mỗi giáo viên tự chọn cho từng lớp (GV dạy rất đa dạng: GVCN, GV Tiếng Anh, Tin học…).
 * Lưu bằng cài đặt cá nhân (`usePref`): đồng bộ giữa các máy qua bảng v2.user_prefs (SQL 18);
 * chưa chạy SQL 18 / bản demo → lưu trên trình duyệt.
 */
import { useCallback } from 'react';
import { SKILLS, SUBJECTS, isPeriodicAt, subjectsForGrade, type SubjectId } from '@openedu/contracts';
import { usePref } from '@openedu/data';

/** Môn đã có danh mục kĩ năng trong OPEN-EDU (bản đồ có cột kĩ năng). */
export const SUBJECTS_WITH_SKILLS: ReadonlySet<SubjectId> = new Set(SKILLS.map((s) => s.subject));

/** Môn thường do GV bộ môn dạy — không bật sẵn, GV tự chọn khi cần. */
const SPECIALIST: ReadonlySet<SubjectId> = new Set<SubjectId>(['tin-hoc', 'cong-nghe']);

/**
 * Mặc định: các môn GV chủ nhiệm thường dạy — môn có kiểm tra định kì của lớp (trừ Tin học, Công nghệ) + TN&XH (lớp 1–3),
 * và đã có danh mục kĩ năng. Lớp 1–2: Tiếng Việt, Toán, TN&XH · lớp 3: + Tiếng Anh · lớp 4–5: Tiếng Việt, Toán, Tiếng Anh, LS&ĐL, Khoa học.
 */
export function defaultMapSubjects(grade: number): SubjectId[] {
  const list = subjectsForGrade(grade).filter((s) => SUBJECTS_WITH_SKILLS.has(s) && !SPECIALIST.has(s) && (isPeriodicAt(s, grade) || s === 'tnxh'));
  return list.length ? list : ['toan'];
}

/** `subjects` có giá trị = GV đã tự chọn; không có = theo mặc định. `current`: môn xem lần trước. */
export interface MapSubjectPref { subjects?: SubjectId[]; current?: SubjectId }

const isSubject = (s: unknown): s is SubjectId => typeof s === 'string' && s in SUBJECTS;
function clean(v: unknown): MapSubjectPref {
  if (!v || typeof v !== 'object') return {};
  const o = v as Record<string, unknown>;
  const subjects = Array.isArray(o.subjects) ? o.subjects.filter(isSubject) : [];
  return { ...(subjects.length ? { subjects } : {}), ...(isSubject(o.current) ? { current: o.current } : {}) };
}

export const mapSubjectKey = (classId: string) => `ban-do-mon.${classId.toLowerCase()}`;

/** Môn GV chọn hiện cho lớp + môn đang xem (nhớ lần sau). `grade` chưa biết (lớp đang tải) → danh sách rỗng. */
export function useMapSubjects(userId: string, classId: string, grade: number | undefined) {
  const pref = usePref<MapSubjectPref>(userId, classId ? mapSubjectKey(classId) : null);
  const stored = clean(pref.value);
  const custom = !!stored.subjects;
  const subjects: SubjectId[] = grade ? stored.subjects ?? defaultMapSubjects(grade) : [];
  const current: SubjectId | undefined = stored.current && subjects.includes(stored.current) ? stored.current : subjects[0];
  const { set } = pref;
  const raw = pref.value;

  const setSubjects = useCallback((list: SubjectId[] | null) => {
    const order = Object.keys(SUBJECTS) as SubjectId[];
    const prev = clean(raw);
    const next: MapSubjectPref = { ...(list && list.length ? { subjects: order.filter((s) => list.includes(s)) } : {}), ...(prev.current ? { current: prev.current } : {}) };
    set(next.subjects || next.current ? next : null);
  }, [raw, set]);

  const setCurrent = useCallback((s: SubjectId) => { set({ ...clean(raw), current: s }); }, [raw, set]);

  return { subjects, current, custom, synced: pref.synced, setSubjects, setCurrent };
}
