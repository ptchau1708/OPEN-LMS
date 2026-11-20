/**
 * Cây trong Vườn lớp — vẽ mới (SVG, khung 0 0 60 80, mặt đất y = 70). 6 loại × 5 giai đoạn:
 * 0 hạt giống · 1 nảy mầm · 2 cây non · 3 ra nụ · 4 nở hoa.
 */
import type { ReactNode } from 'react';
import type { GrowthStage, PlantKind } from '@openedu/contracts';

const INK = '#22304a';
const STEM = '#4f9a4a';
const LEAF = '#6cc35a';
const LEAF2 = '#5cb85c';
const f = (d: string, fill: string, w = 1.4, key?: string | number) => <path key={key} d={d} fill={fill} stroke={INK} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" />;
const stem = (h: number, curve = 3) => <path d={`M30 70 C${30 - curve} ${70 - h * 0.4} ${30 + curve} ${70 - h * 0.7} 30 ${70 - h}`} fill="none" stroke={STEM} strokeWidth={3} strokeLinecap="round" />;
const leaf = (x: number, y: number, dir: 1 | -1, s = 1, key?: string | number) =>
  f(`M${x} ${y} C${x + dir * 6 * s} ${y - 7 * s} ${x + dir * 14 * s} ${y - 5 * s} ${x + dir * 16 * s} ${y - 1 * s} C${x + dir * 11 * s} ${y + 3 * s} ${x + dir * 5 * s} ${y + 3 * s} ${x} ${y} Z`, dir > 0 ? LEAF : LEAF2, 1.2, key);
const petals = (cx: number, cy: number, n: number, rx: number, ry: number, dist: number, fill: string, key?: string) => (
  <g key={key}>
    {Array.from({ length: n }, (_, i) => (
      <ellipse key={i} cx={cx} cy={cy - dist} rx={rx} ry={ry} fill={fill} stroke={INK} strokeWidth={1} transform={`rotate(${(360 / n) * i} ${cx} ${cy})`} />
    ))}
  </g>
);
const small5 = (x: number, y: number, r: number, c: string, key: string | number) => (
  <g key={key}>{[0, 72, 144, 216, 288].map((a) => { const t = ((a - 90) * Math.PI) / 180; return <circle key={a} cx={x + r * Math.cos(t)} cy={y + r * Math.sin(t)} r={r * 0.8} fill={c} stroke={INK} strokeWidth={0.8} />; })}<circle cx={x} cy={y} r={r * 0.5} fill="#ffd23f" /></g>
);

const BUD: Record<PlantKind, string> = { 'huong-duong': '#ffd23f', sen: '#ff9cc2', 'hoa-dao': '#ff9cc2', cuc: '#ffffff', 'ca-chua': '#7fd36b', 'xuong-rong': '#ff7eb6' };

function bloom(kind: PlantKind): ReactNode {
  switch (kind) {
    case 'huong-duong':
      return <>{petals(30, 22, 14, 3.2, 7, 9, '#ffd23f')}<circle cx="30" cy="22" r="7.5" fill="#8a5a2b" stroke={INK} strokeWidth={1.3} />{[[-2.5, -2], [2, -2.5], [0, 1.5], [-3, 2.5], [3, 2]].map(([x, y]) => <circle key={`${x}${y}`} cx={30 + x} cy={22 + y} r="0.9" fill="#5a3818" />)}</>;
    case 'sen':
      return <>{[-50, -25, 25, 50].map((a) => <path key={a} d="M30 30 C24 22 25 13 30 8 C35 13 36 22 30 30 Z" fill="#ffb3d1" stroke={INK} strokeWidth={1.1} transform={`rotate(${a} 30 30)`} />)}{f('M30 31 C23 23 24 13 30 6 C36 13 37 23 30 31 Z', '#ff8fb8', 1.2)}<ellipse cx="30" cy="30" rx="6" ry="2.4" fill="#ffd23f" stroke={INK} strokeWidth={1} /></>;
    case 'hoa-dao':
      return <>{['M30 34 L19 22', 'M30 30 L40 18', 'M30 26 L29 12'].map((d) => <path key={d} d={d} stroke="#7a5236" strokeWidth={2.4} strokeLinecap="round" />)}{[[19, 21], [40, 17], [29, 11], [23, 28], [37, 26], [34, 12], [15, 26]].map(([x, y], i) => small5(x, y, 3, i % 2 ? '#ffc2d8' : '#ff9cc2', i))}</>;
    case 'cuc':
      return <>{[[30, 20, 1], [19, 30, 0.75], [41, 31, 0.75]].map(([x, y, s]) => <g key={x}>{petals(x, y, 12, 2 * s, 5 * s, 6.5 * s, '#ffffff')}<circle cx={x} cy={y} r={4 * s} fill="#ffd23f" stroke={INK} strokeWidth={1.1} /></g>)}</>;
    case 'ca-chua':
      return <>{[[22, 34], [37, 30], [30, 44]].map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="5.6" fill="#ef4a5d" stroke={INK} strokeWidth={1.3} /><path d={`M${x - 3} ${y - 5} L${x} ${y - 3.6} L${x + 3} ${y - 5}`} stroke={STEM} strokeWidth={1.8} fill="none" strokeLinecap="round" /><ellipse cx={x - 2} cy={y - 1.5} rx="1.4" ry="0.9" fill="#ffb3b3" /></g>)}</>;
    case 'xuong-rong':
      return <>{petals(30, 22, 8, 2.6, 4.6, 4.6, '#ff7eb6')}<circle cx="30" cy="22" r="2.6" fill="#ffd23f" stroke={INK} strokeWidth={1} /></>;
  }
}

function cactus(stage: GrowthStage): ReactNode {
  const h = [0, 12, 26, 38, 40][stage];
  return (
    <>
      {stage >= 3 ? f('M37 52 C37 44 43 44 43 38 C43 34 48 34 48 38 C48 46 42 48 42 54 Z', '#5cb85c', 1.3) : null}
      {stage >= 3 ? f('M23 56 C23 50 18 50 18 44 C18 40 13 40 13 44 C13 52 19 54 19 58 Z', '#5cb85c', 1.3) : null}
      {f(`M23 70 L23 ${70 - h + 6} C23 ${70 - h} 37 ${70 - h} 37 ${70 - h + 6} L37 70 Z`, '#6cc35a', 1.4)}
      <path d={`M30 68 L30 ${70 - h + 4}`} stroke="#4f9a4a" strokeWidth={1.2} />
      {stage >= 2 ? [0.3, 0.6].map((t) => <path key={t} d={`M23 ${70 - h * t} l-2 -1M37 ${70 - h * t} l2 -1`} stroke={INK} strokeWidth={0.9} />) : null}
      {stage === 3 ? <circle cx="30" cy={70 - h} r="3" fill={BUD['xuong-rong']} stroke={INK} strokeWidth={1.1} /> : null}
      {stage === 4 ? <g transform={`translate(0 ${70 - h - 22})`}>{bloom('xuong-rong')}</g> : null}
    </>
  );
}

export interface PlantProps {
  kind: PlantKind;
  stage: GrowthStage;
  size?: number;
  /** Lắc lư nhẹ (tắt khi giảm chuyển động — CSS). */
  sway?: boolean;
  title?: string;
  className?: string;
}

export function Plant({ kind, stage, size = 60, sway, title, className }: PlantProps) {
  let body: ReactNode;
  if (stage === 0) {
    body = <><ellipse cx="30" cy="66" rx="5" ry="3.6" fill="#a8743f" stroke={INK} strokeWidth={1.2} /><path d="M28 64.5 Q30 63 32 64.5" stroke="#d9a76a" strokeWidth={1} fill="none" /></>;
  } else if (kind === 'xuong-rong') {
    body = cactus(stage);
  } else if (stage === 1) {
    body = <>{stem(10, 1)}{leaf(30, 61, -1, 0.6)}{leaf(30, 61, 1, 0.6)}</>;
  } else {
    const h = stage === 2 ? 28 : kind === 'ca-chua' ? 44 : 42;
    body = (
      <>
        {stem(h)}
        {leaf(30, 60, -1, 0.9)}{leaf(30, 54, 1, 0.9)}
        {stage >= 2 ? <>{leaf(30, 47, -1, 0.75)}{leaf(30, 50, 1, 0.65)}</> : null}
        {stage >= 3 ? <>{leaf(30, 38, 1, 0.7)}{leaf(30, 40, -1, 0.6)}</> : null}
        {stage === 3 ? f(`M30 ${70 - h + 1} C24 ${70 - h - 3} 26 ${70 - h - 11} 30 ${70 - h - 13} C34 ${70 - h - 11} 36 ${70 - h - 3} 30 ${70 - h + 1} Z`, BUD[kind], 1.3) : null}
        {stage === 4 ? <g transform={kind === 'ca-chua' || kind === 'hoa-dao' ? undefined : `translate(0 ${70 - h - 34})`}>{bloom(kind)}</g> : null}
      </>
    );
  }
  return (
    <svg viewBox="0 0 60 80" width={size} height={(size * 80) / 60} className={`k-plant${sway && stage > 0 ? ' k-plant--sway' : ''}${className ? ' ' + className : ''}`}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {title ? <title>{title}</title> : null}
      <ellipse cx="30" cy="71" rx="17" ry="4.5" fill="#8a5a2b" opacity="0.85" />
      <ellipse cx="30" cy="70" rx="14" ry="3" fill="#a8743f" />
      <g className="k-plant__body">{body}</g>
    </svg>
  );
}
