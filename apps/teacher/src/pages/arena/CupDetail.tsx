/** Trang một giải đấu (GV): nhánh đấu, điều khiển vòng, danh sách học sinh, in giấy khen, chiếu TV. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Cup, Profile } from '@openedu/contracts';
import { roundName, useCup, useCupAction, useStudents } from '@openedu/data';
import { Avatar, Btn, ConfirmBar, ErrorNote, Loading, PageHead } from '../../components/common';
import { Bracket, cupInfoLine, CupStatusChip, fmtTime, Podium } from './shared';
import '../../styles/arena.css';

export default function CupDetail({ user }: { user: Profile }) {
  void user;
  const { id } = useParams();
  const nav = useNavigate();
  const q = useCup(id, true);
  const act = useCupAction(id);
  const [ask, setAsk] = useState<null | 'close' | 'cancel' | 'delete'>(null);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error ?? new Error('Không tìm thấy giải đấu.')} onRetry={() => void q.refetch()} />;
  const c = q.data;
  const open = c.matches.filter((m) => m.round === c.round && m.status === 'open');
  const played = open.filter((m) => (m.done?.length ?? 0) === 2).length;
  return (
    <div className="tc-page tc-arena">
      <PageHead title={c.title} sub={cupInfoLine(c)} actions={<>
        <Link className="tc-btn tc-btn--ghost" to="/dau-truong"><span>Tất cả giải</span></Link>
        <Link className="tc-btn" to={`/dau-truong/giai/${c.id}/tv`} target="_blank" data-testid="cup-tv"><span>Chiếu lên TV</span></Link>
        {c.status === 'finished' ? <Link className="tc-btn tc-btn--primary" to={`/dau-truong/giay-khen?giai=${c.id}`} data-testid="cup-print"><span>In giấy khen</span></Link> : null}
      </>} />
      <div className="tc-row tc-wrap">
        <CupStatusChip cup={c} />
        {c.note ? <span className="tc-small tc-warn">{c.note}</span> : null}
        <span className="tc-spacer" />
        {c.me.host && c.status === 'signup' ? <Btn kind="primary" icon="play" disabled={act.isPending} onClick={() => act.mutate({ kind: 'start' })} data-testid="cup-start">Bắt đầu ngay</Btn> : null}
        {c.me.host && c.status === 'running' ? <Btn icon="next" disabled={act.isPending} onClick={() => setAsk('close')} data-testid="cup-close">Kết thúc {roundName(c.round, c.rounds).toLowerCase()} ngay</Btn> : null}
        {c.me.host && (c.status === 'signup' || c.status === 'running') ? <Btn kind="ghost" icon="stop" onClick={() => setAsk('cancel')}>Huỷ giải</Btn> : null}
        {c.me.host && (c.status === 'finished' || c.status === 'cancelled' || c.status === 'signup') ? <Btn kind="ghost" icon="trash" onClick={() => setAsk('delete')}>Xoá</Btn> : null}
      </div>
      {ask === 'close' ? (
        <ConfirmBar text={`Kết thúc ${roundName(c.round, c.rounds).toLowerCase()} ngay: trận chưa xong được tính theo luật hết giờ (bạn đã đấu thắng bạn chưa đấu; cả hai chưa đấu → hạt giống cao hơn đi tiếp). ${played}/${open.length} trận đã đấu xong.`}
          confirmLabel="Kết thúc vòng" busy={act.isPending} onCancel={() => setAsk(null)} onConfirm={() => act.mutate({ kind: 'close' }, { onSettled: () => setAsk(null) })} />
      ) : ask === 'cancel' ? (
        <ConfirmBar text="Huỷ giải: các trận đang mở dừng lại, không trao thưởng." confirmLabel="Huỷ giải" busy={act.isPending} onCancel={() => setAsk(null)}
          onConfirm={() => act.mutate({ kind: 'cancel' }, { onSettled: () => setAsk(null) })} />
      ) : ask === 'delete' ? (
        <ConfirmBar text="Xoá giải này (cả nhánh đấu, kết quả). Sao và cúp đã trao vẫn giữ." confirmLabel="Xoá giải" busy={act.isPending} onCancel={() => setAsk(null)}
          onConfirm={() => act.mutate({ kind: 'delete' }, { onSuccess: () => nav('/dau-truong') })} />
      ) : null}
      <ErrorNote error={act.error} />
      {c.status === 'running' ? (
        <p className="tc-small tc-muted" role="status">
          {roundName(c.round, c.rounds)}: {open.length ? `${played}/${open.length} trận đã đấu xong · vòng đóng lúc ${fmtTime(open[0]?.closesAt)}` : 'đang mở vòng sau…'}.
          Học sinh vào app → <b>Đấu trường</b> → giải này → <b>Đấu ngay</b>.
        </p>
      ) : null}
      <Podium cup={c} />
      <Bracket cup={c} busy={act.isPending} onWinner={c.me.host ? (m, u) => act.mutate({ kind: 'winner', round: m.round, slot: m.slot, userId: u }) : undefined} />
      <Players cup={c} onSet={(u, inCup) => act.mutate({ kind: 'player', userId: u, inCup })} busy={act.isPending} />
    </div>
  );
}

function Players({ cup, onSet, busy }: { cup: Cup; onSet: (userId: string, inCup: boolean) => void; busy: boolean }) {
  const roster = useStudents(cup.status === 'signup' && cup.scope === 'class' ? cup.classId : undefined);
  const inCup = new Set(cup.players.map((p) => p.userId));
  const missing = (roster.data ?? []).filter((s) => !inCup.has(s.id));
  return (
    <section className="tc-stack" aria-label="Học sinh tham gia">
      <h2 className="tc-h3">Học sinh tham gia ({cup.players.length})</h2>
      {cup.status === 'signup' && cup.entry === 'all' && !cup.players.length ? (
        <p className="tc-small tc-muted">Tất cả học sinh {cup.scope === 'grade' ? `khối ${cup.grade}` : `lớp ${cup.className}`} sẽ vào giải lúc bắt đầu.</p>
      ) : null}
      <ul className="tc-cupplayers">
        {cup.players.map((p) => (
          <li key={p.userId}>
            <Avatar mascot={p.mascot} color={p.color} size={24} />
            <span className="tc-cupplayers__name">{p.name}{cup.scope === 'grade' && p.className ? <small className="tc-muted"> · {p.className}</small> : null}</span>
            {p.seed ? <small className="tc-muted">#{p.seed}</small> : null}
            {p.outRound ? <small className="tc-muted">dừng ở {roundName(p.outRound, cup.rounds).toLowerCase()}</small> : cup.status === 'running' ? <small className="tc-ok">còn trong giải</small> : null}
            {cup.me.host && cup.status === 'signup' ? <Btn size="sm" kind="ghost" icon="close" aria-label={`Bỏ ${p.name}`} disabled={busy} onClick={() => onSet(p.userId, false)} /> : null}
          </li>
        ))}
      </ul>
      {cup.me.host && cup.status === 'signup' && missing.length ? (
        <details>
          <summary className="tc-small">Thêm học sinh ({missing.length} bạn chưa tham gia)</summary>
          <div className="tc-row tc-wrap">
            {missing.map((s) => <Btn key={s.id} size="sm" icon="plus" disabled={busy} onClick={() => onSet(s.id, true)}>{s.name}</Btn>)}
          </div>
        </details>
      ) : null}
    </section>
  );
}
