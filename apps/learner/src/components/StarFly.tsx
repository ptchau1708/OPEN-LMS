/**
 * "Sao về túi": sao kiếm được ở bài học, tháp, đấu… bay vào ô đếm sao khi em quay lại trang có ô đó (Nhà, Học, Chơi, Quà).
 * Ghi nhớ số sao đã "nhìn thấy" theo từng em (sessionStorage) nên mỗi phần thưởng chỉ bay một lần;
 * lần mở app đầu tiên không bay. Tôn trọng "Giảm chuyển động" (chỉ nhấp ô đếm, không bay).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router';
import { useWallet } from '@openedu/data';
import { StarShape, sfx } from '@openedu/ui';

const KEY = (id: string) => `ln-stars-seen:${id}`;

function read(id: string): number | null {
  try { const v = sessionStorage.getItem(KEY(id)); return v === null ? null : Number(v); } catch { return null; }
}
function write(id: string, n: number) {
  try { sessionStorage.setItem(KEY(id), String(n)); } catch { /* bỏ qua */ }
}

/** Ô đếm sao đang hiện trên màn hình (không tính ô bị che ngoài khung nhìn). */
function visibleCounter(): HTMLElement | null {
  const list = document.querySelectorAll<HTMLElement>('.k-stars');
  for (let i = 0; i < list.length; i++) {
    const r = list[i].getBoundingClientRect();
    if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) return list[i];
  }
  return null;
}

interface Flight { id: number; n: number; delta: number; to: { x: number; y: number }; }

export function StarFly({ userId, reduced }: { userId: string; reduced: boolean }) {
  const stars = useWallet(userId).data?.stars;
  const path = useLocation().pathname;
  const [flight, setFlight] = useState<Flight | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (stars === undefined) return;
    const seen = read(userId);
    if (seen === null || stars < seen) { write(userId, stars); return; }
    if (stars === seen) return;
    // Đợi trang vẽ xong ô đếm sao.
    const t = window.setTimeout(() => {
      const el = visibleCounter();
      if (!el) return; // chưa có ô đếm trên trang này: để dành, bay khi em về trang có ô.
      const delta = stars - seen;
      write(userId, stars);
      const pop = () => {
        const inner = el.querySelector('.k-stars__inner');
        if (!inner) return;
        inner.classList.remove('is-pop');
        void (inner as HTMLElement).offsetWidth;
        inner.classList.add('is-pop');
      };
      sfx.star();
      if (reduced) { pop(); return; }
      const r = el.getBoundingClientRect();
      seq.current += 1;
      setFlight({ id: seq.current, n: Math.max(3, Math.min(8, delta)), delta, to: { x: r.left + 22, y: r.top + r.height / 2 } });
      window.setTimeout(pop, 950);
      window.setTimeout(() => setFlight((f) => (f && f.id === seq.current ? null : f)), 1500);
    }, 700);
    return () => window.clearTimeout(t);
  }, [stars, path, userId, reduced]);

  if (!flight) return null;
  const cx = window.innerWidth / 2, cy = window.innerHeight * 0.55;
  return (
    <div className="ln-starfly" aria-live="polite">
      <span className="k-sr-only">Em nhận thêm {flight.delta} sao.</span>
      <span className="ln-starfly__plus" style={{ left: cx, top: cy } as CSSProperties} aria-hidden="true">+{flight.delta}</span>
      {Array.from({ length: flight.n }, (_, i) => {
        const a = (i / flight.n) * Math.PI * 2;
        const sx = cx + Math.cos(a) * 46, sy = cy + Math.sin(a) * 30;
        return (
          <span
            key={`${flight.id}-${i}`}
            className="ln-starfly__star"
            aria-hidden="true"
            style={{ left: sx, top: sy, animationDelay: `${i * 55}ms`, ['--dx' as string]: `${flight.to.x - sx}px`, ['--dy' as string]: `${flight.to.y - sy}px` } as CSSProperties}
          >
            <StarShape size={30} />
          </span>
        );
      })}
    </div>
  );
}
