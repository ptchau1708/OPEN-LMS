/** Đấu trường (HS): giờ mở cửa, các giải của em, bảng xếp hạng top 10. */
import { useNavigate } from 'react-router';
import type { ArenaMode } from '@openedu/contracts';
import { hoursText, nextOpening, openingText, useArenaAccess, useArenaBoard, useCups } from '@openedu/data';
import { Button, Icon, Mascot } from '@openedu/ui';
import { useMe } from '../../lib/util';
import { cupMyLine } from './CupPage';
import './arena.css';

export interface ArenaGate {
  loading: boolean;
  /** Đóng / tắt: lí do hiện cho em. */
  closed: null | { title: string; text: string };
  /** Lớp chỉ dùng câu GV đưa vào: tập mã câu. */
  pool: Set<string> | null;
}

/** Đấu trường của lớp em có mở cho kiểu chơi này không (lỗi máy chủ / chưa chạy SQL 22 → coi như mở). */
export function useArenaGate(mode?: ArenaMode): ArenaGate {
  const q = useArenaAccess();
  const a = q.data;
  if (!a) return { loading: q.isPending && !q.isError, closed: null, pool: null };
  const pool = a.settings.source === 'picked' ? new Set(a.settings.itemIds) : null;
  if (!a.open) {
    if (a.reason === 'off') return { loading: false, closed: { title: 'Đấu trường đang tạm đóng', text: 'Thầy cô đang tạm đóng Đấu trường. Em vẫn xem được giải đấu và bảng xếp hạng nhé!' }, pool };
    const next = nextOpening(a.settings.hours);
    return { loading: false, closed: { title: 'Đấu trường đang nghỉ', text: `Giờ mở cửa: ${hoursText(a.settings.hours)}.${next ? ` Mở lại lúc ${openingText(next)}.` : ''}` }, pool };
  }
  if (mode && !a.settings.modes.includes(mode)) {
    return { loading: false, closed: { title: mode === 'duel' ? 'Đấu 1–1 đang tạm tắt' : 'Leo tháp đang tạm tắt', text: 'Thầy cô đang tạm tắt phần chơi này. Em thử phần khác nhé!' }, pool };
  }
  return { loading: false, closed: null, pool };
}

export function ArenaClosedNote({ gate }: { gate: ArenaGate }) {
  if (!gate.closed) return null;
  return (
    <div className="ln-arena-closed" role="status" data-testid="arena-closed">
      <Icon name="clock" size={26} />
      <div><b>{gate.closed.title}</b><p>{gate.closed.text}</p></div>
    </div>
  );
}

export function CupStrip() {
  const me = useMe();
  const nav = useNavigate();
  const q = useCups(undefined, { live: true });
  const list = (q.data ?? []).filter((c) => c.status !== 'cancelled');
  if (!list.length) return null;
  return (
    <section className="ln-cupstrip" aria-label="Giải đấu" data-testid="cup-strip">
      <h2 className="ln-h2">🏆 Giải đấu</h2>
      {list.map((c) => {
        const line = cupMyLine(c, me.id);
        return (
          <article key={c.id} className={`ln-cupcard${line.cta ? ' is-hot' : ''}`} onClick={() => nav(`/choi/giai/${c.id}`)} data-testid="cup-card">
            <div className="ln-cupcard__body">
              <h3>{c.title}</h3>
              <p>{line.text}</p>
            </div>
            <Button size="lg" variant={line.cta ? 'primary' : 'secondary'} icon={<Icon name={line.cta ? 'play' : 'next'} size={22} />}
              onClick={(e) => { e.stopPropagation(); nav(`/choi/giai/${c.id}`); }}>{line.cta ?? 'Xem'}</Button>
          </article>
        );
      })}
    </section>
  );
}

export function BoardCard() {
  const me = useMe();
  const q = useArenaBoard();
  const b = q.data;
  if (!b || (!b.rows.length && !b.me)) return null;
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}`);
  const meIn = b.rows.some((r) => r.userId === me.id);
  return (
    <section className="ln-board" aria-label="Bảng xếp hạng" data-testid="arena-board">
      <h2 className="ln-h2">Bảng xếp hạng{b.seasonTitle ? ` · ${b.seasonTitle}` : ''}</h2>
      {b.rows.length ? (
        <ol className="ln-board__list">
          {b.rows.map((r) => (
            <li key={r.userId} className={r.userId === me.id ? 'is-me' : undefined}>
              <span className="ln-board__rank">{medal(r.rank)}</span>
              <Mascot id={r.mascot} size={34} title="" />
              <span className="ln-board__name">{r.userId === me.id ? 'Em' : r.name}</span>
              <b>{r.points}</b>
            </li>
          ))}
        </ol>
      ) : <p className="k-muted">Chưa bạn nào có điểm. Đấu ngay để lên bảng nhé!</p>}
      {b.me && !meIn ? (
        <p className="ln-board__me" data-testid="board-me">
          {b.me.points > 0 ? <>Em đứng thứ <b>{b.me.rank}</b> với <b>{b.me.points}</b> điểm. Cố lên để vào top 10 nhé!</> : 'Em chưa có điểm mùa này. Thắng một trận để lên bảng nhé!'}
        </p>
      ) : null}
    </section>
  );
}
