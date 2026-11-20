/**
 * 10 linh vật OPEN-EDU — vẽ mới hoàn toàn, mỗi bạn một nét văn hóa nhỏ.
 * Chỉ khai báo phần riêng; khung chung (thân, tay, mắt, miệng…) nằm ở Mascot.tsx + parts.tsx.
 */
import type { ReactNode } from 'react';
import type { MascotId, MascotMood } from '@openedu/contracts';
import { P, F, S, E, ell, Limb, INK, EYE, WHITE, GOLD, RED, LEAF } from './parts';
import type { Pt } from './parts';

export interface Spec {
  fill: string;
  shade: string;
  light: string;
  body?: string;
  belly?: string | null;
  limb?: string;
  foot?: string;
  /** Hình đầu (path). Mặc định ellipse (50,42) 32×28. */
  headD?: string;
  /** Tai/sừng bên trái — tự lật sang phải. droop = tai cụp (buồn). */
  ear?: (droop: boolean) => ReactNode;
  /** Sau lưng (đuôi, đuôi công). */
  back?: ReactNode;
  /** Mảng màu cắt theo hình đầu: giữa / bên trái (tự lật). */
  patch?: ReactNode;
  patchL?: ReactNode;
  /** Trên mặt, trước mắt: giữa / bên trái (tự lật). */
  face?: ReactNode;
  faceL?: ReactNode;
  top?: ReactNode;
  neck?: ReactNode;
  /** Đồ cầm ở tay trái, gốc (0,0) = bàn tay. */
  prop?: ReactNode;
  mouth?: Pt | null;
  beak?: (m: MascotMood) => ReactNode;
  /** Điểm gốc mỏ chim để vẽ nét cười hai bên. */
  smile?: Pt;
  eyeY?: number;
  eyeDX?: number;
  blushY?: number;
  blushDX?: number;
  shine?: Pt | null;
}

/* ---------- đồ vật ---------- */
const bamboo = (
  <g>
    <Limb d="M2 6 L-11 -26" color="#86cf6e" w={4.6} />
    {S('M-4.9 -3.5 L0.3 -5.7M-9.2 -14 L-4 -16.2', INK, 1.5)}
    {P('M-10 -22 Q-20 -31 -27 -25 Q-18 -18 -10 -22 Z', LEAF)}
    {P('M-11 -26 Q-20 -40 -25 -38 Q-21 -29 -11 -26 Z', '#79c26a')}
  </g>
);

const eucalyptus = (
  <g>
    {S('M1 4 Q-3 -8 -2 -22', '#8a7356', 2.6)}
    {P('M-1.5 -9 C-10 -11 -15.5 -19 -14.5 -28 C-6 -26 -1 -18.5 -1.5 -9 Z', '#8ccfae')}
    {P('M-2 -17 C-8 -15.5 -16.5 -9.5 -19 -3 C-10 -2.5 -4 -8.5 -2 -17 Z', '#6dbb98')}
    {S('M-3 -11.5 L-11 -24M-4 -14 L-14 -6', '#4f9a7a', 1.3)}
  </g>
);

const kiwiSlice = (
  <g>
    {E(-4, -9, 11, 11, '#8a6a42')}
    {E(-4, -9, 8.6, 8.6, '#a5d965', false)}
    {E(-4, -9, 3.2, 3.2, '#f5f8d8', false)}
    {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((a) => {
      const r = (a * Math.PI) / 180, x = -4 + 5.6 * Math.cos(r), y = -9 + 5.6 * Math.sin(r);
      return <ellipse key={a} cx={x} cy={y} rx="0.9" ry="1.4" fill={EYE} transform={`rotate(${a + 90} ${x} ${y})`} />;
    })}
  </g>
);

const yuzu = (
  <g>
    {E(50, 12.5, 9, 7.8, '#ffb53a')}
    {S('M44.6 10.8 Q45.8 7.8 48.8 7.3', '#ffe2a6', 1.9)}
    {S('M50 5.2 L50.4 2.6', INK, 2)}
    {P('M50.6 4.6 Q55 0.6 60.4 2.6 Q56.4 7.2 50.6 4.6 Z', LEAF)}
  </g>
);

const nonLa = (
  <g>
    {P('M15 27 L50 2.5 L85 27 Q50 35 15 27 Z', '#f6d88c')}
    {S('M25.5 20 Q50 26 74.5 20', '#d3a84f', 1.6)}
    {S('M36 12.8 Q50 16.4 64 12.8', '#d3a84f', 1.6)}
    {S('M19 28.6 Q50 35.2 81 28.6', '#e9c46e', 1.4)}
  </g>
);

const thaiBlanket = (
  <g>
    {P('M34 17.5 C42 12.5 58 12.5 66 17.5 L61.5 30.5 C55 33.5 45 33.5 38.5 30.5 Z', RED)}
    {S('M37.6 19.6 C44 16 56 16 62.4 19.6', GOLD, 1.6)}
    {S('M40.6 28.4 C46 30.8 54 30.8 59.4 28.4', GOLD, 1.6)}
    <path d="M50 19.2 L53.8 23.8 L50 28.4 L46.2 23.8 Z" fill={GOLD} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
    {E(42, 23.8, 1.4, 1.4, GOLD, false)}
    {E(58, 23.8, 1.4, 1.4, GOLD, false)}
  </g>
);

const beret = (
  <g>
    {P('M53 18.5 C51.5 9.5 58 7 60.5 11.5 C61.5 6 69 6.5 68.5 12.5 C73 11 75.5 17 71 20.5 Z', RED)}
    {P('M22.5 21 C24 11.5 38 6.5 51 8.5 C62 10 66.5 15 64.5 19.5 C60 24.5 29 26 22.5 21 Z', '#3d4c99')}
    {P('M43.5 8.8 L44.6 4.6 L47.6 5 L47 8.8 Z', '#3d4c99')}
    {S('M29 17.5 Q42 12.5 57 13.8', '#5f70c4', 1.6)}
  </g>
);

const peacockFan = (
  <g>
    {[-100, -72, -45, -18, 18, 45, 72, 100].map((a) => {
      const r = (a * Math.PI) / 180;
      const x = 50 + 36 * Math.sin(r), y = 64 - 44 * Math.cos(r);
      return (
        <g key={a} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a})`}>
          <ellipse rx="9" ry="14" fill="#52c28d" stroke={INK} strokeWidth={2.2} />
          <ellipse cy="-3" rx="5.4" ry="6.4" fill={GOLD} />
          <ellipse cy="-2.6" rx="3.5" ry="4.3" fill="#1fa7b5" />
          <ellipse cy="-2.2" rx="1.8" ry="2.3" fill="#283f7d" />
        </g>
      );
    })}
  </g>
);

const roosterTail = (
  <g>
    {P('M62 82 C66 66 78 52 90 47 C86 60 76 73 67 85 Z', '#2bb3a3')}
    {P('M64 84 C70 72 82 63 96 62 C88 70 80 78 69 88 Z', RED)}
    {P('M66 87 C74 80 85 77 95 79 C87 84 79 88 70 91 Z', '#ffa23a')}
  </g>
);

/* ---------- 10 bạn ---------- */
const PANDA = '#3d3d4c';
const STRIPE = '#3a3247';

export const SPECS: Record<MascotId, Spec> = {
  // Nghé Tí — trâu con Việt Nam, đội nón lá
  nghe: {
    fill: '#a8968a', shade: '#8a7466', light: '#f5cfc2', belly: '#d9c8bc',
    ear: (droop) => (
      <>
        {P('M27 35 C19.5 35.5 12 33 10 25.5 C14.5 29 20.5 29.6 27 29.2 Z', '#f6ead6')}
        <g transform={`rotate(${droop ? -26 : 6} 25 45)`}>
          {P('M27 41 Q13 35 6 43 Q13 51 27 48 Z', '#a8968a')}
          {F('M24 42.3 Q15 38.5 10.5 43.2 Q15.5 47 24 46.3 Z', '#f5cfc2')}
        </g>
      </>
    ),
    face: <>{E(50, 59, 15.5, 9.8, '#f5cfc2')}{E(44.5, 56, 1.7, 2.3, '#8a5a4a', false)}{E(55.5, 56, 1.7, 2.3, '#8a5a4a', false)}</>,
    mouth: [50, 61.6], eyeY: 42.5, blushY: 52, shine: null,
    top: nonLa,
  },
  // Shiba Mochi — Nhật Bản, khăn quàng đỏ
  shiba: {
    fill: '#f3a55e', shade: '#dc8640', light: '#fff4e4', belly: '#fff4e4',
    ear: (droop) => (
      <g transform={droop ? 'rotate(-38 33 22)' : undefined}>
        {P('M24 28 L20.5 7.5 Q21.5 4.5 24.5 6 L43 19 Z', '#f3a55e')}
        {F('M26.5 23 L24.5 11.5 L36.5 19.5 Z', '#fff4e4')}
      </g>
    ),
    patch: F('M14 52 C18 47 28 47 36 52 C41 53 44 48.5 50 48.5 C56 48.5 59 53 64 52 C72 47 82 47 86 52 L86 76 L14 76 Z', '#fff4e4'),
    faceL: E(36.5, 34.5, 3.2, 2.2, '#fff4e4', false),
    face: P('M45.5 51.5 Q50 49.5 54.5 51.5 Q53.5 55.5 50 56 Q46.5 55.5 45.5 51.5 Z', EYE),
    mouth: [50, 59.4],
    neck: (
      <>
        {P('M32 67 Q50 74 68 67 L63 75 Q56 84 50 88 Q44 84 37 75 Z', RED)}
        {E(44, 75, 1.4, 1.4, WHITE, false)}{E(56, 75, 1.4, 1.4, WHITE, false)}{E(50, 81, 1.4, 1.4, WHITE, false)}
      </>
    ),
    back: <>{E(73, 76, 7.5, 7.5, '#f3a55e')}{E(74, 75, 3.2, 3.2, '#fff4e4', false)}</>,
  },
  // Gấu trúc Mập — Trung Quốc, cầm cành tre
  panda: {
    fill: '#ffffff', shade: '#dfe4ee', light: '#ffffff', limb: PANDA, foot: PANDA, belly: null,
    ear: (droop) => (
      <g transform={droop ? 'rotate(-32 33 27)' : undefined}>
        {E(24.5, 20, 9.5, 9, PANDA)}
        {E(25, 20.6, 4.5, 4.2, '#62627a', false)}
      </g>
    ),
    faceL: <ellipse cx="36.5" cy="46.5" rx="8.6" ry="10.6" transform="rotate(28 36.5 46.5)" fill={PANDA} />,
    face: P('M45.5 54 Q50 52 54.5 54 Q54 57.5 50 58 Q46 57.5 45.5 54 Z', PANDA),
    mouth: [50, 61], blushDX: 25, blushY: 56, shine: null,
    prop: bamboo,
  },
  // Capi — chuột lang nước Brazil, đội quả cam nhỏ (yuzu)
  capybara: {
    fill: '#d19a62', shade: '#b07b47', light: '#e8be8c',
    headD: 'M22 24 C30 15 70 15 78 24 C85 32 86 57 80 64.5 C73 72 27 72 20 64.5 C14 57 15 32 22 24 Z',
    ear: (droop) => <g transform={droop ? 'rotate(-35 27 24)' : undefined}>{P('M21 27 Q17 17 25 16 Q31 16 31.5 22 Z', '#b07b47')}</g>,
    face: (
      <>
        {P('M31 53 C31 45 69 45 69 53 L69 59 C69 68.5 31 68.5 31 59 Z', '#e8be8c')}
        <rect x="42" y="48.5" width="16" height="6" rx="3" fill={EYE} />
      </>
    ),
    mouth: [50, 59.8], eyeY: 37.5, blushY: 47, blushDX: 27, shine: [32, 26],
    top: yuzu,
  },
  // Koala Lá — Úc, ôm lá bạch đàn
  koala: {
    fill: '#aeb6c5', shade: '#8f98a8', light: '#f1f3f8', belly: '#e3e7ef',
    ear: (droop) => (
      <g transform={droop ? 'rotate(-30 30 30)' : undefined}>
        {E(19.5, 25, 13, 12, '#aeb6c5')}
        {E(20.5, 26, 7.8, 7.2, '#f1f3f8', false)}
      </g>
    ),
    face: (
      <>
        {P('M50 43 C56.5 43 58 49.5 57.5 54.5 C57 60.5 43 60.5 42.5 54.5 C42 49.5 43.5 43 50 43 Z', '#4a5263')}
        {E(47.4, 47.6, 1.8, 2.6, '#8a93a6', false)}
      </>
    ),
    mouth: [50, 62.6], eyeDX: 15, eyeY: 44, blushDX: 25, blushY: 55,
    prop: eucalyptus,
  },
  // Voi Chang — Thái Lan, khăn hoa văn trên đầu
  voi: {
    fill: '#a9bbd8', shade: '#8ea2c3', light: '#f8cbd8', belly: '#c6d3e8',
    ear: (droop) => (
      <g transform={`rotate(${droop ? -16 : 0} 27 42)`}>
        {P('M28 31 C13 23 1 33 3.5 48 C5.5 61 18 64 28 55 Z', '#a9bbd8')}
        {F('M25 35.5 C15 30 7.5 37 8.5 47 C9.5 56 17 58 24.5 52.5 Z', '#f8cbd8')}
      </g>
    ),
    face: (
      <>
        {P('M45 48.5 Q50 44.5 55 48.5 C55.5 53 55 57 56.6 59.4 C58 61.2 60.4 60.6 60.6 58.6 C60.8 56.8 63.6 56.6 64 58.8 C64.6 63.4 60.4 66.4 55.6 65.4 C49.4 64.2 46 59 45 48.5 Z', '#a9bbd8')}
        {S('M46.4 54.2 Q50.6 55.4 54.6 53.8M47.8 58.8 Q51.6 60 55.2 58.2', '#8ea2c3', 1.6)}
      </>
    ),
    mouth: [39.5, 60.5], blushDX: 25, shine: [26, 34],
    top: thaiBlanket,
  },
  // Kiwi Lăn — New Zealand, cầm lát kiwi
  kiwi: {
    fill: '#a8855a', shade: '#86663f', light: '#cfae80', foot: '#f2c48d', belly: '#c4a172',
    headD: ell(50, 43, 32, 29),
    patch: (
      <>
        {S('M30 28 l3 1.6M62 25 l3.2 -1M70 34 l2.6 1.8M26 40 l3 -.6M40 22 l2.6 1M58 31 l2.6 1.4', '#86663f', 1.8)}
      </>
    ),
    top: S('M46 15.2 Q44.6 10 41 8.6M50.6 14.2 Q51 9 54.6 6.6', INK, 2.2),
    beak: () => (
      <>
        {P('M45.8 50 Q50 47.8 54.2 50 L51.6 73 Q50 75.6 48.4 73 Z', '#f4dcaa')}
        {E(49.2, 69.6, 0.7, 1.1, '#b89a66', false)}
      </>
    ),
    mouth: null, smile: [50, 50], eyeY: 44, eyeDX: 14,
    prop: kiwiSlice,
  },
  // Hổ Bum — Hàn Quốc, khăn quàng nhỏ
  ho: {
    fill: '#ffa64b', shade: '#e8872d', light: '#fff6ea', belly: '#fff6ea',
    ear: (droop) => (
      <g transform={droop ? 'rotate(-34 31 27)' : undefined}>
        {E(24, 21, 8.5, 8.5, '#ffa64b')}
        {E(24.5, 21.8, 4.4, 4.4, '#fff6ea', false)}
      </g>
    ),
    patch: F('M46.5 13 L50 25 L53.5 13 Z', STRIPE),
    patchL: (
      <>
        {F('M36 14 Q40.5 18.5 43 25.5 Q38 22 34 17 Z', STRIPE)}
        {F('M15 41.5 Q22.5 42 27.5 45 Q22 46.5 15 46.5 Z', STRIPE)}
        {F('M15.5 50.5 Q22 50.5 26 52 Q22 54 16 54 Z', STRIPE)}
      </>
    ),
    face: (
      <>
        {P('M50 51 C42 49 36 52 36 57.5 C36 64 44 66 50 64.5 C56 66 64 64 64 57.5 C64 52 58 49 50 51 Z', '#fff6ea')}
        {P('M46.2 51.6 Q50 50 53.8 51.6 Q53 55 50 55.6 Q47 55 46.2 51.6 Z', '#ff7d93')}
      </>
    ),
    mouth: [50, 57.8], eyeY: 43.5,
    neck: (
      <>
        {P('M31 66.5 Q50 76 69 66.5 L70.5 73 Q50 83 29.5 73 Z', '#4a8df0')}
        {P('M56 75 L64 73.5 L66.5 87 L58.5 87.5 Z', '#4a8df0')}
        {S('M57.6 80 L65.2 79.2M58.2 84 L66 83.4', GOLD, 1.8)}
      </>
    ),
    back: (
      <>
        <Limb d="M64 88 C76 90 82 82 79 72" color="#ffa64b" w={6.5} />
        {E(79, 72.5, 3.3, 3.3, STRIPE, false)}
        {S('M72.5 86.6 L73.6 90.4M77.6 81.6 L81.2 82.6', STRIPE, 2)}
      </>
    ),
  },
  // Gà trống Coco — Pháp, đội mũ nồi
  ga: {
    fill: '#fff6e6', shade: '#f0d7b0', light: '#fff6e6', body: '#ff8a5b', foot: '#ffb238', belly: '#ffb48a',
    back: roosterTail,
    beak: (m) => (
      <>
        {P('M48.3 56 C46.3 60 48 64.5 50.5 64 C53 63.5 53.6 59.5 52 56 Z', RED)}
        {m === 'cheer'
          ? <>{P('M46.8 56 L53.2 56 L50 60.2 Z', '#ff9f1a')}{P('M45 50.5 Q50 48.5 55 50.5 L50 55.2 Z', '#ffc23a')}</>
          : P('M45 50.5 Q50 48.5 55 50.5 L50 57.5 Z', '#ffc23a')}
      </>
    ),
    mouth: null, smile: [50, 51], shine: null,
    top: beret,
  },
  // Công Múa — Ấn Độ, đuôi xòe có "mắt"
  cong: {
    fill: '#43b3cf', shade: '#2a8fb0', light: '#e9fbff', body: '#2f8fd0', foot: '#d9b77e', belly: '#5ab8e8',
    headD: ell(50, 46, 27, 25),
    back: peacockFan,
    top: (
      <>
        {S('M50 22 L45 9M50 22 L50 6.5M50 22 L55 9', INK, 1.6)}
        {E(45, 9, 2.6, 2.6, '#1fa7b5')}{E(50, 6.5, 2.6, 2.6, GOLD)}{E(55, 9, 2.6, 2.6, '#1fa7b5')}
      </>
    ),
    beak: () => P('M46.5 53 Q50 51.4 53.5 53 L50 59 Z', '#f6d58e'),
    mouth: null, smile: [50, 53], eyeY: 47.5, eyeDX: 12, blushY: 56, blushDX: 21, shine: [38, 31],
  },
};

export const MASCOT_ORDER: MascotId[] = ['nghe', 'shiba', 'panda', 'capybara', 'koala', 'voi', 'kiwi', 'ho', 'ga', 'cong'];
