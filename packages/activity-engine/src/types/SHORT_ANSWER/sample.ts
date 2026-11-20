import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key): Toán lớp 2 — bài toán nhiều hơn, cộng có nhớ trong phạm vi 100. */
export function sample(): ItemOf<'SHORT_ANSWER'> {
  return {
    id: 'sample-short-toan2',
    type: 'SHORT_ANSWER',
    grade: 2,
    subject: 'toan',
    difficulty: 'van-dung',
    prompt: {
      text: 'Đoạn thẳng AB dài 35 cm. Đoạn thẳng CD dài hơn đoạn thẳng AB 17 cm. Hỏi đoạn thẳng CD dài bao nhiêu xăng-ti-mét?',
      image: 'emoji:📏',
      lang: 'vi-VN',
    },
    payload: { inputMode: 'numeric', unit: 'cm', placeholder: '?' },
    key: { accepted: ['52'] },
    hint: '“Dài hơn” thì em làm phép cộng: 35 + 17.',
    explanation: '35 + 17 = 52. Đoạn thẳng CD dài 52 cm.',
    stars: 1,
  };
}
