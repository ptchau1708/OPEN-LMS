import type { DataSource, ExamService } from '@openedu/contracts';

const services = new WeakMap<DataSource, ExamService>();

/** Mỗi phương thức chờ bản cài đặt được tải động (giữ app HS nhẹ: chỉ tải khi có gọi). */
function lazyService(load: () => Promise<ExamService>): ExamService {
  let p: Promise<ExamService> | null = null;
  return new Proxy({} as ExamService, {
    get: (_t, k: string | symbol) => {
      if (k === 'then') return undefined; // không phải Promise
      return (...args: unknown[]) =>
        (p ??= load().catch((e) => { p = null; throw e; })).then((s) => (s[k as keyof ExamService] as (...a: unknown[]) => unknown)(...args));
    },
  });
}

/** Dịch vụ đề kiểm tra đi kèm nguồn dữ liệu (demo: localStorage + chấm trên máy; Supabase: RPC exam_* + grade). */
export function getExamService(ds: DataSource): ExamService {
  let s = services.get(ds);
  if (!s) {
    s = ds.mode === 'demo'
      ? lazyService(() => import('./demo').then((m) => new m.DemoExamService(ds)))
      : lazyService(() => import('./supabase').then((m) => new m.SupabaseExamService(ds)));
    services.set(ds, s);
  }
  return s;
}

/** Chỉ kiểm thử: gắn dịch vụ tuỳ ý. */
export function setExamService(ds: DataSource, s: ExamService): void {
  services.set(ds, s);
}
