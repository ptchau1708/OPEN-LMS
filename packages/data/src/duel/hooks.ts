import { useQuery } from '@tanstack/react-query';
import type { DuelService } from '@openedu/contracts';
import { useDataSource } from '../react';
import { getDuelService } from './service';

export function useDuelService(): DuelService {
  return getDuelService(useDataSource());
}

/** Thống kê Đấu 1–1 của một HS (số trận, tỉ lệ thắng) — dùng ở hồ sơ HS bên app GV. */
export function useDuelStats(userId: string | undefined) {
  const svc = useDuelService();
  return useQuery({ queryKey: ['duelStats', userId], queryFn: () => svc.getStats(userId as string), enabled: !!userId, staleTime: 60_000 });
}
