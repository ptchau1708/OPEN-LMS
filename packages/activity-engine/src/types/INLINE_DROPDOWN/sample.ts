import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key): Tiếng Anh lớp 3 — động từ "to be" (am / is / are). */
export function sample(): ItemOf<'INLINE_DROPDOWN'> {
  return {
    id: 'sample-dropdown-ta3',
    type: 'INLINE_DROPDOWN',
    grade: 3,
    subject: 'tieng-anh',
    difficulty: 'nhan-biet',
    prompt: { text: 'Read and choose the correct word.', lang: 'en-US' },
    payload: {
      passage: 'Hello! My name {{d1}} Mai. I {{d2}} eight years old. This {{d3}} my friend Nam. We {{d4}} in class 3A.',
      dropdowns: {
        d1: [{ id: 'am', text: 'am' }, { id: 'is', text: 'is' }, { id: 'are', text: 'are' }],
        d2: [{ id: 'am', text: 'am' }, { id: 'is', text: 'is' }, { id: 'are', text: 'are' }],
        d3: [{ id: 'is', text: 'is' }, { id: 'are', text: 'are' }],
        d4: [{ id: 'am', text: 'am' }, { id: 'is', text: 'is' }, { id: 'are', text: 'are' }],
      },
    },
    key: { blanks: { d1: 'is', d2: 'am', d3: 'is', d4: 'are' } },
    hint: 'I → am. He, she, it, this, my name → is. We, you, they → are.',
    explanation: 'My name is Mai. I am eight years old. This is my friend Nam. We are in class 3A.',
    stars: 2,
  };
}
