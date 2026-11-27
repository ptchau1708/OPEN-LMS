/**
 * Ghi lỗi phía app: giữ 20 lỗi gần nhất trên máy (để thầy/cô chép gửi quản trị) và, ở chế độ Supabase khi đã đăng nhập,
 * gửi về v2.client_errors (RPC log_client_error, tối đa 20 lỗi/người/ngày). Không bao giờ ném lỗi ra ngoài.
 */
import { isDemoMode } from './env';

export type ClientApp = 'learner' | 'teacher' | 'present';
export interface ClientErrorEntry { app: ClientApp; message: string; stack?: string; url: string; userAgent: string; at: string }

const KEY = 'openedu:client-errors';
const MAX = 20;
const sent = new Set<string>();

/** Lỗi tải mảnh mã sau khi app vừa được cập nhật — cách chữa là tải lại trang. */
export function isChunkLoadError(err: unknown): boolean {
  const m = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(m);
}

export function toClientError(app: ClientApp, err: unknown, extraStack?: string): ClientErrorEntry {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Lỗi không rõ');
  const stack = [e.stack, extraStack].filter(Boolean).join('\n').slice(0, 4000) || undefined;
  return {
    app, message: (e.message || e.name || 'Lỗi không rõ').slice(0, 500), stack,
    url: typeof location !== 'undefined' ? location.pathname.slice(0, 300) : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
    at: new Date().toISOString(),
  };
}

export function readClientErrors(): ClientErrorEntry[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function reportClientError(app: ClientApp, err: unknown, extraStack?: string): ClientErrorEntry {
  const entry = toClientError(app, err, extraStack);
  try { localStorage.setItem(KEY, JSON.stringify([entry, ...readClientErrors()].slice(0, MAX))); } catch { /* máy đầy / chế độ riêng tư */ }
  const sig = `${entry.app}|${entry.message}`;
  if (!isDemoMode() && !sent.has(sig) && sent.size < MAX) {
    sent.add(sig);
    void import('./supabase/client')
      .then(({ getSupabaseClient }) => getSupabaseClient())
      .then((sb) => sb.rpc('log_client_error', { p: entry }))
      .then(() => undefined, () => undefined);
  }
  return entry;
}

/** Bắt lỗi ngoài React (promise bị bỏ rơi, lỗi script). Gọi một lần ở main.tsx. */
export function installClientErrorHandlers(app: ClientApp): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => { if (e.error) reportClientError(app, e.error); });
  window.addEventListener('unhandledrejection', (e) => {
    // Mất mạng không phải lỗi phần mềm — hàng đợi offline đã lo.
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(String((e.reason as Error | undefined)?.message ?? e.reason ?? ''))) return;
    reportClientError(app, e.reason);
  });
}
