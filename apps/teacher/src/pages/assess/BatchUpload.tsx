import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { SUBMISSION_STATUS_LABEL, type SubmissionStatus } from '@openedu/contracts';
import { Icon } from '@openedu/ui';
import { demoAiEnabled, useClass, useDataSource, useRequestAiGrade, useSubmissions, useSubmitWork, useWorkTask } from '@openedu/data';
import { Avatar, Btn, Empty, ErrorNote, Loading, PageHead, Seg } from '../../components/common';
import { StatusChip, useRoster } from '../../lib/assess';
import { cx } from '../../lib/format';

interface Page { id: string; file: File; url: string; studentId: string }
type Step = 'wait' | 'upload' | 'grade' | 'done' | 'error';
interface Job { studentId: string; step: Step; status?: SubmissionStatus; submissionId?: string; error?: string }
const MAX_PAGES = 6;
let seq = 0;

export default function BatchUpload() {
  const { taskId = '' } = useParams();
  const nav = useNavigate();
  const ds = useDataSource();
  const task = useWorkTask(taskId);
  const cls = useClass(task.data?.classId);
  const { roster, isLoading: rosterLoading } = useRoster(cls.data ?? undefined);
  const existing = useSubmissions({ taskId });
  const submit = useSubmitWork();
  const grade = useRequestAiGrade();
  const [pages, setPages] = useState<Page[]>([]);
  const [perStudent, setPerStudent] = useState(1);
  const [skipDone, setSkipDone] = useState(true);
  const [drag, setDrag] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const students = useMemo(() => {
    const ids = task.data?.studentIds ?? [];
    return ids.length ? roster.filter((s) => ids.includes(s.id)) : roster;
  }, [roster, task.data]);
  const submitted = useMemo(() => new Map((existing.data ?? []).map((s) => [s.studentId, s.status])), [existing.data]);
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? '—';

  /** Gợi ý: theo thứ tự danh sách lớp, bỏ qua em đã nộp, mỗi em `perStudent` trang. */
  const addFiles = (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setPages((prev) => {
      const queue = students.filter((s) => !(skipDone && submitted.has(s.id))).map((s) => s.id);
      const out = [...prev];
      for (const f of list) {
        const last = out[out.length - 1];
        const lastCount = last ? out.filter((p) => p.studentId === last.studentId).length : 0;
        let sid = '';
        if (last && last.studentId && lastCount < perStudent) sid = last.studentId;
        else {
          const used = new Set(out.map((p) => p.studentId));
          const from = last?.studentId ? queue.indexOf(last.studentId) + 1 : 0;
          sid = queue.slice(Math.max(0, from)).find((id) => !used.has(id)) ?? '';
        }
        const url = URL.createObjectURL(f);
        urls.current.push(url);
        out.push({ id: `p${seq++}`, file: f, url, studentId: sid });
      }
      return out;
    });
  };
  const setStudent = (id: string, studentId: string) => setPages((ps) => ps.map((p) => (p.id === id ? { ...p, studentId } : p)));
  const move = (i: number, d: -1 | 1) => setPages((ps) => { const a = [...ps]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });

  const groups = useMemo(() => {
    const m = new Map<string, Page[]>();
    for (const p of pages) if (p.studentId) m.set(p.studentId, [...(m.get(p.studentId) ?? []), p]);
    return m;
  }, [pages]);
  const unassigned = pages.filter((p) => !p.studentId).length;
  const tooMany = Array.from(groups.entries()).filter(([, ps]) => ps.length > MAX_PAGES).map(([id]) => nameOf(id));
  const running = !!jobs && jobs.some((j) => j.step === 'wait' || j.step === 'upload' || j.step === 'grade');

  const run = async () => {
    const entries = Array.from(groups.entries());
    const init: Job[] = entries.map(([studentId]) => ({ studentId, step: 'wait' }));
    setJobs(init);
    const upd = (i: number, p: Partial<Job>) => setJobs((js) => (js ? js.map((j, k) => (k === i ? { ...j, ...p } : j)) : js));
    for (let i = 0; i < entries.length; i++) {
      const [studentId, ps] = entries[i];
      upd(i, { step: 'upload' });
      try {
        const sub = await submit.mutateAsync({ taskId, studentId, images: ps.map((p) => p.file), submittedBy: 'teacher' });
        upd(i, { step: 'grade', submissionId: sub.id });
        try {
          const g = await grade.mutateAsync(sub.id);
          upd(i, { step: 'done', status: g.status });
        } catch (e) {
          upd(i, { step: 'error', status: 'error', error: e instanceof Error ? e.message : String(e) });
        }
      } catch (e) {
        upd(i, { step: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  if (task.isLoading || rosterLoading) return <Loading />;
  if (!task.data) return <div className="tc-page"><ErrorNote error={task.error ?? new Error('Không tìm thấy bài viết.')} onRetry={() => void task.refetch()} /></div>;
  const t = task.data;
  const mock = ds.mode === 'demo' && !demoAiEnabled();

  if (jobs) {
    const done = jobs.filter((j) => j.step === 'done' || j.step === 'error').length;
    return (
      <div className="tc-page tc-page--narrow">
        <PageHead title="Đang nộp và chấm" sub={`${t.title} · ${done}/${jobs.length} em`} />
        <span className="tc-progress tc-progress--wide" role="progressbar" aria-valuemin={0} aria-valuemax={jobs.length} aria-valuenow={done}><i style={{ width: `${(done / jobs.length) * 100}%` }} /></span>
        <ul className="tc-card tc-card--flush tc-list tc-joblist" aria-live="polite">
          {jobs.map((j) => {
            const s = students.find((x) => x.id === j.studentId);
            return (
              <li key={j.studentId}>
                {s ? <Avatar mascot={s.avatarMascot} color={s.avatarColor} size={30} /> : null}
                <span className="tc-grow"><strong>{nameOf(j.studentId)}</strong> <span className="tc-small tc-muted">· {groups.get(j.studentId)?.length ?? 0} trang</span>{j.error ? <small className="tc-warn" style={{ display: 'block' }}>{j.error}</small> : null}</span>
                {j.step === 'wait' ? <span className="tc-chip">Chờ</span> : j.step === 'upload' ? <span className="tc-chip tc-chip--info"><span className="tc-spin tc-spin--sm" aria-hidden="true" /> Đang tải ảnh</span> : j.step === 'grade' ? <span className="tc-chip tc-chip--info"><span className="tc-spin tc-spin--sm" aria-hidden="true" /> Đang chấm</span> : j.status ? <StatusChip status={j.status} /> : <span className="tc-chip tc-chip--warn">Chưa nộp được</span>}
                {j.submissionId && (j.step === 'done' || j.step === 'error') ? <Link className="tc-btn tc-btn--sm" to={`/cham-bai/${j.submissionId}?lop=${t.classId}&bai=${t.id}`}>Xem</Link> : null}
              </li>
            );
          })}
        </ul>
        {!running ? (
          <div className="tc-row tc-wrap">
            <Btn kind="primary" onClick={() => nav(`/cham-bai?lop=${t.classId}&bai=${t.id}`)}>Đến hàng chờ duyệt</Btn>
            <Btn onClick={() => { setJobs(null); setPages([]); void existing.refetch(); }}>Chụp tiếp</Btn>
          </div>
        ) : <p className="tc-small tc-muted">Giữ trang này mở đến khi xong nhé.</p>}
      </div>
    );
  }

  return (
    <div className="tc-page">
      <PageHead title="Chụp bài làm trên giấy" sub={<>{t.title} · {students.length} em · {submitted.size} em đã có bài</>} actions={<Btn kind="ghost" icon="back" onClick={() => nav(`/bai-viet?lop=${t.classId}`)}>Quay lại</Btn>} />
      {mock ? <div className="tc-alert tc-alert--info"><span><b>Chế độ demo:</b> ảnh thầy/cô tải lên sẽ được “Chấm mẫu (demo)” và đánh dấu <i>chữ khó đọc</i> để thầy/cô chấm tay. Bật AI thật bằng khoá OpenRouter.</span></div> : null}

      <div className={cx('tc-bdrop', drag && 'is-over')} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
        <Icon name="image" size={34} />
        <strong>Kéo thả nhiều ảnh vào đây</strong>
        <span className="tc-muted tc-small">Ảnh được gán lần lượt theo danh sách lớp — thầy/cô đổi tên em ở từng ảnh nếu cần.</span>
        <div className="tc-row tc-wrap" style={{ justifyContent: 'center' }}>
          <Btn kind="primary" size="lg" icon="image" onClick={() => camRef.current?.click()}>Chụp bằng máy ảnh</Btn>
          <Btn size="lg" icon="upload" onClick={() => fileRef.current?.click()}>Chọn nhiều ảnh</Btn>
        </div>
        <input ref={camRef} className="tc-sr" type="file" accept="image/*" capture="environment" aria-label="Chụp ảnh bài làm" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={fileRef} className="tc-sr" type="file" accept="image/*" multiple aria-label="Chọn ảnh bài làm" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <div className="tc-row tc-wrap tc-small" style={{ justifyContent: 'center' }}>
          <span>Mỗi em</span>
          <Seg label="Số trang mỗi em" value={perStudent} onChange={setPerStudent} options={[1, 2, 3].map((n) => ({ value: n, label: `${n} trang` }))} />
          <label className="tc-switch"><input type="checkbox" checked={skipDone} onChange={(e) => setSkipDone(e.target.checked)} /> Bỏ qua em đã nộp</label>
        </div>
      </div>

      {!pages.length ? <Empty icon="image" title="Chưa có ảnh nào">Chụp lần lượt từng bài theo thứ tự danh sách lớp để gán tự động nhanh nhất.</Empty> : (
        <section className="tc-card">
          <header className="tc-card__head">
            <h2>{pages.length} ảnh · {groups.size} em</h2>
            <span className="tc-row tc-wrap">
              {unassigned ? <span className="tc-chip tc-chip--warn">{unassigned} ảnh chưa gán</span> : null}
              <Btn size="sm" kind="ghost" icon="trash" onClick={() => setPages([])}>Xóa hết</Btn>
            </span>
          </header>
          <ol className="tc-bthumbs">
            {pages.map((p, i) => {
              const nth = pages.slice(0, i + 1).filter((x) => x.studentId === p.studentId).length;
              const prev = pages[i - 1];
              return (
                <li key={p.id} className={cx('tc-bthumb', !p.studentId && 'is-unassigned')}>
                  <div className="tc-bthumb__img">
                    <img src={p.url} alt={`Ảnh ${i + 1}${p.studentId ? ` của ${nameOf(p.studentId)}` : ''}`} />
                    <span className="tc-bthumb__n">{i + 1}</span>
                    {p.studentId && (groups.get(p.studentId)?.length ?? 0) > 1 ? <span className="tc-bthumb__page">trang {nth}</span> : null}
                  </div>
                  <select className="tc-input tc-input--sm tc-w100" aria-label={`Học sinh của ảnh ${i + 1}`} value={p.studentId} onChange={(e) => setStudent(p.id, e.target.value)}>
                    <option value="">— Chọn học sinh —</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.name}{submitted.has(s.id) ? ` (đã nộp: ${SUBMISSION_STATUS_LABEL[submitted.get(s.id)!].toLowerCase()})` : ''}</option>)}
                  </select>
                  <div className="tc-row tc-bthumb__tools">
                    <Btn size="sm" kind="ghost" icon="back" aria-label="Chuyển sang trái" disabled={!i} onClick={() => move(i, -1)} />
                    <Btn size="sm" kind="ghost" icon="next" aria-label="Chuyển sang phải" disabled={i === pages.length - 1} onClick={() => move(i, 1)} />
                    {prev?.studentId && prev.studentId !== p.studentId ? <Btn size="sm" kind="ghost" onClick={() => setStudent(p.id, prev.studentId)} title={`Gán cho ${nameOf(prev.studentId)} (trang tiếp)`}>= ảnh trước</Btn> : null}
                    <span className="tc-ebar__spacer" />
                    <Btn size="sm" kind="danger" icon="trash" aria-label={`Bỏ ảnh ${i + 1}`} onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {pages.length ? (
        <div className="tc-stickybar">
          <span className="tc-small">{tooMany.length ? <span className="tc-warn">Tối đa {MAX_PAGES} trang mỗi em: {tooMany.join(', ')}</span> : unassigned ? <span className="tc-warn">Còn {unassigned} ảnh chưa gán — ảnh này sẽ bị bỏ qua.</span> : <>Sẵn sàng nộp {groups.size} bài.</>}</span>
          <Btn kind="primary" size="lg" icon="check" disabled={!groups.size || tooMany.length > 0} onClick={() => void run()}>Nộp &amp; chấm bằng AI</Btn>
        </div>
      ) : null}
    </div>
  );
}
