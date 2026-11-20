import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MASCOT_BY_ID, type Profile } from '@openedu/contracts';
import type { AccountSlip } from '@openedu/contracts';
import { generateStudentAccounts, parseNameList, useBulkCreateStudents, useClasses, useDataSource, useResetPassword, useSchoolUsers, useStudents } from '@openedu/data';
import { Avatar, Btn, Dialog, Empty, ErrorNote, Field, Loading, PageHead, Seg } from '../components/common';
import { SlipSheet } from './admin/Admin';
import { canPersistTeams, defaultTeams, persistTeams, TEAM_COLORS, teamsFor, useTeamsStore, type TeamDef } from '../lib/teams';
import { cx } from '../lib/format';

export default function Classes({ user }: { user: Profile }) {
  const ds = useDataSource();
  const [params, setParams] = useSearchParams();
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const classId = params.get('c') ?? classes.data?.[0]?.id;
  const cls = classes.data?.find((c) => c.id === classId);
  const students = useStudents(cls?.id);
  const local = useTeamsStore((s) => s.byClass);
  const setLocal = useTeamsStore((s) => s.set);
  const [teams, setTeams] = useState<TeamDef[]>([]);
  const [brush, setBrush] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const persist = canPersistTeams(ds);
  const bulk = useBulkCreateStudents();
  const reset = useResetPassword();
  const allUsers = useSchoolUsers();
  const [addOpen, setAddOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [slips, setSlips] = useState<{ list: AccountSlip[]; title: string } | null>(null);
  const names = useMemo(() => parseNameList(paste), [paste]);
  const preview = useMemo(() => (cls ? generateStudentAccounts(names, cls.name, (allUsers.data ?? []).map((u) => u.username ?? ''), (students.data?.length ?? 0) + 1) : []), [names, cls, allUsers.data, students.data]);

  useEffect(() => {
    if (!cls) return;
    const t = teamsFor(cls, local);
    const base = t.length ? t : defaultTeams(4, `t-${cls.id}`);
    const padded = base.length >= 4 ? base : [...base, ...defaultTeams(4, `t-${cls.id}-x`).slice(base.length)];
    setTeams(padded);
    setBrush(padded[0]?.id ?? null);
    setMsg('');
    // chỉ nạp lại khi đổi lớp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls?.id]);

  const teamOf = useMemo(() => { const m: Record<string, TeamDef> = {}; teams.forEach((t) => t.studentIds.forEach((id) => (m[id] = t))); return m; }, [teams]);
  const edit = (next: TeamDef[]) => { setTeams(next); setMsg(''); };
  const tap = (sid: string) => {
    if (!brush) return;
    const cur = teamOf[sid];
    edit(teams.map((t) => ({ ...t, studentIds: t.studentIds.filter((x) => x !== sid).concat(t.id === brush && cur?.id !== brush ? [sid] : []) })));
  };
  const count = Math.min(4, Math.max(2, teams.length));
  const setCount = (n: number) => {
    if (!cls) return;
    if (n <= teams.length) edit(teams.slice(0, n));
    else edit([...teams, ...defaultTeams(n, `t-${cls.id}-y`).slice(teams.length)]);
  };
  const autoSplit = () => {
    const ids = (students.data ?? []).map((s) => s.id);
    edit(teams.map((t, i) => ({ ...t, studentIds: ids.filter((_, j) => j % teams.length === i) })));
  };
  const saveTeams = async () => {
    if (!cls) return;
    setLocal(cls.id, teams);
    if (persist) {
      try { await persistTeams(ds, cls, teams); setMsg('Đã lưu tổ vào dữ liệu lớp.'); } catch (e) { setMsg(e instanceof Error ? e.message : 'Không lưu được.'); }
    } else setMsg('Đã lưu tổ trên máy này. Khi mở lớp trực tiếp, chọn “Chia đội → Theo tổ của lớp” để dùng.');
  };

  if (slips) return <SlipSheet slips={slips.list} title={slips.title} onBack={() => setSlips(null)} />;
  if (classes.isLoading) return <Loading />;
  if (!classes.data?.length) return <div className="tc-page"><Empty icon="team" title="Chưa có lớp nào" /></div>;

  return (
    <div className="tc-page">
      <PageHead title="Lớp học" sub="Danh sách học sinh và tổ thi đua dùng trong lớp trực tiếp." actions={<>
        {cls ? <Btn kind="primary" icon="plus" onClick={() => setAddOpen(true)}>Thêm học sinh</Btn> : null}
        {cls ? <Link className="tc-btn" to={`/lop/${cls.id}/ban-do-kien-thuc`}>Bản đồ kiến thức</Link> : null}
        <Seg label="Chọn lớp" value={cls?.id ?? ''} onChange={(v) => setParams({ c: v })} options={classes.data.map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))} />
      </>} />
      {cls ? (
        <div className="tc-classes">
          <section className="tc-card">
            <header className="tc-card__head"><h2>Lớp {cls.name} · {students.data?.length ?? cls.studentIds.length} học sinh</h2></header>
            <ErrorNote error={reset.error} />
            {students.isLoading ? <Loading /> : !(students.data ?? []).length ? (
              <p className="tc-muted" style={{ padding: '0 16px 16px' }}>Lớp chưa có học sinh. Bấm <strong>Thêm học sinh</strong> rồi dán danh sách họ tên để tạo tài khoản và in phiếu.</p>
            ) : (
              <ul className="tc-roster">
                {(students.data ?? []).map((s) => {
                  const t = teamOf[s.id];
                  return (
                    <li key={s.id}>
                      <button type="button" className={cx('tc-rostercard', brush && 'is-brush')} onClick={() => tap(s.id)} style={t ? { borderColor: t.color } : undefined} title={brush ? 'Chạm để xếp vào tổ đang chọn' : undefined}>
                        <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={44} />
                        <span><strong>{s.name}</strong><small className="tc-muted">{s.username} · bạn {MASCOT_BY_ID[s.avatarMascot]?.name}</small></span>
                        {t ? <span className="tc-teamtag" style={{ background: t.color }}>{t.name}</span> : <span className="tc-muted tc-small">Chưa có tổ</span>}
                      </button>
                      <Link className="tc-rosterlink" to={`/hoc-sinh/${s.id}`} aria-label={`Hồ sơ ${s.name}`}>Hồ sơ</Link>
                      <button type="button" className="tc-rosterlink tc-rosterlink--pw" disabled={reset.isPending} onClick={() => reset.mutate(s.id, { onSuccess: (sl) => setSlips({ list: [sl], title: `mat-khau-${sl.username}` }) })}>Mật khẩu</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="tc-card tc-stack">
            <header className="tc-card__head">
              <h2>Tổ thi đua</h2>
              <Seg label="Số tổ" value={count} onChange={setCount} options={[2, 3, 4].map((n) => ({ value: n, label: `${n} tổ` }))} />
            </header>
            <p className="tc-muted tc-small">Chọn một tổ rồi chạm vào học sinh để xếp vào (chạm lần nữa để bỏ ra).</p>
            {teams.map((t, i) => (
              <div key={t.id} className={cx('tc-teamed', brush === t.id && 'is-brush')} style={{ borderLeftColor: t.color }}>
                <div className="tc-row">
                  <input type="radio" name="brush" checked={brush === t.id} onChange={() => setBrush(t.id)} aria-label={`Chọn ${t.name} để xếp học sinh`} />
                  <input className="tc-input" value={t.name} onChange={(e) => edit(teams.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Tên tổ" />
                </div>
                <div className="tc-swatches" role="group" aria-label="Màu tổ">
                  {TEAM_COLORS.map((c) => <button key={c} type="button" aria-pressed={t.color === c} aria-label={`Màu ${c}`} style={{ background: c }} onClick={() => edit(teams.map((x, j) => (j === i ? { ...x, color: c } : x)))} />)}
                </div>
                <div className="tc-chips">
                  {t.studentIds.map((id) => { const s = students.data?.find((x) => x.id === id); return s ? <span key={id} className="tc-chip tc-chip--student"><Avatar mascot={s.avatarMascot} color={s.avatarColor} size={18} />{s.name}</span> : null; })}
                  {!t.studentIds.length ? <span className="tc-muted tc-small">Chưa có thành viên</span> : null}
                </div>
              </div>
            ))}
            <div className="tc-row tc-wrap">
              <Btn onClick={autoSplit}>Chia đều tự động</Btn>
              <Btn kind="primary" onClick={() => void saveTeams()}>Lưu tổ</Btn>
            </div>
            {msg ? <div className="tc-alert tc-alert--ok"><span>{msg}</span></div> : null}
            {!persist ? <p className="tc-muted tc-small">Nguồn dữ liệu hiện chưa có chức năng lưu lớp, nên tổ được lưu trên trình duyệt này và gửi vào phiên trực tiếp bằng lệnh chia đội.</p> : null}
          </section>
        </div>
      ) : null}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title={`Thêm học sinh vào lớp ${cls?.name ?? ''}`} wide
        footer={<><Btn onClick={() => setAddOpen(false)}>Hủy</Btn><Btn kind="primary" icon="plus" disabled={!names.length || bulk.isPending || !cls} onClick={() => cls && bulk.mutate({ classId: cls.id, names }, { onSuccess: (list) => { setPaste(''); setAddOpen(false); setSlips({ list, title: `tai-khoan-${cls.name}` }); } })}>{bulk.isPending ? 'Đang tạo…' : `Tạo ${names.length || ''} tài khoản & in phiếu`}</Btn></>}>
        <div className="tc-stack">
          <ErrorNote error={bulk.error} />
          <Field label="Dán danh sách “Họ tên” (mỗi dòng một em)" help="Dán thẳng cột từ Excel / Word được — STT, dòng tiêu đề và cột thừa tự bỏ. Mật khẩu tự sinh, chỉ hiện một lần trên phiếu.">
            <textarea className="tc-input" rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Nguyễn Minh An\nTrần Bảo Ngọc\nLê Đức Anh'} />
          </Field>
          {preview.length ? (
            <div>
              <p className="tc-muted">{preview.length} em · tên đăng nhập dự kiến:</p>
              <div className="tc-chips">{preview.map((a) => <span key={a.username} className="tc-chip" title={a.name}>{a.name} → <strong>{a.username}</strong></span>)}</div>
            </div>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
