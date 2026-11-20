/**
 * Bộ phận dùng chung cho linh vật (khung 0 0 100 100). Linh vật là minh họa SVG nên được viết mã màu trực tiếp.
 * Phong cách: chibi — đầu tròn to (~60% chiều cao), mắt bóng to, má hồng, thân nhỏ, viền mềm dày.
 */
import type { ReactNode } from 'react';
import type { MascotMood } from '@openedu/contracts';

export const INK = '#22304a';
export const EYE = '#1d2740';
export const O = 2.6; // độ dày viền
export const WHITE = '#ffffff';
export const BLUSH = '#ff8fa3';
export const TONGUE = '#ff7d93';
export const GOLD = '#ffc22e';
export const RED = '#ef4a5d';
export const LEAF = '#5cb85c';

export type Pt = [number, number];

/** Hình có viền. */
export const P = (d: string, fill: string, key?: string | number) => (
  <path key={key} d={d} fill={fill} stroke={INK} strokeWidth={O} strokeLinejoin="round" strokeLinecap="round" />
);
/** Hình không viền (mảng màu, bóng). */
export const F = (d: string, fill: string, key?: string | number, opacity?: number) => (
  <path key={key} d={d} fill={fill} opacity={opacity} />
);
/** Nét vẽ. */
export const S = (d: string, color = INK, w = 2.2, key?: string | number) => (
  <path key={key} d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
);
export const E = (cx: number, cy: number, rx: number, ry: number, fill: string, stroke = true, key?: string | number) => (
  <ellipse key={key} cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={stroke ? INK : undefined} strokeWidth={stroke ? O : undefined} />
);
/** Ellipse dưới dạng path (dùng cho clipPath + viền đầu). */
export const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;

/** Chi (tay, chân, đuôi) dạng thanh bo tròn có viền: vẽ nét đậm màu viền rồi nét màu lên trên. */
export function Limb({ d, color, w = 7.5 }: { d: string; color: string; w?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth={w + O * 2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** Gương lật trái ↔ phải quanh trục x = 50. */
export const Mirror = ({ children }: { children: ReactNode }) => <g transform="matrix(-1 0 0 1 100 0)">{children}</g>;

/* ---------- tay theo tâm trạng ---------- */
const X = (s: number, dx: number) => 50 + s * dx;
export const ARMS = {
  down: (s: number) => `M${X(s, 13)} 75 Q${X(s, 18)} 80 ${X(s, 20)} 86`,
  up: (s: number) => `M${X(s, 13)} 74 Q${X(s, 24)} 71 ${X(s, 30)} 61`,
  wave: `M63 75 Q75 72 78 58`,
  chin: `M61.5 78 Q66 71 58.5 66.5`,
};
/** Vị trí bàn tay trái (để gắn đồ vật cầm tay). */
export const HAND_L: Record<'down' | 'up', Pt> = { down: [30, 86], up: [20, 61] };

/* ---------- mắt ---------- */
export function Eye({ x, y, mood, delay }: { x: number; y: number; mood: MascotMood; delay?: string }) {
  if (mood === 'cheer') return S(`M${x - 5} ${y + 1.5} Q${x} ${y - 5.5} ${x + 5} ${y + 1.5}`, INK, 3);
  const up = mood === 'think', sad = mood === 'sad';
  const cx = x + (up ? 1 : 0), cy = y + (up ? -1.6 : sad ? 1 : 0);
  const ry = sad ? 5.4 : up ? 5.8 : 6.3, rx = up ? 4.8 : 5.2;
  return (
    <g className="k-m-eye" style={delay ? { animationDelay: delay } : undefined}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={EYE} />
      <circle cx={cx + (up ? 0.6 : -1.7)} cy={cy - (up ? 2.8 : sad ? 1.6 : 2.4)} r={2.2} fill={WHITE} />
      <circle cx={cx + (up ? -1.6 : 1.8)} cy={cy + 2.3} r={1} fill={WHITE} />
    </g>
  );
}

export function Brows({ y, dx, mood }: { y: number; dx: number; mood: MascotMood }) {
  const l = 50 - dx, r = 50 + dx;
  if (mood === 'sad') return S(`M${l - 4.5} ${y - 8} L${l + 3.5} ${y - 10.5}M${r + 4.5} ${y - 8} L${r - 3.5} ${y - 10.5}`, INK, 2.2);
  if (mood === 'think') return S(`M${l - 4} ${y - 9.5} L${l + 4} ${y - 9.8}M${r - 4} ${y - 11.5} Q${r} ${y - 14.5} ${r + 4.5} ${y - 12}`, INK, 2.2);
  return null;
}

/* ---------- miệng ---------- */
export function Mouth({ p: [x, y], mood }: { p: Pt; mood: MascotMood }) {
  if (mood === 'sad') return S(`M${x - 3.6} ${y + 2.2} Q${x} ${y - 1.4} ${x + 3.6} ${y + 2.2}`, INK, 2.3);
  if (mood === 'think') return S(`M${x - 3.5} ${y + 1} Q${x - 1.5} ${y - 0.6} ${x + 0.5} ${y + 0.8} T${x + 4} ${y + 0.4}`, INK, 2.2);
  const big = mood === 'cheer';
  const w = big ? 6 : 4.4, h = big ? 8.5 : 5.6;
  const d = `M${x - w} ${y - 0.6} Q${x} ${y + 0.6} ${x + w} ${y - 0.6} Q${x + w * 0.85} ${y + h} ${x} ${y + h} Q${x - w * 0.85} ${y + h} ${x - w} ${y - 0.6}Z`;
  return (
    <g>
      <path d={d} fill={EYE} />
      <ellipse cx={x} cy={y + h - 1.9} rx={w * 0.5} ry={big ? 2.2 : 1.6} fill={TONGUE} />
      <path d={d} fill="none" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
    </g>
  );
}

/* ---------- hiệu ứng theo tâm trạng ---------- */
const spark = (x: number, y: number, r: number) => {
  const k = r * 0.22;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
};
export function Extras({ mood }: { mood: MascotMood }) {
  if (mood === 'cheer') {
    return (
      <g className="k-m-sparkles">
        <path d={spark(11, 17, 7)} fill={GOLD} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        <path d={spark(89, 12, 5.5)} fill={GOLD} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        <path d={spark(92, 36, 3.6)} fill={GOLD} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        <path d={spark(7, 40, 3.2)} fill={GOLD} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      </g>
    );
  }
  if (mood === 'think') {
    return (
      <g className="k-m-q">
        <circle cx="88" cy="15" r="11" fill={WHITE} stroke={INK} strokeWidth={2} />
        {S('M84.2 12 Q84.2 7.6 88.2 7.6 Q92.2 7.6 92.2 11.3 Q92.2 13.8 89.6 15 Q88.2 15.8 88.2 17.6', '#2f7bf6', 3)}
        <circle cx="88.2" cy="21.6" r="1.9" fill="#2f7bf6" />
      </g>
    );
  }
  if (mood === 'wave') return S('M84 50 Q87.5 54 86 59M88.5 46 Q93.5 53 91 61', INK, 1.9);
  return null;
}
