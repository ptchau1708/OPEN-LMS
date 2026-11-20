/**
 * Báo cáo đề (thuần): phổ điểm, độ khó từng câu (p), kết quả theo ô ma trận, danh sách HS + ghi chú trung tính; CSV;
 * trạng thái đề trên trang Hôm nay của HS.
 */
import {
  EXAM_LEVEL_LABEL,
  EXAM_LEVELS,
  type Exam,
  type ExamAttempt,
  type ExamReport,
  type ExamReportCell,
  type ExamReportQuestion,
  type ExamReportStudent,
  type ExamStudentCard,
  type Profile,
} from '@openedu/contracts';
import { toCsv, type Cell } from '../school/csv';
import { summarizeIntegrity } from './integrity';
import { levelFromScore10 } from './scoring';

/** Lần làm mới nhất của mỗi HS. */
export function latestAttempts(attempts: ExamAttempt[]): Map<string, ExamAttempt> {
  const m = new Map<string, ExamAttempt>();
  for (const a of attempts) {
    const cur = m.get(a.studentId);
    if (!cur || a.attemptNo > cur.attemptNo) m.set(a.studentId, a);
  }
  return m;
}

export function examAppliesTo(exam: Pick<Exam, 'studentIds'>, studentId: string): boolean {
  return !exam.studentIds?.length || exam.studentIds.includes(studentId);
}

export function buildExamReport(exam: Exam, students: Profile[], attempts: ExamAttempt[], now: Date = new Date()): ExamReport {
  const roster = students.filter((s) => s.role === 'student' && examAppliesTo(exam, s.id));
  const latest = latestAttempts(attempts.filter((a) => a.examId === exam.id));
  const rows: ExamReportStudent[] = roster.map((student) => {
    const attempt = latest.get(student.id) ?? null;
    const done = attempt?.status === 'submitted';
    const ratio = attempt?.results?.length ? attempt.results.filter((r) => r.correct).length / attempt.results.length : undefined;
    return {
      student,
      attempt,
      ...(done && attempt?.score10 ? { level: levelFromScore10(attempt.score10) } : {}),
      integrity: attempt
        ? summarizeIntegrity({ events: attempt.integrity, answers: attempt.answers, startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, durationMin: exam.durationMin, correctRatio: ratio })
        : null,
      overdue: !!attempt && attempt.status === 'in-progress' && Date.parse(attempt.deadlineAt) < now.getTime(),
    };
  });
  const submittedRows = rows.filter((r) => r.attempt?.status === 'submitted');
  const distribution = Array.from({ length: 11 }, () => 0);
  for (const r of submittedRows) if (r.attempt?.score10) distribution[r.attempt.score10]++;
  const mean = submittedRows.length ? Math.round((submittedRows.reduce((a, r) => a + (r.attempt?.score10 ?? 0), 0) / submittedRows.length) * 10) / 10 : null;

  // Độ khó từng câu: theo đề A/B (cùng slot có thể khác câu).
  const stat = new Map<string, { n: number; sum: number }>();
  for (const r of submittedRows) {
    for (const res of r.attempt?.results ?? []) {
      const k = `${r.attempt?.variant}|${res.slotId}|${res.itemId}`;
      const s = stat.get(k) ?? { n: 0, sum: 0 };
      s.n++;
      s.sum += res.score;
      stat.set(k, s);
    }
  }
  const variants = exam.onlineVariants === 'AB' ? (['A', 'B'] as const) : (['A'] as const);
  const questions: ExamReportQuestion[] = [];
  for (const v of variants) {
    for (const slot of exam.paper[v]) {
      if (!slot.itemId) continue;
      const s = stat.get(`${v}|${slot.id}|${slot.itemId}`);
      questions.push({ slotId: slot.id, no: slot.no, variant: v, itemId: slot.itemId, rowId: slot.rowId, level: slot.level, qtype: slot.qtype, n: s?.n ?? 0, p: s?.n ? Math.round((s.sum / s.n) * 100) / 100 : null });
    }
  }
  const cells: ExamReportCell[] = [];
  for (const row of exam.rows) {
    for (const level of EXAM_LEVELS) {
      const qs = questions.filter((q) => q.rowId === row.id && q.level === level);
      if (!qs.length) continue;
      const n = qs.reduce((a, q) => a + q.n, 0);
      const sum = qs.reduce((a, q) => a + (q.p ?? 0) * q.n, 0);
      cells.push({ rowId: row.id, rowLabel: row.label, level, n, p: n ? Math.round((sum / n) * 100) / 100 : null });
    }
  }
  return {
    exam,
    students: rows,
    submitted: submittedRows.length,
    inProgress: rows.filter((r) => r.attempt?.status === 'in-progress').length,
    notStarted: rows.filter((r) => !r.attempt).length,
    distribution,
    mean,
    questions,
    cells,
  };
}

/** Bảng CSV kết quả: STT, mã HS, họ tên, đề, điểm, điểm thang 10, gợi ý mức, đúng/tổng, trạng thái, ghi chú. */
export function examReportRows(r: ExamReport): Cell[][] {
  const head: Cell[] = ['STT', 'Mã HS', 'Họ và tên', 'Đề', 'Điểm', 'Điểm KTĐK (thang 10)', 'Gợi ý mức', 'Số câu đúng', 'Trạng thái', 'Ghi chú (không trừ điểm)'];
  const body = r.students.map((s, i): Cell[] => {
    const a = s.attempt;
    const st = !a ? 'Chưa làm' : a.status === 'submitted' ? (a.autoSubmitted ? 'Hết giờ, tự nộp' : 'Đã nộp') : s.overdue ? 'Quá giờ, chưa nộp' : 'Đang làm';
    const correct = a?.results ? `${a.results.filter((x) => x.correct).length}/${a.results.length}` : '';
    return [i + 1, s.student.username ?? s.student.id, s.student.name, a?.variant ?? '', a?.status === 'submitted' ? a.score : '', a?.score10 ?? '', s.level ?? '', correct, st, (s.integrity?.lines ?? []).join('; ')];
  });
  return [head, ...body];
}

export function examReportCsv(r: ExamReport): string {
  return toCsv(examReportRows(r));
}

/** Nhãn ô: "Phân số · Mức 3". */
export function cellLabel(c: Pick<ExamReportCell, 'rowLabel' | 'level'>): string {
  return `${c.rowLabel} · ${EXAM_LEVEL_LABEL[c.level]}`;
}

/** Trạng thái đề cho thẻ trên trang Hôm nay. */
export function studentCard(exam: Exam, attempts: ExamAttempt[], studentId: string, now: Date = new Date()): ExamStudentCard {
  const mine = attempts.filter((a) => a.examId === exam.id && a.studentId === studentId);
  const last = latestAttempts(mine).get(studentId);
  const t = now.getTime();
  const open = Date.parse(exam.openAt) <= t && t < Date.parse(exam.closeAt);
  let state: ExamStudentCard['state'];
  if (last?.status === 'in-progress' && Date.parse(last.deadlineAt) > t) state = 'in-progress';
  else if (last && (last.status === 'submitted' || Date.parse(last.deadlineAt) <= t)) state = 'submitted';
  else state = t < Date.parse(exam.openAt) ? 'upcoming' : open ? 'open' : 'closed';
  const canRetake = !!last && last.status === 'submitted' && !!last.retakeAllowed && open;
  return {
    examId: exam.id,
    title: exam.title,
    subject: exam.subject,
    durationMin: exam.durationMin,
    openAt: exam.openAt,
    closeAt: exam.closeAt,
    questions: exam.paper.A.filter((s) => s.itemId).length,
    state: canRetake ? 'open' : state,
    resultReady: state === 'submitted' && !canRetake && (exam.resultsPolicy === 'immediate' || !!exam.releasedAt),
    canRetake,
  };
}

/** Hạn nộp của một lần làm: min(bắt đầu + thời gian, giờ đóng đề). */
export function attemptDeadline(startedAt: Date, durationMin: number, closeAt: string): string {
  return new Date(Math.min(startedAt.getTime() + durationMin * 60_000, Date.parse(closeAt))).toISOString();
}
