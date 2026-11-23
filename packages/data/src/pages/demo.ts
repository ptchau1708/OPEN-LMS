/** Trang nhúng + Trang học — bản demo (localStorage, khóa `pages`). Mỗi app demo một origin nên không chung dữ liệu. */
import type { DataSource } from '@openedu/contracts';
import { createDefaultStorage, readJson, writeJson, type KVStorage } from '../storage';
import { EMBED_FRAME_ORIGINS_DEFAULT } from './defaults';
import { siteOrigin } from './rules';
import type { ClassPage, ClassPageInput, EmbedSite, PagesSource } from './types';

interface Store { sites: EmbedSite[]; pages: ClassPage[] }
interface DemoKv { schoolKv(): Promise<{ storage: KVStorage; now: () => Date; changed: () => void }> }

export class DemoPagesSource implements PagesSource {
  constructor(private ds: DataSource) {}
  /** App học sinh bọc DataSource bằng lớp ngoại tuyến (không có schoolKv) → dùng thẳng localStorage của origin. */
  private async kv() {
    const d = this.ds as unknown as Partial<DemoKv>;
    return typeof d.schoolKv === 'function' ? d.schoolKv() : { storage: createDefaultStorage(), now: () => new Date(), changed: () => undefined };
  }
  private async load(): Promise<{ s: Store; save: () => void; now: Date }> {
    const { storage, now } = await this.kv();
    const s = readJson<Store | null>(storage, 'pages', null) ?? { sites: EMBED_FRAME_ORIGINS_DEFAULT.map((x) => ({ ...x, builtin: true, createdAt: now().toISOString() })), pages: [] };
    return { s, save: () => writeJson(storage, 'pages', s), now: now() };
  }
  private async staff() {
    const me = await this.ds.getCurrentUser();
    if (!me || (me.role !== 'teacher' && me.role !== 'admin')) throw new Error('Chỉ giáo viên hoặc quản trị mới làm được việc này.');
    return me;
  }
  async listEmbedSites() { return (await this.load()).s.sites; }
  async addEmbedSite(origin: string, name: string) {
    const me = await this.staff();
    const o = siteOrigin(origin);
    if (!o || o !== origin) throw new Error('Địa chỉ chưa đúng: chỉ ghi phần đầu, ví dụ https://doc.truong.edu.vn');
    const { s, save, now } = await this.load();
    if (s.sites.some((x) => x.origin === o)) throw new Error('Trang này đã có trong danh sách.');
    s.sites.push({ origin: o, name: name.trim().slice(0, 80), builtin: false, addedBy: me.id, createdAt: now.toISOString() });
    save();
  }
  async removeEmbedSite(origin: string) {
    await this.staff();
    const { s, save } = await this.load();
    s.sites = s.sites.filter((x) => x.origin !== origin);
    save();
  }
  async listClassPages(classId: string) {
    const me = await this.ds.getCurrentUser();
    const staff = me?.role === 'teacher' || me?.role === 'admin';
    return (await this.load()).s.pages.filter((p) => p.classId === classId && (staff || !p.hidden)).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  }
  async getClassPage(id: string) { return (await this.load()).s.pages.find((p) => p.id === id) ?? null; }
  async saveClassPage(i: ClassPageInput) {
    await this.staff();
    if (!i.title.trim()) throw new Error('Nhập tên trang.');
    if (i.kind === 'link' && !i.url) throw new Error('Nhập địa chỉ trang.');
    if (i.parentId) {
      const all = (await this.load()).s.pages;
      const par = all.find((p) => p.id === i.parentId);
      if (!par || par.classId !== i.classId) throw new Error('Trang cha phải thuộc cùng lớp.');
      for (let cur: string | null = i.parentId, d = 1; cur; d++) {
        if (cur === i.id) throw new Error('Không chuyển trang vào trong trang con của nó được.');
        if (d >= 4) throw new Error('Trang con sâu tối đa 4 tầng.');
        cur = all.find((p) => p.id === cur)?.parentId ?? null;
      }
    }
    const { s, save, now } = await this.load();
    const old = i.id ? s.pages.find((p) => p.id === i.id) : undefined;
    const page: ClassPage = {
      id: old?.id ?? `pg-${Math.random().toString(36).slice(2, 10)}`, lti: old?.lti ?? {}, position: old?.position ?? s.pages.filter((p) => p.classId === i.classId).length,
      createdAt: old?.createdAt ?? now.toISOString(), classId: i.classId, title: i.title.trim(), description: i.description.trim(), kind: i.kind, url: i.url, appId: i.appId, openIn: i.openIn, hidden: i.hidden,
      parentId: i.parentId !== undefined ? i.parentId : old?.parentId ?? null, body: i.body !== undefined ? i.body : old?.body ?? '',
    };
    if (i.position !== undefined) page.position = i.position;
    else if (!old) page.position = s.pages.filter((p) => p.classId === i.classId && (p.parentId ?? null) === page.parentId).length;
    if (old) s.pages[s.pages.indexOf(old)] = page; else s.pages.push(page);
    save();
    return page;
  }
  async movePages(moves: { id: string; position: number }[]) {
    await this.staff();
    const { s, save } = await this.load();
    for (const m of moves) { const p = s.pages.find((x) => x.id === m.id); if (p) p.position = m.position; }
    save();
  }
  async deleteClassPage(id: string) {
    await this.staff();
    const { s, save } = await this.load();
    // Như CSDL (on delete set null): trang con lên làm trang gốc.
    s.pages.forEach((p) => { if (p.parentId === id) p.parentId = null; });
    s.pages = s.pages.filter((p) => p.id !== id);
    save();
  }
}
