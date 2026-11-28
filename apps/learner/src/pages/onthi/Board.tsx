/** Bảng xếp hạng một bài luyện: 10 bạn đầu + vị trí của em. */
import type { MascotId, OnThiBoard, OnThiBoardRow } from '@openedu/contracts';
import { useOnThiBoard } from '@openedu/data';
import { Mascot } from '@openedu/ui';
import { fmtScore, fmtTime } from './shared';

export function BoardList({ setId, meId, maxScore }: { setId: string; meId: string; maxScore?: number }) {
  const q = useOnThiBoard(setId);
  if (q.isPending) return <p className="k-muted">Đang tải bảng xếp hạng…</p>;
  if (q.isError) return <p className="k-muted">Chưa tải được bảng xếp hạng.</p>;
  return <BoardView board={q.data} meId={meId} maxScore={maxScore} />;
}

export function BoardView({ board, meId, maxScore }: { board: OnThiBoard; meId: string; maxScore?: number }) {
  if (board.hidden) return <p className="k-muted">Thầy/cô chưa mở bảng xếp hạng cho bài này.</p>;
  if (!board.rows.length) return <p className="k-muted">Chưa bạn nào nộp bài. Em là người đầu tiên nhé!</p>;
  const meIn = board.rows.some((r) => r.studentId === meId);
  return (
    <div className="ln-ot-board">
      <ol className="ln-ot-board__list" aria-label="Bảng xếp hạng">
        {board.rows.map((r) => <Row key={r.studentId} r={r} me={r.studentId === meId} maxScore={maxScore} />)}
      </ol>
      {!meIn && board.me ? (
        <>
          <p className="ln-ot-board__gap" aria-hidden="true">⋯</p>
          <ol className="ln-ot-board__list"><Row r={board.me} me maxScore={maxScore} /></ol>
        </>
      ) : null}
      <p className="ln-ot-board__note">Xếp theo điểm, rồi đến thời gian làm bài, rồi số câu sai. {board.total} bạn đã có điểm.</p>
    </div>
  );
}

function Row({ r, me, maxScore }: { r: OnThiBoardRow; me: boolean; maxScore?: number }) {
  return (
    <li className={`ln-ot-board__row${me ? ' is-me' : ''}${r.rank <= 3 ? ` is-top${r.rank}` : ''}`}>
      <span className="ln-ot-board__rank">{r.rank}</span>
      <Mascot id={(r.mascot ?? 'nghe') as MascotId} size={36} title="" />
      <span className="ln-ot-board__name">{r.name}{me ? ' (em)' : ''}{r.className ? <small> · {r.className}</small> : null}</span>
      <span className="ln-ot-board__score"><b>{fmtScore(r.score)}</b>{maxScore ? <small>/{fmtScore(maxScore)}</small> : null}</span>
      <span className="ln-ot-board__time">{fmtTime(r.durationMs)}</span>
    </li>
  );
}
