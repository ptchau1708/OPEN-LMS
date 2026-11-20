import type { Item, Lesson } from '@openedu/contracts';
import type { CacheEntry, OfflineStore } from './types';

export const ck = {
  me: 'me',
  lesson: (id: string) => `lesson:${id}`,
  item: (id: string) => `item:${id}`,
  progress: (u: string, l: string) => `progress:${u}:${l}`,
  wallet: (u: string) => `wallet:${u}`,
  q: (method: string, args: unknown[]) => `q:${method}:${JSON.stringify(args)}`,
};

/** Bỏ đáp án trước khi lưu xuống máy — đáp án chỉ ở server. */
export function stripKey(item: Item): Item {
  if (!('key' in item)) return item;
  const { key: _key, ...rest } = item;
  return rest as Item;
}

/** Bài có item nhúng trong slide: bỏ đáp án của các item đó. */
export function stripLessonKeys(lesson: Lesson): Lesson {
  if (!lesson.slides.some((s) => s.item && 'key' in s.item)) return lesson;
  return { ...lesson, slides: lesson.slides.map((s) => (s.item ? { ...s, item: stripKey(s.item) } : s)) };
}

export async function putCache<T>(store: OfflineStore, key: string, v: T, now = Date.now()): Promise<void> {
  await store.put<CacheEntry<T>>('cache', key, { v, at: new Date(now).toISOString() });
}
export async function getCache<T>(store: OfflineStore, key: string): Promise<T | undefined> {
  return (await store.get<CacheEntry<T>>('cache', key))?.v;
}

/** id item mà bài cần (slide hoạt động + câu hỏi trong video). */
export function itemIdsOfLesson(lesson: Lesson): string[] {
  const ids = new Set<string>();
  for (const s of lesson.slides) {
    if (s.itemId) ids.add(s.itemId);
    for (const q of s.video?.questions ?? []) ids.add(q.itemId);
  }
  return [...ids];
}
