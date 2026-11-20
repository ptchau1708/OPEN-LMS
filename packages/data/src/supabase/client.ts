/**
 * Tạo Supabase client lười (tải @supabase/supabase-js khi cần) để chế độ demo không phải tải thư viện này.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { readEnv } from '../env';

/**
 * Không có kiểu Database sinh sẵn cho schema v2 nên dùng `any` cho tham số kiểu của client
 * (bắt buộc: supabase-js cần một kiểu Database; hàng đọc ra được đổi kiểu ở mapping.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type V2Client = SupabaseClient<any, 'v2', any>;

let clientPromise: Promise<V2Client> | null = null;

export function getSupabaseClient(url = readEnv('VITE_SUPABASE_URL'), anonKey = readEnv('VITE_SUPABASE_ANON_KEY')): Promise<V2Client> {
  if (!url || !anonKey) return Promise.reject(new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY.'));
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ createClient }) => createClient<any, 'v2'>(url, anonKey, { db: { schema: 'v2' }, auth: { persistSession: true, autoRefreshToken: true } }) as V2Client,
    );
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}
