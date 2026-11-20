import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key), nội dung tiểu học: TNXH lớp 1 — con vật sống ở đâu. */
export function sample(): ItemOf<'DRAG_DROP'> {
  return {
    id: 'mau-dragdrop-tnxh1-noi-song',
    type: 'DRAG_DROP',
    grade: 1,
    subject: 'tnxh',
    difficulty: 'nhan-biet',
    prompt: { text: 'Kéo mỗi con vật vào đúng nơi sống của nó.' },
    payload: {
      tokens: [
        { id: 't1', text: 'Con cá', image: 'emoji:🐟' },
        { id: 't2', text: 'Con gà', image: 'emoji:🐔' },
        { id: 't3', text: 'Con tôm', image: 'emoji:🦐' },
        { id: 't4', text: 'Con chó', image: 'emoji:🐶' },
        { id: 't5', text: 'Con bạch tuộc', image: 'emoji:🐙' },
        { id: 't6', text: 'Con voi', image: 'emoji:🐘' },
      ],
      zones: [
        { id: 'z1', label: 'Dưới nước', image: 'emoji:🌊' },
        { id: 'z2', label: 'Trên cạn', image: 'emoji:🌳' },
      ],
    },
    key: { placement: { t1: 'z1', t2: 'z2', t3: 'z1', t4: 'z2', t5: 'z1', t6: 'z2' } },
    hint: 'Con vật nào bơi được dưới nước?',
    explanation: 'Cá, tôm, bạch tuộc sống dưới nước. Gà, chó, voi sống trên cạn.',
    stars: 1,
    tags: ['động vật', 'nơi sống'],
  };
}
