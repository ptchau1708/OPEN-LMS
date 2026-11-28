import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Grade, ItemType, OnThiService, OnThiSetInput, OnThiStyle } from '@openedu/contracts';
import { useDataSource } from '../react';
import { getOnThiService } from './service';

export function useOnThiService(): OnThiService {
  return getOnThiService(useDataSource());
}

export const onThiKeys = {
  all: ['onthi'] as const,
  sets: (f?: { style?: OnThiStyle; grade?: Grade }) => ['onthi', 'sets', f ?? {}] as const,
  report: (id?: string) => ['onthi', 'report', id] as const,
  cards: (style: OnThiStyle) => ['onthi', 'cards', style] as const,
  board: (id?: string) => ['onthi', 'board', id] as const,
  result: (id?: string) => ['onthi', 'result', id] as const,
  types: (style: OnThiStyle) => ['onthi', 'types', style] as const,
};

/* Thầy/cô */
export function useOnThiSets(filter?: { style?: OnThiStyle; grade?: Grade }) {
  const s = useOnThiService();
  return useQuery({ queryKey: onThiKeys.sets(filter), queryFn: () => s.listSets(filter) });
}
export function useSaveOnThiSet() {
  const s = useOnThiService();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (x: OnThiSetInput) => s.saveSet(x), onSuccess: () => qc.invalidateQueries({ queryKey: onThiKeys.all }) });
}
export function useDeleteOnThiSet() {
  const s = useOnThiService();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => s.deleteSet(id), onSuccess: () => qc.invalidateQueries({ queryKey: onThiKeys.all }) });
}
export function useOnThiReport(id?: string) {
  const s = useOnThiService();
  return useQuery({ queryKey: onThiKeys.report(id), queryFn: () => s.report(id as string), enabled: !!id, refetchInterval: 30_000 });
}

/* Học sinh */
export function useOnThiCards(style: OnThiStyle) {
  const s = useOnThiService();
  return useQuery({ queryKey: onThiKeys.cards(style), queryFn: () => s.myCards(style) });
}
export function useOnThiBoard(id?: string, enabled = true) {
  const s = useOnThiService();
  return useQuery({ queryKey: onThiKeys.board(id), queryFn: () => s.board(id as string), enabled: !!id && enabled });
}
export function useOnThiResult(attemptId?: string) {
  const s = useOnThiService();
  return useQuery({ queryKey: onThiKeys.result(attemptId), queryFn: () => s.result(attemptId as string), enabled: !!attemptId, staleTime: Infinity });
}
export function useOnThiPracticeTypes(style: OnThiStyle) {
  const s = useOnThiService();
  return useQuery({ queryKey: onThiKeys.types(style), queryFn: () => s.practiceTypes(style) });
}
export function usePracticeItems(style: OnThiStyle, type?: ItemType) {
  const s = useOnThiService();
  return useQuery({ queryKey: ['onthi', 'practice', style, type], queryFn: () => s.practiceItems(style, type as ItemType), enabled: !!type, staleTime: Infinity, gcTime: 0 });
}
