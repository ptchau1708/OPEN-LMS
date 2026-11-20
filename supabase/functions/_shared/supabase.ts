/**
 * Supabase client cho Edge Functions.
 * - adminClient(): service role, schema v2 (bỏ qua RLS — chỉ dùng sau khi đã kiểm tra quyền).
 * - requireCaller(req): xác thực JWT bằng client của người dùng (header Authorization) rồi đọc v2.profiles.
 * SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY được Supabase tự cấp cho mọi Edge Function.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

export type Role = 'student' | 'teacher' | 'admin' | 'parent';

export interface Caller {
  id: string;
  role: Role;
  grade: number | null;
  name: string;
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `Máy chủ thiếu cấu hình ${name}.`, 'config');
  return v;
}

function makeAdmin() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    db: { schema: 'v2' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof makeAdmin>;
let cachedAdmin: AdminClient | null = null;

export function adminClient(): AdminClient {
  if (!cachedAdmin) cachedAdmin = makeAdmin();
  return cachedAdmin;
}

interface PgErrorLike {
  message: string;
  code?: string;
}

/** Lỗi Postgres/PostgREST → HttpError (giữ nguyên thông báo tiếng Việt do RPC raise). */
export function fromPgError(e: PgErrorLike): HttpError {
  const code = e.code ?? '';
  if (code === '42501') return new HttpError(403, e.message, 'forbidden');
  if (code === 'P0002') return new HttpError(404, e.message, 'not_found');
  if (code === '22023' || code === 'P0001') return new HttpError(400, e.message, 'invalid');
  console.error('db error', e);
  return new HttpError(500, 'Máy chủ đang bận, em thử lại sau nhé.', 'db');
}

export async function requireCaller(req: Request): Promise<Caller> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'Em cần đăng nhập trước nhé.', 'unauthenticated');

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, 'Phiên đăng nhập đã hết hạn. Em đăng nhập lại nhé.', 'unauthenticated');
  }

  const { data: row, error: pe } = await adminClient()
    .from('profiles')
    .select('id, role, grade, name')
    .eq('id', data.user.id)
    .maybeSingle();
  if (pe) throw fromPgError(pe);
  if (!row) {
    throw new HttpError(403, 'Tài khoản chưa có hồ sơ trên hệ thống mới. Hãy báo thầy cô hoặc quản trị viên.', 'no_profile');
  }
  const p = row as { id: string; role: Role; grade: number | null; name: string | null };
  return { id: p.id, role: p.role, grade: p.grade, name: p.name ?? '' };
}

export function isStaff(c: Caller): boolean {
  return c.role === 'teacher' || c.role === 'admin';
}
