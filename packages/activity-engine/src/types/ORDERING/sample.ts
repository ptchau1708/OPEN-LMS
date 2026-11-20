import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key), nội dung tiểu học: Toán lớp 1 — xếp số từ bé đến lớn. */
export function sample(): ItemOf<'ORDERING'> {
  return {
    id: 'mau-ordering-toan1-be-den-lon',
    type: 'ORDERING',
    grade: 1,
    subject: 'toan',
    difficulty: 'nhan-biet',
    prompt: { text: 'Xếp các số 7, 2, 9, 4, 5 theo thứ tự từ bé đến lớn.' },
    payload: {
      items: [
        { id: 'n2', text: '2' },
        { id: 'n4', text: '4' },
        { id: 'n5', text: '5' },
        { id: 'n7', text: '7' },
        { id: 'n9', text: '9' },
      ],
      direction: 'horizontal',
    },
    key: { order: ['n2', 'n4', 'n5', 'n7', 'n9'] },
    hint: 'Tìm số bé nhất trước nhé.',
    explanation: 'Từ bé đến lớn: 2, 4, 5, 7, 9.',
    stars: 1,
    tags: ['so sánh số', 'các số đến 10'],
  };
}
