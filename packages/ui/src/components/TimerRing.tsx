import { useEffect, useRef, useState } from 'react';
import { sfx } from '../sfx';

export interface TimerRingProps { endsAt: string; totalSeconds: number; size?: number; onDone?: () => void; tick?: boolean }

/** Vòng đếm ngược. Còn ≤ 5 giây thì chuyển cam; `tick` phát tiếng tích tắc mỗi giây cuối. */
export function TimerRing({ endsAt, totalSeconds, size = 64, onDone, tick }: TimerRingProps) {
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(onDone);
  done.current = onDone;
  const fired = useRef<string | null>(null);
  const lastTick = useRef<number | null>(null);

  const remainingMs = Number.isFinite(end) ? Math.max(0, end - now) : 0;
  const secs = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (!Number.isFinite(end)) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [end]);

  useEffect(() => {
    if (remainingMs <= 0 && fired.current !== endsAt) {
      fired.current = endsAt;
      done.current?.();
    }
  }, [remainingMs, endsAt]);

  useEffect(() => {
    if (!tick || secs <= 0 || secs > 5) return;
    if (lastTick.current !== secs) { lastTick.current = secs; sfx.tick(); }
  }, [secs, tick]);

  const total = Math.max(1, totalSeconds);
  const frac = Math.max(0, Math.min(1, remainingMs / 1000 / total));
  const r = 42, circ = 2 * Math.PI * r;
  const warn = secs <= 5;
  return (
    <div
      className={`k-timer${warn ? ' is-warn' : ''}${secs === 0 ? ' is-over' : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(14, size * 0.36) }}
      role="timer"
      aria-label={`Còn ${secs} giây`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
        <circle className="k-timer__face" cx="50" cy="50" r="47" />
        <circle className="k-timer__track" cx="50" cy="50" r={r} />
        <circle
          className="k-timer__arc"
          cx="50" cy="50" r={r}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="k-timer__num" key={warn ? secs : 'n'}>{secs}</span>
    </div>
  );
}
