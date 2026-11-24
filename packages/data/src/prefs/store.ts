import type { DataSource } from '@openedu/contracts';
import { getSupabaseClient, type V2Client } from '../supabase/client';

export interface PrefStore {
  /** Giá trị đã lưu (null = chưa có). `synced`: false khi chỉ đọc được bản trên trình duyệt. */
  get(key: string): Promise<{ value: unknown; synced: boolean }>;
  /** Ghi (null = xoá). Trả về true nếu đã lưu lên máy chủ. */
  set(key: string, value: unknown): Promise<boolean>;
}

/** Khoá hợp lệ: chữ thường, số, dấu chấm, gạch — tối đa 120 kí tự (khớp CHECK của SQL 18). */
export const prefKeyOk = (key: string): boolean => /^[a-z0-9][a-z0-9._-]{0,119}$/.test(key);

const LS = 'oe.pref.';
export function localGet(userId: string, key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(`${LS}${userId}.${key}`);
    return raw == null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}
export function localSet(userId: string, key: string, value: unknown): void {
  try {
    if (value == null) globalThis.localStorage?.removeItem(`${LS}${userId}.${key}`);
    else globalThis.localStorage?.setItem(`${LS}${userId}.${key}`, JSON.stringify(value));
  } catch {
    /* chế độ riêng tư / đầy bộ nhớ: bỏ qua */
  }
}

class LocalPrefStore implements PrefStore {
  constructor(private userId: () => Promise<string>) {}
  async get(key: string) { return { value: localGet(await this.userId(), key), synced: false }; }
  async set(key: string, value: unknown) { localSet(await this.userId(), key, value); return false; }
}

interface PgError { message?: string; code?: string }
/** Bảng chưa có (chưa chạy SQL 18) hoặc lỗi mạng → dùng bản trên trình duyệt. */
const fallbackable = (e: PgError | null | undefined): boolean =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /user_prefs|schema cache|does not exist|Failed to fetch|NetworkError/i.test(e.message ?? ''));

class SupabasePrefStore implements PrefStore {
  constructor(private clientP: Promise<V2Client>) {}
  private async uid(sb: V2Client): Promise<string> {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('Chưa đăng nhập.');
    return id;
  }
  async get(key: string) {
    const sb = await this.clientP;
    const uid = await this.uid(sb);
    try {
      const { data, error } = await sb.from('user_prefs').select('value').eq('user_id', uid).eq('key', key).maybeSingle();
      if (error) throw error;
      const value = (data as { value?: unknown } | null)?.value ?? null;
      localSet(uid, key, value);
      return { value, synced: true };
    } catch (e) {
      if (!fallbackable(e as PgError)) throw e;
      return { value: localGet(uid, key), synced: false };
    }
  }
  async set(key: string, value: unknown) {
    const sb = await this.clientP;
    const uid = await this.uid(sb);
    localSet(uid, key, value);
    try {
      const { error } = value == null
        ? await sb.from('user_prefs').delete().eq('user_id', uid).eq('key', key)
        : await sb.from('user_prefs').upsert({ user_id: uid, key, value }, { onConflict: 'user_id,key' });
      if (error) throw error;
      return true;
    } catch (e) {
      if (!fallbackable(e as PgError)) throw e;
      return false;
    }
  }
}

const cache = new WeakMap<DataSource, PrefStore>();
export function getPrefStore(ds: DataSource, userId: () => Promise<string>): PrefStore {
  let s = cache.get(ds);
  if (!s) {
    s = ds.mode === 'demo' ? new LocalPrefStore(userId) : new SupabasePrefStore(getSupabaseClient());
    cache.set(ds, s);
  }
  return s;
}
