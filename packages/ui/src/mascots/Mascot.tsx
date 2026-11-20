import { useId } from 'react';
import type { ReactNode } from 'react';
import { MASCOT_BY_ID } from '@openedu/contracts';
import type { MascotId, MascotMood } from '@openedu/contracts';
import { ARMS, HAND_L, BLUSH, INK, O, WHITE, E, F, S, ell, Limb, Mirror, Eye, Brows, Mouth, Extras } from './parts';
import { SPECS, MASCOT_ORDER } from './species';

/** Trang phục đã đặt sẵn vị trí (khung 0 0 100 100) — tạo bằng outfitWear() trong ui/outfits. */
export interface MascotWear { bg?: ReactNode; hat?: ReactNode; glasses?: ReactNode; neck?: ReactNode }
export interface MascotProps { id: MascotId; mood?: MascotMood; size?: number; className?: string; title?: string; animate?: boolean; wear?: MascotWear }
export interface MascotBubbleProps {
  mascot: MascotId;
  mood?: MascotMood;
  children: ReactNode;
  side?: 'left' | 'right';
  size?: number;
  className?: string;
  /** Linh vật nhún nhẹ (mặc định true). */
  animate?: boolean;
}

function BirdSmile({ p: [x, y], mood }: { p: [number, number]; mood: MascotMood }) {
  if (mood === 'think') return null;
  const sad = mood === 'sad';
  const d = (s: number) => {
    const a = x + s * 5.5, b = x + s * 10;
    return sad ? `M${a} ${y + 5} Q${(a + b) / 2} ${y + 2.6} ${b} ${y + 4.6}` : `M${a} ${y + 3} Q${(a + b) / 2} ${y + 5.6} ${b} ${y + 3.4}`;
  };
  return S(d(-1) + d(1), INK, 1.9);
}

/**
 * Linh vật chibi (viewBox 0 0 100 100). Ghép từ bộ phận chung theo tâm trạng:
 * happy · cheer (giơ tay + lấp lánh) · think (mắt nhìn lên + "?") · sad (tai cụp, không khóc) · wave (vẫy tay).
 */
export function Mascot({ id, mood = 'happy', size = 64, className, title, animate, wear }: MascotProps) {
  const s = SPECS[id] ?? SPECS.nghe;
  const clipId = 'km' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const label = title ?? MASCOT_BY_ID[id]?.name ?? id;
  const headD = s.headD ?? ell(50, 42, 32, 28);
  const eyeY = s.eyeY ?? 45, dx = s.eyeDX ?? 13;
  const bodyC = s.body ?? s.fill;
  const limb = s.limb ?? bodyC;
  const foot = s.foot ?? s.shade;
  const cheer = mood === 'cheer';
  const [hx, hy] = cheer ? HAND_L.up : HAND_L.down;
  const tilt = mood === 'think' ? 'rotate(5 50 72)' : mood === 'sad' ? 'rotate(-4 50 72) translate(0 1)' : undefined;
  const delay = `${MASCOT_ORDER.indexOf(id) * 0.41}s`;
  const shine = s.shine === undefined ? [35, 25] : s.shine;
  const blushY = s.blushY ?? eyeY + 9, bdx = s.blushDX ?? 23;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`k-mascot k-mascot--${mood}${animate ? ' k-mascot--anim' : ''}${className ? ' ' + className : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      <defs>
        <clipPath id={clipId}><path d={headD} /></clipPath>
      </defs>
      {wear?.bg}
      {/* Đội mũ: thu nhỏ cả linh vật quanh chân để mũ không bị cắt ở mép trên. */}
      <g transform={wear?.hat ? 'translate(50 99) scale(0.84) translate(-50 -99)' : undefined}>
      <g className="k-m-bob" style={{ animationDelay: delay }}>
        {s.back}
        {E(40.5, 93, 6.6, 3.9, foot)}
        {E(59.5, 93, 6.6, 3.9, foot)}
        {E(50, 80, 18, 14, bodyC)}
        {s.belly ? F(ell(50, 83, 11, 8.5), s.belly) : null}
        {F(ell(50, 68.5, 13, 3.6), s.shade, undefined, 0.6)}
        {wear?.neck ? null : s.neck}
        {s.prop ? <g transform={`translate(${hx} ${hy})`}>{s.prop}</g> : null}
        <Limb d={cheer ? ARMS.up(-1) : ARMS.down(-1)} color={limb} />
        {mood === 'wave'
          ? <g className="k-m-wavearm"><Limb d={ARMS.wave} color={limb} /></g>
          : mood === 'think' ? null : <Limb d={cheer ? ARMS.up(1) : ARMS.down(1)} color={limb} />}
        {wear?.neck}

        <g transform={tilt}>
          {s.ear ? <>{s.ear(mood === 'sad')}<Mirror>{s.ear(mood === 'sad')}</Mirror></> : null}
          <path d={headD} fill={s.fill} />
          {s.patch || s.patchL ? (
            <g clipPath={`url(#${clipId})`}>
              {s.patch}
              {s.patchL ? <>{s.patchL}<Mirror>{s.patchL}</Mirror></> : null}
            </g>
          ) : null}
          <path d={headD} fill="none" stroke={INK} strokeWidth={O} />
          {shine ? <ellipse cx={shine[0]} cy={shine[1]} rx="6.5" ry="3.4" fill={WHITE} opacity="0.5" transform={`rotate(-28 ${shine[0]} ${shine[1]})`} /> : null}
          {s.face}
          {s.faceL ? <>{s.faceL}<Mirror>{s.faceL}</Mirror></> : null}
          <Eye x={50 - dx} y={eyeY} mood={mood} delay={delay} />
          <Eye x={50 + dx} y={eyeY} mood={mood} delay={delay} />
          <Brows y={eyeY} dx={dx} mood={mood} />
          <ellipse cx={50 - bdx} cy={blushY} rx="5" ry="3" fill={BLUSH} opacity="0.6" />
          <ellipse cx={50 + bdx} cy={blushY} rx="5" ry="3" fill={BLUSH} opacity="0.6" />
          {s.smile ? <BirdSmile p={s.smile} mood={mood} /> : null}
          {s.beak ? s.beak(mood) : null}
          {s.mouth ? <Mouth p={s.mouth} mood={mood} /> : null}
          {wear?.glasses}
          {wear?.hat ?? s.top}
        </g>

        {mood === 'think' ? <Limb d={ARMS.chin} color={limb} /> : null}
        <Extras mood={mood} />
      </g>
      </g>
    </svg>
  );
}

/** Linh vật + bong bóng lời nói bo tròn, đuôi bong bóng chỉ về linh vật. */
export function MascotBubble({ mascot, mood, children, side = 'left', size = 64, className, animate = true }: MascotBubbleProps) {
  return (
    <div className={`k-mbubble k-mbubble--${side}${className ? ' ' + className : ''}`}>
      <Mascot id={mascot} mood={mood} size={size} animate={animate} className="k-mbubble__mascot" />
      <div className="k-mbubble__text">{children}</div>
    </div>
  );
}
