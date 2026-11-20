/** DownloadManager dùng chung: qua controller offline nếu có (Supabase / mô phỏng), ngược lại kho IndexedDB riêng + nguồn demo. */
import { createOfflineStore, DownloadManager, getDataSource, getOfflineController } from '@openedu/data';

let dm: Promise<DownloadManager> | null = null;
export function getDownloads(): Promise<DownloadManager> {
  if (!dm) {
    const c = getOfflineController();
    dm = c ? Promise.resolve(new DownloadManager({ ds: c.ds, store: c.store }))
      : createOfflineStore().then((store) => new DownloadManager({ ds: getDataSource(), store }));
  }
  return dm as Promise<DownloadManager>;
}

const AUTO_KEY = 'openedu.offline.autoWifi';
export function autoWifiEnabled(): boolean {
  try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; }
}
export function setAutoWifi(v: boolean): void {
  try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* */ }
}

export function formatBytes(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
}

/** Báo service worker: có việc chờ đồng bộ (Background Sync — Chrome/Android; nơi khác bỏ qua). */
export async function registerBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } } | undefined)?.sync;
    await sync?.register('oe-outbox');
  } catch { /* không hỗ trợ */ }
}
