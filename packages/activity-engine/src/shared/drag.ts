/**
 * Kéo thả dùng Pointer Events (chuột, cảm ứng, bút) + "chạm để chọn, chạm ô để đặt".
 *
 *   const dnd = useDragDrop({ onDrop: (e) => ... });
 *   <button {...dnd.draggable(id)} onClick={...}>   // thẻ kéo được (onClick = chạm)
 *   <div {...dnd.dropTarget(zoneId)}>               // ô nhận (chạm ô khi đang chọn thẻ → đặt thẻ)
 *
 * - Chạm (không di chuyển) vẫn là click bình thường → bàn phím (Enter/Space) dùng được.
 *   Sau một lần kéo thật, click kế tiếp bị chặn để không "chạm nhầm".
 * - Bóng thẻ (ghost) là bản sao DOM, nghiêng nhẹ và phóng to, đi theo ngón tay.
 *   Bóng được đặt trong các lớp bọc chép class của `.ae-activity` và `[data-ae-dnd-scope]`
 *   gần nhất, nên CSS theo phạm vi (k-big, bigscreen, class gốc của dạng) vẫn áp dụng.
 * - Vùng hút rộng: hình chữ nhật của ô được nới thêm `hitSlop` (16 px). Ô lồng nhau → ô nhỏ nhất thắng.
 * - Tự cuộn trang khi kéo sát mép trên/dưới.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, DragEvent as ReactDragEvent, RefObject } from 'react';
import { speak, unlockAudio } from '@openedu/ui';
import type { SpeakLang } from '@openedu/ui';
import './drag.css';

export interface DropEvent {
  dragId: string;
  /** null = thả ra ngoài mọi ô. */
  targetId: string | null;
  via: 'drag' | 'tap';
  /** Toạ độ con trỏ (viewport) lúc thả — chỉ có khi via='drag'. */
  point?: { x: number; y: number };
  /** Khung của ô nhận lúc thả — để tính chèn trước/sau. */
  targetRect?: DOMRect;
}

export interface DragOverEvent {
  dragId: string;
  targetId: string | null;
  point: { x: number; y: number };
  targetRect?: DOMRect;
}

export interface DragDropOptions {
  onDrop: (e: DropEvent) => void;
  onDragStart?: (dragId: string) => void;
  onDragEnd?: (dragId: string, droppedOn: string | null) => void;
  /** Gọi mỗi lần con trỏ di chuyển khi đang kéo (để vẽ vạch chèn…). */
  onDragOver?: (e: DragOverEvent) => void;
  /** Ô nào nhận thẻ nào. Mặc định: mọi ô. */
  accepts?: (dragId: string, targetId: string) => boolean;
  disabled?: boolean;
  /** Nới vùng hút của ô (px). Mặc định 16. */
  hitSlop?: number;
  /** Phải di chuyển bao nhiêu px mới tính là kéo. Mặc định 6 (chuột) / 10 (cảm ứng). */
  threshold?: number;
  autoScroll?: boolean;
}

export interface DraggableProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (e: ReactMouseEvent<HTMLElement>) => void;
  onDragStart: (e: ReactDragEvent<HTMLElement>) => void;
  'data-ae-dnd': string;
}

export interface DropTargetProps {
  ref: (el: HTMLElement | null) => void;
  'data-ae-drop': string;
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
}

export interface DragDropApi {
  /** Gắn lên phần tử kéo được (tốt nhất là <button>). Không có hiệu lực khi disabled. */
  draggable: (id: string) => DraggableProps | Record<string, never>;
  /** Gắn lên ô nhận. `tap: true` (mặc định): chạm ô khi đang có thẻ được chọn → onDrop(via 'tap'). */
  dropTarget: (id: string, opts?: { tap?: boolean }) => DropTargetProps;
  /** id thẻ đang kéo (sau khi vượt ngưỡng). */
  dragging: string | null;
  /** id ô đang được rê qua. */
  over: string | null;
  /** Chạm-để-chọn: id thẻ đang được chọn. */
  selected: string | null;
  select: (id: string | null) => void;
  /** Đặt thẻ đang chọn vào ô (như chạm ô). Trả về true nếu đã đặt. */
  placeSelected: (targetId: string) => boolean;
  /** Khung bóng thẻ lúc thả gần nhất (viewport) — useFlip dùng để thẻ "bay" từ chỗ thả. */
  takeDropRect: (id: string) => DOMRect | undefined;
}

interface Session {
  id: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  src: HTMLElement;
  rect: DOMRect;
  started: boolean;
  layer: HTMLElement | null;
  ghost: HTMLElement | null;
  over: string | null;
  overRect?: DOMRect;
  raf: number;
  scrollRaf: number;
}

const GHOST_TILT = 'rotate(-3deg) scale(1.08)';

/** useLayoutEffect ở trình duyệt, useEffect khi render phía server / kiểm thử (tránh cảnh báo SSR). */
export const useIsoLayoutEffect = typeof window !== 'undefined' && typeof document !== 'undefined' ? useLayoutEffect : useEffect;

export function prefersReducedMotion(el?: Element | null): boolean {
  if (typeof window === 'undefined') return true;
  if (el && el.closest('.k-reduced')) return true;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function makeGhost(src: HTMLElement, rect: DOMRect): { layer: HTMLElement; ghost: HTMLElement } {
  const layer = document.createElement('div');
  layer.className = 'ae-drag-layer';
  layer.setAttribute('aria-hidden', 'true');
  let host: HTMLElement = layer;
  const scopes: Element[] = [];
  const act = src.closest('.ae-activity');
  if (act) scopes.push(act);
  const scope = src.closest('[data-ae-dnd-scope]');
  if (scope && scope !== act) scopes.push(scope);
  for (const s of scopes) {
    const w = document.createElement('div');
    w.className = `${s.className} ae-drag-scope`;
    host.appendChild(w);
    host = w;
  }
  const ghost = src.cloneNode(true) as HTMLElement;
  ghost.classList.add('ae-drag-ghost');
  ghost.classList.remove('is-drag-source', 'is-selected');
  ghost.removeAttribute('id');
  ghost.removeAttribute('data-flip');
  ghost.removeAttribute('data-ae-drop');
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
  host.appendChild(ghost);
  document.body.appendChild(layer);
  return { layer, ghost };
}

export function useDragDrop(options: DragDropOptions): DragDropApi {
  const opts = useRef(options);
  opts.current = options;
  const targets = useRef(new Map<string, HTMLElement>());
  const refCbs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const session = useRef<Session | null>(null);
  const dropRect = useRef<{ id: string; rect: DOMRect } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const mounted = useRef(true);

  const hitTest = useCallback((x: number, y: number, dragId: string): { id: string; rect: DOMRect } | null => {
    const slop = opts.current.hitSlop ?? 16;
    const acc = opts.current.accepts;
    let best: { id: string; rect: DOMRect } | null = null;
    let bestScore = Infinity;
    targets.current.forEach((el, id) => {
      if (!el.isConnected) return;
      if (acc && !acc(dragId, id)) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (x < r.left - slop || x > r.right + slop || y < r.top - slop || y > r.bottom + slop) return;
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      // ở trong: ô nhỏ nhất thắng (ô lồng nhau); ở vùng nới: ô gần mép nhất thắng
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const score = inside ? r.width * r.height : 1e12 + Math.hypot(dx, dy);
      if (score < bestScore) {
        bestScore = score;
        best = { id, rect: r };
      }
    });
    return best;
  }, []);

  // Listener ổn định (tạo một lần) gọi tới bản xử lý mới nhất qua ref.
  const handlers = useRef({ move: (_e: PointerEvent) => undefined as void, up: (_e: PointerEvent) => undefined as void, cancel: (_e: PointerEvent) => undefined as void });
  const listeners = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: (e: PointerEvent) => void } | null>(null);
  if (!listeners.current) {
    listeners.current = {
      move: (e) => handlers.current.move(e),
      up: (e) => handlers.current.up(e),
      cancel: (e) => handlers.current.cancel(e),
    };
  }
  const listen = () => {
    const l = listeners.current!;
    window.addEventListener('pointermove', l.move, { passive: false });
    window.addEventListener('pointerup', l.up);
    window.addEventListener('pointercancel', l.cancel);
  };
  const cleanup = (s: Session) => {
    const l = listeners.current!;
    window.removeEventListener('pointermove', l.move);
    window.removeEventListener('pointerup', l.up);
    window.removeEventListener('pointercancel', l.cancel);
    cancelAnimationFrame(s.raf);
    cancelAnimationFrame(s.scrollRaf);
    document.body.classList.remove('ae-dragging');
  };

  const positionGhost = (s: Session) => {
    if (!s.ghost) return;
    const offX = s.startX - s.rect.left;
    const offY = s.startY - s.rect.top;
    s.ghost.style.transform = `translate3d(${s.x - offX}px, ${s.y - offY}px, 0) ${GHOST_TILT}`;
  };

  const updateOver = (s: Session) => {
    const hit = hitTest(s.x, s.y, s.id);
    const id = hit ? hit.id : null;
    s.overRect = hit?.rect;
    if (id !== s.over) {
      s.over = id;
      if (mounted.current) setOver(id);
    }
    opts.current.onDragOver?.({ dragId: s.id, targetId: id, point: { x: s.x, y: s.y }, targetRect: hit?.rect });
  };

  const autoScrollTick = () => {
    const s = session.current;
    if (!s || !s.started) return;
    const edge = 56;
    const h = window.innerHeight;
    let dy = 0;
    if (s.y < edge) dy = -Math.ceil((edge - s.y) / 4);
    else if (s.y > h - edge) dy = Math.ceil((s.y - (h - edge)) / 4);
    if (dy !== 0) {
      window.scrollBy(0, dy);
      updateOver(s);
    }
    s.scrollRaf = requestAnimationFrame(autoScrollTick);
  };

  const begin = (s: Session) => {
    s.started = true;
    dropRect.current = null;
    const g = makeGhost(s.src, s.rect);
    s.layer = g.layer;
    s.ghost = g.ghost;
    document.body.classList.add('ae-dragging');
    setDragging(s.id);
    setSelected(null);
    opts.current.onDragStart?.(s.id);
    if (opts.current.autoScroll !== false) s.scrollRaf = requestAnimationFrame(autoScrollTick);
  };

  handlers.current.move = (e: PointerEvent) => {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (!s.started) {
      const th = opts.current.threshold ?? (s.pointerType === 'mouse' ? 6 : 10);
      if (Math.hypot(s.x - s.startX, s.y - s.startY) < th) return;
      begin(s);
    }
    if (e.cancelable) e.preventDefault();
    cancelAnimationFrame(s.raf);
    s.raf = requestAnimationFrame(() => {
      positionGhost(s);
      updateOver(s);
    });
  };

  const suppressNextClick = () => {
    const stop = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    window.addEventListener('click', stop, true);
    window.setTimeout(() => window.removeEventListener('click', stop, true), 80);
  };

  const finish = (s: Session, drop: boolean) => {
    cleanup(s);
    session.current = null;
    if (!s.started) return;
    suppressNextClick();
    let target: string | null = null;
    if (drop) {
      const hit = hitTest(s.x, s.y, s.id);
      target = hit ? hit.id : null;
      s.overRect = hit?.rect;
    }
    const layer = s.layer;
    const ghost = s.ghost;
    if (target && ghost) {
      dropRect.current = { id: s.id, rect: ghost.getBoundingClientRect() };
      layer?.remove();
    } else if (layer && ghost) {
      // bay về chỗ cũ
      if (prefersReducedMotion(s.src)) layer.remove();
      else {
        ghost.style.transition = 'transform 220ms cubic-bezier(.2,.9,.3,1.2)';
        ghost.style.transform = `translate3d(${s.rect.left}px, ${s.rect.top}px, 0)`;
        window.setTimeout(() => layer.remove(), 240);
      }
    }
    if (mounted.current) {
      setDragging(null);
      setOver(null);
    }
    if (drop) {
      opts.current.onDrop({ dragId: s.id, targetId: target, via: 'drag', point: { x: s.x, y: s.y }, targetRect: s.overRect });
    }
    opts.current.onDragEnd?.(s.id, target);
  };

  handlers.current.up = (e: PointerEvent) => {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    finish(s, true);
  };
  handlers.current.cancel = (e: PointerEvent) => {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;
    finish(s, false);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const s = session.current;
      if (s) {
        cleanup(s);
        s.layer?.remove();
        session.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draggable = (id: string): DraggableProps | Record<string, never> => {
    if (opts.current.disabled) return {};
    return {
      'data-ae-dnd': id,
      onPointerDown: (e) => {
        if (opts.current.disabled || session.current) return;
        if (!e.isPrimary) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        unlockAudio();
        const el = e.currentTarget;
        session.current = {
          id,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          startX: e.clientX,
          startY: e.clientY,
          x: e.clientX,
          y: e.clientY,
          src: el,
          rect: el.getBoundingClientRect(),
          started: false,
          layer: null,
          ghost: null,
          over: null,
          raf: 0,
          scrollRaf: 0,
        };
        listen();
      },
      onClickCapture: () => undefined,
      onDragStart: (e) => e.preventDefault(),
    };
  };

  const placeSelected = (targetId: string): boolean => {
    const sel = selectedRef.current;
    if (!sel || opts.current.disabled) return false;
    if (opts.current.accepts && !opts.current.accepts(sel, targetId)) return false;
    setSelected(null);
    opts.current.onDrop({ dragId: sel, targetId, via: 'tap' });
    return true;
  };

  const dropTarget = (id: string, o?: { tap?: boolean }): DropTargetProps => {
    let cb = refCbs.current.get(id);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) targets.current.set(id, el);
        else if (targets.current.get(id)) targets.current.delete(id);
      };
      refCbs.current.set(id, cb);
    }
    const p: DropTargetProps = { ref: cb, 'data-ae-drop': id };
    if (o?.tap !== false) p.onClick = () => { placeSelected(id); };
    return p;
  };

  const takeDropRect = (id: string): DOMRect | undefined => {
    const d = dropRect.current;
    if (d && d.id === id) {
      dropRect.current = null;
      return d.rect;
    }
    return undefined;
  };

  return { draggable, dropTarget, dragging, over, selected, select: setSelected, placeSelected, takeDropRect };
}

/**
 * FLIP: phần tử có `data-flip="<key>"` trong `container` sẽ trượt mượt (chỉ transform) từ vị trí cũ
 * sang vị trí mới sau mỗi lần render mà `deps` thay đổi — kể cả khi chuyển sang khung cha khác.
 * `originFor(key)` (tuỳ chọn) trả về khung viewport để bay từ đó (vd vị trí bóng thẻ lúc thả).
 */
export function useFlip(container: RefObject<HTMLElement>, deps: readonly unknown[], originFor?: (key: string) => DOMRect | undefined): void {
  const prev = useRef(new Map<string, { x: number; y: number }>());
  const origin = useRef(originFor);
  origin.current = originFor;
  useIsoLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    const reduce = prefersReducedMotion(root);
    root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const key = el.getAttribute('data-flip') as string;
      const r = el.getBoundingClientRect();
      const pos = { x: r.left - base.left, y: r.top - base.top };
      next.set(key, pos);
      const o = origin.current?.(key);
      const p = o ? { x: o.left - base.left, y: o.top - base.top } : prev.current.get(key);
      if (!p || reduce) return;
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth; // ép trình duyệt vẽ vị trí đầu
      el.style.transition = 'transform 340ms cubic-bezier(.2,.9,.3,1.2)';
      el.style.transform = '';
      const done = () => {
        el.style.transition = '';
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
    });
    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ---------- tiện ích nhỏ cho thẻ của trẻ ---------- */

/** Ngôn ngữ đọc to cho một lựa chọn: môn Tiếng Anh + chữ không dấu → en-US. */
export function choiceLang(text: string, subject?: string): SpeakLang {
  // eslint-disable-next-line no-control-regex
  return subject === 'tieng-anh' && /^[\x00-\x7F]+$/.test(text) ? 'en-US' : 'vi-VN';
}

/** Đọc to khi chạm thẻ: luôn đọc nếu có `speak`; với chữ to (lớp 1–2) thì đọc `text`. */
export function speakChoice(c: { text?: string; speak?: string }, o: { bigText?: boolean; subject?: string }): void {
  const t = c.speak || (o.bigText ? c.text : undefined);
  if (!t) return;
  speak(t, { lang: choiceLang(t, o.subject) });
}

/** Bảng màu cặp/ô lấy từ token (dùng làm giá trị CSS). */
export const KID_COLORS = [
  'var(--k-math)',
  'var(--k-viet)',
  'var(--k-nat)',
  'var(--k-eng)',
  'var(--k-art)',
  'var(--k-sci)',
  'var(--k-music)',
  'var(--k-star-dark)',
] as const;

/** Chuẩn hoá màu nhóm do GV nhập: "--k-viet" → "var(--k-viet)". */
export function cssColor(c: string | undefined, fallbackIndex = 0): string {
  if (!c) return KID_COLORS[fallbackIndex % KID_COLORS.length];
  if (c.startsWith('--')) return `var(${c})`;
  return c;
}
