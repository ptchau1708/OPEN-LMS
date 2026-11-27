/** Phòng thảo luận — bản demo (localStorage, khóa `discuss`). Mô phỏng đúng quyền của SQL 15. */
import type { DataSource, Profile } from '@openedu/contracts';
import { DEMO_CLASSES, DEMO_GUARDIANS, DEMO_USERS } from '../seed/users';
import { createDefaultStorage, readJson, writeJson, type KVStorage } from '../storage';
import { compressWorkImage } from '../workImage';
import { CHAT_TAB, cleanQuickReplies, DEFAULT_BLOCK_WORDS, DISCUSSION_RATE_PER_MIN, discussionProblem, discussionState, flagText, roomsFromTeams, TAB_COLORS } from './rules';
import type {
  Discussion, DiscussionInput, DiscussionPost, DiscussionReaction, DiscussionStats, DiscussionWord, DiscussSource, NewDiscussionPost,
} from './types';

interface StoredPost extends Omit<DiscussionPost, 'author' | 'reactions' | 'mine' | 'reports'> { reactions: { userId: string; kind: DiscussionReaction }[]; reports: { userId: string; reason: string; resolved: boolean }[] }
interface Store { v: 2; discussions: Discussion[]; posts: StoredPost[]; words: DiscussionWord[] }
interface DemoKv { schoolKv(): Promise<{ storage: KVStorage; now: () => Date }> }

const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const listeners = new Map<string, Set<() => void>>();
const emit = (id: string) => listeners.get(id)?.forEach((f) => f());

function seed(now: Date): Store {
  const iso = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString();
  const discussions: Discussion[] = [];
  const posts: StoredPost[] = [];
  const mk = (d: Discussion, roomId: string, tabId: string, authorId: string, body: string, status: StoredPost['status'], minAgo: number, extra: Partial<StoredPost> = {}) => {
    const p: StoredPost = { id: rid('dp'), discussionId: d.id, roomId, tabId, parentId: null, authorId, body, images: [], color: null, status, flagged: false, createdAt: iso(minAgo), updatedAt: iso(minAgo), reactions: [], reports: [], ...extra };
    posts.push(p);
    return p;
  };
  for (const cls of DEMO_CLASSES.filter((c) => c.id === 'c-2a' || c.id === 'c-4a')) {
    const d: Discussion = {
      id: `dc-${cls.id}`, classId: cls.id, kind: 'board', title: 'Em làm gì để bảo vệ môi trường?',
      prompt: 'Mỗi em kể một việc em đã làm hoặc sẽ làm để giữ trường lớp, nhà mình sạch đẹp. Có thể chụp ảnh gửi kèm nhé!',
      moderation: cls.grade >= 4 ? 'post' : 'pre', hideOthers: false, opensAt: null, closesAt: null, locked: false, pinned: true, archived: false,
      rooms: roomsFromTeams(cls.teams), tabs: [{ id: 'y-kien', name: 'Ý kiến', color: TAB_COLORS[0] }, { id: 'cau-hoi', name: 'Câu hỏi', color: TAB_COLORS[1] }, { id: 'hinh-anh', name: 'Hình ảnh', color: TAB_COLORS[2] }],
      createdBy: cls.teacherId, createdAt: iso(600), updatedAt: iso(600),
    };
    discussions.push(d);
    const [s1, s2, s3] = cls.studentIds;
    mk(d, 'chung', 'y-kien', cls.teacherId, 'Chào cả lớp! Các em viết ý kiến vào tab “Ý kiến”, có thắc mắc thì đăng vào tab “Câu hỏi” nhé.', 'visible', 500);
    const p1 = mk(d, 'chung', 'y-kien', s1, 'Em nhặt rác ở sân trường vào giờ ra chơi.', 'visible', 300, { color: '#dff3e4' });
    p1.reactions.push({ userId: s2, kind: 'heart' }, { userId: cls.teacherId, kind: 'star' });
    mk(d, 'chung', 'y-kien', s2, 'Em tắt điện khi ra khỏi lớp.', 'visible', 200, { color: '#fff4c2' });
    posts.push({ ...p1, id: rid('dp'), parentId: p1.id, authorId: s3, body: 'Em đồng ý với bạn vì sân trường sẽ sạch hơn.', color: null, createdAt: iso(150), updatedAt: iso(150), reactions: [], reports: [] });
    mk(d, 'chung', 'cau-hoi', s3, 'Pin cũ thì bỏ vào đâu ạ?', 'pending', 60);
    mk(d, 'chung', 'y-kien', s2, 'Bạn ấy ngu thật', 'pending', 30, { flagged: true });
    const team = d.rooms[1];
    if (team) mk(d, team.id, 'y-kien', team.members[0], 'Tổ mình làm áp phích “Ngày không rác” nhé!', 'visible', 90);
    // Phòng trò chuyện nhóm theo tổ (đang mở cho bản demo).
    const c: Discussion = {
      id: `ch-${cls.id}`, classId: cls.id, kind: 'chat', title: 'Trò chuyện nhóm: chuẩn bị áp phích', prompt: 'Mỗi tổ bàn: áp phích vẽ gì, ai làm phần nào?',
      moderation: 'post', hideOthers: false, opensAt: null, closesAt: null, locked: false, pinned: false, archived: false,
      rooms: roomsFromTeams(cls.teams).slice(1), tabs: [{ ...CHAT_TAB }], createdBy: cls.teacherId, createdAt: iso(120), updatedAt: iso(120),
    };
    if (c.rooms.length) {
      discussions.push(c);
      const r0 = c.rooms[0];
      mk(c, r0.id, 'chat', cls.teacherId, 'Các tổ bắt đầu bàn nhé, mỗi bạn nói một ý!', 'visible', 20);
      if (r0.members[1]) mk(c, r0.id, 'chat', r0.members[1], 'Tổ mình vẽ cây xanh đi!', 'visible', 10);
    }
  }
  return { v: 2, discussions, posts, words: DEFAULT_BLOCK_WORDS.map((w) => ({ id: rid('w'), classId: null, word: w })) };
}

export class DemoDiscussSource implements DiscussSource {
  /** `shared`: dùng chung một kho cho nhiều máy giả lập (kiểm thử hai HS cùng lúc). */
  constructor(private ds: DataSource, private shared?: KVStorage) {}
  private async kv() {
    if (this.shared) return { storage: this.shared, now: () => new Date() };
    const d = this.ds as unknown as Partial<DemoKv>;
    return typeof d.schoolKv === 'function' ? d.schoolKv() : { storage: createDefaultStorage(), now: () => new Date() };
  }
  private async load() {
    const { storage, now } = await this.kv();
    let s = readJson<Store | null>(storage, 'discuss', null);
    if (!s || s.v !== 2) { s = seed(now()); writeJson(storage, 'discuss', s); }
    const st = s;
    return { s: st, save: () => writeJson(storage, 'discuss', st), now: now() };
  }
  private async me(): Promise<Profile> {
    const me = await this.ds.getCurrentUser();
    if (!me) throw new Error('Phiên đăng nhập đã hết, đăng nhập lại nhé.');
    return me;
  }
  private classOf(id: string) { return DEMO_CLASSES.find((c) => c.id === id); }
  private teacherOf(me: Profile, classId: string): boolean {
    if (me.role === 'admin') return true;
    const c = this.classOf(classId);
    return me.role === 'teacher' && (c?.teacherId === me.id || me.classId === classId);
  }
  private memberOf(me: Profile, classId: string): boolean {
    return me.classId === classId || !!this.classOf(classId)?.studentIds.includes(me.id);
  }
  private canSeeDisc(me: Profile, d: Discussion): boolean {
    if (this.teacherOf(me, d.classId)) return true;
    if (d.archived) return false;
    if (me.role === 'student') return this.memberOf(me, d.classId);
    if (me.role === 'parent') return (DEMO_GUARDIANS[me.id] ?? []).some((k) => this.classOf(d.classId)?.studentIds.includes(k));
    return false;
  }
  private roomOk(me: Profile, d: Discussion, roomId: string) {
    return d.rooms.some((r) => r.id === roomId && (!r.members.length || r.members.includes(me.id)));
  }
  private canRead(me: Profile, d: Discussion, p: StoredPost, all: StoredPost[]): boolean {
    if (this.teacherOf(me, d.classId) || p.authorId === me.id) return true;
    if (p.status !== 'visible' || d.archived) return false;
    if (me.role === 'student') {
      return this.memberOf(me, d.classId) && this.roomOk(me, d, p.roomId)
        && (!d.hideOthers || all.some((m) => m.discussionId === d.id && m.authorId === me.id && !m.parentId && m.status !== 'removed'));
    }
    if (me.role === 'parent') return (DEMO_GUARDIANS[me.id] ?? []).includes(p.authorId);
    return false;
  }
  private view(me: Profile, d: Discussion, p: StoredPost): DiscussionPost {
    const u = DEMO_USERS.find((x) => x.id === p.authorId);
    const reactions = { heart: 0, star: 0, like: 0 };
    const mine = { heart: false, star: false, like: false };
    for (const r of p.reactions) { reactions[r.kind]++; if (r.userId === me.id) mine[r.kind] = true; }
    const staff = this.teacherOf(me, d.classId);
    const { reactions: _r, reports, ...rest } = p;
    return { ...rest, author: { name: u?.name ?? 'Bạn', mascot: u?.avatarMascot, color: u?.avatarColor, role: u?.role }, reactions, mine,
      reports: staff ? reports.filter((x) => !x.resolved).length : reports.filter((x) => x.userId === me.id && !x.resolved).length };
  }

  async listDiscussions(classId: string) {
    const me = await this.me();
    const { s } = await this.load();
    return s.discussions.filter((d) => d.classId === classId && this.canSeeDisc(me, d))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  }
  async getDiscussion(id: string) {
    const me = await this.me();
    const d = (await this.load()).s.discussions.find((x) => x.id === id);
    return d && this.canSeeDisc(me, d) ? d : null;
  }
  async saveDiscussion(i: DiscussionInput) {
    const me = await this.me();
    if (!this.teacherOf(me, i.classId)) throw new Error('Chỉ giáo viên của lớp mới tạo / sửa được phòng thảo luận.');
    const problem = discussionProblem(i);
    if (problem) throw new Error(problem);
    const { s, save, now } = await this.load();
    const old = i.id ? s.discussions.find((d) => d.id === i.id) : undefined;
    const d: Discussion = { ...i, ...(i.quickReplies !== undefined ? { quickReplies: cleanQuickReplies(i.quickReplies) } : {}), id: old?.id ?? rid('dc'), title: i.title.trim(), createdBy: old?.createdBy ?? me.id, createdAt: old?.createdAt ?? now.toISOString(), updatedAt: now.toISOString() };
    if (old) s.discussions[s.discussions.indexOf(old)] = d; else s.discussions.push(d);
    save();
    emit(d.id);
    return d;
  }
  async deleteDiscussion(id: string) {
    const me = await this.me();
    const { s, save } = await this.load();
    const d = s.discussions.find((x) => x.id === id);
    if (!d || !this.teacherOf(me, d.classId)) throw new Error('Chưa có quyền xóa phòng này.');
    s.discussions = s.discussions.filter((x) => x.id !== id);
    s.posts = s.posts.filter((p) => p.discussionId !== id);
    save();
  }
  async stats(classId: string) {
    const me = await this.me();
    const { s } = await this.load();
    const out: Record<string, DiscussionStats> = {};
    for (const d of s.discussions.filter((x) => x.classId === classId && this.canSeeDisc(me, x))) {
      const ps = s.posts.filter((p) => p.discussionId === d.id && p.status !== 'removed' && this.canRead(me, d, p, s.posts));
      out[d.id] = {
        total: ps.filter((p) => p.status !== 'hidden').length, pending: ps.filter((p) => p.status === 'pending').length,
        reports: this.teacherOf(me, d.classId) ? ps.reduce((a, p) => a + p.reports.filter((r) => !r.resolved).length, 0) : 0,
        lastAt: ps.reduce<string | null>((a, p) => (!a || p.createdAt > a ? p.createdAt : a), null),
      };
    }
    return out;
  }
  async listPosts(discussionId: string) {
    const me = await this.me();
    const { s } = await this.load();
    const d = s.discussions.find((x) => x.id === discussionId);
    if (!d || !this.canSeeDisc(me, d)) return [];
    return s.posts.filter((p) => p.discussionId === d.id && this.canRead(me, d, p, s.posts)).map((p) => this.view(me, d, p)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async post(i: NewDiscussionPost) {
    const me = await this.me();
    const { s, save, now } = await this.load();
    const d = s.discussions.find((x) => x.id === i.discussionId);
    if (!d) throw new Error('Không tìm thấy phòng thảo luận.');
    const staff = this.teacherOf(me, d.classId);
    if (!staff) {
      if (me.role !== 'student' || !this.memberOf(me, d.classId)) throw new Error('Em chưa ở trong lớp này nên chưa đăng bài được.');
      const st = discussionState(d, now);
      if (st === 'locked') throw new Error('Phòng thảo luận đang khóa.');
      if (st === 'not-yet') throw new Error('Phòng thảo luận chưa mở.');
      if (st === 'closed') throw new Error('Phòng thảo luận đã đóng.');
      if (!this.roomOk(me, d, i.roomId)) throw new Error('Em không ở trong phòng nhỏ này.');
      if (s.posts.filter((p) => p.authorId === me.id && now.getTime() - Date.parse(p.createdAt) < 60_000).length >= DISCUSSION_RATE_PER_MIN) {
        throw new Error('Em đăng nhanh quá, chờ một chút rồi đăng tiếp nhé.');
      }
    }
    const parent = i.parentId ? s.posts.find((p) => p.id === i.parentId) : undefined;
    if (i.parentId && (!parent || parent.discussionId !== d.id || parent.parentId || !this.canRead(me, d, parent, s.posts))) throw new Error('Không tìm thấy bài để bình luận.');
    if (!parent && !d.tabs.some((t) => t.id === i.tabId)) throw new Error('Không có tab này.');
    const body = i.body.trim();
    const images: { path: string; url: string }[] = [];
    for (const f of (i.files ?? []).slice(0, 3)) {
      const img = await compressWorkImage(f);
      images.push({ path: `${d.id}/${me.id}/${rid('img')}.jpg`, url: img.url });
    }
    if (!body && !images.length) throw new Error('Em viết vài chữ hoặc gửi ảnh nhé.');
    if (body.length > 1000) throw new Error('Bài dài quá (tối đa 1000 chữ cái).');
    const words = s.words.filter((w) => !w.classId || w.classId === d.classId).map((w) => w.word);
    const flagged = !staff && flagText(body, words);
    const p: StoredPost = {
      id: rid('dp'), discussionId: d.id, roomId: i.roomId, tabId: parent ? parent.tabId : i.tabId, parentId: parent?.id ?? null, authorId: me.id, body, images,
      color: i.color ?? null, status: staff ? 'visible' : flagged || d.moderation === 'pre' ? 'pending' : 'visible', flagged,
      createdAt: now.toISOString(), updatedAt: now.toISOString(), reactions: [], reports: [],
    };
    s.posts.push(p);
    save();
    emit(d.id);
    return this.view(me, d, p);
  }
  private async findMine(id: string) {
    const me = await this.me();
    const l = await this.load();
    const p = l.s.posts.find((x) => x.id === id);
    const d = p && l.s.discussions.find((x) => x.id === p.discussionId);
    if (!p || !d) throw new Error('Không tìm thấy bài.');
    return { me, p, d, ...l };
  }
  async editPost(id: string, body: string) {
    const { me, p, d, s, save, now } = await this.findMine(id);
    if (p.authorId !== me.id || p.status === 'hidden' || p.status === 'removed') throw new Error('Không sửa được bài này.');
    const staff = this.teacherOf(me, d.classId);
    const flagged = !staff && flagText(body, s.words.filter((w) => !w.classId || w.classId === d.classId).map((w) => w.word));
    p.body = body.trim();
    p.flagged = flagged;
    p.updatedAt = now.toISOString();
    if (!staff && (flagged || d.moderation === 'pre')) p.status = 'pending';
    save();
    emit(d.id);
  }
  async removeMyPost(id: string) {
    const { me, p, d, save } = await this.findMine(id);
    if (p.authorId !== me.id) throw new Error('Không gỡ được bài này.');
    p.status = 'removed';
    save();
    emit(d.id);
  }
  async moderate(ids: string[], status: 'visible' | 'hidden' | 'pending') {
    const me = await this.me();
    const { s, save } = await this.load();
    let n = 0;
    const touched = new Set<string>();
    for (const p of s.posts) {
      if (!ids.includes(p.id) || p.status === 'removed') continue;
      const d = s.discussions.find((x) => x.id === p.discussionId);
      if (!d || !this.teacherOf(me, d.classId)) continue;
      p.status = status;
      if (status !== 'pending') p.reports.forEach((r) => (r.resolved = true));
      n++;
      touched.add(d.id);
    }
    if (!n && ids.length) throw new Error('Thầy/cô chưa có quyền với các bài này.');
    save();
    touched.forEach(emit);
    return n;
  }
  async react(postId: string, kind: DiscussionReaction) {
    const { me, p, d, s, save } = await this.findMine(postId);
    if (me.role === 'parent') throw new Error('Phụ huynh chỉ xem bài.');
    if (p.status !== 'visible' || !this.canRead(me, d, p, s.posts)) throw new Error('Không tìm thấy bài.');
    const had = p.reactions.findIndex((r) => r.userId === me.id && r.kind === kind);
    if (had >= 0) p.reactions.splice(had, 1); else p.reactions.push({ userId: me.id, kind });
    save();
    emit(d.id);
    return had < 0;
  }
  async report(postId: string, reason: string) {
    const { me, p, d, s, save } = await this.findMine(postId);
    if (!this.canRead(me, d, p, s.posts)) throw new Error('Không tìm thấy bài.');
    p.reports = [...p.reports.filter((r) => r.userId !== me.id), { userId: me.id, reason: reason.slice(0, 300), resolved: false }];
    save();
    emit(d.id);
  }
  async listWords(classId: string) {
    return (await this.load()).s.words.filter((w) => !w.classId || w.classId === classId).sort((a, b) => a.word.localeCompare(b.word, 'vi'));
  }
  async addWord(classId: string, word: string) {
    const me = await this.me();
    if (!this.teacherOf(me, classId)) throw new Error('Chỉ giáo viên của lớp mới thêm được.');
    const { s, save } = await this.load();
    const w = word.trim();
    if (!w || w.length > 40) throw new Error('Từ dài 1–40 chữ cái.');
    if (s.words.some((x) => (x.classId === classId || !x.classId) && x.word.toLowerCase() === w.toLowerCase())) throw new Error('Từ này đã có.');
    s.words.push({ id: rid('w'), classId, word: w });
    save();
  }
  async removeWord(id: string) {
    const me = await this.me();
    const { s, save } = await this.load();
    const w = s.words.find((x) => x.id === id);
    if (!w) return;
    if (!w.classId ? me.role !== 'admin' : !this.teacherOf(me, w.classId)) throw new Error('Từ chung của trường chỉ quản trị bớt được.');
    s.words = s.words.filter((x) => x.id !== id);
    save();
  }
  subscribe(discussionId: string, onChange: () => void) {
    const set = listeners.get(discussionId) ?? new Set();
    set.add(onChange);
    listeners.set(discussionId, set);
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key.includes('discuss')) onChange(); };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => { set.delete(onChange); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
  }
}

