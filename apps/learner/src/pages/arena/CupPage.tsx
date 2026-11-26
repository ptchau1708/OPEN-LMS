/** Một giải đấu (HS): trận của em, đăng kí, nhánh đấu từng vòng, bục vinh quang. */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { SUBJECTS, type Cup, type CupMatch, type CupPlay, type CupPlayer } from '@openedu/contracts';
import { getArenaSource, roundName, useCup, useCupAction, useDataSource } from '@openedu/data';
import { Button, Confetti, Icon, Mascot } from '@openedu/ui';
import { ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { useUi } from '../../lib/store';
import { errText, resolveSettings, useMe } from '../../lib/util';
import { CupMatchPlay } from './CupMatchPlay';
import './arena.css';

export const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');

export default function CupPage() {
  const { id } = useParams();
  const me = useMe();
  const nav = useNavigate();
  const ds = useDataSource();
  const toast = useUi((s) => s.toast);
  const q = useCup(id, true);
  const act = useCupAction(id);
  const [play, setPlay] = useState<CupPlay | null>(null);
  const [opening, setOpening] = useState(false);
  if (q.isPending) return <LoadingScreen label="Đang mở giải đấu" />;
  if (q.isError || !q.data) return <ErrorState message={errText(q.error, 'Không tìm thấy giải đấu.')} onRetry={() => void q.refetch()} />;
  const c = q.data;
  if (play) {
    return <CupMatchPlay play={play} bigText={resolveSettings(me).bigText} onExit={() => setPlay(null)}
      onDone={() => { setPlay(null); act.mutate({ kind: 'done' }); }} />;
  }
  const start = () => {
    setOpening(true);
    getArenaSource(ds).play(c.id).then((p) => { setOpening(false); setPlay(p); }, (e) => { setOpening(false); toast(errText(e), 'try'); });
  };
  const P = new Map(c.players.map((p) => [p.userId, p]));
  return (
    <div className="ln-page ln-cup" data-testid="cup-page">
      <TopBack title="Giải đấu" to="/choi" />
      <header className="ln-cup__head">
        <h1 className="ln-h1">🏆 {c.title}</h1>
        <p className="k-muted">{SUBJECTS[c.subject]?.name ?? ''} · {c.scope === 'grade' ? `cả khối ${c.grade}` : `lớp ${c.className ?? ''}`} · {c.players.length || 'chưa có'} bạn · {c.questions} câu mỗi trận</p>
      </header>
      <Confetti show={c.status === 'finished' && c.champion === me.id} />
      <MyCard cup={c} meId={me.id} P={P} busy={opening || act.isPending} onPlay={start}
        onJoin={(inCup) => act.mutate({ kind: 'join', inCup }, { onError: (e) => toast(errText(e), 'try') })} />
      {c.status === 'finished' ? <KidPodium cup={c} P={P} meId={me.id} /> : null}
      {c.status !== 'signup' && c.rounds > 0 ? <KidBracket cup={c} P={P} meId={me.id} /> : null}
      <Button size="lg" variant="ghost" onClick={() => nav('/choi')}>Về Đấu trường</Button>
    </div>
  );
}

function myMatch(c: Cup, meId: string): CupMatch | undefined {
  return c.matches.find((m) => m.round === c.round && (m.p1 === meId || m.p2 === meId));
}

/** Một dòng trạng thái ngắn cho thẻ giải ở trang Đấu trường. */
export function cupMyLine(c: Cup, meId: string): { text: string; cta?: string } {
  const P = c.players.find((p) => p.userId === meId);
  if (c.status === 'signup') {
    if (c.entry === 'signup') return c.me.joined ? { text: `Em đã đăng kí · bắt đầu ${fmt(c.startAt)}` } : { text: `Đang nhận đăng kí · bắt đầu ${fmt(c.startAt)}`, cta: 'Đăng kí' };
    return { text: `Bắt đầu lúc ${fmt(c.startAt)}` };
  }
  if (c.status === 'cancelled') return { text: 'Giải đã huỷ' };
  if (c.status === 'finished') {
    if (c.champion === meId) return { text: '🥇 Em là Vô địch!' };
    if (c.runnerUp === meId) return { text: '🥈 Em đạt Á quân!' };
    if (c.thirds.includes(meId)) return { text: '🥉 Em đạt Hạng ba!' };
    return { text: 'Giải đã kết thúc — xem ai vô địch nhé!' };
  }
  if (!P) return { text: `${roundName(c.round, c.rounds)} · cổ vũ các bạn nhé!` };
  if (P.outRound) return { text: `Em dừng ở ${roundName(P.outRound, c.rounds).toLowerCase()}. Cổ vũ các bạn nhé!` };
  const m = myMatch(c, meId);
  if (!m) return { text: `${roundName(c.round, c.rounds)} đang diễn ra` };
  if (m.status === 'done') return { text: `Em vào ${roundName(Math.min(c.round + 1, c.rounds), c.rounds).toLowerCase()}! Chờ vòng sau nhé.` };
  if (m.opensAt && Date.parse(m.opensAt) > Date.now()) return { text: `${roundName(c.round, c.rounds)} mở lúc ${fmt(m.opensAt)}` };
  if (m.done?.includes(meId)) return { text: 'Em đấu xong rồi, chờ bạn đấu nhé.' };
  return { text: `${roundName(c.round, c.rounds)} · hạn ${fmt(m.closesAt)}`, cta: 'Đấu ngay' };
}

function MyCard({ cup: c, meId, P, busy, onPlay, onJoin }: { cup: Cup; meId: string; P: Map<string, CupPlayer>; busy: boolean; onPlay: () => void; onJoin: (inCup: boolean) => void }) {
  const me = P.get(meId);
  const m = myMatch(c, meId);
  const opp = m ? P.get(m.p1 === meId ? m.p2 ?? '' : m.p1 ?? '') : undefined;
  let body: React.ReactNode;
  if (c.status === 'signup') {
    body = c.entry === 'signup' && c.me.eligible ? (
      <>
        <p className="ln-cup__big">{c.me.joined ? 'Em đã đăng kí tham gia!' : 'Giải đang nhận đăng kí.'}</p>
        <p>Giải bắt đầu lúc <b>{fmt(c.startAt)}</b>.</p>
        {c.me.joined
          ? <Button size="lg" variant="secondary" disabled={busy} onClick={() => onJoin(false)}>Huỷ đăng kí</Button>
          : <Button size="xl" icon={<Icon name="plus" size={26} />} disabled={busy} onClick={() => onJoin(true)} data-testid="cup-join">Đăng kí tham gia</Button>}
      </>
    ) : <p className="ln-cup__big">Giải bắt đầu lúc {fmt(c.startAt)}. Cả {c.scope === 'grade' ? 'khối' : 'lớp'} cùng tham gia!</p>;
  } else if (c.status === 'cancelled') {
    body = <p className="ln-cup__big">Giải đã huỷ. {c.note ?? ''}</p>;
  } else if (c.status === 'finished') {
    body = <p className="ln-cup__big">{cupMyLine(c, meId).text}</p>;
  } else if (!me) {
    body = <p className="ln-cup__big">Em không tham gia giải này. Cổ vũ các bạn nhé!</p>;
  } else if (me.outRound) {
    body = <><p className="ln-cup__big">Em dừng ở {roundName(me.outRound, c.rounds).toLowerCase()}.</p><p>Em đã thi đấu rất cố gắng! Cùng xem ai vô địch nhé.</p></>;
  } else if (m && m.status === 'open' && opp) {
    const waiting = m.opensAt && Date.parse(m.opensAt) > Date.now();
    const doneMe = m.done?.includes(meId);
    body = (
      <>
        <p className="ln-cup__round">{roundName(c.round, c.rounds)}</p>
        <div className="ln-cup__vs">
          <span><Mascot id={me.mascot} size={72} mood="cheer" title="" /><b>Em</b></span>
          <strong>VS</strong>
          <span><Mascot id={opp.mascot} size={72} mood="happy" title="" /><b>{opp.name}</b>{m.done?.includes(opp.userId) ? <small>đã đấu xong</small> : null}</span>
        </div>
        {waiting ? <p>Vòng mở lúc <b>{fmt(m.opensAt)}</b>.</p>
          : doneMe ? <p className="ln-cup__big">Em đấu xong rồi! Chờ {opp.name} đấu để biết kết quả nhé.</p>
            : <>
                <p>Hạn đấu: <b>{fmt(m.closesAt)}</b>. Hết giờ mà em chưa đấu thì {opp.name} được đi tiếp.</p>
                <Button size="xl" icon={<Icon name="play" size={28} />} disabled={busy} onClick={onPlay} data-testid="cup-go">{busy ? 'Đang vào trận…' : 'Đấu ngay'}</Button>
              </>}
      </>
    );
  } else {
    body = <p className="ln-cup__big">Em vào {roundName(Math.min(c.round + 1, c.rounds), c.rounds).toLowerCase()}! 🎉 Chờ các bạn đấu xong vòng này nhé.</p>;
  }
  return <section className="ln-cup__me" aria-label="Trận của em" data-testid="cup-me">{body}</section>;
}

function KidPodium({ cup: c, P, meId }: { cup: Cup; P: Map<string, CupPlayer>; meId: string }) {
  const one = (u: string | undefined, medal: string, label: string) => {
    const p = u ? P.get(u) : undefined;
    return p ? (
      <div key={`${label}-${u}`} className={`ln-cup__pod${u === meId ? ' is-me' : ''}`}>
        <span className="ln-cup__medal" aria-hidden="true">{medal}</span>
        <Mascot id={p.mascot} size={56} title="" />
        <b>{u === meId ? 'Em' : p.name}</b>
        <small>{label}</small>
      </div>
    ) : null;
  };
  return (
    <section className="ln-cup__podium" aria-label="Kết quả giải" data-testid="cup-podium">
      {one(c.runnerUp, '🥈', 'Á quân')}
      {one(c.champion, '🏆', 'Vô địch')}
      {c.thirds.map((t) => one(t, '🥉', 'Hạng ba'))}
    </section>
  );
}

function KidBracket({ cup: c, P, meId }: { cup: Cup; P: Map<string, CupPlayer>; meId: string }) {
  const [round, setRound] = useState(c.status === 'running' ? c.round : c.rounds);
  const ms = c.matches.filter((m) => m.round === round && m.decidedBy !== 'bye').sort((a, b) => Number(b.p1 === meId || b.p2 === meId) - Number(a.p1 === meId || a.p2 === meId) || a.slot - b.slot);
  const name = (u?: string) => (u === meId ? 'Em' : u ? P.get(u)?.name ?? 'Bạn' : '…');
  return (
    <section className="ln-cup__bracket" aria-label="Nhánh đấu">
      <div className="ln-cup__rounds" role="tablist" aria-label="Chọn vòng">
        {Array.from({ length: c.rounds }, (_, i) => i + 1).map((r) => (
          <button key={r} type="button" role="tab" aria-selected={r === round} className={`ln-cup__rtab${r === round ? ' is-on' : ''}${r === c.round && c.status === 'running' ? ' is-now' : ''}`}
            disabled={r > c.round && c.status === 'running'} onClick={() => setRound(r)}>{roundName(r, c.rounds)}</button>
        ))}
      </div>
      {!ms.length ? <p className="k-muted">Vòng này các bạn được miễn đấu hoặc chưa tới.</p> : (
        <ul className="ln-cup__matches">
          {ms.map((m) => {
            const mine = m.p1 === meId || m.p2 === meId;
            const r1 = m.result?.[m.p1 ?? ''];
            const r2 = m.result?.[m.p2 ?? ''];
            return (
              <li key={m.slot} className={`ln-cup__m${mine ? ' is-me' : ''}`}>
                <span className={m.winner === m.p1 ? 'is-win' : m.winner ? 'is-lose' : ''}>{name(m.p1)}{r1 ? ` · ${r1.correct}` : ''}</span>
                <em>vs</em>
                <span className={m.winner === m.p2 ? 'is-win' : m.winner ? 'is-lose' : ''}>{name(m.p2)}{r2 ? ` · ${r2.correct}` : ''}</span>
                <small>{m.status === 'done' ? `${name(m.winner)} đi tiếp` : m.done?.length ? `${m.done.map(name).join(', ')} đã đấu` : 'chưa đấu'}</small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
