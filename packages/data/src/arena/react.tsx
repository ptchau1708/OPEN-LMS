/** Hook Đấu trường (khóa react-query bắt đầu bằng 'arena'). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArenaSettings, CupInput } from '@openedu/contracts';
import { useDataSource } from '../react';
import { getArenaSource } from './source';

export function useArenaAccess(enabled = true) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['arena', 'access'], queryFn: () => getArenaSource(ds).access(), enabled, staleTime: 30_000, refetchInterval: 60_000 });
}
export function useArenaSettings(classId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['arena', 'settings', classId], queryFn: () => getArenaSource(ds).getSettings(classId as string), enabled: !!classId });
}
export function useSaveArenaSettings() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { classId: string; patch: Partial<Omit<ArenaSettings, 'classId'>> }) => getArenaSource(ds).saveSettings(v.classId, v.patch),
    onSuccess: (s) => { qc.setQueryData(['arena', 'settings', s.classId], s); void qc.invalidateQueries({ queryKey: ['arena', 'access'] }); },
  });
}
export function useAddToArenaPool() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { classId: string; itemIds: string[] }) => getArenaSource(ds).addToPool(v.classId, v.itemIds),
    onSuccess: (_n, v) => void qc.invalidateQueries({ queryKey: ['arena', 'settings', v.classId] }),
  });
}

export function useCups(classId?: string, opts: { enabled?: boolean; live?: boolean } = {}) {
  const ds = useDataSource();
  return useQuery({
    queryKey: ['arena', 'cups', classId ?? ''], queryFn: () => getArenaSource(ds).listCups(classId),
    enabled: opts.enabled ?? true, refetchInterval: opts.live ? 15_000 : false,
  });
}
export function useCup(id?: string, live = false) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['arena', 'cup', id], queryFn: () => getArenaSource(ds).getCup(id as string), enabled: !!id, refetchInterval: live ? 5_000 : false });
}
export function useCreateCup() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: CupInput) => getArenaSource(ds).createCup(i),
    onSuccess: (c) => { qc.setQueryData(['arena', 'cup', c.id], c); void qc.invalidateQueries({ queryKey: ['arena', 'cups'] }); },
  });
}

export type CupAction =
  | { kind: 'start' } | { kind: 'close' } | { kind: 'cancel' } | { kind: 'delete' } | { kind: 'done' }
  | { kind: 'winner'; round: number; slot: number; userId: string }
  | { kind: 'player'; userId: string; inCup: boolean }
  | { kind: 'join'; inCup: boolean };

/** Các thao tác trên một giải (GV: bắt đầu, đóng vòng, chọn người thắng, huỷ, xoá, thêm / bớt HS; HS: đăng kí). */
export function useCupAction(id?: string) {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: CupAction) => {
      const s = getArenaSource(ds);
      const cid = id as string;
      switch (a.kind) {
        case 'start': return s.startCup(cid);
        case 'close': return s.closeRound(cid);
        case 'cancel': return s.cancelCup(cid);
        case 'delete': await s.deleteCup(cid); return null;
        case 'done': return s.done(cid);
        case 'winner': return s.setWinner(cid, a.round, a.slot, a.userId);
        case 'player': return s.setPlayer(cid, a.userId, a.inCup);
        case 'join': return s.joinCup(cid, a.inCup);
      }
    },
    onSuccess: (c) => {
      if (c) qc.setQueryData(['arena', 'cup', c.id], c);
      else qc.removeQueries({ queryKey: ['arena', 'cup', id] });
      void qc.invalidateQueries({ queryKey: ['arena', 'cups'] });
      void qc.invalidateQueries({ queryKey: ['arena', 'board'] });
    },
  });
}

export function useArenaBoard(classId?: string, enabled = true) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['arena', 'board', classId ?? ''], queryFn: () => getArenaSource(ds).board(classId), enabled });
}
export function useEndSeason() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { classId: string; title?: string }) => getArenaSource(ds).endSeason(v.classId, v.title),
    onSuccess: (_s, v) => {
      void qc.invalidateQueries({ queryKey: ['arena', 'board'] });
      void qc.invalidateQueries({ queryKey: ['arena', 'seasons', v.classId] });
      void qc.invalidateQueries({ queryKey: ['arena', 'settings', v.classId] });
    },
  });
}
export function useArenaSeasons(classId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['arena', 'seasons', classId], queryFn: () => getArenaSource(ds).seasons(classId as string), enabled: !!classId });
}
