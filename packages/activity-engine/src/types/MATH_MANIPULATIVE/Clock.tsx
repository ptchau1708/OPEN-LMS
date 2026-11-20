import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { sfx, unlockAudio } from '@openedu/ui';

export interface ClockProps {
  value: number | undefined;
  onChange: (v: number) => void;
  locked: boolean;
  showDigital: boolean;
  reveal: boolean;
  correct?: number;
}

const C = 100;
const norm = (v: number) => ((Math.round(v) % 720) + 720) % 720;

export function clockText(v: number): string {
  const n = norm(v);
  const h = Math.floor(n / 60) || 12;
  const m = n % 60;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

function digital(v: number): string {
  const n = norm(v);
  const h = Math.floor(n / 60) || 12;
  const m = n % 60;
  return `${h}:${m < 10 ? '0' : ''}${m}`;
}

function Hands({ v, cls }: { v: number; cls?: string }) {
  const n = norm(v);
  const m = n % 60;
  const ha = (Math.floor(n / 60) + m / 60) * 30;
  const ma = m * 6;
  return (
    <g className={cls}>
      <g transform={`rotate(${ha} ${C} ${C})`}>
        <line className="ae-mm-hand ae-mm-hand--hour" x1={C} y1={C + 8} x2={C} y2={C - 46} />
      </g>
      <g transform={`rotate(${ma} ${C} ${C})`}>
        <line className="ae-mm-hand ae-mm-hand--min" x1={C} y1={C + 10} x2={C} y2={C - 72} />
      </g>
    </g>
  );
}

/** Đồng hồ kim: kéo kim ngắn (giờ) và kim dài (phút, bước 5 phút). Giá trị = số phút từ 0:00 (0–719). */
export function Clock({ value, onChange, locked, showDigital, reveal, correct }: ClockProps) {
  const has = typeof value === 'number' && Number.isFinite(value);
  const v = has ? norm(value as number) : 0;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ hand: 'h' | 'm'; pointerId: number; v: number } | null>(null);
  const [active, setActive] = useState<'h' | 'm' | null>(null);

  const set = (next: number) => {
    const n = norm(next);
    if (n !== v || !has) {
      onChange(n);
      if (n % 60 !== v % 60 || !has) sfx.tick();
    }
  };

  const angleOf = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = (svgRef.current as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 200 - C;
    const y = ((e.clientY - r.top) / r.height) * 200 - C;
    const a = (Math.atan2(x, -y) * 180) / Math.PI;
    return { a: (a + 360) % 360, d: Math.hypot(x, y) };
  };

  const apply = (hand: 'h' | 'm', a: number, cur: number) => {
    const h = Math.floor(cur / 60);
    const m = cur % 60;
    if (hand === 'm') {
      const nm = (Math.round(a / 30) * 5) % 60;
      let nh = h;
      if (m >= 45 && nm <= 15 && nm !== m) nh = h + 1;
      else if (m <= 15 && nm >= 45 && nm !== m) nh = h - 1;
      return norm(nh * 60 + nm);
    }
    const nh = ((Math.round((a - m * 0.5) / 30) % 12) + 12) % 12;
    return norm(nh * 60 + m);
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (locked || !e.isPrimary) return;
    unlockAudio();
    const t = e.target as Element;
    const { a, d } = angleOf(e);
    const tagged = t.closest('[data-hand]')?.getAttribute('data-hand') as 'h' | 'm' | null | undefined;
    const hand: 'h' | 'm' = tagged || (d > 52 ? 'm' : 'h');
    drag.current = { hand, pointerId: e.pointerId, v };
    setActive(hand);
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* Safari cũ */
    }
    const nv = apply(hand, a, v);
    drag.current.v = nv;
    set(nv);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = drag.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const nv = apply(s.hand, angleOf(e).a, s.v);
    if (nv !== s.v) {
      s.v = nv;
      set(nv);
    }
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current && drag.current.pointerId === e.pointerId) {
      drag.current = null;
      setActive(null);
    }
  };

  const bump = (delta: number) => {
    if (locked) return;
    unlockAudio();
    set(v + delta);
  };

  const n = v;
  const m = n % 60;
  const ha = (Math.floor(n / 60) + m / 60) * 30;
  const ma = m * 6;
  const wrong = reveal && correct !== undefined && (!has || norm(correct) !== v);
  const ok = reveal && correct !== undefined && has && norm(correct) === v;

  return (
    <div className={`ae-mm-clock${ok ? ' is-ok' : ''}${wrong ? ' is-try' : ''}`}>
      <svg
        ref={svgRef}
        className={`ae-mm-face${active ? ` is-drag-${active}` : ''}${locked ? ' is-locked' : ''}`}
        viewBox="0 0 200 200"
        role="img"
        aria-label={has ? `Đồng hồ chỉ ${clockText(v)}` : 'Đồng hồ — kéo kim để chỉnh giờ'}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <circle className="ae-mm-face__rim" cx={C} cy={C} r={94} />
        <circle className="ae-mm-face__bg" cx={C} cy={C} r={86} />
        {Array.from({ length: 60 }, (_, i) => (
          <line
            key={i}
            className={i % 5 === 0 ? 'ae-mm-tick ae-mm-tick--h' : 'ae-mm-tick'}
            x1={C}
            y1={C - 84}
            x2={C}
            y2={C - (i % 5 === 0 ? 76 : 80)}
            transform={`rotate(${i * 6} ${C} ${C})`}
          />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const k = i + 1;
          const ang = (k * 30 * Math.PI) / 180;
          return (
            <text key={k} className="ae-mm-numeral" x={C + Math.sin(ang) * 63} y={C - Math.cos(ang) * 63} textAnchor="middle" dominantBaseline="central">
              {k}
            </text>
          );
        })}
        {wrong && correct !== undefined ? <Hands v={correct} cls="ae-mm-ghost" /> : null}
        <g transform={`rotate(${ha} ${C} ${C})`} data-hand="h" className="ae-mm-hand-g ae-mm-hand-g--h">
          <line className="ae-mm-hand-hit" x1={C} y1={C} x2={C} y2={C - 50} />
          <line className="ae-mm-hand ae-mm-hand--hour" x1={C} y1={C + 8} x2={C} y2={C - 46} />
        </g>
        <g transform={`rotate(${ma} ${C} ${C})`} data-hand="m" className="ae-mm-hand-g ae-mm-hand-g--m">
          <line className="ae-mm-hand-hit" x1={C} y1={C} x2={C} y2={C - 78} />
          <line className="ae-mm-hand ae-mm-hand--min" x1={C} y1={C + 10} x2={C} y2={C - 72} />
          <circle className="ae-mm-hand-tip" cx={C} cy={C - 72} r={5} />
        </g>
        <circle className="ae-mm-cap" cx={C} cy={C} r={7} />
      </svg>

      {showDigital ? <div className="ae-mm-digital" aria-hidden="true">{has ? digital(v) : '--:--'}</div> : null}

      {!locked ? (
        <div className="ae-mm-clock-btns">
          <div className="ae-mm-stepper">
            <span className="ae-mm-stepper__lbl ae-mm-stepper__lbl--h">Kim giờ</span>
            <button type="button" className="ae-mm-step" aria-label="Lùi 1 giờ" onClick={() => bump(-60)}>−</button>
            <button type="button" className="ae-mm-step" aria-label="Thêm 1 giờ" onClick={() => bump(60)}>+</button>
          </div>
          <div className="ae-mm-stepper">
            <span className="ae-mm-stepper__lbl ae-mm-stepper__lbl--m">Kim phút</span>
            <button type="button" className="ae-mm-step" aria-label="Lùi 5 phút" onClick={() => bump(-5)}>−</button>
            <button type="button" className="ae-mm-step" aria-label="Thêm 5 phút" onClick={() => bump(5)}>+</button>
          </div>
        </div>
      ) : null}

      {wrong && correct !== undefined ? <p className="ae-mm-fix">Đồng hồ chỉ đúng: {clockText(correct)}</p> : null}
    </div>
  );
}
