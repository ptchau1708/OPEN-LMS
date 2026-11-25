/** Luật thuần của Phòng thảo luận (dùng cho bản demo, giao diện và kiểm thử). */
import type { Discussion, DiscussionInput, DiscussionKind, DiscussionPost, DiscussionRoom } from './types';

export const DISCUSSION_BODY_MAX = 1000;
export const DISCUSSION_MAX_IMAGES = 3;
export const DISCUSSION_MAX_ROOMS = 20;
export const DISCUSSION_MAX_TABS = 12;
export const DISCUSSION_RATE_PER_MIN = 10;
export const COMMON_ROOM: DiscussionRoom = { id: 'chung', name: 'Cả lớp', members: [] };
/** Câu trả lời nhanh đã làm sạch: bỏ dòng trống, ≤ 60 kí tự, ≤ 12 câu. */
export const cleanQuickReplies = (list: readonly string[] | undefined): string[] => (list ?? []).map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, 12);

/** Câu trả lời nhanh mặc định của phòng trò chuyện (GV đổi được cho từng phòng). */
export const DEFAULT_QUICK_REPLIES: readonly string[] = ['Em đồng ý! 👍', 'Mình làm phần này nhé!', 'Bạn nói rõ hơn được không?', 'Hay quá! ❤️'];

export const TAB_COLORS = ['#2f6fd1', '#d89e00', '#1f8a4c', '#c43c7a', '#7a4fd1', '#e0662b', '#0f8f8f', '#64748b'];
/** Màu thẻ kiểu Padlet (nền nhạt). */
export const CARD_COLORS = ['#ffffff', '#fff4c2', '#dff3e4', '#e3edff', '#fde4ec', '#efe6ff', '#ffe7d6'];
/** Câu mở đầu gợi ý cho HS. */
export const STARTERS = ['Em nghĩ rằng…', 'Em đồng ý với bạn vì…', 'Em có ý khác:', 'Em muốn hỏi:', 'Theo em, nên…'];

/** Mặc định cho lớp: lớp 1–3 duyệt trước, lớp 4–5 đăng ngay (GV ẩn sau). */
export function defaultModeration(grade: number | undefined): 'pre' | 'post' {
  return (grade ?? 1) >= 4 ? 'post' : 'pre';
}

export const CHAT_TAB = { id: 'chat', name: 'Trò chuyện', color: TAB_COLORS[0] };

export function newDiscussion(classId: string, grade?: number, kind: DiscussionKind = 'board'): DiscussionInput {
  if (kind === 'chat') return newChat(classId, []);
  return {
    classId, kind: 'board', title: '', prompt: '', moderation: defaultModeration(grade), hideOthers: false, opensAt: null, closesAt: null,
    locked: false, pinned: false, archived: false, rooms: [{ ...COMMON_ROOM }],
    tabs: [{ id: 'y-kien', name: 'Ý kiến', color: TAB_COLORS[0] }, { id: 'cau-hoi', name: 'Câu hỏi', color: TAB_COLORS[1] }],
  };
}

/**
 * Phòng trò chuyện nhóm: một phòng nhỏ mỗi tổ (không có tổ → "Cả lớp"), một tab "Trò chuyện", tin nhắn hiện ngay
 * (tin có từ chưa phù hợp vẫn chờ duyệt), mặc định khóa — GV bấm "Mở 15 phút" khi bắt đầu hoạt động nhóm.
 */
export function newChat(classId: string, teams: { id: string; name: string; studentIds: string[] }[]): DiscussionInput {
  const rooms = roomsFromTeams(teams);
  return {
    classId, kind: 'chat', title: 'Trò chuyện nhóm', prompt: '', moderation: 'post', hideOthers: false, opensAt: null, closesAt: null,
    locked: true, pinned: false, archived: false, rooms: rooms.length > 1 ? rooms.slice(1) : rooms, tabs: [{ ...CHAT_TAB }],
  };
}

/** Mở ngay trong `minutes` phút (mở khóa, đặt giờ đóng). */
export function openForMinutes<T extends Pick<Discussion, 'locked' | 'opensAt' | 'closesAt'>>(d: T, minutes: number, now = new Date()): T {
  return { ...d, locked: false, opensAt: now.toISOString(), closesAt: new Date(now.getTime() + minutes * 60_000).toISOString() };
}

/* ---------- Chèn phòng thảo luận vào Trang học: một dòng [[thao-luan:<id>|Tên phòng]] ---------- */
export function discussionEmbedToken(d: Pick<Discussion, 'id' | 'title'>): string {
  return `[[thao-luan:${d.id}|${d.title.replace(/[[\]|\n]/g, ' ').trim()}]]`;
}
export function parseDiscussionEmbed(line: string): { id: string; title: string } | null {
  const m = /^\s*\[\[thao-luan:([A-Za-z0-9-]{1,64})(?:\|([^\]]*))?\]\]\s*$/.exec(line);
  return m ? { id: m[1], title: (m[2] ?? '').trim() || 'Phòng thảo luận' } : null;
}

export function slugId(name: string, taken: string[], prefix = 't'): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || prefix;
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

/** Tạo phòng nhỏ theo tổ của lớp (+ phòng Cả lớp). */
export function roomsFromTeams(teams: { id: string; name: string; studentIds: string[] }[]): DiscussionRoom[] {
  const out: DiscussionRoom[] = [{ ...COMMON_ROOM }];
  for (const t of teams) if (t.studentIds.length) out.push({ id: slugId(t.name, out.map((r) => r.id), 'to'), name: t.name, members: [...t.studentIds] });
  return out.slice(0, DISCUSSION_MAX_ROOMS);
}

export type DiscussionOpenState = 'open' | 'not-yet' | 'closed' | 'locked';
export function discussionState(d: Pick<Discussion, 'locked' | 'archived' | 'opensAt' | 'closesAt'>, now = new Date()): DiscussionOpenState {
  if (d.locked || d.archived) return 'locked';
  if (d.opensAt && now < new Date(d.opensAt)) return 'not-yet';
  if (d.closesAt && now > new Date(d.closesAt)) return 'closed';
  return 'open';
}
export const STATE_LABEL: Record<DiscussionOpenState, string> = { open: 'Đang mở', 'not-yet': 'Chưa mở', closed: 'Đã đóng', locked: 'Đang khóa' };

/** Phòng nhỏ người này vào được (GV: tất cả). */
export function roomsFor(d: Pick<Discussion, 'rooms'>, userId: string, staff: boolean): DiscussionRoom[] {
  return staff ? d.rooms : d.rooms.filter((r) => !r.members.length || r.members.includes(userId));
}

/** Kiểm tra trước khi lưu phòng (cùng ràng buộc với SQL). Trả về câu báo lỗi hoặc null. */
export function discussionProblem(i: DiscussionInput): string | null {
  if (!i.title.trim()) return 'Nhập tên phòng thảo luận.';
  if (i.title.trim().length > 200) return 'Tên phòng dài quá.';
  if (i.prompt.length > 4000) return 'Lời dẫn dài quá.';
  if (!i.rooms.length) return 'Cần ít nhất một phòng nhỏ.';
  if (i.rooms.length > DISCUSSION_MAX_ROOMS) return `Tối đa ${DISCUSSION_MAX_ROOMS} phòng nhỏ.`;
  if (!i.tabs.length) return 'Cần ít nhất một tab đăng bài.';
  if (i.tabs.length > DISCUSSION_MAX_TABS) return `Tối đa ${DISCUSSION_MAX_TABS} tab.`;
  if (i.rooms.some((r) => !r.name.trim()) || i.tabs.some((t) => !t.name.trim())) return 'Đặt tên cho mọi phòng nhỏ và tab.';
  if (new Set(i.rooms.map((r) => r.id)).size !== i.rooms.length || new Set(i.tabs.map((t) => t.id)).size !== i.tabs.length) return 'Trùng mã phòng / tab.';
  if (i.opensAt && i.closesAt && new Date(i.closesAt) <= new Date(i.opensAt)) return 'Giờ đóng phải sau giờ mở.';
  return null;
}

/** Từ cần chặn: khớp NGUYÊN TỪ, không phân biệt hoa thường, GIỮ DẤU ("ngu" không chặn "ngủ") — như v2.discussion_flagged. */
export function flagText(text: string, words: string[]): boolean {
  const t = text.normalize('NFC').toLowerCase();
  return words.some((w) => {
    const ww = w.normalize('NFC').toLowerCase().trim();
    if (!ww) return false;
    const esc = ww.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${esc}($|[^\\p{L}\\p{N}_])`, 'u').test(t);
  });
}
export const DEFAULT_BLOCK_WORDS = ['ngu', 'đồ ngu', 'óc chó', 'mày ngu', 'đần', 'thằng ngu', 'con ngu', 'chết đi', 'cút', 'đm', 'dm', 'vcl', 'vl', 'đéo', 'địt', 'lồn', 'cặc', 'đụ', 'xấu xí', 'đồ khùng'];

/** Bài gốc theo tab + bình luận theo bài. */
export function groupPosts(posts: DiscussionPost[], roomId: string): { byTab: Record<string, DiscussionPost[]>; replies: Record<string, DiscussionPost[]> } {
  const byTab: Record<string, DiscussionPost[]> = {};
  const replies: Record<string, DiscussionPost[]> = {};
  for (const p of posts) {
    if (p.roomId !== roomId) continue;
    if (p.parentId) (replies[p.parentId] = replies[p.parentId] ?? []).push(p);
    else (byTab[p.tabId] = byTab[p.tabId] ?? []).push(p);
  }
  for (const k of Object.keys(byTab)) byTab[k].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const k of Object.keys(replies)) replies[k].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { byTab, replies };
}

/** Số bài đã đăng (không tính gỡ / ẩn) theo HS — để xuất Excel / minh chứng TT27. */
export function participation(posts: DiscussionPost[]): Record<string, { posts: number; replies: number; hearts: number }> {
  const out: Record<string, { posts: number; replies: number; hearts: number }> = {};
  for (const p of posts) {
    if (p.status === 'removed' || p.status === 'hidden') continue;
    const o = (out[p.authorId] = out[p.authorId] ?? { posts: 0, replies: 0, hearts: 0 });
    if (p.parentId) o.replies++; else o.posts++;
    o.hearts += p.reactions.heart + p.reactions.star + p.reactions.like;
  }
  return out;
}
