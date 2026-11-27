import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { SUBJECTS, type ClassInfo, type Profile, type Rubric, type SubmissionStatus, type WorkTask } from '@openedu/contracts';
import { compressWorkImage, useDeleteWorkTask, useRubrics, useSaveWorkTask, useSubmissions, useWorkTasks } from '@openedu/data';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading, PageHead, SubjectDot } from '../../components/common';
import { ClassPicker, QUEUE_TABS, useClassPick, useRoster } from '../../lib/assess';
import { fmtDateTime, shorten, toLocalInput } from '../../lib/format';
import { RubricEditor, blankRubric } from './Rubrics';
import { ShareClassroomButton } from '../bridge/ShareClassroom';
import { useFocusGrade } from '../../lib/focusGrade';

const COUNT_COLS: { label: string; status: SubmissionStatus[]; tone?: string }[] = [
  { label: 'Cần xem', status: ['needs-review'], tone: 'warn' },
  { label: 'Chờ duyệt', status: ['graded'], tone: 'info' },
  { label: 'Đã duyệt', status: ['approved'], tone: 'ok' },
  { label: 'Chờ chấm', status: ['submitted', 'grading', 'error'] },
];

function TaskDialog({ user, cls, initial, rubrics, onClose }: { user: Profile; cls: ClassInfo; initial: WorkTask; rubrics: Rubric[]; onClose: () => void }) {
  const [t, setT] = useState<WorkTask>(initial);
  const [rubricNew, setRubricNew] = useState<Rubric | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const { roster } = useRoster(cls);
  const save = useSaveWorkTask();
  const set = (p: Partial<WorkTask>) => setT((x) => ({ ...x, ...p }));
  const pickRubric = (id: string) => {
    const r = rubrics.find((x) => x.id === id);
    set({ rubricId: id, ...(r ? { subject: r.subject } : {}) });
  };
  const onImage = async (f?: File) => {
    if (!f) return;
    setImgBusy(true);
    try { set({ prompt: { ...t.prompt, image: (await compressWorkImage(f)).url } }); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setImgBusy(false); }
  };
  const submit = () => {
    if (!t.title.trim()) return setErr('Thầy/cô đặt tên bài nhé.');
    if (!t.prompt.text.trim() && !t.prompt.image) return setErr('Bài cần có đề bài (chữ hoặc ảnh).');
    if (!t.rubricId) return setErr('Chọn bộ tiêu chí chấm để AI chấm được.');
    if (!t.allowPhoto && !t.allowText) return setErr('Cho phép ít nhất một cách nộp.');
    setErr(null);
    save.mutate(t, { onSuccess: onClose });
  };
  const all = !t.studentIds.length;
  return (
    <Dialog open wide title={t.id ? 'Sửa bài viết' : 'Giao bài viết mới'} onClose={onClose} footer={<>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Đang lưu…' : t.id ? 'Lưu' : 'Giao bài'}</Btn>
    </>}>
      <div className="tc-stack">
        <Field label="Tên bài"><input className="tc-input" value={t.title} onChange={(e) => set({ title: e.target.value })} placeholder="vd: Hai lớp trồng cây" /></Field>
        <Field label="Đề bài"><textarea className="tc-input" rows={4} value={t.prompt.text} onChange={(e) => set({ prompt: { ...t.prompt, text: e.target.value } })} /></Field>
        <div className="tc-row tc-wrap">
          {t.prompt.image ? <img src={t.prompt.image} alt="Ảnh đề bài" className="tc-promptimg" /> : null}
          <label className="tc-btn tc-btn--sm"><input type="file" accept="image/*" className="tc-sr" onChange={(e) => void onImage(e.target.files?.[0])} />{imgBusy ? 'Đang xử lí ảnh…' : t.prompt.image ? 'Đổi ảnh đề bài' : 'Thêm ảnh đề bài (tuỳ chọn)'}</label>
          {t.prompt.image ? <Btn size="sm" kind="ghost" onClick={() => set({ prompt: { text: t.prompt.text } })}>Bỏ ảnh</Btn> : null}
        </div>
        <div className="tc-row tc-wrap" style={{ alignItems: 'flex-end' }}>
          <Field label="Tiêu chí chấm">
            <select className="tc-input" value={t.rubricId} onChange={(e) => pickRubric(e.target.value)}>
              <option value="">— Chọn —</option>
              {rubrics.map((r) => <option key={r.id} value={r.id}>{r.title} ({SUBJECTS[r.subject].name} {r.grade})</option>)}
            </select>
          </Field>
          <Btn icon="plus" onClick={() => setRubricNew(blankRubric(user, t.subject, cls.grade))}>Tạo tiêu chí mới</Btn>
          <Field label="Hạn nộp"><input className="tc-input" type="datetime-local" value={t.dueAt ? toLocalInput(new Date(t.dueAt)) : ''} onChange={(e) => set({ dueAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} /></Field>
        </div>
        <div className="tc-row tc-wrap">
          <label className="tc-switch"><input type="checkbox" checked={t.allowPhoto} onChange={(e) => set({ allowPhoto: e.target.checked })} /> Nộp bằng ảnh chụp</label>
          <label className="tc-switch"><input type="checkbox" checked={t.allowText} onChange={(e) => set({ allowText: e.target.checked })} /> Nộp bằng đánh máy</label>
        </div>
        <fieldset className="tc-fieldset">
          <legend>Giao cho</legend>
          <label className="tc-switch"><input type="checkbox" checked={all} onChange={(e) => set({ studentIds: e.target.checked ? [] : roster.map((s) => s.id) })} /> Cả lớp {cls.name}</label>
          {!all ? (
            <div className="tc-checkgrid">
              {roster.map((s) => (
                <label key={s.id} className="tc-switch tc-small"><input type="checkbox" checked={t.studentIds.includes(s.id)} onChange={(e) => set({ studentIds: e.target.checked ? [...t.studentIds, s.id] : t.studentIds.filter((x) => x !== s.id) })} /> {s.name}</label>
              ))}
            </div>
          ) : null}
        </fieldset>
        {err ? <div className="tc-alert tc-alert--error" role="alert">{err}</div> : null}
        <ErrorNote error={save.error} />
      </div>
      {rubricNew ? <RubricEditor initial={rubricNew} onClose={() => setRubricNew(null)} onSaved={(r) => set({ rubricId: r.id, subject: r.subject })} /> : null}
    </Dialog>
  );
}

export default function WorkTasks({ user }: { user: Profile }) {
  const { classes, list, cls, classId, setClassId } = useClassPick(user);
  const tasks = useWorkTasks(classId ? { classId } : undefined);
  const subs = useSubmissions(classId ? { classId } : undefined);
  const rubrics = useRubrics();
  const del = useDeleteWorkTask();
  const [edit, setEdit] = useState<WorkTask | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const counts = useMemo(() => {
    const m: Record<string, Partial<Record<SubmissionStatus, number>> & { students: Set<string> }> = {};
    for (const s of subs.data ?? []) {
      const c = (m[s.taskId] ??= { students: new Set() });
      c[s.status] = (c[s.status] ?? 0) + 1;
      c.students.add(s.studentId);
    }
    return m;
  }, [subs.data]);
  const rubricOf = (id: string) => rubrics.data?.find((r) => r.id === id);
  const focus = useFocusGrade().grade;
  const blank = (): WorkTask => ({ id: '', title: '', prompt: { text: '' }, subject: 'toan', grade: cls?.grade ?? focus, rubricId: '', classId, studentIds: [], allowPhoto: true, allowText: true, createdBy: user.id, dueAt: new Date(Date.now() + 3 * 86400_000).toISOString() });
  const pending = (subs.data ?? []).filter((s) => s.status === 'needs-review' || s.status === 'graded').length;

  return (
    <div className="tc-page">
      <PageHead title="Bài viết" sub="Bài làm trên giấy hoặc đánh máy, AI chấm theo tiêu chí, thầy/cô duyệt trước khi học sinh và phụ huynh thấy." actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        {pending ? <Link className="tc-btn" to={`/cham-bai?lop=${classId}`}>{pending} bài chờ duyệt</Link> : null}
        <Btn kind="primary" icon="plus" disabled={!cls} onClick={() => setEdit(blank())}>Giao bài viết</Btn>
      </>} />
      <ErrorNote error={classes.error ?? tasks.error ?? subs.error} onRetry={() => { void tasks.refetch(); void subs.refetch(); }} />
      {classes.isLoading || tasks.isLoading ? <Loading /> : !cls ? <Empty icon="team" title="Chưa có lớp nào" /> : !tasks.data?.length ? (
        <Empty icon="pencil" title="Chưa có bài viết nào">Giao một bài (vd giải toán có lời văn, tả con vật), rồi chụp bài làm trên giấy để AI chấm.</Empty>
      ) : (
        <ul className="tc-tasklist">
          {tasks.data.map((t) => {
            const c = counts[t.id];
            const total = t.studentIds.length || cls.studentIds.length;
            const r = rubricOf(t.rubricId);
            return (
              <li key={t.id} className="tc-card tc-taskcard">
                <div className="tc-taskcard__main">
                  <div className="tc-row tc-small tc-muted"><SubjectDot colorVar={SUBJECTS[t.subject].colorVar} />{SUBJECTS[t.subject].name} · Lớp {t.grade}{t.dueAt ? ` · hạn ${fmtDateTime(t.dueAt)}` : ''}{t.studentIds.length ? ` · ${t.studentIds.length} em` : ' · cả lớp'}</div>
                  <h2>{t.title}</h2>
                  <p className="tc-small tc-muted">{shorten(t.prompt.text, 140)}</p>
                  <p className="tc-small">Tiêu chí: {r ? r.title : <span className="tc-warn">chưa có</span>}</p>
                </div>
                <div className="tc-taskcard__counts" aria-label="Số bài theo trạng thái">
                  <div><strong>{c?.students.size ?? 0}/{total}</strong><span>đã nộp</span></div>
                  {COUNT_COLS.map((col) => {
                    const n = col.status.reduce((a, s) => a + (c?.[s] ?? 0), 0);
                    return <div key={col.label} className={n && col.tone ? `is-${col.tone}` : ''}><strong>{n}</strong><span>{col.label}</span></div>;
                  })}
                </div>
                {confirm === t.id ? <ConfirmBar text="Xóa bài này và mọi bài nộp?" busy={del.isPending} onCancel={() => setConfirm(null)} onConfirm={() => del.mutate(t.id, { onSettled: () => setConfirm(null) })} /> : (
                  <div className="tc-row tc-wrap tc-taskcard__actions">
                    {t.allowPhoto ? <Link className="tc-btn tc-btn--primary" to={`/bai-viet/${t.id}/chup?lop=${classId}`}>Chụp bài giấy</Link> : null}
                    <Link className="tc-btn" to={`/cham-bai?lop=${classId}&bai=${t.id}&tab=${QUEUE_TABS[0].id}`}>Xem bài nộp</Link>
                    <Btn icon="pencil" onClick={() => setEdit(t)}>Sửa</Btn>
                    <ShareClassroomButton kind="work" id={t.id} title={t.title} compact />
                    <span className="tc-ebar__spacer" />
                    <Btn kind="danger" icon="trash" aria-label={`Xóa ${t.title}`} onClick={() => setConfirm(t.id)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {edit && cls ? <TaskDialog user={user} cls={cls} initial={edit} rubrics={rubrics.data ?? []} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}
