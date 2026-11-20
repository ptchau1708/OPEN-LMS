import type { ItemOf } from '@openedu/contracts';

/** Thăm dò ý kiến mẫu (không chấm, không có key). */
export function sample(): ItemOf<'POLL'> {
  return {
    id: 'sample-poll-convat',
    type: 'POLL',
    grade: 1,
    subject: 'tnxh',
    prompt: { text: 'Em thích con vật nào nhất?', lang: 'vi-VN' },
    payload: {
      options: [
        { id: 'cho', text: 'Chó', image: 'emoji:🐶' },
        { id: 'meo', text: 'Mèo', image: 'emoji:🐱' },
        { id: 'tho', text: 'Thỏ', image: 'emoji:🐰' },
        { id: 'gautruc', text: 'Gấu trúc', image: 'emoji:🐼' },
      ],
    },
  };
}
