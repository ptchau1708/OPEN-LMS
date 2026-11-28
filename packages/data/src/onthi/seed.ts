/** Bài luyện mẫu (chế độ demo) cho khối 5: 2 bài kiểu Trạng Nguyên (Tiếng Việt), 2 bài kiểu VioEdu (Toán). */
import { defaultMinutes, defaultPassScore, type AnyResponse, type Item, type OnThiSet, type OnThiStyle } from '@openedu/contracts';
import { ONTHI_TOAN5_ITEMS, ONTHI_TV5_ITEMS, TOAN45_ITEMS } from '../seed';

const ids = (xs: Item[]) => xs.map((i) => i.id);
const toan5Extra = TOAN45_ITEMS.filter((i) => i.grade === 5 && ['MCQ', 'MCQ_MULTIPLE', 'SHORT_ANSWER', 'ORDERING', 'MATCHING', 'FILL_IN_PASSAGE', 'INLINE_DROPDOWN'].includes(i.type));

function set(id: string, style: OnThiStyle, title: string, subject: OnThiSet['subject'], items: string[], position: number, lockOrder: boolean): OnThiSet {
  const points = style === 'tn' ? 10 : 1;
  return {
    id, style, title, grade: 5, subject, itemIds: items, minutes: defaultMinutes(style, items.length), points,
    passScore: defaultPassScore(style, items.length, points), lockOrder, position, showBoard: true, revealAnswers: true,
    status: 'published', createdBy: 'u-thayquang', createdByName: 'Thầy Quang',
  };
}

export function seedSets(): OnThiSet[] {
  const tv = ids(ONTHI_TV5_ITEMS);
  return [
    set('ot-set-tn-1', 'tn', 'Tiếng Việt 5 – Bài luyện 1', 'tieng-viet', tv.slice(0, 8), 1, false),
    set('ot-set-tn-2', 'tn', 'Tiếng Việt 5 – Bài luyện 2', 'tieng-viet', tv.slice(8), 2, true),
    set('ot-set-vio-1', 'vio', 'Toán 5 – Đấu trường 1', 'toan', ids(ONTHI_TOAN5_ITEMS), 1, false),
    set('ot-set-vio-2', 'vio', 'Toán 5 – Đấu trường 2', 'toan', ids(toan5Extra).slice(0, 12), 2, false),
  ];
}

/** Câu trả lời đúng dựng từ đáp án (để tạo bài làm mẫu của các bạn). */
export function rightAnswer(it: Item): AnyResponse | null {
  const k = it.key as never as Record<string, unknown> | null | undefined;
  if (!k) return null;
  switch (it.type) {
    case 'MCQ':
    case 'LISTEN_CHOOSE':
      return { choice: String(k.correct) };
    case 'MCQ_MULTIPLE':
      return { choices: [...(k.correct as string[])] };
    case 'SHORT_ANSWER':
      return { text: (k.accepted as string[])[0] };
    case 'ORDERING':
    case 'SENTENCE_SCRAMBLE':
      return { order: [...(k.order as string[])] };
    case 'MATCHING':
      return { pairs: { ...(k.pairs as Record<string, string>) } };
    case 'DRAG_DROP':
    case 'WORD_CLASSIFY':
      return { placement: { ...(k.placement as Record<string, string>) } };
    case 'FILL_IN_PASSAGE':
      return { blanks: Object.fromEntries(Object.entries(k.blanks as Record<string, string[]>).map(([b, v]) => [b, v[0]])) };
    case 'INLINE_DROPDOWN':
      return { blanks: { ...(k.blanks as Record<string, string>) } };
    case 'TRUE_FALSE_MULTI':
      return { picks: { ...(k.truth as Record<string, boolean>) } };
    case 'MATH_MANIPULATIVE':
      return { value: Number(k.value) };
    default:
      return null;
  }
}

/** Câu trả lời sai (chỉ dạng Chọn 1 đáp án: lựa chọn sai đầu tiên). */
export function wrongAnswer(it: Item): AnyResponse | null {
  if (it.type !== 'MCQ') return null;
  const o = it.payload.options.find((x) => x.id !== (it.key as { correct?: string } | undefined)?.correct);
  return o ? { choice: o.id } : null;
}

/** Bài làm mẫu: [học sinh, bài, số câu đầu bỏ qua, phút làm bài, số phút trước "bây giờ", vị trí câu làm sai]. */
export const SEED_RUNS: [string, string, number, number, number, number[]][] = [
  ['u-ngan5a2', 'ot-set-tn-1', 1, 6.2, 2 * 1440, []],
  ['u-phuc5a3', 'ot-set-tn-1', 1, 7.5, 1440, [1, 2]],
  ['u-trang5a4', 'ot-set-tn-1', 1, 7.1, 600, [2]],
  ['u-ngan5a2', 'ot-set-vio-1', 2, 7.4, 1500, [2]],
  ['u-phuc5a3', 'ot-set-vio-1', 1, 8.9, 900, [1]],
  ['u-trang5a4', 'ot-set-vio-1', 4, 6.0, 300, []],
];
