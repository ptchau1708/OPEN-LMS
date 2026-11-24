/** Hook cài đặt cá nhân (khóa react-query bắt đầu bằng 'pref'). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '../react';
import { getPrefStore, localGet, prefKeyOk } from './store';

/**
 * Đọc / ghi một cài đặt của người dùng `userId`. Hiện ngay bản trên trình duyệt (nếu có), rồi bản trên máy chủ.
 * `synced`: false khi đang dùng bản trên trình duyệt (chưa chạy SQL 18 hoặc mất mạng).
 */
export function usePref<T>(userId: string, key: string | null) {
  const ds = useDataSource();
  const qc = useQueryClient();
  const ok = !!key && prefKeyOk(key);
  const store = getPrefStore(ds, async () => userId);
  const q = useQuery({
    queryKey: ['pref', userId, key],
    queryFn: () => store.get(key as string),
    enabled: ok,
    placeholderData: ok ? { value: localGet(userId, key as string), synced: false } : undefined,
    staleTime: 60_000,
  });
  const m = useMutation({
    mutationFn: (value: T | null) => store.set(key as string, value),
    onMutate: (value) => { qc.setQueryData(['pref', userId, key], { value, synced: false }); },
    onSuccess: (synced, value) => { qc.setQueryData(['pref', userId, key], { value, synced }); },
  });
  return {
    value: (q.data?.value ?? null) as T | null,
    /** Đã tải xong từ máy chủ / nơi lưu (không còn là bản tạm). */
    loaded: !q.isPlaceholderData && q.isFetched,
    synced: !!q.data?.synced,
    error: q.error ?? m.error,
    set: (value: T | null) => m.mutate(value),
    saving: m.isPending,
  };
}
