/**
 * Phase 4: hàng Postgres ↔ kiểu hợp đồng cho rubrics, work_tasks, submissions, ai_grades, grade_reviews,
 * tt27_evaluations, behaviors, behavior_logs, attendance (migration 20261111000002_v2_assess.sql). CHƯA KIỂM THỬ với Supabase thật.
 */
import type {
  AiGrade,
  AttendanceRecord,
  AttendanceStatus,
  Behavior,
  BehaviorLog,
  GradeFinal,
  GradeReview,
  Rubric,
  Submission,
  Tt27Evaluation,
  WorkTask,
} from '@openedu/contracts';
import { pick, type Row } from './mapping';

const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);
/** Embed 1–1 của PostgREST có thể là object hoặc mảng một phần tử. */
export function one(v: unknown): Row | null {
  return Array.isArray(v) ? obj(v[0]) : obj(v);
}

export function fromRubric(r: Row): Rubric {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    subject: String(r.subject ?? 'khac') as Rubric['subject'],
    grade: Number(r.grade) as Rubric['grade'],
    maxScore: Number(pick(r, 'maxScore')) || 10,
    criteria: arr(r.criteria) as Rubric['criteria'],
    ...(pick<string>(r, 'modelAnswer') ? { modelAnswer: pick<string>(r, 'modelAnswer') } : {}),
    skills: arr<string>(r.skills),
    ...(pick<string>(r, 'aiNotes') ? { aiNotes: pick<string>(r, 'aiNotes') } : {}),
    ...(pick<string>(r, 'ownerId') ? { ownerId: pick<string>(r, 'ownerId') } : {}),
    ...(pick<string>(r, 'updatedAt') ? { updatedAt: pick<string>(r, 'updatedAt') } : {}),
  };
}

export function toRubricRow(r: Rubric): Row {
  return {
    ...(r.id ? { id: r.id } : {}),
    title: r.title,
    subject: r.subject,
    grade: r.grade,
    max_score: r.maxScore > 0 ? r.maxScore : 10,
    criteria: r.criteria,
    model_answer: r.modelAnswer ?? null,
    skills: r.skills ?? [],
    ai_notes: r.aiNotes ?? null,
    ...(r.ownerId ? { owner_id: r.ownerId } : {}),
    updated_at: new Date().toISOString(),
  };
}

export function fromWorkTask(r: Row): WorkTask {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    prompt: (obj(r.prompt) ?? { text: '' }) as WorkTask['prompt'],
    subject: String(r.subject ?? 'khac') as WorkTask['subject'],
    grade: Number(r.grade) as WorkTask['grade'],
    rubricId: String(pick(r, 'rubricId') ?? ''),
    classId: String(pick(r, 'classId') ?? ''),
    studentIds: arr<string>(pick(r, 'studentIds')),
    ...(pick<string>(r, 'dueAt') ? { dueAt: pick<string>(r, 'dueAt') } : {}),
    allowPhoto: pick(r, 'allowPhoto') !== false,
    allowText: pick(r, 'allowText') !== false,
    createdBy: String(pick(r, 'createdBy') ?? ''),
    ...(pick<string>(r, 'createdAt') ? { createdAt: pick<string>(r, 'createdAt') } : {}),
  };
}

export function toWorkTaskRow(t: WorkTask): Row {
  return {
    ...(t.id ? { id: t.id } : {}),
    title: t.title,
    prompt: t.prompt,
    subject: t.subject,
    grade: t.grade,
    rubric_id: t.rubricId,
    class_id: t.classId,
    student_ids: t.studentIds ?? [],
    due_at: t.dueAt ?? null,
    allow_photo: t.allowPhoto,
    allow_text: t.allowText,
    ...(t.createdBy ? { created_by: t.createdBy } : {}),
  };
}

/** images trong DB: [{ path, width, height }]; `urls` = URL có ký theo path. */
export function fromSubmission(r: Row, urls: Record<string, string> = {}): Submission {
  return {
    id: String(r.id),
    taskId: String(pick(r, 'taskId')),
    studentId: String(pick(r, 'studentId')),
    ...(pick<string>(r, 'classId') ? { classId: pick<string>(r, 'classId') } : {}),
    kind: (r.kind as Submission['kind']) ?? 'text',
    ...(typeof r.text === 'string' && r.text ? { text: r.text } : {}),
    images: arr<Row>(r.images).map((i) => {
      const path = String(i.path ?? '');
      return { url: urls[path] ?? String(i.url ?? ''), width: Number(i.width) || 0, height: Number(i.height) || 0, ...(path ? { path } : {}) };
    }),
    submittedBy: pick(r, 'submittedBy') === 'teacher' ? 'teacher' : 'student',
    ...(pick<string>(r, 'submitterId') ? { submitterId: pick<string>(r, 'submitterId') } : {}),
    status: (r.status as Submission['status']) ?? 'submitted',
    ...(r.error ? { error: String(r.error) } : {}),
    createdAt: String(pick(r, 'createdAt') ?? ''),
    ...(pick<string>(r, 'updatedAt') ? { updatedAt: pick<string>(r, 'updatedAt') } : {}),
  };
}

export function imagePaths(r: Row): string[] {
  return arr<Row>(r.images)
    .map((i) => String(i.path ?? ''))
    .filter(Boolean);
}

export function fromAiGradeRow(r: Row | null): AiGrade | undefined {
  if (!r) return undefined;
  const d = obj(r.data);
  return d ? (d as unknown as AiGrade) : undefined;
}

export function fromReview(r: Row | null, submissionId: string): GradeReview | undefined {
  if (!r) return undefined;
  const final = obj(r.final);
  return {
    submissionId,
    teacherId: String(pick(r, 'teacherId') ?? ''),
    decision: r.decision as GradeReview['decision'],
    ...(final ? { final: final as Partial<GradeFinal> } : {}),
    ...(r.note ? { note: String(r.note) } : {}),
    at: String(r.at ?? ''),
  };
}

export function fromTt27(r: Row): Tt27Evaluation {
  const d = obj(r.data) ?? {};
  return {
    studentId: String(pick(r, 'studentId')),
    classId: String(pick(r, 'classId')),
    termId: String(pick(r, 'termId')) as Tt27Evaluation['termId'],
    schoolYear: String(pick(r, 'schoolYear') ?? ''),
    subjects: (obj(d.subjects) ?? {}) as Tt27Evaluation['subjects'],
    qualities: (obj(d.qualities) ?? {}) as Tt27Evaluation['qualities'],
    competencies: (obj(d.competencies) ?? {}) as Tt27Evaluation['competencies'],
    generalComment: String(d.generalComment ?? ''),
    status: r.status === 'final' ? 'final' : 'draft',
    ...(pick<string>(r, 'updatedBy') ? { updatedBy: pick<string>(r, 'updatedBy') } : {}),
    ...(pick<string>(r, 'updatedAt') ? { updatedAt: pick<string>(r, 'updatedAt') } : {}),
  };
}

export function toTt27Row(e: Tt27Evaluation): Row {
  return {
    student_id: e.studentId,
    class_id: e.classId,
    term_id: e.termId,
    school_year: e.schoolYear,
    data: { subjects: e.subjects, qualities: e.qualities, competencies: e.competencies, generalComment: e.generalComment },
    status: e.status,
    updated_at: new Date().toISOString(),
  };
}

export function fromBehavior(r: Row): Behavior {
  const points = Number(r.points) || 0;
  return { id: String(r.id), classId: String(pick(r, 'classId')), label: String(r.label ?? ''), points, icon: String(r.icon ?? '⭐'), kind: r.kind === 'needs-work' || points < 0 ? 'needs-work' : 'positive' };
}

export function fromBehaviorLog(r: Row): BehaviorLog {
  return {
    id: String(r.id),
    studentId: String(pick(r, 'studentId')),
    classId: String(pick(r, 'classId')),
    behaviorId: String(pick(r, 'behaviorId')),
    points: Number(r.points) || 0,
    ...(r.note ? { note: String(r.note) } : {}),
    ...(pick<string>(r, 'teamId') ? { teamId: pick<string>(r, 'teamId') } : {}),
    at: String(r.at ?? ''),
    by: String(r.by ?? ''),
  };
}

/** Dòng attendance (một HS / ngày) → bản ghi theo lớp/ngày. */
export function groupAttendance(rows: Row[]): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();
  for (const r of rows) {
    const classId = String(pick(r, 'classId'));
    const date = String(r.date).slice(0, 10);
    const k = `${classId}|${date}`;
    const rec = map.get(k) ?? { classId, date, entries: {} };
    rec.entries[String(pick(r, 'studentId'))] = r.status as AttendanceStatus;
    map.set(k, rec);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}
