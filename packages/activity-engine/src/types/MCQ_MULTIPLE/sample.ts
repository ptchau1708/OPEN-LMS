import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key): Toán lớp 3 — bảng nhân, nhiều đáp án đúng. */
export function sample(): ItemOf<'MCQ_MULTIPLE'> {
  return {
    id: 'sample-mcqm-toan3',
    type: 'MCQ_MULTIPLE',
    grade: 3,
    subject: 'toan',
    difficulty: 'ket-noi',
    prompt: { text: 'Chọn tất cả các phép tính có kết quả bằng 24.', lang: 'vi-VN' },
    payload: {
      columns: 2,
      options: [
        { id: 'a', text: '4 × 6' },
        { id: 'b', text: '5 × 5' },
        { id: 'c', text: '3 × 8' },
        { id: 'd', text: '30 − 6' },
        { id: 'e', text: '20 + 3' },
      ],
    },
    key: { correct: ['a', 'c', 'd'] },
    hint: 'Em tính từng phép tính rồi so với 24 nhé.',
    explanation: '4 × 6 = 24, 3 × 8 = 24, 30 − 6 = 24. Còn 5 × 5 = 25 và 20 + 3 = 23.',
    stars: 2,
  };
}
