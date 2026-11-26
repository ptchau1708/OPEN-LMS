/** Chiếu nhánh đấu lên TV / máy chiếu (toàn màn hình, tự cập nhật mỗi 5 giây). */
import { useParams } from 'react-router';
import { roundName, useCup } from '@openedu/data';
import { ErrorNote, Loading } from '../../components/common';
import { Bracket, cupInfoLine, fmtTime, Podium } from './shared';
import '../../styles/arena.css';

export default function CupTv() {
  const { id } = useParams();
  const q = useCup(id, true);
  if (q.isLoading) return <div className="tc-app theme-pro tc-center"><Loading /></div>;
  if (!q.data) return <div className="tc-app theme-pro tc-center"><ErrorNote error={q.error ?? new Error('Không tìm thấy giải đấu.')} /></div>;
  const c = q.data;
  const closes = c.matches.find((m) => m.round === c.round && m.status === 'open')?.closesAt;
  return (
    <div className="tc-app theme-pro tc-cuptv" data-testid="cup-tv-screen">
      <header className="tc-cuptv__head">
        <h1>🏆 {c.title}</h1>
        <p>{cupInfoLine(c)}</p>
        {c.status === 'running' ? <p className="tc-cuptv__now">{roundName(c.round, c.rounds)}{closes ? ` · đóng lúc ${fmtTime(closes)}` : ''}</p> : null}
        {c.status === 'signup' ? <p className="tc-cuptv__now">Bắt đầu lúc {fmtTime(c.startAt)}</p> : null}
      </header>
      <Podium cup={c} />
      <Bracket cup={c} big />
    </div>
  );
}
