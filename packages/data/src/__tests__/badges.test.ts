import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BADGES, SHOP_ITEMS, SHOP_ITEM_BY_ID, type BehaviorLog, type LearningEvent, type RewardEntry } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import { computeWallet } from '../rewards';
import {
  assembleGarden,
  badgeProgress,
  badgeStatsFrom,
  checkPurchase,
  coinsForStars,
  defaultGoalTarget,
  defaultPlant,
  goalStage,
  longestRun,
  newlyEarnedBadges,
  personalStage,
  purchaseEntry,
  starsSince,
  type GardenRaw,
} from '../badges';
import { DemoRewardsSource } from '../badges/demo';

const U = 'u1';
let n = 0;
const rw = (p: Partial<RewardEntry>): RewardEntry => ({ id: `r${++n}`, userId: U, stars: 1, coins: 1, xp: 10, reason: 'x', sourceType: 'item', at: '2026-11-10T03:00:00Z', ...p });
const ev = (p: Partial<LearningEvent>): LearningEvent => ({ id: `e${++n}`, userId: U, verb: 'completed', objectType: 'lesson', objectId: 'l1', at: '2026-11-10T03:00:00Z', ...p });
const day = (d: number) => new Date(Date.UTC(2026, 10, d, 3)).toISOString();

describe('quy tắc huy hiệu', () => {
  it('chuỗi ngày dài nhất', () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-05'])).toBe(3);
    expect(longestRun(['2026-10-31', '2026-11-01'])).toBe(2);
  });

  it('tính số liệu và huy hiệu từ sự kiện / sổ thưởng / thi đua', () => {
    const rewards = [
      rw({ at: day(1) }), rw({ at: day(2) }), rw({ at: day(3) }),
      rw({ at: day(9), sourceType: 'shop', stars: 0, coins: -20, xp: 0 }),
      rw({ sourceType: 'lesson', sourceId: 'l1' }), rw({ sourceType: 'lesson', sourceId: 'l2' }), rw({ sourceType: 'lesson', sourceId: 'l3' }),
      rw({ sourceType: 'work', sourceId: 's1' }),
      ...Array.from({ length: 10 }, (_, i) => rw({ sourceType: 'arena', sourceId: `it${i}@arena` })),
      rw({ sourceType: 'arena', sourceId: 'duel:d1' }),
      rw({ sourceType: 'live', sourceId: 'x' }),
    ];
    const events = [
      ev({ objectType: 'remediation', objectId: 'set1', result: { correct: true } }),
      ev({ objectType: 'remediation', objectId: 'set2', result: { correct: false } }),
      ev({ verb: 'answered', objectType: 'work', objectId: 'work:s1', result: { correct: true, response: { level: 'T' } } }),
      ev({ verb: 'answered', objectType: 'work', objectId: 'work:s1:sai', result: { correct: false, response: { level: 'T' } } }),
      ev({ objectType: 'arena', objectId: 'duel:d1', result: { correct: true } }),
      ev({ objectType: 'arena', objectId: 'duel:d2', result: { correct: false } }),
    ];
    const logs: BehaviorLog[] = [
      { id: 'b1', studentId: U, classId: 'c', behaviorId: 'bh-giup-ban', points: 2, at: day(4), by: 't' },
      { id: 'b2', studentId: U, classId: 'c', behaviorId: 'bh-x', points: 3, at: day(4), by: 't' },
      { id: 'b3', studentId: U, classId: 'c', behaviorId: 'bh-noi', points: -1, at: day(4), by: 't' },
    ];
    const s = badgeStatsFrom({ userId: U, events, rewards, behaviorLogs: logs, behaviors: [{ id: 'bh-x', classId: 'c', label: 'Giúp bạn đọc bài', points: 3, icon: '', kind: 'positive' }], lessonSubject: { l1: 'toan', l2: 'toan', l3: 'toan' } });
    expect(s).toMatchObject({ lessons: 3, remediationPassed: 1, workApproved: 1, workTop: 1, duels: 2, duelWins: 1, towerCorrect: 10, behaviorPoints: 5, helpCount: 2, liveClasses: 1 });
    expect(s.lessonsBySubject.toan).toBe(3);
    expect(s.bestStreak).toBe(3);
    const got = newlyEarnedBadges(s, ['lesson-1']);
    expect(got).toEqual(expect.arrayContaining(['streak-3', 'toan-3', 'rem-1', 'work-1', 'work-top', 'duel-1', 'tower-10', 'live-1', 'help-1']));
    expect(got).not.toContain('lesson-1');
    expect(got).not.toContain('streak-7');
    const p = badgeProgress(s).find((x) => x.badgeId === 'behavior-10');
    expect(p).toMatchObject({ value: 5, min: 10, earned: false });
  });

  it('khớp bảng v2.badges / v2.shop_items trong migration', () => {
    const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/20261113000009_v2_rewards.sql'), 'utf8');
    for (const b of BADGES) {
      const re = new RegExp(`\\('${b.id}', '${b.category}', '[^']+', '[^']*', '${b.glyph}', ${b.tier}, '${b.rule.kind}', ${b.rule.min}, ${b.rule.subject ? `'${b.rule.subject}'` : 'null'},`);
      expect(re.test(sql), b.id).toBe(true);
    }
    for (const i of SHOP_ITEMS) expect(sql.includes(`('${i.id}', '${i.slot}', '${i.name}', ${i.price},`), i.id).toBe(true);
    expect(BADGES.length).toBe(24);
    expect(SHOP_ITEMS.length).toBe(20);
  });
});

describe('xu', () => {
  it('1 sao = 1 xu, kiểm tra mua', () => {
    expect(coinsForStars(7.8)).toBe(7);
    expect(coinsForStars(-3)).toBe(0);
    const hat = SHOP_ITEM_BY_ID['hat-crown'];
    expect(checkPurchase(39, hat, [])).toEqual({ ok: false, reason: 'poor', need: 1 });
    expect(checkPurchase(40, hat, [])).toEqual({ ok: true, after: 0 });
    expect(checkPurchase(100, hat, ['hat-crown'])).toMatchObject({ ok: false, reason: 'owned' });
    expect(checkPurchase(100, undefined, [])).toMatchObject({ ok: false, reason: 'unknown' });
  });
  it('dòng mua trừ xu, không trừ sao, không tính là ngày học', () => {
    const e = purchaseEntry(U, SHOP_ITEM_BY_ID['hat-party']);
    expect(e).toMatchObject({ stars: 0, coins: -15, xp: 0, sourceType: 'shop' });
    const now = new Date('2026-11-12T05:00:00Z');
    const w = computeWallet(U, [rw({ at: '2026-11-10T05:00:00Z', stars: 20, coins: 20 }), { ...e, id: 'x', at: now.toISOString() }], now);
    expect(w.coins).toBe(5);
    expect(w.stars).toBe(20);
    expect(w.streakDays).toBe(0);
  });
});

describe('Vườn lớp', () => {
  it('mốc lớn lên', () => {
    expect([0, 1, 4, 5, 11, 12, 19, 20, 99].map(personalStage)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect([0, 0.01, 0.24, 0.25, 0.59, 0.6, 0.99, 1, 1.5].map(goalStage)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(defaultGoalTarget(1)).toBe(50);
    expect(defaultGoalTarget(33)).toBe(830);
    expect(defaultPlant('2026-11-09T17:00:00.000Z')).toBe(defaultPlant('2026-11-09T17:00:00.000Z'));
  });
  it('sao trong tuần và ghép vườn (tổ lớp 1–3, HS chỉ thấy mình)', () => {
    const s = starsSince([rw({ at: '2026-11-08T00:00:00Z', stars: 9 }), rw({ at: '2026-11-10T00:00:00Z', stars: 4 }), rw({ userId: 'u2', at: '2026-11-11T00:00:00Z', stars: 6 })], '2026-11-09T17:00:00.000Z');
    expect(s).toEqual({ u1: 4, u2: 6 });
    const raw: GardenRaw = {
      classId: 'c', className: '2A', grade: 2, weekStart: '2026-11-09T17:00:00.000Z', goal: { targetStars: 100, plant: 'sen', custom: true },
      classStars: 60, studentCount: 4, students: [],
      teams: [{ id: 't1', name: 'Tổ 1', color: '#f00', stars: 50, members: 2 }, { id: 't2', name: 'Tổ 2', color: '#00f', stars: 10, members: 2 }],
      collection: [], me: { id: 'u1', stars: 12, teamId: 't1' },
    };
    const g = assembleGarden(raw);
    expect(g.teamMode).toBe(true);
    expect(g.stage).toBe(3);
    expect(g.plots.filter((p) => p.kind === 'student')).toEqual([{ id: 'u1', kind: 'student', stars: 12, stage: 3, isMe: true }]);
    expect(g.plots.find((p) => p.id === 't1')).toMatchObject({ stage: 4, isMe: true });
    expect(g.plots.find((p) => p.id === 't2')).toMatchObject({ stage: 1 });
    expect(assembleGarden({ ...raw, grade: 4 }).teamMode).toBe(false);
  });
});

describe('DemoRewardsSource', () => {
  const clock = new Date('2026-11-12T10:00:00+07:00');
  const setup = () => {
    const ds = new DemoDataSource({ storage: new MemoryStorage(), now: () => clock, relayUrl: 'ws://127.0.0.1:1', score: () => ({ graded: true, correct: true, score: 1 }) });
    return { ds, rs: new DemoRewardsSource(ds) };
  };

  it('xét huy hiệu: lần đầu không dồn chúc mừng, sau đó có huy hiệu mới', async () => {
    const { ds, rs } = setup();
    await ds.signIn('an2a1', '123456');
    const first = await rs.evaluateBadges('u-an2a1');
    expect(first.every((b) => b.badgeId === 'cua-co')).toBe(true); // chỉ huy hiệu của thầy/cô (mẫu) chưa xem
    await rs.markBadgesSeen('u-an2a1', first.map((b) => b.id));
    expect(await rs.evaluateBadges('u-an2a1')).toEqual([]);
    for (const id of ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9', 'x10']) {
      await ds.award({ userId: 'u-an2a1', stars: 1, coins: 1, xp: 10, reason: 't', sourceType: 'arena', sourceId: `${id}@arena` });
    }
    const shelf0 = await rs.getBadgeShelf('u-an2a1');
    const hadTower = shelf0.earned.some((b) => b.badgeId === 'tower-10');
    const next = await rs.evaluateBadges('u-an2a1');
    if (!hadTower) expect(next.map((b) => b.badgeId)).toContain('tower-10');
  });

  it('mua / mặc đồ bằng xu; không đủ xu thì báo', async () => {
    const { ds, rs } = setup();
    await ds.signIn('an2a1', '123456');
    const s0 = await rs.getShop('u-an2a1');
    await expect(rs.equipItem('u-an2a1', 'hat', 'hat-wizard')).rejects.toThrow(/đổi xu/);
    await ds.award({ userId: 'u-an2a1', stars: 60, coins: 60, xp: 0, reason: 't', sourceType: 'bonus' });
    const s1 = await rs.buyItem('u-an2a1', 'hat-wizard');
    expect(s1.coins).toBe(s0.coins + 60 - 50);
    expect(s1.owned).toContain('hat-wizard');
    await expect(rs.buyItem('u-an2a1', 'hat-wizard')).rejects.toThrow(/đã có/);
    const s2 = await rs.equipItem('u-an2a1', 'hat', 'hat-wizard');
    expect(s2.outfit.hat).toBe('hat-wizard');
    expect((await rs.equipItem('u-an2a1', 'hat', null)).outfit.hat).toBeUndefined();
    const big = SHOP_ITEMS.find((i) => i.price > s2.coins && !s2.owned.includes(i.id));
    if (big) await expect(rs.buyItem('u-an2a1', big.id)).rejects.toThrow(/cần thêm/);
  });

  it('vườn lớp: HS chỉ thấy mình, GV đặt mục tiêu và tặng huy hiệu', async () => {
    const { ds, rs } = setup();
    await ds.signIn('an2a1', '123456');
    const g = await rs.getClassGarden('c-2a');
    expect(g.plots.filter((p) => p.kind === 'student').map((p) => p.id)).toEqual(['u-an2a1']);
    expect(g.teamMode).toBe(true);
    await expect(rs.setGardenGoal({ classId: 'c-2a', targetStars: 30, plant: 'cuc' })).rejects.toThrow();
    await expect(rs.getClassGarden('c-4a')).rejects.toThrow();
    await ds.signIn('colan', '123456');
    const t = await rs.setGardenGoal({ classId: 'c-2a', targetStars: 10, plant: 'cuc' });
    expect(t.goal).toMatchObject({ targetStars: 10, plant: 'cuc', custom: true });
    expect(t.plots.filter((p) => p.kind === 'student').length).toBe(4);
    const granted = await rs.grantTeacherBadge({ classId: 'c-2a', studentIds: ['u-binh2a2', 'u-hai4a1'], title: 'Chăm chỉ', glyph: 'star' });
    expect(granted.map((b) => b.userId)).toEqual(['u-binh2a2']);
    await expect(rs.grantTeacherBadge({ classId: 'c-2a', studentIds: ['u-binh2a2'], title: 'x', glyph: 'bolt' })).rejects.toThrow();
  });
});
