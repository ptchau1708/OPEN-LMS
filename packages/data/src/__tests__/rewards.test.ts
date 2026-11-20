import { describe, expect, it } from 'vitest';
import { MASCOTS, type RewardEntry } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { addDays, computeWallet, newlyUnlockable, nextUnlock, streakDays } from '../rewards';
import { MemoryStorage } from '../storage';

const NOW = new Date('2026-11-06T10:00:00');

function entry(daysAgo: number, stars: number, userId = 'u'): RewardEntry {
  return { id: `r${Math.random()}`, userId, stars, coins: stars, xp: stars * 10, reason: 'x', sourceType: 'item', at: addDays(NOW, -daysAgo).toISOString() };
}

function demo() {
  return new DemoDataSource({ storage: new MemoryStorage(), now: () => NOW, relayUrl: 'ws://127.0.0.1:1' });
}

describe('quy tắc phần thưởng', () => {
  it('ví: tổng sao, xp, cấp = floor(xp/100)+1', () => {
    const w = computeWallet('u', [entry(0, 7), entry(1, 5), entry(0, 3, 'khac')], NOW);
    expect(w.stars).toBe(12);
    expect(w.xp).toBe(120);
    expect(w.level).toBe(2);
  });

  it('chuỗi ngày: tính tới hôm nay hoặc hôm qua, đứt khi thiếu ngày', () => {
    expect(streakDays([entry(0, 1), entry(1, 1), entry(2, 1)], NOW)).toBe(3);
    expect(streakDays([entry(1, 1), entry(2, 1)], NOW)).toBe(2);
    expect(streakDays([entry(0, 1), entry(2, 1)], NOW)).toBe(1);
    expect(streakDays([entry(3, 1)], NOW)).toBe(0);
  });

  it('mở khóa đúng mốc unlockStars', () => {
    expect(newlyUnlockable(0, ['nghe'])).toEqual([]);
    expect(newlyUnlockable(19, ['nghe'])).toEqual([]);
    expect(newlyUnlockable(20, ['nghe'])).toEqual(['shiba']);
    expect(newlyUnlockable(50, ['nghe'])).toEqual(['shiba', 'panda']);
    expect(newlyUnlockable(10_000, []).length).toBe(MASCOTS.length);
    expect(nextUnlock(36)).toEqual({ mascot: 'panda', starsNeeded: 14 });
  });

  it('award(): ghi sổ, xp mặc định = sao×10, trả newlyUnlocked khi vượt mốc', async () => {
    const ds = demo();
    const w0 = await ds.getWallet('u-an2a1');
    expect(w0.stars).toBe(36);
    expect(w0.level).toBe(4);
    expect(w0.streakDays).toBe(4);
    expect((await ds.getPassport('u-an2a1')).unlocked).toEqual(['nghe', 'shiba']);

    const r1 = await ds.award({ userId: 'u-an2a1', stars: 13, coins: 0, xp: 0, reason: 'Thử', sourceType: 'bonus' });
    expect(r1.wallet.stars).toBe(49);
    expect(r1.wallet.xp).toBe(490);
    expect(r1.newlyUnlocked).toEqual([]);
    const r2 = await ds.award({ userId: 'u-an2a1', stars: 1, coins: 1, xp: 0, reason: 'Thử', sourceType: 'bonus' });
    expect(r2.newlyUnlocked).toEqual(['panda']);
    expect((await ds.getPassport('u-an2a1')).unlocked).toEqual(['nghe', 'shiba', 'panda']);
    const r3 = await ds.award({ userId: 'u-an2a1', stars: 2, coins: 0, xp: 0, reason: 'Thử', sourceType: 'bonus' });
    expect(r3.newlyUnlocked).toEqual([]);
  });

  it('HS mới: hộ chiếu bắt đầu với Nghé Tí; chưa mở thì không chọn được', async () => {
    const ds = demo();
    const pp = await ds.getPassport('u-em1b1');
    expect(pp).toEqual({ userId: 'u-em1b1', unlocked: ['nghe'], companion: 'nghe' });
    await expect(ds.setCompanion('u-em1b1', 'shiba')).rejects.toThrow(/mở khóa/);
    const an = await ds.setCompanion('u-an2a1', 'shiba');
    expect(an.companion).toBe('shiba');
  });
});
