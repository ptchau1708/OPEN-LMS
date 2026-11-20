import type { ContentPackage } from '@openedu/contracts';

/**
 * Tin nhắn postMessage giữa launcher (content-host, origin riêng) và PackageHost (app).
 * Giao thức gốc: { source:'openedu-bridge', type:'result'|'progress'|'ready', score?, completed?, raw? }.
 * Mở rộng (tùy chọn, tương thích ngược): `progress` (0..1) cho type 'progress'; type 'error' + `message`
 * khi launcher biết chắc gói không mở được (để khỏi chờ đủ 15 giây).
 */
export type BridgeMessageType = 'ready' | 'progress' | 'result' | 'error';
export interface BridgeMessage {
  source: 'openedu-bridge';
  type: BridgeMessageType;
  /** 0..1 */
  score?: number;
  completed?: boolean;
  /** 0..1, chỉ với type 'progress'. */
  progress?: number;
  raw?: unknown;
  message?: string;
}

export function isBridgeMessage(d: unknown): d is BridgeMessage {
  if (!d || typeof d !== 'object') return false;
  const m = d as Record<string, unknown>;
  return m.source === 'openedu-bridge' && (m.type === 'ready' || m.type === 'progress' || m.type === 'result' || m.type === 'error');
}

/** Số trong khoảng 0..1, ngược lại undefined. */
export function unitNumber(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined;
}

/** Origin của máy chủ nội dung (nơi đặt launcher.html), lấy từ pkg.baseUrl. Ném lỗi nếu URL hỏng. */
export function contentOrigin(pkg: Pick<ContentPackage, 'baseUrl'>): string {
  return new URL(pkg.baseUrl).origin;
}

/** URL launcher cho một gói. */
export function launcherUrl(pkg: ContentPackage, parentOrigin: string): string {
  const q = new URLSearchParams({ base: pkg.baseUrl, kind: pkg.kind, entry: pkg.entry, parentOrigin, id: pkg.id });
  return `${contentOrigin(pkg)}/launcher.html?${q.toString()}`;
}
