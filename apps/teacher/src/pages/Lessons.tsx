import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { SUBJECT_LIST, SUBJECTS, uid, type Grade, type Lesson, type Profile, type SubjectId } from '@openedu/contracts';
import { Mascot } from '@openedu/ui';
import { useLessons, useSaveLesson } from '@openedu/data';
import { Btn, Dialog, Empty, ErrorNote, Field, Loading, PageHead, Seg } from '../components/common';
import { relTime } from '../lib/format';
import { ShareClassroomButton } from './bridge/ShareClassroom';

export function CreateLessonDialog({ open, onClose, user }: { open: boolean; onClose: () => void; user: Profile }) {
  const nav = useNavigate();
  const save = useSaveLesson();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<SubjectId>('toan');
  const [grade, setGrade] = useState<Grade>(2);
  const create = () => {
    const t = title.trim() || 'Bài giảng mới';
    const lesson: Lesson = {
      id: uid('l'), title: t, subject, grade, ownerId: user.id, status: 'draft', updatedAt: new Date().toISOString(),
      mascot: SUBJECTS[subject].mascot,
      slides: [{ id: uid('s'), layout: 'title', title: t, text: 'Cùng học nào!', mascot: SUBJECTS[subject].mascot }],
    };
    save.mutate(lesson, { onSuccess: (l) => { onClose(); nav(`/bai-giang/${l.id}`); } });
  };
  return (
    <Dialog open={open} onClose={onClose} title="Tạo bài giảng" footer={<><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" onClick={create} disabled={save.isPending}>Tạo và mở trình soạn</Btn></>}>
      <form className="tc-stack" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <Field label="Tên bài"><input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="vd: Phép cộng có nhớ trong phạm vi 100" /></Field>
        <Field label="Môn học">
          <select className="tc-input" value={subject} onChange={(e) => setSubject(e.target.value as SubjectId)}>
            {SUBJECT_LIST.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="tc-field"><span className="tc-field__label">Lớp</span><Seg label="Lớp" value={grade} onChange={setGrade} options={[1, 2, 3, 4, 5].map((g) => ({ value: g as Grade, label: `Lớp ${g}` }))} /></div>
        <ErrorNote error={save.error} />
      </form>
    </Dialog>
  );
}

export function Lessons({ user }: { user: Profile }) {
  const [params, setParams] = useSearchParams();
  const [subject, setSubject] = useState<SubjectId | ''>('');
  const [grade, setGrade] = useState<Grade | 0>(0);
  const [status, setStatus] = useState<'' | 'draft' | 'published'>('');
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(user.role !== 'admin');
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (params.get('tao')) { setCreating(true); setParams({}, { replace: true }); } }, [params, setParams]);
  const q = useLessons({ ...(subject ? { subject } : {}), ...(grade ? { grade } : {}), ...(status ? { status } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(mine ? { ownerId: user.id } : {}) });

  return (
    <div className="tc-page">
      <PageHead title="Bài giảng" sub="Bài giảng tương tác dùng để trình chiếu trên lớp và giao cho HS tự học." actions={<Btn kind="primary" icon="plus" onClick={() => setCreating(true)}>Tạo bài giảng</Btn>} />
      <div className="tc-filters tc-card tc-card--flat">
        <input className="tc-input tc-filters__search" placeholder="Tìm bài giảng…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="tc-input" value={subject} onChange={(e) => setSubject(e.target.value as SubjectId | '')} aria-label="Môn">
          <option value="">Mọi môn</option>
          {SUBJECT_LIST.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="tc-input" value={grade} onChange={(e) => setGrade(Number(e.target.value) as Grade | 0)} aria-label="Lớp">
          <option value={0}>Mọi lớp</option>
          {[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>Lớp {g}</option>)}
        </select>
        <Seg label="Trạng thái" value={status} onChange={setStatus} options={[{ value: '', label: 'Tất cả' }, { value: 'draft', label: 'Nháp' }, { value: 'published', label: 'Đã xuất bản' }]} />
        <label className="tc-switch"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Chỉ bài của tôi</label>
      </div>
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty title="Không có bài giảng phù hợp">Đổi bộ lọc hoặc tạo bài mới.</Empty> : (
        <div className="tc-lessongrid">
          {q.data.map((l) => {
            const s = SUBJECTS[l.subject] ?? SUBJECTS.khac;
            return (
              <div key={l.id} className="br-cardwrap">
              <Link to={`/bai-giang/${l.id}`} className="tc-lessoncard">
                <span className="tc-lessoncard__strip" style={{ background: `var(${s.colorVar})` }} />
                <span className="tc-lessoncard__art"><Mascot id={l.mascot ?? s.mascot} size={64} /></span>
                <span className="tc-lessoncard__body">
                  <span className="tc-lessoncard__meta"><span style={{ color: `var(${s.colorVar})` }}>{s.name}</span> · Lớp {l.grade}</span>
                  <strong className="tc-lessoncard__title">{l.title}</strong>
                  <span className="tc-row tc-small">
                    <span className={`tc-chip ${l.status === 'published' ? 'tc-chip--ok' : ''}`}>{l.status === 'published' ? 'Đã xuất bản' : 'Nháp'}</span>
                    <span className="tc-muted">{l.slides.length} slide{l.minutes ? ` · ${l.minutes} phút` : ''}</span>
                  </span>
                  <span className="tc-muted tc-small">Sửa {relTime(l.updatedAt)}</span>
                </span>
              </Link>
              {l.status === 'published' ? <span className="br-cardwrap__share"><ShareClassroomButton kind="lesson" id={l.id} title={l.title} compact /></span> : null}
              </div>
            );
          })}
        </div>
      )}
      <CreateLessonDialog open={creating} onClose={() => setCreating(false)} user={user} />
    </div>
  );
}
