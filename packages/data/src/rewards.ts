/**
 * Quy tắc phần thưởng (thuần, dùng chung cho demo và kiểm thử).
 * - xp mặc định = sao × 10; cấp = floor(xp / 100) + 1.
 * - Chuỗi ngày học = số ngày liên tiếp có phần thưởng, tính tới hôm nay (hoặc hôm qua nếu hôm nay chưa học).
 * - Hộ chiếu: mở khóa theo mốc sao cố định trong MASCOTS, không ngẫu nhiên.
 */
import { MASCOTS, type MascotId, type RewardEntry, type Wallet } from '@openedu/contracts';

/** Ngày theo giờ máy (YYYY-MM-DD). */
export function dayKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

export function streakDays(entries: Pick<RewardEntry, 'at'>[], now: Date = new Date()): number {
  const days = new Set(entries.map((e) => dayKey(e.at)));
  let cursor = days.has(dayKey(now)) ? now : addDays(now, -1);
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function levelForXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / 100) + 1;
}

export function computeWallet(userId: string, entries: RewardEntry[], now: Date = new Date()): Wallet {
  let stars = 0;
  let coins = 0;
  let xp = 0;
  for (const e of entries) {
    if (e.userId !== userId) continue;
    stars += e.stars || 0;
    coins += e.coins || 0;
    xp += e.xp || 0;
  }
  stars = Math.max(0, stars);
  coins = Math.max(0, coins);
  xp = Math.max(0, xp);
  return { userId, stars, coins, xp, level: levelForXp(xp), streakDays: streakDays(entries.filter((e) => e.userId === userId && e.sourceType !== 'shop'), now) };
}

/** Điền xp mặc định (sao × 10) khi không có hoặc bằng 0 mà có sao. */
export function normalizeReward<T extends Pick<RewardEntry, 'stars' | 'coins' | 'xp'>>(e: T): T {
  const stars = Number.isFinite(e.stars) ? e.stars : 0;
  const coins = Number.isFinite(e.coins) ? e.coins : 0;
  const xp = typeof e.xp === 'number' && Number.isFinite(e.xp) && e.xp !== 0 ? e.xp : Math.max(0, stars) * 10;
  return { ...e, stars, coins, xp };
}

/** Linh vật đủ sao để mở mà chưa có, theo thứ tự MASCOTS. */
export function newlyUnlockable(totalStars: number, unlocked: readonly MascotId[]): MascotId[] {
  return MASCOTS.filter((m) => m.unlockStars <= totalStars && !unlocked.includes(m.id)).map((m) => m.id);
}

/** Mốc tiếp theo (để hiện "còn 14 sao nữa để gặp Gấu trúc Mập"). */
export function nextUnlock(totalStars: number): { mascot: MascotId; starsNeeded: number } | null {
  const m = MASCOTS.find((x) => x.unlockStars > totalStars);
  return m ? { mascot: m.id, starsNeeded: m.unlockStars - totalStars } : null;
}
