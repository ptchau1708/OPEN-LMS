import type { DataSource } from '@openedu/contracts';
import type { PagesSource } from './types';

const cache = new WeakMap<DataSource, Promise<PagesSource>>();
export function getPagesSource(ds: DataSource): Promise<PagesSource> {
  let p = cache.get(ds);
  if (!p) {
    p = ds.mode === 'demo'
      ? import('./demo').then((m) => new m.DemoPagesSource(ds) as PagesSource)
      : import('./supabase').then((m) => new m.SupabasePagesSource() as PagesSource);
    cache.set(ds, p);
  }
  return p;
}
