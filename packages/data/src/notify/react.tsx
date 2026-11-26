/** Hook thông báo (khóa react-query bắt đầu bằng 'notify'). */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotifyPrefs } from '@openedu/contracts';
import { useCurrentUser, useDataSource } from '../react';
import { getNotify } from './source';
import { enablePush, disablePush, pushState, setAppBadge, syncPush } from './push';

export function useNotifySource() {
  return getNotify(useDataSource());
}

/** Danh sách + số chưa đọc. watch: nghe Realtime / service worker (chỉ bật ở MỘT chỗ trong app); dự phòng tải lại mỗi phút. */
export function useNotifications(enabled = true, watch = true) {
  const ds = useDataSource();
  const qc = useQueryClient();
  const me = useCurrentUser().data;
  const q = useQuery({
    queryKey: ['notify', 'list'],
    queryFn: () => getNotify(ds).list(50),
    enabled: enabled && !!me,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!enabled || !watch || !me) return;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['notify', 'list'] });
      void qc.invalidateQueries({ queryKey: ['parenthub'] });
    };
    const off = getNotify(ds).watch(me.id, refresh);
    const sw = globalThis.navigator?.serviceWorker;
    const onMsg = (e: MessageEvent) => { if ((e.data as { type?: string } | null)?.type === 'oe-push') refresh(); };
    sw?.addEventListener?.('message', onMsg);
    return () => { off(); sw?.removeEventListener?.('message', onMsg); };
  }, [ds, qc, me, enabled, watch]);
  useEffect(() => { if (watch && q.data) setAppBadge(q.data.unread); }, [q.data, watch]);
  return q;
}

export function useMarkNotificationsRead() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => getNotify(ds).read(ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notify', 'list'] }),
  });
}

export function useNotifyPrefs(enabled = true) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['notify', 'prefs'], queryFn: () => getNotify(ds).prefs(), enabled });
}

export function useSaveNotifyPrefs() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<Omit<NotifyPrefs, 'devices'>>) => getNotify(ds).savePrefs(p),
    onSuccess: (p) => qc.setQueryData(['notify', 'prefs'], p),
  });
}

export function usePushInfo() {
  const ds = useDataSource();
  return useQuery({ queryKey: ['notify', 'push-info'], queryFn: () => getNotify(ds).pushInfo(), staleTime: 60_000 });
}

/** Trạng thái thông báo đẩy trên máy này. */
export function usePushState() {
  return useQuery({ queryKey: ['notify', 'push-state'], queryFn: () => pushState(), staleTime: 10_000 });
}

export function useEnablePush(app: 'hoc' | 'gv') {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => enablePush(getNotify(ds), app),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['notify'] }); },
  });
}

export function useDisablePush() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => disablePush(getNotify(ds)),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['notify'] }); },
  });
}

export function useNotifyTest() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getNotify(ds).test(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notify', 'list'] }),
  });
}

/** Gọi một lần khi app mở: máy đã bật thông báo thì báo lại máy chủ. */
export function usePushSync(app: 'hoc' | 'gv') {
  const ds = useDataSource();
  const me = useCurrentUser().data;
  useEffect(() => {
    if (!me || ds.mode === 'demo') return;
    void syncPush(getNotify(ds), app);
  }, [ds, me, app]);
}
