/**
 * Trang phục linh vật (vẽ mới, SVG). Mỗi món vẽ trong hệ tọa độ riêng rồi đặt theo điểm neo của từng linh vật:
 *  - mũ: gốc (0,0) = giữa vành mũ, rộng ≈ ±22, vẽ lên trên (y âm)
 *  - kính: gốc = giữa hai mắt, hai tròng ở ±dx (khoảng cách mắt của từng bạn)
 *  - khăn: gốc = giữa cổ, rộng ≈ ±18
 *  - phông nền: cả khung 0 0 100 100
 */
import { useId, type ReactNode } from 'react';
import type { MascotId, MascotMood, Outfit } from '@openedu/contracts';
import { Mascot, type MascotWear } from '../mascots/Mascot';
import { INK, WHITE, GOLD, RED, LEAF } from '../mascots/parts';
import { SPECS } from '../mascots/species';

const O = 2.2;
const p = (d: string, fill: string, extra?: { sw?: number; key?: string | number; op?: number }) => (
  <path key={extra?.key} d={d} fill={fill} stroke={INK} strokeWidth={extra?.sw ?? O} strokeLinejoin="round" strokeLinecap="round" opacity={extra?.op} />
);
const line = (d: string, color: string, w = 1.6, key?: string | number) => <path key={key} d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
const star = (cx: number, cy: number, r: number, ri = r * 0.45) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ri : r;
    d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
};
const flower = (x: number, y: number, r: number, petal: string, key: string | number) => (
  <g key={key}>
    {[0, 72, 144, 216, 288].map((a) => {
      const t = (a * Math.PI) / 180;
      return <circle key={a} cx={x + r * Math.cos(t)} cy={y + r * Math.sin(t)} r={r * 0.78} fill={petal} stroke={INK} strokeWidth={1.1} />;
    })}
    <circle cx={x} cy={y} r={r * 0.62} fill={GOLD} stroke={INK} strokeWidth={1.1} />
  </g>
);

/* ======================= mũ ======================= */
const HATS: Record<string, () => ReactNode> = {
  'hat-party': () => (
    <g>
      {p('M-13 0 L0 -30 L13 0 Q0 4 -13 0 Z', '#ff7eb6')}
      {line('M-7.5 -12 L4.5 -19M-10.5 -4 L9 -14.5M-3 -24 L1.5 -27', WHITE, 2.4)}
      <circle cx="0" cy="-31" r="4.2" fill={GOLD} stroke={INK} strokeWidth={1.8} />
    </g>
  ),
  'hat-crown': () => (
    <g>
      {p('M-18 1 L-19 -15 L-10 -7 L0 -19 L10 -7 L19 -15 L18 1 Q0 5 -18 1 Z', GOLD)}
      {line('M-17 -4 Q0 -1 17 -4', '#e29a00', 1.6)}
      <circle cx="0" cy="-5" r="2.8" fill={RED} stroke={INK} strokeWidth={1.3} />
      <circle cx="-10" cy="-3.5" r="2" fill="#2f7bf6" stroke={INK} strokeWidth={1.2} />
      <circle cx="10" cy="-3.5" r="2" fill="#20a974" stroke={INK} strokeWidth={1.2} />
    </g>
  ),
  'hat-cap': () => (
    <g>
      {p('M12 -1 Q30 -3 34 1.5 Q24 5 10 3.5 Z', '#1f6fd6')}
      {p('M-20 1 Q-20 -15 0 -16 Q20 -15 20 1 Q0 5 -20 1 Z', '#2f7bf6')}
      {line('M0 -15.5 L0 1.5', '#1a5bb5', 1.4)}
      <circle cx="0" cy="-16" r="2.4" fill="#1a5bb5" stroke={INK} strokeWidth={1.2} />
      {p('M-6.5 -8 L-2 -8 M-4.2 -10.5 L-4.2 -5.5', 'none', { sw: 1.8 })}
    </g>
  ),
  'hat-flower': () => (
    <g>
      {line('M-23 1 Q0 -9 23 1', '#4f9a4a', 2.6)}
      {[-21, -14, -7, 0, 7, 14, 21].map((x, i) => {
        const y = -4 + (x / 23) ** 2 * 5 - 1;
        return i % 2
          ? <ellipse key={x} cx={x} cy={y + 1} rx="3.4" ry="2" fill={LEAF} stroke={INK} strokeWidth={1.1} transform={`rotate(${x * 1.4} ${x} ${y + 1})`} />
          : flower(x, y, 2.8, ['#ff8fb1', '#ffffff', '#b79cff', '#ff8fb1'][i / 2], x);
      })}
    </g>
  ),
  'hat-wizard': () => (
    <g>
      {p('M-14 0 L3 -36 Q6 -38 7 -34 L14 0 Z', '#6c4fd8')}
      {p('M-25 1 Q0 -7 25 1 Q0 7 -25 1 Z', '#5a3fc0')}
      {p(star(-1, -12, 4.2), GOLD, { sw: 1.2 })}
      {p(star(6, -24, 2.8), GOLD, { sw: 1 })}
      <circle cx="-7" cy="-4" r="1.3" fill={GOLD} />
    </g>
  ),
  'hat-chef': () => (
    <g>
      {p('M-15 -14 C-24 -14 -24 -28 -13 -27 C-12 -37 4 -38 5 -30 C12 -37 26 -30 17 -20 C21 -16 18 -13 15 -13 Z', WHITE)}
      {p('M-14 1 L-14 -13 L15 -13 L15 1 Q0 4 -14 1 Z', WHITE)}
      {line('M-6 -12 L-6 0M4 -12 L4 1', '#cfd6e6', 1.6)}
    </g>
  ),
};

/* ======================= kính ======================= */
const GLASSES: Record<string, (dx: number) => ReactNode> = {
  'glasses-round': (dx) => (
    <g>
      {line(`M${-dx - 7} -1 L${-dx - 12} -3.5M${dx + 7} -1 L${dx + 12} -3.5`, INK, 2)}
      {line(`M${-dx + 6.5} -1 Q0 -4 ${dx - 6.5} -1`, INK, 2)}
      {[-dx, dx].map((x) => <circle key={x} cx={x} cy="0" r="7.6" fill="#bfe6ff" fillOpacity="0.28" stroke="#22304a" strokeWidth={2.4} />)}
      {[-dx, dx].map((x) => line(`M${x - 4} -3 Q${x - 2.5} -5 ${x} -5.2`, WHITE, 1.5, `s${x}`))}
    </g>
  ),
  'glasses-star': (dx) => (
    <g>
      {line(`M${-dx + 6} -1 Q0 -4 ${dx - 6} -1`, INK, 2)}
      {[-dx, dx].map((x) => <g key={x}>{p(star(x, 0.6, 10, 5.4), GOLD, { sw: 1.8 })}<path d={star(x, 0.6, 5.6, 3)} fill="#fff6c9" opacity="0.55" /></g>)}
    </g>
  ),
  'glasses-heart': (dx) => {
    const h = (x: number) => `M${x} 7 C${x - 13} -1 ${x - 8} -10 ${x} -4 C${x + 8} -10 ${x + 13} -1 ${x} 7 Z`;
    return (
      <g>
        {line(`M${-dx + 6} -2 Q0 -4.5 ${dx - 6} -2`, INK, 2)}
        {[-dx, dx].map((x) => <g key={x}>{p(h(x), '#ff5d8f', { sw: 1.8, op: 0.92 })}{line(`M${x - 6} -2.5 Q${x - 5} -5 ${x - 2.5} -4.5`, WHITE, 1.4)}</g>)}
      </g>
    );
  },
  'glasses-sun': (dx) => (
    <g>
      {line(`M${-dx - 8} -2 L${-dx - 12.5} -4M${dx + 8} -2 L${dx + 12.5} -4`, INK, 2)}
      {p(`M${-dx - 8} -4.5 L${dx + 8} -4.5 L${dx + 8} -2.5 L${-dx - 8} -2.5 Z`, INK, { sw: 1 })}
      {[-dx, dx].map((x) => <g key={x}>{p(`M${x - 8} -4 L${x + 8} -4 Q${x + 8} 7 ${x} 7 Q${x - 8} 7 ${x - 8} -4 Z`, '#2a3550')}{line(`M${x - 5} -1 L${x - 2} -1`, '#8fb4ff', 1.8)}</g>)}
    </g>
  ),
};

/* ======================= khăn & nơ ======================= */
const NECK: Record<string, () => ReactNode> = {
  'neck-bow': () => (
    <g>
      {p('M-1 3 L-12 -3 L-12 10 Z', '#ef4a5d')}
      {p('M1 3 L12 -3 L12 10 Z', '#ef4a5d')}
      {line('M-9 0.5 L-9 6.5M9 0.5 L9 6.5', '#ff9aa6', 1.4)}
      <rect x="-3.6" y="-0.4" width="7.2" height="7" rx="2.6" fill="#d23447" stroke={INK} strokeWidth={1.8} />
    </g>
  ),
  'neck-scarf': () => (
    <g>
      {p('M5 3 L13 3 L14.5 19 L6.5 19.5 Z', '#ffb238')}
      {line('M6 9 L13.6 8.6M6.4 14 L14 13.6', '#2f7bf6', 2)}
      {p('M-18 -2 Q0 8 18 -2 L18.5 5 Q0 15 -18.5 5 Z', '#ffb238')}
      {line('M-12 3.5 Q-11 7 -10 9M-4 5.5 L-3.4 10.6M4 5.5 L3.4 10.6M12 3.5 Q11 7 10 9', '#2f7bf6', 2)}
    </g>
  ),
  'neck-pioneer': () => (
    <g>
      {p('M-17 -2 Q0 7 17 -2 L16 3 Q0 12 -16 3 Z', '#e8343f')}
      {p('M-2 7 L-9 20 L-3.5 21 L0 10 Z', '#e8343f')}
      {p('M2 7 L7.5 19.5 L2.5 21 L-0.5 10 Z', '#d42a35')}
      <ellipse cx="0" cy="7.4" rx="3.6" ry="3" fill="#c9222d" stroke={INK} strokeWidth={1.6} />
    </g>
  ),
  'neck-medal': () => (
    <g>
      {p('M-12 -2 L-2 13 L2 13 L-6 -2 Z', '#2f7bf6')}
      {p('M12 -2 L2 13 L-2 13 L6 -2 Z', '#ef4a5d')}
      <circle cx="0" cy="17" r="6.6" fill={GOLD} stroke={INK} strokeWidth={2} />
      <path d={star(0, 17.2, 3.8)} fill="#fff1b3" stroke="#d99a00" strokeWidth={0.9} />
    </g>
  ),
  'neck-flowers': () => (
    <g>
      {line('M-17 -1 Q0 12 17 -1', '#4f9a4a', 2.2)}
      {[-15, -9, -3, 3, 9, 15].map((x, i) => flower(x, -1 + (1 - (x / 17) ** 2) * 6.5 + (x === -15 || x === 15 ? 0.5 : 0), 2.5, ['#ff8fb1', '#ffd23f', '#b79cff'][i % 3], x))}
    </g>
  ),
};

/* ======================= phông nền ======================= */
function Bg({ id }: { id: string }) {
  const g = 'kbg' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const frame = (fill: string) => <rect x="1" y="1" width="98" height="98" rx="20" fill={fill} />;
  const grad = (a: string, b: string) => (
    <defs><linearGradient id={g} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
  );
  const cloud = (x: number, y: number, s: number) => <path d={`M${x} ${y} q${-6 * s} 0 ${-6 * s} ${-4 * s} q0 ${-4 * s} ${5 * s} ${-4 * s} q${2 * s} ${-5 * s} ${8 * s} ${-3 * s} q${6 * s} ${-1 * s} ${7 * s} ${4 * s} q${5 * s} 0 ${5 * s} ${3.5 * s} q0 ${3.5 * s} ${-5 * s} ${3.5 * s} z`} fill={WHITE} opacity="0.9" />;
  switch (id) {
    case 'bg-sky':
      return <g>{grad('#7cc8ff', '#d9f1ff')}{frame(`url(#${g})`)}{cloud(22, 26, 1.2)}{cloud(80, 18, 0.9)}{cloud(86, 58, 0.7)}</g>;
    case 'bg-night':
      return (
        <g>{grad('#1d2a5c', '#4b3f8f')}{frame(`url(#${g})`)}
          <path d="M80 12 a10 10 0 1 0 7 17 a8 8 0 1 1 -7 -17 z" fill="#ffe28a" />
          {[[14, 16, 2.6], [30, 9, 1.6], [12, 46, 1.8], [90, 44, 2.2], [70, 24, 1.4], [24, 70, 1.4], [88, 76, 1.8]].map(([x, y, r]) => <path key={`${x}`} d={star(x, y, r * 1.6, r * 0.6)} fill="#fff6c9" />)}
        </g>
      );
    case 'bg-beach':
      return (
        <g>{grad('#8fd8ff', '#e6f7ff')}{frame(`url(#${g})`)}
          <circle cx="80" cy="20" r="9" fill="#ffd23f" />
          <path d="M1 62 Q25 57 50 62 T99 62 L99 79 L1 79 Z" fill="#3fb6e8" />
          {line('M8 67 q4 -2 8 0M60 70 q4 -2 8 0M34 73 q4 -2 8 0', WHITE, 1.4)}
          <path d="M1 76 Q50 70 99 76 L99 79 Q99 99 79 99 L21 99 Q1 99 1 79 Z" fill="#ffe3a3" />
        </g>
      );
    case 'bg-garden':
      return (
        <g>{grad('#bff0c8', '#f2ffe9')}{frame(`url(#${g})`)}
          <path d="M1 66 Q30 52 60 64 Q80 58 99 62 L99 79 Q99 99 79 99 L21 99 Q1 99 1 79 Z" fill="#7fd36b" />
          <path d="M1 80 Q40 70 99 82 L99 79 Q99 99 79 99 L21 99 Q1 99 1 79 Z" fill="#5cb85c" />
          {[[12, 70, '#ff8fb1'], [88, 68, '#ffd23f'], [20, 86, '#b79cff'], [82, 88, '#ff8fb1']].map(([x, y, c]) => flower(x as number, y as number, 2.6, c as string, `${x}`))}
        </g>
      );
    case 'bg-space':
      return (
        <g>{grad('#2b1a5e', '#6a3fb8')}{frame(`url(#${g})`)}
          <circle cx="80" cy="22" r="9" fill="#ff9f5a" stroke={INK} strokeWidth={1.5} />
          <ellipse cx="80" cy="22" rx="15" ry="4" fill="none" stroke="#ffd23f" strokeWidth={2.2} transform="rotate(-18 80 22)" />
          <circle cx="16" cy="78" r="5" fill="#7fe0d1" stroke={INK} strokeWidth={1.3} />
          {[[18, 18, 2.4], [40, 8, 1.4], [8, 50, 1.6], [92, 56, 2.2], [60, 14, 1.2], [90, 88, 1.6], [34, 92, 1.3]].map(([x, y, r]) => <path key={`${x}`} d={star(x, y, r * 1.7, r * 0.6)} fill="#fff6c9" />)}
        </g>
      );
    default:
      return null;
  }
}

/* ======================= điểm neo theo linh vật ======================= */
interface Anchor { hatY: number; hatS: number; neckY: number }
/** Mặc định: đầu ellipse (50,42) 32×28 → đỉnh y 14, vành mũ chìm 6 đơn vị; cổ y 69. */
const ANCHORS: Partial<Record<MascotId, Partial<Anchor>>> = {
  capybara: { hatY: 21 },
  cong: { hatY: 26, hatS: 0.82, neckY: 70 },
  koala: { hatS: 0.95 },
  kiwi: { hatY: 19.5 },
};
export function outfitAnchor(id: MascotId) {
  const s = SPECS[id] ?? SPECS.nghe;
  const a = ANCHORS[id] ?? {};
  return { hatY: a.hatY ?? 20, hatS: a.hatS ?? 1, neckY: a.neckY ?? 69, eyeY: s.eyeY ?? 45, eyeDX: s.eyeDX ?? 13 };
}

/** Món đồ đặt đúng chỗ cho linh vật `id` → truyền vào <Mascot wear>. */
export function outfitWear(id: MascotId, outfit: Outfit | undefined): MascotWear | undefined {
  if (!outfit || !Object.keys(outfit).length) return undefined;
  const a = outfitAnchor(id);
  const w: MascotWear = {};
  const hat = outfit.hat && HATS[outfit.hat];
  if (hat) w.hat = <g transform={`translate(50 ${a.hatY}) scale(${a.hatS})`}>{hat()}</g>;
  const gl = outfit.glasses && GLASSES[outfit.glasses];
  if (gl) w.glasses = <g transform={`translate(50 ${a.eyeY})`}>{gl(a.eyeDX)}</g>;
  const nk = outfit.neck && NECK[outfit.neck];
  if (nk) w.neck = <g transform={`translate(50 ${a.neckY}) scale(1.1)`}>{nk()}</g>;
  if (outfit.bg && outfit.bg.startsWith('bg-')) w.bg = <Bg id={outfit.bg} />;
  return w;
}

export interface DressedMascotProps { id: MascotId; outfit?: Outfit; mood?: MascotMood; size?: number; className?: string; title?: string; animate?: boolean }
/** Linh vật mặc trang phục. */
export function DressedMascot({ id, outfit, ...rest }: DressedMascotProps) {
  return <Mascot id={id} wear={outfitWear(id, outfit)} {...rest} />;
}

/** Hình xem trước một món đồ (ô trong cửa hàng): mũ/kính/khăn vẽ riêng ở giữa khung. */
export function OutfitItemArt({ itemId, size = 64 }: { itemId: string; size?: number }) {
  let node: ReactNode = null;
  if (HATS[itemId]) node = <g transform="translate(48 84) scale(1.95)">{HATS[itemId]()}</g>;
  else if (GLASSES[itemId]) node = <g transform="translate(50 52) scale(1.8)">{GLASSES[itemId](13)}</g>;
  else if (NECK[itemId]) node = <g transform="translate(50 26) scale(2.2)">{NECK[itemId]()}</g>;
  else if (itemId.startsWith('bg-')) node = <Bg id={itemId} />;
  return <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">{node}</svg>;
}
