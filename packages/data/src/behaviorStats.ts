/**
 * Thống kê thi đua (docs/THI_DUA.md) — hàm thuần: bảng vinh danh, thống kê từng HS, lịch sử ghi nhận.
 * Đầu vào: nhật kí hành vi trong đợt (tuần / tháng / học kì — dùng periodRange của báo cáo bài giao).
 */
import type { Behavior, BehaviorLog, ClassInfo, Profile } from '@openedu/contracts';

export interface BehaviorCount { behaviorId: string; label: string; icon: string; points: number; count: number }
export interface StudentBehaviorStats {
  studentId: string;
  name: string;
  points: number;
  positive: number;
  needsWork: number;
  /** Số lần ghi nhận theo hành vi, nhiều nhất trước. */
  byBehavior: BehaviorCount[];
  /** Hạng trong lớp (bằng điểm thì cùng hạng). */
  rank: number;
  /** Chênh lệch điểm so với đợt trước (nếu có dữ liệu đợt trước). */
  delta?: number;
  lastAt?: string;
}
export interface ClassBehaviorStats {
  students: StudentBehaviorStats[];
  teams: { id: string; name: string; color: string; points: number; positive: number; needsWork: number }[];
  totals: { logs: number; positive: number; needsWork: number; points: number };
  /** Hành vi được ghi nhiều nhất cả lớp. */
  topBehaviors: BehaviorCount[];
}

export function classBehaviorStats(input: {
  cls: Pick<ClassInfo, 'id' | 'teams'>;
  students: Pick<Profile, 'id' | 'name'>[];
  behaviors: Behavior[];
  logs: BehaviorLog[];
  /** Nhật kí đợt trước (để tính tăng / giảm). */
  prevLogs?: BehaviorLog[];
}): ClassBehaviorStats {
  const bmap = new Map(input.behaviors.map((b) => [b.id, b]));
  const logs = input.logs.filter((l) => l.classId === input.cls.id);
  const count = (list: BehaviorLog[]): BehaviorCount[] => {
    const m = new Map<string, BehaviorCount>();
    for (const l of list) {
      const b = bmap.get(l.behaviorId);
      const c = m.get(l.behaviorId) ?? { behaviorId: l.behaviorId, label: b?.label ?? 'Hành vi đã xóa', icon: b?.icon ?? '•', points: b?.points ?? l.points, count: 0 };
      c.count++;
      m.set(l.behaviorId, c);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.points - a.points);
  };
  const prev = new Map<string, number>();
  for (const l of input.prevLogs ?? []) if (l.classId === input.cls.id) prev.set(l.studentId, (prev.get(l.studentId) ?? 0) + l.points);
  const rows = input.students.map((s) => {
    const mine = logs.filter((l) => l.studentId === s.id);
    const points = mine.reduce((t, l) => t + l.points, 0);
    return {
      studentId: s.id, name: s.name, points,
      positive: mine.filter((l) => l.points > 0).length,
      needsWork: mine.filter((l) => l.points < 0).length,
      byBehavior: count(mine),
      rank: 0,
      ...(input.prevLogs ? { delta: points - (prev.get(s.id) ?? 0) } : {}),
      ...(mine.length ? { lastAt: mine.reduce((a, l) => (l.at > a ? l.at : a), mine[0]!.at) } : {}),
    } as StudentBehaviorStats;
  });
  rows.sort((a, b) => b.points - a.points || b.positive - a.positive || a.needsWork - b.needsWork || a.name.localeCompare(b.name, 'vi'));
  rows.forEach((r, i) => { r.rank = i > 0 && r.points === rows[i - 1]!.points ? rows[i - 1]!.rank : i + 1; });
  const teams = input.cls.teams.map((t) => {
    const mine = logs.filter((l) => t.studentIds.includes(l.studentId));
    return { id: t.id, name: t.name, color: t.color, points: mine.reduce((s, l) => s + l.points, 0), positive: mine.filter((l) => l.points > 0).length, needsWork: mine.filter((l) => l.points < 0).length };
  }).sort((a, b) => b.points - a.points);
  return {
    students: rows,
    teams,
    totals: { logs: logs.length, positive: logs.filter((l) => l.points > 0).length, needsWork: logs.filter((l) => l.points < 0).length, points: logs.reduce((t, l) => t + l.points, 0) },
    topBehaviors: count(logs),
  };
}

/**
 * Bảng vinh danh: tối đa `n` em có điểm DƯƠNG cao nhất (bằng điểm ở vị trí cuối thì lấy cả các em cùng điểm).
 * Không vinh danh em 0 điểm / điểm âm.
 */
export function honorBoard(stats: ClassBehaviorStats, n = 10): StudentBehaviorStats[] {
  const pos = stats.students.filter((s) => s.points > 0);
  if (pos.length <= n) return pos;
  const cut = pos[n - 1]!.points;
  return pos.filter((s, i) => i < n || s.points === cut);
}
