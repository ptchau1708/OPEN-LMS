import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '../react';
import { getNotesSource } from './source';
import type { StudentNoteInput } from './types';

export function useStudentNotes(studentId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['studentNotes', studentId], queryFn: () => getNotesSource(ds).list(studentId as string), enabled: !!studentId });
}
export function useSaveStudentNote() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (n: StudentNoteInput) => getNotesSource(ds).save(n), onSuccess: (n) => void qc.invalidateQueries({ queryKey: ['studentNotes', n.studentId] }) });
}
export function useDeleteStudentNote() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; studentId: string }) => getNotesSource(ds).remove(v.id), onSuccess: (_r, v) => void qc.invalidateQueries({ queryKey: ['studentNotes', v.studentId] }) });
}
export function useImportStudentNotes() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (list: StudentNoteInput[]) => getNotesSource(ds).bulkCreate(list), onSuccess: () => void qc.invalidateQueries({ queryKey: ['studentNotes'] }) });
}
