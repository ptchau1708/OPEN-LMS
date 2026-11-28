/** Một bài luyện Ôn thi (app GV): kết quả cả khối (hoặc lớp mình), tỉ lệ đúng theo câu, sửa cài đặt và danh sách câu. */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { SUBJECTS, type Item, type OnThiReport, type OnThiSet, type Profile } from '@openedu/contracts';
import { compareOnThi, fmtDuration, useDeleteOnThiSet, useItems, useItemsByIds, useOnThiReport, useSaveOnThiSet } from '@openedu/data';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading, PageHead } from '../../components/common';
import { SubjectOptions } from '../../components/SubjectOptions';
import { typeLabel } from '../../lib/format';
import { STYLE_LABEL } from './OnThiHome';
import './onthi.css';

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export default function OnThiDetail({ user }: { user: Profile }) {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useOnThiReport(id);
  const del = useDeleteOnThiSet();
  const [edit, setEdit] = useState(false);
  const [askDel, setAskDel] = useState(false);
  if (q.isLoading) return <div className="tc-page"><Loading /></div>;
  if (q.error || !q.data) return <div className="tc-page"><ErrorNote error={q.error ?? new Error('Không tìm thấy bài luyện.')} onRetry={() => void q.refetch()} /></div>;
  const r = q.data;
  const s = r.set;
  const mine = s.createdBy === user.id || user.role === 'admin' || !s.createdBy;
  const max = s.itemIds.length * s.points;
  return (
    <div className="tc-page ot-page">
      <PageHead
        title={s.title}
        sub={`Ôn thi ${STYLE_LABEL[s.style]} · ${SUBJECTS[s.subject]?.name ?? s.subject} khối ${s.grade} · ${s.itemIds.length} câu · ${s.minutes} phút · mức đạt ${fmt(s.passScore)}/${fmt(max)}`}
        actions={<>
          <Btn icon="back" onClick={() => nav('/on-thi')}>Danh sách</Btn>
          {mine ? <Btn icon="settings" onClick={() => setEdit(true)} data-testid="ot-edit">Sửa bài luyện</Btn> : null}
          {mine ? <Btn kind="ghost" icon="trash" onClick={() => setAskDel(true)}>Xoá</Btn> : null}
        </>}
      />
      {askDel ? <ConfirmBar text={`Xoá bài “${s.title}”? Bài làm của học sinh cũng bị xoá.`} busy={del.isPending} onCancel={() => setAskDel(false)} onConfirm={() => del.mutate(s.id, { onSuccess: () => nav('/on-thi') })} /> : null}
      <ErrorNote error={del.error} />
      {s.status === 'draft' ? <p className="tc-alert tc-alert--warn">Bài đang ở dạng nháp: học sinh chưa thấy bài này.</p> : null}
      <Results r={r} />
      <ItemStats r={r} />
      {edit ? <EditDialog set={s} onClose={() => setEdit(false)} /> : null}
    </div>
  );
}

function Results({ r }: { r: OnThiReport }) {
  const rows = useMemo(() => {
    const done = r.students.filter((x) => x.best).sort((a, b) => compareOnThi(a.best!, b.best!));
    const rest = r.students.filter((x) => !x.best);
    return [...done, ...rest];
  }, [r.students]);
  const done = r.students.filter((x) => x.best);
  const passed = done.filter((x) => x.best!.passed).length;
  const avg = done.length ? done.reduce((t, x) => t + x.best!.score, 0) / done.length : 0;
  const max = r.set.itemIds.length * r.set.points;
  return (
    <section className="tc-card tc-card--flush">
      <div className="tc-card__head ot-pad">
        <h2 className="ot-h2">Kết quả học sinh</h2>
        <span className="tc-row ot-stats">
          <span className="tc-chip">Đã làm {done.length}/{r.students.length}</span>
          <span className="tc-chip tc-chip--ok">Đạt {passed}</span>
          <span className="tc-chip">Điểm TB {fmt(avg)}/{fmt(max)}</span>
        </span>
      </div>
      {!r.students.length ? <Empty icon="team" title="Chưa có học sinh">Khối này chưa có học sinh trong phạm vi thầy/cô được xem.</Empty> : (
        <div className="tc-tablewrap">
          <table className="tc-table" data-testid="ot-results">
            <thead><tr><th>Hạng</th><th>Học sinh</th><th>Lớp</th><th>Điểm cao nhất</th><th>Thời gian</th><th>Câu sai</th><th>Số lần</th><th>Kết quả</th></tr></thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={x.studentId}>
                  <td>{x.best ? i + 1 : '—'}</td>
                  <td><b>{x.name}</b></td>
                  <td>{x.className ?? ''}</td>
                  <td>{x.best ? <b>{fmt(x.best.score)}</b> : <span className="tc-muted">chưa làm</span>}</td>
                  <td className="tc-small">{x.best ? fmtDuration(x.best.durationMs) : ''}</td>
                  <td>{x.best ? x.best.wrong : ''}</td>
                  <td>{x.attempts || ''}</td>
                  <td>{x.best ? <span className={`tc-chip ${x.best.passed ? 'tc-chip--ok' : 'tc-chip--warn'}`}>{x.best.passed ? 'Đạt' : 'Chưa đạt'}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tc-small tc-muted ot-pad">Xếp theo điểm cao nhất, rồi thời gian làm bài, rồi số câu sai (lấy lần làm tốt nhất của mỗi em).</p>
    </section>
  );
}

function ItemStats({ r }: { r: OnThiReport }) {
  const itemsQ = useItemsByIds(r.set.itemIds);
  const worst = useMemo(() => {
    const tried = r.items.filter((x) => x.tried > 0);
    return new Set(tried.sort((a, b) => a.correct / a.tried - b.correct / b.tried).slice(0, 3).filter((x) => x.correct < x.tried).map((x) => x.itemId));
  }, [r.items]);
  return (
    <section className="tc-card tc-card--flush">
      <div className="tc-card__head ot-pad"><h2 className="ot-h2">Theo câu hỏi</h2><span className="tc-small tc-muted">Tô cam: 3 câu nhiều em sai nhất</span></div>
      <div className="tc-tablewrap">
        <table className="tc-table" data-testid="ot-items">
          <thead><tr><th>Câu</th><th>Dạng</th><th>Đề bài</th><th>Đúng / làm</th><th className="ot-barcol">Tỉ lệ đúng</th></tr></thead>
          <tbody>
            {r.items.map((x, i) => {
              const it: Item | undefined = itemsQ.data?.[x.itemId];
              const pct = x.tried ? Math.round((x.correct / x.tried) * 100) : 0;
              return (
                <tr key={x.itemId} className={worst.has(x.itemId) ? 'ot-worst' : undefined}>
                  <td>{i + 1}</td>
                  <td className="tc-small">{typeLabel(x.type)}</td>
                  <td className="ot-prompt">{it?.prompt.text ?? ''}</td>
                  <td>{x.tried ? `${x.correct}/${x.tried}` : '—'}</td>
                  <td>{x.tried ? <span className="ot-bar" title={`${pct}%`}><i style={{ width: `${pct}%` }} /><b>{pct}%</b></span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditDialog({ set, onClose }: { set: OnThiSet; onClose: () => void }) {
  const save = useSaveOnThiSet();
  const [f, setF] = useState<OnThiSet>(set);
  const [adding, setAdding] = useState(false);
  const itemsQ = useItemsByIds(f.itemIds);
  const max = f.itemIds.length * f.points;
  const move = (i: number, d: number) => {
    const ids = f.itemIds.slice();
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setF({ ...f, itemIds: ids });
  };
  const submit = () => {
    const { id, style, title, grade, subject, itemIds, minutes, points, passScore, lockOrder, position, showBoard, revealAnswers, status } = f;
    save.mutate({ id, style, title, grade, subject, itemIds, minutes, points, passScore: Math.min(passScore, itemIds.length * points), lockOrder, position, showBoard, revealAnswers, status }, { onSuccess: onClose });
  };
  return (
    <Dialog open onClose={onClose} title="Sửa bài luyện" wide
      footer={<><ErrorNote error={save.error} /><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" icon="check" disabled={save.isPending || !f.itemIds.length || !f.title.trim()} onClick={submit} data-testid="ot-save">Lưu</Btn></>}>
      <div className="ot-import">
        <Field label="Tên bài luyện"><input className="tc-input" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="ot-import__row">
          <Field label="Kiểu">
            <select className="tc-input" value={f.style} onChange={(e) => setF({ ...f, style: e.target.value as OnThiSet['style'] })}>
              <option value="tn">Ôn thi {STYLE_LABEL.tn}</option>
              <option value="vio">Ôn thi {STYLE_LABEL.vio}</option>
            </select>
          </Field>
          <Field label="Môn"><select className="tc-input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value as OnThiSet['subject'] })}><SubjectOptions grade={f.grade} present={[f.subject]} /></select></Field>
          <Field label="Thứ tự bài"><input className="tc-input" type="number" min={1} value={f.position} onChange={(e) => setF({ ...f, position: Math.max(1, Number(e.target.value) || 1) })} /></Field>
        </div>
        <div className="ot-import__row">
          <Field label="Thời gian (phút)"><input className="tc-input" type="number" min={1} max={180} value={f.minutes} onChange={(e) => setF({ ...f, minutes: Math.max(1, Math.min(180, Number(e.target.value) || 1)) })} /></Field>
          <Field label="Điểm mỗi câu"><input className="tc-input" type="number" min={0.5} max={100} step={0.5} value={f.points} onChange={(e) => setF({ ...f, points: Math.max(0.5, Number(e.target.value) || 1) })} /></Field>
          <Field label={`Mức đạt (tối đa ${fmt(max)})`}><input className="tc-input" type="number" min={0} max={max} value={f.passScore} onChange={(e) => setF({ ...f, passScore: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} data-testid="ot-edit-pass" /></Field>
        </div>
        <label className="tc-check"><input type="checkbox" checked={f.status === 'published'} onChange={(e) => setF({ ...f, status: e.target.checked ? 'published' : 'draft' })} /> Mở cho học sinh (bỏ chọn: lưu nháp)</label>
        <label className="tc-check"><input type="checkbox" checked={f.lockOrder} onChange={(e) => setF({ ...f, lockOrder: e.target.checked })} /> Khóa theo thứ tự: phải đạt bài trước mới mở bài này</label>
        <label className="tc-check"><input type="checkbox" checked={f.showBoard} onChange={(e) => setF({ ...f, showBoard: e.target.checked })} /> Hiện bảng xếp hạng cho học sinh</label>
        <label className="tc-check"><input type="checkbox" checked={f.revealAnswers} onChange={(e) => setF({ ...f, revealAnswers: e.target.checked })} /> Cho xem đáp án và giải thích khi xem lại bài</label>
        <div className="ot-qhead"><b>Câu hỏi ({f.itemIds.length})</b><Btn size="sm" icon="plus" onClick={() => setAdding(true)}>Thêm câu từ ngân hàng</Btn></div>
        <ol className="ot-qlist">
          {f.itemIds.map((iid, i) => {
            const it = itemsQ.data?.[iid];
            return (
              <li key={iid} className="ot-q">
                <span className="ot-q__no">{i + 1}</span>
                <span className="ot-q__main"><span className="ot-q__type">{it ? typeLabel(it.type) : ''}</span><span className="ot-q__text">{it?.prompt.text ?? iid}</span></span>
                <span className="tc-row">
                  <Btn size="sm" kind="ghost" aria-label="Lên" disabled={i === 0} onClick={() => move(i, -1)}>↑</Btn>
                  <Btn size="sm" kind="ghost" aria-label="Xuống" disabled={i === f.itemIds.length - 1} onClick={() => move(i, 1)}>↓</Btn>
                  <Btn size="sm" kind="ghost" icon="trash" aria-label="Bỏ câu khỏi bài" onClick={() => setF({ ...f, itemIds: f.itemIds.filter((x) => x !== iid) })} />
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {adding ? <BankPicker grade={f.grade} subject={f.subject} have={f.itemIds} onClose={() => setAdding(false)} onAdd={(ids) => { setF({ ...f, itemIds: [...f.itemIds, ...ids].slice(0, 60) }); setAdding(false); }} /> : null}
    </Dialog>
  );
}

function BankPicker({ grade, subject, have, onClose, onAdd }: { grade: OnThiSet['grade']; subject: OnThiSet['subject']; have: string[]; onClose: () => void; onAdd: (ids: string[]) => void }) {
  const q = useItems({ grade, subject });
  const [pick, setPick] = useState<string[]>([]);
  const [type, setType] = useState('');
  const list = (q.data ?? []).filter((i) => !have.includes(i.id) && (!type || i.type === type) && !['DRAW', 'RECORD_READ', 'POLL'].includes(i.type));
  const types = [...new Set((q.data ?? []).map((i) => i.type))];
  return (
    <Dialog open onClose={onClose} title={`Thêm câu từ ngân hàng (${SUBJECTS[subject]?.name ?? subject} lớp ${grade})`} wide
      footer={<><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" disabled={!pick.length} onClick={() => onAdd(pick)}>Thêm {pick.length} câu</Btn></>}>
      <div className="tc-row ot-pick-filter">
        <select className="tc-input tc-input--sm" aria-label="Dạng câu" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Mọi dạng</option>
          {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
        <span className="tc-small tc-muted">{list.length} câu</span>
      </div>
      {q.isLoading ? <Loading /> : !list.length ? <Empty title="Không còn câu phù hợp">Thêm câu ở Ngân hàng câu hỏi hoặc tạo bài từ tệp Word.</Empty> : (
        <ol className="ot-qlist ot-qlist--pick">
          {list.map((it) => {
            const on = pick.includes(it.id);
            return (
              <li key={it.id} className={`ot-q${on ? ' is-on' : ''}`}>
                <label className="ot-q__pick">
                  <input type="checkbox" checked={on} onChange={() => setPick(on ? pick.filter((x) => x !== it.id) : [...pick, it.id])} />
                  <span className="ot-q__main"><span className="ot-q__type">{typeLabel(it.type)}</span><span className="ot-q__text">{it.prompt.text}</span></span>
                </label>
              </li>
            );
          })}
        </ol>
      )}
    </Dialog>
  );
}
