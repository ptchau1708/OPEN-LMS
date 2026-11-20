import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Choice } from '@openedu/contracts';
import { Media, sfx } from '@openedu/ui';
import type { TypePlayerProps } from '../../shared/typeApi';
import { seededShuffle } from '../../shared/shuffle';
import { KID_COLORS, speakChoice, useDragDrop, useIsoLayoutEffect } from '../../shared/drag';
import { score } from './score';
import './style.css';

interface Line {
  l: string;
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function esc(s: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
}

/**
 * Nối cặp: hai cột thẻ to. Chạm thẻ trái rồi thẻ phải (hoặc ngược lại), hoặc kéo thẻ sang cột kia.
 * Cặp đã nối có cùng màu + số và một đường nối (SVG). Chạm thẻ đã nối để gỡ.
 */
export function Player({ item, value, onChange, disabled, reveal, result, mode, bigText }: TypePlayerProps<'MATCHING'>) {
  const { left } = item.payload;
  const right = useMemo(() => seededShuffle(item.payload.right, item.id), [item.payload.right, item.id]);
  const rightById = useMemo(() => new Map(item.payload.right.map((c) => [c.id, c])), [item.payload.right]);
  const leftIds = useMemo(() => new Set(left.map((c) => c.id)), [left]);
  const pairs = useMemo(() => {
    const out: Record<string, string> = {};
    const src = value?.pairs ?? {};
    for (const l of Object.keys(src)) if (leftIds.has(l) && rightById.has(src[l])) out[l] = src[l];
    return out;
  }, [value, leftIds, rightById]);
  const leftOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of Object.keys(pairs)) m.set(pairs[l], l);
    return m;
  }, [pairs]);
  const colorOf = (l: string) => KID_COLORS[Math.max(0, left.findIndex((c) => c.id === l)) % KID_COLORS.length];
  const numOf = (l: string) => left.findIndex((c) => c.id === l) + 1;

  const locked = disabled || reveal;
  const res = reveal ? result ?? (item.key ? score(item, value) : undefined) : undefined;
  const parts = res?.parts;

  const pair = (l: string, r: string) => {
    const next: Record<string, string> = {};
    for (const k of Object.keys(pairs)) if (pairs[k] !== r && k !== l) next[k] = pairs[k];
    next[l] = r;
    onChange({ pairs: next });
    sfx.drop();
  };
  const unpair = (l: string) => {
    const next = { ...pairs };
    delete next[l];
    onChange({ pairs: next });
    sfx.tap();
  };

  const dnd = useDragDrop({
    disabled: locked,
    accepts: (d, t) => d[0] !== t[0],
    onDrop: (e) => {
      if (!e.targetId) return;
      const a = e.dragId.slice(2);
      const b = e.targetId.slice(2);
      if (e.dragId[0] === 'L') pair(a, b);
      else pair(b, a);
    },
  });

  const tap = (key: string, c: Choice) => {
    if (locked) return;
    const side = key[0];
    const id = key.slice(2);
    const sel = dnd.selected;
    if (sel && sel[0] !== side) {
      if (side === 'L') pair(id, sel.slice(2));
      else pair(sel.slice(2), id);
      dnd.select(null);
      return;
    }
    if (sel === key) {
      dnd.select(null);
      return;
    }
    const pairedLeft = side === 'L' ? (pairs[id] ? id : undefined) : leftOf.get(id);
    if (pairedLeft) {
      unpair(pairedLeft);
      return;
    }
    dnd.select(key);
    sfx.tap();
    speakChoice(c, { bigText, subject: item.subject });
  };

  /* ---- đường nối ---- */
  const rootRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const pairsKey = Object.keys(pairs).sort().map((k) => `${k}>${pairs[k]}`).join('|');
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const out: Line[] = [];
    for (const l of Object.keys(pairs)) {
      const a = root.querySelector(`[data-ae-drop="${esc(`L:${l}`)}"]`);
      const b = root.querySelector(`[data-ae-drop="${esc(`R:${pairs[l]}`)}"]`);
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x1 = Math.round(ra.right - base.left);
      const y1 = Math.round(ra.top + ra.height / 2 - base.top);
      const x2 = Math.round(rb.left - base.left);
      const y2 = Math.round(rb.top + rb.height / 2 - base.top);
      const dx = Math.max(16, (x2 - x1) * 0.55);
      out.push({ l, x1, y1, x2, y2, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` });
    }
    const w = Math.round(base.width);
    const h = Math.round(base.height);
    setBox((cur) => (cur.w === w && cur.h === h ? cur : { w, h }));
    setLines((cur) => (JSON.stringify(cur) === JSON.stringify(out) ? cur : out));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey]);
  useIsoLayoutEffect(measure, [measure, reveal]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(later) : null;
    ro?.observe(root);
    window.addEventListener('resize', later);
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    fonts?.ready.then(later).catch(() => undefined);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', later);
    };
  }, [measure]);

  const card = (c: Choice, side: 'L' | 'R') => {
    const key = `${side}:${c.id}`;
    const l = side === 'L' ? (pairs[c.id] ? c.id : undefined) : leftOf.get(c.id);
    const color = side === 'L' ? colorOf(c.id) : l ? colorOf(l) : undefined;
    const mark = reveal && parts && side === 'L' ? (parts[c.id] ? 'ok' : 'try') : reveal && parts && l ? (parts[l] ? 'ok' : 'try') : null;
    const fix = mark === 'try' && side === 'L' && item.key ? rightById.get(item.key.pairs[c.id]) : undefined;
    const t = dnd.dropTarget(key, { tap: false });
    const sel = dnd.selected === key;
    const cls = [
      'ae-mt-card',
      `ae-mt-card--${side === 'L' ? 'left' : 'right'}`,
      l ? 'is-paired' : '',
      sel ? 'is-selected' : '',
      dnd.over === key ? 'is-over' : '',
      dnd.dragging === key ? 'is-drag-source' : '',
      dnd.selected && dnd.selected[0] !== side && !locked ? 'is-armed' : '',
      mark ? `is-${mark}` : '',
    ].filter(Boolean).join(' ');
    const label = c.text || '';
    return (
      <button
        key={key}
        ref={t.ref}
        data-ae-drop={key}
        type="button"
        className={cls}
        style={color ? { ['--c' as string]: color } : undefined}
        aria-pressed={sel}
        aria-disabled={locked || undefined}
        aria-label={l ? `${label} — đã nối cặp số ${numOf(l)}. Chạm để gỡ` : label || undefined}
        {...dnd.draggable(key)}
        onClick={() => tap(key, c)}
      >
        {c.image ? <Media src={c.image} alt={label} /> : null}
        {label ? <span className="ae-mt-card__text">{label}</span> : null}
        {fix ? <span className="ae-mt-card__fix">→ {fix.text}</span> : null}
        <span className="ae-mt-knob" aria-hidden="true">{l ? <span className="ae-mt-num">{numOf(l)}</span> : null}</span>
        {mark ? <span className="ae-tok__mark" aria-hidden="true">{mark === 'ok' ? '✓' : '↻'}</span> : null}
      </button>
    );
  };

  const done = Object.keys(pairs).length;
  return (
    <div className={`ae-mt ae-mt--${mode}`} ref={rootRef} data-ae-dnd-scope="">
      <svg className="ae-mt-lines" width={box.w} height={box.h} viewBox={`0 0 ${box.w || 1} ${box.h || 1}`} aria-hidden="true">
        {lines.map((ln) => {
          const st = reveal && parts ? (parts[ln.l] ? 'ok' : 'try') : '';
          return (
            <g key={`${ln.l}-${pairs[ln.l]}`} className={`ae-mt-line${st ? ` is-${st}` : ''}`} style={{ ['--c' as string]: colorOf(ln.l) }}>
              <path d={ln.d} />
              <circle cx={ln.x1} cy={ln.y1} r={7} />
              <circle cx={ln.x2} cy={ln.y2} r={7} />
            </g>
          );
        })}
      </svg>
      <div className="ae-mt-col ae-mt-col--left">{left.map((c) => card(c, 'L'))}</div>
      <div className="ae-mt-col ae-mt-col--right">{right.map((c) => card(c, 'R'))}</div>
      <p className="ae-mt-status" aria-live="polite">
        {dnd.selected ? 'Giờ chạm vào thẻ hợp ở cột bên kia nhé' : `Đã nối ${done}/${left.length} cặp`}
      </p>
    </div>
  );
}
