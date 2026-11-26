/**
 * Đấu trường (GV): giải đấu loại trực tiếp, bảng xếp hạng theo mùa, cài đặt chơi tự do của lớp.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ARENA_POINTS, type ClassInfo, type Profile } from '@openedu/contracts';
import { useArenaBoard, useArenaSeasons, useCups, useEndSeason } from '@openedu/data';
import { Avatar, Btn, ConfirmBar, Empty, ErrorNote, Loading, PageHead, Seg } from '../../components/common';
import { ClassPicker, useClassPick } from '../../lib/assess';
import { ArenaSettingsPanel } from './ArenaSettingsPanel';
import { CupDialog } from './CupDialog';
import { cupInfoLine, CupStatusChip, fmtTime, playerMap } from './shared';
import '../../styles/arena.css';

type Tab = 'giai' | 'xep-hang' | 'cai-dat';

export default function ArenaHome({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const [sp, setSp] = useSearchParams();
  const tab = (['giai', 'xep-hang', 'cai-dat'].includes(sp.get('the') ?? '') ? sp.get('the') : 'giai') as Tab;
  const setTab = (t: Tab) => setSp((p) => { const n = new URLSearchParams(p); n.set('the', t); return n; }, { replace: true });
  const [creating, setCreating] = useState(false);
  if (classes.isLoading) return <Loading />;
  if (!cls) return <Empty icon="trophy" title="Chưa có lớp">Thầy cô cần có lớp để mở Đấu trường.</Empty>;
  return (
    <div className="tc-page tc-arena">
      <PageHead title="Đấu trường" sub="Giải đấu loại trực tiếp nhiều vòng, bảng xếp hạng theo mùa, giờ mở cửa và câu hỏi cho phần chơi tự do (Đấu 1–1, Leo tháp)." actions={
        <Btn kind="primary" icon="trophy" onClick={() => setCreating(true)} data-testid="cup-new">Mở giải đấu</Btn>
      } />
      <div className="tc-row tc-wrap tc-arena__bar">
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <Seg label="Mục" value={tab} onChange={setTab} options={[
          { value: 'giai', label: 'Giải đấu' }, { value: 'xep-hang', label: 'Bảng xếp hạng' }, { value: 'cai-dat', label: 'Cài đặt' },
        ]} />
      </div>
      {tab === 'giai' ? <CupList cls={cls} onNew={() => setCreating(true)} /> : null}
      {tab === 'xep-hang' ? <BoardPanel cls={cls} /> : null}
      {tab === 'cai-dat' ? <ArenaSettingsPanel key={cls.id} cls={cls} /> : null}
      {creating ? <CupDialog classes={list} classId={classId} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function CupList({ cls, onNew }: { cls: ClassInfo; onNew: () => void }) {
  const q = useCups(cls.id, { live: true });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />;
  const list = q.data ?? [];
  if (!list.length) {
    return (
      <Empty icon="trophy" title="Chưa có giải đấu nào">
        <p>Mở giải: chọn môn, số câu mỗi trận, thời gian mỗi vòng. Cả lớp (hoặc cả khối) đấu loại trực tiếp đến khi còn một nhà vô địch.</p>
        <Btn kind="primary" icon="trophy" onClick={onNew}>Mở giải đấu</Btn>
      </Empty>
    );
  }
  return (
    <ul className="tc-cuplist" data-testid="cup-list">
      {list.map((c) => {
        const champ = c.champion ? playerMap(c).get(c.champion) : undefined;
        return (
          <li key={c.id}>
            <Link to={`/dau-truong/giai/${c.id}`} className="tc-card tc-cupcard" data-testid="cup-card">
              <div className="tc-row tc-wrap">
                <strong className="tc-cupcard__title">{c.title}</strong>
                <CupStatusChip cup={c} />
              </div>
              <p className="tc-small tc-muted">{cupInfoLine(c)}</p>
              {champ ? <p className="tc-small"><span aria-hidden="true">🏆</span> Vô địch: <b>{champ.name}</b></p> : null}
              {c.note ? <p className="tc-small tc-warn">{c.note}</p> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BoardPanel({ cls }: { cls: ClassInfo }) {
  const q = useArenaBoard(cls.id);
  const seasons = useArenaSeasons(cls.id);
  const end = useEndSeason();
  const [ask, setAsk] = useState(false);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />;
  const b = q.data!;
  const any = b.rows.some((r) => r.points > 0);
  return (
    <div className="tc-stack" data-testid="arena-board">
      <div className="tc-row tc-wrap">
        <h2 className="tc-h3">{b.seasonTitle || 'Mùa hiện tại'}</h2>
        <span className="tc-small tc-muted">{b.seasonStart ? `từ ${fmtTime(b.seasonStart)}` : 'tính từ đầu'}</span>
        <span className="tc-spacer" />
        <Link className="tc-btn" to={`/dau-truong/giay-khen?lop=${encodeURIComponent(cls.id)}&mua=hien-tai`} data-testid="board-print"><span>In giấy khen top 10</span></Link>
        <Btn kind="primary" icon="trophy" disabled={!any || end.isPending} onClick={() => setAsk(true)} data-testid="season-end">Kết thúc mùa & trao thưởng</Btn>
      </div>
      <p className="tc-small tc-muted">
        Điểm: Đấu 1–1 thắng {ARENA_POINTS.duelWin}, hoà {ARENA_POINTS.duelDraw} (mỗi ngày tính {ARENA_POINTS.duelPerDay} trận đầu), thắng Robo {ARENA_POINTS.botWin};
        giải đấu: thắng mỗi trận {ARENA_POINTS.cupWin}, Vô địch +{ARENA_POINTS.champion}, Á quân +{ARENA_POINTS.runnerUp}, Hạng ba +{ARENA_POINTS.third}.
        Học sinh chỉ thấy top 10 và vị trí của mình.
      </p>
      {ask ? (
        <div className="tc-card tc-stack">
          <label className="tc-small">Tên mùa (in trên giấy khen)
            <input className="tc-input" value={title} placeholder={b.seasonTitle || 'Ví dụ: Mùa học kì I'} maxLength={80} onChange={(e) => setTitle(e.target.value)} data-testid="season-title" />
          </label>
          <ConfirmBar text="Kết thúc mùa: 3 bạn dẫn đầu nhận sao (10 / 6 / 4) và cúp, top 10 được lưu để in giấy khen, mùa mới tính lại từ 0." confirmLabel="Kết thúc mùa"
            busy={end.isPending} onCancel={() => setAsk(false)}
            onConfirm={() => end.mutate({ classId: cls.id, ...(title.trim() ? { title: title.trim() } : {}) }, {
              onSuccess: (s) => { setAsk(false); setTitle(''); setMsg(`Đã kết thúc "${s.title}" và trao thưởng cho ${Math.min(3, s.top.length)} bạn dẫn đầu.`); },
            })} />
        </div>
      ) : null}
      {msg ? <p className="tc-alert tc-alert--ok" role="status"><span>{msg}</span></p> : null}
      <ErrorNote error={end.error} />
      <div className="tc-tablewrap">
        <table className="tc-table tc-arenatable">
          <thead><tr><th>Hạng</th><th>Học sinh</th><th>Điểm</th><th>Thắng</th><th>Số trận</th></tr></thead>
          <tbody>
            {b.rows.map((r) => (
              <tr key={r.userId} className={r.rank <= 3 && r.points > 0 ? `is-top${r.rank}` : undefined}>
                <td>{r.points > 0 ? r.rank : '–'}</td>
                <td><span className="tc-row"><Avatar mascot={r.mascot} color={r.color} size={24} />{r.name}</span></td>
                <td><b>{r.points}</b></td><td>{r.wins}</td><td>{r.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {seasons.data?.length ? (
        <section className="tc-stack">
          <h3 className="tc-h3">Các mùa đã kết thúc</h3>
          <ul className="tc-seasonlist">
            {seasons.data.map((s) => (
              <li key={s.id} className="tc-card">
                <div className="tc-row tc-wrap">
                  <strong>{s.title}</strong>
                  <span className="tc-small tc-muted">{s.startedAt ? `${fmtTime(s.startedAt)} – ` : ''}{fmtTime(s.endedAt)}</span>
                  <span className="tc-spacer" />
                  <Link className="tc-btn tc-btn--sm" to={`/dau-truong/giay-khen?lop=${encodeURIComponent(cls.id)}&mua=${encodeURIComponent(s.id)}`}><span>In giấy khen</span></Link>
                </div>
                <p className="tc-small">{s.top.slice(0, 3).map((r, i) => `${['🥇', '🥈', '🥉'][i] ?? ''} ${r.name} (${r.points})`).join(' · ') || 'Không có bạn nào có điểm.'}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
