import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key): Toán lớp 5 — số thập phân, 4 nhận định. */
export function sample(): ItemOf<'TRUE_FALSE_MULTI'> {
  return {
    id: 'sample-tfm-toan5',
    type: 'TRUE_FALSE_MULTI',
    grade: 5,
    subject: 'toan',
    difficulty: 'ket-noi',
    prompt: { text: 'Cho số thập phân 4,25. Mỗi nhận định sau đúng hay sai?', lang: 'vi-VN' },
    payload: {
      statements: [
        { id: 'a', text: 'Chữ số 2 ở hàng phần mười.' },
        { id: 'b', text: '4,25 lớn hơn 4,3.' },
        { id: 'c', text: '4,25 = 4 + 0,25.' },
        { id: 'd', text: 'Làm tròn 4,25 đến hàng đơn vị được 5.' },
      ],
    },
    key: { truth: { a: true, b: false, c: true, d: false } },
    hint: 'So sánh hai số thập phân: so phần nguyên trước, rồi đến hàng phần mười.',
    explanation: '4,25 có 2 ở hàng phần mười. 4,25 < 4,3 vì 2 < 3 ở hàng phần mười. Làm tròn 4,25 đến hàng đơn vị được 4.',
    stars: 2,
  };
}
