/**
 * Ngân hàng nhận xét của thầy cô (gợi ý khi nhập nhận xét TT27 …).
 * - Supabase: bảng v2.comment_bank + RPC bank_add_comments (SQL 20). Chưa chạy SQL 20 → lưu trên trình duyệt.
 * - Demo: lưu trên trình duyệt.
 */
import type { DataSource } from '@openedu/contracts';
import { foldVietnamese } from '../text';
import { getSupabaseClient, type V2Client } from '../supabase/client';

export type BankLevel = 'T' | 'H' | 'C' | 'Đ';
export interface BankComment {
  id: string;
  /** Phạm vi: 'tt27:<mã môn>' | 'tt27:chung' … */
  scope: string;
  level?: BankLevel;
  text: string;
  /** Số lần đã dùng (tăng khi lưu lại cùng câu). */
  uses: number;
  /** Chia sẻ cho thầy cô khác trong trường. */
  shared: boolean;
  ownerId: string;
  /** Câu của chính mình (sửa / xoá được). */
  mine: boolean;
  updatedAt: string;
}
export interface BankAdd { scope: string; level?: BankLevel; text: string }

export interface CommentBankSource {
  list(): Promise<{ items: BankComment[]; synced: boolean }>;
  /** Lưu nhiều câu (trùng → tăng số lần dùng). */
  add(items: BankAdd[]): Promise<number>;
  update(id: string, patch: { text?: string; level?: BankLevel | null; shared?: boolean }): Promise<void>;
  remove(id: string): Promise<void>;
}

const SCOPE = /^[a-z0-9][a-z0-9:._-]{0,59}$/;
export const cleanBankText = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 1000);
const keyOf = (scope: string, text: string) => `${scope}|${foldVietnamese(text).toLowerCase()}`;
const rid = () => `cb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------- trên trình duyệt ------------------------------- */
class LocalBank implements CommentBankSource {
  constructor(private uid: () => Promise<string>, private synced = false) {}
  private k(u: string) { return `oe.commentbank.${u}`; }
  private read(u: string): BankComment[] { try { return JSON.parse(globalThis.localStorage?.getItem(this.k(u)) ?? '[]') as BankComment[]; } catch { return []; } }
  private write(u: string, l: BankComment[]) { try { globalThis.localStorage?.setItem(this.k(u), JSON.stringify(l.slice(0, 3000))); } catch { /* bỏ qua */ } }
  async list() { const u = await this.uid(); return { items: this.read(u).map((x) => ({ ...x, mine: true, ownerId: u })), synced: this.synced }; }
  async add(items: BankAdd[]) {
    const u = await this.uid();
    const list = this.read(u);
    const idx = new Map(list.map((x, i) => [keyOf(x.scope, x.text), i]));
    let n = 0;
    for (const it of items) {
      const text = cleanBankText(it.text);
      if (!text || !SCOPE.test(it.scope)) continue;
      const k = keyOf(it.scope, text);
      const now = new Date().toISOString();
      const i = idx.get(k);
      if (i !== undefined) { const o = list[i]!; list[i] = { ...o, uses: o.uses + 1, level: it.level ?? o.level, updatedAt: now }; }
      else { idx.set(k, list.length); list.push({ id: rid(), scope: it.scope, ...(it.level ? { level: it.level } : {}), text, uses: 1, shared: false, ownerId: u, mine: true, updatedAt: now }); }
      n++;
    }
    this.write(u, list);
    return n;
  }
  async update(id: string, patch: { text?: string; level?: BankLevel | null; shared?: boolean }) {
    const u = await this.uid();
    this.write(u, this.read(u).map((x) => {
      if (x.id !== id) return x;
      const n: BankComment = { ...x, ...(patch.text !== undefined ? { text: cleanBankText(patch.text) } : {}), ...(patch.shared !== undefined ? { shared: patch.shared } : {}), updatedAt: new Date().toISOString() };
      if (patch.level === null) delete n.level; else if (patch.level) n.level = patch.level;
      return n;
    }));
  }
  async remove(id: string) { const u = await this.uid(); this.write(u, this.read(u).filter((x) => x.id !== id)); }
}

/* ------------------------------------ supabase ------------------------------------ */
interface PgError { message?: string; code?: string }
const missing = (e: PgError | null | undefined) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || /comment_bank|bank_add_comments|schema cache/i.test(e.message ?? ''));
type Row = Record<string, unknown>;

class SupabaseBank implements CommentBankSource {
  private local: LocalBank;
  constructor(private clientP: Promise<V2Client>) { this.local = new LocalBank(async () => this.uid(await this.clientP)); }
  private async uid(sb: V2Client): Promise<string> {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('Chưa đăng nhập.');
    return id;
  }
  private fallback = false;
  async list() {
    const sb = await this.clientP;
    const me = await this.uid(sb);
    const { data, error } = await sb.from('comment_bank').select('id,owner_id,scope,level,text,uses,shared,updated_at').order('uses', { ascending: false }).limit(5000);
    if (error) {
      if (missing(error)) { this.fallback = true; return this.local.list(); }
      throw new Error('Chưa tải được ngân hàng nhận xét.');
    }
    this.fallback = false;
    return {
      synced: true,
      items: ((data ?? []) as Row[]).map((r) => ({
        id: String(r.id), scope: String(r.scope), ...(r.level ? { level: r.level as BankLevel } : {}), text: String(r.text), uses: Number(r.uses ?? 1),
        shared: !!r.shared, ownerId: String(r.owner_id), mine: r.owner_id === me, updatedAt: String(r.updated_at ?? ''),
      })),
    };
  }
  async add(items: BankAdd[]) {
    const clean = items.map((x) => ({ scope: x.scope, level: x.level ?? null, text: cleanBankText(x.text) })).filter((x) => x.text && SCOPE.test(x.scope)).slice(0, 500);
    if (!clean.length) return 0;
    if (this.fallback) return this.local.add(items);
    const sb = await this.clientP;
    const { data, error } = await sb.rpc('bank_add_comments', { p: clean });
    if (error) {
      if (missing(error)) { this.fallback = true; return this.local.add(items); }
      throw new Error(error.message && /[À-ỹ]/.test(error.message) ? error.message : 'Chưa lưu được vào ngân hàng nhận xét.');
    }
    return Number(data ?? 0);
  }
  async update(id: string, patch: { text?: string; level?: BankLevel | null; shared?: boolean }) {
    if (this.fallback || id.startsWith('cb-')) return this.local.update(id, patch);
    const sb = await this.clientP;
    const row: Row = {};
    if (patch.text !== undefined) row.text = cleanBankText(patch.text);
    if (patch.level !== undefined) row.level = patch.level;
    if (patch.shared !== undefined) row.shared = patch.shared;
    const { error } = await sb.from('comment_bank').update(row).eq('id', id);
    if (error) throw new Error(/duplicate|unique/i.test(error.message ?? '') ? 'Câu này đã có trong ngân hàng.' : 'Chưa sửa được câu nhận xét.');
  }
  async remove(id: string) {
    if (this.fallback || id.startsWith('cb-')) return this.local.remove(id);
    const sb = await this.clientP;
    const { error } = await sb.from('comment_bank').delete().eq('id', id);
    if (error) throw new Error('Chưa xoá được câu nhận xét.');
  }
}

const cache = new WeakMap<DataSource, CommentBankSource>();
export function getCommentBankSource(ds: DataSource): CommentBankSource {
  let s = cache.get(ds);
  if (!s) {
    s = ds.mode === 'demo'
      ? new LocalBank(async () => { const u = await ds.getCurrentUser(); if (!u) throw new Error('Chưa đăng nhập.'); return u.id; }, true)
      : new SupabaseBank(getSupabaseClient());
    cache.set(ds, s);
  }
  return s;
}

/**
 * Gợi ý câu nhận xét: cùng phạm vi; cùng mức xếp trước; khớp các chữ đang gõ (không dấu); dùng nhiều xếp trước.
 * Câu đang có trong ô (trùng hẳn) bị bỏ.
 */
export function suggestComments(list: readonly BankComment[], scope: string, opts: { level?: string; typed?: string; limit?: number } = {}): BankComment[] {
  const typed = foldVietnamese(opts.typed ?? '').toLowerCase().trim();
  const words = typed.split(/\s+/).filter((w) => w.length >= 2).slice(-4);
  const seen = new Set<string>();
  return list
    .filter((c) => c.scope === scope)
    .filter((c) => {
      const f = foldVietnamese(c.text).toLowerCase();
      if (f === typed || seen.has(f)) return false;
      seen.add(f);
      return !words.length || words.every((w) => f.includes(w));
    })
    .map((c) => ({ c, score: (opts.level && c.level === opts.level ? 1000 : opts.level && c.level ? -500 : 0) + c.uses * 10 + (c.mine ? 5 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 6)
    .map((x) => x.c);
}

/**
 * Câu nên tự lưu vào ngân hàng: bỏ câu quá ngắn (< 8 kí tự) và câu có tên riêng của học sinh (để gợi ý dùng được cho em khác).
 */
export function bankable(text: string, studentName?: string): boolean {
  const t = cleanBankText(text);
  if (t.length < 8) return false;
  if (!studentName) return true;
  // So khớp GIỮ DẤU: tên "An" không trùng chữ "ăn".
  const given = (studentName.trim().split(/\s+/).pop() ?? '').normalize('NFC').toLowerCase();
  if (given.length < 2) return true;
  const esc = given.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return !new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?=[^\\p{L}\\p{N}]|$)`, 'u').test(t.normalize('NFC').toLowerCase());
}
