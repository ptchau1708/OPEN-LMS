import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DUEL_REACTIONS, DUEL_SECONDS, type AnyResponse, type DuelInfo, type DuelLobby, type DuelPlayer, type DuelResult, type Item } from '@openedu/contracts';
import { DUEL_COUNTDOWN_MS, DUEL_LIMIT_MS, DuelMatch, oppQuiet, totalPoints, useDuelService, useItemsByIds, type DuelMatchState } from '@openedu/data';
import { ActivityView, isComplete } from '@openedu/activity-engine';
import { Button, Confetti, Icon, Mascot, StarCount, TimerRing, sfx } from '@openedu/ui';
import { ErrorState, LoadingScreen } from '../../components/Common';
import { useUi } from '../../lib/store';
import { errText, useMe } from '../../lib/util';
import '../../styles/tower.css';

const MAX_POINTS = 150;

interface Props {
  duel: DuelInfo;
  lobby: DuelLobby;
  bigText: boolean;
  onRematch: (d: DuelInfo) => void;
  onExit: () => void;
  onHome: () => void;
}

export function DuelMatchView(props: Props) {
  const itemsQ = useItemsByIds(props.duel.itemIds);
  if (itemsQ.isPending) return <LoadingScreen label="Đang chuẩn bị câu hỏi" />;
  if (itemsQ.isError || !itemsQ.data) return <ErrorState message="Chưa tải được câu hỏi của trận." onRetry={() => void itemsQ.refetch()} />;
  return <MatchGate {...props} items={itemsQ.data} />;
}

function MatchGate(props: Props & { items: Record<string, Item> }) {
  const me = useMe();
  const m = useMatch(props.duel, me.id);
  if (!m) return <LoadingScreen label="Đang vào trận" />;
  return <Match {...props} match={m.match} state={m.state} />;
}

/** Tạo trận trong effect (không dùng lại kênh đã đóng nếu effect chạy lại). */
function useMatch(duel: DuelInfo, meId: string) {
  const svc = useDuelService();
  const [m, setM] = useState<{ match: DuelMatch; state: DuelMatchState } | null>(null);
  useEffect(() => {
    const match = new DuelMatch(duel, meId, svc.openChannel(duel, meId));
    setM({ match, state: match.state });
    const off = match.subscribe((state) => setM({ match, state }));
    match.start();
    const leave = () => match.leave();
    window.addEventListener('pagehide', leave);
    return () => { off(); window.removeEventListener('pagehide', leave); match.leave(); };
  }, [duel, meId, svc]);
  return m;
}

function Match({ duel, lobby, bigText, onRematch, onExit, onHome, items, match, state }: Props & { items: Record<string, Item>; match: DuelMatch; state: DuelMatchState }) {
  const me = useMe();
  const svc = useDuelService();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const queueUnlocks = useUi((s) => s.queueUnlocks);
  const [value, setValue] = useState<AnyResponse | undefined>(undefined);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<DuelResult | null>(null);
  const [finishErr, setFinishErr] = useState<string | null>(null);
  const [rematchFrom, setRematchFrom] = useState<DuelInfo | null>(null);
  const [rematchWait, setRematchWait] = useState(false);
  const [pop, setPop] = useState<{ emoji: string; mine: boolean; key: number } | null>(null);
  const skipped = useRef(new Set<number>());
  const meP = match.me;
  const opp = match.opp;
  const q = state.q;
  const item = items[duel.itemIds[q]];
  const mine = state.answers[meP.userId]?.[q];
  const theirs = state.answers[opp.userId]?.[q];

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(t); }, []);
  useEffect(() => { setValue(undefined); }, [q]);

  // Âm thanh khi mở đáp án; hết giờ → báo server (Supabase).
  const lastReveal = useRef(-1);
  useEffect(() => {
    if (state.phase === 'reveal' && lastReveal.current !== q) {
      lastReveal.current = q;
      if (mine?.correct) sfx.correct(); else sfx.tryAgain();
    }
    if (mine?.timedOut && !skipped.current.has(q)) {
      skipped.current.add(q);
      void svc.skip({ userId: me.id, duel, q }).catch(() => undefined);
    }
  }, [state.phase, q, mine, svc, me.id, duel]);

  // Biểu cảm của bạn.
  useEffect(() => {
    const r = state.reaction;
    if (!r) return;
    setPop({ emoji: r.emoji, mine: r.from === meP.userId, key: r.at });
    const t = window.setTimeout(() => setPop(null), 1800);
    return () => window.clearTimeout(t);
  }, [state.reaction, meP.userId]);

  // Kết thúc → lưu kết quả, cộng sao.
  const finishing = useRef(false);
  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    setFinishErr(null);
    const answers: Record<string, NonNullable<DuelMatchState['answers'][string][number]>[]> = {};
    for (const [k, list] of Object.entries(state.answers)) answers[k] = list.filter((r): r is NonNullable<typeof r> => !!r);
    svc.finish(duel, me.id, { answers, ...(state.forfeitBy ? { forfeitBy: state.forfeitBy } : {}) }).then(
      (r) => {
        setResult(r);
        if (r.outcome === 'win') sfx.star();
        if (r.award?.newlyUnlocked.length) queueUnlocks(r.award.newlyUnlocked);
        for (const k of ['wallet', 'rewards', 'passport', 'todayTasks', 'skillMastery', 'duelStats', 'studentProfile']) void qc.invalidateQueries({ queryKey: [k] });
      },
      (e) => { finishing.current = false; setFinishErr(errText(e)); },
    );
  };
  useEffect(() => { if (state.phase === 'finished') finish(); }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lời mời đấu lại từ bạn.
  useEffect(() => match.onMessage((m) => { if (m.t === 'rematch' && m.duel) { sfx.tap(); setRematchFrom(m.duel); } }), [match]);

  const ready = (() => { if (!item || value === undefined) return false; try { return isComplete(item, value); } catch { return true; } })();
  const submit = () => {
    if (!item || !ready || mine || state.pendingQ === q || state.phase !== 'question') return;
    sfx.tap();
    const ms = Date.now() - state.phaseAt;
    match.setPending(q);
    svc.grade({ userId: me.id, duel, q, item, response: value as AnyResponse, ms }).then(
      (r) => match.answer(r),
      (e) => { match.setPending(null); toast(errText(e, 'Chưa gửi được câu trả lời. Em bấm lại nhé!'), 'try'); },
    );
  };

  const rematch = async () => {
    sfx.tap();
    if (opp.isBot) { try { onRematch(await lobby.bot()); } catch (e) { toast(errText(e), 'try'); } return; }
    if (rematchFrom) { try { onRematch(await lobby.join(rematchFrom.code)); } catch (e) { toast(errText(e), 'try'); } return; }
    setRematchWait(true);
    try {
      const { duel: next, ready: r } = await lobby.host(opp.userId);
      match.send({ t: 'rematch', from: me.id, duel: next });
      onRematch(await r);
    } catch (e) { setRematchWait(false); if ((e as Error)?.name !== 'AbortError') toast(errText(e), 'try'); }
  };

  const myScore = totalPoints(state.answers[meP.userId]);
  const oppScore = totalPoints(state.answers[opp.userId]);
  const total = duel.itemIds.length;
  const quiet = oppQuiet(state, now);

  /* ---------- kết quả ---------- */
  if (state.phase === 'finished') {
    const outcome = result?.outcome;
    const title = !result ? 'Đang tính điểm…' : outcome === 'win' ? (state.forfeitBy === opp.userId ? 'Em thắng! Bạn đã rời trận.' : 'Em thắng rồi! Tuyệt vời!') : outcome === 'draw' ? 'Hoà rồi! Hai bạn đều giỏi!' : 'Lần sau em sẽ thắng!';
    const sub = !result ? '' : outcome === 'lose' ? 'Em đã cố gắng lắm. Mỗi trận đấu, em lại giỏi hơn!' : outcome === 'draw' ? 'Bằng điểm nhau luôn. Đấu lại không?' : 'Em vừa nhanh vừa giỏi!';
    const sc = result?.scores ?? { [meP.userId]: myScore, [opp.userId]: oppScore };
    const cc = result?.correct ?? {};
    return (
      <div className="ln-duel-play ln-duel-end">
        <Confetti show={outcome === 'win'} />
        <div className="ln-duel-end__card" role="status">
          <div className="ln-duel-end__vs">
            <Side p={meP} score={sc[meP.userId] ?? 0} correct={cc[meP.userId]} total={total} mood={outcome === 'lose' ? 'happy' : 'cheer'} win={outcome === 'win'} />
            <span className="ln-duel-vs__x">VS</span>
            <Side p={opp} score={sc[opp.userId] ?? 0} correct={cc[opp.userId]} total={total} mood={outcome === 'win' ? 'happy' : 'cheer'} win={outcome === 'lose'} />
          </div>
          <h1 className="ln-h1 ln-duel-end__title">{title}</h1>
          {sub && <p className="k-muted">{sub}</p>}
          {result && (result.starsAwarded > 0
            ? <p className="ln-duel-end__stars"><StarCount value={result.starsAwarded} /> {outcome === 'win' ? 'sao (tham gia + thắng)' : 'sao vì đã tham gia'}</p>
            : <p className="k-muted">{result.capped ? 'Hôm nay em đã nhận đủ sao Đấu 1–1. Mai chơi tiếp nhé!' : 'Trận này không có sao.'}</p>)}
          {finishErr && <p className="ln-duel-err">{finishErr} <Button size="md" variant="secondary" onClick={finish}>Thử lại</Button></p>}
          {rematchFrom && !rematchWait && <p className="ln-duel-rematch-note"><Icon name="retry" size={22} /> {opp.name} muốn đấu lại!</p>}
          <div className="ln-duel-end__actions">
            <Button size="xl" block onClick={() => void rematch()} disabled={rematchWait || !result} icon={<Icon name="retry" size={28} />}>
              {rematchWait ? `Đang chờ ${opp.name}…` : 'Đấu lại'}
            </Button>
            <Button size="lg" block variant="secondary" onClick={onExit}>Chọn trận khác</Button>
            <Button size="lg" block variant="ghost" onClick={onHome}>Về Đấu trường</Button>
          </div>
          <Reactions onReact={(e) => match.react(e)} />
          {pop && <span key={pop.key} className={`ln-duel-pop${pop.mine ? ' is-mine' : ''}`} aria-live="polite">{pop.emoji}</span>}
        </div>
      </div>
    );
  }

  /* ---------- đang đấu ---------- */
  const endsAt = new Date(state.phaseAt + DUEL_LIMIT_MS).toISOString();
  return (
    <div className="ln-duel-play">
      <header className="ln-duel-bar">
        <Button variant="secondary" icon={<Icon name="close" size={26} />} aria-label="Rời trận" onClick={() => { match.leave(); onExit(); }} />
        <PlayerChip p={meP} score={myScore} />
        <div className="ln-duel-bar__mid">
          {state.phase === 'question' ? <TimerRing key={q} endsAt={endsAt} totalSeconds={DUEL_SECONDS} size={56} tick /> : <span className="ln-duel-qnum">{Math.min(q + 1, total)}/{total}</span>}
        </div>
        <PlayerChip p={opp} score={oppScore} right answered={!!theirs && state.phase === 'question'} />
      </header>
      <div className="ln-duel-dots" aria-label={`Câu ${q + 1} trên ${total}`}>
        {Array.from({ length: total }, (_, i) => <i key={i} className={i < q || (i === q && state.phase === 'reveal') ? 'is-done' : i === q ? 'is-on' : ''} />)}
      </div>
      {quiet && <p className="ln-duel-quiet" role="status">{opp.name} đang mất kết nối… Chờ bạn một chút nhé.</p>}

      <main className="ln-duel-main">
        {(state.phase === 'waiting' || state.phase === 'countdown') ? (
          <div className="ln-duel-count" role="status">
            <div className="ln-duel-end__vs">
              <Side p={meP} mood="cheer" />
              <span className="ln-duel-vs__x">VS</span>
              <Side p={opp} mood={state.phase === 'waiting' ? 'think' : 'cheer'} />
            </div>
            {state.phase === 'waiting'
              ? <h2 className="ln-h1">Đang chờ {opp.name} vào trận…</h2>
              : <span className="ln-duel-count__n" key={Math.ceil((DUEL_COUNTDOWN_MS - (now - state.phaseAt)) / 1000)}>{Math.max(1, Math.ceil((DUEL_COUNTDOWN_MS - (now - state.phaseAt)) / 1000))}</span>}
            <p className="k-muted">{total} câu · mỗi câu {DUEL_SECONDS} giây · đúng và nhanh được nhiều điểm</p>
          </div>
        ) : item ? (
          <div className="ln-qcard ln-duel-q" key={item.id + q}>
            <ActivityView item={item} value={value} onChange={setValue} disabled={!!mine || state.pendingQ === q || state.phase !== 'question'} reveal={state.phase === 'reveal' && item.key != null} bigText={bigText} />
          </div>
        ) : null}
      </main>

      <footer className={`ln-duel-foot${state.phase === 'reveal' ? (mine?.correct ? ' is-ok' : ' is-try') : ''}`}>
        {state.phase === 'reveal' ? (
          <div className="ln-duel-round" role="status">
            <RoundLine name="Em" r={mine} />
            <RoundLine name={opp.name} r={theirs} />
          </div>
        ) : state.phase === 'question' ? (
          mine || state.pendingQ === q ? (
            <p className="ln-duel-waitnote">{state.pendingQ === q ? 'Đang chấm…' : mine?.timedOut ? 'Hết giờ rồi! Câu sau nhanh hơn nhé.' : `Đã chốt! Đợi ${opp.name} nhé…`}</p>
          ) : (
            <Button size="xl" className="ln-duel-check" onClick={submit} disabled={!ready} icon={<Icon name="check" size={28} />}>Chốt đáp án</Button>
          )
        ) : <span />}
        <Reactions onReact={(e) => match.react(e)} />
        {pop && <span key={pop.key} className={`ln-duel-pop${pop.mine ? ' is-mine' : ''}`} aria-live="polite">{pop.emoji}</span>}
      </footer>
    </div>
  );
}

/** Tên gọi ngắn trên thanh trận ("Minh An" → "An"). */
function shortName(n: string): string {
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 && parts[0] !== 'Bạn' ? parts[parts.length - 1] : n;
}

function PlayerChip({ p, score, right, answered }: { p: DuelPlayer; score: number; right?: boolean; answered?: boolean }) {
  const pct = Math.min(100, (score / (MAX_POINTS * 7)) * 100);
  return (
    <div className={`ln-duel-chip${right ? ' is-right' : ''}`}>
      <span className="ln-duel-chip__av"><Mascot id={p.mascot} size={44} title="" />{answered && <i className="ln-duel-chip__ok" aria-label="đã trả lời"><Icon name="check" size={14} strokeWidth={3} /></i>}</span>
      <span className="ln-duel-chip__body">
        <span className="ln-duel-chip__name">{shortName(p.name)}</span>
        <span className="ln-duel-chip__bar" aria-hidden="true"><i style={{ transform: `scaleX(${pct / 100})` }} /></span>
        <span className="ln-duel-chip__score">{score} điểm</span>
      </span>
    </div>
  );
}

function Side({ p, score, correct, total, mood, win }: { p: DuelPlayer; score?: number; correct?: number; total?: number; mood: 'cheer' | 'happy' | 'think'; win?: boolean }) {
  return (
    <div className={`ln-duel-side${win ? ' is-win' : ''}`}>
      {win && <Icon name="trophy" size={28} className="ln-duel-side__cup" />}
      <Mascot id={p.mascot} mood={mood} size={88} title="" animate />
      <strong>{p.name}</strong>
      {score != null && <span className="ln-duel-side__score">{score} điểm</span>}
      {correct != null && total != null && <span className="k-muted">{correct}/{total} câu đúng</span>}
    </div>
  );
}

function RoundLine({ name, r }: { name: string; r?: { correct: boolean; points: number; timedOut?: boolean } }) {
  return (
    <p className={`ln-duel-rline${r?.correct ? ' is-ok' : ''}`}>
      <strong>{name}:</strong> {!r ? '…' : r.correct ? `Đúng! +${r.points}` : r.timedOut ? 'Hết giờ' : 'Chưa đúng'}
    </p>
  );
}

function Reactions({ onReact }: { onReact: (e: (typeof DUEL_REACTIONS)[number]) => void }) {
  const last = useRef(0);
  return (
    <div className="ln-duel-react" role="group" aria-label="Biểu cảm">
      {DUEL_REACTIONS.map((e) => (
        <button key={e} type="button" className="ln-duel-react__b" aria-label={e === '👏' ? 'Vỗ tay' : e === '😮' ? 'Ồ!' : 'Cố lên'} onClick={() => { const t = Date.now(); if (t - last.current < 1500) return; last.current = t; onReact(e); }}>{e}</button>
      ))}
    </div>
  );
}
