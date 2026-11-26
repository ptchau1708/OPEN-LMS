/** Lỗi RPC của trang Phụ huynh / Thông báo → câu tiếng Việt (thiếu SQL 23 → hướng dẫn chạy tệp). */
interface PgError { message?: string; code?: string }
export function parentHubError(e: PgError, vi: string): Error {
  const m = e.message ?? '';
  if (e.code === 'PGRST202' || e.code === '42883' || (/parent_|notify_|push_/i.test(m) && /schema cache|does not exist|could not find/i.test(m))) {
    return new Error('Cần chạy tệp SQL 23 trên Supabase để dùng trang Phụ huynh và Thông báo.');
  }
  if (/[À-ỹ]/.test(m)) return new Error(m);
  return new Error(vi);
}
