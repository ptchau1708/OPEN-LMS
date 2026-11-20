/** Thẻ "Bài kiểm tra" trên trang Hôm nay (tải lười cùng trang làm bài để giữ JS ban đầu nhỏ). */
import { useNavigate } from 'react-router';
import type { ExamStudentCard } from '@openedu/contracts';
import { useMyExams } from '@openedu/data';
import { Card, Icon, sfx } from '@openedu/ui';
import { dueLabel, useMe } from '../../lib/util';
import './exam.css';

function sub(c: ExamStudentCard): string {
  if (c.state === 'upcoming') return `Mở lúc ${new Date(c.openAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`;
  if (c.state === 'in-progress') return 'Em đang làm dở — bấm để làm tiếp';
  if (c.state === 'submitted') return c.resultReady ? 'Đã nộp · Xem điểm' : 'Đã nộp · Cô sẽ báo điểm sau';
  if (c.state === 'closed') return 'Đã hết hạn làm bài';
  return `${c.questions} câu · ${c.durationMin} phút · ${dueLabel(c.closeAt).text}${c.canRetake ? ' · Được làm lại' : ''}`;
}

export default function ExamCards() {
  const me = useMe();
  const nav = useNavigate();
  const q = useMyExams(me.id);
  const list = q.data ?? [];
  if (!list.length) return null;
  return (
    <>
      <h2 className="ln-h2 ln-section-h ln-ex-h">Bài kiểm tra</h2>
      <div className="ln-tasks">
        {list.map((c) => {
          const go = c.state !== 'upcoming' && c.state !== 'closed';
          return (
            <Card key={c.examId} interactive={go} onClick={go ? () => { sfx.tap(); nav(`/kiem-tra/${c.examId}`); } : undefined}
              className={`ln-task ln-ex-card ln-ex-card--${c.state}`} aria-label={`Bài kiểm tra: ${c.title}. ${sub(c)}`}>
              <span className="ln-ex-card__tile" aria-hidden="true"><Icon name={c.state === 'submitted' ? 'check' : 'clock'} size={32} strokeWidth={2.4} /></span>
              <span className="ln-task__body">
                <span className="ln-task__title">{c.title}</span>
                <span className="ln-task__sub">{sub(c)}</span>
              </span>
              {go ? <span className="ln-task__go" aria-hidden="true"><Icon name={c.state === 'submitted' ? 'eye' : 'play'} size={28} strokeWidth={2.6} /></span> : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}
