import { useEffect, useRef, useState } from 'react';

const RM = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(RM).matches);
  useEffect(() => {
    const m = window.matchMedia?.(RM);
    if (!m) return;
    const h = () => setR(m.matches);
    h();
    if (m.addEventListener) { m.addEventListener('change', h); return () => m.removeEventListener('change', h); }
    // Safari < 14
    m.addListener(h);
    return () => m.removeListener(h);
  }, []);
  return r;
}

/** Nhấn giữ (dùng cho cổng phụ huynh, nút nguy hiểm). Trải các handler lên phần tử. */
export function useLongPress(onLongPress: () => void, ms = 800) {
  const t = useRef<number | undefined>(undefined);
  const cb = useRef(onLongPress);
  cb.current = onLongPress;
  useEffect(() => () => window.clearTimeout(t.current), []);
  const start = () => {
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => cb.current(), ms);
  };
  const cancel = () => { window.clearTimeout(t.current); };
  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
}
