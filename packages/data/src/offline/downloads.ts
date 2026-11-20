/**
 * "Tải bài về": bài (JSON) + item (KHÔNG có đáp án) vào IndexedDB, ảnh/âm thanh vào Cache Storage `oe-media-v1`
 * (service worker public/oe-sw-offline.js phục vụ lại khi mất mạng).
 * Gói HTML5 chạy trong iframe trên origin nội dung riêng — service worker của app không điều khiển được origin đó,
 * nên gói được đánh dấu "cần mạng". Video YouTube cũng "cần mạng".
 */
import type { ContentPackage, DataSource, Item, Lesson } from '@openedu/contracts';
import { ck, itemIdsOfLesson, putCache, stripKey, stripLessonKeys } from './cacheKeys';
import type { DownloadEntry, OfflineStore } from './types';

export const MEDIA_CACHE = 'oe-media-v1';
const MEDIA_RE = /\.(png|jpe?g|gif|webp|svg|avif|mp3|m4a|aac|ogg|oga|wav|webm|opus)(\?|#|$)/i;
const MEDIA_KEYS = new Set(['image', 'audio', 'audioUrl', 'src', 'imageUrl', 'background']);

/** Mọi URL ảnh/âm thanh trong bài + item (bỏ emoji:, data:, YouTube). */
export function collectMediaUrls(value: unknown, out: Set<string> = new Set()): Set<string> {
  const walk = (v: unknown, key?: string) => {
    if (typeof v === 'string') {
      if (!v || v.startsWith('emoji:') || v.startsWith('data:') || v.startsWith('blob:')) return;
      if (/youtu\.?be/i.test(v)) return;
      if ((key && MEDIA_KEYS.has(key) && /^(https?:|\/|\.\/)/.test(v)) || (MEDIA_RE.test(v) && /^(https?:|\/|\.\/)/.test(v))) out.add(v);
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => walk(x)); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(value);
  return out;
}

/** Phần của bài cần mạng (tiếng Việt, để hiện trên trang Tải về). */
export function networkNeeds(lesson: Lesson, packages: Record<string, ContentPackage | null>): string[] {
  const out: string[] = [];
  for (const s of lesson.slides) {
    if (s.layout === 'package' && s.packageId) out.push(`Gói tương tác "${packages[s.packageId]?.title ?? s.title ?? 'HTML5'}"`);
    if (s.video?.url) out.push(/youtu\.?be/i.test(s.video.url) ? 'Video YouTube' : 'Video');
  }
  return [...new Set(out)];
}

function abs(u: string): string {
  try { return new URL(u, (globalThis as { location?: Location }).location?.href ?? 'http://localhost/').href; } catch { return u; }
}

export interface DownloadDeps {
  ds: DataSource;
  store: OfflineStore;
  /** Mặc định globalThis.caches. */
  caches?: CacheStorage;
  fetch?: typeof fetch;
}

export class DownloadManager {
  constructor(private d: DownloadDeps) {}
  private get cacheStorage(): CacheStorage | undefined {
    return this.d.caches ?? (globalThis as { caches?: CacheStorage }).caches;
  }

  async list(): Promise<DownloadEntry[]> {
    return (await this.d.store.getAll<DownloadEntry>('downloads')).sort((a, b) => b.at.localeCompare(a.at));
  }
  async has(lessonId: string): Promise<boolean> {
    return !!(await this.d.store.get<DownloadEntry>('downloads', lessonId));
  }

  async download(lessonId: string, onStep?: (done: number, total: number) => void): Promise<DownloadEntry> {
    const { ds, store } = this.d;
    const lesson = await ds.getLesson(lessonId);
    if (!lesson) throw new Error('Không tìm thấy bài này.');
    const ids = itemIdsOfLesson(lesson);
    const items: Item[] = ids.length ? (await ds.getItems(ids)).map(stripKey) : [];
    const pkgIds = [...new Set(lesson.slides.filter((s) => s.layout === 'package' && s.packageId).map((s) => s.packageId as string))];
    const pkgs: Record<string, ContentPackage | null> = {};
    for (const id of pkgIds) pkgs[id] = await ds.getPackage(id).catch(() => null);

    await putCache(store, ck.lesson(lesson.id), stripLessonKeys(lesson));
    for (const it of items) await putCache(store, ck.item(it.id), it);

    const urls = [...collectMediaUrls([lesson, items])].map(abs);
    let bytes = JSON.stringify(lesson).length + JSON.stringify(items).length;
    let failedMedia = 0;
    const cs = this.cacheStorage;
    const f = this.d.fetch ?? fetch;
    const cache = cs ? await cs.open(MEDIA_CACHE) : null;
    let done = 0;
    onStep?.(0, urls.length);
    for (const u of urls) {
      try {
        if (!cache) throw new Error('no cache');
        let res = await cache.match(u);
        if (!res) {
          try {
            res = await f(u, { mode: 'cors', credentials: 'omit' });
            if (!res.ok) throw new Error(String(res.status));
          } catch {
            // Origin khác không bật CORS: lưu phản hồi "mờ" (ảnh/âm thanh vẫn hiện được, không biết dung lượng).
            res = await f(u, { mode: 'no-cors', credentials: 'omit' });
          }
          await cache.put(u, res.clone());
        }
        if (res.type !== 'opaque') bytes += (await res.clone().blob()).size;
      } catch {
        failedMedia++;
      }
      onStep?.(++done, urls.length);
    }
    const entry: DownloadEntry = {
      lessonId: lesson.id, title: lesson.title, subject: lesson.subject, bytes, itemIds: ids, mediaUrls: urls,
      needsNetwork: networkNeeds(lesson, pkgs), failedMedia, at: new Date().toISOString(),
    };
    await store.put('downloads', lesson.id, entry);
    void this.notifySw();
    return entry;
  }

  async remove(lessonId: string): Promise<void> {
    const { store } = this.d;
    const entry = await store.get<DownloadEntry>('downloads', lessonId);
    await store.delete('downloads', lessonId);
    if (!entry) return;
    const others = (await this.list()).filter((e) => e.lessonId !== lessonId);
    const keepUrls = new Set(others.flatMap((e) => e.mediaUrls));
    const keepItems = new Set(others.flatMap((e) => e.itemIds));
    const cs = this.cacheStorage;
    if (cs) {
      const cache = await cs.open(MEDIA_CACHE);
      for (const u of entry.mediaUrls) if (!keepUrls.has(u)) await cache.delete(u);
    }
    await store.delete('cache', ck.lesson(lessonId));
    for (const id of entry.itemIds) if (!keepItems.has(id)) await store.delete('cache', ck.item(id));
    void this.notifySw();
  }

  /** Báo service worker nạp lại danh sách URL đã tải. */
  private async notifySw(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      reg?.active?.postMessage({ type: 'oe-media-changed' });
    } catch { /* không có SW */ }
  }
}

/** Dung lượng: navigator.storage.estimate(); xin lưu bền (không bị trình duyệt tự xóa). */
export async function storageInfo(): Promise<{ usage?: number; quota?: number; persisted?: boolean }> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s) return {};
  const [est, persisted] = await Promise.all([s.estimate?.().catch(() => undefined), s.persisted?.().catch(() => undefined)]);
  return { usage: est?.usage, quota: est?.quota, persisted };
}
export async function requestPersist(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

/** Đang dùng Wi-Fi? (Network Information API — Chrome Android; nơi khác không biết → null.) */
export function onWifi(): boolean | null {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  if (!c || !c.type) return null;
  return c.type === 'wifi' || c.type === 'ethernet';
}
