import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export interface StarCountProps { value: number; size?: 'sm' | 'md' | 'lg'; className?: string }
export interface StarBurstProps { show: boolean; count?: number; onDone?: () => void }

const STAR_D = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.3l-5.8 3.1 1.1-6.4-4.7-4.6 6.5-.9z';

/** Ngôi sao vàng tô đặc, viền vàng đậm (màu lấy từ token). */
export function StarShape({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg className={`k-starshape${className ? ' ' + className : ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="k-starshape__fill" d={STAR_D} strokeWidth="1.8" strokeLinejoin="round" />
      <path className="k-starshape__shine" d="M8.6 9.6l1.4-.2.8-1.7" fill="none" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const STAR_PX = { sm: 20, md: 28, lg: 40 } as const;

/** Viên đếm sao: ngôi sao + số; "nảy" lên khi số tăng. */
export function StarCount({ value, size = 'md', className }: StarCountProps) {
  const prev = useRef(value);
  const [pop, setPop] = useState(0);
  useEffect(() => {
    if (value > prev.current) setPop((p) => p + 1);
    prev.current = value;
  }, [value]);
  return (
    <span className={`k-stars k-stars--${size}${className ? ' ' + className : ''}`} aria-label={`${value} ngôi sao`} role="img">
      <span key={pop} className={`k-stars__inner${pop ? ' is-pop' : ''}`}>
        <StarShape size={STAR_PX[size]} />
        <span className="k-stars__num" aria-hidden="true">{value}</span>
      </span>
    </span>
  );
}

/** Sao bay lên rồi mờ dần (~900ms). Đặt trong phần tử cha có position: relative. */
export function StarBurst({ show, count = 5, onDone }: StarBurstProps) {
  const n = Math.max(3, Math.min(8, Math.round(count)));
  const done = useRef(onDone);
  done.current = onDone;
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!show) return;
    setRun((r) => r + 1);
    const t = window.setTimeout(() => done.current?.(), 920);
    return () => window.clearTimeout(t);
  }, [show]);
  if (!show) return null;
  return (
    <div className="k-starburst" aria-hidden="true" key={run}>
      {Array.from({ length: n }, (_, i) => {
        const f = n === 1 ? 0.5 : i / (n - 1);
        const angle = -150 + f * 120; // quạt từ trái lên phải
        const rad = (angle * Math.PI) / 180;
        const dist = 70 + ((i * 37) % 3) * 18;
        const st = {
          '--dx': `${Math.round(Math.cos(rad) * dist)}px`,
          '--dy': `${Math.round(Math.sin(rad) * dist) - 20}px`,
          '--rot': `${(i % 2 ? 1 : -1) * (90 + i * 25)}deg`,
          animationDelay: `${(i % 3) * 40}ms`,
        } as CSSProperties;
        return (
          <span key={i} className="k-starburst__star" style={st}>
            <StarShape size={i % 3 === 0 ? 34 : 26} />
          </span>
        );
      })}
    </div>
  );
}
