import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Media, sfx, unlockAudio } from '@openedu/ui';
import type { TypePlayerProps } from '../../shared/typeApi';
import { COLOR_NAMES, DRAW_COLORS } from './palette';
import './style.css';

export { DRAW_COLORS };

/** Kích thước logic của bức vẽ (tỉ lệ 4:3). Nét lưu theo toạ độ này nên co giãn không méo. */
export const DRAW_W = 800;
export const DRAW_H = 600;

const SIZES = [6, 14, 28];
const SIZE_NAMES = ['Nét mảnh', 'Nét vừa', 'Nét to'];

type Action = { kind: 'stroke'; color: string; size: number; erase: boolean; pts: number[] } | { kind: 'clear' };

function drawStroke(ctx: CanvasRenderingContext2D, a: Extract<Action, { kind: 'stroke' }>) {
  const p = a.pts;
  ctx.save();
  ctx.globalCompositeOperation = a.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = a.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length <= 2) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], a.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2;
      const my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Vẽ toàn bộ lịch sử vào ctx (đã scale về toạ độ logic). */
function renderAll(ctx: CanvasRenderingContext2D, actions: Action[], base: HTMLImageElement | null) {
  ctx.clearRect(0, 0, DRAW_W, DRAW_H);
  let start = 0;
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i].kind === 'clear') {
      start = i + 1;
      break;
    }
  }
  if (start === 0 && base) ctx.drawImage(base, 0, 0, DRAW_W, DRAW_H);
  for (let i = start; i < actions.length; i++) {
    const a = actions[i];
    if (a.kind === 'stroke') drawStroke(ctx, a);
  }
}

function hasInk(actions: Action[], base: HTMLImageElement | null): boolean {
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (a.kind === 'clear') return false;
    if (a.kind === 'stroke' && !a.erase) return true;
  }
  return !!base;
}

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors && !src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img'));
    img.src = src;
  });
}

function drawBackground(ctx: CanvasRenderingContext2D, bg: string | undefined, img: HTMLImageElement | null) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, DRAW_W, DRAW_H);
  if (!bg) return;
  if (bg.startsWith('emoji:')) {
    ctx.save();
    ctx.font = `${Math.round(DRAW_H * 0.6)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.9;
    ctx.fillText(bg.slice(6), DRAW_W / 2, DRAW_H / 2 + DRAW_H * 0.03);
    ctx.restore();
    return;
  }
  if (img) {
    const s = Math.min(DRAW_W / img.naturalWidth, DRAW_H / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (DRAW_W - w) / 2, (DRAW_H - h) / 2, w, h);
  }
}

export function Player(props: TypePlayerProps<'DRAW'>) {
  if (props.mode === 'bigscreen') return <DrawView {...props} />;
  return <DrawPad {...props} />;
}

/** TV: chỉ xem. */
function DrawView({ item, value }: TypePlayerProps<'DRAW'>) {
  const bg = item.payload.background;
  return (
    <div className="ae-dr ae-dr--view">
      <div className="ae-dr-paper">
        {value?.dataUrl ? (
          <img className="ae-dr-layer ae-dr-img" src={value.dataUrl} alt="Bức vẽ" />
        ) : (
          <>
            {bg ? <Media src={bg} alt="" className="ae-dr-layer ae-dr-bg" /> : null}
            <div className="ae-dr-wait">Các bạn đang vẽ… 🎨</div>
          </>
        )}
      </div>
    </div>
  );
}

function DrawPad({ item, value, onChange, disabled }: TypePlayerProps<'DRAW'>) {
  const colors = item.payload.colors && item.payload.colors.length ? item.payload.colors.slice(0, 12) : DRAW_COLORS;
  const bg = item.payload.background;
  const [color, setColor] = useState(colors[0]);
  const [size, setSize] = useState(1);
  const [erase, setErase] = useState(false);
  const [count, setCount] = useState(0); // số thao tác — để bật/tắt nút Hoàn tác
  const [bgFailed, setBgFailed] = useState(false);

  const paperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actions = useRef<Action[]>([]);
  const base = useRef<HTMLImageElement | null>(null);
  const bgImg = useRef<HTMLImageElement | null>(null);
  const live = useRef<{ pointerId: number; a: Extract<Action, { kind: 'stroke' }>; lmx: number; lmy: number } | null>(null);
  const scale = useRef(1);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;

  const redraw = useCallback(() => {
    const c = ctx();
    if (!c) return;
    c.setTransform(scale.current, 0, 0, scale.current, 0, 0);
    renderAll(c, actions.current, base.current);
  }, []);

  /* kích thước canvas theo khung, nét sắc trên màn hình HiDPI */
  useEffect(() => {
    const paper = paperRef.current;
    const cv = canvasRef.current;
    if (!paper || !cv) return;
    const fit = () => {
      const w = paper.clientWidth;
      if (!w) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(w * dpr);
      const ph = Math.round((w * DRAW_H / DRAW_W) * dpr);
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
      }
      scale.current = pw / DRAW_W;
      redraw();
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(paper);
    window.addEventListener('resize', fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [redraw]);

  /* nạp lại bức vẽ cũ (khi quay lại slide) — một lần */
  useEffect(() => {
    const src = value?.dataUrl;
    if (!src) return;
    let alive = true;
    loadImage(src, false)
      .then((img) => {
        if (!alive || actions.current.length) return;
        base.current = img;
        redraw();
        setCount((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ảnh nền: thử CORS để xuất PNG có nền */
  useEffect(() => {
    bgImg.current = null;
    setBgFailed(false);
    if (!bg || bg.startsWith('emoji:')) return;
    let alive = true;
    loadImage(bg, true)
      .then((img) => {
        if (alive) bgImg.current = img;
      })
      .catch(() => alive && setBgFailed(true));
    return () => {
      alive = false;
    };
  }, [bg]);

  const exportNow = useCallback(() => {
    window.clearTimeout(timer.current);
    pending.current = false;
    if (!hasInk(actions.current, base.current)) {
      onChangeRef.current({ dataUrl: '' });
      return;
    }
    const make = (withBg: boolean) => {
      const out = document.createElement('canvas');
      out.width = DRAW_W;
      out.height = DRAW_H;
      const oc = out.getContext('2d');
      if (!oc) return '';
      drawBackground(oc, withBg ? bg : undefined, withBg ? bgImg.current : null);
      const layer = document.createElement('canvas');
      layer.width = DRAW_W;
      layer.height = DRAW_H;
      const lc = layer.getContext('2d');
      if (lc) {
        renderAll(lc, actions.current, base.current);
        oc.drawImage(layer, 0, 0);
      }
      return out.toDataURL('image/png');
    };
    let url = '';
    try {
      url = make(true);
    } catch {
      // ảnh nền khác nguồn không cho xuất → xuất phần em vẽ trên nền trắng
      try {
        url = make(false);
      } catch {
        url = '';
      }
    }
    if (url) onChangeRef.current({ dataUrl: url });
  }, [bg]);

  const schedule = () => {
    pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(exportNow, 400);
  };
  useEffect(() => () => {
    if (pending.current) exportNow();
    window.clearTimeout(timer.current);
  }, [exportNow]);

  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * DRAW_W, ((e.clientY - r.top) / r.height) * DRAW_H] as const;
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || live.current || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    unlockAudio();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* bỏ qua */
    }
    const [x, y] = toLogical(e);
    const a: Extract<Action, { kind: 'stroke' }> = { kind: 'stroke', color, size: erase ? SIZES[size] * 1.8 : SIZES[size], erase, pts: [x, y] };
    actions.current.push(a);
    live.current = { pointerId: e.pointerId, a, lmx: x, lmy: y };
    const c = ctx();
    if (c) {
      c.setTransform(scale.current, 0, 0, scale.current, 0, 0);
      drawStroke(c, a);
    }
    window.clearTimeout(timer.current);
  };

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = live.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const c = ctx();
    if (!c) return;
    const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const evs = native.getCoalescedEvents ? native.getCoalescedEvents() : [];
    const list = evs.length ? evs : [native];
    c.save();
    c.setTransform(scale.current, 0, 0, scale.current, 0, 0);
    c.globalCompositeOperation = s.a.erase ? 'destination-out' : 'source-over';
    c.strokeStyle = s.a.color;
    c.lineWidth = s.a.size;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const ev of list) {
      const [x, y] = toLogical(ev);
      const p = s.a.pts;
      const qx = p[p.length - 2];
      const qy = p[p.length - 1];
      if (Math.hypot(x - qx, y - qy) < 1.5) continue;
      p.push(x, y);
      const mx = (qx + x) / 2;
      const my = (qy + y) / 2;
      c.beginPath();
      c.moveTo(s.lmx, s.lmy);
      c.quadraticCurveTo(qx, qy, mx, my);
      c.stroke();
      s.lmx = mx;
      s.lmy = my;
    }
    c.restore();
  };

  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = live.current;
    if (!s || s.pointerId !== e.pointerId) return;
    live.current = null;
    redraw(); // vẽ lại nét cuối cho trơn
    setCount((n) => n + 1);
    schedule();
  };

  const undo = () => {
    if (disabled || !actions.current.length) return;
    actions.current.pop();
    redraw();
    setCount((n) => n + 1);
    sfx.tap();
    schedule();
  };
  const clear = () => {
    if (disabled || !hasInk(actions.current, base.current)) return;
    actions.current.push({ kind: 'clear' });
    redraw();
    setCount((n) => n + 1);
    sfx.tap();
    schedule();
  };

  void count;
  const canUndo = actions.current.length > 0;
  const canClear = hasInk(actions.current, base.current);

  return (
    <div className={`ae-dr${disabled ? ' is-locked' : ''}`}>
      {!disabled ? (
        <div className="ae-dr-tools" role="toolbar" aria-label="Bút vẽ">
          <div className="ae-dr-colors" role="radiogroup" aria-label="Màu">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={!erase && color === c}
                aria-label={COLOR_NAMES[c.toLowerCase()] ?? c}
                className={`ae-dr-swatch${!erase && color === c ? ' is-on' : ''}`}
                style={{ ['--sw' as string]: c }}
                onClick={() => {
                  setColor(c);
                  setErase(false);
                  sfx.tap();
                }}
              />
            ))}
          </div>
          <div className="ae-dr-group" role="radiogroup" aria-label="Cỡ nét">
            {SIZES.map((s, i) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={size === i}
                aria-label={SIZE_NAMES[i]}
                className={`ae-dr-tool ae-dr-size${size === i ? ' is-on' : ''}`}
                onClick={() => {
                  setSize(i);
                  sfx.tap();
                }}
              >
                <span className="ae-dr-dot" style={{ width: 6 + i * 8, height: 6 + i * 8, ['--sw' as string]: erase ? 'var(--k-sub)' : color }} />
              </button>
            ))}
          </div>
          <div className="ae-dr-group">
            <button type="button" aria-pressed={erase} className={`ae-dr-tool ae-dr-tool--label${erase ? ' is-on' : ''}`} onClick={() => { setErase((v) => !v); sfx.tap(); }}>
              <span aria-hidden="true">🧽</span> Tẩy
            </button>
            <button type="button" className="ae-dr-tool ae-dr-tool--label" disabled={!canUndo} onClick={undo}>
              <span aria-hidden="true">↶</span> Hoàn tác
            </button>
            <button type="button" className="ae-dr-tool ae-dr-tool--label" disabled={!canClear} onClick={clear}>
              <span aria-hidden="true">🗑</span> Xoá hết
            </button>
          </div>
        </div>
      ) : null}
      <div className="ae-dr-paper" ref={paperRef}>
        {bg ? <Media src={bg} alt="" className="ae-dr-layer ae-dr-bg" /> : null}
        <canvas
          ref={canvasRef}
          className={`ae-dr-layer ae-dr-canvas${erase ? ' is-erase' : ''}`}
          aria-label="Khung vẽ"
          role="img"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      {bgFailed ? <p className="ae-dr-note">Không tải được hình nền. Em cứ vẽ trên giấy trắng nhé!</p> : null}
    </div>
  );
}
