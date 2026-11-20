/** Kiểm tra một câu đã đủ để lưu chưa (thuần). */
import type { Choice, Item } from '@openedu/contracts';
import type { DraftItem, DraftStatus } from './types';

const hasText = (c: Choice): boolean => !!(c.text && c.text.trim()) || !!c.image;
const perm = (order: unknown, ids: string[]): boolean => Array.isArray(order) && order.length === ids.length && ids.every((i) => order.includes(i));
const uniq = (ids: string[]): boolean => new Set(ids).size === ids.length;

export interface ItemCheck {
  /** Lỗi nội dung (thiếu đề, thiếu lựa chọn) — phải sửa. */
  problems: string[];
  /** Thiếu / sai đáp án. */
  missingAnswer: boolean;
}

export function checkItem(item: Item): ItemCheck {
  const problems: string[] = [];
  let missingAnswer = false;
  if (!item.prompt?.text?.trim()) problems.push('Chưa có câu hỏi');
  switch (item.type) {
    case 'MCQ':
    case 'LISTEN_CHOOSE': {
      const o = item.payload.options ?? [];
      if (o.length < 2) problems.push('Cần ít nhất 2 lựa chọn');
      else if (!o.every(hasText)) problems.push('Có lựa chọn còn trống');
      else if (!uniq(o.map((c) => c.id))) problems.push('Lựa chọn bị trùng mã');
      missingAnswer = !item.key?.correct || !o.some((c) => c.id === item.key?.correct);
      break;
    }
    case 'MCQ_MULTIPLE': {
      const o = item.payload.options ?? [];
      if (o.length < 2) problems.push('Cần ít nhất 2 lựa chọn');
      else if (!o.every(hasText)) problems.push('Có lựa chọn còn trống');
      const c = item.key?.correct ?? [];
      missingAnswer = c.length === 0 || !c.every((id) => o.some((x) => x.id === id));
      break;
    }
    case 'SHORT_ANSWER':
      missingAnswer = !(item.key?.accepted ?? []).some((a) => a.trim());
      break;
    case 'ORDERING': {
      const it = item.payload.items ?? [];
      if (it.length < 2) problems.push('Cần ít nhất 2 thẻ để sắp xếp');
      else if (!it.every(hasText)) problems.push('Có thẻ còn trống');
      missingAnswer = !perm(item.key?.order, it.map((c) => c.id));
      break;
    }
    case 'SENTENCE_SCRAMBLE': {
      const w = item.payload.words ?? [];
      if (w.length < 2) problems.push('Cần ít nhất 2 từ');
      missingAnswer = !perm(item.key?.order, w.map((c) => c.id));
      break;
    }
    case 'MATCHING': {
      const l = item.payload.left ?? [];
      const r = item.payload.right ?? [];
      if (l.length < 2 || r.length < 2) problems.push('Cần ít nhất 2 cặp');
      else if (![...l, ...r].every(hasText)) problems.push('Có thẻ còn trống');
      const p = item.key?.pairs ?? {};
      missingAnswer = !l.every((c) => r.some((x) => x.id === p[c.id]));
      break;
    }
    case 'DRAW':
    case 'RECORD_READ':
    case 'POLL':
      break;
    default:
      missingAnswer = item.key == null;
  }
  return { problems, missingAnswer };
}

export function draftStatus(d: Pick<DraftItem, 'item' | 'review'>): DraftStatus {
  const c = checkItem(d.item);
  if (d.review || c.problems.length) return 'review';
  return c.missingAnswer ? 'missing-answer' : 'ready';
}

/** Lí do hiển thị cho GV. */
export function draftReasons(d: Pick<DraftItem, 'item' | 'review' | 'notes'>): string[] {
  const c = checkItem(d.item);
  return [...(d.review ? [d.review] : []), ...c.problems, ...(c.missingAnswer ? ['Chưa có đáp án đúng'] : []), ...d.notes];
}
