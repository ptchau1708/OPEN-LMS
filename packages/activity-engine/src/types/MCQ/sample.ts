import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key), nội dung tiểu học: Toán lớp 2 — bài toán có lời văn, cộng có nhớ. */
export function sample(): ItemOf<'MCQ'> {
  return {
    id: 'sample-mcq-toan2',
    type: 'MCQ',
    grade: 2,
    subject: 'toan',
    difficulty: 'ket-noi',
    prompt: {
      text: 'Mẹ có 8 quả cam. Mẹ mua thêm 5 quả nữa. Hỏi mẹ có tất cả bao nhiêu quả cam?',
      image: 'emoji:🍊',
      lang: 'vi-VN',
    },
    payload: {
      columns: 2,
      options: [
        { id: 'a', text: '12 quả' },
        { id: 'b', text: '13 quả' },
        { id: 'c', text: '14 quả' },
        { id: 'd', text: '3 quả' },
      ],
    },
    key: { correct: 'b' },
    hint: 'Mẹ có thêm cam, vậy em làm phép cộng: 8 + 5.',
    explanation: '8 + 5 = 13. Mẹ có tất cả 13 quả cam.',
    stars: 1,
    tags: ['phép cộng có nhớ', 'bài toán có lời văn'],
  };
}
