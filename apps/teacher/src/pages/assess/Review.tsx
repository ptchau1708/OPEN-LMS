import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { GRADE_FLAG_LABEL, MISCONCEPTIONS, SKILL_BY_CODE, TT27_LEVEL_LABEL, type GradeFinal, type Profile, type Rubric, type SubmissionDetail } from '@openedu/contracts';
import { Icon } from '@openedu/ui';
import { clamp, fmtScore, levelFor, totalFromCriteria, useRequestAiGrade, useReviewGrade, useSubmission, useSubmissions, useWorkTasks } from '@openedu/data';
import { Avatar, Btn, Empty, ErrorNote, Field, Loading, PageHead } from '../../components/common';
import { ClassPicker, LevelBadge, MockBadge, QUEUE_TABS, StatusChip, useClassPick, useHotkeys, useRoster } from '../../lib/assess';
import { cx, relTime } from '../../lib/format';

function useQueue(classId: string, tabId: string, taskId: string) {
  const subs = useSubmissions(classId ? { classId } : undefined);
  const tab = QUEUE_TABS.find((t) => t.id === tabId) ?? QUEUE_TABS[0];
  const all = (subs.data ?? []).filter((s) => !taskId || s.taskId === taskId);
  const list = all.filter((s) => tab.status.includes(s.status));
  const counts = Object.fromEntries(QUEUE_TABS.map((t) => [t.id, all.filter((s) => t.status.includes(s.status)).length]));
  return { subs, tab, list, counts };
}

const pctConf = (c: number) => `${Math.round(c * 100)}%`;
function ConfBadge({ c }: { c: number }) {
  return <span className={cx('tc-chip', c < 0.7 ? 'tc-chip--warn' : 'tc-chip--ok')} title="Độ tin cậy của bản chấm">Tin cậy {pctConf(c)}</span>;
}

/* ============================ hàng chờ ============================ */
export default function ReviewQueue({ user }: { user: Profile }) {
  const { list: classes, cls, classId, setClassId, classes: cq } = useClassPick(user);
  const [sp, setSp] = useSearchParams();
  const tabId = sp.get('tab') ?? QUEUE_TABS[0].id;
  const taskId = sp.get('bai') ?? '';
  const tasks = useWorkTasks(classId ? { classId } : undefined);
  const { subs, tab, list, counts } = useQueue(classId, tabId, taskId);
  const { roster } = useRoster(cls);
  const grade = useRequestAiGrade();
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const setParam = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const qs = sp.toString();
  const gradeAll = async () => {
    const ids = list.filter((s) => s.status !== 'grading').map((s) => s.id);
    setBatch({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      try { await grade.mutateAsync(ids[i]); } catch { /* lỗi hiện ở từng bài (status error) */ }
      setBatch({ done: i + 1, total: ids.length });
    }
    setBatch(null);
  };

  return (
    <div className="tc-page">
      <PageHead title="Chấm bài" sub="AI chấm trước, thầy cô duyệt. Học sinh và phụ huynh chỉ thấy điểm sau khi duyệt." actions={<>
        <ClassPicker list={classes} value={classId} onChange={setClassId} />
        <select className="tc-input tc-input--sm" aria-label="Lọc theo bài" value={taskId} onChange={(e) => setParam('bai', e.target.value)}>
          <option value="">Tất cả bài</option>
          {(tasks.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </>} />
      <div className="tc-tabs" role="tablist" aria-label="Trạng thái bài nộp">
        {QUEUE_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tab.id} className={cx('tc-tab', t.id === tab.id && 'is-active')} onClick={() => setParam('tab', t.id)}>
            {t.label}<em className={cx('tc-tab__n', t.id === 'can-xem' && counts[t.id] > 0 && 'is-warn')}>{counts[t.id] ?? 0}</em>
          </button>
        ))}
      </div>
      <ErrorNote error={cq.error ?? subs.error} onRetry={() => void subs.refetch()} />
      {tab.id === 'cho-cham' && list.length ? (
        <div className="tc-alert tc-alert--info">
          <span>{batch ? `Đang chấm ${batch.done}/${batch.total}…` : `${list.length} bài chưa có điểm.`}</span>
          <Btn size="sm" kind="primary" disabled={!!batch} onClick={() => void gradeAll()}>Chấm tất cả bằng AI</Btn>
        </div>
      ) : null}
      {subs.isLoading || cq.isLoading ? <Loading /> : !list.length ? (
        <Empty icon={tab.id === 'can-xem' ? 'check' : 'pencil'} title={tab.id === 'can-xem' ? 'Không có bài nào cần xem lại' : 'Chưa có bài nào ở đây'}>
          {tab.id === 'can-xem' ? 'Bài AI chưa chắc chắn hoặc có cờ cảnh báo sẽ hiện ở đây.' : <Link to={`/bai-viet?lop=${classId}`}>Chụp bài giấy hoặc giao bài mới</Link>}
        </Empty>
      ) : (
        <ul className="tc-card tc-card--flush tc-list tc-queue">
          {list.map((s) => {
            const st = roster.find((r) => r.id === s.studentId);
            const g = s.final ?? s.grade;
            return (
              <li key={s.id}>
                <Link className="tc-queue__row" to={`/cham-bai/${s.id}?${qs}`}>
                  {s.images[0] ? <img className="tc-queue__thumb" src={s.images[0].url} alt="" /> : <span className="tc-queue__thumb tc-queue__thumb--text" aria-hidden="true"><Icon name="pencil" size={18} /></span>}
                  <span className="tc-queue__who">
                    <span className="tc-row">{st ? <Avatar mascot={st.avatarMascot} color={st.avatarColor} size={22} /> : null}<strong>{s.studentName ?? st?.name ?? 'Học sinh'}</strong></span>
                    <small className="tc-muted">{s.taskTitle} · {s.images.length ? `${s.images.length} ảnh` : 'đánh máy'}{s.submittedBy === 'teacher' ? ' · GV nộp hộ' : ''} · {relTime(s.updatedAt ?? s.createdAt)}</small>
                  </span>
                  <span className="tc-queue__meta">
                    {s.grade?.flags.map((f) => <span key={f} className="tc-chip tc-chip--warn">{GRADE_FLAG_LABEL[f]}</span>)}
                    {s.grade && s.status !== 'approved' ? <ConfBadge c={s.grade.confidence} /> : null}
                    {s.grade?.mock ? <MockBadge /> : null}
                    {s.status === 'error' && s.error ? <span className="tc-small tc-warn">{s.error}</span> : null}
                    <StatusChip status={s.status} />
                  </span>
                  <span className="tc-queue__score">{g ? <><LevelBadge level={g.level} /><b>{fmtScore(g.total)}</b><small className="tc-muted">/{g.max}</small></> : <LevelBadge />}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="tc-small tc-muted">Phím tắt khi chấm: <kbd>A</kbd> duyệt · <kbd>J</kbd>/<kbd>K</kbd> bài sau/trước · <kbd>+</kbd>/<kbd>−</kbd> phóng to ảnh.</p>
    </div>
  );
}

/* ============================ màn duyệt ============================ */
function ImageViewer({ sub, transcript }: { sub: SubmissionDetail; transcript: string[] }) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const img = sub.images[page];
  useHotkeys({ '+': () => setZoom((z) => Math.min(4, z + 0.5)), '=': () => setZoom((z) => Math.min(4, z + 0.5)), '-': () => setZoom((z) => Math.max(1, z - 0.5)) });
  return (
    <section className="tc-card tc-viewer" aria-label="Bài làm">
      {sub.images.length ? (
        <>
          <div className="tc-row tc-wrap tc-viewer__bar">
            {sub.images.length > 1 ? sub.images.map((_, i) => <button key={i} type="button" className={cx('tc-pagebtn', i === page && 'is-active')} aria-pressed={i === page} onClick={() => { setPage(i); setZoom(1); }}>Trang {i + 1}</button>) : <span className="tc-small tc-muted">1 trang</span>}
            <span className="tc-ebar__spacer" />
            <Btn size="sm" kind="ghost" aria-label="Thu nhỏ" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>−</Btn>
            <span className="tc-small" aria-live="polite">{Math.round(zoom * 100)}%</span>
            <Btn size="sm" kind="ghost" aria-label="Phóng to" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>+</Btn>
            <Btn size="sm" kind="ghost" onClick={() => setZoom(1)}>Vừa khung</Btn>
          </div>
          <div className="tc-viewer__stage">
            {img ? <img src={img.url} alt={`Bài làm trang ${page + 1}`} style={{ width: `${zoom * 100}%` }} onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))} /> : null}
          </div>
          {transcript[page] ? (
            <details className="tc-transcript" open>
              <summary>Chữ AI đọc được (trang {page + 1})</summary>
              <pre>{transcript[page]}</pre>
            </details>
          ) : null}
        </>
      ) : null}
      {sub.text ? <div className="tc-typed"><h3 className="tc-h3">Bài đánh máy</h3><pre>{sub.text}</pre></div> : null}
    </section>
  );
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  const set = (v: number) => onChange(clamp(Math.round(v * 2) / 2, 0, max));
  return (
    <span className="tc-stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Bớt 0,5 điểm" disabled={value <= 0} onClick={() => set(value - 0.5)}>−</button>
      <input type="number" inputMode="decimal" aria-label={`${label}: điểm`} min={0} max={max} step={0.5} value={value} onChange={(e) => set(Number(e.target.value) || 0)} />
      <button type="button" aria-label="Thêm 0,5 điểm" disabled={value >= max} onClick={() => set(value + 0.5)}>+</button>
      <small>/ {fmtScore(max)}</small>
    </span>
  );
}

function initFinal(d: SubmissionDetail, rubric: Rubric | undefined): GradeFinal | null {
  const g = d.grade;
  if (!g) return null;
  const src = d.final ?? { total: g.total, max: g.max, level: g.level, criteria: g.criteria.map((c) => ({ criterionId: c.criterionId, points: c.points, comment: c.comment })), feedbackStudent: g.feedbackStudent, feedbackParent: g.feedbackParent, feedbackTeacher: g.feedbackTeacher };
  const crit = rubric ? rubric.criteria.map((rc) => src.criteria.find((c) => c.criterionId === rc.id) ?? { criterionId: rc.id, points: 0, comment: '' }) : src.criteria;
  return { ...src, criteria: crit, feedbackTeacher: src.feedbackTeacher ?? g.feedbackTeacher };
}

function GradePanel({ d, user, onDone }: { d: SubmissionDetail; user: Profile; onDone: (next: boolean) => void }) {
  const rubric = d.rubric;
  const g = d.grade!;
  const [f, setF] = useState<GradeFinal>(() => initFinal(d, rubric)!);
  const [orig] = useState(() => JSON.stringify(initFinal(d, rubric)));
  const [redo, setRedo] = useState(false);
  const [note, setNote] = useState('');
  const review = useReviewGrade();
  const dirty = JSON.stringify(f) !== orig;
  const maxOf = (id: string) => rubric?.criteria.find((c) => c.id === id)?.points ?? g.criteria.find((c) => c.criterionId === id)?.max ?? 10;
  const setPts = (i: number, pts: number) => setF((x) => {
    const criteria = x.criteria.map((c, j) => (j === i ? { ...c, points: pts } : c));
    const t = rubric ? totalFromCriteria(criteria.map((c) => c.points), rubric) : { total: criteria.reduce((a, c) => a + c.points, 0), max: x.max };
    return { ...x, criteria, total: t.total, max: t.max, level: levelFor(t.total, t.max) };
  });
  const act = (decision: 'approved' | 'edited' | 'regrade' | 'redo') => {
    review.mutate({ submissionId: d.id, teacherId: user.id, decision, ...(decision === 'edited' ? { final: f } : {}), ...(decision === 'redo' ? { note: note.trim() || 'Em xem lại bài và làm lại giúp cô nhé.' } : {}) }, { onSuccess: () => onDone(decision === 'approved' || decision === 'edited') });
  };
  const approve = () => act(dirty ? 'edited' : 'approved');
  useHotkeys({ a: () => { if (!review.isPending && !redo) approve(); } });
  const approved = d.status === 'approved';

  return (
    <section className="tc-card tc-gradepanel" aria-label="Chấm điểm">
      <header className="tc-gradepanel__total">
        <LevelBadge level={f.level} size="lg" />
        <div>
          <strong className="tc-gradepanel__score">{fmtScore(f.total)}<small>/{f.max}</small></strong>
          <span className="tc-small">{TT27_LEVEL_LABEL[f.level]}{dirty ? <em className="tc-warn"> · đã sửa</em> : d.review?.decision === 'edited' ? <em className="tc-muted"> · GV đã sửa</em> : null}</span>
        </div>
        <span className="tc-ebar__spacer" />
        <span className="tc-row tc-wrap" style={{ justifyContent: 'flex-end' }}>
          <ConfBadge c={g.confidence} />
          {g.mock ? <MockBadge /> : <span className="tc-chip" title="Mô hình chấm">{g.model}</span>}
        </span>
      </header>
      {g.flags.length ? (
        <div className="tc-alert tc-alert--warn" role="note"><Icon name="hint" size={18} /><span><b>Thầy cô xem kĩ:</b> {g.flags.map((x) => GRADE_FLAG_LABEL[x]).join(' · ')}</span></div>
      ) : null}

      <ol className="tc-critlist">
        {f.criteria.map((c, i) => {
          const rc = rubric?.criteria.find((x) => x.id === c.criterionId);
          const ai = g.criteria.find((x) => x.criterionId === c.criterionId);
          const max = maxOf(c.criterionId);
          return (
            <li key={c.criterionId}>
              <div className="tc-critlist__head">
                <strong>{rc?.name ?? c.criterionId}</strong>
                <Stepper label={rc?.name ?? c.criterionId} value={c.points} max={max} onChange={(v) => setPts(i, v)} />
              </div>
              {ai && ai.points !== c.points ? <small className="tc-muted">AI cho {fmtScore(ai.points)}</small> : null}
              <textarea className="tc-input tc-input--sm tc-w100" rows={2} aria-label={`Nhận xét tiêu chí ${rc?.name ?? ''}`} value={c.comment} onChange={(e) => setF((x) => ({ ...x, criteria: x.criteria.map((y, j) => (j === i ? { ...y, comment: e.target.value } : y)) }))} />
              {ai?.evidence ? <blockquote className="tc-aievidence">“{ai.evidence}”</blockquote> : null}
            </li>
          );
        })}
      </ol>

      {g.strengths.length ? <div><h3 className="tc-h3">Điểm mạnh</h3><ul className="tc-bullets">{g.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div> : null}
      {g.issues.length ? (
        <div>
          <h3 className="tc-h3">Lỗi / cần rèn</h3>
          <ul className="tc-issues">
            {g.issues.map((x, i) => (
              <li key={i}>
                <span>{x.text}{x.location ? <small className="tc-muted"> · {x.location}</small> : null}</span>
                <span className="tc-chips">
                  {x.skill ? <span className="tc-chip tc-chip--skill" title={x.skill}>{SKILL_BY_CODE[x.skill]?.short ?? x.skill}</span> : null}
                  {x.misconception ? <span className="tc-chip tc-chip--warn" title={MISCONCEPTIONS[x.misconception]?.text}>{MISCONCEPTIONS[x.misconception]?.text ?? x.misconception}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Field label="Lời nhắn cho học sinh"><textarea className="tc-input" rows={3} value={f.feedbackStudent} onChange={(e) => setF((x) => ({ ...x, feedbackStudent: e.target.value }))} /></Field>
      <Field label="Lời nhắn cho phụ huynh"><textarea className="tc-input" rows={2} value={f.feedbackParent} onChange={(e) => setF((x) => ({ ...x, feedbackParent: e.target.value }))} /></Field>
      <Field label="Chẩn đoán (chỉ thầy cô thấy)"><textarea className="tc-input tc-input--private" rows={2} value={f.feedbackTeacher ?? ''} onChange={(e) => setF((x) => ({ ...x, feedbackTeacher: e.target.value }))} /></Field>

      <ErrorNote error={review.error} />
      {redo ? (
        <div className="tc-redo">
          <Field label="Lời dặn khi trả bài (học sinh thấy)"><textarea className="tc-input" rows={2} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Em viết lại phần lời giải cho rõ nhé." /></Field>
          <div className="tc-row"><Btn onClick={() => setRedo(false)}>Hủy</Btn><Btn kind="primary" disabled={review.isPending} onClick={() => act('redo')}>Trả lại cho HS</Btn></div>
        </div>
      ) : (
        <div className="tc-gradepanel__actions">
          <Btn kind={dirty ? 'default' : 'primary'} size="lg" icon="check" disabled={review.isPending} onClick={() => act('approved')} title="Phím A khi chưa sửa">{approved && !dirty ? 'Duyệt lại' : dirty ? 'Duyệt bản AI' : 'Duyệt'}</Btn>
          <Btn kind={dirty ? 'primary' : 'default'} size="lg" icon="pencil" disabled={review.isPending || !dirty} onClick={() => act('edited')} title="Phím A khi đã sửa">Sửa &amp; duyệt</Btn>
          <Btn icon="retry" disabled={review.isPending} onClick={() => act('regrade')}>Chấm lại</Btn>
          <Btn icon="back" disabled={review.isPending} onClick={() => setRedo(true)}>Trả lại cho HS</Btn>
        </div>
      )}
    </section>
  );
}

export function ReviewScreen({ user }: { user: Profile }) {
  const { submissionId = '' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const q = useSubmission(submissionId);
  const classId = sp.get('lop') ?? q.data?.classId ?? '';
  const { list, tab } = useQueue(classId, sp.get('tab') ?? QUEUE_TABS[0].id, sp.get('bai') ?? '');
  const regrade = useRequestAiGrade();
  const [toast, setToast] = useState<string | null>(null);
  const ids = useMemo(() => list.map((s) => s.id), [list]);
  const idx = ids.indexOf(submissionId);
  const qs = sp.toString();
  const go = (id?: string) => { if (id) nav(`/cham-bai/${id}?${qs}`); };
  const nextId = idx >= 0 ? ids[idx + 1] : ids[0];
  const prevId = idx > 0 ? ids[idx - 1] : undefined;
  useHotkeys({ j: () => go(nextId), k: () => go(prevId) });

  const d = q.data;
  if (q.isLoading) return <Loading />;
  if (!d) return <div className="tc-page"><ErrorNote error={q.error ?? new Error('Không tìm thấy bài nộp.')} onRetry={() => void q.refetch()} /></div>;
  const onDone = (approvedNow: boolean) => {
    setToast(approvedNow ? `Đã duyệt bài của ${d.studentName ?? 'em'}` : 'Đã lưu');
    window.setTimeout(() => setToast(null), 2200);
    const after = idx >= 0 ? (ids[idx + 1] ?? ids[idx - 1]) : ids[0];
    if (approvedNow && after && after !== d.id) go(after);
  };

  return (
    <div className="tc-page tc-page--wide tc-review">
      <div className="tc-row tc-wrap tc-review__bar">
        <Link className="tc-btn tc-btn--ghost" to={`/cham-bai?${qs}`}><Icon name="back" size={18} /> {tab.label}</Link>
        <span className="tc-review__title">
          <strong>{d.studentName}</strong>
          <span className="tc-muted"> · {d.taskTitle}</span>
        </span>
        <StatusChip status={d.status} />
        {d.grade?.mock ? <MockBadge /> : null}
        <span className="tc-ebar__spacer" />
        {idx >= 0 ? <span className="tc-small tc-muted">{idx + 1}/{ids.length}</span> : null}
        <Btn size="sm" icon="back" aria-label="Bài trước (K)" title="Bài trước (K)" disabled={!prevId} onClick={() => go(prevId)} />
        <Btn size="sm" icon="next" aria-label="Bài sau (J)" title="Bài sau (J)" disabled={!nextId} onClick={() => go(nextId)} />
      </div>
      {d.task ? <details className="tc-card tc-card--flat tc-prompt"><summary>Đề bài</summary><p>{d.task.prompt.text}</p>{d.task.prompt.image ? <img src={d.task.prompt.image} alt="Ảnh đề bài" className="tc-promptimg" /> : null}</details> : null}
      {d.status === 'returned' && d.review?.note ? <div className="tc-alert"><span>Đã trả bài cho em làm lại: “{d.review.note}”</span></div> : null}

      <div className="tc-review__grid">
        <ImageViewer key={d.id} sub={d} transcript={d.grade?.transcript ?? []} />
        {d.grade && d.status !== 'grading' ? (
          <GradePanel key={`${d.id}:${d.grade.createdAt}:${d.review?.at ?? ''}`} d={d} user={user} onDone={onDone} />
        ) : (
          <section className="tc-card tc-gradepanel">
            {d.status === 'grading' || regrade.isPending ? <Loading label="AI đang chấm…" /> : (
              <Empty icon="pencil" title={d.status === 'error' ? 'Chưa chấm được' : 'Bài chưa được chấm'}>
                {d.error ? <p className="tc-warn">{d.error}</p> : null}
                <Btn kind="primary" size="lg" onClick={() => regrade.mutate(d.id)}>Chấm bằng AI</Btn>
              </Empty>
            )}
            <ErrorNote error={regrade.error} />
          </section>
        )}
      </div>
      {toast ? <div className="tc-toast" role="status">{toast}</div> : null}
    </div>
  );
}
