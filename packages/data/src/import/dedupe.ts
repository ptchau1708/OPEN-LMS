/** Phát hiện câu trùng (thuần): cùng đề bài sau khi chuẩn hoá. */
import type { Choice, Item } from '@openedu/contracts';

/** Chuẩn hoá đề: bỏ "Câu 1:", chữ thường, gộp khoảng trắng, bỏ dấu câu cuối. GIỮ dấu tiếng Việt ("ma" ≠ "má"). */
export function promptKey(text: string): string {
  return (text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/^\s*(?:câu|bài|câu hỏi)\s*\d+\s*[.:)\-–]?\s*/i, '')
    .replace(/[\s ]+/g, ' ')
    .replace(/\s*([?:.,;!…])\s*/g, '$1')
    .replace(/[.:;,!?…\s_]+$/g, '')
    .trim();
}

const texts = (list: Choice[] | undefined): string[] => (list ?? []).map((c) => promptKey(c.text ?? c.image ?? ''));

/** Nội dung riêng của câu (lựa chọn, đáp án điền…) — để phân biệt các câu có đề chung chung như "Tính:". */
export function contentKey(item: Item): string {
  switch (item.type) {
    case 'MCQ':
    case 'MCQ_MULTIPLE':
    case 'LISTEN_CHOOSE':
    case 'POLL':
      return texts(item.payload.options).sort().join('|');
    case 'ORDERING':
      return texts(item.payload.items).sort().join('|');
    case 'MATCHING':
      return [...texts(item.payload.left), ...texts(item.payload.right)].sort().join('|');
    case 'SENTENCE_SCRAMBLE':
    case 'WORD_CLASSIFY':
      return texts(item.payload.words).sort().join('|');
    case 'FILL_IN_PASSAGE':
    case 'INLINE_DROPDOWN':
      return promptKey(item.payload.passage);
    case 'SHORT_ANSWER':
      return (item.key?.accepted ?? []).map(promptKey).sort().join('|');
    default:
      return '';
  }
}

/** Đề đủ dài (≥ 20 kí tự) thì chỉ cần trùng đề; đề ngắn/chung chung phải trùng cả nội dung. */
const LONG_PROMPT = 20;

export interface DupIndex {
  byPrompt: Map<string, Item[]>;
}

export function buildDupIndex(bank: Item[]): DupIndex {
  const byPrompt = new Map<string, Item[]>();
  for (const it of bank) {
    const k = promptKey(it.prompt?.text ?? '');
    if (!k) continue;
    const l = byPrompt.get(k);
    if (l) l.push(it);
    else byPrompt.set(k, [it]);
  }
  return { byPrompt };
}

export function isSameQuestion(a: Item, b: Item): boolean {
  const k = promptKey(a.prompt?.text ?? '');
  if (!k || k !== promptKey(b.prompt?.text ?? '')) return false;
  return k.length >= LONG_PROMPT || contentKey(a) === contentKey(b);
}

/** Câu trong ngân hàng trùng với `item` (bỏ qua chính nó theo id). */
export function findDuplicate(item: Item, index: DupIndex): Item | null {
  const k = promptKey(item.prompt?.text ?? '');
  if (!k) return null;
  return (index.byPrompt.get(k) ?? []).find((b) => b.id !== item.id && isSameQuestion(item, b)) ?? null;
}

/**
 * Với mỗi câu sắp nhập: id câu trùng trong ngân hàng ('bank:<id>') hoặc trùng với một câu ĐỨNG TRƯỚC trong cùng lô
 * ('batch:<chỉ số>'); không trùng → null.
 */
export function markDuplicates(items: Item[], bank: Item[]): (string | null)[] {
  const index = buildDupIndex(bank);
  return items.map((it, i) => {
    const b = findDuplicate(it, index);
    if (b) return `bank:${b.id}`;
    for (let j = 0; j < i; j++) if (items[j].id !== it.id && isSameQuestion(it, items[j])) return `batch:${j}`;
    return null;
  });
}
