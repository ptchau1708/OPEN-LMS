import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Item, LiveResponse, LiveState } from '@openedu/contracts';
import { displayOptions } from '@openedu/activity-engine';
import { BigScreenSlide, latestPerStudent } from '@openedu/lesson-player';
import { gameLeaderboard, gameQuestionSlides, gameTeamBoard, GAME_MODE_LABEL, PAPER_LETTERS, type GameRankRow } from '@openedu/data';
import { Confetti, QrCode, TimerRing, sfx } from '@openedu/ui';
import { findItem, firstName, formatPin, joinUrls, slideItemId, timerTotal, useVmin } from './util';

const TILE = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
const SHAPE = ['▲', '◆', '●', '■'];
const fmt = (n: number) => n.toLocaleString('vi-VN');

function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!on) return; const t = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(t); }, [on]);
  return now;
}

export default function GameStage({ state, items, responses }: { state: LiveState; items: Record<string, Item>; responses: LiveResponse[] }) {
  const game = state.game!;
  const vmin = useVmin();
  const all = { ...items, ...(state.items ?? {}) };
  const qs = gameQuestionSlides(state.lesson);
  const qNo = qs.indexOf(state.slideIndex);
  const slide = state.lesson?.slides[state.slideIndex];
  const inQ = qNo >= 0 && (state.phase === 'activity-open' || state.phase === 'activity-closed' || state.phase === 'reveal');
  const item = inQ ? findItem(state.activeItemId ?? slideItemId(slide), all, state.lesson) : undefined;
  const board = gameLeaderboard(state);
  const { full } = joinUrls(state.pin);

  const head = (
    <header className="pr-hud pr-ghud">
      {game.mode !== 'paper' ? (
        <div className="pr-corner" aria-label="Vào lớp muộn">
          <QrCode value={full} size={110} className="pr-corner__qr" title="Quét mã để vào chơi" />
          <div className="pr-corner__txt"><span className="pr-corner__l">Mã vào chơi</span><strong className="pr-corner__pin">{formatPin(state.pin)}</strong></div>
        </div>
      ) : <div className="pr-ghud__mode">🃏 Thẻ giấy</div>}
      <div className="pr-hud__mid">
        <span className="pr-hud__title">{state.lesson?.title}</span>
        {qNo >= 0 && game.mode !== 'self' ? <span className="pr-hud__page">Câu {qNo + 1}/{qs.length}</span> : <span className="pr-hud__page">{GAME_MODE_LABEL[game.mode].name}</span>}
      </div>
      <div className="pr-hud__right">
        {inQ && state.phase === 'activity-open' && state.timerEndsAt ? <TimerRing key={state.timerEndsAt} endsAt={state.timerEndsAt} totalSeconds={timerTotal(state.timerEndsAt)} size={Math.round(vmin * 11)} /> : null}
      </div>
    </header>
  );

  if (game.mode === 'self') return <div className="pr-stage pr-game">{head}<SelfBoard state={state} rows={board} total={qs.length} /></div>;
  if (game.board) return <div className="pr-stage pr-game">{head}<Leaderboard rows={board} gains={game.lastGain} teams={gameTeamBoard(state)} /></div>;

  if (!inQ || !item) {
    return (
      <div className="pr-stage pr-game">
        {head}
        <div className="pr-center">
          <h1 className="pr-ready">{qNo < 0 ? 'Sẵn sàng chưa nào?' : `Câu ${qNo + 1}`}</h1>
          <p className="pr-center__p">{game.mode === 'paper' ? 'Chuẩn bị thẻ: xoay chữ em chọn lên trên, giơ thẻ thẳng, không che mã.' : 'Nhìn lên bảng, chọn đáp án trên máy của em!'}</p>
        </div>
      </div>
    );
  }

  const opts = displayOptions(item);
  const answered = game.mode === 'paper'
    ? Object.keys(game.paper?.[String(state.slideIndex)] ?? {}).length
    : latestPerStudent(item, responses.filter((r) => r.itemId === item.id && r.slideIndex === state.slideIndex)).length;
  const players = game.mode === 'paper' ? (game.cards ?? []).length : state.participants.length;

  if (!opts || opts.length > 4 || item.type === 'POLL') {
    return (
      <div className="pr-stage pr-game">
        {head}
        <div className="pr-slide">{slide ? <BigScreenSlide slide={slide} items={all} state={state} responses={responses} /> : null}</div>
        <p className="pr-gcount"><b>{answered}</b>/{players} đã trả lời</p>
      </div>
    );
  }

  const reveal = state.phase === 'reveal';
  const key = item.key as { correct?: string } | undefined;
  const counts: Record<string, number> = {};
  if (game.mode === 'paper') {
    const ans = game.paper?.[String(state.slideIndex)] ?? {};
    for (const l of Object.values(ans)) {
      const o = opts[PAPER_LETTERS.indexOf(l as (typeof PAPER_LETTERS)[number])];
      if (o) counts[o.id] = (counts[o.id] ?? 0) + 1;
    }
  } else {
    for (const r of latestPerStudent(item, responses.filter((x) => x.itemId === item.id && x.slideIndex === state.slideIndex))) {
      const c = (r.response as { choice?: string } | undefined)?.choice;
      if (c) counts[c] = (counts[c] ?? 0) + 1;
    }
  }
  const maxCount = Math.max(1, ...Object.values(counts));

  return (
    <div className="pr-stage pr-game">
      {head}
      <h1 className="pr-gq">{item.prompt.text}</h1>
      {item.prompt.image ? <img className="pr-gq__img" src={item.prompt.image} alt="" /> : null}
      {reveal ? (
        <div className="pr-gbars" aria-label="Số bạn chọn mỗi đáp án">
          {opts.map((o, i) => (
            <div key={o.id} className={`pr-gbar${key?.correct === o.id ? ' is-ok' : ''}`} style={{ '--tile': TILE[i] } as CSSProperties}>
              <span className="pr-gbar__n">{counts[o.id] ?? 0}</span>
              <i style={{ height: `${((counts[o.id] ?? 0) / maxCount) * 100}%` }} />
              <span className="pr-gbar__l">{PAPER_LETTERS[i]}{key?.correct === o.id ? ' ✓' : ''}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="pr-gcount" role="status"><b>{answered}</b>/{players} {game.mode === 'paper' ? 'đã quét' : 'đã trả lời'}</p>
      )}
      <ul className="pr-gtiles">
        {opts.map((o, i) => (
          <li key={o.id} className={`pr-gtile${reveal ? (key?.correct === o.id ? ' is-ok' : ' is-dim') : ''}`} style={{ '--tile': TILE[i] } as CSSProperties}>
            <span className="pr-gtile__k" aria-hidden="true">{game.mode === 'paper' ? PAPER_LETTERS[i] : SHAPE[i]}</span>
            {o.image ? <img src={o.image} alt="" /> : null}
            <span className="pr-gtile__t">{game.mode === 'paper' ? '' : `${PAPER_LETTERS[i]}. `}{o.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Leaderboard({ rows, gains, teams }: { rows: GameRankRow[]; gains?: Record<string, number>; teams: { id: string; name: string; color: string; points: number }[] }) {
  return (
    <main className="pr-lb" data-testid="tv-leaderboard">
      <h1 className="pr-lb__h">🏆 Bảng xếp hạng</h1>
      {teams.length ? <p className="pr-lb__teams">{teams.map((t) => <span key={t.id} style={{ '--team': t.color } as CSSProperties}>{t.name}: <b>{fmt(t.points)}</b></span>)}</p> : null}
      <ol className="pr-lb__list">
        {rows.slice(0, 10).map((r) => (
          <li key={r.userId} className={r.rank <= 3 && r.points > 0 ? `is-top${r.rank}` : ''}>
            <span className="pr-lb__rank">{r.rank <= 3 && r.points > 0 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
            <span className="pr-lb__name">{r.name}{r.streak >= 2 ? <em> 🔥{r.streak}</em> : null}</span>
            {gains?.[r.userId] ? <span className="pr-lb__gain">+{fmt(gains[r.userId])}</span> : null}
            <span className="pr-lb__pts">{fmt(r.points)}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}

function SelfBoard({ state, rows, total }: { state: LiveState; rows: GameRankRow[]; total: number }) {
  const g = state.game!;
  const now = useNow(!!g.endsAt);
  const leftMin = g.endsAt ? Math.max(0, Math.ceil((Date.parse(g.endsAt) - now) / 1000)) : null;
  const finished = rows.filter((r) => r.done >= total && total > 0).length;
  return (
    <main className="pr-lb pr-self" data-testid="tv-self">
      <h1 className="pr-lb__h">{g.startedAt ? '🚀 Đang thi đua' : 'Vào chơi bằng mã ở góc trên nhé!'}</h1>
      <p className="pr-self__meta">
        {rows.length} bạn · {finished} bạn đã xong
        {leftMin !== null ? <> · còn <b>{Math.floor(leftMin / 60)}:{String(leftMin % 60).padStart(2, '0')}</b></> : null}
      </p>
      <ol className="pr-lb__list">
        {rows.slice(0, 10).map((r) => (
          <li key={r.userId} className={r.rank <= 3 && r.points > 0 ? `is-top${r.rank}` : ''}>
            <span className="pr-lb__rank">{r.rank <= 3 && r.points > 0 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
            <span className="pr-lb__name">{firstName(r.name)}</span>
            <span className="pr-self__bar"><i style={{ width: `${total ? (r.done / total) * 100 : 0}%` }} /></span>
            <span className="pr-lb__pts">{fmt(r.points)}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}

/** Màn kết thúc của trò chơi: bục 3 bạn dẫn đầu + top 10. */
export function GameEnded({ state }: { state: LiveState }) {
  const rows = gameLeaderboard(state);
  const top = rows.filter((r) => r.points > 0).slice(0, 3);
  const [burst, setBurst] = useState(true);
  const played = useRef(false);
  useEffect(() => {
    if (!played.current) {
      played.current = true;
      try { sfx.fanfare(); } catch { /* bỏ qua */ }
    }
    const t = window.setInterval(() => setBurst((b) => !b), 3500);
    return () => window.clearInterval(t);
  }, []);
  const podium = [top[1], top[0], top[2]];
  return (
    <main className="pr-end pr-gend" data-testid="tv-podium">
      <Confetti show={burst} durationMs={3200} count={56} />
      <h1 className="pr-end__title">🏆 {state.lesson?.title ?? 'Đố vui'}</h1>
      {top.length ? (
        <ol className="pr-podium">
          {podium.map((r, i) => (r ? (
            <li key={r.userId} className={`pr-podium__col is-${r.rank}`} style={{ '--team': ['#c0c0c0', '#f5b700', '#cd7f32'][i] } as CSSProperties}>
              <span className="pr-podium__name">{firstName(r.name)}</span>
              <span className="pr-podium__pts">{fmt(r.points)}</span>
              <span className="pr-podium__block">{r.rank}</span>
            </li>
          ) : null))}
        </ol>
      ) : <p className="pr-end__sub">Cảm ơn cả lớp đã tham gia!</p>}
      {rows.length > 3 ? (
        <ol className="pr-lb__list pr-gend__rest" start={4}>
          {rows.slice(3, 10).map((r) => (
            <li key={r.userId}><span className="pr-lb__rank">{r.rank}</span><span className="pr-lb__name">{r.name}</span><span className="pr-lb__pts">{fmt(r.points)}</span></li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}
