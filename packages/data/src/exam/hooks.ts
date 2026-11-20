import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Exam, ExamFilter, ExamMatrix, ExamService } from '@openedu/contracts';
import { useDataSource } from '../react';
import { getExamService } from './service';

export function useExamService(): ExamService {
  return getExamService(useDataSource());
}

export const examKeys = {
  matrices: ['exam', 'matrices'] as const,
  exams: (f?: ExamFilter) => ['exam', 'list', f ?? {}] as const,
  exam: (id?: string) => ['exam', 'one', id] as const,
  report: (id?: string) => ['exam', 'report', id] as const,
  mine: (u?: string) => ['exam', 'mine', u] as const,
  result: (id?: string) => ['exam', 'result', id] as const,
};

export function useExamMatrices() {
  const s = useExamService();
  return useQuery({ queryKey: examKeys.matrices, queryFn: () => s.listMatrices() });
}

export function useSaveMatrix() {
  const s = useExamService();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (m: ExamMatrix) => s.saveMatrix(m), onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.matrices }) });
}

export function useDeleteMatrix() {
  const s = useExamService();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => s.deleteMatrix(id), onSuccess: () => qc.invalidateQueries({ queryKey: examKeys.matrices }) });
}

export function useExams(filter?: ExamFilter) {
  const s = useExamService();
  return useQuery({ queryKey: examKeys.exams(filter), queryFn: () => s.listExams(filter) });
}

export function useExam(id?: string) {
  const s = useExamService();
  return useQuery({ queryKey: examKeys.exam(id), queryFn: () => s.getExam(id as string), enabled: !!id });
}

export function useSaveExam() {
  const s = useExamService();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (e: Exam) => s.saveExam(e), onSuccess: () => qc.invalidateQueries({ queryKey: ['exam'] }) });
}

export function useDeleteExam() {
  const s = useExamService();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => s.deleteExam(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['exam'] }) });
}

export function useExamReport(id?: string) {
  const s = useExamService();
  return useQuery({ queryKey: examKeys.report(id), queryFn: () => s.getReport(id as string), enabled: !!id, refetchInterval: 20_000 });
}

export function useReleaseResults() {
  const s = useExamService();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => s.releaseResults(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['exam'] }) });
}

export function useAllowRetake() {
  const s = useExamService();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { examId: string; studentId: string }) => s.allowRetake(v.examId, v.studentId), onSuccess: () => qc.invalidateQueries({ queryKey: ['exam'] }) });
}

/** Đề của HS cho trang Hôm nay. */
export function useMyExams(studentId?: string) {
  const s = useExamService();
  return useQuery({ queryKey: examKeys.mine(studentId), queryFn: () => s.listMyExams(studentId as string), enabled: !!studentId, staleTime: 15_000 });
}

export function useMyExamResult(examId?: string) {
  const s = useExamService();
  return useQuery({ queryKey: examKeys.result(examId), queryFn: () => s.getMyResult(examId as string), enabled: !!examId });
}
