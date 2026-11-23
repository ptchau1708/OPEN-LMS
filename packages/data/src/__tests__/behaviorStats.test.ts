import { describe, expect, it } from 'vitest';
import type { Behavior, BehaviorLog } from '@openedu/contracts';
import { classBehaviorStats, honorBoard } from '../behaviorStats';

const B: Behavior[] = [
  { id: 'phat-bieu', classId: 'c', label: 'Hăng hái phát biểu', points: 1, icon: '🙋', kind: 'positive' },
  { id: 'giup-ban', classId: 'c', label: 'Giúp đỡ bạn', points: 2, icon: '🤝', kind: 'positive' },
  { id: 'quen', classId: 'c', label: 'Quên đồ dùng', points: -1, icon: '🎒', kind: 'needs-work' },
];
let n = 0;
const log = (sid: string, b: string, pts: number): BehaviorLog => ({ id: `l${++n}`, studentId: sid, classId: 'c', behaviorId: b, points: pts, at: `2026-11-2${n % 5}T02:00:00Z`, by: 't' });
const students = Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, name: `HS ${String(i).padStart(2, '0')}` }));

describe('thống kê thi đua', () => {
  const logs = [
    log('s0', 'giup-ban', 2), log('s0', 'phat-bieu', 1), log('s0', 'phat-bieu', 1),
    log('s1', 'giup-ban', 2), log('s1', 'quen', -1),
    log('s2', 'phat-bieu', 1),
    log('s3', 'quen', -1), log('s3', 'quen', -1),
    ...Array.from({ length: 9 }, (_, i) => log(`s${4 + i}`, 'phat-bieu', 1)),
  ];
  const st = classBehaviorStats({ cls: { id: 'c', teams: [{ id: 't1', name: 'Tổ 1', color: '#f00', studentIds: ['s0', 's1'] }] }, students, behaviors: B, logs, prevLogs: [log('s0', 'phat-bieu', 1)] });

  it('điểm, số lần, hành vi nổi bật, so với đợt trước', () => {
    const s0 = st.students.find((s) => s.studentId === 's0')!;
    expect(s0).toMatchObject({ points: 4, positive: 3, needsWork: 0, rank: 1, delta: 3 });
    expect(s0.byBehavior[0]).toMatchObject({ label: 'Hăng hái phát biểu', count: 2 });
    expect(st.students.find((s) => s.studentId === 's3')).toMatchObject({ points: -2, needsWork: 2 });
    expect(st.teams[0]).toMatchObject({ points: 5, positive: 4, needsWork: 1 });
    expect(st.totals).toMatchObject({ logs: 17, positive: 14, needsWork: 3 });
  });

  it('bằng điểm thì cùng hạng', () => {
    const ones = st.students.filter((s) => s.points === 1);
    expect(new Set(ones.map((s) => s.rank)).size).toBe(1);
  });

  it('vinh danh 10 em điểm dương; bằng điểm ở vị trí cuối thì lấy đủ; không vinh danh điểm âm / 0', () => {
    const h = honorBoard(st, 10);
    expect(h.length).toBe(12); // 2 em đầu + 10 em cùng 1 điểm
    expect(h.every((s) => s.points > 0)).toBe(true);
    expect(honorBoard(st, 1).map((s) => s.studentId)).toEqual(['s0']);
  });
});
