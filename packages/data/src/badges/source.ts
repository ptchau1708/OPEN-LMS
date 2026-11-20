/** Chọn RewardsSource theo DataSource — tải động (bản demo không chở supabase-js và ngược lại). */
import type { DataSource, RewardsSource } from '@openedu/contracts';

const cache = new WeakMap<DataSource, Promise<RewardsSource>>();

export function getRewardsSource(ds: DataSource): Promise<RewardsSource> {
  let p = cache.get(ds);
  if (!p) {
    p = ds.mode === 'demo'
      ? Promise.all([import('./demo'), import('../demo/DemoDataSource')]).then(([m, d]) =>
          // Lớp bọc offline (VITE_OFFLINE_SIM) không có schoolKv → dùng một DemoDataSource cùng kho localStorage.
          new m.DemoRewardsSource(typeof (ds as { schoolKv?: unknown }).schoolKv === 'function' ? (ds as InstanceType<typeof d.DemoDataSource>) : new d.DemoDataSource()))
      : import('./supabase').then((m) => new m.SupabaseRewardsSource());
    cache.set(ds, p);
  }
  return p;
}

/** Chỉ kiểm thử: gắn RewardsSource tuỳ ý. */
export function setRewardsSource(ds: DataSource, s: RewardsSource): void {
  cache.set(ds, Promise.resolve(s));
}
