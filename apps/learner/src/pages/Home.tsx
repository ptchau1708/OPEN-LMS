import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import type { RemediationSet, Task } from '@openedu/contracts';
import { MAX_REMEDIATION_TASKS, remediationTask, useClass, useClassPages, useLtiTools, usePassport, useRemediationSets, useTodayTasks, useWallet } from '@openedu/data';
import { Button, Card, Confetti, Icon, Mascot, MascotBubble, ProgressBar, SpeakButton, StarCount, sfx } from '@openedu/ui';
import type { IconName } from '@openedu/ui';
import { AppTabs, Avatar, EmptyState, ErrorState } from '../components/Common';
import { dueLabel, partOfDay, subjectColor, useMe } from '../lib/util';
import { isReviewTask, remPath, remStage } from '../lib/remediation';
import { useWorkItems, WorkTaskCard } from '../components/WorkCards';

const DownloadAssigned = lazy(() => import('../offline/DownloadButtons').then((m) => ({ default: m.DownloadAssignedButton })));
import { workPath } from '../lib/work';
/** Phase 6: thẻ bài kiểm tra (tải lười). */
const ExamCards = lazy(() => import('./exam/ExamCards'));

const KIND_ICON: Record<Task['kind'], IconName> = { lesson: 'book', practice: 'pencil', arena: 'tower', package: 'puzzle' };

export function openTask(t: Task, nav: (p: string) => void) {
  sfx.tap();
  if (t.kind === 'lesson') nav(`/bai/${t.targetId}`);
  else if (t.kind === 'package') nav(`/goi/${t.targetId}`);
  else if (isReviewTask(t)) nav(remPath(t.targetId));
  else nav('/choi/thap');
}

export default function Home() {
  const me = useMe();
  const nav = useNavigate();
  const tasksQ = useTodayTasks(me.id);
  const wallet = useWallet(me.id).data;
  const companion = usePassport(me.id).data?.companion ?? me.avatarMascot;
  const cls = useClass(me.classId).data;

  const remQ = useRemediationSets(me.id);
  const tasks = withDueReviews(tasksQ.data ?? [], remQ.data);
  const work = tasks.filter((t) => t.kind !== 'arena');
  const left = work.filter((t) => t.progress < 1).length;
  const allDone = work.length > 0 && left === 0;
  const streak = wallet?.streakDays ?? 0;
  const workQ = useWorkItems(me.id);
  const writing = workQ.items;
  const writeLeft = writing.filter((x) => x.state === 'todo' || x.state === 'redo').length;
  const ltiCount = (useLtiTools().data?.length ?? 0) + (useClassPages(me.classId).data?.length ?? 0);

  let line = `${partOfDay()}, ${me.name}! `;
  if (tasksQ.isPending) line += 'Mình đang xem hôm nay có gì nhé…';
  else if (!work.length) line += 'Hôm nay chưa có bài mới. Mình đi phiêu lưu trên bản đồ nhé!';
  else if (allDone) line += 'Em làm xong hết nhiệm vụ rồi. Giỏi quá đi!';
  else if (left === work.length) line += `Hôm nay có ${left} nhiệm vụ đang chờ em. Mình bắt đầu nhé!`;
  else line += `Còn ${left} nhiệm vụ nữa thôi. Cố lên em ơi!`;
  if (writeLeft && !tasksQ.isPending) line += ` Em còn ${writeLeft} bài viết nữa nhé.`;
  if (streak >= 2 && !allDone) line += ` Em đã học ${streak} ngày liền rồi đó!`;

  return (
    <div className="ln-page ln-home">
      <header className="ln-hello">
        <Avatar mascot={companion} color={me.avatarColor} size={64} />
        <div className="ln-hello__text">
          <h1 className="ln-hello__name">Chào {me.name}!</h1>
          <span className="ln-hello__class">{cls ? `Lớp ${cls.name}` : me.grade ? `Lớp ${me.grade}` : 'Học sinh'}</span>
        </div>
        <div className="ln-hello__stats">
          <StarCount value={wallet?.stars ?? 0} size="md" />
          <span className={`ln-streak${streak ? '' : ' is-off'}`} title="Số ngày học liên tiếp">
            <Icon name="flame" size={22} /> {streak} ngày
          </span>
        </div>
      </header>

      <div className="ln-home__grid">
        <section className="ln-home__bubble">
          <MascotBubble mascot={companion} mood={allDone ? 'cheer' : 'wave'} size={96}>
            <span className="ln-bubble-line">{line}</span>
            <SpeakButton text={line} size="sm" label="Nghe Nghé đọc" className="ln-bubble-speak" />
          </MascotBubble>
        </section>

        <section className="ln-home__tasks" aria-labelledby="ln-tasks-h">
          <h2 id="ln-tasks-h" className="ln-h2 ln-section-h">
            Nhiệm vụ hôm nay
            {work.length > 0 && <span className="ln-count">{work.length - left}/{work.length}</span>}
          </h2>
          {tasksQ.data && <Suspense fallback={null}><DownloadAssigned tasks={tasksQ.data} /></Suspense>}
          {tasksQ.isError ? (
            <ErrorState message="Chưa tải được nhiệm vụ." onRetry={() => void tasksQ.refetch()} mascot={companion} />
          ) : tasksQ.isPending ? (
            <div className="ln-skeleton-list"><i /><i /><i /></div>
          ) : (
            <>
              {allDone && <DoneCard mascot={companion} onArena={() => nav('/choi/thap')} />}
              {!work.length && (
                <EmptyState title="Chưa có bài được giao" text="Em mở Bản đồ phiêu lưu để học thêm nhé!" mascot={companion}
                  action={<Button onClick={() => nav('/hoc')} icon={<Icon name="map" size={24} />}>Mở bản đồ</Button>} />
              )}
              <div className="ln-tasks">{tasks.map((t) => isReviewTask(t) ? <ReviewCard key={t.id} t={t} onOpen={() => openTask(t, nav)} /> : <TaskCard key={t.id} t={t} onOpen={() => openTask(t, nav)} />)}</div>
            </>
          )}
          <Suspense fallback={null}><ExamCards /></Suspense>
          {writing.length > 0 && (
            <>
              <h2 className="ln-h2 ln-section-h ln-work-h">Bài viết{writeLeft > 0 && <span className="ln-count">{writeLeft} bài cần làm</span>}</h2>
              <div className="ln-tasks">{writing.map((x) => <WorkTaskCard key={x.task.id} item={x} onOpen={() => { sfx.tap(); nav(workPath(x.task.id)); }} />)}</div>
            </>
          )}
        </section>

        <section className="ln-home__live">
          <Button size="xl" block className="ln-live-btn" onClick={() => nav('/lop')} icon={<Icon name="tv" size={32} />}>Vào lớp trực tiếp</Button>
          <p className="ln-live-hint">Khi cô mở bài trên TV, em bấm vào đây và nhập mã nhé.</p>
          {me.classId && <Button size="lg" block variant="secondary" className="ln-garden-btn" onClick={() => { sfx.tap(); nav('/vuon-lop'); }} icon={<Icon name="star" size={26} />}>Vườn lớp em</Button>}
          {ltiCount > 0 && <Button size="lg" block variant="secondary" className="ln-garden-btn" onClick={() => { sfx.tap(); nav('/ung-dung'); }} icon={<Icon name="puzzle" size={26} />} data-testid="home-lti">Ứng dụng học</Button>}
        </section>
      </div>
      <AppTabs active="home" />
    </div>
  );
}

/**
 * Bảo đảm bộ ôn đến hạn có trên Hôm nay. getTodayTasks (demo) đọc đồng hồ trước khi lập bộ ôn nên bộ "đến hạn ngay"
 * có thể lệch vài ms và bị lọc mất; ghép thêm từ getRemediationSets (khử trùng theo id, dung sai 1 phút).
 */
function withDueReviews(tasks: Task[], sets: RemediationSet[] | undefined): Task[] {
  if (!sets?.length) return tasks;
  const have = tasks.filter(isReviewTask).map((t) => t.targetId);
  const lim = Date.now() + 60000;
  const add = sets.filter((s) => have.indexOf(s.id) < 0 && new Date(s.dueAt).getTime() <= lim).slice(0, Math.max(0, MAX_REMEDIATION_TASKS - have.length)).map(remediationTask);
  if (!add.length) return tasks;
  const out = tasks.slice();
  const firstDone = out.findIndex((t) => t.progress >= 1 || t.kind === 'arena');
  out.splice(firstDone < 0 ? out.length : firstDone, 0, ...add);
  return out;
}

function TaskCard({ t, onOpen }: { t: Task; onOpen: () => void }) {
  const done = t.progress >= 1 && t.kind !== 'arena';
  const color = t.kind === 'arena' ? 'var(--k-viet)' : subjectColor(t.subject);
  const due = t.dueAt && !done ? dueLabel(t.dueAt) : null;
  return (
    <Card interactive onClick={onOpen} className={`ln-task${done ? ' is-done' : ''}`} style={{ ['--subj' as string]: color } as CSSProperties} aria-label={`${t.title}. ${t.subtitle}`}>
      <span className="ln-task__tile" aria-hidden="true"><Icon name={KIND_ICON[t.kind]} size={34} strokeWidth={2.4} /></span>
      <span className="ln-task__body">
        <span className="ln-task__title">{t.title}</span>
        <span className="ln-task__sub">{t.subtitle}</span>
        <span className="ln-task__meta">
          <ProgressBar value={t.progress} color={done ? 'var(--k-ok)' : color} label={`Đã làm ${Math.round(t.progress * 100)}%`} className="ln-task__bar" />
          {due && <span className={`ln-due${due.late ? ' is-late' : ''}`}><Icon name="clock" size={16} /> {due.text}</span>}
        </span>
      </span>
      <span className="ln-task__go" aria-hidden="true"><Icon name={done ? 'check' : 'play'} size={28} strokeWidth={2.6} /></span>
      {t.isNew && <span className="ln-sticker">Mới</span>}
    </Card>
  );
}

/** Nhiệm vụ "Ôn lại cho chắc": thẻ riêng có băng dán + lấp lánh. */
function ReviewCard({ t, onOpen }: { t: Task; onOpen: () => void }) {
  const stage = remStage(t.targetId);
  const name = t.title.replace(/^Ôn lại:\s*/, '');
  return (
    <Card interactive onClick={onOpen} className="ln-task ln-rtask" aria-label={`Ôn lại cho chắc: ${name}. ${t.subtitle}`}>
      <span className="ln-rtask__tile" aria-hidden="true"><BandAid /></span>
      <span className="ln-task__body">
        <span className="ln-rtask__kicker"><Icon name="star" size={16} /> Ôn lại cho chắc</span>
        <span className="ln-task__title">{name}</span>
        <span className="ln-task__sub"><Icon name="clock" size={16} /> {t.subtitle}</span>
      </span>
      <span className="ln-task__go ln-rtask__go" aria-hidden="true"><Icon name="play" size={28} strokeWidth={2.6} /></span>
      <span className="ln-sticker ln-rtask__badge">{stage > 0 ? `Ôn lại lần ${stage}/3` : 'Mới'}</span>
    </Card>
  );
}

export function BandAid({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="ln-bandaid">
      <g transform="rotate(-30 32 32)">
        <rect x="6" y="22" width="52" height="20" rx="10" fill="#ffd3a8" stroke="#e8a571" strokeWidth="2" />
        <rect x="23" y="22" width="18" height="20" fill="#ffb98a" />
        <circle cx="28" cy="28" r="1.5" fill="#e8a571" /><circle cx="36" cy="28" r="1.5" fill="#e8a571" />
        <circle cx="28" cy="36" r="1.5" fill="#e8a571" /><circle cx="36" cy="36" r="1.5" fill="#e8a571" />
      </g>
      <path className="ln-spark" d="M52 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ffc22e" />
      <path className="ln-spark ln-spark--2" d="M10 46l1.4 3.4 3.4 1.4-3.4 1.4L10 55.6l-1.4-3.4L5.2 50.8l3.4-1.4z" fill="#ffffff" />
    </svg>
  );
}

function DoneCard({ mascot, onArena }: { mascot: Parameters<typeof Mascot>[0]['id']; onArena: () => void }) {
  const [boom, setBoom] = useState(false);
  useEffect(() => {
    const k = `ln-done-${new Date().toDateString()}`;
    try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); setBoom(true); sfx.fanfare(); } } catch { /* bỏ qua */ }
  }, []);
  return (
    <div className="ln-done-card">
      <Confetti show={boom} />
      <Mascot id={mascot} mood="cheer" size={96} animate title="" />
      <div className="ln-done-card__text">
        <strong>Xong hết nhiệm vụ rồi!</strong>
        <span>Em giỏi quá! Nghỉ ngơi một chút, hoặc leo tháp lấy thêm sao nhé.</span>
        <Button size="md" variant="subject" color="var(--k-viet)" onClick={onArena} icon={<Icon name="tower" size={22} />}>Leo tháp</Button>
      </div>
    </div>
  );
}
