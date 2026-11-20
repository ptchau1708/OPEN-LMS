/**
 * Cầu nối với app ngoài — nguồn Supabase (migration 20261117000002_v2_connect.sql).
 * ⚠ Đã kiểm thử pgTAP trên Postgres 16; chưa chạy với project Supabase thật.
 */
import { readEnv } from '../env';
import { getSupabaseClient, type V2Client } from '../supabase/client';
import type { ConnectApi, ConnectSource, ConnectToken, ExternalActivity, ExternalApp, ExternalAppInput, ExternalAppPublic } from './types';

interface PgError { message: string; code?: string }
function fail(e: PgError, vi: string): never {
  if (e.code === '23503') throw new Error('Ứng dụng này đã có dữ liệu của học sinh nên không xóa được. Hãy tắt nó đi.');
  if (e.code === '23505') throw new Error('Mã ứng dụng này đã có. Hãy chọn mã khác.');
  if (e.code === '23514') throw new Error('Mã, tên hoặc địa chỉ (origin) chưa đúng dạng.');
  if (e.message && /[À-ỹ]/.test(e.message)) throw new Error(e.message);
  throw new Error(e.message ? `${vi} (${e.message})` : vi);
}

interface AppRow { id: string; name: string; description: string; allowed_origins: string[]; enabled: boolean; created_at: string }

/** Còn dưới ngần này giây thì làm mới phiên trước khi trao token cho app ngoài. */
const MIN_TOKEN_LIFE_SEC = 600;

export class SupabaseConnectSource implements ConnectSource {
  private clientP: Promise<V2Client>;
  constructor(client?: V2Client | Promise<V2Client>, private api: ConnectApi | null = null) {
    this.clientP = client ? Promise.resolve(client) : getSupabaseClient();
  }

  async listApps(): Promise<ExternalApp[]> {
    const sb = await this.clientP;
    const { data, error } = await sb.from('external_apps').select('id,name,description,allowed_origins,enabled,created_at').order('created_at');
    if (error) fail(error, 'Chưa tải được danh sách ứng dụng.');
    return ((data ?? []) as AppRow[]).map((r) => ({ id: r.id, name: r.name, description: r.description, allowedOrigins: r.allowed_origins ?? [], enabled: r.enabled, createdAt: r.created_at }));
  }
  async saveApp(i: ExternalAppInput, isNew: boolean): Promise<void> {
    const sb = await this.clientP;
    const row = { name: i.name.trim(), description: i.description.trim(), allowed_origins: i.allowedOrigins, enabled: i.enabled };
    if (isNew) {
      const { data: s } = await sb.auth.getSession();
      const { error } = await sb.from('external_apps').insert({ id: i.id, ...row, created_by: s.session?.user.id ?? null });
      if (error) fail(error, 'Chưa thêm được ứng dụng.');
    } else {
      const { data, error } = await sb.from('external_apps').update(row).eq('id', i.id).select('id');
      if (error) fail(error, 'Chưa lưu được ứng dụng.');
      if (!data || data.length === 0) throw new Error('Chưa lưu được ứng dụng (chỉ quản trị viên được sửa).');
    }
  }
  async deleteApp(id: string): Promise<void> {
    const sb = await this.clientP;
    const { error } = await sb.from('external_apps').delete().eq('id', id);
    if (error) fail(error, 'Chưa xóa được ứng dụng.');
  }
  async getApp(id: string): Promise<ExternalAppPublic | null> {
    const sb = await this.clientP;
    const { data, error } = await sb.rpc('get_external_app', { p_id: id });
    if (error) fail(error, 'Chưa kiểm tra được ứng dụng.');
    return (data as ExternalAppPublic | null) ?? null;
  }
  async listActivities(userId: string, limit = 50): Promise<ExternalActivity[]> {
    const sb = await this.clientP;
    const { data, error } = await sb.rpc('list_external_activities', { p_user: userId, p_limit: limit });
    if (error) fail(error, 'Chưa tải được hoạt động ở ứng dụng khác.');
    return (data as ExternalActivity[] | null) ?? [];
  }
  async getAccess(): Promise<{ token: ConnectToken; api: ConnectApi } | null> {
    const sb = await this.clientP;
    const api = this.api ?? { url: (readEnv('VITE_SUPABASE_URL') ?? '').replace(/\/+$/, ''), anonKey: readEnv('VITE_SUPABASE_ANON_KEY') ?? '' };
    if (!api.url || !api.anonKey) return null;
    let { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    if ((session.expires_at ?? 0) - Date.now() / 1000 < MIN_TOKEN_LIFE_SEC) {
      const r = await sb.auth.refreshSession();
      if (r.error || !r.data.session) throw new Error('Phiên đăng nhập đã hết hạn. Em đăng nhập lại nhé.');
      session = r.data.session;
    }
    // Chỉ access token (sống ~1 giờ). KHÔNG trao refresh token.
    return { token: { accessToken: session.access_token, expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3000 }, api };
  }
}
