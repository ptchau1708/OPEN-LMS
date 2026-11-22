/** Hook React Query cho Cầu nối với app ngoài (khóa bắt đầu bằng 'connect'). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '../react';
import { getConnectSource } from './source';
import type { ExternalAppInput } from './types';

export const connectKeys = {
  apps: ['connect', 'apps'] as const,
  app: (id?: string) => ['connect', 'app', id] as const,
  activities: (userId?: string) => ['connect', 'activities', userId] as const,
};

function useCs() {
  const ds = useDataSource();
  return () => getConnectSource(ds);
}

/** Quản trị: sổ đăng kí app ngoài. */
export function useExternalApps() {
  const cs = useCs();
  return useQuery({ queryKey: connectKeys.apps, queryFn: async () => (await cs()).listApps() });
}
export function useSaveExternalApp() {
  const cs = useCs();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { input: ExternalAppInput; isNew: boolean }) => (await cs()).saveApp(v.input, v.isNew),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['connect'] }),
  });
}
export function useDeleteExternalApp() {
  const cs = useCs();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await cs()).deleteApp(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['connect'] }),
  });
}
/** Trang /ket-noi: app đang bật (null = không có / đã tắt). */
export function useExternalApp(id?: string, enabled = true) {
  const cs = useCs();
  return useQuery({ queryKey: connectKeys.app(id), queryFn: async () => (await cs()).getApp(id as string), enabled: !!id && enabled, staleTime: 0 });
}
/** Hồ sơ học sinh: hoạt động gần đây ở app ngoài. */
export function useExternalActivities(userId?: string, limit = 50) {
  const cs = useCs();
  return useQuery({ queryKey: [...connectKeys.activities(userId), limit], queryFn: async () => (await cs()).listActivities(userId as string, limit), enabled: !!userId });
}
/** Trang /ket-noi: lấy access token hiện tại để trao cho app ngoài (demo → null). */
export function useConnectAccess() {
  const cs = useCs();
  return useMutation({ mutationFn: async () => (await cs()).getAccess() });
}

/* ============================ LTI 1.3 ============================ */
/** Mã nền tảng (iss) của OPEN-EDU — null ở chế độ demo. */
export function useLtiIssuer() {
  const cs = useCs();
  return useQuery({ queryKey: ['connect', 'lti-issuer'], queryFn: async () => (await cs()).ltiIssuer(), staleTime: Infinity });
}
/** App LTI đang bật (trang "Ứng dụng học"). */
export function useLtiTools(enabled = true) {
  const cs = useCs();
  return useQuery({ queryKey: ['connect', 'lti-tools'], queryFn: async () => (await cs()).listLtiTools(), enabled, staleTime: 5 * 60_000, retry: 1 });
}
/** Trang /lti/auth: kí id_token cho người đang đăng nhập. */
export function useLtiAuthorize() {
  const cs = useCs();
  return useMutation({ mutationFn: async (v: { params: Record<string, string>; returnUrl?: string }) => (await cs()).ltiAuthorize(v.params, v.returnUrl) });
}
