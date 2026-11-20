/** Trạng thái mạng + hàng đợi cho giao diện (nhỏ; dùng được cả khi không có controller — demo thường). */
import { useSyncExternalStore } from 'react';
import { getOfflineController, onOfflineControllerChange } from '@openedu/data';

export interface OfflineState { online: boolean; pending: number; failed: number; syncing: boolean; managed: boolean }

let snap: OfflineState = read();
function read(): OfflineState {
  const c = getOfflineController();
  const nav = typeof navigator === 'undefined' || navigator.onLine !== false;
  return c ? { online: c.isOnline(), pending: c.pendingCount(), failed: c.failedCount(), syncing: c.syncing(), managed: true }
    : { online: nav, pending: 0, failed: 0, syncing: false, managed: false };
}
function subscribe(fn: () => void): () => void {
  const update = () => {
    const n = read();
    if (n.online !== snap.online || n.pending !== snap.pending || n.failed !== snap.failed || n.syncing !== snap.syncing || n.managed !== snap.managed) { snap = n; fn(); }
  };
  let unsubCtrl = getOfflineController()?.subscribe(update);
  const unsubReg = onOfflineControllerChange(() => { unsubCtrl?.(); unsubCtrl = getOfflineController()?.subscribe(update); update(); });
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  return () => { unsubCtrl?.(); unsubReg(); window.removeEventListener('online', update); window.removeEventListener('offline', update); };
}

export function useOfflineState(): OfflineState {
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}
