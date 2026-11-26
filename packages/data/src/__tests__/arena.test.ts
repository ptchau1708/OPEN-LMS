import { beforeEach, describe, expect, it } from 'vitest';
import type { CupMatch } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import {
  arenaOpenAt, bracketSize, buildFirstRound, buildNextRound, daysText, decideMatch, getArenaSource, hoursText, nextOpening, placements,
  roundName, roundsFor, seedPositions,
} from '../arena';

// localStorage giả cho nguồn demo Đấu trường (môi trường kiểm thử là Node).
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
};

describe('nhánh đấu loại trực tiếp (giống SQL 22)', () => {
  it('kích thước nhánh, số vòng, thứ tự hạt giống', () => {
    expect([2, 3, 5, 8, 9, 35].map(bracketSize)).toEqual([2, 4, 8, 8, 16, 64]);
    expect(roundsFor(35)).toBe(6);
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(roundName(3, 3)).toBe('Chung kết');
    expect(roundName(2, 3)).toBe('Bán kết');
    expect(roundName(1, 5)).toBe('Vòng 1');
  });
  it('5 bạn: 3 bạn hạt giống cao được miễn đấu vòng 1, hạt giống 4 gặp 5', () => {
    const r1 = buildFirstRound(['a', 'b', 'c', 'd', 'e'].map((u, i) => ({ userId: u, seed: i + 1 })));
    expect(r1).toHaveLength(4);
    expect(r1.filter((m) => m.decidedBy === 'bye').map((m) => m.winner)).toEqual(['a', 'b', 'c']);
    const real = r1.find((m) => m.status === 'open')!;
    expect([real.p1, real.p2]).toEqual(['d', 'e']);
  });
  it('quyết định trận: đúng nhiều hơn thắng; bằng nhau xét điểm, thời gian, hạt giống; luật hết giờ', () => {
    const m: CupMatch = { round: 1, slot: 0, p1: 'a', p2: 'b', status: 'open' };
    const r = (answered: number, correct: number, points: number, ms: number) => ({ answered, correct, points, ms });
    expect(decideMatch(m, { p1: r(3, 2, 280, 9000) }, {}, 3, false)).toBeNull();
    expect(decideMatch(m, { p1: r(3, 2, 290, 9000), p2: r(3, 3, 300, 30000) }, { p1: 1, p2: 2 }, 3, false)!.winner).toBe('b');
    expect(decideMatch(m, { p1: r(3, 2, 290, 9000), p2: r(3, 2, 280, 8000) }, { p1: 1, p2: 2 }, 3, false)!.winner).toBe('a');
    expect(decideMatch(m, { p1: r(3, 2, 280, 9000), p2: r(3, 2, 280, 9000) }, { p1: 2, p2: 1 }, 3, false)!.winner).toBe('b');
    expect(decideMatch(m, {}, { p1: 2, p2: 1 }, 3, true)).toMatchObject({ winner: 'b', decidedBy: 'seed' });
    expect(decideMatch(m, { p1: r(1, 0, 0, 20000) }, { p1: 2, p2: 1 }, 3, true)).toMatchObject({ winner: 'a', decidedBy: 'walkover' });
    expect(decideMatch(m, {}, {}, 3, false, 'b')).toMatchObject({ winner: 'b', decidedBy: 'teacher' });
  });
  it('vòng sau và thứ hạng: vô địch, á quân, đồng hạng ba', () => {
    const done = (round: number, slot: number, p1: string, p2: string | undefined, winner: string): CupMatch => ({ round, slot, p1, ...(p2 ? { p2 } : {}), winner, status: 'done' });
    const r1 = [done(1, 0, 'a', undefined, 'a'), done(1, 1, 'd', 'e', 'e'), done(1, 2, 'b', undefined, 'b'), done(1, 3, 'c', 'f', 'c')];
    const r2 = buildNextRound(r1);
    expect(r2.map((m) => [m.p1, m.p2])).toEqual([['a', 'e'], ['b', 'c']]);
    const all = [...r1, done(2, 0, 'a', 'e', 'e'), done(2, 1, 'b', 'c', 'b'), done(3, 0, 'e', 'b', 'b')];
    expect(placements(all, 3)).toEqual({ champion: 'b', runnerUp: 'e', thirds: ['a', 'c'] });
  });
});

describe('giờ mở cửa (giờ Việt Nam)', () => {
  const H = [{ days: [1, 2, 3, 4, 5], from: '19:00', to: '21:00' }];
  it('mở / đóng đúng khung giờ', () => {
    expect(arenaOpenAt([], new Date())).toBe(true);
    expect(arenaOpenAt(H, new Date('2026-11-30T13:00:00Z'))).toBe(true); // thứ Hai 20:00 VN
    expect(arenaOpenAt(H, new Date('2026-11-30T14:00:00Z'))).toBe(false); // 21:00
    expect(arenaOpenAt(H, new Date('2026-11-29T13:00:00Z'))).toBe(false); // Chủ nhật
  });
  it('chữ hiển thị và lần mở kế tiếp', () => {
    expect(hoursText(H)).toBe('T2–T6 19:00–21:00');
    expect(daysText([1, 3, 5])).toBe('T2, T4, T6');
    expect(daysText([1, 2, 3, 4, 5, 6, 7])).toBe('Hằng ngày');
    expect(nextOpening(H, new Date('2026-11-29T05:00:00Z'))!.toISOString()).toBe('2026-11-30T12:00:00.000Z');
  });
});

describe('Đấu trường bản demo', () => {
  beforeEach(() => mem.clear());
  it('GV mở giải cho lớp, đóng vòng đến hết → có vô địch, á quân, hạng ba; HS xem được, đấu được', async () => {
    const ds = new DemoDataSource({ storage: new MemoryStorage(), relayUrl: 'ws://127.0.0.1:1' });
    await ds.signIn('cothu', '123456');
    const me = (await ds.getCurrentUser())!;
    const cls = (await ds.listClasses(me.id))[0]!;
    const arena = getArenaSource(ds);
    await expect(arena.saveSettings(cls.id, { hours: [{ days: [1], from: '21:00', to: '19:00' }] })).rejects.toThrow(/Khung giờ/);
    const st = await arena.saveSettings(cls.id, { scope: 'grade', hours: [{ days: [1, 2], from: '19:00', to: '21:00' }] });
    expect(st.scope).toBe('grade');
    const items = (await ds.listItems({ grade: cls.grade })).filter((i) => i.type === 'MCQ');
    const subject = items[0]!.subject;
    let cup = await arena.createCup({ title: 'Giải thử', scope: 'class', classId: cls.id, subject, source: 'auto', itemIds: [], questions: 3,
      seeding: 'random', entry: 'all', roundMinutes: 30, pace: 'continuous' });
    expect(cup.status).toBe('running');
    const n = (await ds.listStudents(cls.id)).length;
    expect(cup.players).toHaveLength(n);
    expect(cup.rounds).toBe(roundsFor(n));
    for (let i = 0; i < 10 && cup.status === 'running'; i++) cup = await arena.closeRound(cup.id);
    expect(cup.status).toBe('finished');
    expect(cup.champion).toBeTruthy();
    expect(cup.runnerUp).toBeTruthy();
    const board = await arena.board(cls.id);
    expect(board.rows.find((r) => r.userId === cup.champion)!.points).toBeGreaterThanOrEqual(10);
    const season = await arena.endSeason(cls.id, 'Mùa thử');
    expect(season.top[0]!.rank).toBe(1);
    expect((await arena.board(cls.id)).rows.every((r) => r.points === 0 || r.played > 0)).toBe(true);
  });
  it('HS demo: có sẵn giải thử, vào trận, đấu xong là thấy kết quả và vòng sau', async () => {
    const ds = new DemoDataSource({ storage: new MemoryStorage(), relayUrl: 'ws://127.0.0.1:1' });
    const kid = (await ds.listDemoUsers()).find((u) => u.role === 'student' && u.grade)!;
    await ds.signIn(kid.username!, '123456').catch(async () => ds.signIn(kid.username!, '000000'));
    const arena = getArenaSource(ds);
    const [cup] = await arena.listCups();
    expect(cup!.title).toContain('demo');
    expect(cup!.status).toBe('running');
    const play = await arena.play(cup!.id);
    expect(play.items.length).toBe(play.duel.itemIds.length);
    expect(play.items.every((i) => i.key === undefined)).toBe(true);
    for (let q = 0; q < play.items.length; q++) await arena.skip(play, q);
    const after = await arena.done(cup!.id);
    const mine = after.matches.find((m) => m.round === play.round && m.slot === play.slot)!;
    expect(mine.status).toBe('done');
    const board = await arena.board();
    expect(board.rows.length).toBeLessThanOrEqual(10);
  });
});
