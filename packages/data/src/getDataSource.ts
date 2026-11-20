import type { DataSource, Profile } from '@openedu/contracts';
import type { SchoolSource } from '@openedu/contracts';
import { isDemoMode, readEnv } from './env';

let instance: DataSource | null = null;
let schoolFactory: ((ds: DataSource) => SchoolSource) | null = null;
let pending: Promise<DataSource> | null = null;
/** Nguồn thật khi instance là lớp bọc offline (SchoolSource dùng nguồn thật). */
let raw: DataSource | null = null;

/**
 * Nạp nguồn dữ liệu theo chế độ (tải động: bản Supabase không chở dữ liệu mẫu, bản demo không chở supabase-js).
 * App gọi một lần trước khi render; sau đó getDataSource() dùng đồng bộ.
 * `offline: true` (app học sinh): Supabase → bọc OfflineAwareDataSource; demo + VITE_OFFLINE_SIM=1 → bọc DemoDataSource
 * trong "mạng giả" rồi OfflineAwareDataSource (docs/PHASE6_OFFLINE.md).
 */
export function initDataSource(opts: { offline?: boolean } = {}): Promise<DataSource> {
  if (instance) return Promise.resolve(instance);
  if (!pending) {
    const sim = isDemoMode() && !!opts.offline && readEnv('VITE_OFFLINE_SIM') === '1';
    pending = (isDemoMode()
      ? Promise.all([import('./demo/DemoDataSource'), import('./school/demo')]).then(([d, s]) => {
          schoolFactory = (ds) => new s.DemoSchoolSource(ds as InstanceType<typeof d.DemoDataSource>);
          return new d.DemoDataSource() as DataSource;
        })
      : Promise.all([import('./supabase/SupabaseDataSource'), import('./school/supabase')]).then(([d, s]) => {
          schoolFactory = (ds) => new s.SupabaseSchoolSource(ds);
          return new d.SupabaseDataSource() as DataSource;
        })
    )
      .then(async (ds) => {
        if (!(opts.offline && (sim || !isDemoMode()))) return ds;
        raw = ds;
        const [{ installOfflineAware }, simMod] = await Promise.all([
          import('./offline/OfflineAwareDataSource'),
          sim ? import('./offline/simulatedRemote') : Promise.resolve(null),
        ]);
        return installOfflineAware(simMod ? simMod.createSimulatedRemote(ds) : ds);
      })
      .then((ds) => { if (!instance) instance = ds; return instance; });
  }
  return pending;
}

/** Tạo SchoolSource cho DataSource hiện tại (sau initDataSource). */
export function createSchoolSource(ds: DataSource): SchoolSource {
  if (!schoolFactory) throw new Error('Chưa gọi initDataSource()');
  return schoolFactory(ds === instance && raw ? raw : ds);
}

/**
 * Nguồn dữ liệu duy nhất của app. Supabase khi có VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY và
 * VITE_DATA_MODE khác 'demo'; ngược lại chạy demo trên máy.
 */
export function getDataSource(): DataSource {
  if (!instance) throw new Error('Chưa gọi initDataSource() trước khi dùng dữ liệu');
  return instance;
}

/** Chỉ dùng trong kiểm thử / Storybook: thay nguồn dữ liệu. */
export function setDataSource(ds: DataSource | null): void {
  instance = ds;
}

/** Xóa dữ liệu demo trên máy và nạp lại nội dung mẫu (không làm gì ở chế độ Supabase). */
export async function resetDemo(ds: DataSource = getDataSource()): Promise<void> {
  const d = ds as DataSource & { resetDemo?: () => Promise<void> };
  if (d.mode === 'demo' && d.resetDemo) await d.resetDemo();
}

/** Ngoài hợp đồng DataSource: các con của tài khoản phụ huynh. */
export async function listChildren(ds: DataSource, parentId: string): Promise<Profile[]> {
  const ext = ds as DataSource & { listChildren?: (id: string) => Promise<Profile[]> };
  return ext.listChildren ? ext.listChildren(parentId) : [];
}
