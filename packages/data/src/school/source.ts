/** Chọn SchoolSource theo DataSource. */
import type { DataSource, SchoolSource } from '@openedu/contracts';
import { createSchoolSource, getDataSource } from '../getDataSource';

const cache = new WeakMap<DataSource, SchoolSource>();

/** SchoolSource đi kèm một DataSource (demo dùng chung kho; Supabase dùng chung client). */
export function getSchoolSource(ds: DataSource = getDataSource()): SchoolSource {
  let s = cache.get(ds);
  if (!s) {
    s = createSchoolSource(ds);
    cache.set(ds, s);
  }
  return s;
}

/** Chỉ kiểm thử: gắn SchoolSource tuỳ ý cho một DataSource. */
export function setSchoolSource(ds: DataSource, s: SchoolSource): void {
  cache.set(ds, s);
}

