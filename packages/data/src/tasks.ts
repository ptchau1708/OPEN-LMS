/** Dựng danh sách nhiệm vụ "Hôm nay" (thuần — dùng cho demo và Supabase). */
import type { Assignment, ContentPackage, Lesson, LessonProgress, Profile, RemediationSet, SubjectId, Task } from '@openedu/contracts';

/** Số lượt Leo tháp mỗi ngày. */
export const ARENA_DAILY_PLAYS = 5;
export const ARENA_TASK_ID = 'arena-leo-thap';
/** targetId của nhiệm vụ Đấu trường "Leo tháp". */
export const ARENA_TARGET_ID = 'leo-thap';

export interface TodayTaskInput {
  user: Profile;
  assignments: Assignment[];
  lessons: Record<string, Lesson | undefined>;
  packages?: Record<string, ContentPackage | undefined>;
  progress: Record<string, LessonProgress | undefined>;
  /** Bài đã mở ít nhất một lần (có sự kiện started/viewed). */
  openedLessonIds: Set<string>;
  /** Số lượt Leo tháp đã chơi hôm nay. */
  arenaPlaysToday: number;
  /** Bộ ôn tập (planRemediation). Chỉ bộ đến hạn được đưa vào, tối đa MAX_REMEDIATION_TASKS. */
  remediation?: RemediationSet[];
  now?: Date;
}

/** Số nhiệm vụ ôn tập tối đa trên trang Hôm nay. */
export const MAX_REMEDIATION_TASKS = 3;

/** Bộ ôn tập → nhiệm vụ "practice" (targetId = id bộ ôn tập, mở bằng getRemediationSets). */
export function remediationTask(set: RemediationSet): Task {
  return {
    id: `task-${set.id}`,
    kind: 'practice',
    title: set.title,
    subject: set.subject,
    subtitle: `Ôn ${set.itemIds.length} câu · ${set.minutes} phút`,
    progress: 0,
    isNew: true,
    targetId: set.id,
    dueAt: set.dueAt,
  };
}

/** Bài giao cho HS: cả lớp (studentIds rỗng) hoặc giao riêng. */
export function assignmentAppliesTo(a: Assignment, user: Profile): boolean {
  if (a.studentIds.length > 0) return a.studentIds.includes(user.id);
  return !!user.classId && a.classId === user.classId;
}

export function lessonProgressRatio(lesson: Lesson | undefined, p: LessonProgress | undefined): number {
  if (!p) return 0;
  if (p.completedAt) return 1;
  const total = lesson?.slides.length ?? 0;
  if (!total) return 0;
  const ids = new Set(lesson?.slides.map((s) => s.id));
  const done = p.completedSlides.filter((id) => ids.has(id)).length;
  return Math.max(0, Math.min(1, done / total));
}

export function buildTodayTasks(input: TodayTaskInput): Task[] {
  const now = input.now ?? new Date();
  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const a of input.assignments) {
    if (!assignmentAppliesTo(a, input.user)) continue;
    if (a.openAt && new Date(a.openAt).getTime() > now.getTime()) continue;
    const key = `${a.targetType}:${a.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (a.targetType === 'lesson') {
      const lesson = input.lessons[a.targetId];
      if (!lesson) continue;
      const p = input.progress[a.targetId];
      const n = lesson.slides.length;
      tasks.push({
        id: `task-${a.id}`,
        kind: 'lesson',
        title: a.title || lesson.title,
        subject: lesson.subject,
        subtitle: `Bài giảng ${n} trang${lesson.minutes ? ` · khoảng ${lesson.minutes} phút` : ''}`,
        progress: lessonProgressRatio(lesson, p),
        isNew: !p && !input.openedLessonIds.has(a.targetId),
        targetId: a.targetId,
        dueAt: a.dueAt,
      });
    } else if (a.targetType === 'package') {
      const pkg = input.packages?.[a.targetId];
      tasks.push({
        id: `task-${a.id}`,
        kind: 'package',
        title: a.title || pkg?.title || 'Bài học tương tác',
        subject: 'khac' as SubjectId,
        subtitle: 'Bài học tương tác',
        progress: 0,
        isNew: !input.openedLessonIds.has(a.targetId),
        targetId: a.targetId,
        dueAt: a.dueAt,
      });
    } else {
      tasks.push({
        id: `task-${a.id}`,
        kind: 'practice',
        title: a.title || 'Luyện tập',
        subject: 'khac' as SubjectId,
        subtitle: 'Luyện tập',
        progress: 0,
        isNew: !input.openedLessonIds.has(a.targetId),
        targetId: a.targetId,
        dueAt: a.dueAt,
      });
    }
  }

  // Chưa xong lên trước; hạn gần lên trước; đã xong xuống cuối.
  tasks.sort((x, y) => {
    const dx = x.progress >= 1 ? 1 : 0;
    const dy = y.progress >= 1 ? 1 : 0;
    if (dx !== dy) return dx - dy;
    const ax = x.dueAt ? new Date(x.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const ay = y.dueAt ? new Date(y.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return ax - ay;
  });

  // Ôn tập đến hạn (ôn lại theo lịch trước — planRemediation đã sắp) chen trước các nhiệm vụ đã xong.
  const nowMs = now.getTime();
  const rem = (input.remediation ?? []).filter((r) => new Date(r.dueAt).getTime() <= nowMs).slice(0, MAX_REMEDIATION_TASKS).map(remediationTask);
  if (rem.length) {
    const firstDone = tasks.findIndex((t) => t.progress >= 1);
    tasks.splice(firstDone < 0 ? tasks.length : firstDone, 0, ...rem);
  }

  if (input.user.role === 'student') {
    const left = Math.max(0, ARENA_DAILY_PLAYS - input.arenaPlaysToday);
    tasks.push({
      id: ARENA_TASK_ID,
      kind: 'arena',
      title: 'Leo tháp',
      subject: 'toan',
      subtitle: left > 0 ? `Hôm nay còn ${left} lượt — leo càng cao, càng nhiều sao!` : 'Hết lượt hôm nay, mai leo tiếp nhé!',
      progress: Math.min(1, input.arenaPlaysToday / ARENA_DAILY_PLAYS),
      isNew: false,
      targetId: ARENA_TARGET_ID,
    });
  }
  return tasks;
}
