/** Hook trang Phụ huynh (khóa react-query bắt đầu bằng 'parenthub'). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ParentPostInput, ParentShareSettings, ReviewKind } from '@openedu/contracts';
import { useDataSource } from '../react';
import { getParentHub } from './source';

export function useParentShare(classId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['parenthub', 'share', classId], queryFn: () => getParentHub(ds).getSettings(classId as string), enabled: !!classId });
}
export function useSaveParentShare() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { classId: string; patch: Partial<Pick<ParentShareSettings, 'modes' | 'msgEnabled' | 'msgFrom' | 'msgTo'>> }) => getParentHub(ds).saveSettings(v.classId, v.patch),
    onSuccess: (s) => {
      qc.setQueryData(['parenthub', 'share', s.classId], s);
      void qc.invalidateQueries({ queryKey: ['parenthub', 'queue', s.classId] });
      void qc.invalidateQueries({ queryKey: ['parenthub', 'preview'] });
    },
  });
}
export function useParentQueue(classId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['parenthub', 'queue', classId], queryFn: () => getParentHub(ds).queue(classId as string, 30), enabled: !!classId });
}
export function useReleaseItems() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { items: { kind: ReviewKind; refId: string }[]; state: 'sent' | 'skipped'; note?: string }) => getParentHub(ds).release(v.items, v.state, v.note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parenthub', 'queue'] });
      void qc.invalidateQueries({ queryKey: ['parenthub', 'preview'] });
    },
  });
}
export function useParentPreview(studentId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['parenthub', 'preview', studentId], queryFn: () => getParentHub(ds).preview(studentId as string), enabled: !!studentId });
}
export function useParentPosts(classId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['parenthub', 'posts', classId], queryFn: () => getParentHub(ds).listPosts(classId as string), enabled: !!classId, refetchInterval: 60_000 });
}
export function useParentPostDetail(id?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['parenthub', 'post', id], queryFn: () => getParentHub(ds).postDetail(id as string), enabled: !!id });
}
export function useCreateParentPost() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: ParentPostInput) => getParentHub(ds).createPost(i),
    onSuccess: (p) => void qc.invalidateQueries({ queryKey: ['parenthub', 'posts', p.classId] }),
  });
}
export function useRecallParentPost() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getParentHub(ds).recallPost(id),
    onSuccess: (p) => { void qc.invalidateQueries({ queryKey: ['parenthub', 'posts', p.classId] }); void qc.invalidateQueries({ queryKey: ['parenthub', 'post', p.id] }); },
  });
}
export function useRemindParentPost() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getParentHub(ds).remindPost(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['parenthub', 'posts'] }),
  });
}
export function useParentThreads(classId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['parenthub', 'threads', classId], queryFn: () => getParentHub(ds).threads(classId as string), enabled: !!classId, refetchInterval: 30_000 });
}
export function useParentThread(studentId?: string) {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['parenthub', 'thread', studentId],
    queryFn: async () => {
      const t = await getParentHub(ds).thread(studentId as string);
      // Mở trò chuyện = đã đọc → chuông và danh sách cập nhật.
      void qc.invalidateQueries({ queryKey: ['notify', 'list'] });
      void qc.invalidateQueries({ queryKey: ['parenthub', 'threads'] });
      return t;
    },
    enabled: !!studentId,
    refetchInterval: 15_000,
  });
}
export function useSendParentMessage() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { studentId: string; body: string; postId?: string }) => getParentHub(ds).send(v.studentId, v.body, v.postId),
    onSuccess: (_m, v) => {
      void qc.invalidateQueries({ queryKey: ['parenthub', 'thread', v.studentId] });
      void qc.invalidateQueries({ queryKey: ['parenthub', 'threads'] });
      void qc.invalidateQueries({ queryKey: ['parenthub', 'inbox'] });
    },
  });
}
export function useRemoveParentMessage() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getParentHub(ds).removeMessage(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['parenthub', 'thread'] }),
  });
}
export function useParentInbox(childId?: string, enabled = true) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['parenthub', 'inbox', childId], queryFn: () => getParentHub(ds).inbox(childId as string), enabled: !!childId && enabled, refetchInterval: 60_000 });
}
export function useReadParentPost() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { postId: string; ack?: boolean }) => getParentHub(ds).readPost(v.postId, v.ack),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['parenthub', 'inbox'] }); void qc.invalidateQueries({ queryKey: ['notify', 'list'] }); },
  });
}
