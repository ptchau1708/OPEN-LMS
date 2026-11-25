/** Hook React Query cho Phase 5 (khóa bắt đầu bằng 'school'). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTeacherInput, Grade, ParentRegisterInput, ReportRange, Role, SaveClassInput, SchoolSettings, SchoolSource, SubjectId } from '@openedu/contracts';
import { qk, useDataSource } from '../react';
import { getSchoolSource } from './source';

export const schoolKeys = {
  all: ['school'] as const,
  codes: (classId?: string) => ['school', 'codes', classId] as const,
  links: (classId?: string) => ['school', 'links', classId] as const,
  digest: (childId?: string, weekStart?: string) => ['school', 'digest', childId, weekStart ?? null] as const,
  overview: (range?: ReportRange) => ['school', 'overview', range ?? {}] as const,
  gradeHeatmap: (grade?: Grade, subject?: SubjectId) => ['school', 'gradeHeatmap', grade, subject ?? 'toan'] as const,
  settings: ['school', 'settings'] as const,
  users: (f?: { role?: Role; classId?: string }) => ['school', 'users', f ?? {}] as const,
};

export function useSchoolSource(): SchoolSource {
  return getSchoolSource(useDataSource());
}

/* ---- mã liên kết & phụ huynh ---- */
export function useGuardianCodes(classId?: string) {
  const s = useSchoolSource();
  return useQuery({ queryKey: schoolKeys.codes(classId), queryFn: () => s.listGuardianCodes(classId as string), enabled: !!classId });
}
export function useCreateGuardianCodes() {
  const s = useSchoolSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { classId: string; studentIds?: string[] }) => s.createGuardianCodes(v.classId, v.studentIds),
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: schoolKeys.codes(v.classId) }),
  });
}
export function useRevokeGuardianCode() {
  const s = useSchoolSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (code: string) => s.revokeGuardianCode(code), onSuccess: () => void qc.invalidateQueries({ queryKey: ['school', 'codes'] }) });
}
export function useGuardianLinks(classId?: string) {
  const s = useSchoolSource();
  return useQuery({ queryKey: schoolKeys.links(classId), queryFn: () => s.listGuardianLinks(classId as string), enabled: !!classId });
}
export function useRevokeGuardianLink() {
  const s = useSchoolSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { parentId: string; studentId: string }) => s.revokeGuardianLink(v.parentId, v.studentId),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['school', 'links'] });
      void qc.invalidateQueries({ queryKey: qk.children(v.parentId) });
    },
  });
}
export function useRegisterParent() {
  const s = useSchoolSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ParentRegisterInput) => s.registerParent(v),
    onSuccess: (p) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      qc.setQueryData(qk.me, p);
    },
  });
}
export function useRedeemGuardianCode() {
  const s = useSchoolSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => s.redeemGuardianCode(code),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['children'] }),
  });
}
export function useParentDigest(childId?: string, weekStart?: string) {
  const s = useSchoolSource();
  return useQuery({ queryKey: schoolKeys.digest(childId, weekStart), queryFn: () => s.getParentDigest(childId as string, weekStart), enabled: !!childId });
}

/* ---- báo cáo ---- */
export function useSchoolOverview(range?: ReportRange, enabled = true) {
  const s = useSchoolSource();
  return useQuery({ queryKey: schoolKeys.overview(range), queryFn: () => s.getSchoolOverview(range), enabled });
}
export function useGradeHeatmap(grade?: Grade, subject?: SubjectId) {
  const s = useSchoolSource();
  return useQuery({ queryKey: schoolKeys.gradeHeatmap(grade, subject), queryFn: () => s.getGradeHeatmap(grade as Grade, subject), enabled: !!grade });
}

/* ---- quản trị ---- */
export function useSchoolSettings(opts: { enabled?: boolean } = {}) {
  const s = useSchoolSource();
  return useQuery({ queryKey: schoolKeys.settings, queryFn: () => s.getSchoolSettings(), enabled: opts.enabled ?? true });
}
export function useSaveSchoolSettings() {
  const s = useSchoolSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: SchoolSettings) => s.saveSchoolSettings(v), onSuccess: () => void qc.invalidateQueries({ queryKey: schoolKeys.all }) });
}
export function useSchoolUsers(filter?: { role?: Role; classId?: string }) {
  const s = useSchoolSource();
  return useQuery({ queryKey: schoolKeys.users(filter), queryFn: () => s.listSchoolUsers(filter) });
}
function invalidateRoster(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: schoolKeys.all });
  void qc.invalidateQueries({ queryKey: ['classes'] });
  void qc.invalidateQueries({ queryKey: ['class'] });
  void qc.invalidateQueries({ queryKey: ['students'] });
  void qc.invalidateQueries({ queryKey: qk.demoUsers });
}
export function useSaveClass() {
  const s = useSchoolSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: SaveClassInput) => s.saveClass(v), onSuccess: () => invalidateRoster(qc) });
}
export function useCreateTeacher() {
  const s = useSchoolSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: CreateTeacherInput) => s.createTeacher(v), onSuccess: () => invalidateRoster(qc) });
}
export function useBulkCreateStudents() {
  const s = useSchoolSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { classId: string; names: string[] }) => s.bulkCreateStudents(v.classId, v.names), onSuccess: () => invalidateRoster(qc) });
}
export function useResetPassword() {
  const s = useSchoolSource();
  return useMutation({ mutationFn: (userId: string) => s.resetPassword(userId) });
}
