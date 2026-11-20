/** Bọc IndexedDB thô (không thêm thư viện): một DB "openedu-offline", 4 object store khóa ngoài (key, value). */
import { STORE_NAMES, type OfflineStore, type StoreName } from './types';

const DB_NAME = 'openedu-offline';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export class IdbOfflineStore implements OfflineStore {
  private db: Promise<IDBDatabase>;
  constructor(name = DB_NAME) {
    this.db = new Promise((res, rej) => {
      const open = indexedDB.open(name, DB_VERSION);
      open.onupgradeneeded = () => {
        for (const s of STORE_NAMES) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s);
      };
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
      open.onblocked = () => rej(new Error('IndexedDB đang bị chặn'));
    });
  }
  private async tx(s: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db).transaction(s, mode).objectStore(s);
  }
  async get<T>(s: StoreName, k: string): Promise<T | undefined> {
    return (await req((await this.tx(s, 'readonly')).get(k))) as T | undefined;
  }
  async put<T>(s: StoreName, k: string, v: T): Promise<void> {
    await req((await this.tx(s, 'readwrite')).put(v, k));
  }
  async delete(s: StoreName, k: string): Promise<void> {
    await req((await this.tx(s, 'readwrite')).delete(k));
  }
  async keys(s: StoreName): Promise<string[]> {
    return ((await req((await this.tx(s, 'readonly')).getAllKeys())) as IDBValidKey[]).map(String);
  }
  async getAll<T>(s: StoreName): Promise<T[]> {
    return (await req((await this.tx(s, 'readonly')).getAll())) as T[];
  }
}

/** IndexedDB nếu có (và mở được), ngược lại bộ nhớ. */
export async function createOfflineStore(): Promise<OfflineStore> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const s = new IdbOfflineStore();
      await s.keys('cache');
      return s;
    } catch {
      /* rơi xuống bộ nhớ */
    }
  }
  const { MemoryOfflineStore } = await import('./memoryStore');
  return new MemoryOfflineStore();
}
