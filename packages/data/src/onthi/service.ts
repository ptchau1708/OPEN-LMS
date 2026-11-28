import type { DataSource, OnThiService } from '@openedu/contracts';

const services = new WeakMap<DataSource, OnThiService>();

/** Mỗi phương thức chờ bản cài đặt được tải động (giữ app HS nhẹ: chỉ tải khi mở trang Ôn thi). */
function lazyService(load: () => Promise<OnThiService>): OnThiService {
  let p: Promise<OnThiService> | null = null;
  return new Proxy({} as OnThiService, {
    get: (_t, k: string | symbol) => {
      if (k === 'then') return undefined;
      return (...args: unknown[]) =>
        (p ??= load().catch((e) => { p = null; throw e; })).then((s) => (s[k as keyof OnThiService] as (...a: unknown[]) => unknown)(...args));
    },
  });
}

/** Dịch vụ Ôn thi đi kèm nguồn dữ liệu (demo: localStorage + chấm trên máy; Supabase: RPC onthi_* + grade). */
export function getOnThiService(ds: DataSource): OnThiService {
  let s = services.get(ds);
  if (!s) {
    s = ds.mode === 'demo'
      ? lazyService(() => import('./demo').then((m) => new m.DemoOnThiService(ds)))
      : lazyService(() => import('./supabase').then((m) => new m.SupabaseOnThiService(ds)));
    services.set(ds, s);
  }
  return s;
}

/** Chỉ kiểm thử: gắn dịch vụ tuỳ ý. */
export function setOnThiService(ds: DataSource, s: OnThiService): void {
  services.set(ds, s);
}
