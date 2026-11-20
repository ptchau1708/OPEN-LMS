import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameKind } from '@openedu/contracts';
import { Button, Confetti, Icon, usePrefersReducedMotion } from '@openedu/ui';
import { Bomb, Burst, Duck } from './illustrations';
import { cx, play } from './util';
import './base.css';
import './games.css';

/** Màu lát vòng quay / làn vịt — lấy từ token môn học. */
const PALETTE = ['--k-math', '--k-viet', '--k-nat', '--k-eng', '--k-art', '--k-sci', '--k-star', '--k-music'];
const DUCK_COLORS = ['#ffd23f', '#ffb3c7', '#9fd8ff', '#b7f0a8', '#ffc58a', '#d9c2ff', '#fff1a8', '#a8f0e6'];

export interface GameProps {
  entries?: string[];
  seconds?: number;
  interactive: boolean;
  sound?: boolean;
  /** 'screen' = TV, chữ to. */
  big?: boolean;
}

export function GameView({ kind, ...p }: GameProps & { kind: GameKind }) {
  if (kind === 'wheel') return <SpinWheel {...p} />;
  if (kind === 'duck-race') return <DuckRace {...p} />;
  return <TimeBomb {...p} />;
}

function useTimeouts() {
  const ids = useRef<number[]>([]);
  useEffect(() => () => ids.current.forEach((id) => window.clearTimeout(id)), []);
  return (fn: () => void, ms: number) => {
    ids.current.push(window.setTimeout(fn, ms));
  };
}

/* ------------------------------------------------------------------ */
/* Vòng quay may mắn                                                  */
/* ------------------------------------------------------------------ */

export function SpinWheel({ entries, interactive, sound, big }: GameProps) {
  const initial = useMemo(() => {
    const e = (entries ?? []).map((s) => s.trim()).filter(Boolean);
    return e.length >= 2 ? e.slice(0, 24) : ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'];
  }, [entries]);
  const [list, setList] = useState(initial);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const later = useTimeouts();
  useEffect(() => {
    setList(initial);
    setWinner(null);
  }, [initial]);

  const n = list.length;
  const seg = 360 / n;
  const duration = reduced ? 300 : 4200;

  function spin() {
    if (spinning || n < 2) return;
    setWinner(null);
    const extra = 360 * 5 + Math.random() * 360;
    const next = rotation + extra;
    setRotation(next);
    setSpinning(true);
    // tiếng tích tắc chậm dần
    let t = 0;
    for (let i = 0; i < 22 && t < duration - 200; i++) {
      later(() => play('tick', sound), t);
      t += 60 + i * i * 1.6;
    }
    later(() => {
      const at = ((360 - (next % 360)) % 360 + 360) % 360;
      setWinner(Math.floor(at / seg) % n);
      setSpinning(false);
      play('fanfare', sound);
    }, duration + 80);
  }

  function removeWinner() {
    if (winner == null || n <= 2) return;
    setList(list.filter((_, i) => i !== winner));
    setWinner(null);
  }

  const R = 100;
  const fontSize = n <= 6 ? 13 : n <= 10 ? 10.5 : n <= 16 ? 8 : 6.5;
  return (
    <div className={cx('lp-game lp-wheel', big && 'lp-game--big')}>
      <div className="lp-wheel__stage">
        <div className="lp-wheel__pointer" aria-hidden="true" />
        <div className="lp-wheel__disc" style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${duration}ms` }}>
          <svg viewBox="-104 -104 208 208" role="img" aria-label={`Vòng quay có ${n} ô`}>
            <circle r="103" style={{ fill: 'var(--k-card)' }} />
            {list.map((label, i) => {
              const a0 = ((i * seg - 90) * Math.PI) / 180;
              const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
              const large = seg > 180 ? 1 : 0;
              const d = `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 ${large} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
              const mid = i * seg + seg / 2;
              const text = label.length > 14 ? label.slice(0, 13) + '…' : label;
              return (
                <g key={i}>
                  <path d={d} style={{ fill: `var(${PALETTE[i % PALETTE.length]})`, stroke: 'var(--k-card)', strokeWidth: 2 }} />
                  <g transform={`rotate(${mid - 90})`}>
                    <text x="58" y="0" dominantBaseline="middle" textAnchor="middle" fontSize={fontSize} fontWeight="800" style={{ fill: 'var(--k-card)' }}>
                      {text}
                    </text>
                  </g>
                </g>
              );
            })}
            <circle r="16" style={{ fill: 'var(--k-card)', stroke: 'var(--k-line)', strokeWidth: 3 }} />
            <circle r="7" style={{ fill: 'var(--k-star)' }} />
          </svg>
        </div>
      </div>
      <div className="lp-game__side">
        <div className={cx('lp-game__result', winner != null && 'is-on')} aria-live="polite">
          {winner != null ? (
            <>
              <span className="lp-game__result-label">Vòng quay chọn</span>
              <strong>{list[winner]}</strong>
            </>
          ) : (
            <span className="lp-game__result-label">{spinning ? 'Đang quay…' : interactive ? 'Bấm “Quay!” nhé' : 'Cùng xem trên bảng nhé!'}</span>
          )}
        </div>
        {interactive && (
          <div className="lp-game__actions">
            <Button variant="primary" size="xl" onClick={spin} disabled={spinning} icon={<Icon name="wheel" size={28} />}>
              Quay!
            </Button>
            {winner != null && n > 2 && (
              <Button variant="secondary" size="lg" onClick={removeWinner}>
                Bỏ “{list[winner]}” ra
              </Button>
            )}
          </div>
        )}
      </div>
      <Confetti show={winner != null} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Đua vịt                                                            */
/* ------------------------------------------------------------------ */

export function DuckRace({ entries, interactive, sound, big }: GameProps) {
  const lanes = useMemo(() => {
    const e = (entries ?? []).map((s) => s.trim()).filter(Boolean);
    return e.length >= 2 ? e.slice(0, 10) : ['Vịt Vàng', 'Vịt Hồng', 'Vịt Xanh', 'Vịt Cam'];
  }, [entries]);
  const [pos, setPos] = useState<number[]>(() => lanes.map(() => 0));
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setPos(lanes.map(() => 0));
    setWinner(null);
  }, [lanes]);
  useEffect(() => () => window.clearInterval(timer.current), []);

  function reset() {
    window.clearInterval(timer.current);
    setRunning(false);
    setWinner(null);
    setPos(lanes.map(() => 0));
  }

  function start() {
    if (running) return;
    let cur = winner != null ? lanes.map(() => 0) : pos.slice();
    setWinner(null);
    setRunning(true);
    play('tap', sound);
    timer.current = window.setInterval(() => {
      cur = cur.map((p) => {
        const burst = Math.random() < 0.12 ? 0.06 : 0;
        return Math.min(1, p + 0.008 + Math.random() * 0.05 + burst);
      });
      setPos(cur);
      // vịt về đích trước = vịt có vị trí lớn nhất trong lượt này (hòa thì bốc ngẫu nhiên)
      let best = -1;
      const top = Math.max.apply(null, cur);
      if (top >= 1) {
        const leaders = cur.map((p, i) => (p >= top - 0.0001 ? i : -1)).filter((i) => i >= 0);
        best = leaders[Math.floor(Math.random() * leaders.length)];
      }
      if (best >= 0) {
        window.clearInterval(timer.current);
        setRunning(false);
        setWinner(best);
        play('fanfare', sound);
      } else if (Math.random() < 0.3) {
        play('tick', sound);
      }
    }, 350);
  }

  return (
    <div className={cx('lp-game lp-race', big && 'lp-game--big')}>
      <div className="lp-race__pond" role="img" aria-label={`Đường đua có ${lanes.length} chú vịt`}>
        {lanes.map((name, i) => (
          <div key={i} className={cx('lp-race__lane', winner === i && 'is-winner')}>
            <span className="lp-race__name">{name}</span>
            <div className="lp-race__track">
              <div className="lp-race__mover" style={{ transform: `translateX(${(pos[i] ?? 0) * 100}%)` }}>
                <span className={cx('lp-race__duck', running && 'is-swimming')}>
                  <Duck size={big ? 72 : 48} color={DUCK_COLORS[i % DUCK_COLORS.length]} />
                </span>
              </div>
            </div>
            <span className="lp-race__finish" aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="lp-game__side lp-game__side--row">
        <div className={cx('lp-game__result', winner != null && 'is-on')} aria-live="polite">
          {winner != null ? (
            <>
              <span className="lp-game__result-label">Về nhất là</span>
              <strong>{lanes[winner]}</strong>
            </>
          ) : (
            <span className="lp-game__result-label">{running ? 'Cố lên các bạn vịt ơi!' : interactive ? 'Sẵn sàng chưa nào?' : 'Cùng xem trên bảng nhé!'}</span>
          )}
        </div>
        {interactive && (
          <div className="lp-game__actions">
            <Button variant="primary" size="xl" onClick={start} disabled={running} icon={<Icon name="play" size={28} />}>
              {winner != null ? 'Đua lại' : 'Xuất phát!'}
            </Button>
            {(running || winner != null) && (
              <Button variant="secondary" size="lg" onClick={reset} icon={<Icon name="retry" size={24} />}>
                Về vạch
              </Button>
            )}
          </div>
        )}
      </div>
      <Confetti show={winner != null} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bom hẹn giờ                                                        */
/* ------------------------------------------------------------------ */

export function TimeBomb({ seconds, interactive, sound, big }: GameProps) {
  const total = Math.max(3, Math.min(600, Math.round(seconds ?? 30)));
  const [left, setLeft] = useState(total * 1000);
  const [running, setRunning] = useState(false);
  const endsAt = useRef(0);
  const lastSec = useRef(total);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setLeft(total * 1000);
    setRunning(false);
  }, [total]);
  useEffect(() => () => window.clearInterval(timer.current), []);

  useEffect(() => {
    if (!running) return;
    endsAt.current = Date.now() + left;
    timer.current = window.setInterval(() => {
      const ms = Math.max(0, endsAt.current - Date.now());
      setLeft(ms);
      const s = Math.ceil(ms / 1000);
      if (s !== lastSec.current) {
        lastSec.current = s;
        if (s > 0 && s <= 5) play('tick', sound);
      }
      if (ms <= 0) {
        window.clearInterval(timer.current);
        setRunning(false);
        play('fanfare', sound);
      }
    }, 100);
    return () => window.clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const secs = Math.ceil(left / 1000);
  const exploded = left <= 0;
  const danger = !exploded && secs <= 5 && running;
  const reset = () => {
    window.clearInterval(timer.current);
    setRunning(false);
    setLeft(total * 1000);
    lastSec.current = total;
  };

  return (
    <div className={cx('lp-game lp-bombgame', big && 'lp-game--big', danger && 'is-danger', exploded && 'is-exploded')}>
      <div className="lp-bombgame__stage">
        {exploded ? (
          <div className="lp-bombgame__boom">
            <Burst size={big ? 360 : 240} text="BÙM!" />
          </div>
        ) : (
          <div className={cx('lp-bombgame__bomb', running && 'is-lit')}>
            <Bomb size={big ? 340 : 220} fuse={left / (total * 1000)} label={`Còn ${secs} giây`} />
            <span className="lp-bombgame__count" aria-live="off">
              {secs}
            </span>
          </div>
        )}
      </div>
      <div className="lp-game__side">
        <div className={cx('lp-game__result', exploded && 'is-on')} aria-live="polite">
          {exploded ? (
            <>
              <span className="lp-game__result-label">Hết giờ rồi!</span>
              <strong>Bạn đang cầm bom trả lời nhé!</strong>
            </>
          ) : (
            <span className="lp-game__result-label">{running ? 'Chuyền nhanh lên nào!' : interactive ? `Bom nổ sau ${total} giây` : 'Cùng xem trên bảng nhé!'}</span>
          )}
        </div>
        {interactive && (
          <div className="lp-game__actions">
            {!exploded && (
              <Button variant="primary" size="xl" onClick={() => { play('tap', sound); setRunning(!running); }} icon={<Icon name={running ? 'stop' : 'play'} size={28} />}>
                {running ? 'Tạm dừng' : left < total * 1000 ? 'Chạy tiếp' : 'Bắt đầu'}
              </Button>
            )}
            {(exploded || left < total * 1000) && (
              <Button variant={exploded ? 'primary' : 'secondary'} size={exploded ? 'xl' : 'lg'} onClick={reset} icon={<Icon name="retry" size={24} />}>
                Chơi lại
              </Button>
            )}
          </div>
        )}
      </div>
      <Confetti show={exploded} />
    </div>
  );
}
