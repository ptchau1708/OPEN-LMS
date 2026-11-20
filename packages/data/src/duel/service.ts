import type { DataSource, DuelService } from '@openedu/contracts';
import { DemoDuelService } from './demo';
import { SupabaseDuelService } from './supabase';

const services = new WeakMap<DataSource, DuelService>();

/** Dịch vụ Đấu 1–1 đi kèm nguồn dữ liệu (demo: BroadcastChannel + máy; Supabase: RPC + Realtime + grade). */
export function getDuelService(ds: DataSource): DuelService {
  let s = services.get(ds);
  if (!s) {
    s = ds.mode === 'demo' ? new DemoDuelService(ds) : new SupabaseDuelService();
    services.set(ds, s);
  }
  return s;
}
