/** Bản tin tuần lắp từ DataSource công khai (demo và Supabase dùng chung; Supabase: RLS lọc theo phụ huynh). */
import type { DataSource, ParentDigest, Profile } from '@openedu/contracts';
import { buildParentDigest, digestWeekStart } from './digest';

const safe = <T,>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);

export async function digestFromDataSource(ds: DataSource, childId: string, weekStart: string | undefined, now: Date, child?: Profile): Promise<ParentDigest> {
  const start = digestWeekStart(weekStart, now);
  const to = new Date(Date.parse(start) + 7 * 86_400_000).toISOString();
  const prof = await safe(ds.getStudentProfile(childId), null);
  const kid = child ?? prof?.student;
  if (!kid) throw new Error('Chưa tải được thông tin của con. Bố mẹ thử lại sau nhé.');
  const classId = kid.classId;
  const [events, rewards, works, attendance, behaviorLogs, behaviors, tt27, summary] = await Promise.all([
    safe(ds.listEvents({ userId: childId, limit: 3000 }), []),
    safe(ds.listRewards(childId, 1000), []),
    safe(ds.getStudentWork(childId), []),
    classId ? safe(ds.listAttendance(classId, { from: start.slice(0, 10), to: to.slice(0, 10) }), []) : Promise.resolve([]),
    safe(ds.listBehaviorLogs({ studentId: childId, from: start, to, limit: 500 }), []),
    classId ? safe(ds.listBehaviors(classId), []) : Promise.resolve([]),
    safe(ds.listTt27({ studentId: childId }), []),
    safe(ds.getParentSummary(childId), null),
  ]);
  return buildParentDigest({
    now,
    child: kid,
    className: prof?.class?.name,
    teacherName: prof?.class?.teacherName,
    weekStart: start,
    events,
    rewards,
    works,
    attendance,
    behaviorLogs,
    behaviors,
    tt27,
    summary,
  });
}
