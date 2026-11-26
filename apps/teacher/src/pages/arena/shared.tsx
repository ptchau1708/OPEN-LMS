/** Đấu trường (GV): phần dùng chung — trạng thái giải, nhánh đấu, bục vinh quang. */
import { useState } from 'react';
import { SUBJECTS, type Cup, type CupMatch, type CupPlayer } from '@openedu/contracts';
import { bracketSize, DECISION_TEXT, roundName } from '@openedu/data';
import { Icon } from '@openedu/ui';
import { Avatar, Btn } from '../../components/common';
import { cx } from '../../lib/format';

export function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

export function cupScopeText(c: Pick<Cup, 'scope' | 'className' | 'grade'>): string {
  return c.scope === 'grade' ? `Cả khối ${c.grade}` : `Lớp ${c.className ?? ''}`.trim();
}

export function cupStatusText(c: Cup): string {
  if (c.status === 'signup') return c.entry === 'signup' ? `Đang nhận đăng kí · bắt đầu ${fmtTime(c.startAt)}` : `Chờ bắt đầu · ${fmtTime(c.startAt)}`;
  if (c.status === 'running') return `Đang đấu · ${roundName(c.round, c.rounds)} (vòng ${c.round}/${c.rounds})`;
  if (c.status === 'finished') return 'Đã kết thúc';
  return 'Đã huỷ';
}

export function CupStatusChip({ cup }: { cup: Cup }) {
  const tone = cup.status === 'running' ? 'ok' : cup.status === 'signup' ? 'info' : cup.status === 'finished' ? 'gold' : 'muted';
  return <span className={cx('tc-chip', `tc-cupchip--${tone}`)} data-testid="cup-status">{cupStatusText(cup)}</span>;
}

export function cupSubject(c: Pick<Cup, 'subject'>): string {
  return SUBJECTS[c.subject]?.name ?? c.subject;
}

export function playerMap(cup: Cup): Map<string, CupPlayer> {
  return new Map(cup.players.map((p) => [p.userId, p]));
}

/** Vô địch, á quân, đồng hạng ba. */
export function Podium({ cup }: { cup: Cup }) {
  if (cup.status !== 'finished' || !cup.champion) return null;
  const P = playerMap(cup);
  const one = (u: string | undefined, label: string, cls: string) => {
    const p = u ? P.get(u) : undefined;
    if (!p) return null;
    return (
      <div className={cx('tc-podium__p', cls)} key={`${label}-${u}`}>
        <Icon name="trophy" size={cls === 'is-gold' ? 34 : 26} />
        <Avatar mascot={p.mascot} color={p.color} size={cls === 'is-gold' ? 48 : 38} />
        <strong>{p.name}</strong>
        <span className="tc-small">{label}{p.className && cup.scope === 'grade' ? ` · ${p.className}` : ''}</span>
      </div>
    );
  };
  return (
    <section className="tc-podium" aria-label="Kết quả giải" data-testid="cup-podium">
      {one(cup.runnerUp, 'Á quân', 'is-silver')}
      {one(cup.champion, 'Vô địch', 'is-gold')}
      {cup.thirds.map((t) => one(t, 'Hạng ba', 'is-bronze'))}
    </section>
  );
}

function PlayerLine({ p, m, cup, win }: { p?: CupPlayer; m: CupMatch; cup: Cup; win: boolean }) {
  if (!p) return <div className="tc-bm__p is-empty">—</div>;
  const r = m.result?.[p.userId];
  const done = m.status === 'open' && m.done?.includes(p.userId);
  return (
    <div className={cx('tc-bm__p', win && 'is-win', m.status === 'done' && !win && 'is-lose')}>
      <Avatar mascot={p.mascot} color={p.color} size={22} />
      <span className="tc-bm__name">{p.name}{cup.scope === 'grade' && p.className ? <small> · {p.className}</small> : null}</span>
      {p.seed ? <span className="tc-bm__seed" title="Hạt giống">#{p.seed}</span> : null}
      {r && m.decidedBy !== 'bye' ? <span className="tc-bm__score" title={`${r.correct} câu đúng, ${Math.round(r.ms / 1000)} giây`}>{r.correct}/{cup.questions}</span> : null}
      {done ? <span className="tc-bm__done" title="Đã đấu xong, chờ bạn kia">✓</span> : null}
      {win ? <Icon name="check" size={14} /> : null}
    </div>
  );
}

/** Nhánh đấu: mỗi vòng một cột; vòng chưa tới hiện ô trống. host: chọn người thắng ở vòng hiện tại. */
export function Bracket({ cup, onWinner, busy, big }: { cup: Cup; onWinner?: (m: CupMatch, userId: string) => void; busy?: boolean; big?: boolean }) {
  const P = playerMap(cup);
  const [pick, setPick] = useState<string | null>(null);
  if (cup.status === 'signup' || cup.rounds === 0) return null;
  const size = bracketSize(cup.players.length);
  const cols = Array.from({ length: cup.rounds }, (_, i) => i + 1);
  return (
    <div className={cx('tc-bracket', big && 'is-big')} data-testid="cup-bracket">
      {cols.map((r) => {
        const ms = cup.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
        const byes = ms.filter((m) => m.decidedBy === 'bye');
        const real = ms.filter((m) => m.decidedBy !== 'bye');
        const expected = size / 2 ** r;
        return (
          <section key={r} className={cx('tc-bracket__col', r === cup.round && cup.status === 'running' && 'is-now')} aria-label={roundName(r, cup.rounds)}>
            <h3 className="tc-bracket__h">{roundName(r, cup.rounds)}{ms[0]?.closesAt && r === cup.round && cup.status === 'running' ? <small> · đóng {fmtTime(ms[0].closesAt)}</small> : null}</h3>
            {byes.length ? (
              <details className="tc-bracket__byes">
                <summary>{byes.length} bạn được miễn đấu vòng này</summary>
                <p className="tc-small">{byes.map((m) => P.get(m.winner ?? '')?.name).filter(Boolean).join(', ')}</p>
              </details>
            ) : null}
            {real.map((m) => {
              const key = `${m.round}-${m.slot}`;
              const canPick = !!onWinner && cup.status === 'running' && m.round === cup.round && m.status === 'open' && m.p1 && m.p2;
              return (
                <article key={key} className={cx('tc-bm', m.status === 'open' && 'is-open')} data-testid="cup-match">
                  <PlayerLine p={P.get(m.p1 ?? '')} m={m} cup={cup} win={!!m.winner && m.winner === m.p1} />
                  <PlayerLine p={P.get(m.p2 ?? '')} m={m} cup={cup} win={!!m.winner && m.winner === m.p2} />
                  <p className="tc-bm__note tc-small">
                    {m.status === 'done' ? (m.decidedBy && m.decidedBy !== 'play' ? DECISION_TEXT[m.decidedBy] : 'Đã đấu')
                      : m.done?.length ? `${m.done.map((u) => P.get(u)?.name).join(', ')} đã đấu xong` : 'Chưa đấu'}
                  </p>
                  {canPick ? (pick === key ? (
                    <div className="tc-row tc-wrap tc-bm__pick">
                      {[m.p1!, m.p2!].map((u) => <Btn key={u} size="sm" disabled={busy} onClick={() => { setPick(null); onWinner!(m, u); }}>{P.get(u)?.name} thắng</Btn>)}
                      <Btn size="sm" kind="ghost" onClick={() => setPick(null)}>Thôi</Btn>
                    </div>
                  ) : <Btn size="sm" kind="ghost" onClick={() => setPick(key)} data-testid="cup-pick">Chọn người thắng</Btn>) : null}
                </article>
              );
            })}
            {!ms.length ? Array.from({ length: Math.min(expected, 8) }, (_, i) => (
              <article key={i} className="tc-bm is-future" aria-hidden="true"><div className="tc-bm__p is-empty">Chờ vòng trước</div><div className="tc-bm__p is-empty">&nbsp;</div></article>
            )) : null}
          </section>
        );
      })}
    </div>
  );
}

export function cupInfoLine(c: Cup): string {
  return [
    cupScopeText(c), cupSubject(c), `${c.questions} câu/trận`,
    c.pace === 'daily' ? `mỗi ngày một vòng (${c.roundMinutes >= 60 ? `${Math.round(c.roundMinutes / 60)} giờ` : `${c.roundMinutes} phút`})` : `mỗi vòng ${c.roundMinutes >= 60 ? `${Math.round(c.roundMinutes / 60)} giờ` : `${c.roundMinutes} phút`}`,
    `${c.players.length} học sinh`,
  ].join(' · ');
}

/** Như Field nhưng không bọc <label> — dùng cho nhóm nút (Seg), nhiều ô: nhãn không "dính" vào nút đầu tiên. */
export { GroupField } from '../../components/common';
