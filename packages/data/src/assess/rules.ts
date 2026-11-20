/**
 * Luật chấm bài làm (THUẦN — chép sang supabase/functions/_shared/assess bằng tools/sync-scoring.mjs):
 * mức TT27 từ điểm, trạng thái sau chấm, ghép bản GV sửa, sự kiện học tập + sao khi duyệt.
 */
import {
  GRADE_REVIEW_CONFIDENCE,
  type AiGrade,
  type GradeFinal,
  type GradeReview,
  type LearningEvent,
  type Rubric,
  type SubmissionStatus,
  type Tt27Level,
} from '@openedu/contracts';

/** Tỉ lệ điểm ≥ 0.8 → T (Hoàn thành tốt); ≥ 0.5 → H (Hoàn thành); còn lại C. */
export const LEVEL_T_RATIO = 0.8;
export const LEVEL_H_RATIO = 0.5;
/** Bài làm viết được bộ máy thành thạo tính như 2 câu hỏi. */
export const WORK_EVENT_WEIGHT = 2;
/** Sao khi GV duyệt: T 3 · H 2 · C 1 (khen nỗ lực). */
export const WORK_STARS: Record<Tt27Level, number> = { T: 3, H: 2, C: 1 };

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Điểm kiểu Việt Nam: 6.5 → "6,5". */
export function fmtScore(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function levelFor(total: number, max: number): Tt27Level {
  if (!(max > 0)) return 'C';
  const r = total / max;
  if (r >= LEVEL_T_RATIO - 1e-9) return 'T';
  if (r >= LEVEL_H_RATIO - 1e-9) return 'H';
  return 'C';
}

/** Tổng điểm tối đa của các tiêu chí. */
export function criteriaMax(rubric: Pick<Rubric, 'criteria'>): number {
  return rubric.criteria.reduce((a, c) => a + Math.max(0, c.points || 0), 0);
}

/**
 * Tổng điểm theo thang rubric (maxScore) từ điểm từng tiêu chí; tổng tiêu chí khác maxScore thì quy đổi theo tỉ lệ.
 * Làm tròn 0,5 điểm gần nhất cho thang 10 (thói quen chấm tiểu học), 0,1 với thang khác.
 */
export function totalFromCriteria(points: number[], rubric: Pick<Rubric, 'criteria' | 'maxScore'>): { total: number; max: number } {
  const max = rubric.maxScore > 0 ? rubric.maxScore : 10;
  const cm = criteriaMax(rubric) || max;
  const raw = points.reduce((a, p) => a + (Number.isFinite(p) ? p : 0), 0);
  const scaled = clamp((raw / cm) * max, 0, max);
  const total = max === 10 ? Math.round(scaled * 2) / 2 : round1(scaled);
  return { total, max };
}

/** Cần GV xem kĩ khi độ tin cậy thấp hoặc có cờ. */
export function needsReview(g: Pick<AiGrade, 'confidence' | 'flags'>): boolean {
  return g.confidence < GRADE_REVIEW_CONFIDENCE || g.flags.length > 0;
}

export function statusAfterGrade(g: Pick<AiGrade, 'confidence' | 'flags'>): SubmissionStatus {
  return needsReview(g) ? 'needs-review' : 'graded';
}

/** Bản chốt = bản AI, ghi đè phần GV sửa; tổng/mức tính lại khi GV sửa điểm tiêu chí mà không sửa tổng. */
export function mergeFinal(grade: AiGrade, review: Pick<GradeReview, 'final' | 'decision'> | undefined, rubric?: Pick<Rubric, 'criteria' | 'maxScore'>): GradeFinal {
  const base: GradeFinal = {
    total: grade.total,
    max: grade.max,
    level: grade.level,
    criteria: grade.criteria.map((c) => ({ criterionId: c.criterionId, points: c.points, comment: c.comment })),
    feedbackStudent: grade.feedbackStudent,
    feedbackParent: grade.feedbackParent,
    feedbackTeacher: grade.feedbackTeacher,
  };
  const f = review?.final;
  if (!f) return base;
  const criteria = base.criteria.map((c) => {
    const e = f.criteria?.find((x) => x.criterionId === c.criterionId);
    if (!e) return c;
    const max = grade.criteria.find((x) => x.criterionId === c.criterionId)?.max ?? Infinity;
    return { criterionId: c.criterionId, points: clamp(Number(e.points) || 0, 0, max), comment: e.comment ?? c.comment };
  });
  const max = f.max && f.max > 0 ? f.max : base.max;
  let total = typeof f.total === 'number' && Number.isFinite(f.total) ? clamp(f.total, 0, max) : base.total;
  if (f.criteria && typeof f.total !== 'number') {
    total = rubric ? totalFromCriteria(criteria.map((c) => c.points), rubric).total : round1(criteria.reduce((a, c) => a + c.points, 0));
  }
  const level = f.level ?? (typeof f.total === 'number' || f.criteria ? levelFor(total, max) : base.level);
  return {
    total,
    max,
    level,
    criteria,
    feedbackStudent: f.feedbackStudent?.trim() || base.feedbackStudent,
    feedbackParent: f.feedbackParent?.trim() || base.feedbackParent,
    feedbackTeacher: f.feedbackTeacher?.trim() || base.feedbackTeacher,
  };
}

export interface ApprovalInput {
  submissionId: string;
  studentId: string;
  taskId: string;
  taskTitle: string;
  rubric: Pick<Rubric, 'skills'>;
  grade: Pick<AiGrade, 'skills' | 'issues'>;
  final: Pick<GradeFinal, 'total' | 'max' | 'level'>;
}

export type WorkEvent = Omit<LearningEvent, 'id' | 'at'>;

/**
 * Sự kiện học tập khi GV duyệt bài: một sự kiện cho các kĩ năng thể hiện "đúng" (correct, score = tỉ lệ điểm),
 * một sự kiện cho kĩ năng "sai" (chưa đúng, score ≤ 0.5, kèm quan niệm sai từ issues). 'chua-ro' bỏ qua.
 * AI không nêu kĩ năng nào → dùng rubric.skills với đúng/chưa đúng theo mức (C = chưa đúng).
 * Mỗi sự kiện weight = 2 (bộ máy thành thạo tính như 2 câu).
 */
export function approvalEvents(a: ApprovalInput): WorkEvent[] {
  const ratio = a.final.max > 0 ? clamp(a.final.total / a.final.max, 0, 1) : 0;
  const score = Math.round(ratio * 100) / 100;
  let ok = a.grade.skills.filter((s) => s.evidence === 'dung').map((s) => s.code);
  let bad = a.grade.skills.filter((s) => s.evidence === 'sai').map((s) => s.code);
  if (!ok.length && !bad.length) {
    if (a.final.level === 'C') bad = [...a.rubric.skills];
    else ok = [...a.rubric.skills];
  }
  ok = [...new Set(ok)];
  bad = [...new Set(bad)].filter((c) => !ok.includes(c));
  const response = { taskId: a.taskId, title: a.taskTitle, level: a.final.level, total: a.final.total, max: a.final.max };
  const out: WorkEvent[] = [];
  if (ok.length) {
    out.push({ userId: a.studentId, verb: 'answered', objectType: 'work', objectId: `work:${a.submissionId}`, result: { correct: true, score, skills: ok, misconceptions: [], weight: WORK_EVENT_WEIGHT, response } });
  }
  if (bad.length) {
    const mis = [...new Set(a.grade.issues.filter((i) => i.misconception && (!i.skill || bad.includes(i.skill))).map((i) => i.misconception as string))];
    out.push({
      userId: a.studentId,
      verb: 'answered',
      objectType: 'work',
      objectId: `work:${a.submissionId}:sai`,
      result: { correct: false, score: Math.min(score, 0.5), skills: bad, misconceptions: mis, weight: WORK_EVENT_WEIGHT, response },
    });
  }
  return out;
}

export function approvalReward(a: Pick<ApprovalInput, 'submissionId' | 'studentId' | 'taskTitle'> & { level: Tt27Level }) {
  const stars = WORK_STARS[a.level];
  return {
    userId: a.studentId,
    stars,
    coins: stars,
    xp: stars * 10,
    reason: `Bài làm được thầy cô duyệt: ${a.taskTitle}`,
    sourceType: 'work' as const,
    sourceId: a.submissionId,
  };
}
