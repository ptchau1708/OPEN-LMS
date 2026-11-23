/** Phòng thảo luận — Supabase (SQL 15: 20261124000001_v2_discussions.sql). */
import { getSupabaseClient, type V2Client } from '../supabase/client';
import { compressWorkImage } from '../workImage';
import { discussionProblem } from './rules';
import type {
  Discussion, DiscussionInput, DiscussionPost, DiscussionReaction, DiscussionStats, DiscussionWord, DiscussSource, NewDiscussionPost,
} from './types';

interface PgError { message: string; code?: string }
function fail(e: PgError, vi: string): never {
  if (e.code === '42P01' || /discussion/.test(e.message ?? '') && /does not exist|schema cache/i.test(e.message ?? '')) {
    throw new Error('Cần chạy tệp SQL 15 (phòng thảo luận) trên Supabase trước.');
  }
  if (e.code === '42501' && !/[À-ỹ]/.test(e.message ?? '')) throw new Error('Chưa có quyền làm việc này.');
  throw new Error(e.message && /[À-ỹ]/.test(e.message) ? e.message : vi);
}

type Row = Record<string, unknown>;
const BUCKET = 'discussion';
const DISC_COLS = 'id,class_id,title,prompt,moderation,hide_others,opens_at,closes_at,locked,pinned,archived,rooms,tabs,created_by,created_at,updated_at';
const POST_COLS = 'id,discussion_id,room_id,tab_id,parent_id,author_id,body,images,color,status,flagged,created_at,updated_at';

const toDisc = (r: Row): Discussion => ({
  id: String(r.id), classId: String(r.class_id), title: String(r.title), prompt: String(r.prompt ?? ''),
  moderation: r.moderation === 'post' ? 'post' : 'pre', hideOthers: !!r.hide_others,
  opensAt: (r.opens_at as string | null) ?? null, closesAt: (r.closes_at as string | null) ?? null,
  locked: !!r.locked, pinned: !!r.pinned, archived: !!r.archived,
  rooms: (r.rooms as Discussion['rooms']) ?? [], tabs: (r.tabs as Discussion['tabs']) ?? [],
  createdBy: (r.created_by as string | null) ?? null, createdAt: String(r.created_at), updatedAt: String(r.updated_at),
});
const zero = () => ({ heart: 0, star: 0, like: 0 });
const no = () => ({ heart: false, star: false, like: false });

function chunks<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export class SupabaseDiscussSource implements DiscussSource {
  private clientP: Promise<V2Client>;
  constructor(client?: V2Client) { this.clientP = client ? Promise.resolve(client) : getSupabaseClient(); }
  private async me(): Promise<string> {
    const sb = await this.clientP;
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('Phiên đăng nhập đã hết, đăng nhập lại nhé.');
    return id;
  }

  async listDiscussions(classId: string): Promise<Discussion[]> {
    const sb = await this.clientP;
    const { data, error } = await sb.from('discussions').select(DISC_COLS).eq('class_id', classId).order('pinned', { ascending: false }).order('created_at', { ascending: false });
    if (error) fail(error, 'Chưa tải được phòng thảo luận.');
    return ((data ?? []) as Row[]).map(toDisc);
  }
  async getDiscussion(id: string): Promise<Discussion | null> {
    const sb = await this.clientP;
    const { data, error } = await sb.from('discussions').select(DISC_COLS).eq('id', id).maybeSingle();
    if (error) fail(error, 'Chưa tải được phòng thảo luận.');
    return data ? toDisc(data as Row) : null;
  }
  async saveDiscussion(i: DiscussionInput): Promise<Discussion> {
    const problem = discussionProblem(i);
    if (problem) throw new Error(problem);
    const sb = await this.clientP;
    const row = {
      class_id: i.classId, title: i.title.trim(), prompt: i.prompt, moderation: i.moderation, hide_others: i.hideOthers,
      opens_at: i.opensAt, closes_at: i.closesAt, locked: i.locked, pinned: i.pinned, archived: i.archived, rooms: i.rooms, tabs: i.tabs,
    };
    if (i.id) {
      const { data, error } = await sb.from('discussions').update(row).eq('id', i.id).select(DISC_COLS).maybeSingle();
      if (error) fail(error, 'Chưa lưu được phòng thảo luận.');
      if (!data) throw new Error('Thầy cô chưa có quyền sửa phòng này.');
      return toDisc(data as Row);
    }
    const { data, error } = await sb.from('discussions').insert({ ...row, created_by: await this.me() }).select(DISC_COLS).single();
    if (error) fail(error, 'Chưa tạo được phòng thảo luận.');
    return toDisc(data as Row);
  }
  async deleteDiscussion(id: string): Promise<void> {
    const sb = await this.clientP;
    const { error } = await sb.from('discussions').delete().eq('id', id);
    if (error) fail(error, 'Chưa xóa được phòng thảo luận.');
  }

  async stats(classId: string): Promise<Record<string, DiscussionStats>> {
    const sb = await this.clientP;
    const ds = await this.listDiscussions(classId);
    const out: Record<string, DiscussionStats> = {};
    if (!ds.length) return out;
    for (const d of ds) out[d.id] = { total: 0, pending: 0, reports: 0, lastAt: null };
    const { data, error } = await sb.from('discussion_posts').select('id,discussion_id,status,created_at').in('discussion_id', ds.map((d) => d.id)).neq('status', 'removed').limit(5000);
    if (error) fail(error, 'Chưa tải được thống kê.');
    const byPost = new Map<string, string>();
    for (const r of (data ?? []) as Row[]) {
      const s = out[String(r.discussion_id)];
      if (!s) continue;
      byPost.set(String(r.id), String(r.discussion_id));
      if (r.status !== 'hidden') s.total++;
      if (r.status === 'pending') s.pending++;
      if (!s.lastAt || String(r.created_at) > s.lastAt) s.lastAt = String(r.created_at);
    }
    for (const ids of chunks([...byPost.keys()], 200)) {
      const { data: reps } = await sb.from('discussion_reports').select('post_id').in('post_id', ids).is('resolved_at', null);
      for (const r of (reps ?? []) as Row[]) { const d = byPost.get(String(r.post_id)); if (d) out[d].reports++; }
    }
    return out;
  }

  async listPosts(discussionId: string): Promise<DiscussionPost[]> {
    const sb = await this.clientP;
    const me = await this.me();
    const { data, error } = await sb.from('discussion_posts')
      .select(`${POST_COLS},author:profiles!discussion_posts_author_id_fkey(name,avatar_mascot,avatar_color,role)`)
      .eq('discussion_id', discussionId).order('created_at').limit(2000);
    if (error) fail(error, 'Chưa tải được bài thảo luận.');
    const rows = (data ?? []) as Row[];
    const ids = rows.map((r) => String(r.id));
    const reactions = new Map<string, Row[]>();
    const reports = new Map<string, number>();
    for (const part of chunks(ids, 200)) {
      const [{ data: rx }, { data: rp }] = await Promise.all([
        sb.from('discussion_reactions').select('post_id,user_id,kind').in('post_id', part),
        sb.from('discussion_reports').select('post_id').in('post_id', part).is('resolved_at', null),
      ]);
      for (const r of (rx ?? []) as Row[]) reactions.set(String(r.post_id), [...(reactions.get(String(r.post_id)) ?? []), r]);
      for (const r of (rp ?? []) as Row[]) reports.set(String(r.post_id), (reports.get(String(r.post_id)) ?? 0) + 1);
    }
    const paths = rows.flatMap((r) => (r.images as string[] | null) ?? []);
    const urls: Record<string, string> = {};
    for (const part of chunks(paths, 100)) {
      const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(part, 3600);
      for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
    }
    return rows.map((r) => {
      const a = (Array.isArray(r.author) ? r.author[0] : r.author) as Row | null;
      const rc = zero();
      const mine = no();
      for (const x of reactions.get(String(r.id)) ?? []) {
        const k = x.kind as DiscussionReaction;
        if (k in rc) { rc[k]++; if (x.user_id === me) mine[k] = true; }
      }
      return {
        id: String(r.id), discussionId: String(r.discussion_id), roomId: String(r.room_id), tabId: String(r.tab_id ?? ''),
        parentId: (r.parent_id as string | null) ?? null, authorId: String(r.author_id),
        author: { name: String(a?.name ?? 'Bạn'), mascot: (a?.avatar_mascot as string) ?? undefined, color: (a?.avatar_color as string) ?? undefined, role: (a?.role as string) ?? undefined },
        body: String(r.body ?? ''), images: ((r.images as string[] | null) ?? []).map((p) => ({ path: p, url: urls[p] ?? '' })),
        color: (r.color as string | null) ?? null, status: r.status as DiscussionPost['status'], flagged: !!r.flagged,
        createdAt: String(r.created_at), updatedAt: String(r.updated_at), reactions: rc, mine, reports: reports.get(String(r.id)) ?? 0,
      };
    });
  }

  async post(p: NewDiscussionPost): Promise<DiscussionPost> {
    const sb = await this.clientP;
    const me = await this.me();
    const paths: string[] = [];
    for (const f of (p.files ?? []).slice(0, 3)) {
      const img = await compressWorkImage(f);
      const blob = img.blob ?? f;
      const path = `${p.discussionId}/${me}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw new Error('Chưa tải ảnh lên được, em thử lại nhé.');
      paths.push(path);
    }
    const { data, error } = await sb.rpc('post_discussion', {
      p_discussion: p.discussionId, p_room: p.roomId, p_tab: p.tabId, p_parent: p.parentId ?? null, p_body: p.body, p_images: paths, p_color: p.color ?? null,
    });
    if (error) fail(error, 'Chưa đăng được bài.');
    const r = data as Row;
    return {
      id: String(r.id), discussionId: p.discussionId, roomId: p.roomId, tabId: String(r.tab_id ?? ''), parentId: (r.parent_id as string | null) ?? null,
      authorId: me, author: { name: 'Em' }, body: String(r.body ?? ''), images: paths.map((x) => ({ path: x, url: '' })), color: (r.color as string | null) ?? null,
      status: r.status as DiscussionPost['status'], flagged: !!r.flagged, createdAt: String(r.created_at), updatedAt: String(r.updated_at),
      reactions: zero(), mine: no(), reports: 0,
    };
  }
  async editPost(id: string, body: string): Promise<void> {
    const sb = await this.clientP;
    const { error } = await sb.rpc('edit_discussion_post', { p_post: id, p_body: body });
    if (error) fail(error, 'Chưa sửa được bài.');
  }
  async removeMyPost(id: string): Promise<void> {
    const sb = await this.clientP;
    const { error } = await sb.rpc('remove_my_discussion_post', { p_post: id });
    if (error) fail(error, 'Chưa gỡ được bài.');
  }
  async moderate(ids: string[], status: 'visible' | 'hidden' | 'pending'): Promise<number> {
    if (!ids.length) return 0;
    const sb = await this.clientP;
    const { data, error } = await sb.rpc('moderate_discussion_posts', { p_ids: ids, p_status: status });
    if (error) fail(error, 'Chưa duyệt được bài.');
    return Number(data ?? 0);
  }
  async react(postId: string, kind: DiscussionReaction): Promise<boolean> {
    const sb = await this.clientP;
    const { data, error } = await sb.rpc('toggle_discussion_reaction', { p_post: postId, p_kind: kind });
    if (error) fail(error, 'Chưa thả được.');
    return !!data;
  }
  async report(postId: string, reason: string): Promise<void> {
    const sb = await this.clientP;
    const { error } = await sb.rpc('report_discussion_post', { p_post: postId, p_reason: reason });
    if (error) fail(error, 'Chưa báo được.');
  }
  async listWords(classId: string): Promise<DiscussionWord[]> {
    const sb = await this.clientP;
    const { data, error } = await sb.from('discussion_words').select('id,class_id,word').or(`class_id.is.null,class_id.eq.${classId}`).order('word');
    if (error) fail(error, 'Chưa tải được danh sách từ.');
    return ((data ?? []) as Row[]).map((r) => ({ id: String(r.id), classId: (r.class_id as string | null) ?? null, word: String(r.word) }));
  }
  async addWord(classId: string, word: string): Promise<void> {
    const sb = await this.clientP;
    const { error } = await sb.from('discussion_words').insert({ class_id: classId, word: word.trim(), created_by: await this.me() });
    if (error) fail(error, error.code === '23505' ? 'Từ này đã có.' : 'Chưa thêm được từ.');
  }
  async removeWord(id: string): Promise<void> {
    const sb = await this.clientP;
    const { data, error } = await sb.from('discussion_words').delete().eq('id', id).select('id');
    if (error) fail(error, 'Chưa bớt được từ.');
    if (!data?.length) throw new Error('Từ chung của trường chỉ quản trị bớt được.');
  }

  subscribe(discussionId: string, onChange: () => void): () => void {
    let off = () => undefined as void;
    let closed = false;
    void this.clientP.then((sb) => {
      if (closed) return;
      const ch = sb.channel(`discussion:${discussionId}:${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes', { event: '*', schema: 'v2', table: 'discussion_posts', filter: `discussion_id=eq.${discussionId}` }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'v2', table: 'discussion_reactions' }, () => onChange())
        .subscribe();
      off = () => { void sb.removeChannel(ch); };
    });
    return () => { closed = true; off(); };
  }
}
