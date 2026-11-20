import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { SUBMISSION_STATUS_LABEL, TT27_LEVEL_LABEL, type ClassInfo, type Profile, type SubmissionStatus, type Tt27Level } from '@openedu/contracts';
import { useClasses, useStudents } from '@openedu/data';
import { Seg } from '../components/common';
import { cx } from './format';

/** Lớp đang chọn, giữ trong ?lop= để quay lại đúng chỗ. */
export function useClassPick(user: Profile) {
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const [sp, setSp] = useSearchParams();
  const list = classes.data ?? [];
  const wanted = sp.get('lop');
  const cls: ClassInfo | undefined = list.find((c) => c.id === wanted) ?? list[0];
  const setClassId = (id: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('lop', id); return n; }, { replace: true });
  return { classes, list, cls, classId: cls?.id ?? '', setClassId };
}

export function ClassPicker({ list, value, onChange }: { list: ClassInfo[]; value: string; onChange: (id: string) => void }) {
  if (list.length < 2) return list[0] ? <span className="tc-chip">Lớp {list[0].name}</span> : null;
  return <Seg label="Chọn lớp" value={value} onChange={onChange} options={list.map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />;
}

/** Học sinh theo thứ tự danh sách lớp. */
export function useRoster(cls?: ClassInfo) {
  const q = useStudents(cls?.id);
  const roster = useMemo(() => {
    const all = q.data ?? [];
    const order = new Map((cls?.studentIds ?? []).map((id, i) => [id, i]));
    return [...all].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.name.localeCompare(b.name, 'vi'));
  }, [q.data, cls]);
  return { ...q, roster };
}

export function LevelBadge({ level, size }: { level?: Tt27Level | null; size?: 'lg' }) {
  if (!level) return <span className="tc-lvl tc-lvl--none" aria-label="Chưa có mức">–</span>;
  return <span className={cx('tc-lvl', `tc-lvl--${level}`, size && 'tc-lvl--lg')} title={TT27_LEVEL_LABEL[level]} aria-label={TT27_LEVEL_LABEL[level]}>{level}</span>;
}

const STATUS_TONE: Record<SubmissionStatus, string> = { submitted: '', grading: 'tc-chip--info', graded: 'tc-chip--info', 'needs-review': 'tc-chip--warn', approved: 'tc-chip--ok', returned: '', error: 'tc-chip--warn' };
export function StatusChip({ status }: { status: SubmissionStatus }) {
  return <span className={cx('tc-chip', STATUS_TONE[status])}>{SUBMISSION_STATUS_LABEL[status]}</span>;
}

export function MockBadge() {
  return <span className="tc-chip tc-chip--mock" title="Điểm do bộ chấm mẫu tạo ra để trình diễn, không phải AI thật">Chấm mẫu (demo)</span>;
}

/** YYYY-MM-DD theo giờ Việt Nam. */
export function vnToday(d = new Date()): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Phím tắt toàn trang (bỏ qua khi đang gõ). */
export function useHotkeys(map: Record<string, () => void>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const fn = map[e.key.toLowerCase()];
      if (fn) { e.preventDefault(); fn(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  });
}

export const QUEUE_TABS: { id: string; label: string; status: SubmissionStatus[] }[] = [
  { id: 'can-xem', label: 'Cần xem lại', status: ['needs-review'] },
  { id: 'da-cham', label: 'Đã chấm', status: ['graded'] },
  { id: 'da-duyet', label: 'Đã duyệt', status: ['approved', 'returned'] },
  { id: 'cho-cham', label: 'Chờ chấm', status: ['submitted', 'grading', 'error'] },
];
