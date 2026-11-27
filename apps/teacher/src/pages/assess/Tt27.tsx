import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBJECTS, isPeriodicAt, subjectsForGrade, TT27_COMPETENCY_LABEL, TT27_LEVEL_LABEL, TT27_QUALITY_LABEL, TT27_RATING_LABEL, TT27_TERM_LABEL, schoolYearOf, type Grade, type Profile, type SubjectId, type Tt27Competency, type Tt27Evaluation, type Tt27Level, type Tt27Quality, type Tt27Rating, type Tt27SubjectResult, type Tt27TermId } from '@openedu/contracts';
import { bankable, useAddToBank, useCommentBankList, usePref, useSaveTt27, useSuggestTt27, useTt27, type BankAdd } from '@openedu/data';
import { Avatar, Btn, Dialog, Empty, ErrorNote, Field, Loading, PageHead, Seg } from '../../components/common';
import { ClassPicker, useClassPick, useRoster } from '../../lib/assess';
import { cx } from '../../lib/format';
import { BankProvider, CommentInput } from '../../components/CommentInput';
import { TT27_GENERAL_SCOPE, Tt27BankDialog, Tt27ColumnsDialog, tt27Scope, useBankAuto } from './Tt27Bank';
import { useFocusGrade } from '../../lib/focusGrade';

const TERMS: Tt27TermId[] = ['GK1', 'CK1', 'GK2', 'CN'];
const LEVELS: Tt27Level[] = ['T', 'H', 'C'];
const RATINGS: Tt27Rating[] = ['T', 'Đ', 'C'];
const QUALITIES = Object.keys(TT27_QUALITY_LABEL) as Tt27Quality[];
const COMPETENCIES = Object.keys(TT27_COMPETENCY_LABEL) as Tt27Competency[];
/** Môn được nhận xét theo TT27: mọi môn của lớp theo CT GDPT 2018 (môn đã ẩn ở cấp trường không hiện). */
const subjectsFor = (g: Grade): SubjectId[] => subjectsForGrade(g);
/** Mặc định hiện các môn bắt buộc của lớp; môn tự chọn (Tiếng dân tộc, Tiếng Anh lớp 1–2) GV tự bật. */
const defaultCols = (g: Grade): SubjectId[] => subjectsForGrade(g, { compulsory: true });

function blank(studentId: string, classId: string, termId: Tt27TermId, schoolYear: string): Tt27Evaluation {
  return { studentId, classId, termId, schoolYear, subjects: {}, qualities: Object.fromEntries(QUALITIES.map((q) => [q, 'Đ'])) as Tt27Evaluation['qualities'], competencies: {}, generalComment: '', status: 'draft' };
}

function Pick<T extends string>({ value, opts, onChange, label, title }: { value?: T; opts: T[]; onChange: (v: T) => void; label: string; title: (v: T) => string }) {
  return (
    <span className="tc-pick" role="radiogroup" aria-label={label}>
      {opts.map((o) => <button key={o} type="button" role="radio" aria-checked={value === o} title={title(o)} className={cx(`tc-pick--${o === 'Đ' ? 'D' : o}`, value === o && 'is-on')} onClick={() => onChange(o)}>{o}</button>)}
    </span>
  );
}

/**
 * Thao tác cho NHIỀU học sinh cùng lúc: chọn các em ở cột đầu bảng rồi đặt mức môn học, nhận xét môn,
 * phẩm chất & năng lực hoặc nhận xét chung một lần. Chỉ thay đổi bản nháp trên màn hình — bấm Lưu nháp / Chốt để lưu.
 */
function BulkBar({ count, subjects, onLevel, onComment, onRatings, onGeneral, onSuggest, onClear, busy }: {
  count: number; subjects: SubjectId[]; busy: boolean;
  onLevel: (subj: SubjectId | 'all', v: Tt27Level) => void;
  onComment: (subj: SubjectId | 'all', text: string, mode: 'replace' | 'append') => void;
  onRatings: (v: Tt27Rating) => void;
  onGeneral: (text: string, mode: 'replace' | 'append') => void;
  onSuggest: () => void; onClear: () => void;
}) {
  const [subj, setSubj] = useState<SubjectId | 'all'>(subjects[0] ?? 'all');
  const [text, setText] = useState('');
  const [general, setGeneral] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  return (
    <section className="tc-card tc-tt27bulk" aria-label="Thao tác cho nhiều học sinh" data-testid="tt27-bulk">
      <div className="tc-row tc-wrap">
        <strong>Đã chọn {count} em</strong>
        <Btn size="sm" kind="ghost" onClick={onClear}>Bỏ chọn</Btn>
        <span className="tc-ebar__spacer" />
        <Btn size="sm" icon="hint" disabled={busy} onClick={onSuggest}>Gợi ý từ dữ liệu cho {count} em</Btn>
      </div>
      <div className="tc-tt27bulk__grid">
        <div className="tc-stack">
          <label className="tc-row">
            <span className="tc-small">Môn</span>
            <select className="tc-input tc-input--sm" value={subj} onChange={(e) => setSubj(e.target.value as SubjectId | 'all')} aria-label="Môn áp dụng">
              {subjects.map((x) => <option key={x} value={x}>{SUBJECTS[x].name}</option>)}
              <option value="all">Tất cả các môn</option>
            </select>
          </label>
          <div className="tc-row"><span className="tc-small">Mức</span><Pick label="Mức cho các em đã chọn" opts={LEVELS} onChange={(v) => onLevel(subj, v)} title={(v) => `Đặt mức ${TT27_LEVEL_LABEL[v]} cho ${count} em`} /></div>
          <CommentInput className="tc-input tc-input--sm" rows={2} placeholder="Nhận xét môn cho các em đã chọn… (bấm để chọn từ ngân hàng)" value={text} onChange={setText} scope={subj === 'all' ? TT27_GENERAL_SCOPE : tt27Scope(subj)} aria-label="Nhận xét môn cho các em đã chọn" />
          <Btn size="sm" disabled={!text.trim()} onClick={() => onComment(subj, text.trim(), mode)}>Áp dụng nhận xét môn</Btn>
        </div>
        <div className="tc-stack">
          <div className="tc-row"><span className="tc-small">Phẩm chất &amp; năng lực</span><Pick label="Phẩm chất và năng lực cho các em đã chọn" opts={RATINGS} onChange={onRatings} title={(v) => `Đặt tất cả phẩm chất, năng lực = ${TT27_RATING_LABEL[v]}`} /></div>
          <CommentInput className="tc-input tc-input--sm" rows={2} placeholder="Nhận xét chung cho các em đã chọn…" value={general} onChange={setGeneral} scope={TT27_GENERAL_SCOPE} aria-label="Nhận xét chung cho các em đã chọn" />
          <Btn size="sm" disabled={!general.trim()} onClick={() => onGeneral(general.trim(), mode)}>Áp dụng nhận xét chung</Btn>
          <label className="tc-row tc-small">
            <input type="checkbox" checked={mode === 'append'} onChange={(e) => setMode(e.target.checked ? 'append' : 'replace')} /> Thêm vào sau nhận xét đang có (không xóa)
          </label>
        </div>
      </div>
    </section>
  );
}

export default function Tt27({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const [termId, setTermId] = useState<Tt27TermId>('GK1');
  const schoolYear = schoolYearOf();
  const { roster, isLoading: rl } = useRoster(cls);
  const q = useTt27({ classId, termId, schoolYear }, !!classId);
  const save = useSaveTt27();
  const suggest = useSuggestTt27();
  const [drafts, setDrafts] = useState<Record<string, Tt27Evaluation>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [basis, setBasis] = useState<Record<string, string[]>>({});
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [print, setPrint] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const focus = useFocusGrade().grade;
  const grade = cls?.grade ?? focus;
  const allSubjects = subjectsFor(grade);
  // Môn hiển thị: GV chọn theo lớp (lưu theo tài khoản); mặc định các môn bắt buộc.
  const colPref = usePref<{ subjects?: SubjectId[] }>(user.id, classId ? `tt27-mon.${classId.toLowerCase()}` : null);
  const chosen = colPref.value?.subjects?.filter((x) => allSubjects.includes(x));
  const subjects = chosen?.length ? allSubjects.filter((x) => chosen.includes(x)) : defaultCols(grade);
  const [colsOpen, setColsOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const bankQ = useCommentBankList();
  const addBank = useAddToBank();
  const bankAuto = useBankAuto(user.id);
  /** Nhận xét lúc tải về — để chỉ lưu câu MỚI / ĐÃ SỬA vào ngân hàng. */
  const orig = useRef<Record<string, Record<string, string>>>({});

  useEffect(() => {
    const m: Record<string, Tt27Evaluation> = {};
    for (const e of q.data ?? []) m[e.studentId] = e;
    orig.current = Object.fromEntries((q.data ?? []).map((e) => [e.studentId, { ...Object.fromEntries(Object.entries(e.subjects).map(([k, v]) => [k, v?.comment ?? ''])), _chung: e.generalComment ?? '' }]));
    setDrafts(m); setDirty(new Set()); setBasis({});
  }, [q.data]);
  useEffect(() => { setPicked(new Set()); }, [classId, termId]);

  const evalOf = (sid: string) => drafts[sid] ?? blank(sid, classId, termId, schoolYear);
  const edit = (sid: string, fn: (e: Tt27Evaluation) => Tt27Evaluation) => {
    setDrafts((d) => ({ ...d, [sid]: fn(d[sid] ?? blank(sid, classId, termId, schoolYear)) }));
    setDirty((s) => new Set(s).add(sid));
  };
  const setSubj = (sid: string, subj: SubjectId, p: Partial<Tt27SubjectResult>) => edit(sid, (e) => {
    const next: Tt27SubjectResult = { level: 'H', comment: '', ...e.subjects[subj], ...p };
    if (next.score === undefined || Number.isNaN(next.score)) delete next.score;
    return { ...e, subjects: { ...e.subjects, [subj]: next } };
  });

  const join = (old: string | undefined, text: string, mode: 'replace' | 'append') => (mode === 'append' && old?.trim() ? `${old.trim()} ${text}` : text);
  const pickedIds = () => roster.map((s) => s.id).filter((id) => picked.has(id));
  const bulk = (fn: (sid: string) => void, what: string) => {
    const ids = pickedIds();
    ids.forEach(fn);
    setMsg(`${what} cho ${ids.length} em (chưa lưu).`);
  };
  const toggle = (sid: string) => setPicked((p) => { const n = new Set(p); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; });

  const suggestFor = async (ids: string[]) => {
    setMsg(null);
    for (let i = 0; i < ids.length; i++) {
      setBusy(`Đang gợi ý ${i + 1}/${ids.length}…`);
      try {
        const { basis: b, ...s } = await suggest.mutateAsync({ studentId: ids[i], termId });
        const prev = drafts[ids[i]];
        edit(ids[i], () => ({ ...s, classId, schoolYear, status: prev?.status ?? 'draft' }));
        setBasis((x) => ({ ...x, [ids[i]]: b }));
      } catch { /* hiện lỗi qua suggest.error */ }
    }
    setBusy(null);
    setMsg(`Đã soạn nháp cho ${ids.length} em từ dữ liệu. Thầy/cô đọc, sửa rồi lưu nhé.`);
  };
  /** Câu nhận xét mới / đã sửa của các em vừa lưu → ngân hàng (bỏ câu có tên riêng của em). */
  const collectBank = (ids: string[]): BankAdd[] => {
    const out: BankAdd[] = [];
    for (const sid of ids) {
      const e = evalOf(sid);
      const name = roster.find((x) => x.id === sid)?.name;
      const o = orig.current[sid] ?? {};
      for (const [subj, r] of Object.entries(e.subjects)) {
        const t = r?.comment?.trim();
        if (t && t !== (o[subj] ?? '').trim() && bankable(t, name)) out.push({ scope: tt27Scope(subj as SubjectId), level: r!.level, text: t });
      }
      const g = e.generalComment?.trim();
      if (g && g !== (o._chung ?? '').trim() && bankable(g, name)) out.push({ scope: TT27_GENERAL_SCOPE, text: g });
      orig.current[sid] = { ...Object.fromEntries(Object.entries(e.subjects).map(([k, v]) => [k, v?.comment ?? ''])), _chung: e.generalComment ?? '' };
    }
    return out;
  };
  const saveAll = async (status?: 'draft' | 'final') => {
    const ids = status === 'final' ? roster.map((s) => s.id).filter((id) => drafts[id] || dirty.has(id)) : Array.from(dirty);
    setMsg(null);
    // Lấy câu mới TRƯỚC khi lưu (sau mỗi lần lưu dữ liệu được tải lại, câu vừa lưu sẽ thành "cũ").
    const candidates = bankAuto.on ? ids.map((id) => ({ id, items: collectBank([id]) })) : [];
    const done: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      setBusy(`Đang lưu ${i + 1}/${ids.length}…`);
      const e = evalOf(ids[i]);
      try { await save.mutateAsync({ ...e, ...(status ? { status } : {}), updatedBy: user.id }); done.push(ids[i]); } catch { break; }
    }
    setBusy(null);
    const fresh = candidates.filter((c) => done.includes(c.id)).flatMap((c) => c.items);
    if (fresh.length) addBank.mutate(fresh);
    if (!save.error) setMsg(`${status === 'final' ? 'Đã chốt bản chính thức — phụ huynh và học sinh xem được.' : 'Đã lưu nháp.'}${fresh.length ? ` ${fresh.length} câu nhận xét mới đã vào ngân hàng.` : ''}`);
  };
  const stats = useMemo(() => {
    const c = { final: 0, draft: 0, none: 0 };
    for (const s of roster) { const e = drafts[s.id]; if (!e) c.none++; else c[e.status]++; }
    return c;
  }, [roster, drafts]);
  const det = detail ? roster.find((s) => s.id === detail) : undefined;
  const de = detail ? evalOf(detail) : null;

  if (print && cls) {
    return (
      <div className="tc-page tc-tt27print">
        <div className="tc-row tc-noprint"><Btn icon="back" onClick={() => setPrint(false)}>Quay lại chỉnh sửa</Btn><Btn kind="primary" onClick={() => window.print()}>In</Btn></div>
        <h1>Bảng tổng hợp đánh giá — Lớp {cls.name} — {TT27_TERM_LABEL[termId]} — năm học {schoolYear}</h1>
        <table className="tc-table tc-printtable">
          <thead><tr><th>TT</th><th>Họ tên</th>{subjects.map((s) => <th key={s} title={SUBJECTS[s].name}>{SUBJECTS[s].short}</th>)}<th>Phẩm chất</th><th>Năng lực</th></tr></thead>
          <tbody>
            {roster.map((s, i) => {
              const e = evalOf(s.id);
              const cnt = (r: Partial<Record<string, Tt27Rating>>) => RATINGS.map((x) => `${Object.values(r).filter((v) => v === x).length}${x}`).join(' ');
              return <tr key={s.id}><td>{i + 1}</td><td>{s.name}</td>{subjects.map((x) => <td key={x}>{e.subjects[x]?.level ?? ''}{e.subjects[x]?.score !== undefined ? ` (${e.subjects[x]!.score})` : ''}</td>)}<td>{cnt(e.qualities)}</td><td>{cnt(e.competencies)}</td></tr>;
            })}
          </tbody>
        </table>
        {roster.map((s) => {
          const e = evalOf(s.id);
          return (
            <section key={s.id} className="tc-tt27sheet">
              <h2>{s.name} <small className="tc-muted">· {e.status === 'final' ? 'chính thức' : 'nháp'}</small></h2>
              {subjects.filter((x) => e.subjects[x]?.comment).map((x) => <p key={x}><b>{SUBJECTS[x].name} ({e.subjects[x]!.level}):</b> {e.subjects[x]!.comment}</p>)}
              {e.generalComment ? <p><b>Nhận xét chung:</b> {e.generalComment}</p> : null}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <BankProvider value={bankQ.data?.items ?? []}>
    <div className="tc-page tc-page--wide">
      <PageHead title="Nhận xét theo Thông tư 27" sub={`Năm học ${schoolYear}. Mức môn học T/H/C, phẩm chất và năng lực T/Đ/C. Bản chính thức mới hiện cho phụ huynh.`} actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <Seg label="Kì đánh giá" value={termId} onChange={setTermId} options={TERMS.map((t) => ({ value: t, label: TT27_TERM_LABEL[t] }))} />
      </>} />
      <div className="tc-toolbar">
        <span className="tc-chip tc-chip--ok">{stats.final} chính thức</span>
        <span className="tc-chip">{stats.draft} nháp</span>
        <span className="tc-chip">{stats.none} chưa có</span>
        {busy ? <span className="tc-small tc-muted" role="status">{busy}</span> : msg ? <span className="tc-small tc-ok" role="status">{msg}</span> : null}
        <span className="tc-ebar__spacer" />
        <Btn icon="settings" onClick={() => setColsOpen(true)} title="Chọn môn hiện trên bảng" data-testid="tt27-cols">Môn hiển thị ({subjects.length}/{allSubjects.length})</Btn>
        <Btn icon="book" onClick={() => setBankOpen(true)} data-testid="tt27-bank">Ngân hàng nhận xét{bankQ.data?.items.length ? ` (${bankQ.data.items.length})` : ''}</Btn>
        <Btn icon="team" disabled={!roster.length} onClick={() => setPicked(new Set(roster.map((x) => x.id)))} title="Chọn cả lớp để nhập mức / nhận xét một lần (bỏ tích những em khác biệt)" data-testid="tt27-bulk-open">Nhập chung cho nhiều em</Btn>
        <Btn icon="hint" disabled={!!busy || !roster.length} onClick={() => { const open = roster.filter((s) => drafts[s.id]?.status !== 'final').map((s) => s.id); void suggestFor(open.length ? open : roster.map((s) => s.id)); }}>Gợi ý từ dữ liệu</Btn>
        <Btn icon="eye" onClick={() => setPrint(true)}>Xem bản in</Btn>
        <Btn disabled={!!busy || !dirty.size} onClick={() => void saveAll()}>Lưu nháp{dirty.size ? ` (${dirty.size})` : ''}</Btn>
        <Btn kind="primary" icon="check" disabled={!!busy} onClick={() => void saveAll('final')}>Chốt chính thức</Btn>
      </div>
      <ErrorNote error={classes.error ?? q.error ?? save.error ?? suggest.error ?? addBank.error} onRetry={() => void q.refetch()} />
      {!picked.size && roster.length ? <p className="tc-small tc-muted tc-tt27hint">Mẹo: tích chọn các em ở cột đầu (hoặc bấm <b>Nhập chung cho nhiều em</b>) để đặt mức và nhận xét một lần; bấm vào ô nhận xét để chọn câu từ ngân hàng.</p> : null}
      {picked.size > 0 && (
        <BulkBar count={picked.size} subjects={subjects} busy={!!busy} onClear={() => setPicked(new Set())}
          onLevel={(subj, v) => bulk((sid) => (subj === 'all' ? subjects : [subj]).forEach((x) => setSubj(sid, x, { level: v })), `Đã đặt mức ${v}`)}
          onComment={(subj, text, mode) => bulk((sid) => (subj === 'all' ? subjects : [subj]).forEach((x) => edit(sid, (e) => ({ ...e, subjects: { ...e.subjects, [x]: { level: 'H', ...e.subjects[x], comment: join(e.subjects[x]?.comment, text, mode) } } }))), 'Đã điền nhận xét môn')}
          onRatings={(v) => bulk((sid) => edit(sid, (e) => ({ ...e, qualities: Object.fromEntries(QUALITIES.map((k) => [k, v])) as Tt27Evaluation['qualities'], competencies: Object.fromEntries(COMPETENCIES.map((k) => [k, v])) as Tt27Evaluation['competencies'] })), `Đã đặt phẩm chất, năng lực = ${v}`)}
          onGeneral={(text, mode) => bulk((sid) => edit(sid, (e) => ({ ...e, generalComment: join(e.generalComment, text, mode) })), 'Đã điền nhận xét chung')}
          onSuggest={() => void suggestFor(pickedIds())} />
      )}
      {q.isLoading || rl ? <Loading /> : !roster.length ? <Empty icon="team" title="Lớp chưa có học sinh" /> : (
        <section className="tc-card tc-card--flush">
          <div className="tc-tablewrap">
            <table className="tc-table tc-tt27">
              <thead><tr><th scope="col" className="tc-tt27__pick"><input type="checkbox" aria-label="Chọn tất cả học sinh" checked={picked.size > 0 && picked.size === roster.length} ref={(el) => { if (el) el.indeterminate = picked.size > 0 && picked.size < roster.length; }} onChange={(e) => setPicked(e.target.checked ? new Set(roster.map((x) => x.id)) : new Set())} data-testid="tt27-pick-all" /></th><th scope="col">Học sinh</th>{subjects.map((s) => <th key={s} scope="col">{SUBJECTS[s].name}</th>)}<th scope="col">Phẩm chất · Năng lực</th><th scope="col">Trạng thái</th></tr></thead>
              <tbody>
                {roster.map((s) => {
                  const e = evalOf(s.id);
                  const qs = RATINGS.map((r) => ({ r, n: Object.values(e.qualities).filter((v) => v === r).length + Object.values(e.competencies).filter((v) => v === r).length }));
                  return (
                    <tr key={s.id} className={cx(dirty.has(s.id) && 'is-dirty', picked.has(s.id) && 'is-picked')}>
                      <td className="tc-tt27__pick"><input type="checkbox" aria-label={`Chọn ${s.name}`} checked={picked.has(s.id)} onChange={() => toggle(s.id)} /></td>
                      <th scope="row"><span className="tc-row"><Avatar mascot={s.avatarMascot} color={s.avatarColor} size={26} /><span>{s.name}{dirty.has(s.id) ? <em className="tc-warn tc-small"> · chưa lưu</em> : null}</span></span></th>
                      {subjects.map((subj) => (
                        <td key={subj} className="tc-tt27__cell">
                          <Pick label={`${s.name} · ${SUBJECTS[subj].name}`} value={e.subjects[subj]?.level} opts={LEVELS} onChange={(v) => setSubj(s.id, subj, { level: v })} title={(v) => TT27_LEVEL_LABEL[v]} />
                          <CommentInput className="tc-input tc-input--sm" rows={2} aria-label={`Nhận xét ${SUBJECTS[subj].name} của ${s.name}`} placeholder="Nhận xét…" value={e.subjects[subj]?.comment ?? ''} onChange={(v) => setSubj(s.id, subj, { comment: v })} scope={tt27Scope(subj)} level={e.subjects[subj]?.level} />
                        </td>
                      ))}
                      <td><Btn size="sm" onClick={() => setDetail(s.id)}>{qs.map((x) => `${x.n}${x.r}`).join(' · ')}</Btn></td>
                      <td>
                        <span className={cx('tc-chip', e.status === 'final' && drafts[s.id] ? 'tc-chip--ok' : '')}>{drafts[s.id] ? (e.status === 'final' ? 'Chính thức' : 'Nháp') : 'Chưa có'}</span>
                        <Btn size="sm" kind="ghost" icon="hint" aria-label={`Gợi ý cho ${s.name}`} title="Gợi ý từ dữ liệu" disabled={!!busy} onClick={() => void suggestFor([s.id])} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {det && de ? (
        <Dialog open wide title={`${det.name} — ${TT27_TERM_LABEL[termId]}`} onClose={() => setDetail(null)} footer={<>
          <label className="tc-switch"><input type="checkbox" checked={de.status === 'final'} onChange={(ev) => edit(det.id, (e) => ({ ...e, status: ev.target.checked ? 'final' : 'draft' }))} /> Bản chính thức</label>
          <Btn onClick={() => setDetail(null)}>Đóng</Btn>
          <Btn kind="primary" disabled={save.isPending} onClick={() => save.mutate({ ...de, updatedBy: user.id }, { onSuccess: () => { setDirty((x) => { const n = new Set(x); n.delete(det.id); return n; }); setDetail(null); } })}>Lưu</Btn>
        </>}>
          <div className="tc-stack">
            {basis[det.id]?.length ? <div className="tc-alert tc-alert--info"><div><b>Căn cứ gợi ý:</b><ul className="tc-bullets">{basis[det.id].map((b) => <li key={b}>{b}</li>)}</ul></div></div> : null}
            <div className="tc-grid2">
              <div>
                <h3 className="tc-h3">Phẩm chất</h3>
                <ul className="tc-ratelist">{QUALITIES.map((k) => <li key={k}><span>{TT27_QUALITY_LABEL[k]}</span><Pick label={TT27_QUALITY_LABEL[k]} value={de.qualities[k]} opts={RATINGS} onChange={(v) => edit(det.id, (e) => ({ ...e, qualities: { ...e.qualities, [k]: v } }))} title={(v) => TT27_RATING_LABEL[v]} /></li>)}</ul>
              </div>
              <div>
                <h3 className="tc-h3">Năng lực</h3>
                <ul className="tc-ratelist">{COMPETENCIES.map((k) => <li key={k}><span>{TT27_COMPETENCY_LABEL[k]}</span><Pick label={TT27_COMPETENCY_LABEL[k]} value={de.competencies[k]} opts={RATINGS} onChange={(v) => edit(det.id, (e) => ({ ...e, competencies: { ...e.competencies, [k]: v } }))} title={(v) => TT27_RATING_LABEL[v]} /></li>)}</ul>
              </div>
            </div>
            <div className="tc-row tc-wrap">
              {subjects.filter((x) => isPeriodicAt(x, cls?.grade ?? 4)).map((subj) => (
                <Field key={subj} label={`Điểm KTĐK ${SUBJECTS[subj].name}`}><input className="tc-input tc-input--num" type="number" min={0} max={10} step={0.5} value={de.subjects[subj]?.score ?? ''} onChange={(ev) => setSubj(det.id, subj, { score: ev.target.value === '' ? undefined : Math.max(0, Math.min(10, Number(ev.target.value))) })} /></Field>
              ))}
            </div>
            <Field label="Nhận xét chung"><CommentInput className="tc-input" rows={3} value={de.generalComment} onChange={(v) => edit(det.id, (e) => ({ ...e, generalComment: v }))} scope={TT27_GENERAL_SCOPE} /></Field>
          </div>
        </Dialog>
      ) : null}
      {colsOpen && cls ? <Tt27ColumnsDialog grade={grade} all={allSubjects} value={subjects} defaults={defaultCols(grade)} onClose={() => setColsOpen(false)} onSave={(v) => { colPref.set(v ? { subjects: v } : null); setColsOpen(false); }} /> : null}
      {bankOpen ? <Tt27BankDialog userId={user.id} subjects={subjects} onClose={() => setBankOpen(false)} /> : null}
    </div>
    </BankProvider>
  );
}
