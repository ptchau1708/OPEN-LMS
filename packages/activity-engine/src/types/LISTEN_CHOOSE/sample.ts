import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key): Tiếng Việt lớp 1 — nghe tiếng rồi chọn tranh. */
export function sample(): ItemOf<'LISTEN_CHOOSE'> {
  return {
    id: 'sample-listen-tv1',
    type: 'LISTEN_CHOOSE',
    grade: 1,
    subject: 'tieng-viet',
    difficulty: 'nhan-biet',
    prompt: {
      text: 'Em nghe và chạm vào tranh đúng nhé!',
      speak: 'con gà',
      lang: 'vi-VN',
    },
    payload: {
      columns: 2,
      options: [
        { id: 'ca', image: 'emoji:🐟' },
        { id: 'ga', image: 'emoji:🐔' },
        { id: 'la', image: 'emoji:🍃' },
        { id: 'nha', image: 'emoji:🏠' },
      ],
    },
    key: { correct: 'ga' },
    hint: 'Bấm nút loa để nghe lại nhé.',
    explanation: 'Tiếng “gà” có âm g và vần a, thanh huyền: con gà.',
    stars: 1,
  };
}
