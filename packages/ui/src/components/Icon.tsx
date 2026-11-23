import type { CSSProperties } from 'react';

export type IconName = 'home' | 'book' | 'play' | 'gift' | 'user' | 'speaker' | 'star' | 'close' | 'back' | 'next' | 'check' | 'retry'
  | 'lock' | 'tv' | 'pencil' | 'mic' | 'stop' | 'clock' | 'trophy' | 'map' | 'passport' | 'team' | 'plus' | 'trash' | 'eye'
  | 'settings' | 'upload' | 'image' | 'video' | 'puzzle' | 'wheel' | 'hint' | 'flame' | 'tower' | 'qr' | 'parent' | 'menu' | 'drag' | 'camera' | 'print';

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
  /** Độ dày nét (mặc định 2.25 trên khung 24). */
  strokeWidth?: number;
  style?: CSSProperties;
}

/** Vòng tròn dưới dạng path (để gộp nhiều nét vào một `d`). */
const C = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
/** Hình chữ nhật bo góc dưới dạng path. */
const R = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

function gear(): string {
  const n = 8, ro = 9.6, ri = 7.3, pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    for (const [r, d] of [[ri, -0.3], [ro, -0.16], [ro, 0.16], [ri, 0.3]] as const) {
      pts.push(`${(12 + r * Math.cos(a + d)).toFixed(2)} ${(12 + r * Math.sin(a + d)).toFixed(2)}`);
    }
  }
  return `M${pts.join('L')}z` + C(12, 12, 3);
}

/** [nét viền, phần tô đặc (tùy chọn)] */
type Def = string | [string, string];

const ICONS: Record<IconName, Def> = {
  home: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5h4v5',
  book: 'M12 6.5C9.6 4.8 6.4 4.5 3.5 5.2v13.6c2.9-.7 6.1-.4 8.5 1.3 2.4-1.7 5.6-2 8.5-1.3V5.2c-2.9-.7-6.1-.4-8.5 1.3zM12 6.5v13.6',
  play: 'M8 5.2v13.6L19 12z',
  gift: R(4.5, 11, 15, 9.5, 1) + R(3, 7.5, 18, 3.5, 1) + 'M12 7.5v13M12 7.5S10.4 3.6 8.2 4.4c-1.8.7-.8 3.1 3.8 3.1zM12 7.5s1.6-3.9 3.8-3.1c1.8.7.8 3.1-3.8 3.1z',
  user: C(12, 8, 4) + 'M4.5 20.5c0-4.1 3.4-6.5 7.5-6.5s7.5 2.4 7.5 6.5',
  speaker: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.5a7.8 7.8 0 0 1 0 11',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  back: 'M19 12H5.5M11 6l-6 6 6 6',
  next: 'M5 12h13.5M13 6l6 6-6 6',
  check: 'M4.5 12.8l4.8 4.7L19.5 6.8',
  retry: 'M19.4 15a8 8 0 1 1-1.8-8.6L20.5 9.5M20.5 4.5v5h-5',
  lock: R(4.5, 11, 15, 10, 2) + 'M8 11V8a4 4 0 0 1 8 0v3M12 15v2.5',
  tv: R(3, 6.5, 18, 12.5, 2.2) + 'M8.5 2.5 12 6.5l3.5-4M8 21.5h8',
  pencil: 'M14.5 5.5l4 4M4 20l1.1-4.6L15.6 4.9a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.6 18.9z',
  mic: R(9, 3, 6, 11.5, 3) + 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6',
  stop: [R(6, 6, 12, 12, 2.5), R(6, 6, 12, 12, 2.5)],
  clock: C(12, 12, 9) + 'M12 7.5V12l3 2',
  trophy: 'M7.5 4h9v5a4.5 4.5 0 0 1-9 0zM7.5 5.5h-3V7a3 3 0 0 0 3 3M16.5 5.5h3V7a3 3 0 0 1-3 3M12 13.5V17M9.5 17h5l.8 3.5H8.7z',
  map: 'M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20',
  passport: R(5, 3, 14, 18, 1.8) + C(12, 10.5, 3.6) + 'M8.4 10.5h7.2M12 6.9c-1.5 2.2-1.5 5 0 7.2M12 6.9c1.5 2.2 1.5 5 0 7.2M9 17.5h6',
  team: C(12, 7.5, 3) + C(5.5, 9.8, 2.2) + C(18.5, 9.8, 2.2) + 'M6.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5M2.5 18.5c0-2.4 1.4-4 3.6-4.2M21.5 18.5c0-2.4-1.4-4-3.6-4.2',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5.5M14 11v5.5',
  eye: 'M2.5 12C5 7.2 8.3 5 12 5s7 2.2 9.5 7c-2.5 4.8-5.8 7-9.5 7s-7-2.2-9.5-7z' + C(12, 12, 3),
  settings: gear(),
  upload: 'M12 15V4.5M7.5 9 12 4.5 16.5 9M4 14.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4.5',
  camera: R(3, 7, 18, 13, 2.5) + C(12, 13.5, 3.6) + 'M8.5 7l1.5-2.5h4L15.5 7',
  print: R(3, 9, 18, 8, 2) + 'M7 9V4h10v5M7 14h10v6H7z',
  image: R(3, 4, 18, 16, 2.5) + C(8.5, 9.5, 1.8) + 'M3.5 17.5l5-5 4 4 2.5-2.5 5.5 5',
  video: R(3, 6, 12.5, 12, 2.5) + 'M15.5 10.5 21 7.5v9l-5.5-3z',
  puzzle: 'M4 7.5h4.5a2.5 2.5 0 1 1 4.5 0H17V12a2.5 2.5 0 1 1 0 4.5v4H4z',
  wheel: [C(12, 13, 8.5) + 'M12 4.5v17M4.6 8.75l14.8 8.5M4.6 17.25l14.8-8.5M10 1.8h4L12 4.4z', C(12, 13, 1.8)],
  hint: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v.5h5V16c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
  flame: 'M12 21c-3.9 0-7-2.7-7-6.5 0-3.3 2.3-5.4 3.7-7.3.3 1.9 1.2 3.1 2.4 3.6C11 7.3 12.6 4.6 15 3c.3 3 1.9 4.6 3.1 6.4.9 1.4 1.4 2.9 1.4 4.8 0 4-3.2 6.8-7.5 6.8zM12 21c-1.7 0-3-1.2-3-2.9 0-1.6 1.3-2.7 2.2-3.9.4 1 1 1.6 1.7 1.8.2-1.1.7-2 1.4-2.7.6 1.2 1.7 2.4 1.7 4.4 0 1.9-1.4 3.3-4 3.3z',
  tower: 'M4 21h16M6.5 21V10h11v11M6.5 10V5h2.5v2h2V5h2v2h2V5h2.5v5M10 21v-3.5a2 2 0 0 1 4 0V21',
  qr: [R(3.5, 3.5, 6.5, 6.5, 1.2) + R(14, 3.5, 6.5, 6.5, 1.2) + R(3.5, 14, 6.5, 6.5, 1.2) + 'M14 14h3v3M20.5 14v.01M14 20.5h.01M17 20.5h3.5V17',
    R(5.6, 5.6, 2.3, 2.3, .5) + R(16.1, 5.6, 2.3, 2.3, .5) + R(5.6, 16.1, 2.3, 2.3, .5)],
  parent: C(8.5, 6.5, 3) + 'M3 21v-1.5a5.5 5.5 0 0 1 11 0V21' + C(17.5, 11.5, 2.2) + 'M14.5 21v-1a3 3 0 0 1 6 0v1',
  menu: 'M4 6.5h16M4 12h16M4 17.5h16',
  drag: ['', C(9, 6, 1.7) + C(15, 6, 1.7) + C(9, 12, 1.7) + C(15, 12, 1.7) + C(9, 18, 1.7) + C(15, 18, 1.7)],
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function Icon({ name, size = 24, className, title, strokeWidth = 2.25, style }: IconProps) {
  const def = ICONS[name] ?? ICONS.star;
  const [stroke, fill] = typeof def === 'string' ? [def, ''] : def;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`k-icon${className ? ' ' + className : ''}`}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {stroke && <path d={stroke} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />}
      {fill && <path d={fill} fill="currentColor" />}
    </svg>
  );
}
