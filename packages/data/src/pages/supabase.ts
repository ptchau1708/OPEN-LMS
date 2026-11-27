/** Trang nhúng + Trang học — Supabase (migration 20261121000001_v2_embed_pages_xapi.sql). ⚠ Chưa chạy với project thật. */
import { getSupabaseClient, type V2Client } from '../supabase/client';
import type { ClassPage, ClassPageInput, EmbedSite, PagesSource } from './types';

interface PgError { message: string; code?: string }
function fail(e: PgError, vi: string): never {
  if (e.code === '23505') throw new Error('Trang này đã có trong danh sách.');
  if (e.code === '23514') throw new Error('Địa chỉ chưa đúng: chỉ ghi phần đầu, https://… (không có đường dẫn).');
  if (e.code === '42501') throw new Error('Thầy/cô chưa có quyền làm việc này.');
  throw new Error(e.message && /[À-ỹ]/.test(e.message) ? e.message : vi);
}
interface SiteRow { origin: string; name: string; builtin: boolean; added_by: string | null; created_at: string }
interface PageRow { id: string; class_id: string; title: string; description: string; kind: ClassPage['kind']; url: string | null; app_id: string | null; lti: ClassPage['lti'] | null; open_in: 'iframe' | 'window'; position: number; hidden: boolean; created_at: string; parent_id?: string | null; body?: string | null }
const toPage = (r: PageRow): ClassPage => ({ id: r.id, classId: r.class_id, title: r.title, description: r.description, kind: r.kind, url: r.url, appId: r.app_id, lti: r.lti ?? {}, openIn: r.open_in, position: r.position, hidden: r.hidden, createdAt: r.created_at, parentId: r.parent_id ?? null, body: r.body ?? '' });
const OLD_COLS = 'id,class_id,title,description,kind,url,app_id,lti,open_in,position,hidden,created_at';
/** Cột mới (SQL 14); CSDL chưa nâng cấp → đọc cột cũ (trang phẳng như trước). */
let PAGE_COLS = `${OLD_COLS},parent_id,body`;
const missingCol = (e: PgError | null) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /parent_id|body/.test(e.message ?? '') && /column/i.test(e.message ?? ''));

export class SupabasePagesSource implements PagesSource {
  private clientP: Promise<V2Client>;
  constructor(client?: V2Client) { this.clientP = client ? Promise.resolve(client) : getSupabaseClient(); }

  async listEmbedSites(): Promise<EmbedSite[]> {
    const sb = await this.clientP;
    const { data, error } = await sb.from('embed_sites').select('origin,name,builtin,added_by,created_at').order('builtin', { ascending: false }).order('created_at');
    if (error) fail(error, 'Chưa tải được danh sách trang nhúng.');
    return ((data ?? []) as SiteRow[]).map((r) => ({ origin: r.origin, name: r.name, builtin: r.builtin, addedBy: r.added_by, createdAt: r.created_at }));
  }
  async addEmbedSite(origin: string, name: string): Promise<void> {
    const sb = await this.clientP;
    const { data: s } = await sb.auth.getSession();
    const { error } = await sb.from('embed_sites').insert({ origin, name: name.trim().slice(0, 80), added_by: s.session?.user.id ?? null });
    if (error) fail(error, 'Chưa thêm được trang.');
  }
  async removeEmbedSite(origin: string): Promise<void> {
    const sb = await this.clientP;
    const { data, error } = await sb.from('embed_sites').delete().eq('origin', origin).select('origin');
    if (error) fail(error, 'Chưa bớt được trang.');
    if (!data?.length) throw new Error('Thầy/cô chưa có quyền bớt trang này.');
  }
  async listClassPages(classId: string): Promise<ClassPage[]> {
    const sb = await this.clientP;
    let { data, error } = await sb.from('class_pages').select(PAGE_COLS).eq('class_id', classId).order('position').order('created_at');
    if (missingCol(error) && PAGE_COLS !== OLD_COLS) { PAGE_COLS = OLD_COLS; ({ data, error } = await sb.from('class_pages').select(PAGE_COLS).eq('class_id', classId).order('position').order('created_at')); }
    if (error) fail(error, 'Chưa tải được Trang học.');
    return ((data ?? []) as unknown as PageRow[]).map(toPage);
  }
  async getClassPage(id: string): Promise<ClassPage | null> {
    const sb = await this.clientP;
    let { data, error } = await sb.from('class_pages').select(PAGE_COLS).eq('id', id).maybeSingle();
    if (missingCol(error) && PAGE_COLS !== OLD_COLS) { PAGE_COLS = OLD_COLS; ({ data, error } = await sb.from('class_pages').select(PAGE_COLS).eq('id', id).maybeSingle()); }
    if (error) fail(error, 'Chưa tải được trang.');
    return data ? toPage(data as unknown as PageRow) : null;
  }
  async saveClassPage(i: ClassPageInput): Promise<ClassPage> {
    const sb = await this.clientP;
    const row: Record<string, unknown> = { class_id: i.classId, title: i.title.trim(), description: i.description.trim(), kind: i.kind, url: i.url, app_id: i.appId, open_in: i.openIn, hidden: i.hidden };
    if (i.position !== undefined) row.position = i.position;
    // Cột cây trang (SQL 14): chỉ gửi khi có dùng, để CSDL chưa nâng cấp vẫn lưu được trang thường.
    if (i.parentId !== undefined && (i.parentId !== null || i.id)) row.parent_id = i.parentId;
    if (i.body !== undefined && (i.body || i.id)) row.body = i.body;
    if (i.kind === 'section' && PAGE_COLS === OLD_COLS) throw new Error('Cần chạy tệp SQL 14 (trang con) trên Supabase trước khi tạo trang nội dung.');
    if (i.id) {
      const { data, error } = await sb.from('class_pages').update(row).eq('id', i.id).select(PAGE_COLS).maybeSingle();
      if (error) fail(error, 'Chưa lưu được trang.');
      if (!data) throw new Error('Thầy/cô chưa có quyền sửa trang này.');
      return toPage(data as unknown as PageRow);
    }
    const { data: s } = await sb.auth.getSession();
    const { data, error } = await sb.from('class_pages').insert({ ...row, created_by: s.session?.user.id ?? null }).select(PAGE_COLS).single();
    if (error) fail(error, 'Chưa thêm được trang.');
    return toPage(data as unknown as PageRow);
  }
  async movePages(moves: { id: string; position: number }[]): Promise<void> {
    const sb = await this.clientP;
    for (const m of moves) {
      const { error } = await sb.from('class_pages').update({ position: m.position }).eq('id', m.id);
      if (error) fail(error, 'Chưa đổi được thứ tự.');
    }
  }
  async deleteClassPage(id: string): Promise<void> {
    const sb = await this.clientP;
    const { error } = await sb.from('class_pages').delete().eq('id', id);
    if (error) fail(error, 'Chưa xóa được trang.');
  }
}
