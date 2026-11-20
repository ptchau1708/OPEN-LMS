import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key), nội dung tiểu học: Tiếng Việt lớp 1 — vần "ang" và vần "anh". */
export function sample(): ItemOf<'WORD_CLASSIFY'> {
  return {
    id: 'mau-classify-tv1-ang-anh',
    type: 'WORD_CLASSIFY',
    grade: 1,
    subject: 'tieng-viet',
    difficulty: 'nhan-biet',
    prompt: { text: 'Xếp các từ vào đúng nhóm: từ có vần "ang" và từ có vần "anh".' },
    payload: {
      words: [
        { id: 'w1', text: 'cây bàng' },
        { id: 'w2', text: 'quả chanh' },
        { id: 'w3', text: 'cái thang' },
        { id: 'w4', text: 'bức tranh' },
        { id: 'w5', text: 'cá vàng' },
        { id: 'w6', text: 'bánh mì' },
      ],
      groups: [
        { id: 'g1', label: 'Vần ang', color: 'var(--k-viet)' },
        { id: 'g2', label: 'Vần anh', color: 'var(--k-eng)' },
      ],
    },
    key: { placement: { w1: 'g1', w2: 'g2', w3: 'g1', w4: 'g2', w5: 'g1', w6: 'g2' } },
    hint: 'Đọc to từng từ và nghe vần cuối nhé.',
    explanation: 'Vần ang: bàng, thang, vàng. Vần anh: chanh, tranh, bánh.',
    stars: 1,
    tags: ['vần', 'học vần'],
  };
}
