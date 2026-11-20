import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key), nội dung tiểu học: Tiếng Anh lớp 3 — lời chào. */
export function sample(): ItemOf<'MATCHING'> {
  return {
    id: 'mau-matching-ta3-chao-hoi',
    type: 'MATCHING',
    grade: 3,
    subject: 'tieng-anh',
    difficulty: 'nhan-biet',
    prompt: { text: 'Nối từ tiếng Anh với nghĩa tiếng Việt.' },
    payload: {
      left: [
        { id: 'l1', text: 'Hello', image: 'emoji:👋', speak: 'Hello' },
        { id: 'l2', text: 'Goodbye', image: 'emoji:🚌', speak: 'Goodbye' },
        { id: 'l3', text: 'Thank you', image: 'emoji:🎁', speak: 'Thank you' },
        { id: 'l4', text: 'Sorry', image: 'emoji:😔', speak: 'Sorry' },
      ],
      right: [
        { id: 'r1', text: 'Xin chào' },
        { id: 'r2', text: 'Tạm biệt' },
        { id: 'r3', text: 'Cảm ơn' },
        { id: 'r4', text: 'Xin lỗi' },
      ],
    },
    key: { pairs: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' } },
    hint: 'Chạm vào loa để nghe từ tiếng Anh nhé.',
    explanation: 'Hello = Xin chào, Goodbye = Tạm biệt, Thank you = Cảm ơn, Sorry = Xin lỗi.',
    stars: 1,
    tags: ['chào hỏi', 'từ vựng'],
  };
}
