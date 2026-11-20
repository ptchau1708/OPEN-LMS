import { ACTIVITY_TYPES, SUBJECTS } from '@openedu/contracts';
import type { Item, ItemType, Lesson, MascotId, Slide } from '@openedu/contracts';
import { sfx } from '@openedu/ui';

/** Ghép class, bỏ giá trị rỗng. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Item của slide activity: nhúng trực tiếp hoặc theo itemId. */
export function resolveSlideItem(slide: Slide | undefined, items: Record<string, Item>): Item | undefined {
  if (!slide) return undefined;
  if (slide.item) return slide.item;
  if (slide.itemId) return items[slide.itemId];
  return undefined;
}

/** Tìm item theo id: kho items, rồi item nhúng trong các slide của bài. */
export function findItem(id: string | undefined, items: Record<string, Item>, lesson?: Lesson | null): Item | undefined {
  if (!id) return undefined;
  if (items[id]) return items[id];
  const slides = lesson?.slides ?? [];
  for (let i = 0; i < slides.length; i++) {
    const it = slides[i].item;
    if (it && it.id === id) return it;
  }
  return undefined;
}

/** Dạng có chấm điểm (không phải DRAW, RECORD_READ, POLL). */
export function isGradedType(type: ItemType): boolean {
  const meta = ACTIVITY_TYPES.find((t) => t.type === type);
  return meta ? meta.graded : true;
}

/** Item chấm được ngay trên máy: dạng có chấm + có đáp án. */
export function canGradeLocally(item: Item): boolean {
  return isGradedType(item.type) && item.key != null;
}

export const CHOICE_TYPES: ItemType[] = ['MCQ', 'LISTEN_CHOOSE', 'MCQ_MULTIPLE', 'POLL'];
export function isChoiceType(type: ItemType): boolean {
  return CHOICE_TYPES.indexOf(type) >= 0;
}

export function lessonMascot(lesson: Pick<Lesson, 'mascot' | 'subject'> | null | undefined): MascotId {
  if (!lesson) return 'nghe';
  return lesson.mascot ?? SUBJECTS[lesson.subject]?.mascot ?? 'nghe';
}

/** Bỏ dấu **đậm** để đọc to. */
export function plainText(s: string | undefined): string {
  return (s ?? '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

const GAME_NAMES: Record<string, string> = {
  wheel: 'Vòng quay may mắn',
  'duck-race': 'Đua vịt',
  'time-bomb': 'Bom hẹn giờ',
};
export function gameName(kind: string | undefined): string {
  return (kind && GAME_NAMES[kind]) || 'Trò chơi';
}

/** Câu đọc to của slide: slide.speak ?? title + text (có dự phòng theo bố cục). */
export function slideSpeakText(slide: Slide, item?: Item): string {
  if (slide.speak && slide.speak.trim()) return slide.speak;
  const base = [slide.title, slide.text].map(plainText).filter(Boolean).join('. ');
  if (base) return base;
  switch (slide.layout) {
    case 'activity':
      return item ? plainText(item.prompt.speak ?? item.prompt.text) : '';
    case 'compare':
      return (slide.columns ?? []).map((c) => [c.title, c.text].map(plainText).filter(Boolean).join('. ')).join('. ');
    case 'game':
      return gameName(slide.game?.kind);
    case 'summary':
      return 'Hoàn thành bài học rồi! Em giỏi lắm!';
    default:
      return '';
  }
}

export type SfxName = keyof typeof sfx;
/** Phát âm thanh khi được bật (settings.sound). */
export function play(name: SfxName, enabled: boolean | undefined): void {
  if (enabled === false) return;
  try {
    sfx[name]();
  } catch {
    /* trình duyệt chặn âm thanh: bỏ qua */
  }
}

/** Lấy id video YouTube từ các dạng link phổ biến. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{6,})/);
      if (m) return m[2];
    }
  } catch {
    /* không phải URL */
  }
  return null;
}

/** Số giây ban đầu của bộ đếm, nhớ theo endsAt (state không có thời điểm bắt đầu). */
const timerTotals: Record<string, number> = {};
export function timerTotalSeconds(endsAt: string): number {
  if (!timerTotals[endsAt]) {
    const s = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000);
    timerTotals[endsAt] = Math.max(1, s);
  }
  return timerTotals[endsAt];
}

export function safeSession<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function saveSession(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* chế độ riêng tư / bộ nhớ đầy: bỏ qua */
  }
}
