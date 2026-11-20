// THUẦN: không import React/DOM. File này được chép sang Edge Function để chấm ở server.
import type { ItemOf, ResponseOf, ScoreResult } from '@openedu/contracts';

function norm(s: string | undefined): string {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Đúng hết mới được điểm (1 hoặc 0). parts: theo id thẻ — thẻ đứng đúng vị trí thì true.
 * Hai thẻ có cùng chữ (vd hai chữ "con") được coi là đổi chỗ cho nhau được.
 */
export function score(item: ItemOf<'ORDERING'>, r: ResponseOf<'ORDERING'> | undefined): ScoreResult {
  const key = item.key;
  if (!key) return { graded: false, correct: false, score: 0 };
  const list = item.payload.items;
  const text = new Map(list.map((c) => [c.id, norm(c.text || c.image || c.id)]));
  const same = (a: string | undefined, b: string | undefined) =>
    a !== undefined && b !== undefined && (a === b || (text.has(a) && text.get(a) === text.get(b)));
  const order = (r && r.order) || [];
  const parts: Record<string, boolean> = {};
  for (const c of list) parts[c.id] = false;
  order.forEach((id, i) => {
    parts[id] = same(id, key.order[i]);
  });
  const correct = order.length === key.order.length && key.order.length > 0 && key.order.every((id, i) => same(order[i], id));
  return { graded: true, correct, score: correct ? 1 : 0, parts };
}

/** Đã dùng hết các thẻ. */
export function isComplete(item: ItemOf<'ORDERING'>, r: ResponseOf<'ORDERING'> | undefined): boolean {
  if (!r || !Array.isArray(r.order)) return false;
  const list = item.payload.items;
  if (!list.length || r.order.length !== list.length) return false;
  const used = new Set(r.order);
  return list.every((c) => used.has(c.id));
}
