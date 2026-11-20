import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key): Tiếng Việt lớp 3 — điền từ vào đoạn văn tả mùa xuân, có kho từ (1 từ thừa). */
export function sample(): ItemOf<'FILL_IN_PASSAGE'> {
  return {
    id: 'sample-fill-tv3',
    type: 'FILL_IN_PASSAGE',
    grade: 3,
    subject: 'tieng-viet',
    difficulty: 'ket-noi',
    prompt: { text: 'Chọn từ thích hợp để điền vào chỗ trống trong đoạn văn.', image: 'emoji:🌸', lang: 'vi-VN' },
    payload: {
      passage:
        'Mùa xuân đến, cây cối {{b1}} chồi nảy lộc. Những chú chim én {{b2}} lượn trên bầu trời. Khắp nơi {{b3}} sắc hoa đào, hoa mai. Các bạn nhỏ {{b4}} đi chơi hội xuân.',
      bank: [
        { id: 'w1', text: 'đâm' },
        { id: 'w2', text: 'chao' },
        { id: 'w3', text: 'rực rỡ' },
        { id: 'w4', text: 'náo nức' },
        { id: 'w5', text: 'rụng' },
      ],
    },
    key: {
      blanks: {
        b1: ['đâm'],
        b2: ['chao'],
        b3: ['rực rỡ'],
        b4: ['náo nức', 'háo hức'],
      },
    },
    hint: 'Có một từ không dùng đến. Lá “rụng” vào mùa nào nhỉ?',
    explanation: 'Cây cối đâm chồi nảy lộc. Chim én chao lượn. Khắp nơi rực rỡ sắc hoa. Các bạn nhỏ náo nức đi chơi hội.',
    stars: 2,
  };
}
