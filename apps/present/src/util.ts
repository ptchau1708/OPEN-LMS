import { useEffect, useState } from 'react';
import type { Item, Lesson, Slide } from '@openedu/contracts';

/** 1vmin tính bằng px (cho component nhận size kiểu số). */
export function useVmin(): number {
  const get = () => Math.min(window.innerWidth, window.innerHeight) / 100;
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => setV(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

/** Địa chỉ HS vào lớp (QR) và bản rút gọn để viết dưới QR. */
export function joinUrls(pin: string): { full: string; short: string } {
  const env = (import.meta.env.VITE_LEARNER_URL as string | undefined)?.trim();
  const base = env ? env.replace(/\/+$/, '') : `${location.protocol}//${location.hostname}:5173`;
  return { full: `${base}/lop?pin=${pin}`, short: `${base.replace(/^https?:\/\//, '')}/lop` };
}

/** Tên gọi (tiếng Việt: từ cuối của họ tên). */
export function firstName(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

export function slideItemId(slide: Slide | undefined): string | undefined {
  if (!slide || slide.layout !== 'activity') return undefined;
  return slide.item?.id ?? slide.itemId;
}

export function findItem(id: string | undefined, items: Record<string, Item>, lesson?: Lesson | null): Item | undefined {
  if (!id) return undefined;
  if (items[id]) return items[id];
  for (const s of lesson?.slides ?? []) if (s.item && s.item.id === id) return s.item;
  return undefined;
}

const totals: Record<string, number> = {};
export function timerTotal(endsAt: string): number {
  if (!totals[endsAt]) totals[endsAt] = Math.max(1, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000));
  return totals[endsAt];
}

export function formatPin(pin: string): string {
  return pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}
