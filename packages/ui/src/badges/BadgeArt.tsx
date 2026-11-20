/**
 * Huy hiệu OPEN-EDU — vẽ mới (SVG). Cùng một khung: huy chương viền hoa 12 cánh màu theo nhóm, vòng viền theo
 * hạng (đồng/bạc/vàng), hai dải ruy băng, hình vẽ chính giữa (glyph, khung ±12 quanh tâm).
 */
import { useId, type ReactNode } from 'react';
import type { BadgeGlyph } from '@openedu/contracts';

const INK = '#22304a';
const W = '#ffffff';
const s = (d: string, c = INK, w = 1.8) => <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
const f = (d: string, fill: string, w = 1.6) => <path d={d} fill={fill} stroke={INK} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" />;
const starD = (cx: number, cy: number, r: number, ri = r * 0.45) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ri : r;
    d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
};

const GLYPHS: Record<BadgeGlyph, () => ReactNode> = {
  flame: () => <>{f('M0 12 C-9 12 -11 3 -6 -3 C-5 1 -3 2 -2 1 C-4 -5 0 -10 3 -12 C3 -6 10 -3 9 4 C8 9 5 12 0 12 Z', '#ff8a3d')}{f('M0 11 C-4 11 -5 6 -2 3 C-1 5 1 5 1 3 C3 5 4 7 3.5 8.5 C3 10 2 11 0 11 Z', '#ffd23f', 1.2)}</>,
  sun: () => <>{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="-1.6" y="-13" width="3.2" height="5" rx="1.6" fill="#ffb238" stroke={INK} strokeWidth={1.2} transform={`rotate(${a})`} />)}{f('M-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 Z', '#ffd23f')}{s('M-3 1.5 Q0 4 3 1.5', INK, 1.4)}</>,
  rocket: () => <>{f('M-4 6 L-9 11 L-8 3 Z', '#ef4a5d', 1.3)}{f('M4 6 L9 11 L8 3 Z', '#ef4a5d', 1.3)}{f('M0 -13 C6 -8 6 2 4 7 L-4 7 C-6 2 -6 -8 0 -13 Z', '#e9f2ff')}<circle cx="0" cy="-3" r="2.6" fill="#7cc8ff" stroke={INK} strokeWidth={1.3} />{f('M-2.5 8 L0 13 L2.5 8 Z', '#ffb238', 1.2)}</>,
  book: () => <>{f('M0 -7 C-4 -10 -9 -10 -12 -8 L-12 9 C-9 7 -4 7 0 10 Z', '#7cc8ff')}{f('M0 -7 C4 -10 9 -10 12 -8 L12 9 C9 7 4 7 0 10 Z', '#a5e3ff')}{s('M-9 -4 L-3 -3M-9 0 L-3 1M3 -3 L9 -4M3 1 L9 0', '#2f7bf6', 1.3)}</>,
  compass: () => <>{f('M-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 Z', W)}{f('M0 -8 L3 0 L-3 0 Z', '#ef4a5d', 1.2)}{f('M0 8 L3 0 L-3 0 Z', '#9aa6bf', 1.2)}<circle r="1.4" fill={INK} />{s('M0 -11 L0 -9M11 0 L9 0M0 11 L0 9M-11 0 L-9 0', INK, 1.4)}</>,
  abacus: () => <>{f('M-11 -10 L11 -10 L11 10 L-11 10 Z', '#ffe7b8')}{s('M-11 -4 L11 -4M-11 2 L11 2M-11 7 L11 7', '#8a6a42', 1.3)}{[[-6, -4, '#ef4a5d'], [-2, -4, '#ef4a5d'], [5, -4, '#2f7bf6'], [-7, 2, '#20a974'], [2, 2, '#20a974'], [6, 2, '#20a974'], [-3, 7, '#ffb238']].map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r="2.2" fill={c as string} stroke={INK} strokeWidth={1} />)}</>,
  letters: () => <><text x="-11" y="5" fontSize="15" fontWeight="900" fontFamily="system-ui, sans-serif" fill="#ff8a3d" stroke={INK} strokeWidth={0.9}>A</text><text x="0" y="9" fontSize="13" fontWeight="900" fontFamily="system-ui, sans-serif" fill="#2f7bf6" stroke={INK} strokeWidth={0.9}>ă</text></>,
  globe: () => <>{f('M-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 Z', '#7cc8ff')}{f('M-6 -8 C-2 -7 -1 -4 -4 -2 C-6 0 -3 3 -5 6 C-8 4 -10 0 -9 -4 Z', '#5cb85c', 1.1)}{f('M3 -9 C7 -7 10 -3 9 2 C6 2 5 -1 2 -2 C1 -5 1 -8 3 -9 Z', '#5cb85c', 1.1)}{f('M2 5 C5 4 7 6 5 9 C3 9 1 8 2 5 Z', '#5cb85c', 1)}</>,
  leaf: () => <>{f('M-10 10 C-12 -4 -2 -12 11 -11 C12 2 4 11 -10 10 Z', '#5cb85c')}{s('M-9 9 C-3 2 2 -3 8 -8M-3 3 L-4 -3M2 -2 L4 -1', '#2e7d32', 1.4)}</>,
  bandage: () => <g transform="rotate(-35)">{f('M-13 -5 L13 -5 Q16 -5 16 0 Q16 5 13 5 L-13 5 Q-16 5 -16 0 Q-16 -5 -13 -5 Z', '#ffc9a3')}{f('M-5 -5 L5 -5 L5 5 L-5 5 Z', '#ffe7d6', 1.2)}{[[-2, -2], [2, -2], [-2, 2], [2, 2]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.9" fill="#d8a07a" />)}</g>,
  wrench: () => <g transform="rotate(40)">{f('M-2.5 -4 L2.5 -4 L2.5 12 Q0 14 -2.5 12 Z', '#b9c3d3')}{f('M-7 -9 C-7 -14 -2 -15 -1 -14 L-1 -9 L1 -9 L1 -14 C2 -15 7 -14 7 -9 C7 -5 4 -3 0 -3 C-4 -3 -7 -5 -7 -9 Z', '#d6dde8')}</g>,
  pencil: () => <g transform="rotate(40)">{f('M-3.5 -12 L3.5 -12 L3.5 7 L0 13 L-3.5 7 Z', '#ffd23f')}{f('M-3.5 -12 L3.5 -12 L3.5 -9 L-3.5 -9 Z', '#ff8fb1', 1.2)}{f('M-3.5 7 L3.5 7 L0 13 Z', '#ffe3c0', 1.2)}<path d="M-1 11.3 L1 11.3 L0 13 Z" fill={INK} /></g>,
  quill: () => <>{f('M-8 11 C-6 0 0 -9 11 -12 C9 -3 3 6 -8 11 Z', '#c9b5ff')}{s('M-9 12 C-3 4 3 -3 9 -10', '#6c4fd8', 1.4)}{s('M-4 3 L-7 1M-1 -1 L-4 -4M2 -5 L0 -8', '#6c4fd8', 1.1)}</>,
  crown: () => <>{f('M-11 7 L-12 -6 L-5 -1 L0 -9 L5 -1 L12 -6 L11 7 Z', '#ffc22e')}<circle cx="0" cy="2" r="2" fill="#ef4a5d" stroke={INK} strokeWidth={1} /><circle cx="-12" cy="-7" r="1.6" fill="#ffc22e" stroke={INK} strokeWidth={1} /><circle cx="12" cy="-7" r="1.6" fill="#ffc22e" stroke={INK} strokeWidth={1} /><circle cx="0" cy="-10" r="1.6" fill="#ffc22e" stroke={INK} strokeWidth={1} /></>,
  bolt: () => f('M3 -13 L-8 2 L-1 2 L-4 13 L8 -3 L1 -3 Z', '#ffd23f'),
  trophy: () => <>{s('M-7 -7 C-13 -7 -13 1 -6 1M7 -7 C13 -7 13 1 6 1', INK, 1.8)}{f('M-8 -11 L8 -11 L7 -2 C6 3 3 5 0 5 C-3 5 -6 3 -7 -2 Z', '#ffc22e')}{f('M-2 5 L2 5 L3 9 L-3 9 Z', '#e8a400', 1.2)}{f('M-7 9 L7 9 L7 12 L-7 12 Z', '#8a6a42', 1.2)}</>,
  tower: () => <>{f('M-7 12 L-6 -4 L6 -4 L7 12 Z', '#d6dde8')}{f('M-9 -4 L-9 -9 L-6 -9 L-6 -7 L-2 -7 L-2 -9 L2 -9 L2 -7 L6 -7 L6 -9 L9 -9 L9 -4 Z', '#b9c3d3', 1.3)}{f('M-2 12 L-2 6 Q0 3 2 6 L2 12 Z', '#8a6a42', 1.1)}{f('M-2 -2 L2 -2 L2 2 L-2 2 Z', '#7cc8ff', 1)}</>,
  flag: () => <>{s('M-8 13 L-8 -12', INK, 2.2)}{f('M-8 -12 C-2 -15 3 -9 10 -11 L10 0 C3 2 -2 -4 -8 -1 Z', '#ef4a5d')}<path d={starD(1, -6, 3)} fill="#ffd23f" /></>,
  star: () => f(starD(0, 1, 13, 6), '#ffd23f'),
  medal: () => <>{f('M-7 -13 L-1 -2 L2 -4 L-3 -13 Z', '#2f7bf6', 1.2)}{f('M7 -13 L1 -2 L-2 -4 L3 -13 Z', '#ef4a5d', 1.2)}{f('M-8 4 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 Z', '#ffc22e')}<path d={starD(0, 4.3, 4.6)} fill="#fff1b3" stroke="#d99a00" strokeWidth={0.8} /></>,
  tv: () => <>{s('M-5 -13 L0 -8 L5 -13', INK, 1.6)}{f('M-12 -8 L12 -8 Q13 -8 13 -7 L13 8 Q13 9 12 9 L-12 9 Q-13 9 -13 8 L-13 -7 Q-13 -8 -12 -8 Z', '#5a6b8c')}{f('M-10 -5 L10 -5 L10 6 L-10 6 Z', '#9fe7c4', 1.2)}{f(starD(0, 0.5, 4.2), '#ffd23f', 1)}{s('M-6 12 L6 12', INK, 2)}</>,
  hands: () => <>{f('M-13 2 C-13 -3 -8 -6 -3 -4 L4 1 C6 3 4 6 1 5 L-2 4 L-5 8 C-8 10 -13 8 -13 2 Z', '#ffc9a3')}{f('M13 -2 C13 3 8 6 3 4 L-3 -1 C-5 -3 -2 -6 1 -5 L4 -4 L6 -8 C9 -10 13 -8 13 -2 Z', '#e8a77a')}{f('M0 -9 C-2 -12 -6 -11 -5 -8 C-4 -6 0 -4 0 -4 C0 -4 4 -6 5 -8 C6 -11 2 -12 0 -9 Z', '#ff5d8f', 1.1)}</>,
  heart: () => f('M0 12 C-17 1 -10 -14 0 -6 C10 -14 17 1 0 12 Z', '#ff5d8f'),
  flower: () => <>{[0, 60, 120, 180, 240, 300].map((a) => <ellipse key={a} cx="0" cy="-6.5" rx="4.4" ry="6.2" fill="#ff8fb1" stroke={INK} strokeWidth={1.3} transform={`rotate(${a})`} />)}<circle r="4.2" fill="#ffd23f" stroke={INK} strokeWidth={1.4} /></>,
  rainbow: () => <>{[['#ef4a5d', 12], ['#ffb238', 9.5], ['#ffd23f', 7], ['#5cb85c', 4.5]].map(([c, r]) => <path key={c as string} d={`M${-(r as number)} 6 A${r} ${r} 0 0 1 ${r} 6`} fill="none" stroke={c as string} strokeWidth={2.6} />)}<ellipse cx="-11" cy="7" rx="4.5" ry="2.8" fill={W} stroke={INK} strokeWidth={1.1} /><ellipse cx="11" cy="7" rx="4.5" ry="2.8" fill={W} stroke={INK} strokeWidth={1.1} /></>,
  cup: () => <>{s('M8 -3 C13 -3 13 5 7 5', INK, 2)}{f('M-10 -6 L9 -6 L7 8 Q6 11 3 11 L-4 11 Q-7 11 -8 8 Z', '#7cc8ff')}{s('M-4 -9 Q-6 -11 -4 -13M1 -9 Q-1 -11 1 -13', '#9aa6bf', 1.4)}{f(starD(-0.5, 2.5, 3.6), '#ffd23f', 0.9)}</>,
};

const TIER = { 1: ['#d08a4f', '#f1b98a'], 2: ['#a9b4c6', '#e3e9f2'], 3: ['#e8a400', '#ffe07a'] } as const;

export interface BadgeArtProps {
  glyph: BadgeGlyph;
  /** Màu nhóm (BADGE_CATEGORIES). */
  color: string;
  tier?: 1 | 2 | 3;
  locked?: boolean;
  size?: number;
  title?: string;
  className?: string;
}

export function BadgeArt({ glyph, color, tier = 1, locked, size = 72, title, className }: BadgeArtProps) {
  const id = 'kb' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [ring, ringLight] = TIER[tier];
  // Viền hoa 12 cánh quanh tâm (32, 30), bán kính 22–25.
  let scallop = '';
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12, r = i % 2 ? 22.5 : 25.5;
    scallop += `${i ? 'L' : 'M'}${(32 + r * Math.sin(a)).toFixed(2)} ${(30 - r * Math.cos(a)).toFixed(2)}`;
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`k-badge${locked ? ' is-locked' : ''}${className ? ' ' + className : ''}`}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={id} cx="0.38" cy="0.32" r="0.8"><stop offset="0" stopColor={W} stopOpacity="0.55" /><stop offset="0.6" stopColor={W} stopOpacity="0" /></radialGradient>
      </defs>
      <g opacity={locked ? 0.9 : 1}>
        <path d="M21 46 L15 62 L21.5 59 L25 63.5 L29 50 Z" fill={locked ? '#c9cfdb' : '#ef4a5d'} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M43 46 L49 62 L42.5 59 L39 63.5 L35 50 Z" fill={locked ? '#b7becc' : '#2f7bf6'} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        <path d={scallop + 'Z'} fill={locked ? '#d5dae4' : color} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        <circle cx="32" cy="30" r="18.5" fill={locked ? '#c4cad6' : ring} stroke={INK} strokeWidth={1.6} />
        <circle cx="32" cy="30" r="15.6" fill={locked ? '#eef0f5' : ringLight} />
        <circle cx="32" cy="30" r="15.6" fill={`url(#${id})`} />
        <g transform="translate(32 30)" opacity={locked ? 0.35 : 1} style={locked ? { filter: 'grayscale(1)' } : undefined}>{(GLYPHS[glyph] ?? GLYPHS.star)()}</g>
      </g>
      {locked ? (
        <g transform="translate(45 41)">
          <circle r="8" fill={W} stroke={INK} strokeWidth={1.6} />
          <rect x="-4" y="-1.5" width="8" height="6.5" rx="1.6" fill="#64748b" />
          <path d="M-2.6 -1.5 V-3.6 A2.6 2.6 0 0 1 2.6 -3.6 V-1.5" fill="none" stroke="#64748b" strokeWidth={1.6} />
        </g>
      ) : null}
    </svg>
  );
}
