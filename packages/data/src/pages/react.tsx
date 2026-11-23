/** Hook cho Trang nhúng + Trang học (khóa bắt đầu bằng 'pages'). */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '../react';
import { getPagesSource } from './source';
import type { ClassPageInput } from './types';

function usePs() {
  const ds = useDataSource();
  return () => getPagesSource(ds);
}

export function useEmbedSites() {
  const ps = usePs();
  return useQuery({ queryKey: ['pages', 'sites'], queryFn: async () => (await ps()).listEmbedSites(), staleTime: 10 * 60_000 });
}
/** Nạp danh sách trang được phép nhúng rồi báo cho trình nhúng (lesson-player.setEmbedOrigins). */
export function useEmbedOriginsSync(apply: (origins: string[] | null) => void, enabled = true) {
  const ps = usePs();
  const q = useQuery({ queryKey: ['pages', 'sites'], queryFn: async () => (await ps()).listEmbedSites(), staleTime: 10 * 60_000, enabled, retry: 1 });
  useEffect(() => { if (q.data) apply(q.data.map((s) => s.origin)); }, [q.data, apply]);
}
export function useAddEmbedSite() {
  const ps = usePs();
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (v: { origin: string; name: string }) => (await ps()).addEmbedSite(v.origin, v.name), onSuccess: () => void qc.invalidateQueries({ queryKey: ['pages', 'sites'] }) });
}
export function useRemoveEmbedSite() {
  const ps = usePs();
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (origin: string) => (await ps()).removeEmbedSite(origin), onSuccess: () => void qc.invalidateQueries({ queryKey: ['pages', 'sites'] }) });
}
export function useClassPages(classId?: string | null) {
  const ps = usePs();
  return useQuery({ queryKey: ['pages', 'class', classId], queryFn: async () => (await ps()).listClassPages(classId as string), enabled: !!classId });
}
export function useClassPage(id?: string) {
  const ps = usePs();
  return useQuery({ queryKey: ['pages', 'one', id], queryFn: async () => (await ps()).getClassPage(id as string), enabled: !!id });
}
export function useSaveClassPage() {
  const ps = usePs();
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (i: ClassPageInput) => (await ps()).saveClassPage(i), onSuccess: () => void qc.invalidateQueries({ queryKey: ['pages'] }) });
}
export function useMovePages() {
  const ps = usePs();
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (moves: { id: string; position: number }[]) => (await ps()).movePages(moves), onSuccess: () => void qc.invalidateQueries({ queryKey: ['pages'] }) });
}
export function useDeleteClassPage() {
  const ps = usePs();
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (id: string) => (await ps()).deleteClassPage(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['pages'] }) });
}
