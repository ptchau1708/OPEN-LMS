import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ATTENDANCE_LABEL, type AttendanceStatus, type Profile } from '@openedu/contracts';
import { useAttendance, useSaveAttendance } from '@openedu/data';
import { Avatar, Btn, Empty, ErrorNote, Loading, PageHead } from '../../components/common';
import { ClassPicker, useClassPick, useRoster, vnToday } from '../../lib/assess';
import { cx } from '../../lib/format';

const STATUSES: AttendanceStatus[] = ['co-mat', 'muon', 'vang-co-phep', 'vang-khong-phep'];
const SHORT: Record<AttendanceStatus, string> = { 'co-mat': 'Có mặt', muon: 'Muộn', 'vang-co-phep': 'Vắng P', 'vang-khong-phep': 'Vắng KP' };
const CODE: Record<AttendanceStatus, string> = { 'co-mat': '', muon: 'M', 'vang-co-phep': 'P', 'vang-khong-phep': 'K' };

export default function Attendance({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const { roster, isLoading: rl } = useRoster(cls);
  const [date, setDate] = useState(vnToday());
  const month = date.slice(0, 7);
  // Ngày cuối tháng thật (tháng 11 có 30 ngày — "2026-11-31" làm Postgres báo lỗi ngày không hợp lệ).
  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
  }, [month]);
  const q = useAttendance(classId, range);
  const save = useSaveAttendance();
  const [entries, setEntries] = useState<Record<string, AttendanceStatus>>({});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const rec = q.data?.find((r) => r.date === date);

  useEffect(() => { setEntries(rec?.entries ?? {}); setDirty(false); setSaved(false); }, [rec, date, classId]);
  const st = (id: string): AttendanceStatus => entries[id] ?? 'co-mat';
  const set = (id: string, s: AttendanceStatus) => { setEntries((e) => ({ ...e, [id]: s })); setDirty(true); setSaved(false); };
  const counts = STATUSES.map((s) => ({ s, n: roster.filter((r) => st(r.id) === s).length }));
  const onSave = () => save.mutate({ classId, date, entries: Object.fromEntries(roster.map((r) => [r.id, st(r.id)])) }, { onSuccess: () => { setDirty(false); setSaved(true); } });

  const days = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [q.data]);
  const isWeekend = date ? [0, 6].includes(new Date(`${date}T12:00:00`).getDay()) : false;

  return (
    <div className="tc-page tc-page--wide">
      <PageHead title="Điểm danh" sub="Mặc định mọi em có mặt — chỉ chạm vào em vắng hoặc đi muộn rồi bấm Lưu." actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <label className="tc-row tc-small">Ngày <input className="tc-input tc-input--sm" type="date" value={date} max={vnToday()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
      </>} />
      <ErrorNote error={classes.error ?? q.error ?? save.error} onRetry={() => void q.refetch()} />
      {rl || q.isLoading ? <Loading /> : !roster.length ? <Empty icon="team" title="Lớp chưa có học sinh" /> : (
        <>
          <div className="tc-toolbar">
            {counts.map((c) => <span key={c.s} className={cx('tc-chip', c.s === 'co-mat' ? 'tc-chip--ok' : c.n ? 'tc-chip--warn' : '')}>{ATTENDANCE_LABEL[c.s]}: {c.n}</span>)}
            {isWeekend ? <span className="tc-small tc-muted">Ngày nghỉ cuối tuần</span> : null}
            <span className="tc-ebar__spacer" />
            {rec && !dirty ? <span className="tc-small tc-ok">Đã điểm danh ngày này</span> : saved ? <span className="tc-small tc-ok" role="status">Đã lưu</span> : dirty ? <span className="tc-small tc-warn">Chưa lưu</span> : <span className="tc-small tc-muted">Chưa điểm danh</span>}
            <Btn kind="primary" icon="check" size="lg" disabled={save.isPending || (!dirty && !!rec)} onClick={onSave}>{save.isPending ? 'Đang lưu…' : 'Lưu điểm danh'}</Btn>
          </div>
          <ul className="tc-attgrid">
            {roster.map((s) => {
              const v = st(s.id);
              return (
                <li key={s.id} className={cx('tc-att', `tc-att--${v}`)}>
                  <button type="button" className="tc-att__who" onClick={() => set(s.id, v === 'co-mat' ? 'vang-co-phep' : 'co-mat')} aria-label={`${s.name}: ${ATTENDANCE_LABEL[v]}. Chạm để đổi`}>
                    <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={36} />
                    <strong>{s.name}</strong>
                  </button>
                  <span className="tc-att__opts" role="radiogroup" aria-label={`Trạng thái của ${s.name}`}>
                    {STATUSES.map((x) => <button key={x} type="button" role="radio" aria-checked={v === x} className={cx(v === x && 'is-on', `is-${x}`)} onClick={() => set(s.id, x)}>{SHORT[x]}</button>)}
                  </span>
                </li>
              );
            })}
          </ul>

          <section className="tc-card">
            <header className="tc-card__head"><h2>Tổng hợp tháng {month.slice(5)}/{month.slice(0, 4)}</h2><span className="tc-small tc-muted">M muộn · P vắng có phép · K vắng không phép · {days.length} ngày đã điểm danh</span></header>
            {!days.length ? <p className="tc-small tc-muted">Tháng này chưa có ngày nào.</p> : (
              <div className="tc-tablewrap">
                <table className="tc-table tc-attmonth">
                  <thead><tr><th>Học sinh</th>{days.map((d) => <th key={d.date} className={cx(d.date === date && 'is-cur')}><button type="button" onClick={() => setDate(d.date)}>{Number(d.date.slice(8))}</button></th>)}<th>Có mặt</th><th>M</th><th>P</th><th>K</th></tr></thead>
                  <tbody>
                    {roster.map((s) => {
                      const vals = days.map((d) => d.entries[s.id] ?? 'co-mat');
                      const n = (x: AttendanceStatus) => vals.filter((v) => v === x).length;
                      return (
                        <tr key={s.id}>
                          <td><Link to={`/hoc-sinh/${s.id}`}>{s.name}</Link></td>
                          {vals.map((v, i) => <td key={days[i].date} className={cx('tc-attcell', v !== 'co-mat' && `is-${v}`)} title={ATTENDANCE_LABEL[v]}>{CODE[v] || '·'}</td>)}
                          <td>{n('co-mat')}/{days.length}</td><td>{n('muon') || ''}</td><td>{n('vang-co-phep') || ''}</td><td className={n('vang-khong-phep') ? 'tc-warn' : ''}>{n('vang-khong-phep') || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
