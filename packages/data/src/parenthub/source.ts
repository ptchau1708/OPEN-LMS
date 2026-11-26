/**
 * Phụ huynh — nguồn dữ liệu (SQL 23).
 *  - Supabase: RPC parent_* (cài đặt "phụ huynh thấy gì", hàng chờ duyệt, thông báo gửi phụ huynh, nhắn tin hai chiều).
 *  - Demo: lưu trên trình duyệt. App GV và app HS/PH là hai trang khác nhau nên bản demo không chuyển tin qua lại;
 *    trang phụ huynh demo có sẵn vài thông báo mẫu của cô để xem thử.
 */
import {
  defaultShareModes, SHARE_KINDS, uid,
  type AttendanceStatus, type DataSource, type InboxItem, type InboxPost, type MsgWindow, type ParentInbox, type ParentMessage, type ParentPost,
  type ParentPostInput, type ParentPreview, type ParentShareSettings, type ParentThread, type Profile, type ReviewItem, type ReviewKind,
  type ShareKind, type ShareMode, type ThreadSummary,
} from '@openedu/contracts';
import { getSupabaseClient } from '../supabase/client';
import { getSchoolSource } from '../school/source';
import { listChildren } from '../getDataSource';
import { demoNotify } from '../notify/demo';
import { parentHubError } from './errors';

export { parentHubError };

export interface ParentHubSource {
  getSettings(classId: string): Promise<ParentShareSettings>;
  saveSettings(classId: string, patch: Partial<Pick<ParentShareSettings, 'modes' | 'msgEnabled' | 'msgFrom' | 'msgTo'>>): Promise<ParentShareSettings>;
  queue(classId: string, days?: number): Promise<ReviewItem[]>;
  release(items: { kind: ReviewKind; refId: string }[], state: 'sent' | 'skipped', note?: string): Promise<number>;
  preview(studentId: string): Promise<ParentPreview>;
  createPost(input: ParentPostInput): Promise<ParentPost>;
  listPosts(classId: string): Promise<ParentPost[]>;
  postDetail(id: string): Promise<ParentPost>;
  recallPost(id: string): Promise<ParentPost>;
  remindPost(id: string): Promise<number>;
  threads(classId: string): Promise<ThreadSummary[]>;
  thread(studentId: string): Promise<ParentThread>;
  send(studentId: string, body: string, postId?: string): Promise<ParentMessage>;
  removeMessage(id: string): Promise<void>;
  inbox(childId: string): Promise<ParentInbox>;
  readPost(postId: string, ack?: boolean): Promise<{ readAt?: string | null; ackedAt?: string | null }>;
}

/* =============================================================================
 * Supabase
 * ========================================================================== */

function normSettings(s: Partial<ParentShareSettings> & { classId: string }): ParentShareSettings {
  const modes = { ...defaultShareModes() };
  for (const k of SHARE_KINDS) {
    const m = (s.modes as Partial<Record<ShareKind, ShareMode>> | undefined)?.[k.kind];
    if (m && k.modes.includes(m)) modes[k.kind] = m;
  }
  return {
    classId: s.classId, modes, msgEnabled: s.msgEnabled ?? true, msgFrom: s.msgFrom ?? '06:30', msgTo: s.msgTo ?? '21:00',
    students: s.students ?? 0, linkedStudents: s.linkedStudents ?? 0, parents: s.parents ?? 0, updatedAt: s.updatedAt ?? null,
  };
}

class SupabaseParentHub implements ParentHubSource {
  private async rpc<T>(fn: string, args: Record<string, unknown>, vi: string): Promise<T> {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw parentHubError(error, vi);
    return data as T;
  }
  async getSettings(classId: string) { return normSettings(await this.rpc('parent_share_get', { p_class: classId }, 'Chưa tải được cài đặt phụ huynh.')); }
  async saveSettings(classId: string, patch: Partial<ParentShareSettings>) {
    return normSettings(await this.rpc('parent_share_save', { p_class: classId, p: patch }, 'Chưa lưu được cài đặt phụ huynh.'));
  }
  async queue(classId: string, days = 30) { return (await this.rpc<ReviewItem[]>('parent_queue', { p_class: classId, p_days: days }, 'Chưa tải được mục chờ duyệt.')) ?? []; }
  async release(items: { kind: ReviewKind; refId: string }[], state: 'sent' | 'skipped', note?: string) {
    return this.rpc<number>('parent_release', { p_items: items, p_state: state, p_note: note ?? null }, 'Chưa gửi được.');
  }
  async preview(studentId: string) { return this.rpc<ParentPreview>('parent_preview', { p_student: studentId }, 'Chưa tải được.'); }
  async createPost(input: ParentPostInput) { return this.rpc<ParentPost>('parent_post_create', { p: input }, 'Chưa gửi được thông báo.'); }
  async listPosts(classId: string) { return (await this.rpc<ParentPost[]>('parent_post_list', { p_class: classId, p_limit: 100 }, 'Chưa tải được thông báo đã gửi.')) ?? []; }
  async postDetail(id: string) { return this.rpc<ParentPost>('parent_post_detail', { p_id: id }, 'Chưa tải được.'); }
  async recallPost(id: string) { return this.rpc<ParentPost>('parent_post_recall', { p_id: id }, 'Chưa thu hồi được.'); }
  async remindPost(id: string) { return this.rpc<number>('parent_post_remind', { p_id: id }, 'Chưa nhắc được.'); }
  async threads(classId: string) { return (await this.rpc<ThreadSummary[]>('parent_threads', { p_class: classId }, 'Chưa tải được tin nhắn.')) ?? []; }
  async thread(studentId: string) { return this.rpc<ParentThread>('parent_thread', { p_student: studentId, p_limit: 300 }, 'Chưa tải được tin nhắn.'); }
  async send(studentId: string, body: string, postId?: string) {
    return this.rpc<ParentMessage>('parent_message_send', { p_student: studentId, p_body: body, p_post: postId ?? null }, 'Chưa gửi được tin nhắn.');
  }
  async removeMessage(id: string) { await this.rpc('parent_message_delete', { p_id: id }, 'Chưa gỡ được tin nhắn.'); }
  async inbox(childId: string) {
    const r = await this.rpc<ParentInbox>('parent_inbox', { p_child: childId }, 'Chưa tải được thông báo của cô.');
    return { ...r, modes: { ...defaultShareModes(), ...(r.modes ?? {}) } };
  }
  async readPost(postId: string, ack = false) { return this.rpc<{ readAt?: string; ackedAt?: string }>('parent_post_read', { p_post: postId, p_ack: ack }, 'Chưa ghi nhận được.'); }
}

/* =============================================================================
 * Demo
 * ========================================================================== */
interface DemoPost extends Omit<ParentPost, 'parents' | 'reads' | 'acks' | 'noParent' | 'students' | 'studentNames' | 'sent'> {
  reads: Record<string, { readAt: string; ackedAt?: string | null }>;
}
interface DemoMsg { id: string; classId: string; studentId: string; senderId: string; senderName: string; fromTeacher: boolean; body: string; at: string; readAt?: string | null; deleted?: boolean; postId?: string | null }
interface DemoRelease { kind: ReviewKind; refId: string; studentId: string; classId: string; state: 'sent' | 'skipped'; note?: string | null; at: string; by: string; item: ReviewItem }
interface DemoStore { settings: Record<string, ParentShareSettings>; posts: DemoPost[]; msgs: DemoMsg[]; releases: DemoRelease[]; seeded?: boolean }

const KEY = 'oe.parenthub.demo.v1';
const nowIso = () => new Date().toISOString();
function readStore(): DemoStore {
  try {
    const s = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as DemoStore | null;
    if (s && typeof s === 'object') return { settings: s.settings ?? {}, posts: s.posts ?? [], msgs: s.msgs ?? [], releases: s.releases ?? [], seeded: s.seeded };
  } catch { /* làm lại */ }
  return { settings: {}, posts: [], msgs: [], releases: [] };
}
function writeStore(s: DemoStore) { globalThis.localStorage?.setItem(KEY, JSON.stringify(s)); }

const ATT_LABEL: Record<AttendanceStatus, string> = { 'co-mat': 'Có mặt', 'vang-co-phep': 'Vắng có phép', 'vang-khong-phep': 'Vắng không phép', muon: 'Đi học muộn' };
const ddmm = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

function hhmmNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function msgWindow(s: ParentShareSettings): MsgWindow {
  const t = hhmmNow();
  return { enabled: s.msgEnabled, from: s.msgFrom, to: s.msgTo, open: t >= s.msgFrom && t < s.msgTo };
}

class DemoParentHub implements ParentHubSource {
  constructor(private ds: DataSource) {}

  private async me(): Promise<Profile> {
    const u = await this.ds.getCurrentUser();
    if (!u) throw new Error('Cần đăng nhập trước.');
    return u;
  }
  private async teacher(): Promise<Profile> {
    const u = await this.me();
    if (u.role !== 'teacher' && u.role !== 'admin') throw new Error('Chỉ thầy cô mới làm được việc này.');
    return u;
  }
  private settings(s: DemoStore, classId: string): ParentShareSettings {
    return normSettings(s.settings[classId] ?? { classId });
  }
  private async students(classId: string): Promise<Profile[]> { return this.ds.listStudents(classId); }
  private async links(classId: string) {
    try { return await getSchoolSource(this.ds).listGuardianLinks(classId); } catch { return []; }
  }
  private async kid(studentId: string): Promise<{ classId: string; name: string; className: string | null; teacherName: string | null }> {
    const p = await this.ds.getStudentProfile(studentId);
    return { classId: p.student.classId ?? p.class?.id ?? '', name: p.student.name, className: p.class?.name ?? null, teacherName: p.class?.teacherName ?? null };
  }
  private async classOf(studentId: string): Promise<string> { return (await this.kid(studentId)).classId; }

  async getSettings(classId: string) {
    await this.teacher();
    const [kids, links] = await Promise.all([this.students(classId), this.links(classId)]);
    return { ...this.settings(readStore(), classId), students: kids.length, linkedStudents: new Set(links.map((l) => l.studentId)).size, parents: new Set(links.map((l) => l.parentId)).size };
  }
  async saveSettings(classId: string, patch: Partial<ParentShareSettings>) {
    await this.teacher();
    if (patch.msgFrom && patch.msgTo && patch.msgFrom >= patch.msgTo) throw new Error('Giờ bắt đầu nhận tin phải trước giờ kết thúc.');
    const s = readStore();
    const cur = this.settings(s, classId);
    s.settings[classId] = normSettings({ ...cur, ...patch, modes: { ...cur.modes, ...(patch.modes ?? {}) }, classId, updatedAt: nowIso() });
    writeStore(s);
    return this.getSettings(classId);
  }

  /** all = true: mọi mục theo ngày (để đếm khi "Xem như phụ huynh"), không chỉ mục đang ở chế độ duyệt. */
  private async candidates(classId: string, days: number, all = false): Promise<ReviewItem[]> {
    const s = readStore();
    const cur = this.settings(s, classId);
    const st = all ? { ...cur, modes: { ...cur.modes, works: 'review', tt27: 'review', praise: 'review', reminders: 'review', attendance: 'review' } as typeof cur.modes } : cur;
    const since = Date.now() - days * 86_400_000;
    const kids = await this.students(classId);
    const name = new Map(kids.map((k) => [k.id, k.name]));
    const out: ReviewItem[] = [];
    if (st.modes.praise === 'review' || st.modes.reminders === 'review') {
      const [logs, beh] = await Promise.all([this.ds.listBehaviorLogs({ classId, limit: 500 }), this.ds.listBehaviors(classId)]);
      const label = new Map(beh.map((b) => [b.id, b]));
      for (const l of logs) {
        if (Date.parse(l.at) < since) continue;
        const b = label.get(l.behaviorId);
        const kind: ReviewKind = (b?.kind ?? (l.points < 0 ? 'needs-work' : 'positive')) === 'needs-work' ? 'reminders' : 'praise';
        if (st.modes[kind] !== 'review') continue;
        out.push({ kind, refId: l.id, studentId: l.studentId, studentName: name.get(l.studentId) ?? '', classId, at: l.at,
          title: `${kind === 'praise' ? 'Được khen' : 'Nhắc nhở'}: ${b?.label ?? l.note ?? 'thi đua'} (${l.points > 0 ? '+' : ''}${l.points} điểm)`,
          detail: b ? l.note ?? null : null, points: l.points });
      }
    }
    if (st.modes.attendance === 'review') {
      for (const r of await this.ds.listAttendance(classId)) {
        if (Date.parse(r.date) < since) continue;
        for (const [sid, status] of Object.entries(r.entries)) {
          if (status === 'co-mat') continue;
          out.push({ kind: 'attendance', refId: `${sid}:${r.date}`, studentId: sid, studentName: name.get(sid) ?? '', classId, at: `${r.date}T07:00:00+07:00`,
            title: `${ATT_LABEL[status]} ngày ${ddmm(r.date)}`, detail: null });
        }
      }
    }
    if (st.modes.tt27 === 'review') {
      for (const e of await this.ds.listTt27({ classId })) {
        if (e.status !== 'final') continue;
        out.push({ kind: 'tt27', refId: `${e.studentId}:${e.schoolYear}:${e.termId}`, studentId: e.studentId, studentName: name.get(e.studentId) ?? '', classId,
          at: e.updatedAt ?? nowIso(), title: `Kết quả đánh giá ${e.termId} ${e.schoolYear}`, detail: e.generalComment ?? null });
      }
    }
    if (st.modes.works === 'review') {
      for (const k of kids) {
        for (const w of await this.ds.getStudentWork(k.id).catch(() => [])) {
          if (Date.parse(w.at) < since) continue;
          out.push({ kind: 'works', refId: w.submissionId, studentId: k.id, studentName: k.name, classId, at: w.at, title: `Bài viết đã chấm: ${w.title}`, detail: null });
        }
      }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }

  async queue(classId: string, days = 30) {
    await this.teacher();
    const done = new Set(readStore().releases.map((r) => `${r.kind}|${r.refId}`));
    return (await this.candidates(classId, days)).filter((i) => !done.has(`${i.kind}|${i.refId}`));
  }
  async release(items: { kind: ReviewKind; refId: string }[], state: 'sent' | 'skipped', note?: string) {
    const t = await this.teacher();
    const s = readStore();
    let n = 0;
    for (const cls of new Set((await this.ds.listClasses()).map((c) => c.id))) {
      const cand = await this.candidates(cls, 120);
      for (const it of items) {
        const item = cand.find((c) => c.kind === it.kind && c.refId === it.refId);
        if (!item) continue;
        s.releases = s.releases.filter((r) => !(r.kind === it.kind && r.refId === it.refId));
        s.releases.push({ kind: it.kind, refId: it.refId, studentId: item.studentId, classId: item.classId, state, note: note?.trim() || null, at: nowIso(), by: t.name, item });
        n++;
      }
    }
    writeStore(s);
    return n;
  }
  async preview(studentId: string): Promise<ParentPreview> {
    await this.teacher();
    const classId = await this.classOf(studentId);
    const st = this.settings(readStore(), classId);
    const links = (await this.links(classId)).filter((l) => l.studentId === studentId);
    const waiting = (await this.queue(classId)).filter((q) => q.studentId === studentId).length;
    const sent = readStore().releases.filter((r) => r.studentId === studentId && r.state === 'sent');
    const cand = await this.candidates(classId, 30, true);
    const items = SHARE_KINDS.map((k) => {
      const mine = cand.filter((c) => c.kind === k.kind && c.studentId === studentId);
      const total = mine.length;
      const mode = st.modes[k.kind];
      const shown = mode === 'off' ? 0 : mode === 'auto' ? total : sent.filter((r) => r.kind === k.kind).length;
      return { kind: k.kind, mode, total, shown };
    });
    const me = await this.kid(studentId);
    return { studentId, studentName: me.name, classId, items, parents: links.map((l) => ({ id: l.parentId, name: l.parentName, relation: l.relation ?? null })), waiting };
  }

  private async postView(p: DemoPost, detail = false): Promise<ParentPost> {
    const kids = await this.students(p.classId);
    const links = await this.links(p.classId);
    const targets = p.audience === 'class' ? kids.map((k) => k.id) : p.studentIds;
    const parentIds = [...new Set(links.filter((l) => targets.includes(l.studentId)).map((l) => l.parentId))];
    const view: ParentPost = {
      ...p, sent: Date.parse(p.sendAt) <= Date.now(),
      studentNames: p.audience === 'students' ? p.studentIds.map((id) => kids.find((k) => k.id === id)?.name ?? '') : [],
      parents: parentIds.length,
      reads: parentIds.filter((id) => p.reads[id]).length,
      acks: parentIds.filter((id) => p.reads[id]?.ackedAt).length,
      noParent: targets.filter((t) => !links.some((l) => l.studentId === t)).length,
    };
    if (detail) {
      view.students = targets.map((sid) => ({
        studentId: sid, studentName: kids.find((k) => k.id === sid)?.name ?? '',
        parents: links.filter((l) => l.studentId === sid).map((l) => ({ id: l.parentId, name: l.parentName, relation: l.relation ?? null, readAt: p.reads[l.parentId]?.readAt ?? null, ackedAt: p.reads[l.parentId]?.ackedAt ?? null })),
      })).sort((a, b) => a.studentName.localeCompare(b.studentName, 'vi'));
    }
    return view;
  }
  async createPost(input: ParentPostInput) {
    const t = await this.teacher();
    if (!input.title.trim()) throw new Error('Cần có tiêu đề.');
    if (input.audience === 'students' && !input.studentIds?.length) throw new Error('Chọn ít nhất một em.');
    const s = readStore();
    const p: DemoPost = {
      id: uid('ph'), classId: input.classId, authorId: t.id, authorName: t.name, audience: input.audience,
      studentIds: input.audience === 'students' ? input.studentIds ?? [] : [], title: input.title.trim(), body: input.body.trim(),
      ackRequired: input.ackRequired, sendAt: input.sendAt && Date.parse(input.sendAt) > Date.now() ? input.sendAt : nowIso(),
      recalled: false, createdAt: nowIso(), reads: {},
    };
    // Bản demo: phụ huynh "đọc" ngay một nửa để thầy cô thấy cột đã xem / xác nhận.
    const links = await this.links(input.classId);
    links.slice(0, Math.ceil(links.length / 2)).forEach((l) => { p.reads[l.parentId] = { readAt: nowIso(), ackedAt: input.ackRequired ? nowIso() : null }; });
    s.posts.unshift(p);
    writeStore(s);
    return this.postView(p);
  }
  async listPosts(classId: string) {
    await this.teacher();
    return Promise.all(readStore().posts.filter((p) => p.classId === classId).map((p) => this.postView(p)));
  }
  async postDetail(id: string) {
    const p = readStore().posts.find((x) => x.id === id);
    if (!p) throw new Error('Không tìm thấy thông báo.');
    return this.postView(p, true);
  }
  async recallPost(id: string) {
    const s = readStore();
    const p = s.posts.find((x) => x.id === id);
    if (!p) throw new Error('Không tìm thấy thông báo.');
    p.recalled = true;
    writeStore(s);
    return this.postView(p);
  }
  async remindPost(id: string) {
    const s = readStore();
    const p = s.posts.find((x) => x.id === id);
    if (!p) throw new Error('Không tìm thấy thông báo.');
    if (p.remindedAt && Date.now() - Date.parse(p.remindedAt) < 12 * 3_600_000) throw new Error('Mỗi 12 giờ nhắc một lần.');
    p.remindedAt = nowIso();
    writeStore(s);
    const v = await this.postView(p);
    return v.parents - (p.ackRequired ? v.acks : v.reads);
  }

  async threads(classId: string): Promise<ThreadSummary[]> {
    await this.teacher();
    this.seed();
    const [kids, links] = await Promise.all([this.students(classId), this.links(classId)]);
    const msgs = readStore().msgs.filter((m) => m.classId === classId && !m.deleted);
    return kids.map((k) => {
      const mine = msgs.filter((m) => m.studentId === k.id);
      const last = mine[mine.length - 1];
      return {
        studentId: k.id, studentName: k.name, parents: links.filter((l) => l.studentId === k.id).length,
        unread: mine.filter((m) => !m.fromTeacher && !m.readAt).length,
        last: last ? { body: last.body, at: last.at, fromTeacher: last.fromTeacher, senderName: last.senderName } : null,
      };
    }).sort((a, b) => b.unread - a.unread || (b.last?.at ?? '').localeCompare(a.last?.at ?? '') || a.studentName.localeCompare(b.studentName, 'vi'));
  }
  async thread(studentId: string): Promise<ParentThread> {
    const u = await this.me();
    this.seed();
    const asTeacher = u.role === 'teacher' || u.role === 'admin';
    const k = await this.kid(studentId);
    const classId = k.classId;
    const s = readStore();
    for (const m of s.msgs) if (m.studentId === studentId && !m.readAt && m.fromTeacher !== asTeacher) m.readAt = nowIso();
    writeStore(s);
    const links = asTeacher ? (await this.links(classId)).filter((l) => l.studentId === studentId) : [];
    return {
      studentId, studentName: k.name, classId, className: k.className, asTeacher,
      parents: asTeacher ? links.map((l) => ({ id: l.parentId, name: l.parentName, relation: l.relation ?? null })) : [{ id: u.id, name: u.name, relation: null }],
      teachers: k.teacherName ? [k.teacherName] : [],
      msg: msgWindow(this.settings(s, classId)),
      messages: s.msgs.filter((m) => m.studentId === studentId).map((m) => ({
        id: m.id, body: m.deleted ? '' : m.body, deleted: !!m.deleted, fromTeacher: m.fromTeacher, senderId: m.senderId, senderName: m.senderName,
        mine: m.senderId === u.id, at: m.at, readAt: m.readAt ?? null, postId: m.postId ?? null, postTitle: s.posts.find((p) => p.id === m.postId)?.title ?? null,
      })),
    };
  }
  async send(studentId: string, body: string, postId?: string): Promise<ParentMessage> {
    const u = await this.me();
    const text = body.trim();
    if (!text) throw new Error('Tin nhắn đang trống.');
    if (text.length > 2000) throw new Error('Tin nhắn tối đa 2000 kí tự.');
    const fromTeacher = u.role === 'teacher' || u.role === 'admin';
    const classId = await this.classOf(studentId);
    const s = readStore();
    if (!fromTeacher && !this.settings(s, classId).msgEnabled) throw new Error('Lớp đang tắt nhắn tin với thầy cô.');
    const m: DemoMsg = { id: uid('msg'), classId, studentId, senderId: u.id, senderName: u.name, fromTeacher, body: text, at: nowIso(), postId: postId ?? null };
    s.msgs.push(m);
    writeStore(s);
    return { id: m.id, body: m.body, deleted: false, fromTeacher, senderId: u.id, senderName: u.name, mine: true, at: m.at, readAt: null, postId: m.postId };
  }
  async removeMessage(id: string) {
    const u = await this.me();
    const s = readStore();
    const m = s.msgs.find((x) => x.id === id && x.senderId === u.id);
    if (!m) throw new Error('Chỉ gỡ được tin nhắn của mình.');
    m.deleted = true;
    writeStore(s);
  }

  /** Dữ liệu mẫu cho trang phụ huynh / tin nhắn (chỉ một lần mỗi trình duyệt). */
  private seed() {
    const s = readStore();
    if (s.seeded) return;
    s.seeded = true;
    const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    s.msgs.push(
      { id: 'msg-demo-1', classId: 'c-4a', studentId: 'u-lan4a2', senderId: 'u-phuhuynh4a', senderName: 'Bố bạn Ngọc Lan', fromTeacher: false, body: 'Chào cô, sáng mai cháu Lan đi khám răng nên xin vào lớp muộn một tiết ạ.', at: at(20), readAt: null },
      { id: 'msg-demo-2', classId: 'c-2a', studentId: 'u-an2a1', senderId: 'u-colan', senderName: 'Cô Lan', fromTeacher: true, body: 'Chào chị, tuần này An đọc to, rõ hơn nhiều. Chị cho cháu đọc thêm 10 phút mỗi tối nhé.', at: at(30), readAt: null },
    );
    s.posts.push(
      { id: 'ph-demo-1', classId: 'c-4a', authorId: 'u-cothu', authorName: 'Cô Thu', audience: 'class', studentIds: [], title: 'Họp phụ huynh cuối học kì I',
        body: 'Kính mời quý phụ huynh dự họp lúc 8:00 sáng thứ Bảy tuần sau tại phòng học lớp 4A.', ackRequired: true, sendAt: at(26), recalled: false, createdAt: at(26), reads: {} },
      { id: 'ph-demo-2', classId: 'c-2a', authorId: 'u-colan', authorName: 'Cô Lan', audience: 'class', studentIds: [], title: 'Nhắc chuẩn bị đồ dùng',
        body: 'Thứ Hai các con mang theo bút chì màu và giấy A4 cho tiết Mĩ thuật.', ackRequired: false, sendAt: at(50), recalled: false, createdAt: at(50), reads: {} },
    );
    writeStore(s);
  }

  async inbox(childId: string): Promise<ParentInbox> {
    const u = await this.me();
    if (u.role !== 'parent') throw new Error('Chỉ phụ huynh đã liên kết với em mới xem được.');
    const kids = await listChildren(this.ds, u.id);
    if (!kids.some((k) => k.id === childId)) throw new Error('Chỉ phụ huynh đã liên kết với em mới xem được.');
    this.seed();
    const classId = kids.find((k) => k.id === childId)?.classId ?? '';
    const s = readStore();
    const st = this.settings(s, classId);
    const posts: InboxPost[] = s.posts
      .filter((p) => p.classId === classId && !p.recalled && Date.parse(p.sendAt) <= Date.now() && (p.audience === 'class' || p.studentIds.includes(childId)))
      .map((p) => ({ id: p.id, title: p.title, body: p.body, at: p.sendAt, teacherName: p.authorName, private: p.audience === 'students', ackRequired: p.ackRequired,
        readAt: p.reads[u.id]?.readAt ?? null, ackedAt: p.reads[u.id]?.ackedAt ?? null }))
      .sort((a, b) => b.at.localeCompare(a.at));
    const items: InboxItem[] = s.releases.filter((r) => r.studentId === childId && r.state === 'sent')
      .map((r) => ({ ...r.item, note: r.note ?? null, sentAt: r.at, teacherName: r.by }));
    const msgs = s.msgs.filter((m) => m.studentId === childId && !m.deleted);
    const last = msgs[msgs.length - 1];
    const k = await this.kid(childId);
    return {
      childId, classId, modes: st.modes, posts, items,
      thread: { unread: msgs.filter((m) => m.fromTeacher && !m.readAt).length, last: last ? { body: last.body, at: last.at, fromTeacher: last.fromTeacher, senderName: last.senderName } : null },
      msg: msgWindow(st), teachers: k.teacherName ? [k.teacherName] : [],
    };
  }
  async readPost(postId: string, ack = false) {
    const u = await this.me();
    const s = readStore();
    const p = s.posts.find((x) => x.id === postId);
    if (!p) throw new Error('Không tìm thấy thông báo.');
    const cur = p.reads[u.id];
    p.reads[u.id] = { readAt: cur?.readAt ?? nowIso(), ackedAt: cur?.ackedAt ?? (ack ? nowIso() : null) };
    writeStore(s);
    demoNotify.markRef(u.id, 'postId', postId);
    return p.reads[u.id]!;
  }
}

const cache = new WeakMap<DataSource, ParentHubSource>();
export function getParentHub(ds: DataSource): ParentHubSource {
  let s = cache.get(ds);
  if (!s) {
    s = ds.mode === 'demo' ? new DemoParentHub(ds) : new SupabaseParentHub();
    cache.set(ds, s);
  }
  return s;
}
