/**
 * Danh mục mở — kĩ năng do thầy/cô sửa / thêm / ẩn / xoá.
 * - Supabase: cột custom / hidden / edit_* của v2.skills + RPC save_skill, delete_skill (SQL 19).
 *   Chưa chạy SQL 19: đọc trả về [] (dùng danh mục gốc), ghi báo cần chạy SQL 19.
 * - Demo: lưu trên trình duyệt (localStorage).
 */
import { builtinSkill, SKILL_BY_CODE, type DataSource, type Grade, type SkillOverride, type SubjectId } from '@openedu/contracts';
import { getSupabaseClient, type V2Client } from '../supabase/client';

export interface SkillInput {
  code: string;
  /** Chỉ khi thêm mới. */
  subject?: SubjectId;
  grade?: Grade;
  topic: string;
  text: string;
  short: string;
}

export interface CatalogSource {
  listSkillOverrides(): Promise<SkillOverride[]>;
  /** Thêm (mã chưa có) hoặc sửa chữ (mã đã có). */
  saveSkill(input: SkillInput): Promise<SkillOverride>;
  setSkillHidden(code: string, hidden: boolean): Promise<SkillOverride>;
  /** Kĩ năng gốc: bỏ phần đã sửa. */
  restoreSkill(code: string): Promise<SkillOverride>;
  /** Kĩ năng tự thêm chưa dùng → xoá hẳn; đã có dữ liệu hoặc kĩ năng gốc → ẩn. */
  deleteSkill(code: string): Promise<'deleted' | 'hidden'>;
}

const lim = (v: string, n: number) => v.trim().replace(/\s+/g, ' ').slice(0, n);
function validate(i: SkillInput): void {
  if (!/^[A-Z]+[1-5]\.[A-Z0-9-]+\.[A-Z0-9-]+$/.test(i.code)) throw new Error('Mã kĩ năng không hợp lệ.');
  if (!i.short.trim()) throw new Error('Thầy/cô nhập tên ngắn cho kĩ năng nhé.');
  if (!i.text.trim()) throw new Error('Thầy/cô nhập mô tả (yêu cầu cần đạt) nhé.');
  if (!i.topic.trim()) throw new Error('Thầy/cô nhập chủ đề / mạch nội dung nhé.');
}

/* ------------------------------- demo ------------------------------- */
const LS = 'oe.catalog.skills.demo';
class DemoCatalogSource implements CatalogSource {
  constructor(private ds: DataSource) {}
  private read(): SkillOverride[] {
    try { return JSON.parse(globalThis.localStorage?.getItem(LS) ?? '[]') as SkillOverride[]; } catch { return []; }
  }
  private write(list: SkillOverride[]): void {
    try { globalThis.localStorage?.setItem(LS, JSON.stringify(list)); } catch { /* bỏ qua */ }
  }
  private async me() {
    const u = await this.ds.getCurrentUser();
    if (!u || (u.role !== 'teacher' && u.role !== 'admin')) throw new Error('Chỉ thầy/cô mới sửa được danh mục kĩ năng.');
    return u;
  }
  private put(o: SkillOverride): SkillOverride {
    const list = this.read().filter((x) => x.code !== o.code);
    const keep = o.custom || o.hidden || o.editTopic || o.editText || o.editShort;
    this.write(keep ? [...list, o] : list);
    return o;
  }
  private cur(code: string): SkillOverride | undefined { return this.read().find((x) => x.code === code); }
  async listSkillOverrides() { return this.read(); }
  async saveSkill(i: SkillInput) {
    const me = await this.me();
    validate(i);
    const b = builtinSkill(i.code);
    const old = this.cur(i.code);
    if (b) {
      return this.put({ ...(old ?? { code: i.code }), editTopic: lim(i.topic, 120) === b.topic ? undefined : lim(i.topic, 120), editText: lim(i.text, 500) === b.text ? undefined : lim(i.text, 500), editShort: lim(i.short, 80) === b.short ? undefined : lim(i.short, 80) });
    }
    if (old?.custom) return this.put({ ...old, topic: lim(i.topic, 120), text: lim(i.text, 500), short: lim(i.short, 80) });
    if (SKILL_BY_CODE[i.code]) throw new Error('Mã kĩ năng đã có.');
    if (!i.subject || !i.grade) throw new Error('Thầy/cô chọn môn và lớp cho kĩ năng mới nhé.');
    return this.put({ code: i.code, subject: i.subject, grade: i.grade, topic: lim(i.topic, 120), text: lim(i.text, 500), short: lim(i.short, 80), custom: true, ownerId: me.id });
  }
  async setSkillHidden(code: string, hidden: boolean) {
    await this.me();
    const old = this.cur(code);
    if (!old && !builtinSkill(code)) throw new Error('Không tìm thấy kĩ năng này.');
    return this.put({ ...(old ?? { code }), hidden });
  }
  async restoreSkill(code: string) {
    await this.me();
    const old = this.cur(code) ?? { code };
    const { editTopic: _a, editText: _b, editShort: _c, ...rest } = old;
    void _a; void _b; void _c;
    return this.put(rest);
  }
  async deleteSkill(code: string): Promise<'deleted' | 'hidden'> {
    const me = await this.me();
    const old = this.cur(code);
    if (old?.custom) {
      if (me.role !== 'admin' && old.ownerId && old.ownerId !== me.id) throw new Error('Chỉ người thêm kĩ năng hoặc quản trị viên mới xoá được.');
      this.write(this.read().filter((x) => x.code !== code));
      return 'deleted';
    }
    await this.setSkillHidden(code, true);
    return 'hidden';
  }
}

/* ------------------------------ supabase ------------------------------ */
interface PgError { message?: string; code?: string }
const needSql = (e: PgError | null | undefined) =>
  !!e && (e.code === '42703' || e.code === '42883' || e.code === 'PGRST202' || /edit_text|save_skill|delete_skill|custom|schema cache|does not exist/i.test(e.message ?? ''));
type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
function fromRow(r: Row): SkillOverride {
  return {
    code: String(r.code),
    ...(r.custom ? { custom: true, subject: r.subject as SubjectId, grade: Number(r.grade) as Grade, topic: String(r.topic ?? ''), text: String(r.text ?? ''), short: String(r.short ?? '') } : {}),
    ...(r.hidden ? { hidden: true } : {}),
    ...(str(r.owner_id) ? { ownerId: str(r.owner_id) } : {}),
    ...(str(r.edit_topic) ? { editTopic: str(r.edit_topic) } : {}),
    ...(str(r.edit_text) ? { editText: str(r.edit_text) } : {}),
    ...(str(r.edit_short) ? { editShort: str(r.edit_short) } : {}),
  };
}
const COLS = 'code,subject,grade,topic,text,short,custom,hidden,owner_id,edit_topic,edit_text,edit_short';

class SupabaseCatalogSource implements CatalogSource {
  constructor(private clientP: Promise<V2Client>) {}
  private async rpc(fn: string, args: Row): Promise<Row> {
    const sb = await this.clientP;
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      if (needSql(error)) throw new Error('Cần chạy tệp SQL 19 (danh mục mở) trên Supabase trước.');
      throw new Error(error.message && /[À-ỹ]/.test(error.message) ? error.message : 'Chưa lưu được danh mục kĩ năng.');
    }
    return data as Row;
  }
  async listSkillOverrides() {
    const sb = await this.clientP;
    const { data, error } = await sb.from('skills').select(COLS).or('custom.eq.true,hidden.eq.true,edited_at.not.is.null');
    if (error) {
      if (needSql(error)) return [];
      throw new Error('Chưa tải được danh mục kĩ năng.');
    }
    return ((data ?? []) as Row[]).map(fromRow);
  }
  async saveSkill(i: SkillInput) {
    validate(i);
    return fromRow(await this.rpc('save_skill', { p: { code: i.code, subject: i.subject ?? null, grade: i.grade ?? null, topic: lim(i.topic, 120), text: lim(i.text, 500), short: lim(i.short, 80) } }));
  }
  async setSkillHidden(code: string, hidden: boolean) { return fromRow(await this.rpc('save_skill', { p: { code, hidden } })); }
  async restoreSkill(code: string) { return fromRow(await this.rpc('save_skill', { p: { code, restore: true } })); }
  async deleteSkill(code: string) { return (await this.rpc('delete_skill', { p_code: code })) as unknown as 'deleted' | 'hidden'; }
}

const cache = new WeakMap<DataSource, CatalogSource>();
export function getCatalogSource(ds: DataSource): CatalogSource {
  let s = cache.get(ds);
  if (!s) {
    s = ds.mode === 'demo' ? new DemoCatalogSource(ds) : new SupabaseCatalogSource(getSupabaseClient());
    cache.set(ds, s);
  }
  return s;
}
