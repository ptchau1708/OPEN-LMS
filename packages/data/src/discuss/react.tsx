/** Hook Phòng thảo luận (khóa bắt đầu bằng 'discuss'). */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '../react';
import { getDiscussSource } from './source';
import type { DiscussionInput, DiscussionReaction, NewDiscussionPost } from './types';

function useSrc() {
  const ds = useDataSource();
  return () => getDiscussSource(ds);
}

export function useDiscussions(classId?: string | null) {
  const src = useSrc();
  return useQuery({ queryKey: ['discuss', 'list', classId], queryFn: async () => (await src()).listDiscussions(classId as string), enabled: !!classId });
}
export function useDiscussionStats(classId?: string | null) {
  const src = useSrc();
  return useQuery({ queryKey: ['discuss', 'stats', classId], queryFn: async () => (await src()).stats(classId as string), enabled: !!classId, refetchInterval: 30_000 });
}
export function useDiscussion(id?: string) {
  const src = useSrc();
  return useQuery({ queryKey: ['discuss', 'one', id], queryFn: async () => (await src()).getDiscussion(id as string), enabled: !!id });
}
/** Bài của một phòng: tự cập nhật khi có thay đổi (Realtime / bản demo), dự phòng tải lại 20 giây một lần. */
export function useDiscussionPosts(id?: string) {
  const src = useSrc();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['discuss', 'posts', id], queryFn: async () => (await src()).listPosts(id as string), enabled: !!id, refetchInterval: 20_000 });
  useEffect(() => {
    if (!id) return;
    let off: (() => void) | undefined;
    let t: ReturnType<typeof setTimeout> | undefined;
    let dead = false;
    void src().then((s) => {
      if (dead) return;
      off = s.subscribe(id, () => {
        clearTimeout(t);
        t = setTimeout(() => void qc.invalidateQueries({ queryKey: ['discuss'] }), 300);
      });
    });
    return () => { dead = true; clearTimeout(t); off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, qc]);
  return q;
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['discuss'] });
}
export function useSaveDiscussion() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (i: DiscussionInput) => (await src()).saveDiscussion(i), onSuccess: inv });
}
export function useDeleteDiscussion() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (id: string) => (await src()).deleteDiscussion(id), onSuccess: inv });
}
export function usePostDiscussion() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (p: NewDiscussionPost) => (await src()).post(p), onSuccess: inv });
}
export function useEditDiscussionPost() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (v: { id: string; body: string }) => (await src()).editPost(v.id, v.body), onSuccess: inv });
}
export function useRemoveMyPost() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (id: string) => (await src()).removeMyPost(id), onSuccess: inv });
}
export function useModeratePosts() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (v: { ids: string[]; status: 'visible' | 'hidden' | 'pending' }) => (await src()).moderate(v.ids, v.status), onSuccess: inv });
}
export function useReactPost() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (v: { postId: string; kind: DiscussionReaction }) => (await src()).react(v.postId, v.kind), onSuccess: inv });
}
export function useReportPost() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (v: { postId: string; reason: string }) => (await src()).report(v.postId, v.reason), onSuccess: inv });
}
export function useDiscussionWords(classId?: string | null) {
  const src = useSrc();
  return useQuery({ queryKey: ['discuss', 'words', classId], queryFn: async () => (await src()).listWords(classId as string), enabled: !!classId });
}
export function useAddDiscussionWord() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (v: { classId: string; word: string }) => (await src()).addWord(v.classId, v.word), onSuccess: inv });
}
export function useRemoveDiscussionWord() {
  const src = useSrc();
  const inv = useInvalidate();
  return useMutation({ mutationFn: async (id: string) => (await src()).removeWord(id), onSuccess: inv });
}
