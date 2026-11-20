import type { OfflineStore, StoreName } from './types';

/** Kho trong bộ nhớ — cho kiểm thử và khi trình duyệt chặn IndexedDB (chế độ ẩn danh cũ). */
export class MemoryOfflineStore implements OfflineStore {
  private maps = new Map<StoreName, Map<string, unknown>>();
  private m(s: StoreName): Map<string, unknown> {
    let x = this.maps.get(s);
    if (!x) this.maps.set(s, (x = new Map()));
    return x;
  }
  async get<T>(s: StoreName, k: string): Promise<T | undefined> {
    const v = this.m(s).get(k);
    return v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as T);
  }
  async put<T>(s: StoreName, k: string, v: T): Promise<void> {
    // Blob không qua được JSON: giữ nguyên tham chiếu.
    this.m(s).set(k, typeof Blob !== 'undefined' && v instanceof Blob ? v : JSON.parse(JSON.stringify(v)));
  }
  async delete(s: StoreName, k: string): Promise<void> {
    this.m(s).delete(k);
  }
  async keys(s: StoreName): Promise<string[]> {
    return [...this.m(s).keys()];
  }
  async getAll<T>(s: StoreName): Promise<T[]> {
    return [...this.m(s).values()].map((v) => (typeof Blob !== 'undefined' && v instanceof Blob ? v : JSON.parse(JSON.stringify(v))) as T);
  }
}
