import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClassInfo, DataSource } from '@openedu/contracts';

export interface TeamDef { id: string; name: string; color: string; studentIds: string[] }

export const TEAM_COLORS = ['#ff8a3d', '#2f7bf6', '#20a974', '#8b5cf6', '#ff5d8f', '#0ea5a4', '#e8485f', '#64748b'];
const DEFAULT_NAMES = ['Tổ Mặt Trời', 'Tổ Cầu Vồng', 'Tổ Ngôi Sao', 'Tổ Mây Xanh'];

export function defaultTeams(n: number, prefix = 'tm'): TeamDef[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i + 1}`, name: DEFAULT_NAMES[i] ?? `Tổ ${i + 1}`, color: TEAM_COLORS[i], studentIds: [] }));
}

interface TeamsStore {
  byClass: Record<string, TeamDef[]>;
  set: (classId: string, teams: TeamDef[]) => void;
}
/** Tổ của lớp lưu trên máy GV (DataSource chưa có hàm lưu lớp). */
export const useTeamsStore = create<TeamsStore>()(
  persist((set) => ({ byClass: {}, set: (classId, teams) => set((s) => ({ byClass: { ...s.byClass, [classId]: teams } })) }), { name: 'openedu-teacher:teams' }),
);

/** Tổ hiện dùng của lớp: bản trên máy, nếu chưa có thì lấy từ dữ liệu lớp. */
export function teamsFor(cls: ClassInfo | undefined | null, local: Record<string, TeamDef[]>): TeamDef[] {
  if (!cls) return [];
  return local[cls.id] ?? cls.teams.map((t) => ({ ...t, studentIds: [...t.studentIds] }));
}

type ClassSaver = { saveClass?: (c: ClassInfo) => Promise<ClassInfo>; updateClassTeams?: (id: string, teams: ClassInfo['teams']) => Promise<unknown> };
export function canPersistTeams(ds: DataSource): boolean {
  const x = ds as DataSource & ClassSaver;
  return typeof x.saveClass === 'function' || typeof x.updateClassTeams === 'function';
}
export async function persistTeams(ds: DataSource, cls: ClassInfo, teams: TeamDef[]): Promise<void> {
  const x = ds as DataSource & ClassSaver;
  if (typeof x.updateClassTeams === 'function') await x.updateClassTeams(cls.id, teams);
  else if (typeof x.saveClass === 'function') await x.saveClass({ ...cls, teams });
}
