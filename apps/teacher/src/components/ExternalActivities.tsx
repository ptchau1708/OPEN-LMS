import { activityRatio, summarizeExternal, useExternalActivities, type ExternalActivity } from '@openedu/data';
import { fmtDateTime } from '../lib/format';

const KIND_LABEL: Record<string, string> = { reading: 'Đọc hiểu', quiz: 'Trắc nghiệm', game: 'Trò chơi', writing: 'Luyện viết', math: 'Toán', other: 'Khác' };

function fmtDur(sec: number | null): string {
  if (sec == null) return '–';
  if (sec < 60) return `${sec} giây`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}
function fmtResult(a: ExternalActivity): string {
  const parts: string[] = [];
  if (a.correct != null && a.total != null) parts.push(`${a.correct}/${a.total} câu đúng`);
  if (a.score != null) parts.push(a.maxScore != null ? `${a.score}/${a.maxScore} điểm` : `${a.score} điểm`);
  if (!parts.length) parts.push(a.completed ? 'Đã làm xong' : '–');
  return parts.join(' · ') + (a.completed ? '' : ' (chưa xong)');
}

/**
 * Hồ sơ học sinh: "Hoạt động ở ứng dụng khác" — kết quả do app ngoài gửi về (docs/KET_NOI_APP_NGOAI.md).
 * Ẩn khi không có dòng nào. Số liệu này do app ngoài tự báo: hiển thị riêng, không tính vào mức thành thạo hay sao.
 */
export function ExternalActivitiesCard({ studentId }: { studentId?: string }) {
  const q = useExternalActivities(studentId, 30);
  const list = q.data ?? [];
  if (!list.length) return null;
  const sum = summarizeExternal(list);
  return (
    <section className="tc-card" data-testid="external-activities">
      <header className="tc-card__head"><h2>Hoạt động ở ứng dụng khác</h2><span className="tc-muted tc-small">Do ứng dụng ngoài gửi về · không tính vào mức thành thạo và sao</span></header>
      <div className="tc-stats" style={{ gridTemplateColumns: `repeat(${Math.min(sum.length, 4)}, minmax(0, 1fr))` }}>
        {sum.map((s) => (
          <div key={s.appId}>
            <strong>{s.appName}</strong>
            <span>{s.count} lượt{s.avgPercent != null ? ` · đúng trung bình ${s.avgPercent}%` : ''}{s.totalSec ? ` · ${fmtDur(s.totalSec)}` : ''}</span>
          </div>
        ))}
      </div>
      <div className="tc-tablewrap">
        <table className="tc-table">
          <thead><tr><th>Ứng dụng</th><th>Bài</th><th>Kết quả</th><th>Thời gian làm</th><th>Lúc</th></tr></thead>
          <tbody>
            {list.map((a) => {
              const r = activityRatio(a);
              return (
                <tr key={a.id}>
                  <td>{a.appName}</td>
                  <td><strong>{a.title || a.activityId || '(không tên)'}</strong> <span className="tc-chip">{KIND_LABEL[a.kind] ?? a.kind}</span></td>
                  <td>{fmtResult(a)}{r != null ? <span className="tc-muted"> · {Math.round(r * 100)}%</span> : null}</td>
                  <td>{fmtDur(a.durationSec)}</td>
                  <td className="tc-muted">{fmtDateTime(a.at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
