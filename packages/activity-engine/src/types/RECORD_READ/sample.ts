import type { ItemOf } from '@openedu/contracts';

/** Item mẫu: Tiếng Việt lớp 1 — đọc to đoạn văn ngắn (không chấm, key = null). */
export function sample(): ItemOf<'RECORD_READ'> {
  return {
    id: 'mau-record-tv1-cay-buoi',
    type: 'RECORD_READ',
    grade: 1,
    subject: 'tieng-viet',
    difficulty: 'van-dung',
    prompt: { text: 'Em hãy đọc to đoạn văn, rồi ghi âm gửi thầy/cô nhé.' },
    payload: {
      text: 'Nhà bà có cây bưởi.\nHè về, quả bưởi chín vàng.\nBé hái quả to nhất biếu bà.\nBà khen bé ngoan.',
      maxSeconds: 30,
    },
    key: null,
    hint: 'Đọc chậm, rõ từng tiếng nhé.',
    stars: 1,
    tags: ['tập đọc'],
  };
}
