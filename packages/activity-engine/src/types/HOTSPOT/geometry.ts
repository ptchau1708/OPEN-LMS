import type { HotspotRegion } from '@openedu/contracts';

/**
 * Hệ toạ độ vẽ: viewBox "0 0 100 H" với H = 100 / aspect (aspect = rộng / cao).
 * Vùng lưu theo % rộng (x, w, r) và % cao (y, h) của ảnh.
 */
export function viewHeight(aspect: number): number {
  return 100 / (aspect > 0 && Number.isFinite(aspect) ? aspect : 4 / 3);
}

export function regionCenter(r: HotspotRegion, H: number): { x: number; y: number } {
  if (r.shape === 'rect') return { x: r.x + (r.w ?? 0) / 2, y: ((r.y + (r.h ?? 0) / 2) * H) / 100 };
  return { x: r.x, y: (r.y * H) / 100 };
}

/** Vùng chứa điểm (X, Y theo viewBox); dung sai `tol` cho ngón tay nhỏ. Nhiều vùng chồng nhau → vùng gần tâm nhất. */
export function hitTest(regions: readonly HotspotRegion[], X: number, Y: number, H: number, tol = 1.5): HotspotRegion | null {
  let best: HotspotRegion | null = null;
  let bestD = Infinity;
  for (const r of regions) {
    let inside = false;
    let d = Infinity;
    if (r.shape === 'rect') {
      const x0 = r.x, x1 = r.x + (r.w ?? 0);
      const y0 = (r.y * H) / 100, y1 = ((r.y + (r.h ?? 0)) * H) / 100;
      inside = X >= x0 - tol && X <= x1 + tol && Y >= y0 - tol && Y <= y1 + tol;
      const c = regionCenter(r, H);
      const half = Math.max(1, Math.min(x1 - x0, y1 - y0) / 2);
      d = Math.hypot(X - c.x, Y - c.y) / half;
    } else {
      const cy = (r.y * H) / 100;
      const rad = Math.max(0.5, r.r ?? 5);
      const dist = Math.hypot(X - r.x, Y - cy);
      inside = dist <= rad + tol;
      d = dist / rad;
    }
    if (inside && d < bestD) { best = r; bestD = d; }
  }
  return best;
}

/** Điểm chạm (clientX/Y) → toạ độ viewBox. */
export function pointFromEvent(el: Element, clientX: number, clientY: number, H: number): { x: number; y: number } {
  const b = el.getBoundingClientRect();
  return {
    x: ((clientX - b.left) / Math.max(1, b.width)) * 100,
    y: ((clientY - b.top) / Math.max(1, b.height)) * H,
  };
}
