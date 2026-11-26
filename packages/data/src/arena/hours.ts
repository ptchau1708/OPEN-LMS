/** Giờ mở cửa Đấu trường (giờ Việt Nam, UTC+7, không đổi giờ mùa hè) — giống SQL 22 v2._arena_open. */
import type { ArenaHours } from '@openedu/contracts';

export const DAY_SHORT: Record<number, string> = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };
export const DAY_LONG: Record<number, string> = { 1: 'Thứ Hai', 2: 'Thứ Ba', 3: 'Thứ Tư', 4: 'Thứ Năm', 5: 'Thứ Sáu', 6: 'Thứ Bảy', 7: 'Chủ nhật' };
const pad = (n: number) => String(n).padStart(2, '0');

/** Thứ (1 = thứ Hai … 7 = Chủ nhật) và giờ 'HH:MM' theo giờ Việt Nam. */
export function vnClock(d: Date = new Date()): { dow: number; hm: string } {
  const v = new Date(d.getTime() + 7 * 3600_000);
  const day = v.getUTCDay();
  return { dow: day === 0 ? 7 : day, hm: `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` };
}

export function arenaOpenAt(hours: ArenaHours[] | undefined, d: Date = new Date()): boolean {
  if (!hours?.length) return true;
  const { dow, hm } = vnClock(d);
  return hours.some((w) => w.days.includes(dow) && hm >= w.from && hm < w.to);
}

/** [1,2,3,4,5] → "T2–T6"; [1,3,5] → "T2, T4, T6". */
export function daysText(days: number[]): string {
  const s = [...new Set(days)].filter((x) => x >= 1 && x <= 7).sort((a, b) => a - b);
  if (s.length === 7) return 'Hằng ngày';
  const parts: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j]! + 1) j++;
    parts.push(j - i >= 2 ? `${DAY_SHORT[s[i]!]}–${DAY_SHORT[s[j]!]}` : s.slice(i, j + 1).map((x) => DAY_SHORT[x]).join(', '));
    i = j + 1;
  }
  return parts.join(', ');
}

/** "T2–T6 19:00–21:00 · T7, CN 08:00–10:00"; rỗng → "Luôn mở". */
export function hoursText(hours: ArenaHours[] | undefined): string {
  if (!hours?.length) return 'Luôn mở';
  return hours.map((w) => `${daysText(w.days)} ${w.from}–${w.to}`).join(' · ');
}

/** Lần mở cửa kế tiếp (trong 8 ngày tới), null nếu không có. */
export function nextOpening(hours: ArenaHours[] | undefined, d: Date = new Date()): Date | null {
  if (!hours?.length) return null;
  const nowV = new Date(d.getTime() + 7 * 3600_000);
  const base = Date.UTC(nowV.getUTCFullYear(), nowV.getUTCMonth(), nowV.getUTCDate());
  let best: number | null = null;
  for (let k = 0; k <= 7; k++) {
    const dayStart = base + k * 86_400_000;
    const wd = new Date(dayStart).getUTCDay();
    const dow = wd === 0 ? 7 : wd;
    for (const w of hours) {
      if (!w.days.includes(dow)) continue;
      const [h, m] = w.from.split(':').map(Number);
      const t = dayStart + ((h ?? 0) * 60 + (m ?? 0)) * 60_000 - 7 * 3600_000;
      if (t > d.getTime() && (best === null || t < best)) best = t;
    }
    if (best !== null) break;
  }
  return best === null ? null : new Date(best);
}

/** "19:00 thứ Hai" / "19:00 hôm nay" / "19:00 ngày mai". */
export function openingText(at: Date, now: Date = new Date()): string {
  const a = vnClock(at);
  const dayA = Math.floor((at.getTime() + 7 * 3600_000) / 86_400_000);
  const dayN = Math.floor((now.getTime() + 7 * 3600_000) / 86_400_000);
  const when = dayA === dayN ? 'hôm nay' : dayA === dayN + 1 ? 'ngày mai' : DAY_LONG[a.dow]!.toLowerCase();
  return `${a.hm} ${when}`;
}
