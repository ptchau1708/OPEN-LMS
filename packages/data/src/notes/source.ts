/**
 * Thông tin bổ sung của học sinh.
 * - Supabase: bảng v2.student_notes (SQL 20) — chỉ GV của em + quản trị đọc / ghi; phụ huynh thấy ghi chép được chia sẻ.
 * - Demo: lưu trên trình duyệt.
 */
import type { DataSource } from '@openedu/contracts';
import { getSupabaseClient, type V2Client } from '../supabase/client';
import { cleanNote, type NoteCategory, type NoteSource, type StudentNote, type StudentNoteInput } from './types';

export interface NotesSource {
  list(studentId: string): Promise<StudentNote[]>;
  save(n: StudentNoteInput): Promise<StudentNote>;
  remove(id: string): Promise<void>;
  /** Nhập nhiều ghi chép (từ Excel). */
  bulkCreate(list: StudentNoteInput[]): Promise<number>;
}

const rid = () => `sn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

class DemoNotes implements NotesSource {
  constructor(private ds: DataSource) {}
  private K = 'oe.student-notes.demo';
  private read(): StudentNote[] { try { return JSON.parse(globalThis.localStorage?.getItem(this.K) ?? '[]') as StudentNote[]; } catch { return []; } }
  private write(l: StudentNote[]) { globalThis.localStorage?.setItem(this.K, JSON.stringify(l)); }
  private async me() {
    const u = await this.ds.getCurrentUser();
    if (!u) throw new Error('Chưa đăng nhập.');
    return u;
  }
  private async staff() {
    const u = await this.me();
    if (u.role !== 'teacher' && u.role !== 'admin') throw new Error('Chỉ thầy/cô mới nhập thông tin bổ sung được.');
    return u;
  }
  async list(studentId: string) {
    const u = await this.me();
    const staff = u.role === 'teacher' || u.role === 'admin';
    return this.read().filter((n) => n.studentId === studentId && (staff || n.shareParent)).sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }
  async save(i: StudentNoteInput) {
    const u = await this.staff();
    const c = cleanNote(i);
    const list = this.read();
    const now = new Date().toISOString();
    const old = c.id ? list.find((x) => x.id === c.id) : undefined;
    const n: StudentNote = { ...c, id: old?.id ?? rid(), createdBy: old?.createdBy ?? u.id, createdAt: old?.createdAt ?? now, updatedAt: now };
    this.write(old ? list.map((x) => (x.id === n.id ? n : x)) : [...list, n]);
    return n;
  }
  async remove(id: string) { await this.staff(); this.write(this.read().filter((x) => x.id !== id)); }
  async bulkCreate(list: StudentNoteInput[]) { let k = 0; for (const n of list) { await this.save({ ...n, id: undefined }); k++; } return k; }
}

type Row = Record<string, unknown>;
const COLS = 'id,student_id,category,title,body,fields,note_date,source,source_name,share_parent,created_by,created_at,updated_at';
const fromRow = (r: Row): StudentNote => ({
  id: String(r.id), studentId: String(r.student_id), category: r.category as NoteCategory, title: String(r.title ?? ''), body: String(r.body ?? ''),
  fields: (r.fields && typeof r.fields === 'object' ? r.fields : {}) as Record<string, string>, date: String(r.note_date ?? '').slice(0, 10),
  source: (r.source as NoteSource) ?? 'tay', ...(r.source_name ? { sourceName: String(r.source_name) } : {}), shareParent: !!r.share_parent,
  ...(r.created_by ? { createdBy: String(r.created_by) } : {}), createdAt: String(r.created_at ?? ''), updatedAt: String(r.updated_at ?? ''),
});
const toRow = (n: StudentNoteInput): Row => ({
  student_id: n.studentId, category: n.category, title: n.title, body: n.body, fields: n.fields, note_date: n.date, source: n.source,
  source_name: n.sourceName ?? null, share_parent: n.shareParent,
});
interface PgError { message?: string; code?: string }
function fail(e: PgError, vi: string): never {
  if (e.code === '42P01' || e.code === 'PGRST205' || /student_notes|schema cache/i.test(e.message ?? '')) throw new Error('Cần chạy tệp SQL 20 trên Supabase để dùng Thông tin bổ sung.');
  if (e.code === '42501' || /row-level security/i.test(e.message ?? '')) throw new Error('Thầy/cô chỉ nhập thông tin cho học sinh lớp mình.');
  throw new Error(vi);
}

class SupabaseNotes implements NotesSource {
  constructor(private clientP: Promise<V2Client>) {}
  async list(studentId: string) {
    const sb = await this.clientP;
    const { data, error } = await sb.from('student_notes').select(COLS).eq('student_id', studentId).order('note_date', { ascending: false }).order('updated_at', { ascending: false });
    if (error) fail(error, 'Chưa tải được thông tin bổ sung.');
    return ((data ?? []) as Row[]).map(fromRow);
  }
  async save(i: StudentNoteInput) {
    const c = cleanNote(i);
    const sb = await this.clientP;
    const res = c.id
      ? await sb.from('student_notes').update(toRow(c)).eq('id', c.id).select(COLS).single()
      : await sb.from('student_notes').insert(toRow(c)).select(COLS).single();
    if (res.error) fail(res.error, 'Chưa lưu được ghi chép.');
    return fromRow(res.data as Row);
  }
  async remove(id: string) {
    const sb = await this.clientP;
    const { error } = await sb.from('student_notes').delete().eq('id', id);
    if (error) fail(error, 'Chưa xoá được ghi chép.');
  }
  async bulkCreate(list: StudentNoteInput[]) {
    const rows = list.map((n) => toRow(cleanNote(n)));
    const sb = await this.clientP;
    let k = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('student_notes').insert(rows.slice(i, i + 200));
      if (error) fail(error, `Chưa nhập được (đã nhập ${k} ghi chép).`);
      k += Math.min(200, rows.length - i);
    }
    return k;
  }
}

const cache = new WeakMap<DataSource, NotesSource>();
export function getNotesSource(ds: DataSource): NotesSource {
  let s = cache.get(ds);
  if (!s) { s = ds.mode === 'demo' ? new DemoNotes(ds) : new SupabaseNotes(getSupabaseClient()); cache.set(ds, s); }
  return s;
}
