import type { DataSource } from '@openedu/contracts';
import type { DiscussSource } from './types';

const cache = new WeakMap<DataSource, Promise<DiscussSource>>();
export function getDiscussSource(ds: DataSource): Promise<DiscussSource> {
  let p = cache.get(ds);
  if (!p) {
    p = ds.mode === 'demo'
      ? import('./demo').then((m) => new m.DemoDiscussSource(ds) as DiscussSource)
      : import('./supabase').then((m) => new m.SupabaseDiscussSource() as DiscussSource);
    cache.set(ds, p);
  }
  return p;
}
