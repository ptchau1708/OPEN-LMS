/**
 * Đăng ký bộ điều khiển offline (nhỏ, nằm trong gói tải đầu). Mã nặng (wrapper, hàng đợi, tải bài) nạp động.
 * Chế độ demo thường: không có controller (mọi thứ đã ở trên máy) — app vẫn hiện "Đang học không cần mạng".
 */
import type { DataSource } from '@openedu/contracts';
import type { AnyOutboxOp, OfflineStore, SyncReport } from './types';

export interface OfflineController {
  readonly store: OfflineStore;
  /** DataSource đã bọc. */
  readonly ds: DataSource;
  readonly inner: DataSource;
  /** navigator.onLine và chưa gặp lỗi mạng trong ~30 giây gần nhất. */
  isOnline(): boolean;
  pendingCount(): number;
  failedCount(): number;
  syncing(): boolean;
  /** Mọi thay đổi trạng thái (số chờ, mạng, đang đồng bộ). */
  subscribe(fn: () => void): () => void;
  /** Sau mỗi lần đồng bộ gửi được ít nhất một thao tác. */
  onSynced(fn: (r: SyncReport) => void): () => void;
  syncNow(opts?: { force?: boolean }): Promise<SyncReport>;
  listOps(): Promise<AnyOutboxOp[]>;
  retryFailed(): Promise<void>;
  discardFailed(): Promise<void>;
  /** Đồng bộ khi có mạng lại / quay lại app / định kỳ. Trả hàm dừng. */
  startAutoSync(): () => void;
}

let current: OfflineController | null = null;
const subs = new Set<() => void>();

export function getOfflineController(): OfflineController | null {
  return current;
}
export function setOfflineController(c: OfflineController | null): void {
  current = c;
  subs.forEach((f) => f());
}
export function onOfflineControllerChange(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
