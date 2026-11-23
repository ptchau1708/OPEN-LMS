/**
 * Thống kê thi đua (/thi-dua/thong-ke) — docs/THI_DUA.md
 * Đợt tuần / tháng / học kì: bảng vinh danh 10 em, điểm theo tổ, thống kê từng em (so với đợt trước),
 * lịch sử ghi nhận (cả lớp hoặc từng em, sửa nhầm bằng nút Xóa), xuất Excel, trình chiếu bảng vinh danh.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { BehaviorLog, Profile } from '@openedu/contracts';
import {
  bridge, classBehaviorStats, honorBoard, PERIOD_LABEL, periodRange, useBehaviorLogs, useBehaviors, useUndoBehavior,
  type ReportPeriod, type StudentBehaviorStats,
} from '@openedu/data';
import { Icon } from '@openedu/ui';
import { Avatar, Btn, Dialog, Empty, ErrorNote, Loading, PageHead, Seg } from '../../components/common';
import { ClassPicker, useClassPick, useRoster } from '../../lib/assess';
import { cx, fmtDateTime } from '../../lib/format';

type P = Exclude<ReportPeriod, 'ngay'>;
const PERIODS: P[] = ['tuan', 'thang', 'hoc-ki'];
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`.replace('-', '−'));
const MEDAL = ['🥇', '🥈', '🥉'];
const vnDay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

function History({ logs, behaviors, names, onUndo, busy, showStudent }: {
  logs: BehaviorLog[]; behaviors: Map<string, { icon: string; label: string }>; names: Map<string, string>;
  onUndo: (id: string) => void; busy: boolean; showStudent?: boolean;
}) {
  const [sure, setSure] = useState<string | null>(null);
  const [n, setN] = useState(100);
  if (!logs.length) return <p className="tc-muted tc-small">Chưa có ghi nhận nào trong đợt này.</p>;
  return (
    <>
      <table className="tc-table tc-table--compact" data-testid="bh-history">
        <thead><tr><th>Thời gian</th>{showStudent ? <th>Học sinh</th> : null}<th>Hành vi</th><th>Điểm</th><th>Ghi chú</th><th /></tr></thead>
        <tbody>{logs.slice(0, n).map((l) => {
          const b = behaviors.get(l.behaviorId);
          return (
            <tr key={l.id}>
              <td className="tc-small">{fmtDateTime(l.at)}</td>
              {showStudent ? <td>{names.get(l.studentId) ?? '—'}</td> : null}
              <td>{b?.icon} {b?.label ?? 'Hành vi đã xóa'}</td>
              <td className={l.points < 0 ? 'tc-warn' : 'tc-ok'}><b>{signed(l.points)}</b></td>
              <td className="tc-small">{l.note ?? ''}</td>
              <td>{sure === l.id
                ? <Btn size="sm" kind="danger" disabled={busy} onClick={() => { onUndo(l.id); setSure(null); }}>Xóa thật</Btn>
                : <Btn size="sm" kind="ghost" icon="trash" aria-label="Xóa ghi nhận nhầm" title="Xóa ghi nhận nhầm" onClick={() => setSure(l.id)} />}</td>
            </tr>
          );
        })}</tbody>
      </table>
      {logs.length > n ? <Btn size="sm" onClick={() => setN(n + 200)}>Xem thêm ({logs.length - n})</Btn> : null}
    </>
  );
}

export default function BehaviorStats({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const { roster, isLoading: rl } = useRoster(cls);
  const [period, setPeriod] = useState<P>('tuan');
  const [day, setDay] = useState(vnDay);
  const range = useMemo(() => periodRange(period, new Date(`${day}T12:00:00+07:00`)), [period, day]);
  const prevRange = useMemo(() => periodRange(period, new Date(Date.parse(range.from) - 3_600_000)), [period, range.from]);
  const logsQ = useBehaviorLogs({ classId, from: range.from, to: range.to, limit: 20_000 });
  const prevQ = useBehaviorLogs({ classId, from: prevRange.from, to: prevRange.to, limit: 20_000 });
  const behaviors = useBehaviors(classId);
  const undo = useUndoBehavior();
  const [who, setWho] = useState<StudentBehaviorStats | null>(null);
  const [allTime, setAllTime] = useState(false);
  const oneQ = useBehaviorLogs({ studentId: who?.studentId, ...(allTime ? {} : { from: range.from, to: range.to }), limit: 20_000 });
  const [show, setShow] = useState(false);
  const [fStudent, setFStudent] = useState('');
  const [fKind, setFKind] = useState<'' | 'pos' | 'neg'>('');

  const bmap = useMemo(() => new Map((behaviors.data ?? []).map((b) => [b.id, { icon: b.icon, label: b.label }])), [behaviors.data]);
  const names = useMemo(() => new Map(roster.map((s) => [s.id, s.name])), [roster]);
  const stats = useMemo(() => (cls && logsQ.data ? classBehaviorStats({ cls, students: roster, behaviors: behaviors.data ?? [], logs: logsQ.data, ...(prevQ.data ? { prevLogs: prevQ.data } : {}) }) : null), [cls, roster, behaviors.data, logsQ.data, prevQ.data]);
  const honor = stats ? honorBoard(stats, 10) : [];
  const prof = (id: string) => roster.find((s) => s.id === id);
  const classLogs = (logsQ.data ?? []).filter((l) => (!fStudent || l.studentId === fStudent) && (!fKind || (fKind === 'pos' ? l.points > 0 : l.points < 0))).sort((a, b) => b.at.localeCompare(a.at));

  const exportXlsx = () => {
    if (!stats || !cls) return;
    const title = `Thi đua lớp ${cls.name} — ${range.label}`;
    const top = (s: StudentBehaviorStats, pos: boolean) => s.byBehavior.filter((b) => (pos ? b.points > 0 : b.points < 0))[0];
    bridge.downloadBytes(`thi-dua-${cls.name}-${period}-${day}.xlsx`, bridge.writeXlsx([
      { name: 'Thống kê', header: 1, rows: [[title], ['Hạng', 'Học sinh', 'Điểm', 'So đợt trước', 'Lần tích cực', 'Lần cần cố gắng', 'Nổi bật', 'Cần cố gắng nhiều nhất'],
        ...stats.students.map((s) => [s.rank, s.name, s.points, s.delta ?? '', s.positive, s.needsWork, top(s, true) ? `${top(s, true)!.label} (${top(s, true)!.count})` : '', top(s, false) ? `${top(s, false)!.label} (${top(s, false)!.count})` : ''])] },
      { name: 'Vinh danh', header: 1, rows: [[`Bảng vinh danh — ${range.label}`], ['Hạng', 'Học sinh', 'Điểm', 'Lần tích cực'], ...honor.map((s) => [s.rank, s.name, s.points, s.positive])] },
      ...(stats.teams.length ? [{ name: 'Tổ', header: 1, rows: [[title], ['Tổ', 'Điểm', 'Lần tích cực', 'Lần cần cố gắng'], ...stats.teams.map((t) => [t.name, t.points, t.positive, t.needsWork])] }] : []),
      { name: 'Lịch sử', header: 1, rows: [[title], ['Thời gian', 'Học sinh', 'Hành vi', 'Điểm', 'Ghi chú'],
        ...[...(logsQ.data ?? [])].sort((a, b) => a.at.localeCompare(b.at)).map((l) => [fmtDateTime(l.at), names.get(l.studentId) ?? '', bmap.get(l.behaviorId)?.label ?? '', l.points, l.note ?? ''])] },
    ]));
  };

  if (classes.isLoading) return <Loading />;
  return (
    <div className="tc-page tc-page--wide tc-bhstats">
      <PageHead title="Thống kê thi đua" sub="Bảng vinh danh, điểm từng em và lịch sử ghi nhận theo tuần, tháng, học kì." actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <Link className="tc-btn" to="/thi-dua">Về ghi nhận</Link>
        <Btn icon="tv" disabled={!honor.length} onClick={() => setShow(true)} data-testid="honor-show">Trình chiếu vinh danh</Btn>
        <Btn icon="upload" disabled={!stats} onClick={exportXlsx} data-testid="bh-export">Xuất Excel</Btn>
      </>} />
      <div className="tc-toolbar">
        <Seg label="Đợt" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
        <input className="tc-input" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Ngày trong đợt" />
        <strong data-testid="bh-range">{range.label}</strong>
        <span className="tc-ebar__spacer" />
        {stats ? <span className="tc-small tc-muted">{stats.totals.logs} lần ghi nhận · {stats.totals.positive} tích cực · {stats.totals.needsWork} cần cố gắng</span> : null}
      </div>
      <ErrorNote error={logsQ.error ?? behaviors.error ?? undo.error} onRetry={() => void logsQ.refetch()} />
      {rl || logsQ.isLoading ? <Loading /> : !roster.length ? <Empty icon="team" title="Lớp chưa có học sinh" /> : stats ? (
        <>
          <section className="tc-card" aria-label="Bảng vinh danh">
            <header className="tc-card__head"><h2><Icon name="trophy" size={18} /> Bảng vinh danh {PERIOD_LABEL[period].toLowerCase()} — {honor.length ? `${honor.length} em` : 'chưa có'}</h2></header>
            {!honor.length ? <p className="tc-muted tc-small">Chưa em nào có điểm thi đua dương trong đợt này.</p> : (
              <ol className="tc-honor" data-testid="honor-board">
                {honor.map((s) => {
                  const p = prof(s.studentId);
                  const best = s.byBehavior.find((b) => b.points > 0);
                  return (
                    <li key={s.studentId} className={cx(s.rank <= 3 && `is-top${s.rank}`)}>
                      <span className="tc-honor__rank">{MEDAL[s.rank - 1] ?? s.rank}</span>
                      {p ? <Avatar mascot={p.avatarMascot} color={p.avatarColor} size={44} /> : null}
                      <span className="tc-honor__name"><strong>{s.name}</strong>{best ? <small className="tc-muted">{best.icon} {best.label} ×{best.count}</small> : null}</span>
                      <b className="tc-honor__pts">{signed(s.points)}</b>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {stats.teams.length ? (
            <section className="tc-card">
              <header className="tc-card__head"><h2>Theo tổ</h2></header>
              <ol className="tc-board">{stats.teams.map((t, i) => <li key={t.id}><b>{i + 1}</b><i style={{ background: t.color }} aria-hidden="true" /><span>{t.name}</span><small className="tc-muted">{t.positive}↑ {t.needsWork ? `${t.needsWork}↓` : ''}</small><strong>{t.points}</strong></li>)}</ol>
            </section>
          ) : null}

          <section className="tc-card tc-card--flush">
            <header className="tc-card__head"><h2>Thống kê từng học sinh</h2></header>
            <div className="tc-tablewrap">
              <table className="tc-table" data-testid="bh-stats">
                <thead><tr><th>Hạng</th><th>Học sinh</th><th>Điểm</th><th title={`So với ${prevRange.label}`}>So đợt trước</th><th>Tích cực</th><th>Cần cố gắng</th><th>Nổi bật</th><th>Cần cố gắng nhiều nhất</th><th /></tr></thead>
                <tbody>{stats.students.map((s) => {
                  const best = s.byBehavior.find((b) => b.points > 0);
                  const worst = s.byBehavior.find((b) => b.points < 0);
                  const p = prof(s.studentId);
                  return (
                    <tr key={s.studentId}>
                      <td>{s.rank}</td>
                      <td><span className="tc-row">{p ? <Avatar mascot={p.avatarMascot} color={p.avatarColor} size={24} /> : null}{s.name}</span></td>
                      <td><b className={s.points < 0 ? 'tc-warn' : undefined}>{signed(s.points)}</b></td>
                      <td className={cx('tc-small', (s.delta ?? 0) > 0 ? 'tc-ok' : (s.delta ?? 0) < 0 ? 'tc-warn' : 'tc-muted')}>{s.delta === undefined ? '…' : s.delta === 0 ? '=' : `${s.delta > 0 ? '▲' : '▼'} ${Math.abs(s.delta)}`}</td>
                      <td>{s.positive}</td>
                      <td>{s.needsWork}</td>
                      <td className="tc-small">{best ? `${best.icon} ${best.label} ×${best.count}` : '—'}</td>
                      <td className="tc-small">{worst ? `${worst.icon} ${worst.label} ×${worst.count}` : '—'}</td>
                      <td><Btn size="sm" onClick={() => { setAllTime(false); setWho(s); }} data-testid="bh-student-history">Lịch sử</Btn></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </section>

          {stats.topBehaviors.length ? (
            <section className="tc-card">
              <header className="tc-card__head"><h2>Hành vi được ghi nhận nhiều nhất</h2></header>
              <div className="tc-chips">{stats.topBehaviors.map((b) => <span key={b.behaviorId} className={cx('tc-chip', b.points > 0 ? 'tc-chip--ok' : 'tc-chip--warn')}>{b.icon} {b.label} ×{b.count}</span>)}</div>
            </section>
          ) : null}

          <section className="tc-card">
            <header className="tc-card__head">
              <h2>Lịch sử ghi nhận cả lớp</h2>
              <span className="tc-row tc-wrap">
                <select className="tc-input tc-input--sm" value={fStudent} onChange={(e) => setFStudent(e.target.value)} aria-label="Lọc theo học sinh">
                  <option value="">Mọi học sinh</option>{roster.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="tc-input tc-input--sm" value={fKind} onChange={(e) => setFKind(e.target.value as '' | 'pos' | 'neg')} aria-label="Lọc theo loại">
                  <option value="">Tích cực và cần cố gắng</option><option value="pos">Chỉ tích cực</option><option value="neg">Chỉ cần cố gắng</option>
                </select>
              </span>
            </header>
            <History logs={classLogs} behaviors={bmap} names={names} busy={undo.isPending} onUndo={(id) => undo.mutate(id)} showStudent />
          </section>
        </>
      ) : null}

      {who ? (
        <Dialog open wide title={`Lịch sử thi đua — ${who.name}`} onClose={() => setWho(null)}>
          <div className="tc-stack" data-testid="bh-student-dialog">
            <div className="tc-row tc-wrap">
              <Seg label="Khoảng thời gian" value={allTime ? 'all' : 'p'} onChange={(v) => setAllTime(v === 'all')} options={[{ value: 'p', label: range.label }, { value: 'all', label: 'Từ trước tới nay' }]} />
            </div>
            {oneQ.isLoading ? <Loading /> : (() => {
              const ls = [...(oneQ.data ?? [])].sort((a, b) => b.at.localeCompare(a.at));
              const pts = ls.reduce((t, l) => t + l.points, 0);
              const counts = new Map<string, number>();
              ls.forEach((l) => counts.set(l.behaviorId, (counts.get(l.behaviorId) ?? 0) + 1));
              return (
                <>
                  <div className="tc-chips">
                    <span className="tc-chip">Tổng {signed(pts)} điểm</span>
                    <span className="tc-chip tc-chip--ok">{ls.filter((l) => l.points > 0).length} lần tích cực</span>
                    <span className="tc-chip tc-chip--warn">{ls.filter((l) => l.points < 0).length} lần cần cố gắng</span>
                    {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, c]) => <span key={id} className="tc-chip">{bmap.get(id)?.icon} {bmap.get(id)?.label ?? '—'} ×{c}</span>)}
                  </div>
                  <History logs={ls} behaviors={bmap} names={names} busy={undo.isPending} onUndo={(id) => undo.mutate(id)} />
                </>
              );
            })()}
          </div>
        </Dialog>
      ) : null}

      {show && cls ? (
        <div className="tc-honorshow" role="dialog" aria-label="Bảng vinh danh">
          <div className="tc-honorshow__bar tc-noprint">
            <Btn onClick={() => window.print()}>In</Btn>
            <Btn kind="primary" onClick={() => setShow(false)}>Đóng</Btn>
          </div>
          <h1>🏆 Bảng vinh danh lớp {cls.name}</h1>
          <p>{range.label}</p>
          <ol>
            {honor.map((s) => {
              const p = prof(s.studentId);
              return (
                <li key={s.studentId} className={cx(s.rank <= 3 && `is-top${s.rank}`)}>
                  <span className="tc-honorshow__rank">{MEDAL[s.rank - 1] ?? s.rank}</span>
                  {p ? <Avatar mascot={p.avatarMascot} color={p.avatarColor} size={72} /> : null}
                  <strong>{s.name}</strong>
                  <b>{s.points} điểm</b>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
