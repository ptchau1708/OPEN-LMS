import { lazy, Suspense, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { SUBJECTS, type Lesson, type LessonProgress, type SubjectId } from '@openedu/contracts';
import { qk, useAssignments, useCourses, useDataSource, useLessons, usePassport, useWallet } from '@openedu/data';
import { Button, Icon, Mascot, ProgressBar, Sheet, StarCount, StarShape, SubjectBadge, sfx } from '@openedu/ui';
import { AppTabs, EmptyState, ErrorState, LoadingScreen } from '../components/Common';
import { subjectColor, useMe } from '../lib/util';

const DownloadLessonButton = lazy(() => import('../offline/DownloadButtons'));

type NodeState = 'done' | 'current' | 'next' | 'locked' | 'finish';
interface Station { key: string; lesson?: Lesson; state: NodeState; progress?: LessonProgress | null }

const W = 360;
const V = 150;
const TOP = 110;
const OFF = [0, 1, 0, -1];
const pt = (i: number) => ({ x: W / 2 + OFF[i % 4] * 96, y: TOP + i * V });

export default function Learn() {
  const me = useMe();
  const nav = useNavigate();
  const ds = useDataSource();
  const [params, setParams] = useSearchParams();
  const courses = useCourses(me.grade ? { grade: me.grade } : undefined);
  const lessons = useLessons({ status: 'published' });
  const assigns = useAssignments({ studentId: me.id });
  const companion = usePassport(me.id).data?.companion ?? me.avatarMascot;
  const stars = useWallet(me.id).data?.stars ?? 0;
  const [open, setOpen] = useState<Station | null>(null);

  /* bài theo môn: khóa học của lớp → bài được giao → bài cùng khối */
  const bySubject = useMemo(() => {
    const map: Partial<Record<SubjectId, string[]>> = {};
    const all = lessons.data ?? [];
    const byId: Record<string, Lesson> = {};
    all.forEach((l) => (byId[l.id] = l));
    const add = (s: SubjectId, id: string) => { const a = (map[s] = map[s] ?? []); if (a.indexOf(id) < 0) a.push(id); };
    (courses.data ?? []).forEach((c) => c.lessonIds.forEach((id) => byId[id] && add(c.subject, id)));
    (assigns.data ?? []).forEach((a) => { const l = byId[a.targetId]; if (a.targetType === 'lesson' && l) add(l.subject, l.id); });
    all.forEach((l) => { if (me.grade && l.grade === me.grade) add(l.subject, l.id); });
    return { map, byId };
  }, [courses.data, lessons.data, assigns.data, me.grade]);

  const subjects = Object.values(SUBJECTS).filter((s) => (bySubject.map[s.id] ?? []).length > 0);
  const want = params.get('mon') as SubjectId | null;
  const subject = subjects.find((s) => s.id === want) ?? subjects[0];
  const ids = subject ? bySubject.map[subject.id] ?? [] : [];

  const progressQs = useQueries({
    queries: ids.map((id) => ({ queryKey: qk.progress(me.id, id), queryFn: () => ds.getProgress(me.id, id) })),
  });

  if (lessons.isError || courses.isError) return <div className="ln-page"><ErrorState message="Chưa mở được bản đồ." onRetry={() => { void lessons.refetch(); void courses.refetch(); }} /><AppTabs active="learn" /></div>;
  if (lessons.isPending || courses.isPending) return <><LoadingScreen label="Đang mở bản đồ" mascot={companion} /><AppTabs active="learn" /></>;

  const stations: Station[] = [];
  let currentSet = false;
  ids.forEach((id, i) => {
    const p = progressQs[i]?.data ?? null;
    const done = !!p?.completedAt;
    let state: NodeState = done ? 'done' : 'next';
    if (!done && !currentSet) { state = 'current'; currentSet = true; }
    stations.push({ key: id, lesson: bySubject.byId[id], state, progress: p });
  });
  while (stations.length && stations.length < 4) stations.push({ key: `lock-${stations.length}`, state: 'locked' });
  if (stations.length) stations.push({ key: 'finish', state: 'finish' });

  const n = stations.length;
  const H = TOP + (n - 1) * V + 110;
  const pts = stations.map((_, i) => pt(i));
  let road = '';
  let doneRoad = '';
  const lastDone = stations.reduce((acc, s, i) => (s.state === 'done' ? i : acc), -1);
  pts.forEach((p, i) => {
    if (i === 0) { road = `M${p.x} ${p.y - 70} L${p.x} ${p.y}`; return; }
    const a = pts[i - 1];
    const seg = ` C${p.x} ${a.y} ${p.x} ${a.y} ${p.x} ${p.y}`;
    road += seg;
    if (i <= lastDone + 1 && lastDone >= 0) doneRoad += (doneRoad ? '' : `M${pts[0].x} ${pts[0].y}`) + seg;
  });
  const col = subject ? subjectColor(subject.id) : 'var(--k-nat)';

  const tap = (s: Station) => { sfx.tap(); setOpen(s); };

  return (
    <div className="ln-page ln-learn" style={{ ['--subj' as string]: col } as CSSProperties}>
      <header className="ln-learn__head">
        <div>
          <h1 className="ln-h1">Bản đồ phiêu lưu</h1>
          <p className="k-muted ln-learn__sub">{subject ? `Môn ${subject.name}` : 'Chọn môn em thích'}</p>
        </div>
        <StarCount value={stars} />
      </header>

      {subjects.length > 1 && (
        <nav className="ln-chips" aria-label="Chọn môn">
          {subjects.map((s) => (
            <button key={s.id} type="button" className={`ln-chip${s.id === subject?.id ? ' is-on' : ''}`} style={{ ['--chip' as string]: subjectColor(s.id) } as CSSProperties}
              aria-pressed={s.id === subject?.id} onClick={() => { sfx.tap(); setParams({ mon: s.id }, { replace: true }); }}>
              <Mascot id={s.mascot} size={34} title="" /> {s.name}
            </button>
          ))}
        </nav>
      )}

      {!subject ? (
        <EmptyState title="Bản đồ đang được vẽ" text="Thầy/cô sắp giao bài mới. Em quay lại sau nhé!" mascot={companion} />
      ) : (
        <div className="ln-map" style={{ paddingTop: `${(H / W) * 100}%` }}>
          <svg className="ln-map__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet" aria-hidden="true">
            <rect x="0" y="0" width={W} height={H} rx="28" className="ln-map__meadow" />
            {pts.map((p, i) => (i % 2 === 0 ? <path key={`h${i}`} className="ln-map__hill" d={`M0 ${p.y + 80} Q ${W / 2} ${p.y + 20} ${W} ${p.y + 90} L${W} ${p.y + 150} L0 ${p.y + 150}Z`} /> : null))}
            {pts.map((p, i) => <Decor key={`d${i}`} x={OFF[i % 4] >= 0 ? (OFF[i % 4] === 0 ? 36 : 44) : W - 44} y={p.y + (OFF[i % 4] === 0 ? 40 : -20)} kind={i % 3} />)}
            {pts.map((p, i) => (OFF[i % 4] === 0 ? <Decor key={`e${i}`} x={W - 34} y={p.y - 30} kind={(i + 1) % 3} /> : null))}
            <path d={road} className="ln-map__road-edge" />
            <path d={road} className="ln-map__road" />
            <path d={road} className="ln-map__road-dash" />
            {doneRoad && <path d={doneRoad} className="ln-map__road-done" />}
          </svg>
          <span className="ln-map__start" style={{ left: `${(pts[0].x / W) * 100}%`, top: `${((pts[0].y - 60) / H) * 100}%` }}>Xuất phát</span>
          {stations.map((s, i) => {
            const p = pts[i];
            const st = { left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` };
            const label = s.lesson?.title ?? (s.state === 'finish' ? 'Kho báu' : 'Sắp mở');
            return (
              <div key={s.key} className={`ln-node-wrap is-${s.state}`} style={st}>
                {s.state === 'current' && <span className="ln-node__mascot"><Mascot id={companion} mood="happy" size={74} animate title="" /></span>}
                <button type="button" className={`ln-node ln-node--${s.state}`} onClick={() => tap(s)} aria-label={`${label}${s.state === 'done' ? ' (đã xong)' : s.state === 'current' ? ' (học tiếp)' : ''}`}>
                  {s.state === 'done' && <StarShape size={44} className="ln-node__star" />}
                  {s.state === 'current' && <Icon name="play" size={36} strokeWidth={2.8} />}
                  {s.state === 'next' && <span className="ln-node__num">{i + 1}</span>}
                  {s.state === 'locked' && <Icon name="lock" size={28} />}
                  {s.state === 'finish' && <Icon name="trophy" size={34} />}
                </button>
                <span className="ln-node__label">{label}</span>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.lesson?.title ?? (open?.state === 'finish' ? 'Kho báu cuối đường' : 'Trạm sắp mở')}>
        {open && <StationSheet s={open} onGo={(id) => { setOpen(null); nav(`/bai/${id}`); }} />}
      </Sheet>
      <AppTabs active="learn" />
    </div>
  );
}

function StationSheet({ s, onGo }: { s: Station; onGo: (id: string) => void }) {
  const l = s.lesson;
  if (!l) {
    return (
      <div className="ln-station">
        <Mascot id={s.state === 'finish' ? 'shiba' : 'kiwi'} mood={s.state === 'finish' ? 'cheer' : 'think'} size={110} title="" />
        <p>{s.state === 'finish' ? 'Học hết các trạm trên đường, em sẽ tới kho báu đầy sao!' : 'Trạm này sắp có bài mới. Em học xong các trạm trước nhé!'}</p>
      </div>
    );
  }
  const p = s.progress;
  const ratio = p?.completedAt ? 1 : Math.min(1, (p?.completedSlides.length ?? 0) / Math.max(1, l.slides.length));
  const label = p?.completedAt ? 'Học lại' : ratio > 0 ? 'Học tiếp' : 'Học ngay';
  return (
    <div className="ln-station">
      <div className="ln-station__top">
        <Mascot id={l.mascot ?? SUBJECTS[l.subject].mascot} mood="wave" size={96} title="" />
        <div>
          <SubjectBadge subject={l.subject} size="sm" />
          {l.description && <p className="ln-station__desc">{l.description}</p>}
        </div>
      </div>
      <div className="ln-facts">
        {l.minutes ? <span className="ln-fact"><Icon name="clock" size={20} /> {l.minutes} phút</span> : null}
        <span className="ln-fact"><Icon name="book" size={20} /> {l.slides.length} trang</span>
        <span className="ln-fact ln-fact--star"><StarShape size={20} /> {p?.starsEarned ?? 0} sao</span>
      </div>
      {ratio > 0 && <ProgressBar value={ratio} label={`Đã học ${Math.round(ratio * 100)}%`} />}
      <Button size="xl" block onClick={() => onGo(l.id)} icon={<Icon name="play" size={30} />} className="ln-station__go">{label}</Button>
      <Suspense fallback={null}><DownloadLessonButton lessonId={l.id} /></Suspense>
    </div>
  );
}

function Decor({ x, y, kind }: { x: number; y: number; kind: number }) {
  if (kind === 0)
    return (
      <g transform={`translate(${x} ${y})`}>
        <rect x="-3" y="0" width="6" height="16" rx="2" fill="#a07a55" />
        <circle cx="0" cy="-6" r="15" fill="#5cc48a" />
        <circle cx="-6" cy="-10" r="5" fill="#8fdcae" />
      </g>
    );
  if (kind === 1)
    return (
      <g transform={`translate(${x} ${y})`}>
        <circle cx="-8" cy="0" r="9" fill="#7bd39d" />
        <circle cx="6" cy="-2" r="11" fill="#5cc48a" />
        <circle cx="2" cy="-12" r="3.5" fill="#ffd166" />
        <circle cx="-10" cy="-6" r="3" fill="#ff8fab" />
      </g>
    );
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="0" rx="18" ry="9" fill="#ffffff" opacity="0.9" />
      <ellipse cx="-8" cy="-5" rx="9" ry="8" fill="#ffffff" opacity="0.9" />
      <ellipse cx="7" cy="-6" rx="10" ry="9" fill="#ffffff" opacity="0.9" />
    </g>
  );
}
