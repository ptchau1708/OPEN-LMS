import type { ItemOf } from '@openedu/contracts';

/** Item mẫu hợp lệ (có key): Toán lớp 2 — que tính, 26 + 7 = 33 (cộng có nhớ). */
export function sample(): ItemOf<'MATH_MANIPULATIVE'> {
  return {
    id: 'mau-manip-toan2-que-tinh',
    type: 'MATH_MANIPULATIVE',
    grade: 2,
    subject: 'toan',
    difficulty: 'ket-noi',
    prompt: { text: 'Em dùng que tính để tính: 26 + 7 = ?' },
    payload: { kind: 'sticks', operands: [26, 7], op: '+', choices: [31, 33, 23, 32] },
    key: { value: 33 },
    hint: '6 que rời thêm 7 que rời là 13 que. Gộp 10 que thành 1 bó nhé.',
    explanation: '26 + 7 = 33: 2 bó và 13 que rời; gộp 10 que thành 1 bó → 3 bó và 3 que = 33.',
    stars: 1,
    tags: ['que tính', 'cộng có nhớ'],
  };
}

/** Item mẫu đồng hồ kim: Toán lớp 2 — quay kim chỉ 3 giờ 30 phút (giá trị = 210 phút). */
export function sampleClock(): ItemOf<'MATH_MANIPULATIVE'> {
  return {
    id: 'mau-manip-toan2-dong-ho',
    type: 'MATH_MANIPULATIVE',
    grade: 2,
    subject: 'toan',
    difficulty: 'ket-noi',
    prompt: { text: 'Em hãy quay kim để đồng hồ chỉ 3 giờ 30 phút.' },
    payload: { kind: 'clock', showDigital: false },
    key: { value: 3 * 60 + 30 },
    hint: 'Kim dài chỉ số 6 là 30 phút. Kim ngắn nằm giữa số 3 và số 4.',
    explanation: '3 giờ 30 phút: kim ngắn ở giữa số 3 và 4, kim dài chỉ số 6.',
    stars: 1,
    tags: ['đồng hồ', 'xem giờ'],
  };
}

/** Câu đề tự động cho đồng hồ. */
export function clockPromptText(minutes: number): string {
  const v = ((Math.round(minutes) % 720) + 720) % 720;
  const h = Math.floor(v / 60) || 12;
  const m = v % 60;
  return `Em hãy quay kim để đồng hồ chỉ ${h} giờ${m ? ` ${m} phút` : ''}.`;
}
