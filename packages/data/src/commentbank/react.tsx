/** Hook ngân hàng nhận xét (khóa react-query 'commentBank'). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '../react';
import { getCommentBankSource, type BankAdd, type BankLevel } from './source';

export function useCommentBankList(enabled = true) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['commentBank'], queryFn: () => getCommentBankSource(ds).list(), enabled, staleTime: 60_000 });
}
function useBankMutation<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries({ queryKey: ['commentBank'] }) });
}
export function useAddToBank() {
  const ds = useDataSource();
  return useBankMutation((items: BankAdd[]) => getCommentBankSource(ds).add(items));
}
export function useUpdateBankComment() {
  const ds = useDataSource();
  return useBankMutation((v: { id: string; text?: string; level?: BankLevel | null; shared?: boolean }) => getCommentBankSource(ds).update(v.id, v));
}
export function useDeleteBankComment() {
  const ds = useDataSource();
  return useBankMutation((id: string) => getCommentBankSource(ds).remove(id));
}
