import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Behavior as BehaviorDef, Profile } from '@openedu/contracts';
import { Icon } from '@openedu/ui';
import { useBehaviorLogs, useBehaviors, useClassLeaderboard, useDeleteBehavior, useRecordBehavior, useSaveBehavior, useUndoBehavior } from '@openedu/data';
import { Avatar, Btn, Dialog, Empty, ErrorNote, Loading, PageHead } from '../../components/common';
import { ClassPicker, useClassPick, useRoster } from '../../lib/assess';
import { cx, relTime } from '../../lib/format';

type Target = { kind: 'student' | 'team' | 'many'; ids: string[]; label: string };
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`.replace('-', '−'));

/** Biểu tượng gợi ý cho hành vi (vẫn gõ / dán emoji khác được). */
const ICONS_POSITIVE = ['🙋', '🤝', '🤫', '✅', '✍️', '💎', '⭐', '🌟', '👏', '💡', '📚', '🧹', '🎨', '🏃', '🎵', '🌱', '❤️', '😊', '🏆', '👍', '🧠', '🗣️', '⏰', '🎯'];
const ICONS_NEEDS = ['🎒', '💬', '📒', '⏰', '🙉', '😴', '📵', '🚫', '🗑️', '😠', '✏️', '🏃', '⚠️', '🔇', '📝', '🤚'];

function IconPick({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="tc-iconpick" ref={ref}>
      <button type="button" className="tc-input tc-input--sm tc-bheditor__icon" aria-label="Đổi biểu tượng" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="bh-icon">{value || '＋'}</button>
      {open && (
        <div className="tc-iconpick__pop" role="dialog" aria-label="Chọn biểu tượng">
          <div className="tc-iconpick__grid">
            {options.map((ic) => (
              <button key={ic} type="button" className={cx('tc-iconpick__opt', ic === value && 'is-on')} onClick={() => { onChange(ic); setOpen(false); }} aria-label={`Biểu tượng ${ic}`}>{ic}</button>
            ))}
          </div>
          <label className="tc-iconpick__own">
            <span className="tc-small tc-muted">Hoặc dán emoji khác</span>
            <input className="tc-input tc-input--sm" value={value} maxLength={4} onChange={(e) => onChange(e.target.value)} aria-label="Emoji khác" />
          </label>
        </div>
      )}
    </div>
  );
}

function BehaviorEditor({ classId, list, onClose }: { classId: string; list: BehaviorDef[]; onClose: () => void }) {
  const save = useSaveBehavior();
  const remove = useDeleteBehavior();
  const [rows, setRows] = useState<BehaviorDef[]>(list);
  const [changed, setChanged] = useState<Set<number>>(new Set());
  /** Chỉ số các dòng sẽ xoá khi bấm Lưu. */
  const [gone, setGone] = useState<Set<number>>(new Set());
  const toggleGone = (i: number) => setGone((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const upd = (i: number, p: Partial<BehaviorDef>) => { setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x))); setChanged((s) => new Set(s).add(i)); };
  const add = (positive: boolean) => {
    setRows((r) => [...r, positive ? { id: '', classId, label: '', points: 1, icon: '⭐', kind: 'positive' } : { id: '', classId, label: '', points: -1, icon: '⚠️', kind: 'needs-work' }]);
    setChanged((s) => new Set(s).add(rows.length));
  };
  const submit = async () => {
    for (const i of Array.from(gone)) if (rows[i]!.id) await remove.mutateAsync({ classId, id: rows[i]!.id });
    for (const i of Array.from(changed)) {
      if (gone.has(i) || !rows[i].label.trim()) continue;
      await save.mutateAsync({ ...rows[i], label: rows[i].label.trim(), classId, kind: rows[i].points >= 0 ? 'positive' : 'needs-work' });
    }
    onClose();
  };
  const group = (positive: boolean) => {
    const idx = rows.map((b, i) => ({ b, i })).filter(({ b }) => (b.points >= 0) === positive);
    return (
      <section className={cx('tc-bhgroup', positive ? 'tc-bhgroup--pos' : 'tc-bhgroup--neg')} data-testid={positive ? 'bh-group-pos' : 'bh-group-neg'}>
        <h3 className="tc-bhgroup__h">{positive ? 'Hành vi tích cực (cộng điểm)' : 'Điều cần cố gắng (trừ điểm)'} <span className="tc-muted tc-small">{idx.length}</span></h3>
        {idx.length ? (
          <ul className="tc-bheditor">
            {idx.map(({ b, i }) => (
              <li key={b.id || `new${i}`} className={gone.has(i) ? 'is-gone' : undefined}>
                <IconPick value={b.icon} options={positive ? ICONS_POSITIVE : ICONS_NEEDS} onChange={(icon) => upd(i, { icon })} />
                <input className="tc-input tc-input--sm tc-grow" aria-label="Tên hành vi" placeholder={positive ? 'vd: Hăng hái phát biểu' : 'vd: Quên đồ dùng học tập'} value={b.label} onChange={(e) => upd(i, { label: e.target.value })} />
                <select className="tc-input tc-input--sm" aria-label="Điểm" value={b.points} onChange={(e) => upd(i, { points: Number(e.target.value) })}>
                  {(positive ? [1, 2, 3] : [-1, -2, -3]).map((n) => <option key={n} value={n}>{signed(n)}</option>)}
                </select>
                <Btn size="sm" kind="ghost" icon={gone.has(i) ? 'retry' : 'trash'} aria-label={gone.has(i) ? `Giữ lại ${b.label || 'hành vi'}` : `Xoá ${b.label || 'hành vi'}`} title={gone.has(i) ? 'Giữ lại' : 'Xoá (khi bấm Lưu)'} onClick={() => toggleGone(i)} data-testid="bh-delete" />
              </li>
            ))}
          </ul>
        ) : <p className="tc-muted tc-small">Chưa có.</p>}
        <Btn size="sm" icon="plus" onClick={() => add(positive)}>{positive ? 'Thêm hành vi tích cực' : 'Thêm điều cần cố gắng'}</Btn>
      </section>
    );
  };
  return (
    <Dialog open wide title="Danh sách hành vi thi đua" onClose={onClose} footer={<>
      <span className="tc-small tc-muted">Điểm dương cộng sao cho học sinh (1 sao/điểm). Bấm vào biểu tượng để đổi.</span>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" disabled={save.isPending || remove.isPending || (!changed.size && !gone.size)} onClick={() => void submit().catch(() => undefined)}>{save.isPending ? 'Đang lưu…' : 'Lưu'}</Btn>
    </>}>
      <div className="tc-bhgroups">
        {group(true)}
        {group(false)}
      </div>
      {gone.size ? <p className="tc-small tc-warn">{gone.size} hành vi sẽ bị xoá khi bấm Lưu. Điểm đã ghi trước đây vẫn được giữ.</p> : null}
      <ErrorNote error={save.error ?? remove.error} />
    </Dialog>
  );
}

export default function BehaviorPage({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const { roster, isLoading: rl } = useRoster(cls);
  const behaviors = useBehaviors(classId);
  const board = useClassLeaderboard(classId);
  const logs = useBehaviorLogs({ classId, limit: 8 });
  const record = useRecordBehavior();
  const undo = useUndoBehavior();
  const [target, setTarget] = useState<Target | null>(null);
  const [multi, setMulti] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; logIds: string[] } | null>(null);
  const [editor, setEditor] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const lb = board.data;
  const ptsOf = (id: string) => lb?.students.find((s) => s.id === id)?.points ?? 0;
  const teamPts = (id: string) => lb?.teams.find((t) => t.id === id)?.points ?? 0;
  const teamMode = lb?.mode === 'team' && (cls?.teams.length ?? 0) > 0;
  const bl = behaviors.data ?? [];

  const give = (b: BehaviorDef) => {
    if (!target) return;
    const t = target;
    record.mutate({ classId, behaviorId: b.id, studentIds: t.ids, by: user.id }, {
      onSuccess: (res) => {
        window.clearTimeout(timer.current);
        setToast({ text: `${b.icon} ${signed(b.points)} ${b.label} — ${t.label}`, logIds: res.map((l) => l.id) });
        timer.current = window.setTimeout(() => setToast(null), 6000);
        setTarget(null); setSel(new Set()); setMulti(false);
      },
    });
  };
  const doUndo = async () => {
    if (!toast) return;
    const ids = toast.logIds;
    setToast(null);
    for (const id of ids) await undo.mutateAsync(id).catch(() => undefined);
  };
  const tapStudent = (id: string, name: string) => {
    if (multi) setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    else setTarget({ kind: 'student', ids: [id], label: name });
  };

  return (
    <div className="tc-page tc-page--wide">
      <PageHead title="Thi đua" sub="Chạm vào em (hoặc tổ) để ghi nhận. Điểm tính từ thứ Hai tuần này." actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <Link className="tc-btn tc-btn--primary" to="/thi-dua/thong-ke" data-testid="bh-stats-link"><Icon name="trophy" size={16} /> <span>Thống kê &amp; vinh danh</span></Link>
        <Btn icon="settings" onClick={() => setEditor(true)} disabled={!bl.length}>Sửa danh sách hành vi</Btn>
      </>} />
      <ErrorNote error={classes.error ?? behaviors.error ?? board.error ?? record.error ?? undo.error} onRetry={() => { void board.refetch(); void behaviors.refetch(); }} />
      {rl || board.isLoading ? <Loading /> : !roster.length ? <Empty icon="team" title="Lớp chưa có học sinh" /> : (
        <div className="tc-bh">
          <div className="tc-bh__main">
            {teamMode && cls ? (
              <section aria-label="Tổ">
                <h2 className="tc-h3">Theo tổ</h2>
                <div className="tc-teamgrid">
                  {cls.teams.map((t) => (
                    <button key={t.id} type="button" className="tc-teamtile" style={{ borderColor: t.color }} onClick={() => setTarget({ kind: 'team', ids: t.studentIds, label: t.name })} aria-label={`${t.name}: ${teamPts(t.id)} điểm. Chạm để ghi cho cả tổ`}>
                      <i style={{ background: t.color }} aria-hidden="true" />
                      <strong>{t.name}</strong>
                      <span className="tc-bhpts">{signed(teamPts(t.id))}</span>
                      <small className="tc-muted">{t.studentIds.length} em</small>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="tc-row tc-wrap tc-bh__tools">
              <h2 className="tc-h3">Học sinh</h2>
              <span className="tc-ebar__spacer" />
              {multi ? <>
                <span className="tc-small">{sel.size} em đã chọn</span>
                <Btn size="sm" onClick={() => setSel(new Set(roster.map((s) => s.id)))}>Chọn cả lớp</Btn>
                <Btn size="sm" kind="primary" disabled={!sel.size} onClick={() => setTarget({ kind: 'many', ids: Array.from(sel), label: `${sel.size} em` })}>Ghi nhận</Btn>
                <Btn size="sm" kind="ghost" onClick={() => { setMulti(false); setSel(new Set()); }}>Xong</Btn>
              </> : <>
                <Btn size="sm" onClick={() => setMulti(true)}>Chọn nhiều em</Btn>
                <Btn size="sm" onClick={() => setTarget({ kind: 'many', ids: roster.map((s) => s.id), label: 'cả lớp' })}>Cả lớp</Btn>
              </>}
            </div>
            <div className="tc-bhgrid">
              {roster.map((s) => {
                const p = ptsOf(s.id);
                const team = cls?.teams.find((t) => t.studentIds.includes(s.id));
                return (
                  <button key={s.id} type="button" className={cx('tc-bhtile', sel.has(s.id) && 'is-sel')} aria-pressed={multi ? sel.has(s.id) : undefined} onClick={() => tapStudent(s.id, s.name)} aria-label={`${s.name}: ${p} điểm tuần này`}>
                    {team ? <i className="tc-bhtile__team" style={{ background: team.color }} aria-hidden="true" /> : null}
                    <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={52} />
                    <strong>{s.name}</strong>
                    <span className={cx('tc-bhpts', p < 0 && 'is-neg')}>{signed(p)}</span>
                    {sel.has(s.id) ? <span className="tc-bhtile__check" aria-hidden="true"><Icon name="check" size={16} /></span> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <aside className="tc-bh__side">
            <section className="tc-card">
              <header className="tc-card__head"><h2><Icon name="trophy" size={16} /> Bảng tuần này</h2><Link className="tc-small" to="/thi-dua/thong-ke">Tháng, học kì →</Link></header>
              {teamMode && lb ? (
                <ol className="tc-board">{lb.teams.map((t, i) => <li key={t.id}><b>{i + 1}</b><i style={{ background: t.color }} aria-hidden="true" /><span>{t.name}</span><strong>{t.points}</strong></li>)}</ol>
              ) : null}
              {lb ? (
                <ol className="tc-board">{lb.students.slice(0, teamMode ? 5 : 10).map((s, i) => <li key={s.id}><b>{i + 1}</b><span>{s.name}</span><small className="tc-muted">{s.positive}↑ {s.needsWork ? `${s.needsWork}↓` : ''}</small><strong>{s.points}</strong></li>)}</ol>
              ) : null}
            </section>
            <section className="tc-card">
              <header className="tc-card__head"><h2>Vừa ghi</h2></header>
              {!logs.data?.length ? <p className="tc-small tc-muted">Chưa có.</p> : (
                <ul className="tc-bhrecent">{logs.data.map((l) => {
                  const b = bl.find((x) => x.id === l.behaviorId);
                  return <li key={l.id}><span>{b?.icon}</span><span className="tc-grow">{roster.find((s) => s.id === l.studentId)?.name} · {b?.label ?? 'hành vi đã xoá'}</span><b className={l.points < 0 ? 'tc-warn' : 'tc-ok'}>{signed(l.points)}</b><small className="tc-muted">{relTime(l.at)}</small></li>;
                })}</ul>
              )}
            </section>
          </aside>
        </div>
      )}

      {target ? (
        <Dialog open wide title={`Ghi nhận cho ${target.label}`} onClose={() => setTarget(null)}>
          {behaviors.isLoading ? <Loading /> : (
            <div className="tc-stack">
              <div className="tc-bhbtns">{bl.filter((b) => b.points > 0).map((b) => <button key={b.id} type="button" className="tc-bhbtn is-pos" disabled={record.isPending} onClick={() => give(b)}><span aria-hidden="true">{b.icon}</span><strong>{b.label}</strong><b>{signed(b.points)}</b></button>)}</div>
              <h3 className="tc-h3">Cần cố gắng</h3>
              <div className="tc-bhbtns">{bl.filter((b) => b.points < 0).map((b) => <button key={b.id} type="button" className="tc-bhbtn is-neg" disabled={record.isPending} onClick={() => give(b)}><span aria-hidden="true">{b.icon}</span><strong>{b.label}</strong><b>{signed(b.points)}</b></button>)}</div>
            </div>
          )}
        </Dialog>
      ) : null}
      {editor ? <BehaviorEditor classId={classId} list={bl} onClose={() => setEditor(false)} /> : null}
      {toast ? (
        <div className="tc-toast tc-toast--action" role="status">
          <span>{toast.text}</span>
          <button type="button" onClick={() => void doUndo()}>Hoàn tác</button>
        </div>
      ) : null}
    </div>
  );
}
