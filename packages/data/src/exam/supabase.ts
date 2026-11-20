/**
 * Đề kiểm tra trên Supabase: bảng v2.exam_matrices / v2.exams (GV đọc-ghi qua RLS), bài làm qua RPC exam_* (HS không đọc
 * thẳng bảng), nộp bài + chấm ở Edge Function `grade` (action 'exam-finalize'). Migration 20261115000001_v2_exam.sql.
 */
import type {
  DataSource,
  Exam,
  ExamAnswer,
  ExamAttempt,
  ExamFilter,
  ExamMatrix,
  ExamReport,
  ExamScoreEntry,
  ExamService,
  ExamSession,
  ExamSlot,
  ExamStudentCard,
  ExamStudentResult,
  GenerateResult,
  IntegrityEvent,
  Item,
} from '@openedu/contracts';
import { getSupabaseClient, type V2Client } from '../supabase/client';
import { fromItem } from '../supabase/mapping';
import { generatePaper, slotCandidates } from './matrix';
import { buildExamReport } from './report';
import { studentResultView } from './scoring';
import { arrangeForStudent, arrangeIds } from './shuffle';

type Row = Record<string, unknown>;
const DAY = 86_400_000;

function err(e: unknown, fallback: string): Error {
  const m = (e as { message?: string } | null)?.message;
  return Object.assign(new Error(m && /[à-ỹ]/i.test(m) ? m : fallback), { friendly: true });
}

const toMatrixRow = (m: ExamMatrix): Row => ({
  ...(m.id ? { id: m.id } : {}), title: m.title, subject: m.subject, grade: m.grade, term_id: m.termId ?? null, duration_min: m.durationMin, rows: m.rows, cells: m.cells,
});
const fromMatrixRow = (r: Row): ExamMatrix => ({
  id: String(r.id), title: String(r.title), subject: r.subject as ExamMatrix['subject'], grade: Number(r.grade) as ExamMatrix['grade'],
  ...(r.term_id ? { termId: r.term_id as ExamMatrix['termId'] } : {}), durationMin: Number(r.duration_min), rows: (r.rows ?? []) as ExamMatrix['rows'],
  cells: (r.cells ?? {}) as ExamMatrix['cells'], ...(r.owner_id ? { ownerId: String(r.owner_id) } : {}), updatedAt: String(r.updated_at ?? ''),
});
const toExamRow = (e: Exam): Row => ({
  ...(e.id ? { id: e.id } : {}), title: e.title, matrix_id: e.matrixId ?? null, subject: e.subject, grade: e.grade, term_id: e.termId ?? null,
  class_id: e.classId, student_ids: e.studentIds ?? [], duration_min: e.durationMin, open_at: e.openAt, close_at: e.closeAt,
  results_policy: e.resultsPolicy, released_at: e.releasedAt ?? null, max_attempts: e.maxAttempts, online_variants: e.onlineVariants,
  fullscreen_prompt: e.fullscreenPrompt, status: e.status, rows: e.rows, paper: e.paper,
});
const fromExamRow = (r: Row): Exam => ({
  id: String(r.id), title: String(r.title), ...(r.matrix_id ? { matrixId: String(r.matrix_id) } : {}), subject: r.subject as Exam['subject'],
  grade: Number(r.grade) as Exam['grade'], ...(r.term_id ? { termId: r.term_id as Exam['termId'] } : {}), classId: String(r.class_id),
  studentIds: (r.student_ids ?? []) as string[], durationMin: Number(r.duration_min), openAt: String(r.open_at), closeAt: String(r.close_at),
  resultsPolicy: r.results_policy as Exam['resultsPolicy'], releasedAt: (r.released_at as string | null) ?? null, maxAttempts: Number(r.max_attempts),
  onlineVariants: r.online_variants as Exam['onlineVariants'], fullscreenPrompt: !!r.fullscreen_prompt, status: r.status as Exam['status'],
  rows: (r.rows ?? []) as Exam['rows'], paper: r.paper as Exam['paper'], ...(r.created_by ? { createdBy: String(r.created_by) } : {}),
  createdAt: String(r.created_at ?? ''), updatedAt: String(r.updated_at ?? ''),
});

/** Kết quả (exam_my_result / grade exam-finalize) → ExamStudentResult. */
export function fromResultJson(j: Row | null): ExamStudentResult | null {
  if (!j) return null;
  const base = { examId: String(j.examId), title: String(j.title ?? ''), submittedAt: (j.submittedAt as string | null) ?? null };
  if (!j.released) return { ...base, released: false };
  const results = ((j.results ?? []) as { itemId: string; correct: boolean }[]).map((r) => ({ itemId: r.itemId, slotId: '', correct: !!r.correct, score: r.correct ? 1 : 0, earned: 0, points: 0 }));
  const order = arrangeIds((j.entries ?? []) as { id: string; qtype: 'tn' | 'tl' }[], Number(j.seed) >>> 0);
  return studentResultView(base, true, { results, score: Number(j.score), maxScore: Number(j.maxScore), score10: Number(j.score10) }, order);
}

export class SupabaseExamService implements ExamService {
  constructor(private ds: DataSource) {}
  private db(): Promise<V2Client> {
    return getSupabaseClient();
  }
  private async rpc<T>(fn: string, args: Row, fallback: string): Promise<T> {
    const sb = await this.db();
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw err(error, fallback);
    return data as T;
  }

  private async recent(): Promise<Record<string, number>> {
    const sb = await this.db();
    const { data } = await sb.from('exams').select('paper').gte('created_at', new Date(Date.now() - 60 * DAY).toISOString());
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as Row[]) {
      const p = r.paper as Exam['paper'];
      for (const s of [...(p?.A ?? []), ...(p?.B ?? [])]) if (s.itemId) out[s.itemId] = (out[s.itemId] ?? 0) + 1;
    }
    return out;
  }

  async listMatrices(): Promise<ExamMatrix[]> {
    const sb = await this.db();
    const { data, error } = await sb.from('exam_matrices').select('*').order('updated_at', { ascending: false });
    if (error) throw err(error, 'Không tải được ma trận đề.');
    return ((data ?? []) as Row[]).map(fromMatrixRow);
  }
  async saveMatrix(m: ExamMatrix): Promise<ExamMatrix> {
    const sb = await this.db();
    const { data, error } = await sb.from('exam_matrices').upsert(toMatrixRow(m)).select('*').single();
    if (error) throw err(error, 'Chưa lưu được ma trận.');
    return fromMatrixRow(data as Row);
  }
  async deleteMatrix(id: string): Promise<void> {
    const sb = await this.db();
    const { error } = await sb.from('exam_matrices').delete().eq('id', id);
    if (error) throw err(error, 'Chưa xoá được ma trận.');
  }
  async generate(matrix: ExamMatrix, opts: { seed?: number } = {}): Promise<GenerateResult> {
    const [bank, recent] = await Promise.all([this.ds.listItems({ subject: matrix.subject, grade: matrix.grade }), this.recent()]);
    return generatePaper(matrix, bank, { seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31), recent });
  }
  async candidates(matrix: ExamMatrix, slot: ExamSlot, exclude: string[]): Promise<Item[]> {
    const [bank, recent] = await Promise.all([this.ds.listItems({ subject: matrix.subject, grade: matrix.grade }), this.recent()]);
    return slotCandidates(matrix, bank, slot, exclude, { seed: 7, recent });
  }

  async listExams(filter: ExamFilter = {}): Promise<Exam[]> {
    const sb = await this.db();
    let q = sb.from('exams').select('*').order('open_at', { ascending: false });
    if (filter.classId) q = q.eq('class_id', filter.classId);
    if (filter.status) q = q.eq('status', filter.status);
    const { data, error } = await q;
    if (error) throw err(error, 'Không tải được danh sách đề.');
    return ((data ?? []) as Row[]).map(fromExamRow);
  }
  async getExam(id: string): Promise<Exam | null> {
    const sb = await this.db();
    const { data, error } = await sb.from('exams').select('*').eq('id', id).maybeSingle();
    if (error) throw err(error, 'Không tải được đề.');
    return data ? fromExamRow(data as Row) : null;
  }
  async saveExam(e: Exam): Promise<Exam> {
    const sb = await this.db();
    const { data, error } = await sb.from('exams').upsert(toExamRow(e)).select('*').single();
    if (error) throw err(error, 'Chưa lưu được đề.');
    return fromExamRow(data as Row);
  }
  async deleteExam(id: string): Promise<void> {
    const sb = await this.db();
    const { error } = await sb.from('exams').delete().eq('id', id);
    if (error) throw err(error, 'Chưa xoá được đề.');
  }
  async getReport(examId: string): Promise<ExamReport> {
    const exam = await this.getExam(examId);
    if (!exam) throw err(null, 'Không tìm thấy đề này.');
    const sb = await this.db();
    // Bài quá giờ chưa nộp → nộp hộ (server chấm).
    const { data: open } = await sb.from('exam_attempts').select('id, deadline_at').eq('exam_id', examId).eq('status', 'in-progress');
    for (const r of (open ?? []) as Row[]) {
      if (Date.parse(String(r.deadline_at)) + 30_000 < Date.now()) await sb.functions.invoke('grade', { body: { action: 'exam-finalize', attemptId: r.id } });
    }
    const [students, at] = await Promise.all([this.ds.listStudents(exam.classId), sb.from('exam_attempts').select('*').eq('exam_id', examId)]);
    if (at.error) throw err(at.error, 'Không tải được bài làm.');
    const rows = (at.data ?? []) as Row[];
    const ids = rows.map((r) => String(r.id));
    const [ans, ev] = ids.length
      ? await Promise.all([sb.from('exam_answers').select('*').in('attempt_id', ids), sb.from('integrity_events').select('*').in('attempt_id', ids).order('at')])
      : [{ data: [] as Row[] }, { data: [] as Row[] }];
    const attempts: ExamAttempt[] = rows.map((r) => ({
      id: String(r.id), examId, studentId: String(r.student_id), attemptNo: Number(r.attempt_no), variant: r.variant as ExamAttempt['variant'], seed: Number(r.seed),
      startedAt: String(r.started_at), deadlineAt: String(r.deadline_at), submittedAt: (r.submitted_at as string | null) ?? null, autoSubmitted: !!r.auto_submitted,
      status: r.status as ExamAttempt['status'], retakeAllowed: !!r.retake_allowed,
      ...(r.score !== null ? { score: Number(r.score), maxScore: Number(r.max_score), score10: Number(r.score10) } : {}),
      ...(r.results ? { results: r.results as ExamAttempt['results'] } : {}),
      answers: Object.fromEntries(((ans.data ?? []) as Row[]).filter((x) => x.attempt_id === r.id).map((x) => [String(x.item_id), { response: x.response, ms: Number(x.ms), flagged: !!x.flagged, savedAt: String(x.saved_at) } as ExamAnswer])),
      integrity: ((ev.data ?? []) as Row[]).filter((x) => x.attempt_id === r.id).map((x) => ({ kind: x.kind as IntegrityEvent['kind'], at: String(x.at), ...(x.away_ms !== null ? { awayMs: Number(x.away_ms) } : {}), ...(x.item_id ? { itemId: String(x.item_id) } : {}) })),
    }));
    return buildExamReport(exam, students, attempts);
  }
  async releaseResults(examId: string): Promise<Exam> {
    const sb = await this.db();
    const { data, error } = await sb.from('exams').update({ released_at: new Date().toISOString() }).eq('id', examId).select('*').single();
    if (error) throw err(error, 'Chưa công bố được kết quả.');
    return fromExamRow(data as Row);
  }
  async allowRetake(examId: string, studentId: string): Promise<void> {
    await this.rpc('exam_allow_retake', { p_exam: examId, p_student: studentId }, 'Chưa cho làm lại được.');
  }

  async listMyExams(): Promise<ExamStudentCard[]> {
    const list = await this.rpc<Row[]>('exam_my_list', {}, 'Chưa tải được bài kiểm tra.');
    const now = Date.now();
    return (list ?? []).map((x) => {
      const e = x.exam as Row;
      const a = x.attempt as Row | null;
      const open = Date.parse(String(e.openAt)) <= now && now < Date.parse(String(e.closeAt));
      const submitted = !!a && (a.status === 'submitted' || Date.parse(String(a.deadlineAt)) <= now);
      const canRetake = !!a && a.status === 'submitted' && open && (!!a.retakeAllowed || Number(a.count) < Number(x.maxAttempts));
      const state: ExamStudentCard['state'] = canRetake ? 'open' : a && !submitted ? 'in-progress' : submitted ? 'submitted' : now < Date.parse(String(e.openAt)) ? 'upcoming' : open ? 'open' : 'closed';
      return {
        examId: String(e.id), title: String(e.title), subject: e.subject as ExamStudentCard['subject'], durationMin: Number(e.durationMin),
        openAt: String(e.openAt), closeAt: String(e.closeAt), questions: Number(e.questions), state, canRetake,
        resultReady: submitted && !canRetake && (e.resultsPolicy === 'immediate' || !!e.releasedAt),
      };
    });
  }
  async startExam(examId: string, sessionId: string): Promise<ExamSession> {
    const j = await this.rpc<Row>('exam_start', { p_exam: examId, p_session: sessionId }, 'Chưa mở được bài kiểm tra.');
    const e = j.exam as Row;
    const items = ((j.items ?? []) as Row[]).map(fromItem);
    return {
      exam: { id: String(e.id), title: String(e.title), subject: e.subject as Exam['subject'], grade: Number(e.grade) as Exam['grade'], durationMin: Number(e.durationMin), closeAt: String(e.closeAt), resultsPolicy: e.resultsPolicy as Exam['resultsPolicy'], fullscreenPrompt: !!e.fullscreenPrompt },
      attemptId: String(j.attemptId), attemptNo: Number(j.attemptNo), variant: j.variant as ExamSession['variant'], seed: Number(j.seed),
      startedAt: String(j.startedAt), deadlineAt: String(j.deadlineAt), serverNow: String(j.serverNow), status: j.status as ExamSession['status'],
      otherSession: !!j.otherSession, items: arrangeForStudent(items, Number(j.seed) >>> 0), points: (j.points ?? {}) as Record<string, number>,
      answers: (j.answers ?? {}) as Record<string, ExamAnswer>,
    };
  }
  async saveAnswer(attemptId: string, itemId: string, a: Omit<ExamAnswer, 'savedAt'>): Promise<void> {
    await this.rpc('exam_save_answer', { p_attempt: attemptId, p_item: itemId, p_response: a.response, p_ms: Math.round(a.ms), p_flagged: !!a.flagged }, 'Chưa lưu được câu trả lời.');
  }
  async logIntegrity(attemptId: string, events: IntegrityEvent[]): Promise<void> {
    if (events.length) await this.rpc('exam_log_integrity', { p_attempt: attemptId, p_events: events }, 'Chưa ghi được.');
  }
  async heartbeat(attemptId: string, sessionId: string): Promise<{ otherSession: boolean; deadlineAt: string }> {
    return this.rpc('exam_heartbeat', { p_attempt: attemptId, p_session: sessionId }, 'Mất kết nối.');
  }
  async submitExam(attemptId: string): Promise<ExamStudentResult> {
    const sb = await this.db();
    const { data, error } = await sb.functions.invoke('grade', { body: { action: 'exam-finalize', attemptId } });
    if (error) throw err(error, 'Chưa nộp được bài. Em kiểm tra mạng rồi bấm Nộp bài lần nữa nhé.');
    return fromResultJson(data as Row)!;
  }
  async getMyResult(examId: string): Promise<ExamStudentResult | null> {
    return fromResultJson(await this.rpc<Row | null>('exam_my_result', { p_exam: examId }, 'Chưa tải được kết quả.'));
  }
  async examScores(studentId: string): Promise<ExamScoreEntry[]> {
    const list = await this.rpc<Row[]>('exam_scores', { p_student: studentId }, 'Chưa tải được điểm kiểm tra.');
    return (list ?? []).map((r) => ({ examId: String(r.examId), title: String(r.title), subject: r.subject as ExamScoreEntry['subject'], ...(r.termId ? { termId: r.termId as ExamScoreEntry['termId'] } : {}), score10: Number(r.score10), at: String(r.at) }));
  }
}
