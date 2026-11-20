/**
 * Edge Function `school-admin` — Phase 5 (docs/PHASE5_API.md). Việc cần quyền Auth admin (service role):
 *
 *   { action: 'register-parent', login, password, name, code, relation? }   (KHÔNG cần đăng nhập)
 *       Kiểm tra mã liên kết TRƯỚC, rồi tạo tài khoản phụ huynh (email hoặc <SĐT>@parent.<miền>, đã xác nhận),
 *       gọi v2.redeem_guardian_code thay phụ huynh. Mã sai → không tạo tài khoản. → { ok, userId }
 *   { action: 'create-teacher', name, username?, password? }                (admin)  → AccountSlip
 *   { action: 'create-students', classId, names: string[] }                 (admin)  → { slips: AccountSlip[] }
 *   { action: 'reset-password', userId }                                    (admin; GV cho HS lớp mình) → AccountSlip
 *
 * Mật khẩu chỉ trả về một lần trong phản hồi (để in phiếu), không lưu dạng chữ ở đâu cả.
 * Miền email HS/GV: STUDENT_EMAIL_DOMAIN (mặc định openlms.edu) — trùng VITE_STUDENT_EMAIL_DOMAIN của app.
 * config.toml: verify_jwt = false (register-parent không có JWT); các action khác tự kiểm tra bằng requireCaller.
 */
import { HttpError, isObject, readJsonObject, serveJson } from '../_shared/http.ts';
import { adminClient, fromPgError, requireCaller } from '../_shared/supabase.ts';

const DOMAIN = (Deno.env.get('STUDENT_EMAIL_DOMAIN') ?? 'openlms.edu').toLowerCase();
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function givenName(full: string): string {
  const w = full.trim().split(/\s+/);
  for (let i = w.length - 1; i >= 0; i--) { const s = fold(w[i]); if (s) return s.slice(0, 12); }
  return 'hs';
}
function password(): string {
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  let s = String(1 + (a[0] % 9));
  for (let i = 1; i < 6; i++) s += String(a[i] % 10);
  return s === '123456' || /^(\d)\1{5}$/.test(s) ? password() : s;
}
function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

async function usernameTaken(u: string): Promise<boolean> {
  const { data, error } = await adminClient().from('profiles').select('id').eq('username', u).maybeSingle();
  if (error) throw fromPgError(error);
  return !!data;
}

async function createAuthUser(email: string, pw: string, name: string, app: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email, password: pw, email_confirm: true, user_metadata: { name }, app_metadata: app,
  });
  if (error || !data.user) {
    if (/already|exists|registered/i.test(error?.message ?? '')) throw new HttpError(409, 'Tài khoản này đã có trên hệ thống.', 'exists');
    console.error('createUser', error);
    throw new HttpError(500, 'Chưa tạo được tài khoản, thử lại sau nhé.', 'auth');
  }
  return data.user.id;
}

async function registerParent(b: Record<string, unknown>) {
  const raw = str(b.login, 120);
  const name = str(b.name, 80);
  const pw = typeof b.password === 'string' ? b.password : '';
  const code = str(b.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!name) throw new HttpError(400, 'Bố mẹ nhập tên hiển thị nhé.', 'invalid');
  if (pw.length < 6 || pw.length > 72) throw new HttpError(400, 'Mật khẩu cần 6–72 kí tự.', 'invalid');
  let login: string;
  if (raw.includes('@')) {
    login = raw.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) throw new HttpError(400, 'Email chưa đúng dạng.', 'invalid');
  } else {
    login = raw.replace(/[\s.\-()]/g, '').replace(/^\+84/, '0');
    if (!/^0\d{9}$/.test(login)) throw new HttpError(400, 'Số điện thoại cần 10 chữ số, bắt đầu bằng 0.', 'invalid');
  }
  if (!CODE_RE.test(code)) throw new HttpError(400, 'Mã chưa đúng. Bố mẹ kiểm tra lại 8 kí tự trên phiếu nhé.', 'invalid');
  const db = adminClient();
  const { data: c, error } = await db.from('guardian_codes').select('code, used_at, revoked_at, expires_at').eq('code', code).maybeSingle();
  if (error) throw fromPgError(error);
  const row = c as { used_at: string | null; revoked_at: string | null; expires_at: string } | null;
  if (!row || row.used_at || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) {
    throw new HttpError(400, !row ? 'Mã chưa đúng. Bố mẹ kiểm tra lại 8 kí tự trên phiếu nhé.' : row.used_at ? 'Mã này đã được dùng. Xin nhờ thầy cô cấp mã mới.' : 'Mã đã hết hạn hoặc bị thu hồi. Xin nhờ thầy cô cấp mã mới.', 'invalid_code');
  }
  if (await usernameTaken(login)) throw new HttpError(409, 'Email / số điện thoại này đã có tài khoản. Bố mẹ đăng nhập rồi nhập mã nhé.', 'exists');
  const email = login.includes('@') ? login : `${login}@parent.${DOMAIN}`;
  const id = await createAuthUser(email, pw, name, { role: 'parent', username: login });
  const { error: re } = await db.rpc('redeem_guardian_code', { p_code: code, p_relation: str(b.relation, 30) || null, p_parent: id });
  if (re) {
    await db.auth.admin.deleteUser(id).catch(() => undefined);
    throw fromPgError(re);
  }
  return { ok: true, userId: id };
}

async function requireAdmin(req: Request) {
  const c = await requireCaller(req);
  if (c.role !== 'admin') throw new HttpError(403, 'Chỉ quản trị trường mới làm được việc này.', 'forbidden');
  return c;
}

async function createTeacher(b: Record<string, unknown>) {
  const name = str(b.name, 80);
  if (!name) throw new HttpError(400, 'Nhập họ tên giáo viên.', 'invalid');
  const words = name.split(/\s+/).map(fold).filter(Boolean);
  let username = str(b.username, 64).toLowerCase().replace(/\s+/g, '');
  if (!username) {
    const base = words[words.length - 1] + words.slice(0, -1).map((w) => w[0]).join('');
    username = base;
    for (let i = 2; await usernameTaken(username); i++) username = `${base}${i}`;
  } else if (await usernameTaken(username)) throw new HttpError(409, `Tên đăng nhập “${username}” đã có người dùng.`, 'exists');
  const pw = str(b.password, 72) || password();
  if (pw.length < 6) throw new HttpError(400, 'Mật khẩu cần ít nhất 6 kí tự.', 'invalid');
  const email = username.includes('@') ? username : `${username}@${DOMAIN}`;
  const id = await createAuthUser(email, pw, name, { role: 'teacher', username: username.split('@')[0] });
  return { userId: id, role: 'teacher', name, username, password: pw };
}

async function createStudents(req: Request, b: Record<string, unknown>) {
  const caller = await requireCaller(req);
  const classId = str(b.classId, 128);
  const names = (Array.isArray(b.names) ? b.names : []).map((n) => str(n, 80)).filter(Boolean);
  if (!names.length) throw new HttpError(400, 'Danh sách trống. Dán mỗi dòng một họ tên nhé.', 'invalid');
  if (names.length > 60) throw new HttpError(400, 'Mỗi lần tạo tối đa 60 em.', 'invalid');
  const db = adminClient();
  const { data: cls, error } = await db.from('classes').select('id, name, grade').eq('id', classId).maybeSingle();
  if (error) throw fromPgError(error);
  if (!cls) throw new HttpError(404, 'Không tìm thấy lớp này.', 'not_found');
  const { data: owner } = await db.from('classes').select('teacher_id').eq('id', classId).maybeSingle();
  const isOwner = caller.role === 'teacher' && (owner as { teacher_id: string | null } | null)?.teacher_id === caller.id;
  if (caller.role !== 'admin' && !isOwner) throw new HttpError(403, 'Thầy cô chỉ tạo học sinh cho lớp mình chủ nhiệm.', 'forbidden');
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('role', 'student');
  const c = cls as { id: string; name: string; grade: number };
  const clsSlug = fold(c.name) || 'lop';
  let n = (count ?? 0) + 1;
  const slips = [];
  for (const name of names) {
    const base = givenName(name) + clsSlug;
    let k = n;
    let u = `${base}${k}`;
    while (await usernameTaken(u)) u = `${base}${++k}`;
    const pw = password();
    const id = await createAuthUser(`${u}@${DOMAIN}`, pw, name, { role: 'student', username: u, grade: c.grade, class_id: c.id });
    const { error: me } = await db.from('class_members').upsert({ class_id: c.id, user_id: id, role: 'student' });
    if (me) throw fromPgError(me);
    slips.push({ userId: id, role: 'student', name, username: u, password: pw, classId: c.id, className: c.name });
    n++;
  }
  return { slips };
}

async function resetPassword(req: Request, b: Record<string, unknown>) {
  const caller = await requireCaller(req);
  const userId = str(b.userId, 64);
  const db = adminClient();
  const { data: p, error } = await db.from('profiles').select('id, role, name, username, class_id, classes:classes!profiles_class_id_fkey(name, teacher_id)').eq('id', userId).maybeSingle();
  if (error) throw fromPgError(error);
  if (!p) throw new HttpError(404, 'Không tìm thấy tài khoản này.', 'not_found');
  const u = p as unknown as { id: string; role: string; name: string; username: string | null; class_id: string | null; classes: { name: string; teacher_id: string | null } | null };
  if (u.role === 'parent') throw new HttpError(400, 'Phụ huynh tự đặt lại mật khẩu bằng email / số điện thoại.', 'invalid');
  const ok = caller.role === 'admin' || (caller.role === 'teacher' && u.role === 'student' && u.classes?.teacher_id === caller.id);
  if (!ok) throw new HttpError(403, 'Thầy cô chỉ đặt lại mật khẩu cho học sinh lớp mình.', 'forbidden');
  const pw = password();
  const { error: ue } = await db.auth.admin.updateUserById(u.id, { password: pw });
  if (ue) throw new HttpError(500, 'Chưa đặt lại được mật khẩu.', 'auth');
  return { userId: u.id, role: u.role, name: u.name, username: u.username ?? '', password: pw, ...(u.class_id && u.role === 'student' ? { classId: u.class_id, className: u.classes?.name } : {}) };
}

serveJson(async (req) => {
  const b = await readJsonObject(req, 64_000);
  if (!isObject(b)) throw new HttpError(400, 'Yêu cầu không hợp lệ.', 'invalid');
  switch (b.action) {
    case 'register-parent': return registerParent(b);
    case 'create-teacher': await requireAdmin(req); return createTeacher(b);
    case 'create-students': return createStudents(req, b);
    case 'reset-password': return resetPassword(req, b);
    default: throw new HttpError(400, 'Thao tác không hỗ trợ.', 'invalid');
  }
});
