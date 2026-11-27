import { useMemo, useState } from 'react';
import { SKILLS, SKILL_BY_CODE, SUBJECT_LIST, SUBJECTS, fitSubjectToGrade, subjectLabelFor, subjectOptionsFor, type Grade, type Profile, type Rubric, type RubricCriterion, type SubjectId } from '@openedu/contracts';
import { Icon } from '@openedu/ui';
import { criteriaMax, fmtScore, matchesSearch, useCatalogVersion, useDeleteRubric, useRubrics, useSaveRubric } from '@openedu/data';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading, PageHead, Seg, SubjectDot } from '../../components/common';
import { byFocus, useFocusGrade } from '../../lib/focusGrade';

const SUBJ: SubjectId[] = SUBJECT_LIST.map((s) => s.id);
const GRADES: Grade[] = [1, 2, 3, 4, 5];
let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export function blankRubric(user: Profile, subject: SubjectId = 'toan', grade: Grade = 4): Rubric {
  return {
    id: '', title: '', subject, grade, maxScore: 10, skills: [], ownerId: user.id,
    criteria: [
      { id: nid('c'), name: 'Nội dung', description: '', points: 6 },
      { id: nid('c'), name: 'Trình bày', description: '', points: 4 },
    ],
  };
}

/** Chọn mã kĩ năng từ danh mục (lọc theo môn, lớp). */
export function SkillPicker({ value, onChange, subject, grade, label = 'Kĩ năng' }: { value: string[]; onChange: (v: string[]) => void; subject: SubjectId; grade: Grade; label?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ver = useCatalogVersion();
  const opts = useMemo(() => { void ver; return SKILLS; }, [ver]).filter((s) => s.subject === subject && Math.abs(s.grade - grade) <= 1 && !value.includes(s.code) && (matchesSearch(`${s.code} ${s.short} ${s.topic}`, q)))
    .sort((a, b) => Math.abs(a.grade - grade) - Math.abs(b.grade - grade)).slice(0, 40);
  return (
    <div className="tc-field">
      <span className="tc-field__label">{label}</span>
      <div className="tc-chips">
        {value.map((c) => (
          <span key={c} className="tc-chip tc-chip--skill" title={SKILL_BY_CODE[c]?.text}>
            {SKILL_BY_CODE[c]?.short ?? c}<code>{c}</code>
            <button type="button" aria-label={`Bỏ ${c}`} onClick={() => onChange(value.filter((x) => x !== c))}><Icon name="close" size={12} /></button>
          </span>
        ))}
        <Btn size="sm" icon="plus" kind="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Thêm kĩ năng</Btn>
      </div>
      {open ? (
        <div className="tc-skillpick">
          <input className="tc-input tc-input--sm tc-w100" placeholder="Tìm theo tên hoặc mã…" aria-label="Tìm kĩ năng" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="tc-list">
            {opts.length ? opts.map((s) => (
              <li key={s.code}>
                <button type="button" className="tc-listrow" onClick={() => onChange([...value, s.code])}>
                  <span className="tc-listrow__main"><strong>{s.short}</strong> <span className="tc-muted tc-small">· {s.topic} · L{s.grade}</span></span>
                  <code>{s.code}</code>
                </button>
              </li>
            )) : <li className="tc-muted tc-small" style={{ padding: 10 }}>Không có kĩ năng phù hợp.</li>}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function RubricEditor({ initial, onClose, onSaved }: { initial: Rubric; onClose: () => void; onSaved?: (r: Rubric) => void }) {
  const [r, setR] = useState<Rubric>(() => JSON.parse(JSON.stringify(initial)) as Rubric);
  const save = useSaveRubric();
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Rubric>) => setR((x) => ({ ...x, ...p }));
  const setC = (i: number, p: Partial<RubricCriterion>) => setR((x) => ({ ...x, criteria: x.criteria.map((c, j) => (j === i ? { ...c, ...p } : c)) }));
  const sum = criteriaMax(r);
  const submit = () => {
    if (!r.title.trim()) return setErr('Thầy/cô đặt tên cho bộ tiêu chí nhé.');
    if (!r.criteria.length || r.criteria.some((c) => !c.name.trim())) return setErr('Mỗi tiêu chí cần có tên.');
    setErr(null);
    save.mutate(r, { onSuccess: (x) => { onSaved?.(x); onClose(); } });
  };
  return (
    <Dialog open wide title={r.id ? 'Sửa tiêu chí chấm' : 'Tạo tiêu chí chấm'} onClose={onClose} footer={<>
      <span className="tc-small tc-muted">Tổng điểm tiêu chí: <b className={sum !== r.maxScore ? 'tc-warn' : ''}>{fmtScore(sum)}</b> / thang {r.maxScore}{sum !== r.maxScore ? ' (sẽ quy đổi theo tỉ lệ)' : ''}</span>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Đang lưu…' : 'Lưu'}</Btn>
    </>}>
      <div className="tc-stack">
        <Field label="Tên bộ tiêu chí"><input className="tc-input" value={r.title} onChange={(e) => set({ title: e.target.value })} placeholder="vd: Giải bài toán có lời văn" /></Field>
        <div className="tc-row tc-wrap">
          <Field label="Môn"><select className="tc-input" value={r.subject} onChange={(e) => set({ subject: e.target.value as SubjectId })}>{subjectOptionsFor(r.grade, [r.subject]).map((s) => <option key={s.id} value={s.id}>{subjectLabelFor(s.id, r.grade)}</option>)}</select></Field>
          <Field label="Lớp"><select className="tc-input" value={r.grade} onChange={(e) => { const g = Number(e.target.value) as Grade; const sub = fitSubjectToGrade(r.subject, g); set(sub === r.subject ? { grade: g } : { grade: g, subject: sub, skills: [] }); }}>{GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select></Field>
          <Field label="Thang điểm"><input className="tc-input tc-input--num" type="number" min={1} max={100} value={r.maxScore} onChange={(e) => set({ maxScore: Math.max(1, Number(e.target.value) || 10) })} /></Field>
        </div>

        <h3 className="tc-h3">Tiêu chí</h3>
        <ol className="tc-crit-edit">
          {r.criteria.map((c, i) => (
            <li key={c.id} className="tc-card tc-card--flat">
              <div className="tc-row tc-wrap">
                <span className="tc-crit-edit__n">{i + 1}</span>
                <input className="tc-input tc-grow" aria-label={`Tên tiêu chí ${i + 1}`} value={c.name} onChange={(e) => setC(i, { name: e.target.value })} placeholder="Tên tiêu chí" />
                <label className="tc-row tc-small">Điểm tối đa <input className="tc-input tc-input--sm tc-input--num" type="number" min={0} step={0.5} value={c.points} onChange={(e) => setC(i, { points: Math.max(0, Number(e.target.value) || 0) })} /></label>
                <Btn size="sm" kind="ghost" icon="back" aria-label="Chuyển lên" disabled={!i} onClick={() => setR((x) => { const a = [...x.criteria]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...x, criteria: a }; })} style={{ transform: 'rotate(90deg)' }} />
                <Btn size="sm" kind="danger" icon="trash" aria-label="Xóa tiêu chí" onClick={() => setR((x) => ({ ...x, criteria: x.criteria.filter((_, j) => j !== i) }))} />
              </div>
              <textarea className="tc-input" rows={2} aria-label="Mô tả tiêu chí" placeholder="Chấm cái gì (cho thầy/cô và AI)" value={c.description} onChange={(e) => setC(i, { description: e.target.value })} />
              <div className="tc-levels">
                {(c.levels ?? []).map((l, k) => (
                  <div key={k} className="tc-levels__row">
                    <input className="tc-input tc-input--sm" aria-label="Tên mức" value={l.label} placeholder="Tốt" onChange={(e) => setC(i, { levels: c.levels!.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} />
                    <input className="tc-input tc-input--sm tc-input--num" type="number" aria-label="Điểm của mức" min={0} max={c.points} step={0.5} value={l.points} onChange={(e) => setC(i, { levels: c.levels!.map((x, m) => (m === k ? { ...x, points: Number(e.target.value) || 0 } : x)) })} />
                    <input className="tc-input tc-input--sm tc-grow" aria-label="Mô tả mức" value={l.descriptor} placeholder="Mô tả bài làm ở mức này" onChange={(e) => setC(i, { levels: c.levels!.map((x, m) => (m === k ? { ...x, descriptor: e.target.value } : x)) })} />
                    <Btn size="sm" kind="ghost" icon="close" aria-label="Xóa mức" onClick={() => setC(i, { levels: c.levels!.filter((_, m) => m !== k) })} />
                  </div>
                ))}
                <Btn size="sm" kind="ghost" icon="plus" onClick={() => setC(i, { levels: [...(c.levels ?? []), { label: '', points: c.points, descriptor: '' }] })}>Thêm mức mô tả</Btn>
              </div>
              <SkillPicker label="Kĩ năng của tiêu chí (bỏ trống = theo bộ)" value={c.skills ?? []} onChange={(v) => setC(i, { skills: v })} subject={r.subject} grade={r.grade} />
            </li>
          ))}
        </ol>
        <Btn icon="plus" onClick={() => set({ criteria: [...r.criteria, { id: nid('c'), name: '', description: '', points: 1 }] })}>Thêm tiêu chí</Btn>

        <SkillPicker value={r.skills} onChange={(v) => set({ skills: v })} subject={r.subject} grade={r.grade} label="Kĩ năng bài làm thể hiện" />
        <Field label="Bài giải / bài văn mẫu" help="Học sinh không xem được."><textarea className="tc-input" rows={4} value={r.modelAnswer ?? ''} onChange={(e) => set({ modelAnswer: e.target.value })} /></Field>
        <Field label="Dặn riêng cho AI chấm" help="vd: chấp nhận cách giải bằng sơ đồ đoạn thẳng."><textarea className="tc-input" rows={2} value={r.aiNotes ?? ''} onChange={(e) => set({ aiNotes: e.target.value })} /></Field>
        {err ? <div className="tc-alert tc-alert--error" role="alert">{err}</div> : null}
        <ErrorNote error={save.error} />
      </div>
    </Dialog>
  );
}

export default function Rubrics({ user }: { user: Profile }) {
  const q = useRubrics();
  const del = useDeleteRubric();
  const [edit, setEdit] = useState<Rubric | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const focus = useFocusGrade().grade;
  const list = byFocus((q.data ?? []).filter((r) => subject === 'all' || r.subject === subject), focus, (r) => r.grade);
  return (
    <div className="tc-page">
      <PageHead title="Tiêu chí chấm (rubric)" sub="Mỗi tiêu chí có điểm tối đa, mức mô tả và kĩ năng. AI chấm theo đúng các tiêu chí này." actions={<>
        <Seg label="Lọc môn" value={subject} onChange={setSubject} options={[{ value: 'all' as const, label: 'Tất cả' }, ...SUBJ.slice(0, 2).map((s) => ({ value: s, label: SUBJECTS[s].name }))]} />
        <Btn kind="primary" icon="plus" onClick={() => setEdit(blankRubric(user, 'toan', focus))}>Tạo tiêu chí</Btn>
      </>} />
      <ErrorNote error={q.error ?? del.error} onRetry={() => void q.refetch()} />
      {q.isLoading ? <Loading /> : !list.length ? <Empty icon="check" title="Chưa có bộ tiêu chí nào">Bấm “Tạo tiêu chí” để bắt đầu.</Empty> : (
        <div className="tc-cardgrid">
          {list.map((r) => (
            <article key={r.id} className="tc-card tc-rubcard">
              <header className="tc-row">
                <SubjectDot colorVar={SUBJECTS[r.subject].colorVar} />
                <span className="tc-small tc-muted">{SUBJECTS[r.subject].name} · Lớp {r.grade} · thang {r.maxScore}</span>
              </header>
              <h2>{r.title}</h2>
              <ul className="tc-rubcard__crit">
                {r.criteria.map((c) => <li key={c.id}><span>{c.name}</span><b>{fmtScore(c.points)}</b></li>)}
              </ul>
              <div className="tc-chips">{r.skills.slice(0, 3).map((s) => <span key={s} className="tc-chip">{SKILL_BY_CODE[s]?.short ?? s}</span>)}</div>
              {confirm === r.id ? <ConfirmBar text="Xóa bộ tiêu chí này?" busy={del.isPending} onCancel={() => setConfirm(null)} onConfirm={() => del.mutate(r.id, { onSettled: () => setConfirm(null) })} /> : (
                <div className="tc-row">
                  <Btn size="sm" icon="pencil" onClick={() => setEdit(r)}>Sửa</Btn>
                  <Btn size="sm" icon="plus" kind="ghost" onClick={() => setEdit({ ...r, id: '', title: `${r.title} (bản sao)`, ownerId: user.id })}>Nhân bản</Btn>
                  <span className="tc-ebar__spacer" />
                  <Btn size="sm" kind="danger" icon="trash" aria-label={`Xóa ${r.title}`} onClick={() => setConfirm(r.id)} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {edit ? <RubricEditor initial={edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}
