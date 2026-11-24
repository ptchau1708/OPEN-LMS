import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { EXAM_LEVELS, SUBJECTS, fitSubjectToGrade, subjectsForGrade, TT27_TERM_LABEL, cellKey, skillsFor, type ExamLevel, type ExamMatrix, type Grade, type MatrixCell, type SubjectId, type Tt27TermId } from '@openedu/contracts';
import { defaultRows, itemLevel, itemQType, matrixTotals, skillLabel, useDeleteMatrix, useExamMatrices, useItems, useSaveMatrix, validateMatrix } from '@openedu/data';
import { Btn, ConfirmBar, Dialog, ErrorNote, Field, Loading, PageHead } from '../../components/common';
import { ExamTabs, LevelTag, fmtPoints } from './shared';

const GRADES: Grade[] = [1, 2, 3, 4, 5];
const TERMS: Tt27TermId[] = ['GK1', 'CK1', 'GK2', 'CN'];
const POINTS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3];

function blank(subject: SubjectId = 'toan', grade: Grade = 4): ExamMatrix {
  return { id: '', title: '', subject, grade, termId: 'CK1', durationMin: 40, rows: defaultRows(subject, grade).slice(0, 4), cells: {} };
}

export default function MatrixEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const mq = useExamMatrices();
  const save = useSaveMatrix();
  const del = useDeleteMatrix();
  const [m, setM] = useState<ExamMatrix | null>(null);
  const [skillRow, setSkillRow] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (m) return;
    if (id === 'moi') setM(blank());
    else if (mq.data) setM(mq.data.find((x) => x.id === id) ?? blank());
  }, [id, mq.data, m]);
  const bank = useItems(m ? { subject: m.subject, grade: m.grade } : undefined);
  /** Số câu có trong ngân hàng cho từng ô (TN/TL). */
  const avail = useMemo(() => {
    const out: Record<string, { tn: number; tl: number }> = {};
    if (!m) return out;
    for (const it of bank.data ?? []) {
      const q = itemQType(it);
      if (!q) continue;
      const l = itemLevel(it).level;
      for (const r of m.rows) if ((it.skills ?? []).some((s) => r.skills.includes(s))) {
        const k = cellKey(r.id, l);
        out[k] = out[k] ?? { tn: 0, tl: 0 };
        out[k][q]++;
      }
    }
    return out;
  }, [bank.data, m]);

  if (!m) return <div className="tc-page"><Loading /></div>;
  const totals = matrixTotals(m);
  const problems = validateMatrix(m);
  const set = (p: Partial<ExamMatrix>) => setM({ ...m, ...p });
  const setCell = (rowId: string, l: ExamLevel, p: Partial<MatrixCell>) => {
    const k = cellKey(rowId, l);
    const cur = m.cells[k] ?? { tn: 0, tl: 0, points: l === 1 ? 0.5 : 1 };
    set({ cells: { ...m.cells, [k]: { ...cur, ...p } } });
  };
  const num = (v: string, max = 20) => Math.max(0, Math.min(max, Math.round(Number(v.replace(',', '.')) || 0)));
  const pts = (v: string) => Math.max(0, Math.min(10, Math.round((Number(v.replace(',', '.')) || 0) * 4) / 4));
  const changeScope = (subject: SubjectId, grade: Grade) => set({ subject, grade, rows: defaultRows(subject, grade).slice(0, 4), cells: {} });
  const all = defaultRows(m.subject, m.grade);
  const unused = all.filter((r) => !m.rows.some((x) => x.id === r.id));
  const row = m.rows.find((r) => r.id === skillRow);

  const onSave = (then?: 'ra-de') => {
    if (problems.length) { setMsg(problems[0]); return; }
    save.mutate(m, {
      onSuccess: (saved) => { setM(saved); setMsg('Đã lưu ma trận.'); if (then) nav(`/de-kiem-tra/ra-de?maTran=${encodeURIComponent(saved.id)}`); else if (id === 'moi') nav(`/de-kiem-tra/ma-tran/${saved.id}`, { replace: true }); },
      onError: (e) => setMsg((e as Error).message),
    });
  };

  return (
    <div className="tc-page ex-page">
      <PageHead title={m.id ? `Ma trận: ${m.title}` : 'Ma trận mới'} sub="Mỗi ô: số câu trắc nghiệm (TN), tự luận ngắn (TL) và điểm mỗi câu. “có N” = số câu đang có trong ngân hàng cho ô đó (ô tô cam: chưa đủ)."
        actions={<><Btn onClick={() => onSave()} disabled={save.isPending}>Lưu</Btn><Btn kind="primary" icon="play" onClick={() => onSave('ra-de')} disabled={save.isPending}>Lưu và ra đề</Btn></>} />
      <ExamTabs />
      {msg ? <div className={`tc-alert ${msg.startsWith('Đã') ? 'tc-alert--ok' : 'tc-alert--warn'}`} role="status">{msg}</div> : null}
      <section className="tc-card ex-form">
        <Field label="Tên ma trận"><input className="tc-input" value={m.title} placeholder="Toán 4 – Cuối học kì I" onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Môn"><select className="tc-input" value={m.subject} onChange={(e) => changeScope(e.target.value as SubjectId, m.grade)}>{[...new Set([...subjectsForGrade(m.grade, { periodic: true }), m.subject])].map((s) => <option key={s} value={s}>{SUBJECTS[s]?.name ?? s}</option>)}</select></Field>
        <Field label="Lớp"><select className="tc-input" value={m.grade} onChange={(e) => { const g = Number(e.target.value) as Grade; changeScope(fitSubjectToGrade(m.subject, g, { periodic: true }), g); }}>{GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select></Field>
        <Field label="Kì kiểm tra"><select className="tc-input" value={m.termId ?? ''} onChange={(e) => set({ termId: (e.target.value || undefined) as Tt27TermId | undefined })}><option value="">(không gắn kì)</option>{TERMS.map((t) => <option key={t} value={t}>{TT27_TERM_LABEL[t]}</option>)}</select></Field>
        <Field label="Thời gian (phút)"><input className="tc-input tc-input--num" inputMode="numeric" value={m.durationMin} onChange={(e) => set({ durationMin: Math.max(5, Math.min(180, num(e.target.value, 180))) })} /></Field>
      </section>
      <section className="tc-card tc-card--flush">
        <div className="tc-tablewrap">
          <table className="tc-table ex-matrix">
            <thead>
              <tr><th>Mạch kiến thức</th>{EXAM_LEVELS.map((l) => <th key={l} className="ex-c"><LevelTag level={l} /><div className="ex-sub"><span>TN</span><span>TL</span><span>Điểm/câu</span></div></th>)}<th className="ex-c">Tổng</th><th /></tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.id}>
                  <td className="ex-rowname">
                    <input className="tc-input tc-input--sm" value={r.label} aria-label="Tên mạch" onChange={(e) => set({ rows: m.rows.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) })} />
                    <button type="button" className="ex-link" onClick={() => setSkillRow(r.id)}>{r.skills.length} kĩ năng</button>
                  </td>
                  {EXAM_LEVELS.map((l) => {
                    const c = m.cells[cellKey(r.id, l)];
                    const a = avail[cellKey(r.id, l)] ?? { tn: 0, tl: 0 };
                    const short = (c?.tn ?? 0) > a.tn || (c?.tl ?? 0) > a.tl;
                    return (
                      <td key={l} className={`ex-cell ${short ? 'is-short' : ''}`}>
                        <label><input className="tc-input tc-input--sm" inputMode="numeric" aria-label={`TN mức ${l} ${r.label}`} value={c?.tn ?? 0} onChange={(e) => setCell(r.id, l, { tn: num(e.target.value) })} /><small title={`Ngân hàng có ${a.tn} câu`}>có {a.tn}</small></label>
                        <label><input className="tc-input tc-input--sm" inputMode="numeric" aria-label={`TL mức ${l} ${r.label}`} value={c?.tl ?? 0} onChange={(e) => setCell(r.id, l, { tl: num(e.target.value) })} /><small title={`Ngân hàng có ${a.tl} câu`}>có {a.tl}</small></label>
                        <label><select className="tc-input tc-input--sm" aria-label={`Điểm mỗi câu mức ${l} ${r.label}`} value={c?.points ?? (l === 1 ? 0.5 : 1)} onChange={(e) => setCell(r.id, l, { points: pts(e.target.value) })}>{POINTS.map((p) => <option key={p} value={p}>{fmtPoints(p)}</option>)}</select></label>
                      </td>
                    );
                  })}
                  <td className="ex-c ex-nowrap"><b>{totals.byRow[r.id]?.questions ?? 0}</b> câu<br /><span className="tc-muted">{fmtPoints(totals.byRow[r.id]?.points ?? 0)} đ</span></td>
                  <td><Btn size="sm" kind="ghost" icon="trash" aria-label={`Bỏ mạch ${r.label}`} onClick={() => set({ rows: m.rows.filter((x) => x.id !== r.id) })} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  {unused.length ? (
                    <select className="tc-input tc-input--sm" value="" aria-label="Thêm mạch kiến thức" onChange={(e) => { const r = all.find((x) => x.id === e.target.value); if (r) set({ rows: [...m.rows, r] }); }}>
                      <option value="">+ Thêm mạch kiến thức…</option>
                      {unused.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  ) : null}
                </td>
                {EXAM_LEVELS.map((l) => <td key={l} className="ex-c"><b>{totals.byLevel[l].questions}</b> câu · {fmtPoints(totals.byLevel[l].points)} đ <span className="tc-muted">({totals.points ? Math.round((totals.byLevel[l].points / totals.points) * 100) : 0}%)</span></td>)}
                <td className="ex-c ex-nowrap"><b className={totals.points === 10 ? 'ex-ok' : 'tc-warn'}>{fmtPoints(totals.points)} điểm</b><br /><span className="tc-muted">{totals.questions} câu</span></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {totals.points !== 10 && totals.questions ? <p className="tc-warn tc-small ex-pad">Tổng điểm đang là {fmtPoints(totals.points)} — bài KTĐK thường là 10 điểm.</p> : null}
      </section>
      <details className="tc-card ex-help">
        <summary>Mức của câu hỏi được tính thế nào?</summary>
        <p className="tc-small">Mức 1 (nhận biết) ← độ khó “nhận biết”, Mức 2 (kết nối) ← “kết nối”, Mức 3 (vận dụng) ← “vận dụng”. Thầy cô có thể gắn thẻ <code>muc:1</code>, <code>muc:2</code>, <code>muc:3</code> trong Ngân hàng câu hỏi để đặt mức khác. Câu chưa có độ khó được coi là Mức 1. TN = chọn, nối, sắp xếp, kéo thả…; TL = điền số / từ.</p>
      </details>
      {m.id ? (confirmDel ? <ConfirmBar text="Xóa ma trận này? Các đề đã ra vẫn giữ nguyên." onCancel={() => setConfirmDel(false)} onConfirm={() => del.mutate(m.id, { onSuccess: () => nav('/de-kiem-tra') })} busy={del.isPending} /> : <div><Btn kind="danger" icon="trash" onClick={() => setConfirmDel(true)}>Xóa ma trận</Btn></div>) : null}
      {save.error ? <ErrorNote error={save.error} /> : null}
      <Dialog open={!!row} onClose={() => setSkillRow(null)} title={`Kĩ năng của mạch “${row?.label ?? ''}”`} wide footer={<Btn kind="primary" onClick={() => setSkillRow(null)}>Xong</Btn>}>
        {row ? (
          <div className="ex-skills">
            {skillsFor(m.subject, m.grade).map((s) => (
              <label key={s.code} className="tc-switch">
                <input type="checkbox" checked={row.skills.includes(s.code)} onChange={(e) => set({ rows: m.rows.map((x) => (x.id === row.id ? { ...x, skills: e.target.checked ? [...x.skills, s.code] : x.skills.filter((k) => k !== s.code) } : x)) })} />
                <span>{skillLabel(s.code)} <span className="tc-muted tc-small">{s.topic}</span></span>
              </label>
            ))}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
