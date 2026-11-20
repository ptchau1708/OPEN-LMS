/**
 * Đề kiểm tra ở chế độ demo: lưu trong kho localStorage của DemoDataSource (khóa `exam.*`), chấm trên máy.
 * Nạp mẫu một lần cho mỗi lần nạp dữ liệu demo: câu bổ sung (EXAM_EXTRA_ITEMS), 2 ma trận, 1 đề Toán 4 đã giao lớp 4A
 * (đang mở 7 ngày, kết quả hiện ngay) và bài làm mẫu của 6/8 bạn (Ngọc Lan và Tường Vy chưa làm).
 */
import {
  uid,
  type DataSource,
  type Exam,
  type ExamAnswer,
  type ExamAttempt,
  type ExamFilter,
  type ExamMatrix,
  type ExamReport,
  type ExamScoreEntry,
  type ExamService,
  type ExamSession,
  type ExamSlot,
  type ExamStudentCard,
  type ExamStudentResult,
  type GenerateResult,
  type IntegrityEvent,
  type Item,
  type Profile,
} from '@openedu/contracts';
import type { DemoDataSource } from '../demo/DemoDataSource';
import { loadScorer } from '../live/types';
import { answerAnnotations } from '../mastery';
import { readJson, writeJson, type KVStorage } from '../storage';
import { sanitizeIntegrity } from './integrity';
import { generatePaper, slotCandidates } from './matrix';
import { attemptDeadline, buildExamReport, examAppliesTo, latestAttempts, studentCard } from './report';
import { scoreAttempt, studentResultView, type ExamScoreFn } from './scoring';
import { arrangeForStudent, arrangeIds, attemptSeed, rng } from './shuffle';

const KX = { meta: 'exam.meta', matrices: 'exam.matrices', exams: 'exam.exams', attempts: 'exam.attempts', sessions: 'exam.sessions' } as const;
const SEED_V = 2;
export const DEMO_EXAM_ID = 'ex-toan4-ck1-4a';
/** Lệch thêm sau hạn nộp vẫn nhận câu trả lời (mạng chậm). */
export const SAVE_GRACE_MS = 30_000;
/** Phiên khác còn "sống" nếu nhịp gần nhất cách < 45 giây. */
export const SESSION_TTL_MS = 45_000;
const DAY = 86_400_000;

const friendly = (m: string) => Object.assign(new Error(m), { friendly: true });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const strip = (it: Item): Item => {
  const { key: _k, ...rest } = it as Item & { key?: unknown };
  void _k;
  return rest as Item;
};

export function variantSlots(exam: Exam, a: Pick<ExamAttempt, 'variant'>): ExamSlot[] {
  return exam.paper[a.variant].filter((s) => s.itemId);
}

export class DemoExamService implements ExamService {
  private seeded: Promise<void> | null = null;
  constructor(private ds: DataSource) {}

  private demo(): DemoDataSource {
    return this.ds as DemoDataSource;
  }

  private async kv(): Promise<{ s: KVStorage; now: Date }> {
    const { storage, now } = await this.demo().schoolKv();
    if (!this.seeded) this.seeded = this.ensureSeed(storage, now()).catch((e) => { this.seeded = null; throw e; });
    await this.seeded;
    return { s: storage, now: now() };
  }

  private async ensureSeed(s: KVStorage, now: Date): Promise<void> {
    const base = readJson<{ seededAt?: string } | null>(s, 'meta', null)?.seededAt ?? '';
    const meta = readJson<{ v: number; base: string } | null>(s, KX.meta, null);
    if (meta && meta.v === SEED_V && meta.base === base) return;
    const { EXAM_EXTRA_ITEMS, MATRIX_TOAN4_CK1, SEED_MATRICES } = await import('./seed');
    for (const it of EXAM_EXTRA_ITEMS) if (!(await this.ds.getItem(it.id))) await this.ds.saveItem(it);
    writeJson(s, KX.matrices, clone(SEED_MATRICES));
    const bank = await this.ds.listItems({ subject: 'toan', grade: 4 });
    const { paper } = generatePaper(MATRIX_TOAN4_CK1, bank, { seed: 20261215 });
    const openAt = new Date(now.getTime() - DAY).toISOString();
    const exam: Exam = {
      id: DEMO_EXAM_ID,
      title: 'Kiểm tra cuối học kì I – Toán 4',
      matrixId: MATRIX_TOAN4_CK1.id,
      subject: 'toan',
      grade: 4,
      termId: 'CK1',
      classId: 'c-4a',
      durationMin: 40,
      openAt,
      closeAt: new Date(now.getTime() + 7 * DAY).toISOString(),
      resultsPolicy: 'immediate',
      releasedAt: null,
      maxAttempts: 1,
      onlineVariants: 'AB',
      fullscreenPrompt: true,
      status: 'published',
      rows: MATRIX_TOAN4_CK1.rows.map((r) => ({ id: r.id, label: r.label })),
      paper,
      createdBy: 'u-cothu',
      createdAt: openAt,
      updatedAt: openAt,
    };
    writeJson(s, KX.exams, [exam]);
    writeJson(s, KX.attempts, await this.syntheticAttempts(exam, bank, now));
    writeJson(s, KX.sessions, {});
    writeJson(s, KX.meta, { v: SEED_V, base });
  }

  /** Bài làm mẫu: mỗi bạn một "sức học", vài bạn có ghi chú trung tính để GV xem thử bảng. */
  private async syntheticAttempts(exam: Exam, bank: Item[], now: Date): Promise<ExamAttempt[]> {
    const score = await loadScorer();
    const { correctResponse } = await import('../seed/synthetic-4a');
    const items = Object.fromEntries(bank.map((i) => [i.id, i]));
    const plan: [string, number, ('leave' | 'fast' | 'dup')[]][] = [
      ['u-hai4a1', 0.92, []],
      ['u-khoa4a3', 0.7, ['leave']],
      ['u-mai4a4', 0.85, []],
      ['u-tuan4a5', 0.45, ['fast']],
      ['u-nam4a7', 0.6, ['leave', 'dup']],
      ['u-thao4a8', 0.78, []],
    ];
    const out: ExamAttempt[] = [];
    plan.forEach(([studentId, skill, flags], k) => {
      const r = rng(1000 + k);
      const variant = k % 2 ? 'B' : 'A';
      const startedAt = new Date(now.getTime() - (20 - k) * 3_600_000);
      const slots = exam.paper[variant].filter((s) => s.itemId);
      const answers: Record<string, ExamAnswer> = {};
      let t = startedAt.getTime();
      for (const sl of slots) {
        const it = items[sl.itemId!];
        if (!it) continue;
        const ok = r() < skill - (sl.level - 2) * 0.12;
        const ms = flags.includes('fast') && r() < 0.6 ? 1200 + Math.round(r() * 1200) : 15_000 + Math.round(r() * 80_000);
        t += ms;
        let response: ExamAnswer['response'];
        try {
          response = ok ? correctResponse(it) : it.type === 'SHORT_ANSWER' ? { text: '0' } : it.type === 'MCQ' ? { choice: it.payload.options.find((o) => o.id !== it.key?.correct)?.id ?? 'a' } : correctResponse(it);
        } catch {
          continue;
        }
        answers[it.id] = { response, ms, savedAt: new Date(t).toISOString() };
      }
      const integrity: IntegrityEvent[] = [];
      if (flags.includes('leave')) for (let i = 0; i < 3; i++) integrity.push({ kind: 'hidden', at: new Date(startedAt.getTime() + ((t - startedAt.getTime()) * (i + 1)) / 4).toISOString(), awayMs: 8_000 + i * 12_000 });
      if (flags.includes('dup')) integrity.push({ kind: 'duplicate-session', at: new Date(startedAt.getTime() + (t - startedAt.getTime()) / 3).toISOString() });
      const submittedAt = new Date(t + 30_000).toISOString();
      const sc = scoreAttempt(slots, items, answers, score);
      out.push({
        id: `ea-${studentId}-1`, examId: exam.id, studentId, attemptNo: 1, variant, seed: attemptSeed(exam.id, studentId, 1),
        startedAt: startedAt.toISOString(), deadlineAt: attemptDeadline(startedAt, exam.durationMin, exam.closeAt), submittedAt,
        status: 'submitted', answers, integrity, results: sc.results, score: sc.score, maxScore: sc.maxScore, score10: sc.score10,
      });
    });
    return out;
  }

  private exams(s: KVStorage): Exam[] {
    return readJson<Exam[]>(s, KX.exams, []);
  }
  private attempts(s: KVStorage): ExamAttempt[] {
    return readJson<ExamAttempt[]>(s, KX.attempts, []);
  }
  private putAttempt(s: KVStorage, a: ExamAttempt): void {
    const list = this.attempts(s).filter((x) => x.id !== a.id);
    list.push(a);
    writeJson(s, KX.attempts, list);
  }
  private async me(): Promise<Profile> {
    const u = await this.ds.getCurrentUser();
    if (!u) throw friendly('Em đăng nhập lại nhé.');
    return u;
  }
  private async staff(): Promise<Profile> {
    const u = await this.me();
    if (u.role !== 'teacher' && u.role !== 'admin') throw friendly('Chỉ thầy cô dùng được chức năng này.');
    return u;
  }

  /** Câu đã dùng trong đề 60 ngày qua → số lần. */
  private recent(s: KVStorage, now: Date): Record<string, number> {
    const since = now.getTime() - 60 * DAY;
    const out: Record<string, number> = {};
    for (const e of this.exams(s)) {
      if (Date.parse(e.createdAt ?? e.openAt) < since) continue;
      for (const sl of [...e.paper.A, ...e.paper.B]) if (sl.itemId) out[sl.itemId] = (out[sl.itemId] ?? 0) + 1;
    }
    return out;
  }

  /* ---------------- ma trận ---------------- */
  async listMatrices(): Promise<ExamMatrix[]> {
    const { s } = await this.kv();
    return readJson<ExamMatrix[]>(s, KX.matrices, []);
  }
  async saveMatrix(m: ExamMatrix): Promise<ExamMatrix> {
    const me = await this.staff();
    const { s, now } = await this.kv();
    const saved: ExamMatrix = { ...clone(m), id: m.id || uid('mt'), ownerId: m.ownerId ?? me.id, updatedAt: now.toISOString() };
    writeJson(s, KX.matrices, [...readJson<ExamMatrix[]>(s, KX.matrices, []).filter((x) => x.id !== saved.id), saved]);
    return saved;
  }
  async deleteMatrix(id: string): Promise<void> {
    await this.staff();
    const { s } = await this.kv();
    writeJson(s, KX.matrices, readJson<ExamMatrix[]>(s, KX.matrices, []).filter((x) => x.id !== id));
  }
  async generate(matrix: ExamMatrix, opts: { seed?: number } = {}): Promise<GenerateResult> {
    await this.staff();
    const { s, now } = await this.kv();
    const bank = await this.ds.listItems({ subject: matrix.subject, grade: matrix.grade });
    return generatePaper(matrix, bank, { seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31), recent: this.recent(s, now) });
  }
  async candidates(matrix: ExamMatrix, slot: ExamSlot, exclude: string[]): Promise<Item[]> {
    const { s, now } = await this.kv();
    const bank = await this.ds.listItems({ subject: matrix.subject, grade: matrix.grade });
    return slotCandidates(matrix, bank, slot, exclude, { seed: 7, recent: this.recent(s, now) });
  }

  /* ---------------- đề ---------------- */
  async listExams(filter: ExamFilter = {}): Promise<Exam[]> {
    const { s } = await this.kv();
    return this.exams(s)
      .filter((e) => (!filter.classId || e.classId === filter.classId) && (!filter.status || e.status === filter.status))
      .sort((a, b) => b.openAt.localeCompare(a.openAt));
  }
  async getExam(id: string): Promise<Exam | null> {
    const { s } = await this.kv();
    return this.exams(s).find((e) => e.id === id) ?? null;
  }
  async saveExam(e: Exam): Promise<Exam> {
    const me = await this.staff();
    const { s, now } = await this.kv();
    if (Date.parse(e.closeAt) <= Date.parse(e.openAt)) throw friendly('Giờ đóng đề phải sau giờ mở đề.');
    const saved: Exam = { ...clone(e), id: e.id || uid('ex'), createdBy: e.createdBy ?? me.id, createdAt: e.createdAt ?? now.toISOString(), updatedAt: now.toISOString() };
    writeJson(s, KX.exams, [...this.exams(s).filter((x) => x.id !== saved.id), saved]);
    return saved;
  }
  async deleteExam(id: string): Promise<void> {
    await this.staff();
    const { s } = await this.kv();
    writeJson(s, KX.exams, this.exams(s).filter((x) => x.id !== id));
    writeJson(s, KX.attempts, this.attempts(s).filter((a) => a.examId !== id));
  }
  async getReport(examId: string): Promise<ExamReport> {
    await this.staff();
    const { s, now } = await this.kv();
    const exam = this.exams(s).find((e) => e.id === examId);
    if (!exam) throw friendly('Không tìm thấy đề này.');
    await this.finalizeOverdue(s, exam, now);
    return buildExamReport(exam, await this.ds.listStudents(exam.classId), this.attempts(s), now);
  }
  async releaseResults(examId: string): Promise<Exam> {
    await this.staff();
    const { s, now } = await this.kv();
    const e = this.exams(s).find((x) => x.id === examId);
    if (!e) throw friendly('Không tìm thấy đề này.');
    return this.saveExam({ ...e, releasedAt: now.toISOString() });
  }
  async allowRetake(examId: string, studentId: string): Promise<void> {
    await this.staff();
    const { s } = await this.kv();
    const last = latestAttempts(this.attempts(s).filter((a) => a.examId === examId && a.studentId === studentId)).get(studentId);
    if (!last) throw friendly('Em này chưa làm bài nên chưa cần cho làm lại.');
    if (last.status !== 'submitted') throw friendly('Em này đang làm bài.');
    this.putAttempt(s, { ...last, retakeAllowed: true });
  }

  /* ---------------- học sinh ---------------- */
  private async finalizeOverdue(s: KVStorage, exam: Exam, now: Date): Promise<void> {
    for (const a of this.attempts(s)) {
      if (a.examId === exam.id && a.status === 'in-progress' && Date.parse(a.deadlineAt) + SAVE_GRACE_MS < now.getTime()) await this.finalize(s, exam, a, now, true);
    }
  }

  async listMyExams(studentId: string): Promise<ExamStudentCard[]> {
    const { s, now } = await this.kv();
    const me = (await this.ds.getCurrentUser()) ?? null;
    const classId = me?.id === studentId ? me.classId : undefined;
    const out: ExamStudentCard[] = [];
    for (const e of this.exams(s)) {
      if (e.status !== 'published' || (classId && e.classId !== classId) || !examAppliesTo(e, studentId)) continue;
      await this.finalizeOverdue(s, e, now);
      const card = studentCard(e, this.attempts(s), studentId, now);
      // Đề đã đóng quá 3 ngày và chưa làm → không hiện nữa.
      if (card.state === 'closed' && now.getTime() - Date.parse(e.closeAt) > 3 * DAY) continue;
      out.push(card);
    }
    return out.sort((a, b) => a.closeAt.localeCompare(b.closeAt));
  }

  async startExam(examId: string, sessionId: string): Promise<ExamSession> {
    const me = await this.me();
    const { s, now } = await this.kv();
    const exam = this.exams(s).find((e) => e.id === examId && e.status === 'published');
    if (!exam || !examAppliesTo(exam, me.id) || (me.classId && exam.classId !== me.classId)) throw friendly('Không tìm thấy bài kiểm tra này.');
    await this.finalizeOverdue(s, exam, now);
    const mine = this.attempts(s).filter((a) => a.examId === examId && a.studentId === me.id);
    let a = latestAttempts(mine).get(me.id);
    const t = now.getTime();
    const open = Date.parse(exam.openAt) <= t && t < Date.parse(exam.closeAt);
    const sessions = readJson<Record<string, { id: string; at: number }>>(s, KX.sessions, {});
    let otherSession = false;
    if (!a || (a.status === 'submitted' && (a.retakeAllowed || mine.length < exam.maxAttempts))) {
      if (t < Date.parse(exam.openAt)) throw friendly('Bài kiểm tra chưa mở. Em quay lại sau nhé.');
      if (!open) throw friendly('Bài kiểm tra đã đóng.');
      const attemptNo = (a?.attemptNo ?? 0) + 1;
      if (a?.retakeAllowed) this.putAttempt(s, { ...a, retakeAllowed: false });
      const seed = attemptSeed(exam.id, me.id, attemptNo);
      a = {
        id: uid('ea'), examId, studentId: me.id, attemptNo,
        variant: exam.onlineVariants === 'AB' && seed % 2 === 1 ? 'B' : 'A',
        seed, startedAt: now.toISOString(), deadlineAt: attemptDeadline(now, exam.durationMin, exam.closeAt),
        status: 'in-progress', answers: {}, integrity: [],
      };
      this.putAttempt(s, a);
    } else if (a.status === 'in-progress') {
      const prev = sessions[a.id];
      if (prev && prev.id !== sessionId) {
        if (t - prev.at < SESSION_TTL_MS) {
          otherSession = true;
          a.integrity.push({ kind: 'duplicate-session', at: now.toISOString() });
        } else a.integrity.push({ kind: 'resume', at: now.toISOString() });
        this.putAttempt(s, a);
      }
    }
    if (a.status === 'in-progress') {
      sessions[a.id] = { id: sessionId, at: t };
      writeJson(s, KX.sessions, sessions);
    }
    const slots = variantSlots(exam, a);
    const items = await this.ds.getItems(slots.map((x) => x.itemId!));
    return {
      exam: { id: exam.id, title: exam.title, subject: exam.subject, grade: exam.grade, durationMin: exam.durationMin, closeAt: exam.closeAt, resultsPolicy: exam.resultsPolicy, fullscreenPrompt: exam.fullscreenPrompt },
      attemptId: a.id, attemptNo: a.attemptNo, variant: a.variant, seed: a.seed, startedAt: a.startedAt, deadlineAt: a.deadlineAt,
      serverNow: now.toISOString(),
      items: a.status === 'in-progress' ? arrangeForStudent(items.map(strip), a.seed) : [],
      points: Object.fromEntries(slots.map((x) => [x.itemId!, x.points])),
      answers: a.answers,
      status: a.status,
      otherSession,
    };
  }

  private async ownAttempt(attemptId: string): Promise<{ s: KVStorage; now: Date; a: ExamAttempt; exam: Exam }> {
    const me = await this.me();
    const { s, now } = await this.kv();
    const a = this.attempts(s).find((x) => x.id === attemptId);
    if (!a || a.studentId !== me.id) throw friendly('Không tìm thấy bài làm của em.');
    const exam = this.exams(s).find((e) => e.id === a.examId);
    if (!exam) throw friendly('Không tìm thấy bài kiểm tra này.');
    return { s, now, a, exam };
  }

  async saveAnswer(attemptId: string, itemId: string, answer: Omit<ExamAnswer, 'savedAt'>): Promise<void> {
    const { s, now, a, exam } = await this.ownAttempt(attemptId);
    if (a.status !== 'in-progress') throw friendly('Em đã nộp bài rồi.');
    if (now.getTime() > Date.parse(a.deadlineAt) + SAVE_GRACE_MS) throw friendly('Đã hết giờ làm bài.');
    if (!variantSlots(exam, a).some((x) => x.itemId === itemId)) throw friendly('Câu này không có trong bài.');
    a.answers[itemId] = { response: answer.response, ms: Math.max(0, Math.min(Math.round(answer.ms), 3 * 3_600_000)), ...(answer.flagged ? { flagged: true } : {}), savedAt: now.toISOString() };
    this.putAttempt(s, a);
  }

  async logIntegrity(attemptId: string, events: IntegrityEvent[]): Promise<void> {
    const { s, a } = await this.ownAttempt(attemptId);
    if (a.status !== 'in-progress') return;
    a.integrity.push(...sanitizeIntegrity(events, a.integrity.length));
    this.putAttempt(s, a);
  }

  async heartbeat(attemptId: string, sessionId: string): Promise<{ otherSession: boolean; deadlineAt: string }> {
    const { s, now, a } = await this.ownAttempt(attemptId);
    const sessions = readJson<Record<string, { id: string; at: number }>>(s, KX.sessions, {});
    const prev = sessions[a.id];
    const other = !!prev && prev.id !== sessionId && now.getTime() - prev.at < SESSION_TTL_MS;
    if (other && a.status === 'in-progress') {
      a.integrity.push({ kind: 'duplicate-session', at: now.toISOString() });
      this.putAttempt(s, a);
    }
    sessions[a.id] = { id: sessionId, at: now.getTime() };
    writeJson(s, KX.sessions, sessions);
    return { otherSession: other, deadlineAt: a.deadlineAt };
  }

  private async finalize(s: KVStorage, exam: Exam, a: ExamAttempt, now: Date, auto: boolean): Promise<ExamAttempt> {
    if (a.status === 'submitted') return a;
    const slots = variantSlots(exam, a);
    const items = Object.fromEntries((await this.ds.getItems(slots.map((x) => x.itemId!))).map((i) => [i.id, i]));
    const score: ExamScoreFn = await loadScorer();
    const sc = scoreAttempt(slots, items, a.answers, score);
    const done: ExamAttempt = { ...a, status: 'submitted', submittedAt: now.toISOString(), autoSubmitted: auto, results: sc.results, score: sc.score, maxScore: sc.maxScore, score10: sc.score10 };
    this.putAttempt(s, done);
    // Kết quả từng câu → learning_events 'exam' (tính thành thạo kĩ năng). Không cộng sao cho bài kiểm tra.
    for (const r of sc.results) {
      const it = items[r.itemId];
      if (!it) continue;
      await this.ds.recordEvent({
        userId: a.studentId, verb: 'answered', objectType: 'exam', objectId: r.itemId, assignmentId: `exam:${exam.id}`,
        result: { correct: r.correct, score: r.score, durationMs: a.answers[r.itemId]?.ms, ...answerAnnotations(it, a.answers[r.itemId]?.response, r.correct) },
      });
    }
    return done;
  }

  private resultFor(exam: Exam, a: ExamAttempt): ExamStudentResult {
    const released = exam.resultsPolicy === 'immediate' || !!exam.releasedAt;
    const order = arrangeIds(variantSlots(exam, a).map((x) => ({ id: x.itemId!, qtype: x.qtype })), a.seed);
    return studentResultView({ examId: exam.id, title: exam.title, submittedAt: a.submittedAt }, released, a.results ? { results: a.results, score: a.score ?? 0, maxScore: a.maxScore ?? 0, score10: a.score10 ?? 1 } : null, order);
  }

  async submitExam(attemptId: string): Promise<ExamStudentResult> {
    const { s, now, a, exam } = await this.ownAttempt(attemptId);
    const done = await this.finalize(s, exam, a, now, now.getTime() > Date.parse(a.deadlineAt));
    return this.resultFor(exam, done);
  }

  async getMyResult(examId: string): Promise<ExamStudentResult | null> {
    const me = await this.me();
    const { s, now } = await this.kv();
    const exam = this.exams(s).find((e) => e.id === examId);
    if (!exam) return null;
    await this.finalizeOverdue(s, exam, now);
    const a = latestAttempts(this.attempts(s).filter((x) => x.examId === examId && x.studentId === me.id)).get(me.id);
    return a && a.status === 'submitted' ? this.resultFor(exam, a) : null;
  }

  async examScores(studentId: string): Promise<ExamScoreEntry[]> {
    const { s } = await this.kv();
    const exams = new Map(this.exams(s).map((e) => [e.id, e]));
    const out: ExamScoreEntry[] = [];
    const byExam = new Map<string, ExamAttempt>();
    for (const a of this.attempts(s)) {
      if (a.studentId !== studentId || a.status !== 'submitted' || !a.score10) continue;
      const cur = byExam.get(a.examId);
      if (!cur || a.attemptNo > cur.attemptNo) byExam.set(a.examId, a);
    }
    for (const [id, a] of byExam) {
      const e = exams.get(id);
      if (!e || !(e.resultsPolicy === 'immediate' || e.releasedAt)) continue;
      out.push({ examId: id, title: e.title, subject: e.subject, ...(e.termId ? { termId: e.termId } : {}), score10: a.score10!, at: a.submittedAt ?? a.startedAt });
    }
    return out.sort((x, y) => y.at.localeCompare(x.at));
  }
}
