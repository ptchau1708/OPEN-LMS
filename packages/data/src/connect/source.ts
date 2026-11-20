/** Chọn ConnectSource theo DataSource — tải động (bản demo không chở supabase-js và ngược lại). */
import type { DataSource } from '@openedu/contracts';
import type { ConnectSource } from './types';

const cache = new WeakMap<DataSource, Promise<ConnectSource>>();

export function getConnectSource(ds: DataSource): Promise<ConnectSource> {
  let p = cache.get(ds);
  if (!p) {
    p = ds.mode === 'demo'
      ? import('./demo').then((m) => new m.DemoConnectSource() as ConnectSource)
      : import('./supabase').then((m) => new m.SupabaseConnectSource() as ConnectSource);
    cache.set(ds, p);
  }
  return p;
}

/** Chỉ kiểm thử: gắn ConnectSource tuỳ ý. */
export function setConnectSource(ds: DataSource, s: ConnectSource): void {
  cache.set(ds, Promise.resolve(s));
}
