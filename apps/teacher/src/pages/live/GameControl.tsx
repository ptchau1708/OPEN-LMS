import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { ClassInfo, Item, Lesson, LiveCommand, LiveGameMode, LiveResponse, Profile } from '@openedu/contracts';
import { displayOptions, scoreItem } from '@openedu/activity-engine';
import { Icon, QrCode } from '@openedu/ui';
import {
  bridge, GAME_MODE_LABEL, gameLeaderboard, gamePlayers, gameQuestionSlides, gameResponseKey, gameTeamBoard, firstPerStudent, PAPER_LETTERS,
  paperCardsFor, paperFriendly, slideItemIdOf, tallyClassQuestion, tallyPaperQuestion, tallySelfResponses, useAward, type GameRankRow, type LiveChannelView,
} from '@openedu/data';
import { Btn, ConfirmBar, ErrorNote, Seg } from '../../components/common';
import { useRoster } from '../../lib/assess';
import { learnerUrl, presentUrl } from '../../lib/env';
import { cx } from '../../lib/format';
import { PaperScanner } from './PaperScanner';

function useNow(on: boolean, ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!on) return; const t = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(t); }, [on, ms]);
  return now;
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

/** Chữ A–D của đáp án đúng theo thứ tự hiển thị trên TV (displayOptions). null: không phải câu chọn 1 đáp án. */
export function correctLetterOf(item: Item | undefined): string | null {
  if (!item || !paperFriendly(item) || !item.key) return null;
  const opts = displayOptions(item) ?? [];
  const k = (item.key as { correct?: string }).correct;
  const i = opts.findIndex((o) => o.id === k);
  return i >= 0 ? PAPER_LETTERS[i] ?? null : null;
}

function localCorrect(item: Item | undefined, r: LiveResponse): boolean | undefined {
  if (typeof r.correct === 'boolean') return r.correct;
  if (!item || item.key == null) return undefined;
  try {
    const s = scoreItem(item, r.response);
    return s.graded ? s.correct : undefined;
  } catch {
    return undefined;
  }
}

export function GameControl({ user, view, lesson, items, cls }: { user: Profile; view: LiveChannelView; lesson: Lesson | null; items: Record<string, Item>; cls?: ClassInfo }) {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { channel, state, status, error } = view;
  const { roster, isLoading: rosterLoading } = useRoster(cls);
  const award = useAward();
  const [sendErr, setSendErr] = useState<unknown>(null);
  const [toast, setToast] = useState('');
  const [ending, setEnding] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [selfMinutes, setSelfMinutes] = useState(0);
  const [awarded, setAwarded] = useState(false);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 2200); return () => window.clearTimeout(t); }, [toast]);

  const send = useCallback((cmd: LiveCommand) => {
    if (!channel) return Promise.resolve();
    setSendErr(null);
    return channel.send(cmd).catch((e: unknown) => setSendErr(e));
  }, [channel]);

  /* ---------- cài đặt trò chơi (lần đầu, theo ?choi=) ---------- */
  const setupMode = params.get('choi') as LiveGameMode | null;
  const setupSeconds = Number(params.get('giay') ?? 20);
  const setupSent = useRef(false);
  useEffect(() => {
    if (!state || state.game || setupSent.current || !channel) return;
    if (setupMode !== 'class' && setupMode !== 'self' && setupMode !== 'paper') return;
    if (setupMode === 'paper' && (rosterLoading || !roster.length)) return;
    setupSent.current = true;
    void send({ type: 'game-setup', game: { mode: setupMode, seconds: Number.isFinite(setupSeconds) ? setupSeconds : 20, ...(setupMode === 'paper' ? { cards: paperCardsFor(roster) } : {}) } });
  }, [state, channel, setupMode, setupSeconds, roster, rosterLoading, send]);

  const game = state?.game;
  const questions = useMemo(() => gameQuestionSlides(lesson).map((slideIndex) => ({ slideIndex, itemId: slideItemIdOf(lesson, slideIndex) ?? '' })).filter((q) => q.itemId), [lesson]);
  const qIdx = state ? questions.findIndex((q) => q.slideIndex === state.slideIndex) : -1;
  const q = qIdx >= 0 ? questions[qIdx] : undefined;
  const item = q ? items[q.itemId] ?? lesson?.slides[q.slideIndex]?.item : undefined;
  const players = state ? gamePlayers(state) : [];
  const board: GameRankRow[] = state ? gameLeaderboard(state) : [];
  const teams = state ? gameTeamBoard(state) : [];

  /* ---------- câu trả lời: thời điểm máy GV nhận được ---------- */
  const seenAt = useRef<Record<string, number>>({});
  const allResponses: LiveResponse[] = channel && game && game.mode !== 'paper' ? questions.flatMap((x) => channel.responses(x.slideIndex)) : [];
  const nowMs = Date.now();
  for (const r of allResponses) {
    const k = gameResponseKey(r);
    if (seenAt.current[k] === undefined) seenAt.current[k] = nowMs;
  }
  const isCorrect = useCallback((r: LiveResponse) => {
    const qq = questions.find((x) => x.slideIndex === r.slideIndex);
    return localCorrect(qq ? items[qq.itemId] : undefined, r);
  }, [questions, items]);

  const curResponses = q ? firstPerStudent(allResponses, q.itemId, q.slideIndex, seenAt.current) : [];
  const paperAns = q && game?.paper ? game.paper[String(q.slideIndex)] ?? {} : {};
  const answeredCount = game?.mode === 'paper' ? Object.keys(paperAns).length : curResponses.length;

  const phase = state?.phase;
  const timerOn = phase === 'activity-open' && !!state?.timerEndsAt;
  const now = useNow(timerOn || (game?.mode === 'self' && !!game.endsAt), 300);
  const left = state?.timerEndsAt ? Math.max(0, Math.ceil((Date.parse(state.timerEndsAt) - now) / 1000)) : null;

  /* ---------- class / paper: điều khiển từng câu ---------- */
  const tallyCurrent = useCallback(async () => {
    if (!state?.game || !q || state.game.tallied.includes(q.slideIndex)) return;
    const g = state.game;
    const gains = g.mode === 'paper'
      ? tallyPaperQuestion(g, q.slideIndex, correctLetterOf(item))
      : tallyClassQuestion({ game: g, slideIndex: q.slideIndex, itemId: q.itemId, responses: allResponses, roster: players.map((p) => p.userId), openedAt: g.openedAt ? Date.parse(g.openedAt) : Date.now(), seenAt: seenAt.current, isCorrect });
    await send({ type: 'game-tally', slideIndex: q.slideIndex, gains });
  }, [state, q, item, allResponses, players, isCorrect, send]);

  const openQ = async (k: number) => {
    const nq = questions[k];
    if (!nq) return;
    await send({ type: 'go', slideIndex: nq.slideIndex });
    await send({ type: 'open', itemId: nq.itemId, ...(game && game.seconds > 0 ? { seconds: game.seconds } : {}) });
  };
  const closeQ = async () => {
    if (phase === 'activity-open') await send({ type: 'close' });
    await tallyCurrent();
  };
  const reveal = async () => {
    await closeQ();
    await send({ type: 'reveal' });
  };
  const showBoard = async () => {
    if (phase === 'activity-open') await closeQ();
    else await tallyCurrent();
    await send({ type: 'game-board', show: true });
  };
  const finish = async () => {
    if (q && phase !== 'slide' && phase !== 'lobby') await tallyCurrent();
    await send({ type: 'end' });
  };

  // Tự chốt khi hết giờ hoặc cả lớp đã trả lời.
  const autoClosed = useRef('');
  useEffect(() => {
    if (!game || game.mode === 'self' || phase !== 'activity-open' || !q) return;
    const key = `${q.slideIndex}:${game.openedAt ?? ''}`;
    if (autoClosed.current === key) return;
    const all = players.length > 0 && answeredCount >= players.length && game.mode !== 'paper';
    if ((left !== null && left <= 0) || all) {
      autoClosed.current = key;
      void reveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, answeredCount, players.length, phase, q?.slideIndex, game?.openedAt]);

  /* ---------- self: tính điểm liên tục, tự kết thúc khi hết giờ ---------- */
  const pending = useRef(new Set<string>());
  useEffect(() => {
    if (!game || game.mode !== 'self' || !game.startedAt || phase === 'ended') return;
    const t = window.setTimeout(() => {
      const gains = tallySelfResponses({ game, responses: allResponses, questions, startedAt: Date.parse(game.startedAt!), seenAt: seenAt.current, isCorrect })
        .filter((x) => !pending.current.has(`${x.userId}|${x.slideIndex}`));
      if (!gains.length) return;
      gains.forEach((x) => pending.current.add(`${x.userId}|${x.slideIndex}`));
      void send({ type: 'game-tally', gains });
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, game?.done, game?.startedAt, phase]);
  useEffect(() => {
    if (game?.mode === 'self' && game.endsAt && phase !== 'ended' && now >= Date.parse(game.endsAt)) void send({ type: 'end' });
  }, [now, game?.mode, game?.endsAt, phase, send]);

  if (!state) return null;
  const tvUrl = presentUrl(state.sessionId);
  const joinUrl = learnerUrl(state.pin);
  const mode = game?.mode ?? setupMode ?? 'class';
  const ended = phase === 'ended';
  const tallied = !!(q && game?.tallied.includes(q.slideIndex));
  const isLast = qIdx >= 0 && qIdx === questions.length - 1;
  const nextIdx = qIdx < 0 ? 0 : qIdx + 1;

  const exportXlsx = () => {
    if (!game) return;
    const names = new Map(players.map((p) => [p.userId, p.name]));
    const perQ = questions.map((x) => {
      const it = items[x.itemId];
      if (game.mode === 'paper') {
        const c = correctLetterOf(it);
        const ans = game.paper?.[String(x.slideIndex)] ?? {};
        return new Map(Object.entries(ans).map(([u, a]) => [u, c ? (a === c ? 'Đ' : `S (${a})`) : a]));
      }
      return new Map(firstPerStudent(allResponses, x.itemId, x.slideIndex, seenAt.current).map((r) => {
        const ok = isCorrect(r);
        return [r.userId, ok === undefined ? '✓' : ok ? 'Đ' : 'S'];
      }));
    });
    const title = `${lesson?.title ?? 'Đố vui'} — ${GAME_MODE_LABEL[game.mode].name} — ${new Date().toLocaleString('vi-VN')}`;
    bridge.downloadBytes(`do-vui-${state.pin}.xlsx`, bridge.writeXlsx([
      { name: 'Xếp hạng', header: 1, rows: [[title], ['Hạng', 'Học sinh', 'Điểm', 'Số câu đúng', 'Đã trả lời', 'Tỉ lệ đúng'],
        ...board.map((r) => [r.rank, r.name, r.points, r.correct, r.answered, questions.length ? `${Math.round((r.correct / questions.length) * 100)}%` : ''])] },
      { name: 'Từng câu', header: 1, rows: [[title], ['Học sinh', ...questions.map((_, i) => `Câu ${i + 1}`)],
        ...board.map((r) => [names.get(r.userId) ?? r.name, ...perQ.map((m) => m.get(r.userId) ?? '')]),
        ['Số em đúng', ...perQ.map((m) => [...m.values()].filter((v) => v === 'Đ').length)]] },
    ]));
  };
  const giveTop = () => {
    const top = board.filter((r) => r.points > 0 && r.rank <= 3);
    for (const r of top) {
      const stars = 4 - r.rank;
      award.mutate({ userId: r.userId, stars, coins: stars, xp: stars * 10, reason: `Đố vui trực tiếp: hạng ${r.rank}`, sourceType: 'live', sourceId: state.sessionId });
    }
    setAwarded(true);
    setToast(`Đã thưởng sao cho ${top.length} bạn dẫn đầu`);
  };

  return (
    <div className="tc-live tc-game" data-testid="game-control">
      <header className="tc-live__head">
        <div className="tc-live__pin">
          <small>{mode === 'paper' ? 'Mã phòng (TV)' : 'Mã vào lớp'}</small>
          <strong aria-label={`Mã ${state.pin.split('').join(' ')}`}>{state.pin.slice(0, 3)}<i /> {state.pin.slice(3)}</strong>
        </div>
        <div className="tc-live__links">
          <span className={cx('tc-conn', `is-${status}`)}><i />{status === 'open' ? 'Đã kết nối' : status === 'connecting' ? 'Đang nối…' : status === 'error' ? 'Lỗi kết nối' : 'Đã đóng'}</span>
          <div className="tc-row tc-wrap">
            <a className="tc-btn tc-btn--default tc-btn--sm" href={tvUrl} target="_blank" rel="noreferrer"><Icon name="tv" size={16} /><span>Mở trên TV</span></a>
            {mode !== 'paper' ? <Btn size="sm" icon="qr" onClick={() => setShowJoin((v) => !v)}>QR vào lớp</Btn> : <Link className="tc-btn tc-btn--sm" to={`/truc-tiep/the-giay${cls ? `?lop=${cls.id}` : ''}`} target="_blank"><Icon name="print" size={16} /><span>In thẻ</span></Link>}
          </div>
        </div>
      </header>
      <div className="tc-row tc-wrap tc-game__mode">
        <span className="tc-chip tc-chip--ok">{GAME_MODE_LABEL[mode].name}</span>
        <strong>{lesson?.title}</strong>
        <span className="tc-muted tc-small">{questions.length} câu{game && game.seconds ? ` · ${game.seconds} giây/câu` : ''}</span>
      </div>
      {error && status !== 'open' ? <ErrorNote error={new Error(error)} /> : null}
      <ErrorNote error={sendErr} />
      {showJoin ? (
        <section className="tc-card tc-joincard">
          <QrCode value={joinUrl} size={168} title="Mã QR cho học sinh vào lớp" />
          <div><strong>Học sinh quét mã để vào chơi</strong><p className="tc-muted tc-small">hoặc mở Góc học tập → “Vào lớp” và nhập mã <b>{state.pin}</b></p><code className="tc-small">{joinUrl}</code></div>
        </section>
      ) : null}
      {!game ? <section className="tc-card"><p className="tc-muted">Đang chuẩn bị trò chơi…{mode === 'paper' && !rosterLoading && !roster.length ? ' Lớp chưa có học sinh để phát thẻ.' : ''}</p></section> : null}

      {game && ended ? (
        <section className="tc-card tc-stack tc-center" data-testid="game-ended">
          <h2>🏆 Kết thúc trò chơi</h2>
          <Podium rows={board} />
          <div className="tc-row tc-wrap" style={{ justifyContent: 'center' }}>
            <Btn kind="primary" icon="star" disabled={awarded || !board.some((r) => r.points > 0)} onClick={giveTop}>{awarded ? 'Đã thưởng sao' : 'Thưởng sao top 3 (3★ 2★ 1★)'}</Btn>
            <Btn icon="upload" onClick={exportXlsx} data-testid="game-export">Xuất Excel kết quả</Btn>
            <Btn onClick={() => nav('/ngan-hang')}>Về Ngân hàng câu hỏi</Btn>
          </div>
          <Board rows={board} total={questions.length} mode={game.mode} />
        </section>
      ) : game ? (
        <div className="tc-live__grid">
          <section className="tc-card tc-stack tc-live__now">
            {game.mode === 'self' ? (
              <>
                <div className="tc-row tc-wrap">
                  <strong>{game.startedAt ? 'Đang chơi' : 'Phòng chờ'}</strong>
                  <span className="tc-muted tc-small">{players.length} học sinh đã vào</span>
                  {game.endsAt ? <span className={cx('tc-timer', now > Date.parse(game.endsAt) - 30_000 && 'is-low')}>{Math.max(0, Math.ceil((Date.parse(game.endsAt) - now) / 60000))} phút</span> : null}
                </div>
                {!game.startedAt ? (
                  <>
                    <Seg label="Thời gian cả bài" value={selfMinutes} onChange={setSelfMinutes} options={[{ value: 0, label: 'Không giới hạn' }, { value: 5, label: '5 phút' }, { value: 10, label: '10 phút' }, { value: 15, label: '15 phút' }]} />
                    <Btn kind="primary" size="lg" icon="play" className="tc-bigbtn" disabled={!questions.length} onClick={() => void send({ type: 'game-start', ...(selfMinutes ? { endsAt: new Date(Date.now() + selfMinutes * 60_000).toISOString() } : {}) })} data-testid="game-start">Bắt đầu cho cả lớp</Btn>
                    <p className="tc-small tc-muted">HS vào bằng mã {state.pin}. Ai vào muộn vẫn làm được.</p>
                  </>
                ) : (
                  <SelfProgress rows={board} total={questions.length} />
                )}
              </>
            ) : (
              <>
                <div className="tc-row tc-wrap">
                  <span className="tc-chip">{qIdx >= 0 ? `Câu ${qIdx + 1}/${questions.length}` : 'Phòng chờ'}</span>
                  {left !== null && phase === 'activity-open' ? <span className={cx('tc-timer', left <= 5 && 'is-low')}>{left}s</span> : null}
                  <span className="tc-muted tc-small">{phase === 'activity-open' ? 'Đang mở' : phase === 'reveal' ? 'Đã hiện đáp án' : phase === 'activity-closed' ? 'Đã chốt' : ''}{game.board ? ' · TV: bảng xếp hạng' : ''}</span>
                </div>
                {q && item ? <p className="tc-game__prompt">{item.prompt.text}</p> : <p className="tc-muted">{game.mode === 'paper' ? `${players.length} em có thẻ. Cho cả lớp nhìn TV rồi bấm “Câu đầu tiên”.` : `${players.length} học sinh đã vào. Chờ đủ rồi bấm “Câu đầu tiên”.`}</p>}
                {q && phase !== 'slide' ? <p><strong>{answeredCount}/{players.length}</strong> <span className="tc-muted">{game.mode === 'paper' ? 'đã quét' : 'đã trả lời'}</span></p> : null}
                <div className="tc-game__actions">
                  {qIdx < 0 || phase === 'slide' ? (
                    <Btn kind="primary" size="lg" icon="play" className="tc-bigbtn" disabled={!questions.length} onClick={() => void openQ(qIdx < 0 ? 0 : qIdx)} data-testid="game-open">{qIdx < 0 ? 'Câu đầu tiên' : `Mở câu ${qIdx + 1}`}</Btn>
                  ) : phase === 'activity-open' ? (
                    <Btn kind="primary" size="lg" className="tc-bigbtn" onClick={() => void reveal()} data-testid="game-reveal">Chốt &amp; hiện đáp án</Btn>
                  ) : (
                    <>
                      {phase !== 'reveal' ? <Btn size="lg" className="tc-bigbtn" onClick={() => void reveal()}>Hiện đáp án</Btn> : null}
                      <Btn size="lg" className="tc-bigbtn" icon="trophy" disabled={game.board} onClick={() => void showBoard()} data-testid="game-board">Bảng xếp hạng</Btn>
                      {isLast ? (
                        <Btn kind="primary" size="lg" className="tc-bigbtn" icon="stop" onClick={() => void finish()} data-testid="game-finish">Kết thúc &amp; trao giải</Btn>
                      ) : (
                        <Btn kind="primary" size="lg" className="tc-bigbtn" onClick={() => void openQ(nextIdx)} data-testid="game-next">Câu tiếp ({nextIdx + 1}/{questions.length}) <Icon name="next" size={20} /></Btn>
                      )}
                    </>
                  )}
                </div>
                {tallied && q ? <p className="tc-small tc-muted">Đã tính điểm câu này.</p> : null}
                {game.mode === 'paper' && q && phase !== 'slide' ? (
                  <PaperPanel cards={game.cards ?? []} answers={paperAns} open={phase === 'activity-open'} correct={phase === 'reveal' ? correctLetterOf(item) : null}
                    onAnswers={(a) => void send({ type: 'paper-answer', slideIndex: q.slideIndex, answers: a })} />
                ) : null}
              </>
            )}
          </section>

          <section className="tc-live__controls">
            <div className="tc-card tc-stack">
              <h3 className="tc-h3" style={{ margin: 0 }}>Bảng xếp hạng</h3>
              {teams.length ? <div className="tc-teamscore">{teams.map((t) => <span key={t.id} style={{ borderColor: t.color }}><i style={{ background: t.color }} />{t.name} <b>{fmt(t.points)}</b></span>)}</div> : null}
              <Board rows={board.slice(0, 15)} total={questions.length} mode={game.mode} gains={game.lastGain} compact />
              {board.length > 15 ? <p className="tc-small tc-muted">… và {board.length - 15} bạn nữa (xem đủ khi xuất Excel).</p> : null}
            </div>
            <div className="tc-card">
              {ending ? <ConfirmBar text="Kết thúc trò chơi cho cả lớp?" confirmLabel="Kết thúc" onCancel={() => setEnding(false)} onConfirm={() => { setEnding(false); void finish(); }} />
                : <Btn kind="danger" className="tc-grow tc-w100" icon="stop" onClick={() => setEnding(true)} data-testid="game-end">Kết thúc trò chơi</Btn>}
            </div>
          </section>
        </div>
      ) : null}
      {toast ? <div className="tc-toast" role="status">{toast}</div> : null}
    </div>
  );
}

function Board({ rows, total, mode, gains, compact }: { rows: GameRankRow[]; total: number; mode: LiveGameMode; gains?: Record<string, number>; compact?: boolean }) {
  if (!rows.length) return <p className="tc-muted tc-small">Chưa có người chơi.</p>;
  return (
    <table className={cx('tc-table tc-gameboard', compact && 'tc-table--compact')} data-testid="game-board-table">
      <thead><tr><th>#</th><th>Học sinh</th><th className="tc-num">Điểm</th><th className="tc-num">Đúng</th>{mode === 'self' ? <th className="tc-num">Đã làm</th> : null}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.userId} className={cx(r.rank <= 3 && r.points > 0 && `is-top${r.rank}`)}>
            <td>{r.rank <= 3 && r.points > 0 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
            <td>{r.name}{r.streak >= 2 ? <span className="tc-chip tc-chip--warn" title="Đúng liên tiếp">🔥{r.streak}</span> : null}</td>
            <td className="tc-num"><b>{fmt(r.points)}</b>{gains?.[r.userId] ? <small className="tc-game__gain"> +{fmt(gains[r.userId])}</small> : null}</td>
            <td className="tc-num">{r.correct}/{total}</td>
            {mode === 'self' ? <td className="tc-num">{r.done}/{total}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SelfProgress({ rows, total }: { rows: GameRankRow[]; total: number }) {
  return (
    <ul className="tc-selfprog" data-testid="self-progress">
      {rows.map((r) => (
        <li key={r.userId}>
          <span className="tc-selfprog__name">{r.name}</span>
          <span className="tc-selfprog__bar" aria-label={`${r.done}/${total} câu`}><i style={{ width: `${total ? (r.done / total) * 100 : 0}%` }} /></span>
          <small className="tc-muted">{r.done}/{total} · {fmt(r.points)}</small>
        </li>
      ))}
      {!rows.length ? <li className="tc-muted tc-small">Chưa có ai vào.</li> : null}
    </ul>
  );
}

function Podium({ rows }: { rows: GameRankRow[] }) {
  const top = rows.filter((r) => r.points > 0).slice(0, 3);
  if (!top.length) return <p className="tc-muted">Chưa có ai ghi điểm.</p>;
  const order = [top[1], top[0], top[2]].filter(Boolean) as GameRankRow[];
  return (
    <ol className="tc-podium" aria-label="Ba bạn dẫn đầu">
      {order.map((r) => (
        <li key={r.userId} className={`is-${r.rank}`}><span className="tc-podium__medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span><strong>{r.name}</strong><small>{fmt(r.points)} điểm</small><i /></li>
      ))}
    </ol>
  );
}

/** Chế độ giấy: camera quét thẻ + bảng chạm chọn đáp án cho từng em. */
function PaperPanel({ cards, answers, open, correct, onAnswers }: { cards: { card: number; userId: string; name: string }[]; answers: Record<string, string>; open: boolean; correct: string | null; onAnswers: (a: Record<string, string | null>) => void }) {
  const [cam, setCam] = useState(false);
  const byCard = useMemo(() => new Map(cards.map((c) => [c.card, c])), [cards]);
  const latest = useRef(answers);
  latest.current = answers;
  const queue = useRef<Record<string, string>>({});
  const timer = useRef<number | undefined>(undefined);
  const onHits = useCallback((hits: { card: number; letter: string }[]) => {
    for (const h of hits) {
      const c = byCard.get(h.card);
      if (!c) continue;
      if (latest.current[c.userId] !== h.letter) queue.current[c.userId] = h.letter;
    }
    if (!Object.keys(queue.current).length || timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      const a = queue.current;
      queue.current = {};
      if (Object.keys(a).length) onAnswers(a);
    }, 500);
  }, [byCard, onAnswers]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (!open) setCam(false); }, [open]);

  return (
    <div className="tc-paper" data-testid="paper-panel">
      {open ? (
        <div className="tc-row tc-wrap">
          <Btn kind={cam ? 'default' : 'primary'} icon="camera" onClick={() => setCam((v) => !v)} data-testid="paper-cam">{cam ? 'Tắt camera' : 'Quét thẻ bằng camera'}</Btn>
          <span className="tc-small tc-muted">Hoặc chạm chữ bên cạnh tên em.</span>
        </div>
      ) : null}
      {cam && open ? <PaperScanner labels={Object.fromEntries(cards.map((c) => [c.card, c.name]))} onHits={onHits} /> : null}
      <ul className="tc-paper__grid">
        {cards.map((c) => {
          const a = answers[c.userId];
          return (
            <li key={c.userId} className={cx(a && 'has-ans', correct && a && (a === correct ? 'is-ok' : 'is-bad'))}>
              <span className="tc-paper__no">{c.card}</span>
              <span className="tc-paper__name">{c.name}</span>
              <span className="tc-paper__letters" role="group" aria-label={`Đáp án của ${c.name}`}>
                {PAPER_LETTERS.map((l) => (
                  <button key={l} type="button" aria-pressed={a === l} disabled={!open} onClick={() => onAnswers({ [c.userId]: a === l ? null : l })}>{l}</button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
