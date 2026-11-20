/**
 * Google Classroom REST API (v1) — các hàm thuần trên một `fetch` tiêm vào, để kiểm thử bằng phản hồi giả.
 * ⚠ CHƯA THỬ VỚI GOOGLE THẬT (môi trường dựng mã không có tài khoản Google). Kiểm thử: phân trang, lỗi 403 khi
 * chấm bài không do ứng dụng này tạo, lỗi từng phần.
 *
 * Quy tắc của Google cần nhớ:
 *  - Một dự án Google Cloud chỉ sửa điểm được cho bài tập (courseWork) do CHÍNH dự án đó tạo qua API
 *    (`associatedWithDeveloper = true`). Vì vậy OPEN-EDU tự tạo bài tập trên Classroom rồi mới đẩy điểm.
 *  - `draftGrade` chỉ GV thấy; `assignedGrade` là điểm chính thức — HS thấy sau khi GV bấm "Trả bài" trong Classroom.
 */
export const CLASSROOM_API = 'https://classroom.googleapis.com/v1';

export const CLASSROOM_SCOPES = {
  /** Nhập danh sách: chỉ đọc. */
  roster: [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
    'https://www.googleapis.com/auth/classroom.profile.emails',
  ],
  /** Đẩy điểm: tạo bài tập + sửa điểm bài nộp. */
  grades: [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students',
  ],
} as const;

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface ClassroomApi { fetch: FetchLike; token: string; base?: string }

export class ClassroomError extends Error {
  constructor(message: string, readonly status: number, readonly reason?: string) {
    super(message);
    this.name = 'ClassroomError';
  }
}

function viMessage(status: number, reason: string, raw: string): string {
  if (status === 401) return 'Phiên đăng nhập Google đã hết hạn. Thầy cô bấm "Kết nối Google" lại nhé.';
  if (status === 403 && /ProjectPermissionDenied/i.test(reason + raw)) return 'Google không cho sửa điểm bài tập này vì bài không do OPEN-EDU tạo. Hãy chọn "Tạo bài tập mới trên Classroom" rồi đẩy điểm.';
  if (status === 403 && /disabled|not been used|accessNotConfigured/i.test(reason + raw)) return 'Dự án Google Cloud chưa bật "Google Classroom API". Xem hướng dẫn cài đặt.';
  if (status === 403) return 'Tài khoản Google này không có quyền với lớp học đó (cần là giáo viên của lớp), hoặc trường chặn ứng dụng bên ngoài.';
  if (status === 404) return 'Không tìm thấy lớp / bài tập này trên Classroom (có thể đã bị xóa).';
  if (status === 429) return 'Google đang giới hạn số lần gọi. Đợi một phút rồi thử lại.';
  if (status >= 500) return 'Máy chủ Google đang bận. Thử lại sau ít phút.';
  return `Google Classroom báo lỗi ${status}${raw ? `: ${raw.slice(0, 160)}` : ''}`;
}

async function call<T>(api: ClassroomApi, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await api.fetch(`${api.base ?? CLASSROOM_API}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${api.token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new ClassroomError('Không kết nối được tới Google Classroom. Kiểm tra mạng rồi thử lại.', 0);
  }
  if (!res.ok) {
    let reason = '';
    let raw = '';
    try {
      const j = (await res.json()) as { error?: { message?: string; status?: string; details?: { reason?: string }[] } };
      raw = j.error?.message ?? '';
      reason = `${j.error?.status ?? ''} ${(j.error?.details ?? []).map((d) => d.reason ?? '').join(' ')} ${raw.startsWith('@') ? raw : ''}`;
    } catch { /* thân không phải JSON */ }
    throw new ClassroomError(viMessage(res.status, reason, raw), res.status, reason.trim() || undefined);
  }
  return (await res.json()) as T;
}

/** Đọc hết các trang (pageToken). Dừng ở 50 trang để không lặp vô hạn. */
async function paged<T>(api: ClassroomApi, path: string, key: string): Promise<T[]> {
  const out: T[] = [];
  let token = '';
  for (let i = 0; i < 50; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await call<Record<string, unknown>>(api, `${path}${sep}pageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
    out.push(...((page[key] as T[] | undefined) ?? []));
    token = typeof page.nextPageToken === 'string' ? page.nextPageToken : '';
    if (!token) break;
  }
  return out;
}

export interface GcCourse { id: string; name: string; section?: string; courseState?: string; alternateLink?: string }
export interface GcStudent { userId: string; fullName: string; email?: string }
export interface GcCourseWork { id: string; title: string; maxPoints?: number; state?: string; alternateLink?: string; associatedWithDeveloper?: boolean }
export interface GcSubmission { id: string; userId: string; state?: string; assignedGrade?: number; draftGrade?: number }

const enc = encodeURIComponent;

/** Các lớp đang hoạt động mà tài khoản này là giáo viên. */
export function listCourses(api: ClassroomApi): Promise<GcCourse[]> {
  return paged<GcCourse>(api, '/courses?teacherId=me&courseStates=ACTIVE', 'courses');
}

export async function listCourseStudents(api: ClassroomApi, courseId: string): Promise<GcStudent[]> {
  const raw = await paged<{ userId: string; profile?: { name?: { fullName?: string }; emailAddress?: string } }>(api, `/courses/${enc(courseId)}/students`, 'students');
  return raw.map((s) => ({ userId: s.userId, fullName: s.profile?.name?.fullName ?? '', ...(s.profile?.emailAddress ? { email: s.profile.emailAddress } : {}) }));
}

/** Bài tập của lớp; `ownOnly` = chỉ bài do ứng dụng này tạo (mới sửa điểm được). */
export async function listCourseWork(api: ClassroomApi, courseId: string, ownOnly = false): Promise<GcCourseWork[]> {
  const all = await paged<GcCourseWork>(api, `/courses/${enc(courseId)}/courseWork?courseWorkStates=PUBLISHED&courseWorkStates=DRAFT`, 'courseWork');
  return ownOnly ? all.filter((w) => w.associatedWithDeveloper) : all;
}

export interface NewCourseWork { title: string; description?: string; maxPoints: number; linkUrl?: string; state?: 'PUBLISHED' | 'DRAFT' }

export function createCourseWork(api: ClassroomApi, courseId: string, w: NewCourseWork): Promise<GcCourseWork> {
  return call<GcCourseWork>(api, `/courses/${enc(courseId)}/courseWork`, {
    method: 'POST',
    body: {
      title: w.title.slice(0, 3000),
      ...(w.description ? { description: w.description.slice(0, 30000) } : {}),
      maxPoints: w.maxPoints,
      workType: 'ASSIGNMENT',
      state: w.state ?? 'PUBLISHED',
      ...(w.linkUrl ? { materials: [{ link: { url: w.linkUrl } }] } : {}),
    },
  });
}

export function listSubmissions(api: ClassroomApi, courseId: string, courseWorkId: string): Promise<GcSubmission[]> {
  return paged<GcSubmission>(api, `/courses/${enc(courseId)}/courseWork/${enc(courseWorkId)}/studentSubmissions`, 'studentSubmissions');
}

export function patchGrade(api: ClassroomApi, courseId: string, courseWorkId: string, submissionId: string, grade: number, mode: 'draft' | 'assigned' = 'assigned'): Promise<GcSubmission> {
  const mask = mode === 'draft' ? 'draftGrade' : 'assignedGrade,draftGrade';
  return call<GcSubmission>(api, `/courses/${enc(courseId)}/courseWork/${enc(courseWorkId)}/studentSubmissions/${enc(submissionId)}?updateMask=${mask}`, {
    method: 'PATCH',
    body: mode === 'draft' ? { draftGrade: grade } : { assignedGrade: grade, draftGrade: grade },
  });
}

export interface GradeToPush { googleUserId: string; grade: number; /** Để hiện kết quả. */ label?: string }
export interface GradePushResult { googleUserId: string; label?: string; ok: boolean; grade?: number; error?: string }

/**
 * Đẩy điểm cho nhiều HS: đọc danh sách bài nộp một lần, sửa điểm từng em; một em lỗi không dừng các em khác.
 * Lỗi 403 "bài không do ứng dụng tạo" áp dụng cho cả bài → dừng sớm, các em còn lại nhận cùng lỗi (không gọi thêm).
 */
export async function pushGrades(api: ClassroomApi, courseId: string, courseWorkId: string, grades: GradeToPush[], mode: 'draft' | 'assigned' = 'assigned'): Promise<GradePushResult[]> {
  const subs = await listSubmissions(api, courseId, courseWorkId);
  const byUser = new Map(subs.map((s) => [s.userId, s]));
  const out: GradePushResult[] = [];
  let fatal: string | null = null;
  for (const g of grades) {
    const base = { googleUserId: g.googleUserId, ...(g.label ? { label: g.label } : {}) };
    if (fatal) { out.push({ ...base, ok: false, error: fatal }); continue; }
    const sub = byUser.get(g.googleUserId);
    if (!sub) { out.push({ ...base, ok: false, error: 'Em này không có trong bài tập trên Classroom (chưa vào lớp hoặc bài không giao cho em).' }); continue; }
    try {
      await patchGrade(api, courseId, courseWorkId, sub.id, g.grade, mode);
      out.push({ ...base, ok: true, grade: g.grade });
    } catch (e) {
      const err = e instanceof ClassroomError ? e : new ClassroomError(String(e), 0);
      out.push({ ...base, ok: false, error: err.message });
      if (err.status === 401 || (err.status === 403 && /ProjectPermissionDenied/i.test(err.reason ?? ''))) fatal = err.message;
    }
  }
  return out;
}

/** Link "Chia sẻ lên Classroom" (không cần cấu hình, không cần API): mở trang chia sẻ của Google. */
export function classroomShareUrl(url: string, title?: string): string {
  return `https://classroom.google.com/share?url=${encodeURIComponent(url)}${title ? `&title=${encodeURIComponent(title)}` : ''}`;
}
