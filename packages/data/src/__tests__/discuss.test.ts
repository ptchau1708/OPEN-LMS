import { describe, expect, it } from 'vitest';
import type { AnyResponse, Item, ScoreResult } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { DemoDiscussSource } from '../discuss/demo';
import { discussionEmbedToken, discussionProblem, discussionState, flagText, groupPosts, newChat, newDiscussion, openForMinutes, parseDiscussionEmbed, participation, roomsFromTeams, slugId } from '../discuss';
import { MemoryStorage } from '../storage';

const NOW = new Date('2026-11-23T09:00:00+07:00');
const fakeScore = (_i: Item, _r: AnyResponse | undefined): ScoreResult => ({ graded: true, correct: true, score: 1 });
const demo = () => new DemoDataSource({ storage: new MemoryStorage(), now: () => NOW, relayUrl: 'ws://127.0.0.1:1', score: fakeScore });

describe('thảo luận — luật', () => {
  it('lọc từ: nguyên từ, giữ dấu', () => {
    expect(flagText('Bạn NGU quá', ['ngu'])).toBe(true);
    expect(flagText('Em đi ngủ sớm', ['ngu'])).toBe(false);
    expect(flagText('Nguyễn Văn An', ['ngu'])).toBe(false);
    expect(flagText('đồ ngu!', ['đồ ngu'])).toBe(true);
  });
  it('phòng nhỏ theo tổ, mã không trùng, kiểm tra trước khi lưu, trạng thái giờ mở', () => {
    const rooms = roomsFromTeams([{ id: 'a', name: 'Tổ 1', studentIds: ['u1'] }, { id: 'b', name: 'Tổ 1', studentIds: ['u2'] }, { id: 'c', name: 'Trống', studentIds: [] }]);
    expect(rooms.map((r) => r.id)).toEqual(['chung', 'to-1', 'to-1-2']);
    expect(slugId('Câu hỏi', [])).toBe('cau-hoi');
    const d = newDiscussion('c', 2);
    expect(d.moderation).toBe('pre');
    expect(newDiscussion('c', 5).moderation).toBe('post');
    expect(discussionProblem(d)).toMatch(/tên phòng/);
    expect(discussionProblem({ ...d, title: 'x', tabs: [] })).toMatch(/tab/);
    expect(discussionProblem({ ...d, title: 'x', opensAt: '2026-11-23T10:00:00Z', closesAt: '2026-11-23T09:00:00Z' })).toMatch(/Giờ đóng/);
    expect(discussionState({ ...d, opensAt: '2026-12-01T00:00:00Z' }, NOW)).toBe('not-yet');
    expect(discussionState({ ...d, locked: true }, NOW)).toBe('locked');
  });
});

describe('thảo luận — bản demo', () => {
  it('HS 2A đăng → chờ duyệt; GV duyệt; bạn khác thấy, thả tim, bình luận; phòng nhỏ riêng tổ', async () => {
    const ds = demo();
    const src = new DemoDiscussSource(ds);
    await ds.signIn('an2a1', '123456');
    const [d] = await src.listDiscussions('c-2a');
    expect(d.rooms.map((r) => r.name)).toEqual(['Cả lớp', 'Tổ Mặt Trời', 'Tổ Cầu Vồng']);
    const before = await src.listPosts(d.id);
    expect(before.some((p) => p.status === 'pending' && p.authorId !== 'u-an2a1')).toBe(false);
    const mine = await src.post({ discussionId: d.id, roomId: 'chung', tabId: 'y-kien', body: 'Em trồng cây ở nhà' });
    expect(mine.status).toBe('pending');
    await expect(src.post({ discussionId: d.id, roomId: d.rooms[2].id, tabId: 'y-kien', body: 'vào tổ khác' })).rejects.toThrow(/phòng nhỏ/);
    await ds.signIn('binh2a2', '123456');
    expect((await src.listPosts(d.id)).some((p) => p.id === mine.id)).toBe(false);
    await ds.signIn('colan', '123456');
    const st = (await src.stats('c-2a'))[d.id];
    expect(st.pending).toBeGreaterThanOrEqual(3);
    expect(await src.moderate([mine.id], 'visible')).toBe(1);
    await ds.signIn('binh2a2', '123456');
    expect(await src.react(mine.id, 'heart')).toBe(true);
    await src.post({ discussionId: d.id, roomId: 'chung', tabId: '', parentId: mine.id, body: 'Hay quá' });
    const { byTab, replies } = groupPosts(await src.listPosts(d.id), 'chung');
    expect(byTab['y-kien'].find((p) => p.id === mine.id)?.reactions.heart).toBe(1);
    expect(replies[mine.id]?.length).toBe(1);
    // GV khóa phòng → HS không đăng
    await ds.signIn('colan', '123456');
    await src.saveDiscussion({ ...d, locked: true });
    await ds.signIn('an2a1', '123456');
    await expect(src.post({ discussionId: d.id, roomId: 'chung', tabId: 'y-kien', body: 'còn mở?' })).rejects.toThrow(/khóa/);
    // phụ huynh chỉ thấy bài đã hiện của con
    await ds.signIn('phuhuynh', '123456');
    const seen = await src.listPosts(d.id);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((p) => p.authorId === 'u-an2a1' && p.status === 'visible')).toBe(true);
    expect(participation(seen)['u-an2a1'].posts).toBeGreaterThanOrEqual(1);
  });
  it('lớp khác không thấy; từ chưa phù hợp → chờ duyệt dù phòng đăng ngay', async () => {
    const ds = demo();
    const src = new DemoDiscussSource(ds);
    await ds.signIn('hai4a1', '123456');
    expect(await src.listDiscussions('c-2a')).toEqual([]);
    const [d] = await src.listDiscussions('c-4a');
    expect(d.moderation).toBe('post');
    expect((await src.post({ discussionId: d.id, roomId: 'chung', tabId: 'y-kien', body: 'Em tắt vòi nước' })).status).toBe('visible');
    const bad = await src.post({ discussionId: d.id, roomId: 'chung', tabId: 'y-kien', body: 'bạn ngu thế' });
    expect([bad.status, bad.flagged]).toEqual(['pending', true]);
  });
});

describe('trò chuyện nhóm (SQL 16)', () => {
  it('phòng theo tổ, mở N phút, mã chèn Trang học', () => {
    const c = newChat('c', [{ id: 'a', name: 'Tổ 1', studentIds: ['u1'] }, { id: 'b', name: 'Tổ 2', studentIds: ['u2'] }]);
    expect([c.kind, c.locked, c.moderation, c.tabs.map((t) => t.id), c.rooms.map((r) => r.name)]).toEqual(['chat', true, 'post', ['chat'], ['Tổ 1', 'Tổ 2']]);
    expect(newChat('c', []).rooms.map((r) => r.id)).toEqual(['chung']);
    const o = openForMinutes(c, 15, NOW);
    expect(o.locked).toBe(false);
    expect(Date.parse(o.closesAt!) - Date.parse(o.opensAt!)).toBe(15 * 60_000);
    expect(discussionState(o, new Date(NOW.getTime() + 16 * 60_000))).toBe('closed');
    const tok = discussionEmbedToken({ id: 'dc-1', title: 'Bảo vệ [môi] trường' });
    expect(parseDiscussionEmbed(tok)).toEqual({ id: 'dc-1', title: 'Bảo vệ  môi  trường' });
    expect(parseDiscussionEmbed('chữ thường')).toBeNull();
  });

  it('hai HS cùng lúc: An nghe thay đổi, Chi (cùng tổ) nhắn → An nhận ngay; tổ khác không thấy', async () => {
    const shared = new MemoryStorage();
    const dsA = demo();
    const dsB = demo();
    const dsC = demo();
    const a = new DemoDiscussSource(dsA, shared);
    const b = new DemoDiscussSource(dsB, shared);
    const c = new DemoDiscussSource(dsC, shared);
    await dsA.signIn('an2a1', '123456');
    await dsB.signIn('chi2a3', '123456');
    const chat = (await a.listDiscussions('c-2a')).find((x) => x.kind === 'chat')!;
    const roomA = chat.rooms.find((r) => r.members.includes('u-an2a1'))!;
    expect(roomA.members).toContain('u-chi2a3');
    let pinged = 0;
    const off = a.subscribe(chat.id, () => { pinged++; });
    await a.post({ discussionId: chat.id, roomId: roomA.id, tabId: 'chat', body: 'Chào tổ mình!' });
    const before = pinged;
    await b.post({ discussionId: chat.id, roomId: roomA.id, tabId: 'chat', body: 'Chào An!' });
    expect(pinged).toBeGreaterThan(before);
    expect((await a.listPosts(chat.id)).some((p) => p.body === 'Chào An!' && p.status === 'visible')).toBe(true);
    off();
    // HS tổ khác không thấy tin của tổ An
    const other = chat.rooms.find((r) => !r.members.includes('u-an2a1'))!;
    const outsider = other.members.find((m) => m !== 'u-an2a1')!;
    const u = (await import('../seed/users')).DEMO_USERS.find((x) => x.id === outsider)!;
    await dsC.signIn(u.username ?? '', '123456');
    expect((await c.listPosts(chat.id)).some((p) => p.body === 'Chào tổ mình!')).toBe(false);
  });
});
