import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key), nội dung tiểu học: Tiếng Việt lớp 2 — xếp từ thành câu. */
export function sample(): ItemOf<'SENTENCE_SCRAMBLE'> {
  return {
    id: 'mau-scramble-tv2-di-hoc',
    type: 'SENTENCE_SCRAMBLE',
    grade: 2,
    subject: 'tieng-viet',
    difficulty: 'ket-noi',
    prompt: { text: 'Sắp xếp các từ thành câu đúng.' },
    payload: {
      words: [
        { id: 'w1', text: 'Em' },
        { id: 'w2', text: 'đi' },
        { id: 'w3', text: 'học' },
        { id: 'w4', text: 'đúng giờ' },
      ],
    },
    key: { order: ['w1', 'w2', 'w3', 'w4'] },
    hint: 'Chữ viết hoa thường đứng đầu câu.',
    explanation: 'Câu đúng: Em đi học đúng giờ.',
    stars: 1,
    tags: ['câu', 'luyện từ và câu'],
  };
}
