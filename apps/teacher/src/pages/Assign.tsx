import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Assignment, Grade, LatePolicy, Profile } from '@openedu/contracts';
import { roundsOf, useAssignments, useCreateAssignment, useDeleteAssignment, useLessons, usePackages, useStudents, useUpdateAssignment } from '@openedu/data';
import { byFocus, useClasses, useFocusGrade } from '../lib/focusGrade';
import { Avatar, Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading, PageHead, Seg } from '../components/common';
import { cx, fmtDateTime, toLocalInput } from '../lib/format';
import { ShareClassroomButton } from './bridge/ShareClassroom';
import { AssignmentDetail, LateField, RetryDialog, roundLabel, StudentChip, useAssignmentReports } from './assign/report';

export default function Assign({ user }: { user: Profile }) {
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const lessons = useLessons(user.role === 'admin' ? {} : { ownerId: user.id });
  const pkgs = usePackages();
  const [classId, setClassId] = useState('');
  useEffect(() => { if (!classId && classes.data?.[0]) setClassId(classes.data[0].id); }, [classes.data, classId]);
  const students = useStudents(classId || undefined);
  const list = useAssignments({ classId: classId || undefined });
  const create = useCreateAssignment();

  const [kind, setKind] = useState<'lesson' | 'package'>('lesson');
  // ?bai=<id>: đến từ Ngân hàng câu hỏi → “Giao cho học sinh” (bài luyện tập vừa tạo).
  const [params] = useSearchParams();
  const [targetId, setTargetId] = useState(() => params.get('bai') ?? '');
  const [title, setTitle] = useState('');
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [openAt, setOpenAt] = useState(() => toLocalInput(new Date()));
  const [dueAt, setDueAt] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(20, 0, 0, 0); return toLocalInput(d); });
  const [ok, setOk] = useState('');
  const [late, setLate] = useState<LatePolicy>('allow');
  const [detail, setDetail] = useState<Assignment | null>(null);
  const [retry, setRetry] = useState<Assignment | null>(null);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const del = useDeleteAssignment();
  const reports = useAssignmentReports(list.data ?? [], students.data ?? [], lessons.data ?? []);
  const focus = useFocusGrade().grade;
  const clsGrade = classes.data?.find((c) => c.id === classId)?.grade;
  const targets = kind === 'lesson' ? byFocus(lessons.data ?? [], (clsGrade ?? focus) as Grade, (l) => l.grade).map((l) => ({ id: l.id, title: l.title, sub: `Lớp ${l.grade} · ${l.slides.length} slide${l.status === 'draft' ? ' · nháp' : ''}` })) : (pkgs.data ?? []).map((p) => ({ id: p.id, title: p.title, sub: p.kind.toUpperCase() }));
  const lessonById = useMemo(() => Object.fromEntries((lessons.data ?? []).map((l) => [l.id, l])), [lessons.data]);

  const submit = () => {
    setOk('');
    const t = targets.find((x) => x.id === targetId);
    if (!t || !classId) return;
    create.mutate(
      { targetType: kind, targetId, title: title.trim() || t.title, classId, studentIds: all ? [] : picked, openAt: new Date(openAt).toISOString(), ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}), createdBy: user.id, latePolicy: late },
      { onSuccess: (a) => { setOk(`Đã giao “${a.title}”.`); setTargetId(''); setTitle(''); } },
    );
  };
  const selectedLesson = kind === 'lesson' ? lessonById[targetId] : undefined;

  return (
    <div className="tc-page">
      <PageHead title="Giao bài" sub="Giao bài giảng, bài luyện tập từ Ngân hàng câu hỏi hoặc gói HTML5 cho cả lớp hay từng em, có hạn nộp." />
      <div className="tc-assign">
        <section className="tc-card tc-stack">
          <h2>Giao bài mới</h2>
          <div className="tc-field"><span className="tc-field__label">1. Nội dung</span><Seg label="Loại" value={kind} onChange={(k) => { setKind(k); setTargetId(''); }} options={[{ value: 'lesson', label: 'Bài giảng' }, { value: 'package', label: 'Gói HTML5' }]} /></div>
          <select className="tc-input" value={targetId} onChange={(e) => setTargetId(e.target.value)} aria-label="Chọn nội dung">
            <option value="">— Chọn {kind === 'lesson' ? 'bài giảng' : 'gói'} —</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.sub})</option>)}
          </select>
          {selectedLesson?.status === 'draft' ? <p className="tc-small tc-warn">Bài này còn là nháp — HS vẫn mở được, nhưng nên xuất bản trước khi giao.</p> : null}
          <Field label="Tên hiển thị cho HS"><input className="tc-input" value={title} placeholder={targets.find((t) => t.id === targetId)?.title ?? ''} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="2. Lớp">
            <select className="tc-input" value={classId} onChange={(e) => { setClassId(e.target.value); setPicked([]); }}>
              {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>Lớp {c.name} ({c.studentIds.length} HS)</option>)}
            </select>
          </Field>
          <div className="tc-field">
            <span className="tc-field__label">3. Học sinh</span>
            <Seg label="Đối tượng" value={all ? 'all' : 'some'} onChange={(v) => setAll(v === 'all')} options={[{ value: 'all', label: 'Cả lớp' }, { value: 'some', label: 'Chọn từng em' }]} />
            {!all ? (
              <div className="tc-pickstudents">
                {(students.data ?? []).map((s) => (
                  <button key={s.id} type="button" aria-pressed={picked.includes(s.id)} onClick={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}>
                    <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={26} /> {s.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="tc-grid2 tc-grid2--tight">
            <Field label="4. Mở lúc"><input className="tc-input" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} /></Field>
            <Field label="Hạn nộp"><input className="tc-input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
          </div>
          <LateField value={late} onChange={setLate} />
          <ErrorNote error={create.error} />
          {ok ? <div className="tc-alert tc-alert--ok"><span>{ok}</span></div> : null}
          <Btn kind="primary" size="lg" onClick={submit} disabled={!targetId || !classId || (!all && !picked.length) || create.isPending}>Giao bài</Btn>
        </section>

        <section className="tc-stack">
          <h2>Bài đã giao{classes.data?.find((c) => c.id === classId) ? ` — lớp ${classes.data.find((c) => c.id === classId)?.name}` : ''}</h2>
          <ErrorNote error={del.error} />
          {list.isLoading ? <Loading /> : !list.data?.length ? <Empty icon="check" title="Lớp này chưa có bài được giao" /> : list.data.map((a) => {
            const who = (students.data ?? []).filter((s) => !a.studentIds.length || a.studentIds.includes(s.id));
            const overdue = a.dueAt && new Date(a.dueAt).getTime() < Date.now();
            return (
              <article key={a.id} className="tc-card tc-assigncard">
                <header className="tc-row tc-wrap">
                  <span className="tc-chip">{a.targetType === 'lesson' ? 'Bài giảng' : a.targetType === 'package' ? 'Gói HTML5' : 'Luyện tập'}</span>
                  <strong>{a.title}</strong>
                  {(a.round ?? 1) > 1 ? <span className="tc-chip tc-chip--ok">{roundLabel(a)}</span> : null}
                  {a.latePolicy === 'lock' ? <span className="tc-chip" title="Quá hạn thì khóa bài">Khóa khi quá hạn</span> : null}
                  <span className="tc-ebar__spacer" />
                  {a.targetType !== 'practice' ? <ShareClassroomButton kind={a.targetType === 'package' ? 'package' : 'lesson'} id={a.targetId} title={a.title} compact /> : null}
                  <span className={cx('tc-small', overdue ? 'tc-warn' : 'tc-muted')}>Mở {fmtDateTime(a.openAt)}{a.dueAt ? ` · Hạn ${fmtDateTime(a.dueAt)}${overdue ? ' (đã quá hạn)' : ''}` : ''}</span>
                </header>
                <div className="tc-row tc-wrap">
                  <p className="tc-muted tc-small">{a.studentIds.length ? `${a.studentIds.length} học sinh được chọn` : 'Cả lớp'}{reports.reports[a.id] ? ` · hoàn thành ${reports.reports[a.id]!.summary.completed}/${reports.reports[a.id]!.summary.assigned}${reports.reports[a.id]!.summary.avgPercent != null ? ` · điểm TB ${reports.reports[a.id]!.summary.avgPercent}%` : ''}` : ''}</p>
                  <span className="tc-ebar__spacer" />
                  <Btn size="sm" icon="eye" onClick={() => setDetail(a)} data-testid="assign-report">Báo cáo</Btn>
                  <Btn size="sm" icon="plus" onClick={() => setRetry(a)} data-testid="assign-retry">Giao lại</Btn>
                  <Btn size="sm" icon="pencil" onClick={() => setEditing(a)} data-testid="assign-edit">Sửa</Btn>
                  <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xoá bài đã giao ${a.title}`} onClick={() => setDelId(a.id)} data-testid="assign-delete" />
                </div>
                {delId === a.id ? <ConfirmBar text={`Xoá bài đã giao “${a.title}”? Học sinh sẽ không thấy bài này nữa (kết quả đã làm vẫn giữ trong hồ sơ).`} busy={del.isPending} onCancel={() => setDelId(null)} onConfirm={() => del.mutate(a.id, { onSuccess: () => { setDelId(null); setOk(`Đã xoá “${a.title}”.`); } })} /> : null}
                <div className="tc-chips">{reports.reports[a.id] ? reports.reports[a.id]!.students.map((s) => <StudentChip key={s.studentId} s={s} profile={who.find((p) => p.id === s.studentId)} />) : who.map((s) => <span key={s.id} className="tc-chip tc-chip--student">{s.name}</span>)}</div>
              </article>
            );
          })}
        </section>
      </div>
      {detail ? <AssignmentDetail a={detail} all={list.data ?? []} me={user} className={classes.data?.find((c) => c.id === detail.classId)?.name ?? ''} onClose={() => setDetail(null)} /> : null}
      {editing ? <EditAssignmentDialog a={editing} students={students.data ?? []} onClose={() => setEditing(null)} onSaved={(n) => { setEditing(null); setOk(`Đã sửa “${n.title}”.`); }} /> : null}
      {retry && students.data ? <RetryDialog base={retry} rounds={roundsOf(retry, list.data ?? [])} report={reports.reports[roundsOf(retry, list.data ?? []).slice(-1)[0]?.id ?? retry.id]} students={students.data} me={user} onClose={() => setRetry(null)} onDone={(n) => { setRetry(null); setOk(`Đã giao lại “${n.title}” (${roundLabel(n)}).`); }} /> : null}
    </div>
  );
}

/** Sửa bài đã giao: tên, đối tượng, giờ mở, hạn nộp, nộp muộn. Nội dung (bài giảng / gói) giữ nguyên — muốn đổi thì giao bài mới. */
function EditAssignmentDialog({ a, students, onClose, onSaved }: { a: Assignment; students: Profile[]; onClose: () => void; onSaved: (a: Assignment) => void }) {
  const save = useUpdateAssignment();
  const [title, setTitle] = useState(a.title);
  const [all, setAll] = useState(!a.studentIds.length);
  const [picked, setPicked] = useState<string[]>(a.studentIds);
  const [openAt, setOpenAt] = useState(() => toLocalInput(new Date(a.openAt)));
  const [dueAt, setDueAt] = useState(() => (a.dueAt ? toLocalInput(new Date(a.dueAt)) : ''));
  const [late, setLate] = useState<LatePolicy>(a.latePolicy ?? 'allow');
  const bad = !title.trim() || (!all && !picked.length) || (!!dueAt && new Date(dueAt).getTime() < new Date(openAt).getTime());
  const submit = () => {
    const next: Assignment = { ...a, title: title.trim(), studentIds: all ? [] : picked, openAt: new Date(openAt).toISOString(), latePolicy: late };
    if (dueAt) next.dueAt = new Date(dueAt).toISOString(); else delete next.dueAt;
    save.mutate(next, { onSuccess: onSaved });
  };
  return (
    <Dialog open title="Sửa bài đã giao" onClose={onClose} footer={<>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" onClick={submit} disabled={bad || save.isPending} data-testid="assign-edit-save">{save.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}</Btn>
    </>}>
      <div className="tc-stack">
        <Field label="Tên hiển thị cho HS"><input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="tc-field">
          <span className="tc-field__label">Học sinh</span>
          <Seg label="Đối tượng" value={all ? 'all' : 'some'} onChange={(v) => setAll(v === 'all')} options={[{ value: 'all', label: 'Cả lớp' }, { value: 'some', label: 'Chọn từng em' }]} />
          {!all ? (
            <div className="tc-pickstudents">
              {students.map((s) => (
                <button key={s.id} type="button" aria-pressed={picked.includes(s.id)} onClick={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}>
                  <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={26} /> {s.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="tc-grid2 tc-grid2--tight">
          <Field label="Mở lúc"><input className="tc-input" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} /></Field>
          <Field label="Hạn nộp (để trống = không hạn)"><input className="tc-input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-label="Hạn nộp" /></Field>
        </div>
        <LateField value={late} onChange={setLate} />
        {dueAt && new Date(dueAt).getTime() < new Date(openAt).getTime() ? <p className="tc-small tc-warn">Hạn nộp phải sau giờ mở.</p> : null}
        <ErrorNote error={save.error} />
      </div>
    </Dialog>
  );
}
