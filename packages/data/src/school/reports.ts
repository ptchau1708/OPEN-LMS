/** Báo cáo trường: tổng hợp theo lớp, theo khối × môn, bản đồ kĩ năng cả khối (thuần, có kiểm thử). */
import {
  SKILL_BY_CODE,
  MASTERY_LEVELS,
  type AttendanceRecord,
  type ClassHeatmap,
  type ClassInfo,
  type ClassReportRow,
  type Grade,
  type GradeHeatmap,
  type GradeHeatmapCell,
  type LearningEvent,
  type MasteryByGradeSubject,
  type MasteryLevel,
  type SchoolOverview,
  type SkillMastery,
  type SubjectId,
  type Tt27Evaluation,
} from '@openedu/contracts';

/** Kĩ năng tính vào "thành thạo trung bình" khi đã làm ≥ 3 lần (giống ngưỡng xếp mức). */
export const REPORT_MIN_ATTEMPTS = 3;

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export interface ClassReportInput {
  cls: ClassInfo;
  teacherName?: string;
  /** Sự kiện của HS lớp trong khoảng báo cáo. */
  events: LearningEvent[];
  masteries: Record<string, SkillMastery[]>;
  /** Điểm danh 30 ngày. */
  attendance: AttendanceRecord[];
  /** TT27 của kì đang xét. */
  tt27: Tt27Evaluation[];
  worksApproved: number;
}

export function attendanceCounts(records: AttendanceRecord[], studentIds?: Set<string>): { present: number; total: number } {
  let present = 0;
  let total = 0;
  for (const r of records)
    for (const [sid, st] of Object.entries(r.entries)) {
      if (studentIds && !studentIds.has(sid)) continue;
      total++;
      if (st === 'co-mat' || st === 'muon') present++;
    }
  return { present, total };
}

export function buildClassReportRow(i: ClassReportInput): ClassReportRow {
  const ids = new Set(i.cls.studentIds);
  const ev = i.events.filter((e) => ids.has(e.userId));
  const active = new Set(ev.map((e) => e.userId));
  const answered = ev.filter((e) => e.verb === 'answered' && e.objectType === 'item' && typeof e.result?.correct === 'boolean');
  const correct = answered.filter((e) => e.result?.correct).length;
  let pSum = 0;
  let pN = 0;
  let gaps = 0;
  for (const sid of ids) {
    const list = i.masteries[sid] ?? [];
    let gap = false;
    for (const m of list) {
      if (m.attempts >= REPORT_MIN_ATTEMPTS) { pSum += m.p; pN++; }
      if (m.level === 'can-on') gap = true;
    }
    if (gap) gaps++;
  }
  const att = attendanceCounts(i.attendance.filter((r) => r.classId === i.cls.id), ids);
  return {
    classId: i.cls.id,
    name: i.cls.name,
    grade: i.cls.grade,
    teacherId: i.cls.teacherId || undefined,
    teacherName: i.teacherName,
    students: ids.size,
    activeStudents: active.size,
    lessonsCompleted: ev.filter((e) => e.verb === 'completed' && e.objectType === 'lesson').length,
    answered: answered.length,
    correctRate: ratio(correct, answered.length),
    avgMastery: ratio(pSum, pN),
    studentsWithGaps: gaps,
    attendanceRate: ratio(att.present, att.total),
    tt27Final: i.tt27.filter((e) => ids.has(e.studentId) && e.status === 'final').length,
    worksApproved: i.worksApproved,
  };
}

/** Khối × môn: trung bình p (kĩ năng ≥ 3 lần) và tỉ lệ ô 'vung'. Môn lấy theo danh mục kĩ năng. */
export function masteryByGradeSubject(classes: Pick<ClassInfo, 'grade' | 'studentIds'>[], masteries: Record<string, SkillMastery[]>): MasteryByGradeSubject[] {
  const acc = new Map<string, { grade: Grade; subject: SubjectId; students: Set<string>; pSum: number; pN: number; secure: number; cells: number }>();
  for (const c of classes)
    for (const sid of c.studentIds)
      for (const m of masteries[sid] ?? []) {
        const sk = SKILL_BY_CODE[m.skillCode];
        if (!sk || m.attempts <= 0) continue;
        const key = `${c.grade}|${sk.subject}`;
        let a = acc.get(key);
        if (!a) acc.set(key, (a = { grade: c.grade, subject: sk.subject, students: new Set(), pSum: 0, pN: 0, secure: 0, cells: 0 }));
        a.students.add(sid);
        a.cells++;
        if (m.level === 'vung') a.secure++;
        if (m.attempts >= REPORT_MIN_ATTEMPTS) { a.pSum += m.p; a.pN++; }
      }
  return [...acc.values()]
    .map((a) => ({ grade: a.grade, subject: a.subject, students: a.students.size, avgMastery: ratio(a.pSum, a.pN), secureRate: ratio(a.secure, a.cells) }))
    .sort((x, y) => x.grade - y.grade || x.subject.localeCompare(y.subject));
}

export interface OverviewInput {
  now: Date;
  range: { from: string; to: string };
  schoolYear: string;
  termId: SchoolOverview['termId'];
  rows: ClassReportRow[];
  classes: Pick<ClassInfo, 'grade' | 'studentIds'>[];
  masteries: Record<string, SkillMastery[]>;
  teachers: number;
  ai: SchoolOverview['ai'];
  /** Lượt điểm danh 30 ngày (cả trường). */
  attendance: { present: number; total: number };
}

export function buildSchoolOverview(i: OverviewInput): SchoolOverview {
  const sum = (f: (r: ClassReportRow) => number) => i.rows.reduce((s, r) => s + f(r), 0);
  const students = sum((r) => r.students);
  const answered = sum((r) => r.answered);
  const correct = i.rows.reduce((s, r) => s + (r.correctRate ?? 0) * r.answered, 0);
  return {
    generatedAt: i.now.toISOString(),
    range: i.range,
    schoolYear: i.schoolYear,
    termId: i.termId,
    classes: i.rows.length,
    teachers: i.teachers,
    students,
    activeStudents: sum((r) => r.activeStudents),
    lessonsCompleted: sum((r) => r.lessonsCompleted),
    answered,
    correctRate: answered ? Math.round((correct / answered) * 1000) / 1000 : null,
    attendanceRate: ratio(i.attendance.present, i.attendance.total),
    tt27FinalRate: ratio(sum((r) => r.tt27Final), students),
    ai: i.ai,
    mastery: masteryByGradeSubject(i.classes, i.masteries),
    rows: [...i.rows].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, 'vi')),
  };
}

function emptyCounts(): Record<MasteryLevel, number> {
  return Object.fromEntries(MASTERY_LEVELS.map((l) => [l, 0])) as Record<MasteryLevel, number>;
}

/**
 * Gộp bản đồ nhiệt các lớp cùng khối: mỗi ô lớp × kĩ năng = số HS đã làm, p trung bình, số HS ở từng mức.
 * Chỉ giữ kĩ năng có ít nhất 1 HS đã làm (khối lớn có hàng trăm kĩ năng).
 */
export function aggregateGradeHeatmap(grade: Grade, subject: SubjectId, maps: { classId: string; name: string; heatmap: ClassHeatmap }[]): GradeHeatmap {
  const cells: GradeHeatmap['cells'] = {};
  const total: GradeHeatmap['total'] = {};
  const meta = new Map<string, { code: string; short: string; topic: string; order: number }>();
  maps.forEach(({ classId, heatmap }) => {
    const row: Record<string, GradeHeatmapCell> = {};
    heatmap.skills.forEach((sk, idx) => {
      let n = 0;
      let pSum = 0;
      const counts = emptyCounts();
      for (const st of heatmap.students) {
        const c = heatmap.cells[st.id]?.[sk.code];
        if (!c || c.attempts <= 0) continue;
        n++;
        pSum += c.p;
        counts[c.level]++;
      }
      if (!n) return;
      if (!meta.has(sk.code)) meta.set(sk.code, { code: sk.code, short: sk.short, topic: sk.topic, order: (sk.grade ?? grade) * 1000 + idx });
      row[sk.code] = { n, avgP: pSum / n, counts };
      const t = (total[sk.code] ??= { n: 0, avgP: 0, counts: emptyCounts() });
      t.avgP = (t.avgP * t.n + pSum) / (t.n + n);
      t.n += n;
      for (const l of MASTERY_LEVELS) t.counts[l] += counts[l];
    });
    cells[classId] = row;
  });
  const skills = [...meta.values()].sort((a, b) => a.order - b.order).map(({ code, short, topic }) => ({ code, short, topic }));
  return {
    grade,
    subject,
    classes: maps.map((m) => ({ classId: m.classId, name: m.name, students: m.heatmap.students.length })),
    skills,
    cells,
    total,
  };
}
