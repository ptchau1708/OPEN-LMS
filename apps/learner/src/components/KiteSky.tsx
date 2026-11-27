/**
 * "Bầu trời hôm nay" — điểm nhấn trang Nhà: con diều bay cao dần theo số nhiệm vụ em làm xong.
 * Trời đổi theo buổi (sáng · trưa · chiều · tối), dưới là đồng lúa và linh vật cầm dây diều.
 * Toàn bộ là SVG nhẹ, không tải ảnh; chuyển động tắt theo cài đặt "Giảm chuyển động".
 */
import type { ReactNode } from 'react';
import type { MascotId, MascotMood } from '@openedu/contracts';
import { Mascot } from '@openedu/ui';

export type SkyPeriod = 'sang' | 'trua' | 'chieu' | 'toi';

export function skyPeriod(h = new Date().getHours()): SkyPeriod {
  if (h >= 5 && h < 11) return 'sang';
  if (h >= 11 && h < 13) return 'trua';
  if (h >= 13 && h < 18) return 'chieu';
  return 'toi';
}

/** Vị trí diều (khung 360×210): đáy khi chưa làm gì, đỉnh khi xong hết. */
export function kitePos(p: number): { x: number; y: number } {
  const t = Math.max(0, Math.min(1, p));
  return { x: 214 + 10 * t, y: 132 - 96 * t };
}

const SKY: Record<SkyPeriod, { top: string; bottom: string; hill1: string; hill2: string; night?: boolean }> = {
  sang: { top: '#86c8ff', bottom: '#e2f3ff', hill1: '#9bdc8f', hill2: '#5fbf72' },
  trua: { top: '#4fa7ff', bottom: '#d3ecff', hill1: '#8fd77f', hill2: '#4eb466' },
  chieu: { top: '#5aa2f2', bottom: '#ffe6bf', hill1: '#9ccf7a', hill2: '#5aa85f' },
  toi: { top: '#16295a', bottom: '#3d5c99', hill1: '#2f6656', hill2: '#21503f', night: true },
};

/** Mặt trời: sáng mọc thấp bên phải, trưa trên cao, chiều thấp và cam hơn. Tránh chỗ chữ (trái) và huy hiệu (phải trên). */
const SUN: Record<SkyPeriod, { x: number; y: number; fill: string; glow: string }> = {
  sang: { x: 318, y: 122, fill: '#ffd45c', glow: '#ffe9a8' },
  trua: { x: 196, y: 30, fill: '#ffd84f', glow: '#fff0a6' },
  chieu: { x: 322, y: 116, fill: '#ffb347', glow: '#ffd59a' },
  toi: { x: 318, y: 60, fill: '#fff1bf', glow: '#fff1bf' },
};

export interface KiteSkyProps {
  done: number;
  total: number;
  mascot: MascotId;
  mood: MascotMood;
  period?: SkyPeriod;
  /** Dòng trên cùng bên trái (số lớn). */
  headline: ReactNode;
  /** Dòng nhỏ dưới số. */
  caption: ReactNode;
  /** Góc phải trên (ví dụ chuỗi ngày học). */
  badge?: ReactNode;
  /** Dải dưới cùng: lời linh vật + nút nghe. */
  children?: ReactNode;
}

export function KiteSky({ done, total, mascot, mood, period = skyPeriod(), headline, caption, badge, children }: KiteSkyProps) {
  const c = SKY[period];
  const p = total > 0 ? done / total : 0.45;
  const k = kitePos(p);
  // Tay cầm dây của linh vật (linh vật được lật ngang để tay thả xuôi nằm bên phải, phía con diều).
  const hand = mood === 'cheer' ? { x: 86, y: 156 } : { x: 78, y: 176 };
  // Dây diều võng xuống tự nhiên: điểm điều khiển lệch xuống dưới đường thẳng.
  const cx = (hand.x + k.x) / 2 + 10, cy = Math.max(hand.y, k.y) - 8;
  const top = total > 0 && done >= total;
  const gid = `ln-sky-${period}`;
  return (
    <section className={`ln-sky ln-sky--${period}${c.night ? ' is-night' : ''}${top ? ' is-top' : ''}`} aria-label="Bầu trời hôm nay">
      <div className="ln-sky__stage">
      <svg className="ln-sky__art" viewBox="0 0 360 210" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.top} />
            <stop offset="1" stopColor={c.bottom} />
          </linearGradient>
        </defs>
        <rect width="360" height="210" fill={`url(#${gid})`} />
        {c.night ? (
          <g className="ln-sky__stars" fill="#fff6d6">
            <circle cx="40" cy="30" r="1.6" /><circle cx="96" cy="18" r="1.2" /><circle cx="150" cy="40" r="1.4" />
            <circle cx="196" cy="16" r="1.1" /><circle cx="250" cy="44" r="1.3" /><circle cx="330" cy="28" r="1.5" />
            <circle cx="120" cy="70" r="1" /><circle cx="300" cy="80" r="1.1" /><circle cx="22" cy="86" r="1.2" />
            <path d="M300 84 a17 17 0 1 0 15 25 a14 14 0 1 1 -15 -25 z" fill="#fff1bf" />
          </g>
        ) : (
          <g>
            <circle cx={SUN[period].x} cy={SUN[period].y} r="30" fill={SUN[period].glow} opacity="0.4" />
            <circle cx={SUN[period].x} cy={SUN[period].y} r="19" fill={SUN[period].fill} />
            <g className="ln-sky__cloud" fill="#ffffff" opacity="0.92">
              <path d="M120 58 q4 -14 18 -11 q8 -12 22 -4 q16 -2 15 13 q8 4 2 10 h-56 q-8 -4 -1 -8 z" />
            </g>
            <g className="ln-sky__cloud ln-sky__cloud--2" fill="#ffffff" opacity="0.8">
              <path d="M226 96 q3 -10 13 -8 q6 -9 16 -3 q11 -1 11 9 q6 3 1 7 h-40 q-6 -3 -1 -5 z" />
            </g>
          </g>
        )}
        {/* đồng lúa */}
        <path d="M0 168 Q80 146 170 162 T360 152 V210 H0 Z" fill={c.hill1} />
        <path d="M0 186 Q110 166 220 182 T360 176 V210 H0 Z" fill={c.hill2} />
        <g stroke={c.night ? '#3f7a64' : '#3e9a59'} strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
          <path d="M150 198 v-7M160 199 v-8M170 198 v-7M250 196 v-7M262 197 v-8M274 196 v-7M318 195 v-7M330 196 v-8" />
        </g>
        {/* dây diều */}
        <path className="ln-sky__string" d={`M${hand.x} ${hand.y} Q${cx} ${cy} ${k.x} ${k.y + 16}`} fill="none" stroke={c.night ? '#f4e6c8' : '#ffffff'} strokeWidth="1.4" strokeDasharray="1 0" opacity="0.9" />
        {/* diều: tâm (x, y) */}
        <g className="ln-sky__kite" style={{ transform: `translate(${k.x}px, ${k.y}px)` }}>
          <g className="ln-sky__kite-sway">
            <path d="M0 -20 L15 0 L0 18 L-15 0 Z" fill="#2d7ff9" />
            <path d="M0 -20 L15 0 L0 0 Z" fill="#ffb31a" />
            <path d="M0 0 L0 18 L-15 0 Z" fill="#0b9494" />
            <path d="M0 -20 L0 18 M-15 0 L15 0" stroke="#15294a" strokeWidth="1.4" />
            <path d="M0 -20 L15 0 L0 18 L-15 0 Z" fill="none" stroke="#15294a" strokeWidth="1.8" strokeLinejoin="round" />
            <path className="ln-sky__tail" d="M0 18 q-6 10 0 18 q6 8 0 18" fill="none" stroke="#15294a" strokeWidth="1.3" />
            <path d="M-5 26 l5 3 l5 -3 l-5 -2 z M-5 42 l5 3 l5 -3 l-5 -2 z" fill="#ff8a3d" />
          </g>
        </g>
        {top ? (
          <g className="ln-sky__sparkle" fill="#fff3b0">
            <path d={`M${k.x - 26} ${k.y - 18} l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z`} />
            <path d={`M${k.x + 24} ${k.y - 6} l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 l4 -1.6 z`} />
          </g>
        ) : null}
      </svg>
      <div className="ln-sky__head">
        <div className="ln-sky__num">{headline}</div>
        <div className="ln-sky__cap">{caption}</div>
      </div>
      {badge ? <div className="ln-sky__badge">{badge}</div> : null}
      <div className="ln-sky__mascot"><Mascot id={mascot} mood={mood} size={80} animate title="" /></div>
      </div>
      {children ? <div className="ln-sky__say">{children}</div> : null}
    </section>
  );
}
