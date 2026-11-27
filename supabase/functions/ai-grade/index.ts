/**
 * Edge Function `ai-grade` — AI chấm bài làm (ảnh chữ viết tay / đánh máy) và GV duyệt (docs/PHASE4_API.md).
 *
 * Vào:
 *   { submissionId }                                → chấm (HS chủ bài hoặc GV của lớp). Ra: SubmissionDetail.
 *   { action: 'review', review: { submissionId, decision: 'approved'|'edited'|'regrade'|'redo', final?, note? } }
 *                                                   → GV của lớp duyệt. Ra: SubmissionDetail.
 *   { action: 'review', review: { submissionId, decision: 'edited', manual: true, final: { level?, total?, criteria?, feedback… } } }
 *                                                   → GV TỰ CHẤM (không cần khóa AI): ghi bản chấm của GV vào ai_grades
 *                                                     (model 'manual/teacher', tin cậy 1) rồi duyệt như 'edited'.
 * Chấm: tải ảnh từ bucket `submissions` (service role) → dataURL; lời nhắc + kiểm tra JSON dùng CHUNG mã thuần
 * _shared/assess (chép từ packages/data/src/assess bằng tools/sync-scoring.mjs). OpenRouter (OPENROUTER_API_KEY,
 * OPENROUTER_GRADE_MODEL mặc định google/gemini-2.5-flash) → dự phòng Gemini REST (GEMINI_API_KEY, inline_data).
 * Hạn mức/ngày (v2.ai_usage, bucket 'grade'): AI_DAILY_LIMIT_GRADE (GV, mặc định 200), AI_DAILY_LIMIT_GRADE_STUDENT (mặc định 10).
 * Duyệt ('approved'/'edited'): ghi learning_events (object_type 'work', weight 2), tính lại skill_mastery, cộng 1–3 sao (một lần).
 * Không gửi tên / thông tin cá nhân HS cho nhà cung cấp AI.
 */
import { HttpError, isObject, readJsonObject, requireString, serveJson, type JsonObject } from '../_shared/http.ts';
import { adminClient, fromPgError, isStaff, requireCaller, type AdminClient, type Caller } from '../_shared/supabase.ts';
import { refreshMastery } from '../_shared/mastery-store.ts';
import type { AiGrade, GradeFinal, GradeReview, Rubric, Submission, SubmissionDetail, WorkTask } from '../_shared/scoring/contracts.ts';
import {
  approvalEvents,
  approvalReward,
  buildGeminiBody,
  buildGradePrompt,
  buildOpenRouterBody,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GRADER_MODEL,
  extractGeminiText,
  extractOpenRouterText,
  gradeFromModelText,
  mergeFinal,
  statusAfterGrade,
  teacherGrade,
  type GradePrompt,
  type ValidateResult,
} from '../_shared/assess/index.ts';

const BUCKET = 'submissions';
const TIMEOUT_MS = 55_000;
type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Dòng ↔ kiểu                                                         */
/* ------------------------------------------------------------------ */
function toTask(r: Row): WorkTask {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    prompt: (isObject(r.prompt) ? r.prompt : { text: '' }) as WorkTask['prompt'],
    subject: String(r.subject) as WorkTask['subject'],
    grade: Number(r.grade) as WorkTask['grade'],
    rubricId: String(r.rubric_id),
    classId: String(r.class_id),
    studentIds: Array.isArray(r.student_ids) ? (r.student_ids as string[]) : [],
    ...(r.due_at ? { dueAt: String(r.due_at) } : {}),
    allowPhoto: r.allow_photo !== false,
    allowText: r.allow_text !== false,
    createdBy: String(r.created_by ?? ''),
    ...(r.created_at ? { createdAt: String(r.created_at) } : {}),
  };
}

function toRubric(r: Row): Rubric {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    subject: String(r.subject) as Rubric['subject'],
    grade: Number(r.grade) as Rubric['grade'],
    maxScore: Number(r.max_score) || 10,
    criteria: (Array.isArray(r.criteria) ? r.criteria : []) as Rubric['criteria'],
    ...(r.model_answer ? { modelAnswer: String(r.model_answer) } : {}),
    skills: Array.isArray(r.skills) ? (r.skills as string[]) : [],
    ...(r.ai_notes ? { aiNotes: String(r.ai_notes) } : {}),
    ...(r.owner_id ? { ownerId: String(r.owner_id) } : {}),
  };
}

interface StoredImage {
  path: string;
  width: number;
  height: number;
}

function storedImages(r: Row): StoredImage[] {
  return (Array.isArray(r.images) ? r.images : []).filter(isObject).map((i) => ({ path: String(i.path ?? ''), width: Number(i.width) || 0, height: Number(i.height) || 0 })).filter((i) => i.path);
}

function toSubmission(r: Row, urls: Record<string, string>): Submission {
  return {
    id: String(r.id),
    taskId: String(r.task_id),
    studentId: String(r.student_id),
    classId: String(r.class_id),
    kind: r.kind as Submission['kind'],
    ...(typeof r.text === 'string' && r.text ? { text: r.text } : {}),
    images: storedImages(r).map((i) => ({ url: urls[i.path] ?? '', width: i.width, height: i.height, path: i.path })),
    submittedBy: r.submitted_by === 'teacher' ? 'teacher' : 'student',
    ...(r.submitter_id ? { submitterId: String(r.submitter_id) } : {}),
    status: r.status as Submission['status'],
    ...(r.error ? { error: String(r.error) } : {}),
    createdAt: String(r.created_at),
    ...(r.updated_at ? { updatedAt: String(r.updated_at) } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Tải dữ liệu, quyền                                                  */
/* ------------------------------------------------------------------ */
interface Loaded {
  row: Row;
  task: WorkTask;
  rubric: Rubric;
  grade: AiGrade | null;
  review: GradeReview | null;
}

async function load(admin: AdminClient, id: string): Promise<Loaded> {
  const { data, error } = await admin.from('submissions').select('*, work_tasks(*, rubrics(*)), ai_grades(data), grade_reviews(*)').eq('id', id).maybeSingle();
  if (error) throw fromPgError(error);
  if (!data) throw new HttpError(404, 'Không tìm thấy bài nộp này.', 'not_found');
  const row = data as Row;
  const t = row.work_tasks as Row | null;
  const rb = t && (t.rubrics as Row | null);
  if (!t || !rb) throw new HttpError(400, 'Bài này chưa có tiêu chí chấm.', 'no_rubric');
  const g = row.ai_grades as Row | Row[] | null;
  const gRow = Array.isArray(g) ? g[0] : g;
  const rv = row.grade_reviews as Row | Row[] | null;
  const rRow = Array.isArray(rv) ? rv[0] : rv;
  return {
    row,
    task: toTask(t),
    rubric: toRubric(rb),
    grade: gRow && isObject(gRow.data) ? (gRow.data as unknown as AiGrade) : null,
    review: rRow
      ? {
          submissionId: id,
          teacherId: String(rRow.teacher_id ?? ''),
          decision: rRow.decision as GradeReview['decision'],
          ...(isObject(rRow.final) ? { final: rRow.final as Partial<GradeFinal> } : {}),
          ...(rRow.note ? { note: String(rRow.note) } : {}),
          at: String(rRow.at),
        }
      : null,
  };
}

async function isTeacherOfClass(admin: AdminClient, caller: Caller, classId: string): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role !== 'teacher') return false;
  const c = await admin.from('classes').select('id').eq('id', classId).eq('teacher_id', caller.id).maybeSingle();
  if (c.data) return true;
  const m = await admin.from('class_members').select('class_id').eq('class_id', classId).eq('user_id', caller.id).eq('role', 'teacher').maybeSingle();
  return !!m.data;
}

async function signedUrls(admin: AdminClient, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const x of data ?? []) if (x.path && x.signedUrl) out[x.path] = x.signedUrl;
  return out;
}

async function detail(admin: AdminClient, id: string): Promise<SubmissionDetail> {
  const l = await load(admin, id);
  const urls = await signedUrls(admin, storedImages(l.row).map((i) => i.path));
  const sub = toSubmission(l.row, urls);
  const d: SubmissionDetail = { ...sub, taskTitle: l.task.title, task: l.task, rubric: l.rubric };
  if (l.grade) d.grade = l.grade;
  if (l.review) d.review = l.review;
  if (l.grade && sub.status === 'approved') d.final = mergeFinal(l.grade, l.review ?? undefined, l.rubric);
  return d;
}

async function setStatus(admin: AdminClient, id: string, status: string, error: string | null = null): Promise<void> {
  const { error: e } = await admin.from('submissions').update({ status, error, updated_at: new Date().toISOString() }).eq('id', id);
  if (e) throw fromPgError(e);
}

/* ------------------------------------------------------------------ */
/* Gọi mô hình                                                         */
/* ------------------------------------------------------------------ */
async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function loadImages(admin: AdminClient, paths: string[]): Promise<{ mimeType: string; data: string }[]> {
  const out: { mimeType: string; data: string }[] = [];
  for (const p of paths) {
    const { data, error } = await admin.storage.from(BUCKET).download(p);
    if (error || !data) throw new HttpError(404, 'Không tải được ảnh bài làm. Em nộp lại ảnh nhé.', 'image_missing');
    out.push({ mimeType: data.type || 'image/jpeg', data: toBase64(new Uint8Array(await data.arrayBuffer())) });
  }
  return out;
}

async function runModel(prompt: GradePrompt, images: { mimeType: string; data: string }[], ctx: Omit<Parameters<typeof gradeFromModelText>[1], 'model'>): Promise<ValidateResult> {
  const errors: string[] = [];
  const orKey = Deno.env.get('OPENROUTER_API_KEY');
  if (orKey) {
    const model = Deno.env.get('OPENROUTER_GRADE_MODEL') || DEFAULT_GRADER_MODEL;
    try {
      const data = await fetchJson('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${orKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': Deno.env.get('APP_URL') || 'https://open-edu.app', 'X-Title': 'OPEN-EDU' },
        body: JSON.stringify(buildOpenRouterBody(prompt, images.map((i) => `data:${i.mimeType};base64,${i.data}`), model)),
      });
      return gradeFromModelText(extractOpenRouterText(data), { ...ctx, model });
    } catch (e) {
      errors.push(`openrouter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const gKey = Deno.env.get('GEMINI_API_KEY');
  if (gKey) {
    const model = Deno.env.get('GEMINI_GRADE_MODEL') || DEFAULT_GEMINI_MODEL;
    try {
      const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gKey },
        body: JSON.stringify(buildGeminiBody(prompt, images, model)),
      });
      return gradeFromModelText(extractGeminiText(data), { ...ctx, model: `gemini/${model}` });
    } catch (e) {
      errors.push(`gemini: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.error('ai-grade: providers failed', errors);
  throw new HttpError(503, orKey || gKey ? 'Trợ lý chấm bài đang bận, thầy/cô thử lại sau ít phút nhé.' : 'Chưa cấu hình khóa AI trên máy chủ.', 'ai_unavailable');
}

function limit(name: string, fallback: number): number {
  const n = Number(Deno.env.get(name));
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/* ------------------------------------------------------------------ */
/* Chấm                                                                */
/* ------------------------------------------------------------------ */
async function removeWorkEvents(admin: AdminClient, l: Loaded, id: string): Promise<void> {
  const { error } = await admin.from('learning_events').delete().eq('user_id', l.row.student_id as string).eq('object_type', 'work').like('object_id', `work:${id}%`);
  if (error) throw fromPgError(error);
  await refreshMastery(admin, String(l.row.student_id), l.rubric.skills).catch((e) => console.warn('mastery refresh failed', e));
}

async function grade(admin: AdminClient, caller: Caller, id: string, staff: boolean): Promise<SubmissionDetail> {
  const l = await load(admin, id);
  if (l.row.status === 'approved') throw new HttpError(409, 'Bài đã được duyệt — muốn chấm lại, thầy/cô chọn "Chấm lại" khi duyệt.', 'approved');
  if (l.row.status === 'grading' && Date.now() - Date.parse(String(l.row.updated_at)) < 90_000) throw new HttpError(409, 'Bài đang được chấm, đợi một chút nhé.', 'busy');
  const lim = staff ? limit('AI_DAILY_LIMIT_GRADE', 200) : limit('AI_DAILY_LIMIT_GRADE_STUDENT', 10);
  const q = await admin.rpc('ai_quota_take', { p_user: caller.id, p_bucket: 'grade', p_limit: lim });
  if (q.error) throw fromPgError(q.error);
  if (typeof q.data !== 'number') throw new HttpError(429, `Hôm nay đã dùng hết ${lim} lượt chấm AI. Mai dùng tiếp nhé.`, 'quota');

  await setStatus(admin, id, 'grading');
  try {
    const paths = storedImages(l.row).map((i) => i.path);
    const images = await loadImages(admin, paths);
    const text = typeof l.row.text === 'string' ? l.row.text : undefined;
    const prompt = buildGradePrompt({ task: l.task, rubric: l.rubric, text, imageCount: images.length });
    const r = await runModel(prompt, images, { rubric: l.rubric, submissionId: id, now: new Date().toISOString(), imageCount: images.length });
    const g = r.grade;
    const up = await admin.from('ai_grades').upsert(
      { submission_id: id, data: g, total: g.total, max: g.max, level: g.level, confidence: g.confidence, flags: g.flags, model: g.model, repairs: r.repairs, created_at: g.createdAt },
      { onConflict: 'submission_id' },
    );
    if (up.error) throw fromPgError(up.error);
    await admin.from('grade_reviews').delete().eq('submission_id', id);
    await setStatus(admin, id, statusAfterGrade(g));
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : 'Chưa chấm được bài này, thầy/cô thử lại nhé.';
    await setStatus(admin, id, 'error', msg).catch(() => undefined);
    throw e instanceof HttpError ? e : new HttpError(502, msg, 'grade_failed');
  }
  return detail(admin, id);
}

/** Bản GV tự chấm từ payload (kiểm tra kiểu từng trường). */
function manualGrade(raw: unknown, id: string, rubric: Rubric, now: string): AiGrade {
  const f = isObject(raw) ? raw : {};
  const level = f.level === 'T' || f.level === 'H' || f.level === 'C' ? f.level : undefined;
  const total = typeof f.total === 'number' && Number.isFinite(f.total) ? f.total : undefined;
  const criteria = Array.isArray(f.criteria)
    ? f.criteria.filter(isObject).slice(0, 50).map((c) => ({
        criterionId: String(c.criterionId ?? '').slice(0, 64),
        points: Number(c.points),
        comment: typeof c.comment === 'string' ? c.comment.slice(0, 1000) : '',
      }))
    : undefined;
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 2000) : undefined);
  try {
    return teacherGrade({
      submissionId: id, rubric, now,
      ...(level ? { level } : {}),
      ...(total !== undefined ? { total } : {}),
      ...(criteria ? { criteria } : {}),
      ...(text(f.feedbackStudent) !== undefined ? { feedbackStudent: text(f.feedbackStudent) } : {}),
      ...(text(f.feedbackParent) !== undefined ? { feedbackParent: text(f.feedbackParent) } : {}),
      ...(text(f.feedbackTeacher) !== undefined ? { feedbackTeacher: text(f.feedbackTeacher) } : {}),
    });
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Thiếu mức hoặc điểm.', 'bad_request');
  }
}

/* ------------------------------------------------------------------ */
/* Duyệt                                                               */
/* ------------------------------------------------------------------ */
async function review(admin: AdminClient, caller: Caller, raw: JsonObject): Promise<SubmissionDetail> {
  const id = requireString(raw.submissionId, 'review.submissionId', 64);
  const decision = raw.decision;
  if (decision !== 'approved' && decision !== 'edited' && decision !== 'regrade' && decision !== 'redo') {
    throw new HttpError(400, 'Quyết định duyệt không hợp lệ.', 'bad_request');
  }
  const l = await load(admin, id);
  if (!(await isTeacherOfClass(admin, caller, String(l.row.class_id)))) throw new HttpError(403, 'Chỉ giáo viên của lớp mới duyệt được bài.', 'forbidden');
  const wasApproved = l.row.status === 'approved';
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 1000) : null;
  const now = new Date().toISOString();

  if (decision === 'regrade') {
    if (wasApproved) await removeWorkEvents(admin, l, id);
    await setStatus(admin, id, 'submitted');
    return grade(admin, caller, id, true);
  }
  if (decision === 'redo') {
    if (wasApproved) await removeWorkEvents(admin, l, id);
    const up = await admin.from('grade_reviews').upsert({ submission_id: id, teacher_id: caller.id, final: null, decision, note, at: now }, { onConflict: 'submission_id' });
    if (up.error) throw fromPgError(up.error);
    await setStatus(admin, id, 'returned');
    return detail(admin, id);
  }
  const manual = raw.manual === true;
  if (manual) {
    if (decision !== 'edited') throw new HttpError(400, 'Tự chấm cần quyết định "edited".', 'bad_request');
    l.grade = manualGrade(raw.final, id, l.rubric, now);
    const g = l.grade;
    const gu = await admin.from('ai_grades').upsert(
      { submission_id: id, data: g, total: g.total, max: g.max, level: g.level, confidence: g.confidence, flags: g.flags, model: g.model, repairs: [], created_at: g.createdAt },
      { onConflict: 'submission_id' },
    );
    if (gu.error) throw fromPgError(gu.error);
  }
  if (!l.grade) throw new HttpError(400, 'Bài chưa được chấm — thầy/cô bấm "Tự chấm" hoặc "Chấm bằng AI" trước nhé.', 'not_graded');
  const edits = !manual && isObject(raw.final) ? (raw.final as Partial<GradeFinal>) : undefined;
  const final = mergeFinal(l.grade, { decision, ...(edits ? { final: edits } : {}) }, l.rubric);
  const up = await admin.from('grade_reviews').upsert({ submission_id: id, teacher_id: caller.id, final, decision, note, at: now }, { onConflict: 'submission_id' });
  if (up.error) throw fromPgError(up.error);

  // Sự kiện học tập (thay bản cũ nếu duyệt lại) → tính lại thành thạo.
  const studentId = String(l.row.student_id);
  await admin.from('learning_events').delete().eq('user_id', studentId).eq('object_type', 'work').like('object_id', `work:${id}%`);
  const events = approvalEvents({ submissionId: id, studentId, taskId: l.task.id, taskTitle: l.task.title, rubric: l.rubric, grade: l.grade, final });
  if (events.length) {
    const ins = await admin.from('learning_events').insert(
      events.map((e) => ({ user_id: e.userId, verb: e.verb, object_type: e.objectType, object_id: e.objectId, assignment_id: l.task.id, result: e.result, at: now })),
    );
    if (ins.error) throw fromPgError(ins.error);
  }
  await refreshMastery(admin, studentId, [...l.rubric.skills, ...events.flatMap((e) => e.result?.skills ?? [])]).catch((e) => console.warn('mastery refresh failed', e));

  const rw = approvalReward({ submissionId: id, studentId, taskTitle: l.task.title, level: final.level });
  const aw = await admin.rpc('_award', {
    p_user: studentId, p_stars: rw.stars, p_coins: rw.coins, p_xp: rw.xp, p_reason: rw.reason,
    p_source_type: 'work', p_source_id: id, p_dedupe: `work:${id}`, p_created_by: caller.id,
  });
  if (aw.error) console.warn('award failed', aw.error);
  await setStatus(admin, id, 'approved');
  return detail(admin, id);
}

/* ------------------------------------------------------------------ */
serveJson(async (req) => {
  const caller = await requireCaller(req);
  const body = await readJsonObject(req, 50_000);
  const admin = adminClient();
  if (body.action === 'review') {
    if (!isStaff(caller)) throw new HttpError(403, 'Chỉ thầy/cô mới duyệt được bài.', 'forbidden');
    if (!isObject(body.review)) throw new HttpError(400, 'Thiếu "review".', 'bad_request');
    return review(admin, caller, body.review);
  }
  const id = requireString(body.submissionId, 'submissionId', 64);
  const { data, error } = await admin.from('submissions').select('student_id, class_id').eq('id', id).maybeSingle();
  if (error) throw fromPgError(error);
  if (!data) throw new HttpError(404, 'Không tìm thấy bài nộp này.', 'not_found');
  const row = data as Row;
  const staff = await isTeacherOfClass(admin, caller, String(row.class_id));
  if (!staff && row.student_id !== caller.id) throw new HttpError(403, 'Không có quyền chấm bài này.', 'forbidden');
  const d = await grade(admin, caller, id, staff);
  // HS chưa được xem điểm trước khi GV duyệt.
  if (!staff) {
    delete d.grade;
    delete d.rubric;
  }
  return d;
});
