import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

const COLORS = ['--k-math', '--k-viet', '--k-eng', '--k-nat', '--k-art', '--k-star', '--k-sci', '--k-music'];

export interface ConfettiProps { show: boolean; durationMs?: number; count?: number }

/** Mưa giấy màu nhẹ (≤ 60 mảnh, chỉ CSS). Tự ẩn sau durationMs. Bật lại `show` để bắn lần nữa. */
export function Confetti({ show, durationMs = 2500, count = 48 }: ConfettiProps) {
  const [burst, setBurst] = useState(0);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!show) { setActive(false); return; }
    setBurst((b) => b + 1);
    setActive(true);
    const t = window.setTimeout(() => setActive(false), durationMs);
    return () => window.clearTimeout(t);
  }, [show, durationMs]);

  const n = Math.max(1, Math.min(60, count));
  const pieces = useMemo(() => {
    let seed = burst * 9301 + 49297;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const fall = Math.max(900, durationMs - 300);
    return Array.from({ length: n }, (_, i) => {
      const shape = i % 3;
      return {
        left: `${(i / n) * 100 + rnd() * (100 / n)}%`,
        background: `var(${COLORS[i % COLORS.length]})`,
        width: shape === 1 ? 10 : 8 + rnd() * 6,
        height: shape === 1 ? 10 : 12 + rnd() * 8,
        borderRadius: shape === 1 ? '50%' : shape === 2 ? '3px' : '2px',
        '--dx': `${Math.round((rnd() - 0.5) * 160)}px`,
        '--rot': `${Math.round(360 + rnd() * 540) * (i % 2 ? 1 : -1)}deg`,
        animationDuration: `${Math.round(fall * (0.7 + rnd() * 0.3))}ms`,
        animationDelay: `${Math.round(rnd() * 350)}ms`,
      } as CSSProperties;
    });
  }, [burst, n, durationMs]);

  if (!active) return null;
  return (
    <div className="k-confetti" aria-hidden="true" key={burst}>
      {pieces.map((st, i) => <i key={i} style={st} />)}
    </div>
  );
}
