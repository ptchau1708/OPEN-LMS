/**
 * "Việc hôm nay" của giáo viên: bài cần chấm, tin nhắn phụ huynh chưa đọc, mục chờ gửi phụ huynh,
 * điểm danh hôm nay, bài giao sắp hết hạn — gộp cho mọi lớp của thầy/cô.
 * Dùng cho Tổng quan (thẻ "Việc hôm nay") và số đếm trên thanh bên.
 * Mỗi lớp một "đầu dò" (component ẩn) gọi hook rồi báo số về; lỗi (ví dụ chưa chạy SQL 23) tính là 0.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ClassInfo, Profile, SubmissionStatus } from '@openedu/contracts';
import { useAssignments, useAttendance, useParentQueue, useParentThreads, useSubmissions } from '@openedu/data';
import { useClasses } from './focusGrade';

export interface ClassWork {
  classId: string;
  className: string;
  /** Bài viết cần thầy/cô xem: AI đã chấm chờ duyệt, cần xem lại, chờ chấm, lỗi khi chấm. */
  review: number;
  parentUnread: number;
  parentQueue: number;
  /** Hôm nay là ngày học (thứ Hai – thứ Sáu) và lớp chưa điểm danh. */
  attendanceTodo: boolean;
  /** Bài giao hết hạn trong 48 giờ tới. */
  dueSoon: number;
  loading: boolean;
}

export interface TodayWork {
  classes: ClassWork[];
  total: { review: number; parentUnread: number; parentQueue: number; attendanceTodo: number; dueSoon: number };
  loading: boolean;
}

const REVIEW: SubmissionStatus[] = ['needs-review', 'graded', 'submitted', 'error'];
const EMPTY: TodayWork = { classes: [], total: { review: 0, parentUnread: 0, parentQueue: 0, attendanceTodo: 0, dueSoon: 0 }, loading: false };
const Ctx = createContext<TodayWork>(EMPTY);

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const isSchoolDay = (d = new Date()) => d.getDay() >= 1 && d.getDay() <= 5;

function Probe({ cls, report }: { cls: ClassInfo; report: (w: ClassWork) => void }) {
  const day = useMemo(() => todayKey(), []);
  const subs = useSubmissions({ classId: cls.id });
  const threads = useParentThreads(cls.id);
  const queue = useParentQueue(cls.id);
  const att = useAttendance(cls.id, { from: day, to: day });
  const asg = useAssignments({ classId: cls.id });
  const w = useMemo<ClassWork>(() => {
    const now = Date.now();
    return {
      classId: cls.id,
      className: cls.name,
      review: (subs.data ?? []).filter((s) => REVIEW.indexOf(s.status) >= 0).length,
      parentUnread: (threads.data ?? []).reduce((n, t) => n + (t.unread || 0), 0),
      parentQueue: queue.data?.length ?? 0,
      attendanceTodo: isSchoolDay() && !att.isLoading && !att.isError && !(att.data ?? []).some((r) => r.date === day),
      dueSoon: (asg.data ?? []).filter((a) => a.dueAt && new Date(a.dueAt).getTime() > now && new Date(a.dueAt).getTime() - now < 48 * 3_600_000).length,
      loading: subs.isLoading || att.isLoading,
    };
  }, [cls.id, cls.name, subs.data, subs.isLoading, threads.data, queue.data, att.data, att.isLoading, att.isError, asg.data, day]);
  useEffect(() => { report(w); }, [w, report]);
  return null;
}

export function TodayWorkProvider({ user, children }: { user: Profile; children: ReactNode }) {
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  // Quản trị thấy mọi lớp của trường — chỉ dò tối đa 6 lớp đầu (ưu tiên khối đang dạy) cho nhẹ.
  const list = useMemo(() => (classes.data ?? []).slice(0, user.role === 'admin' ? 6 : 12), [classes.data, user.role]);
  const [byId, setById] = useState<Record<string, ClassWork>>({});
  const report = useCallback((w: ClassWork) => {
    setById((m) => {
      const o = m[w.classId];
      if (o && o.review === w.review && o.parentUnread === w.parentUnread && o.parentQueue === w.parentQueue && o.attendanceTodo === w.attendanceTodo && o.dueSoon === w.dueSoon && o.loading === w.loading && o.className === w.className) return m;
      return { ...m, [w.classId]: w };
    });
  }, []);
  const value = useMemo<TodayWork>(() => {
    const rows = list.map((c) => byId[c.id]).filter((x): x is ClassWork => !!x);
    const total = rows.reduce((t, r) => ({
      review: t.review + r.review,
      parentUnread: t.parentUnread + r.parentUnread,
      parentQueue: t.parentQueue + r.parentQueue,
      attendanceTodo: t.attendanceTodo + (r.attendanceTodo ? 1 : 0),
      dueSoon: t.dueSoon + r.dueSoon,
    }), { ...EMPTY.total });
    return { classes: rows, total, loading: classes.isLoading || rows.length < list.length || rows.some((r) => r.loading) };
  }, [list, byId, classes.isLoading]);
  return (
    <Ctx.Provider value={value}>
      {list.map((c) => <Probe key={c.id} cls={c} report={report} />)}
      {children}
    </Ctx.Provider>
  );
}

export function useTodayWork(): TodayWork {
  return useContext(Ctx);
}

/** Số hiện cạnh mục trên thanh bên. */
export function navBadge(w: TodayWork, key?: 'review' | 'parents' | 'attendance'): number {
  if (key === 'review') return w.total.review;
  if (key === 'parents') return w.total.parentUnread + w.total.parentQueue;
  if (key === 'attendance') return w.total.attendanceTodo;
  return 0;
}
