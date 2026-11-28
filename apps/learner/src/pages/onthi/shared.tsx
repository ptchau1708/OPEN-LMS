/** Ôn thi — phần dùng chung của các trang HS (nhãn dạng câu, màu theo kiểu thi, giờ phút). */
import type { ItemType, OnThiStyle } from '@openedu/contracts';
import { ONTHI_STYLES } from '@openedu/contracts';
import type { IconName } from '@openedu/ui';

export const TYPE_LABEL: Partial<Record<ItemType, string>> = {
  MCQ: 'Chọn 1 đáp án',
  MCQ_MULTIPLE: 'Chọn nhiều đáp án',
  SHORT_ANSWER: 'Điền đáp án',
  FILL_IN_PASSAGE: 'Điền vào chỗ trống',
  MATCHING: 'Ghép cặp',
  ORDERING: 'Sắp xếp thứ tự',
  SENTENCE_SCRAMBLE: 'Sắp xếp câu',
  WORD_CLASSIFY: 'Xếp vào nhóm',
  DRAG_DROP: 'Kéo thả vào ô',
  INLINE_DROPDOWN: 'Chọn từ trong câu',
  TRUE_FALSE_MULTI: 'Đúng – Sai nhiều ý',
  LISTEN_CHOOSE: 'Nghe và chọn',
  MATH_MANIPULATIVE: 'Đồ dùng toán',
  HOTSPOT: 'Chạm vào hình',
};
export const typeLabel = (t: ItemType) => TYPE_LABEL[t] ?? t;

export const TYPE_ICON: Partial<Record<ItemType, IconName>> = {
  MCQ: 'check', MCQ_MULTIPLE: 'check', SHORT_ANSWER: 'pencil', FILL_IN_PASSAGE: 'pencil', MATCHING: 'puzzle', ORDERING: 'drag',
  SENTENCE_SCRAMBLE: 'drag', WORD_CLASSIFY: 'puzzle', DRAG_DROP: 'drag', INLINE_DROPDOWN: 'menu', TRUE_FALSE_MULTI: 'check', LISTEN_CHOOSE: 'speaker',
};

export const STYLE_PATH: Record<OnThiStyle, string> = { tn: 'trang-nguyen', vio: 'vioedu' };
export function styleFromPath(p: string | undefined): OnThiStyle | null {
  return p === 'trang-nguyen' ? 'tn' : p === 'vioedu' ? 'vio' : null;
}
export const styleTitle = (s: OnThiStyle) => ONTHI_STYLES[s].title;

export const STYLE_BLURB: Record<OnThiStyle, string> = {
  tn: 'Mỗi câu 10 điểm. Làm đúng hết các ý mới được điểm câu đó.',
  vio: 'Mỗi câu 1 điểm, sai không bị trừ. Bằng điểm thì bạn nhanh hơn xếp trên.',
};

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} phút ${String(s % 60).padStart(2, '0')} giây` : `${s} giây`;
};
export const fmtScore = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
