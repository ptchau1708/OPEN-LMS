/**
 * Báo cáo bài giao (docs/BAO_CAO_BAI_GIAO.md) — hàm thuần, chạy được cả demo lẫn Supabase.
 * Nguồn: learning_events 'answered' (máy chủ chấm) có assignment_id = lần giao. Mỗi câu lấy kết quả LẦN CUỐI
 * (điểm bài) và LẦN ĐẦU (đúng ngay lần đầu). "Xong" = đã trả lời đủ mọi câu của bài; "muộn" = xong sau hạn nộp.
 */
import type { Assignment, LearningEvent, Lesson, Profile } from '@openedu/contracts';

/* ------------------------------ đợt báo cáo ------------------------------ */
export type ReportPeriod = 'ngay' | 'tuan' | 'thang' | 'hoc-ki';
export const PERIOD_LABEL: Record<ReportPeriod, string> = { ngay: 'Ngày', tuan: 'Tuần', thang: 'Tháng', 'hoc-ki': 'Học kì' };

const VN = 7 * 3_600_000;
const DAY = 86_400_000;
/** Ngày theo giờ Việt Nam: { y, m (1–12), d, dow (0 = CN) }. */
function vnParts(t: number) {
  const x = new Date(t + VN);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), dow: x.getUTCDay() };
}
/** 0 giờ (giờ VN) của ngày y-m-d → mốc UTC. */
const vnMidnight = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) - VN;
const fmt = (t: number) => { const p = vnParts(t); return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`; };

/**
 * Khoảng thời gian của một đợt chứa ngày `at` (giờ Việt Nam). Tuần: thứ Hai → Chủ nhật.
 * Học kì (theo năm học bắt đầu tháng 9): HK I 01/09 → 15/01, HK II 16/01 → 31/08.
 */
export function periodRange(kind: ReportPeriod, at: Date): { from: string; to: string; label: string } {
  const p = vnParts(at.getTime());
  let from: number; let to: number; let label: string;
  if (kind === 'ngay') {
    from = vnMidnight(p.y, p.m, p.d); to = from + DAY;
    label = `Ngày ${fmt(from)}`;
  } else if (kind === 'tuan') {
    const back = (p.dow + 6) % 7;
    from = vnMidnight(p.y, p.m, p.d) - back * DAY; to = from + 7 * DAY;
    label = `Tuần ${fmt(from)} – ${fmt(to - DAY)}`;
  } else if (kind === 'thang') {
    from = vnMidnight(p.y, p.m, 1); to = p.m === 12 ? vnMidnight(p.y + 1, 1, 1) : vnMidnight(p.y, p.m + 1, 1);
    label = `Tháng ${p.m}/${p.y}`;
  } else {
    const sy = p.m >= 9 ? p.y : p.y - 1; // năm học sy–sy+1
    const hk1From = vnMidnight(sy, 9, 1); const hk2From = vnMidnight(sy + 1, 1, 16); const end = vnMidnight(sy + 1, 9, 1);
    const t = at.getTime();
    if (t < hk2From) { from = hk1From; to = hk2From; label = `Học kì I năm học ${sy}–${sy + 1}`; }
    else { from = hk2From; to = end; label = `Học kì II năm học ${sy}–${sy + 1}`; }
  }
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), label };
}

/** Lần giao thuộc đợt: ngày mở nằm trong đợt. */
export function inPeriod(a: Pick<Assignment, 'openAt'>, range: { from: string; to: string }): boolean {
  const t = Date.parse(a.openAt);
  return t >= Date.parse(range.from) && t < Date.parse(range.to);
}

/* ------------------------------ báo cáo một lần giao ------------------------------ */
export type StudentStatus = 'chua-lam' | 'dang-lam' | 'hoan-thanh';
export interface StudentResult {
  studentId: string;
  name: string;
  status: StudentStatus;
  /** Số câu đã trả lời / tổng số câu của bài. */
  answered: number;
  total: number;
  /** Điểm theo lần trả lời cuối của từng câu (câu nhiều ý tính điểm từng phần). */
  points: number;
  /** 0–100, làm tròn; null khi chưa trả lời câu nào. */
  percent: number | null;
  /** Số câu đúng ngay lần đầu. */
  firstTry: number;
  startedAt?: string;
  finishedAt?: string;
  /** Xong sau hạn nộp. */
  late: boolean;
  /** Quá hạn mà chưa xong. */
  overdue: boolean;
  /** Phút từ câu đầu tới câu cuối (ước lượng thời gian làm). */
  minutes?: number;
}
export interface QuestionResult { itemId: string; index: number; answered: number; correct: number; percent: number | null }
export interface AssignmentReport {
  assignment: Assignment;
  total: number;
  students: StudentResult[];
  questions: QuestionResult[];
  summary: { assigned: number; started: number; completed: number; late: number; overdue: number; avgPercent: number | null };
}

/** Câu của bài theo thứ tự trang (bài giảng); không có bài thì theo các câu HS đã trả lời. */
export function orderedItemIds(lesson: Lesson | null | undefined, events: LearningEvent[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id?: string) => { if (id && !seen.has(id)) { seen.add(id); ids.push(id); } };
  for (const s of lesson?.slides ?? []) { add(s.itemId); for (const q of s.video?.questions ?? []) add(q.itemId); }
  if (!ids.length) for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) if (e.verb === 'answered' && e.objectType === 'item') add(e.objectId);
  return ids;
}

const scoreOf = (e: LearningEvent) => (typeof e.result?.score === 'number' ? Math.max(0, Math.min(1, e.result.score)) : e.result?.correct ? 1 : 0);

export function buildAssignmentReport(input: {
  assignment: Assignment;
  lesson?: Lesson | null;
  /** HS của lớp (lọc theo assignment.studentIds nếu có). */
  students: Pick<Profile, 'id' | 'name'>[];
  events: LearningEvent[];
  now?: Date;
}): AssignmentReport {
  const { assignment: a } = input;
  const now = (input.now ?? new Date()).getTime();
  const evs = input.events.filter((e) => e.assignmentId === a.id && e.verb === 'answered' && e.objectType === 'item');
  const itemIds = orderedItemIds(input.lesson, evs);
  const total = itemIds.length;
  const inLesson = new Set(itemIds);
  const due = a.dueAt ? Date.parse(a.dueAt) : null;
  const who = a.studentIds.length ? input.students.filter((s) => a.studentIds.includes(s.id)) : input.students;

  const byStudent = new Map<string, LearningEvent[]>();
  for (const e of evs) if (inLesson.has(e.objectId)) (byStudent.get(e.userId) ?? byStudent.set(e.userId, []).get(e.userId)!).push(e);

  const qAgg = new Map<string, { answered: number; correct: number }>();
  const students: StudentResult[] = who.map((s) => {
    const list = (byStudent.get(s.id) ?? []).sort((x, y) => x.at.localeCompare(y.at));
    const first = new Map<string, LearningEvent>();
    const last = new Map<string, LearningEvent>();
    let finishedAt: string | undefined;
    for (const e of list) {
      if (!first.has(e.objectId)) {
        first.set(e.objectId, e);
        if (first.size === total) finishedAt = e.at;
      }
      last.set(e.objectId, e);
    }
    let points = 0;
    let firstTry = 0;
    for (const [id, e] of last) {
      const sc = scoreOf(e);
      points += sc;
      const q = qAgg.get(id) ?? { answered: 0, correct: 0 };
      q.answered++; if (sc >= 1) q.correct++;
      qAgg.set(id, q);
    }
    for (const e of first.values()) if (scoreOf(e) >= 1) firstTry++;
    const answered = first.size;
    const status: StudentStatus = !answered ? 'chua-lam' : total > 0 && answered >= total ? 'hoan-thanh' : 'dang-lam';
    const startedAt = list[0]?.at;
    const endAt = list[list.length - 1]?.at;
    return {
      studentId: s.id, name: s.name, status, answered, total, points: Math.round(points * 100) / 100,
      percent: answered ? Math.round((points / Math.max(1, total)) * 100) : null,
      firstTry,
      ...(startedAt ? { startedAt } : {}),
      ...(finishedAt ? { finishedAt } : {}),
      late: !!finishedAt && due !== null && Date.parse(finishedAt) > due,
      overdue: status !== 'hoan-thanh' && due !== null && now > due,
      ...(startedAt && endAt ? { minutes: Math.max(1, Math.round((Date.parse(endAt) - Date.parse(startedAt)) / 60_000)) } : {}),
    };
  });

  const questions: QuestionResult[] = itemIds.map((itemId, index) => {
    const q = qAgg.get(itemId) ?? { answered: 0, correct: 0 };
    return { itemId, index, answered: q.answered, correct: q.correct, percent: q.answered ? Math.round((q.correct / q.answered) * 100) : null };
  });
  const done = students.filter((s) => s.percent !== null);
  return {
    assignment: a, total, students, questions,
    summary: {
      assigned: students.length,
      started: students.filter((s) => s.status !== 'chua-lam').length,
      completed: students.filter((s) => s.status === 'hoan-thanh').length,
      late: students.filter((s) => s.late).length,
      overdue: students.filter((s) => s.overdue).length,
      avgPercent: done.length ? Math.round(done.reduce((t, s) => t + (s.percent ?? 0), 0) / done.length) : null,
    },
  };
}

/** Các lượt của cùng một chuỗi giao (lần đầu + các lần giao lại), theo thứ tự lượt. */
export function roundsOf(a: Assignment, all: Assignment[]): Assignment[] {
  const root = a.parentId ?? a.id;
  return all.filter((x) => x.id === root || x.parentId === root).sort((x, y) => (x.round ?? 1) - (y.round ?? 1) || x.openAt.localeCompare(y.openAt));
}

/** Em cần giao lại: chưa xong, hoặc điểm dưới ngưỡng (mặc định 80%). */
export function needsRetry(r: AssignmentReport, threshold = 80): string[] {
  return r.students.filter((s) => s.status !== 'hoan-thanh' || (s.percent ?? 0) < threshold).map((s) => s.studentId);
}

