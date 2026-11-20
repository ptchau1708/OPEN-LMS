import type { ItemOf } from '@openedu/contracts';

/** Item mẫu: Mĩ thuật lớp 1 — vẽ quả táo (không chấm, key = null). */
export function sample(): ItemOf<'DRAW'> {
  return {
    id: 'mau-draw-mt1-qua-tao',
    type: 'DRAW',
    grade: 1,
    subject: 'mi-thuat',
    difficulty: 'van-dung',
    prompt: { text: 'Em hãy vẽ một quả táo.' },
    payload: {},
    key: null,
    hint: 'Vẽ hình tròn trước, thêm cuống và chiếc lá nhé.',
    stars: 1,
    tags: ['vẽ', 'trái cây'],
  };
}
