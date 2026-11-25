import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MASTERY_LEVEL_LABEL, type MasteryLevel, type Profile } from '@openedu/contracts';
import { foldVietnamese, useClasses, useClassHeatmap, useStudents } from '@openedu/data';
import { Avatar, Btn, Empty, Loading, PageHead, Seg } from '../components/common';
import { NotesExcelImport } from '../components/NotesExcelImport';
import { cx } from '../lib/format';
import { countsByStudent, GROUP_BY_ID, GROUPS, groupOf, type GroupId } from '../lib/groups';
import { LevelBar, Legend } from './Dashboard';
import '../styles/dashboard.css';

const EMPTY: Record<MasteryLevel, number> = { vung: 0, 'dang-hoc': 0, 'can-on': 0, 'chua-hoc': 0 };

/** Danh sách hồ sơ học sinh: chọn lớp, tìm theo tên, lọc theo nhóm phân hóa. */
export default function Students({ user }: { user: Profile }) {
  const [params, setParams] = useSearchParams();
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const list = classes.data ?? [];
  const cls = list.find((c) => c.id === params.get('c')) ?? list[0];
  const students = useStudents(cls?.id);
  const hm = useClassHeatmap(cls?.id);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<GroupId | 'all'>('all');
  const [nx, setNx] = useState(false);
  const [nxDone, setNxDone] = useState<number | null>(null);

  const counts = useMemo(() => countsByStudent(hm.data), [hm.data]);
  const rows = useMemo(() => (students.data ?? []).map((s) => {
    const c = counts[s.id] ?? EMPTY;
    return { s, c, g: groupOf(c) };
  }), [students.data, counts]);
  const perGroup = useMemo(() => { const m: Record<string, number> = {}; rows.forEach((r) => { m[r.g] = (m[r.g] ?? 0) + 1; }); return m; }, [rows]);
  const needle = foldVietnamese(q.trim());
  const shown = rows
    .filter((r) => (group === 'all' || r.g === group) && (!needle || foldVietnamese(`${r.s.name} ${r.s.username ?? ''}`).includes(needle)))
    .sort((a, b) => (b.c['can-on'] - a.c['can-on']) || a.s.name.localeCompare(b.s.name, 'vi'));

  if (classes.isLoading) return <Loading />;
  if (!cls) return <div className="tc-page"><Empty icon="team" title="Chưa có lớp nào">{user.role === 'admin' ? <>Tạo lớp ở <Link to="/quan-tri/lop">Quản trị → Quản lí lớp</Link>.</> : 'Nhờ quản trị trường phân công lớp cho thầy cô.'}</Empty></div>;

  return (
    <div className="tc-page db-page">
      <PageHead title="Hồ sơ học sinh" sub="Mỗi em nắm được gì, cần hỗ trợ gì. Bấm vào một em để xem hồ sơ đầy đủ."
        actions={<>
          {list.length > 1 ? <Seg label="Chọn lớp" value={cls.id} onChange={(v) => setParams({ c: v })} options={list.map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} /> : null}
          <Btn icon="upload" disabled={!students.data?.length} onClick={() => { setNx(true); setNxDone(null); }} data-testid="nx-open">Nhập thông tin từ Excel</Btn>
        </>} />
      {nxDone !== null ? <div className="tc-alert tc-alert--ok" role="status"><span>Đã nhập {nxDone} ghi chép vào hồ sơ học sinh (mục Thông tin bổ sung).</span><Btn size="sm" kind="ghost" icon="close" aria-label="Đóng thông báo" onClick={() => setNxDone(null)} /></div> : null}
      {nx && students.data ? <NotesExcelImport cls={cls} students={students.data} onClose={() => setNx(false)} onDone={(n) => { setNx(false); setNxDone(n); }} /> : null}

      <div className="st-bar">
        <input className="tc-input st-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc tên đăng nhập…" aria-label="Tìm học sinh" />
        <div className="st-groups" role="group" aria-label="Lọc theo nhóm phân hóa">
          <button type="button" className={cx('st-group', group === 'all' && 'is-on')} aria-pressed={group === 'all'} onClick={() => setGroup('all')}>Cả lớp <b>{rows.length}</b></button>
          {GROUPS.map((g) => (
            <button key={g.id} type="button" className={cx('st-group', `st-group--${g.id}`, group === g.id && 'is-on')} aria-pressed={group === g.id} title={g.hint} onClick={() => setGroup(g.id)}>
              {g.label} <b>{perGroup[g.id] ?? 0}</b>
            </button>
          ))}
        </div>
      </div>
      {group !== 'all' ? <p className="tc-muted tc-small st-hint">{GROUP_BY_ID[group].hint}</p> : null}

      {students.isLoading ? <Loading /> : !rows.length ? (
        <section className="tc-card"><Empty icon="team" title="Lớp chưa có học sinh">Thêm học sinh ở <Link to={`/lop?c=${cls.id}`}>Lớp học → Thêm học sinh</Link>.</Empty></section>
      ) : !shown.length ? <p className="tc-muted">Không có em nào khớp.</p> : (
        <>
          <ul className="st-grid">
            {shown.map(({ s, c, g }) => (
              <li key={s.id}>
                <Link to={`/hoc-sinh/${s.id}`} className="st-card">
                  <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={44} />
                  <span className="st-card__main">
                    <strong>{s.name}</strong>
                    <small className="tc-muted">{s.username}</small>
                  </span>
                  <span className={cx('st-tag', `st-tag--${g}`)}>{GROUP_BY_ID[g].label}</span>
                  <span className="st-card__bar"><LevelBar counts={c} label={`Mức thành thạo của ${s.name}`} /></span>
                  <small className="st-card__nums tc-muted">{g === 'chua-co' ? 'Chưa làm bài có gắn kĩ năng' : <>Vững <b>{c.vung}</b> · Đang học <b>{c['dang-hoc']}</b> · Cần ôn <b>{c['can-on']}</b></>}</small>
                </Link>
              </li>
            ))}
          </ul>
          <Legend items={(['vung', 'dang-hoc', 'can-on', 'chua-hoc'] as MasteryLevel[]).map((l) => ({ cls: `db-lv db-lv--${l === 'vung' ? 'vung' : l === 'dang-hoc' ? 'dang' : l === 'can-on' ? 'canon' : 'chua'}`, label: MASTERY_LEVEL_LABEL[l] }))} />
          <p className="tc-muted tc-small">Mức thành thạo hiện tính cho Toán lớp {cls.grade}. Nhóm phân hóa tính lại mỗi lần mở trang, không phải nhãn cố định của học sinh.</p>
        </>
      )}
    </div>
  );
}
