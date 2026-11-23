/** Hook React Query cho Phase 6 (khóa bắt đầu bằng 'rewards6'). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GrantTeacherBadgeInput, OutfitSlot, SetGardenGoalInput, ShopState } from '@openedu/contracts';
import { qk, useDataSource } from '../react';
import { getRewardsSource } from './source';

export const rewardKeys = {
  shelf: (userId?: string) => ['rewards6', 'shelf', userId] as const,
  shop: (userId?: string) => ['rewards6', 'shop', userId] as const,
  garden: (classId?: string) => ['rewards6', 'garden', classId] as const,
  teacherBadges: (classId?: string) => ['rewards6', 'teacherBadges', classId] as const,
};

function useRs() {
  const ds = useDataSource();
  return () => getRewardsSource(ds);
}

export function useBadgeShelf(userId?: string) {
  const rs = useRs();
  return useQuery({ queryKey: rewardKeys.shelf(userId), queryFn: async () => (await rs()).getBadgeShelf(userId as string), enabled: !!userId });
}
/** Xét huy hiệu (gọi khi sao thay đổi / mở app). */
export function useEvaluateBadges() {
  const rs = useRs();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => (await rs()).evaluateBadges(userId),
    onSuccess: (_list, userId) => void qc.invalidateQueries({ queryKey: rewardKeys.shelf(userId) }),
  });
}
export function useMarkBadgesSeen() {
  const rs = useRs();
  return useMutation({ mutationFn: async (v: { userId: string; ids: string[] }) => (await rs()).markBadgesSeen(v.userId, v.ids) });
}
export function useGrantTeacherBadge() {
  const rs = useRs();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: GrantTeacherBadgeInput) => (await rs()).grantTeacherBadge(v),
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: rewardKeys.teacherBadges(v.classId) }),
  });
}
export function useTeacherBadges(classId?: string) {
  const rs = useRs();
  return useQuery({ queryKey: rewardKeys.teacherBadges(classId), queryFn: async () => (await rs()).listTeacherBadges(classId as string), enabled: !!classId });
}

export function useShop(userId?: string) {
  const rs = useRs();
  return useQuery({ queryKey: rewardKeys.shop(userId), queryFn: async () => (await rs()).getShop(userId as string), enabled: !!userId });
}
function useShopMutation<V>(fn: (v: V) => Promise<ShopState>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (s) => {
      qc.setQueryData(rewardKeys.shop(s.userId), s);
      void qc.invalidateQueries({ queryKey: qk.wallet(s.userId) });
      void qc.invalidateQueries({ queryKey: ['rewards', s.userId] });
    },
  });
}
export function useBuyItem() {
  const rs = useRs();
  return useShopMutation(async (v: { userId: string; itemId: string }) => (await rs()).buyItem(v.userId, v.itemId));
}
export function useEquipItem() {
  const rs = useRs();
  return useShopMutation(async (v: { userId: string; slot: OutfitSlot; itemId: string | null }) => (await rs()).equipItem(v.userId, v.slot, v.itemId));
}

export function useClassGarden(classId?: string, opts: { refetchMs?: number; display?: 'tv'; tvKey?: string } = {}) {
  const rs = useRs();
  return useQuery({
    queryKey: [...rewardKeys.garden(classId), opts.display ?? null, opts.tvKey ?? null],
    queryFn: async () => (await rs()).getClassGarden(classId as string, { ...(opts.display ? { display: opts.display } : {}), ...(opts.tvKey ? { tvKey: opts.tvKey } : {}) }),
    enabled: !!classId,
    ...(opts.refetchMs ? { refetchInterval: opts.refetchMs } : {}),
  });
}
/** Khóa TV của lớp → link màn hình lớp không cần đăng nhập. */
export function useGardenTvKey() {
  const rs = useRs();
  return useMutation({
    mutationFn: async (v: { classId: string; renew?: boolean }) => {
      const src = await rs();
      if (!src.gardenTvKey) throw new Error('Chưa hỗ trợ link TV.');
      return src.gardenTvKey(v.classId, v.renew);
    },
  });
}

export function useSetGardenGoal() {
  const rs = useRs();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: SetGardenGoalInput) => (await rs()).setGardenGoal(v),
    onSuccess: (g) => { qc.setQueryData([...rewardKeys.garden(g.classId), null, null], g); void qc.invalidateQueries({ queryKey: rewardKeys.garden(g.classId) }); },
  });
}
