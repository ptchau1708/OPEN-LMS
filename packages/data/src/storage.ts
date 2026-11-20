/**
 * Lưu trữ khóa–giá trị cho chế độ demo. Trình duyệt: localStorage. Kiểm thử / chế độ ẩn danh / bị chặn:
 * Map trong bộ nhớ. Mọi truy cập bọc try/catch — localStorage có thể ném lỗi (đầy, bị chặn, Safari private).
 */
export const STORAGE_PREFIX = 'openedu:v1:';

export interface KVStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** Các khóa (đã bỏ tiền tố) hiện có. */
  keys(): string[];
}

export class MemoryStorage implements KVStorage {
  private map = new Map<string, string>();
  get(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  set(key: string, value: string): void {
    this.map.set(key, value);
  }
  remove(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

interface WebStorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key(i: number): string | null;
  readonly length: number;
}

/** localStorage có tiền tố; nếu ghi thất bại thì giữ bản sao trong bộ nhớ để phiên hiện tại vẫn chạy. */
export class PrefixedWebStorage implements KVStorage {
  private fallback = new MemoryStorage();
  constructor(private ls: WebStorageLike, private prefix = STORAGE_PREFIX) {}
  get(key: string): string | null {
    const mem = this.fallback.get(key);
    if (mem !== null) return mem;
    try {
      return this.ls.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string): void {
    try {
      this.ls.setItem(this.prefix + key, value);
      this.fallback.remove(key);
    } catch {
      // Hết chỗ hoặc bị chặn: vẫn giữ trong bộ nhớ.
      this.fallback.set(key, value);
    }
  }
  remove(key: string): void {
    this.fallback.remove(key);
    try {
      this.ls.removeItem(this.prefix + key);
    } catch {
      /* bỏ qua */
    }
  }
  keys(): string[] {
    const out = new Set<string>(this.fallback.keys());
    try {
      for (let i = 0; i < this.ls.length; i++) {
        const k = this.ls.key(i);
        if (k && k.startsWith(this.prefix)) out.add(k.slice(this.prefix.length));
      }
    } catch {
      /* bỏ qua */
    }
    return [...out];
  }
}

/** localStorage nếu dùng được, ngược lại Map trong bộ nhớ. */
export function createDefaultStorage(): KVStorage {
  try {
    const ls = (globalThis as { localStorage?: WebStorageLike }).localStorage;
    if (ls) {
      const probe = `${STORAGE_PREFIX}__probe`;
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return new PrefixedWebStorage(ls);
    }
  } catch {
    /* chế độ riêng tư / bị chặn */
  }
  return new MemoryStorage();
}

export function readJson<T>(s: KVStorage, key: string, fallback: T): T {
  const raw = s.get(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(s: KVStorage, key: string, value: unknown): void {
  s.set(key, JSON.stringify(value));
}
