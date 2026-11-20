import { useEffect, useMemo, useState } from 'react';
import type { Assignment, Lesson, Profile } from '@openedu/contracts';
import { useAssignments, useClasses, useCreateAssignment, useLessons, usePackages, useProgress, useStudents } from '@openedu/data';
import { Avatar, Btn, Empty, ErrorNote, Field, Loading, PageHead, Seg } from '../components/common';
import { cx, fmtDateTime, toLocalInput } from '../lib/format';
import { ShareClassroomButton } from './bridge/ShareClassroom';

function ProgressChip({ student, a, lesson }: { student: Profile; a: Assignment; lesson?: Lesson }) {
  const p = useProgress(a.targetType === 'lesson' ? student.id : undefined, a.targetId);
  let cls = '';
  let label = 'Chưa bắt đầu';
  if (a.targetType !== 'lesson') label = '—';
  else if (p.data?.completedAt) { cls = 'tc-chip--ok'; label = 'Hoàn thành'; }
  else if (p.data) { cls = 'tc-chip--warn'; label = `Đang làm${lesson ? ` ${Math.min(p.data.completedSlides.length, lesson.slides.length)}/${lesson.slides.length}` : ''}`; }
  return (
    <span className={cx('tc-chip tc-chip--student', cls)} title={student.name}>
      <Avatar mascot={student.avatarMascot} color={student.avatarColor} size={20} />
      {student.name} · {label}
    </span>
  );
}

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
  const [targetId, setTargetId] = useState('');
  const [title, setTitle] = useState('');
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [openAt, setOpenAt] = useState(() => toLocalInput(new Date()));
  const [dueAt, setDueAt] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(20, 0, 0, 0); return toLocalInput(d); });
  const [ok, setOk] = useState('');
  const targets = kind === 'lesson' ? (lessons.data ?? []).map((l) => ({ id: l.id, title: l.title, sub: `Lớp ${l.grade} · ${l.slides.length} slide${l.status === 'draft' ? ' · nháp' : ''}` })) : (pkgs.data ?? []).map((p) => ({ id: p.id, title: p.title, sub: p.kind.toUpperCase() }));
  const lessonById = useMemo(() => Object.fromEntries((lessons.data ?? []).map((l) => [l.id, l])), [lessons.data]);

  const submit = () => {
    setOk('');
    const t = targets.find((x) => x.id === targetId);
    if (!t || !classId) return;
    create.mutate(
      { targetType: kind, targetId, title: title.trim() || t.title, classId, studentIds: all ? [] : picked, openAt: new Date(openAt).toISOString(), ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}), createdBy: user.id },
      { onSuccess: (a) => { setOk(`Đã giao “${a.title}”.`); setTargetId(''); setTitle(''); } },
    );
  };
  const selectedLesson = kind === 'lesson' ? lessonById[targetId] : undefined;

  return (
    <div className="tc-page">
      <PageHead title="Giao bài" sub="Giao bài giảng hoặc gói HTML5 cho cả lớp hay từng em, có hạn nộp." />
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
          <ErrorNote error={create.error} />
          {ok ? <div className="tc-alert tc-alert--ok"><span>{ok}</span></div> : null}
          <Btn kind="primary" size="lg" onClick={submit} disabled={!targetId || !classId || (!all && !picked.length) || create.isPending}>Giao bài</Btn>
        </section>

        <section className="tc-stack">
          <h2>Bài đã giao{classes.data?.find((c) => c.id === classId) ? ` — lớp ${classes.data.find((c) => c.id === classId)?.name}` : ''}</h2>
          {list.isLoading ? <Loading /> : !list.data?.length ? <Empty icon="check" title="Lớp này chưa có bài được giao" /> : list.data.map((a) => {
            const who = (students.data ?? []).filter((s) => !a.studentIds.length || a.studentIds.includes(s.id));
            const overdue = a.dueAt && new Date(a.dueAt).getTime() < Date.now();
            return (
              <article key={a.id} className="tc-card tc-assigncard">
                <header className="tc-row tc-wrap">
                  <span className="tc-chip">{a.targetType === 'lesson' ? 'Bài giảng' : a.targetType === 'package' ? 'Gói HTML5' : 'Luyện tập'}</span>
                  <strong>{a.title}</strong>
                  <span className="tc-ebar__spacer" />
                  {a.targetType !== 'practice' ? <ShareClassroomButton kind={a.targetType === 'package' ? 'package' : 'lesson'} id={a.targetId} title={a.title} compact /> : null}
                  <span className={cx('tc-small', overdue ? 'tc-warn' : 'tc-muted')}>Mở {fmtDateTime(a.openAt)}{a.dueAt ? ` · Hạn ${fmtDateTime(a.dueAt)}${overdue ? ' (đã quá hạn)' : ''}` : ''}</span>
                </header>
                <p className="tc-muted tc-small">{a.studentIds.length ? `${a.studentIds.length} học sinh được chọn` : 'Cả lớp'}</p>
                <div className="tc-chips">{who.map((s) => <ProgressChip key={s.id} student={s} a={a} lesson={lessonById[a.targetId]} />)}</div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
