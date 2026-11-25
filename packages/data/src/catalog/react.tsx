/** Hook danh mục mở (khóa react-query bắt đầu bằng 'catalog'). */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applySkillOverrides, applySubjectOverrides, type Grade, type SkillOverride, type SubjectId, type SubjectOverrides } from '@openedu/contracts';
import { useDataSource } from '../react';
import { useSchoolSettings } from '../school/react';
import { getCatalogSource, type SkillInput } from './source';

const CACHE_SKILLS = 'oe.catalog.skills.v1';
const CACHE_SUBJECTS = 'oe.catalog.subjects.v1';
const readCache = <T,>(k: string): T | null => { try { const r = globalThis.localStorage?.getItem(k); return r ? (JSON.parse(r) as T) : null; } catch { return null; } };
const writeCache = (k: string, v: unknown) => { try { globalThis.localStorage?.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };

const CatalogVersion = createContext(0);
/** Số phiên bản danh mục — component dùng SKILLS / SUBJECTS trong lúc vẽ gọi hook này để vẽ lại khi danh mục đổi. */
export function useCatalogVersion(): number { return useContext(CatalogVersion); }

let cacheApplied = false;
/** Áp bản đã lưu trên máy ngay (đồng bộ) — gọi trước lần vẽ đầu. */
export function applyCachedCatalog(): void {
  if (cacheApplied) return;
  cacheApplied = true;
  const sk = readCache<SkillOverride[]>(CACHE_SKILLS);
  if (sk?.length) applySkillOverrides(sk);
  const su = readCache<SubjectOverrides>(CACHE_SUBJECTS);
  if (su) applySubjectOverrides(su);
}

export function useSkillOverrides(enabled = true) {
  const ds = useDataSource();
  return useQuery({ queryKey: ['catalog', 'skills'], queryFn: () => getCatalogSource(ds).listSkillOverrides(), enabled, staleTime: 5 * 60_000, retry: 1 });
}

/**
 * Áp danh mục mở (kĩ năng + môn học của trường) cho toàn ứng dụng. Đặt bên trong DataSourceProvider + QueryClientProvider,
 * sau khi đăng nhập. Vẽ ngay với bản đã lưu trên máy; tải xong bản mới thì áp lại và làm mới các dữ liệu đang hiện.
 */
export function CatalogGate({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  useState(() => { applyCachedCatalog(); return 0; });
  const qc = useQueryClient();
  const skills = useSkillOverrides(enabled);
  const school = useSchoolSettings({ enabled });
  const [ver, setVer] = useState(0);
  const last = useRef({ skills: JSON.stringify(readCache(CACHE_SKILLS) ?? []), subjects: JSON.stringify(readCache(CACHE_SUBJECTS) ?? {}) });

  useEffect(() => {
    if (!skills.data) return;
    const key = JSON.stringify(skills.data);
    if (key === last.current.skills) return;
    last.current.skills = key;
    applySkillOverrides(skills.data);
    writeCache(CACHE_SKILLS, skills.data);
    setVer((v) => v + 1);
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'catalog' });
  }, [skills.data, qc]);

  const subj = school.data?.subjects;
  useEffect(() => {
    if (!school.data) return;
    const key = JSON.stringify(subj ?? {});
    if (key === last.current.subjects) return;
    last.current.subjects = key;
    applySubjectOverrides(subj ?? {});
    writeCache(CACHE_SUBJECTS, subj ?? {});
    setVer((v) => v + 1);
  }, [school.data, subj]);

  return <CatalogVersion.Provider value={ver}>{children}</CatalogVersion.Provider>;
}

function useCatalogMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries({ queryKey: ['catalog', 'skills'] }) });
}
export function useSaveSkill() {
  const ds = useDataSource();
  return useCatalogMutation((i: SkillInput) => getCatalogSource(ds).saveSkill(i));
}
export function useSetSkillHidden() {
  const ds = useDataSource();
  return useCatalogMutation((v: { code: string; hidden: boolean }) => getCatalogSource(ds).setSkillHidden(v.code, v.hidden));
}
export function useRestoreSkill() {
  const ds = useDataSource();
  return useCatalogMutation((code: string) => getCatalogSource(ds).restoreSkill(code));
}
export function useDeleteSkill() {
  const ds = useDataSource();
  return useCatalogMutation((code: string) => getCatalogSource(ds).deleteSkill(code));
}

/** Một việc khi nhập danh mục kĩ năng từ Excel (xem planSkillsImport). */
export interface SkillsBatchOp {
  kind: 'add' | 'edit' | 'hide' | 'show';
  code: string;
  subject?: SubjectId;
  grade?: Grade;
  topic: string;
  short: string;
  text: string;
  /** add / edit: đặt luôn trạng thái ẩn / hiện. */
  hidden?: boolean;
  row?: number;
}

/** Áp nhiều thay đổi danh mục kĩ năng (lần lượt; lỗi dòng nào báo dòng đó, không dừng cả lô). */
export function useApplySkillsBatch() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { ops: SkillsBatchOp[]; onProgress?: (done: number, total: number) => void }) => {
      const src = getCatalogSource(ds);
      const failed: { op: SkillsBatchOp; error: string }[] = [];
      let done = 0;
      for (const op of v.ops) {
        try {
          if (op.kind === 'add' || op.kind === 'edit') {
            await src.saveSkill({ code: op.code, ...(op.kind === 'add' ? { subject: op.subject, grade: op.grade } : {}), topic: op.topic, short: op.short, text: op.text });
          }
          const hide = op.kind === 'hide' ? true : op.kind === 'show' ? false : op.hidden;
          if (hide !== undefined) await src.setSkillHidden(op.code, hide);
        } catch (e) {
          failed.push({ op, error: e instanceof Error ? e.message : String(e) });
        }
        v.onProgress?.(++done, v.ops.length);
      }
      return { done, failed };
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['catalog', 'skills'] }),
  });
}
