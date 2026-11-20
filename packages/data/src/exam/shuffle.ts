/**
 * Xáo trộn có hạt giống (thuần, tất định): thứ tự câu và thứ tự lựa chọn riêng cho từng em.
 * Chỉ đổi THỨ TỰ hiển thị — câu trả lời dùng id lựa chọn nên chấm không đổi.
 */
import type { Item } from '@openedu/contracts';
import { itemQType } from './matrix';

/** FNV-1a 32 bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — số ngẫu nhiên [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates theo seed (không đổi mảng gốc). */
export function seededOrder<T>(list: readonly T[], seed: number): T[] {
  const out = list.slice();
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/** Hạt giống của một lần làm bài. */
export function attemptSeed(examId: string, studentId: string, attemptNo: number): number {
  return hashString(`${examId}|${studentId}|${attemptNo}`);
}

/** Lựa chọn có câu kiểu "Cả A và B", "Tất cả đều đúng" → giữ nguyên thứ tự. */
const ORDER_BOUND = /(tất cả|cả hai|cả [a-d] và [a-d]|không có (đáp án|câu) nào|đáp án khác)/i;

/** Xáo lựa chọn của câu MCQ / MCQ_MULTIPLE / LISTEN_CHOOSE (trừ khi có thẻ `giu-thu-tu`). */
export function shuffleOptions(item: Item, seed: number): Item {
  if (item.type !== 'MCQ' && item.type !== 'MCQ_MULTIPLE' && item.type !== 'LISTEN_CHOOSE') return item;
  if ((item.tags ?? []).includes('giu-thu-tu')) return item;
  const opts = item.payload.options;
  if (opts.some((o) => ORDER_BOUND.test(o.text ?? ''))) return item;
  return { ...item, payload: { ...item.payload, options: seededOrder(opts, seed ^ hashString(item.id)) } } as Item;
}

/**
 * Thứ tự câu cho một em: xáo trong từng phần (trắc nghiệm trước, tự luận sau), rồi xáo lựa chọn.
 * `shuffle` = false → giữ thứ tự đề.
 */
export function arrangeForStudent(items: Item[], seed: number, shuffle = true): Item[] {
  if (!shuffle) return items;
  const by = new Map(items.map((i) => [i.id, i]));
  return arrangeIds(items.map((i) => ({ id: i.id, qtype: itemQType(i) === 'tl' ? 'tl' : 'tn' })), seed).map((id) => shuffleOptions(by.get(id)!, seed));
}

/** Thứ tự id câu (cùng luật arrangeForStudent) — dùng ở server / kết quả khi không có nội dung câu. */
export function arrangeIds(entries: { id: string; qtype: 'tn' | 'tl' }[], seed: number): string[] {
  const tn = entries.filter((e) => e.qtype !== 'tl').map((e) => e.id);
  const tl = entries.filter((e) => e.qtype === 'tl').map((e) => e.id);
  return [...seededOrder(tn, seed), ...seededOrder(tl, (seed ^ 0x9e3779b9) >>> 0)];
}
