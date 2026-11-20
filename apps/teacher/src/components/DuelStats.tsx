import { useDuelStats } from '@openedu/data';

/** Đấu trường · Đấu 1–1: số trận, tỉ lệ thắng (chỉ đọc). */
export function DuelStatsBlock({ studentId }: { studentId?: string }) {
  const q = useDuelStats(studentId);
  const s = q.data;
  return (
    <>
      <h3 className="tc-h3">Đấu trường · Đấu 1–1</h3>
      {q.isError ? <p className="tc-muted tc-small">Chưa tải được thống kê Đấu 1–1.</p> : (
        <div className="tc-stats tc-stats--3">
          <div><strong>{s ? s.played : '…'}</strong><span>trận đã đấu</span></div>
          <div><strong>{s ? s.wins : '…'}</strong><span>trận thắng</span></div>
          <div><strong>{s ? (s.played ? `${Math.round(s.winRate * 100)}%` : '—') : '…'}</strong><span>tỉ lệ thắng</span></div>
        </div>
      )}
    </>
  );
}
