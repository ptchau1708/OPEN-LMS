import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { AnswerEvent, ContentPackage, MascotId } from '@openedu/contracts';
import { SUBJECTS } from '@openedu/contracts';
import {
  useEmbedOriginsSync,
  lessonItemIds, useCompleteLesson, useItemsByIds, useLesson, usePackages, usePassport, useProgress,
  useDataSource, useHint, useRecordEvent, useSaveProgress, useSubmitAnswer, useTodayTasks,
} from '@openedu/data';
import { useQueryClient } from '@tanstack/react-query';
import { SelfPacedPlayer, setEmbedOrigins } from '@openedu/lesson-player';
import { Button, Confetti, Icon, Mascot, StarCount, sfx } from '@openedu/ui';
import { ErrorState, LoadingScreen } from '../components/Common';
import { useUi } from '../lib/store';
import { errText, resolveSettings, useMe } from '../lib/util';
import '../styles/lesson.css';
import { useOfflineState } from '../offline/state';

interface Done { summary: { correct: number; total: number; stars: number }; bonus: number | null; failed?: boolean; pending?: boolean }

export default function LessonPage() {
  useEmbedOriginsSync(setEmbedOrigins);
  const { lessonId = '' } = useParams();
  // ?giao=<lần giao>: kết quả ghi theo lần giao (báo cáo bài giao); lượt mới thì làm lại từ đầu.
  const [sp] = useSearchParams();
  const assignmentId = sp.get('giao') ?? undefined;
  const ds = useDataSource();
  const qc = useQueryClient();
  const [gate, setGate] = useState<'wait' | 'ok' | { error: string }>(assignmentId && ds.startAssignment ? 'wait' : 'ok');
  useEffect(() => {
    if (!assignmentId || !ds.startAssignment) return;
    let live = true;
    ds.startAssignment(assignmentId)
      .then(() => qc.invalidateQueries({ queryKey: ['progress'] }))
      .then(() => { if (live) setGate('ok'); })
      .catch((e: unknown) => { if (live) setGate(/hết hạn/.test(errText(e, '')) ? { error: errText(e, '') } : 'ok'); });
    return () => { live = false; };
  }, [assignmentId, ds, qc]);
  const me = useMe();
  const nav = useNavigate();
  const settings = resolveSettings(me);
  const lessonQ = useLesson(lessonId);
  const lesson = lessonQ.data ?? null;
  const ids = useMemo(() => lessonItemIds(lesson), [lesson]);
  const itemsQ = useItemsByIds(ids);
  const needsPkg = !!lesson?.slides.some((s) => s.layout === 'package');
  const pkgQ = usePackages();
  const progressQ = useProgress(me.id, lessonId);
  const companion: MascotId = usePassport(me.id).data?.companion ?? me.avatarMascot;
  const save = useSaveProgress();
  const submit = useSubmitAnswer();
  const complete = useCompleteLesson();
  const record = useRecordEvent();
  const hint = useHint();
  const queueUnlocks = useUi((s) => s.queueUnlocks);
  const setHold = useUi((s) => s.setHoldUnlocks);
  const toast = useUi((s) => s.toast);
  const { online } = useOfflineState();
  const [done, setDone] = useState<Done | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  const started = useRef(false);

  // Giữ màn mở khóa linh vật tới khi học xong.
  useEffect(() => { setHold(!showEnd); return () => setHold(false); }, [showEnd, setHold]);

  useEffect(() => {
    if (!lesson || started.current) return;
    started.current = true;
    record.mutate({ userId: me.id, verb: 'started', objectType: 'lesson', objectId: lesson.id, lessonId: lesson.id, ...(assignmentId ? { assignmentId } : {}) });
  }, [lesson, me.id, record]);

  const packages = useMemo(() => {
    const m: Record<string, ContentPackage> = {};
    (pkgQ.data ?? []).forEach((p) => (m[p.id] = p));
    return m;
  }, [pkgQ.data]);

  if (typeof gate === 'object') return <ErrorState title="Bài đã hết hạn nộp" message={gate.error} extra={<Button size="lg" variant="secondary" onClick={() => nav('/')}>Về trang Hôm nay</Button>} />;
  if (gate === 'wait') return <LoadingScreen label="Đang mở bài học" mascot={companion} />;
  if (lessonQ.isError) return <ErrorState message="Chưa mở được bài học." onRetry={() => void lessonQ.refetch()} />;
  if (lessonQ.isPending || (ids.length > 0 && itemsQ.isPending) || progressQ.isPending || (needsPkg && pkgQ.isPending))
    return <LoadingScreen label="Đang mở bài học" mascot={companion} />;
  if (!lesson) return <ErrorState title="Không tìm thấy bài này" message="Có thể thầy cô đã cất bài đi rồi." extra={<Button size="lg" variant="secondary" onClick={() => nav('/')}>Về trang Hôm nay</Button>} />;
  if (itemsQ.isError) return <ErrorState message="Chưa tải được câu hỏi của bài." onRetry={() => void itemsQ.refetch()} />;

  const onAnswer = (e: AnswerEvent) => {
    submit.mutate(
      { userId: me.id, item: e.item, response: e.response, context: { lessonId: lesson.id, slideId: e.slide.id, source: 'lesson', ...(assignmentId ? { assignmentId } : {}) }, attempt: e.attempts },
      {
        onSuccess: (r) => {
          if (r.starsAwarded > 0) toast(`+${r.starsAwarded} sao đã vào túi của em!`, 'star', 2200);
          else if (r.pending && online) toast('Mạng chập chờn — mình đã lưu câu trả lời, sẽ chấm sau nhé.', 'ok');
          if (r.award?.newlyUnlocked.length) queueUnlocks(r.award.newlyUnlocked);
        },
        onError: () => toast('Chưa lưu được câu trả lời. Em kiểm tra mạng nhé!', 'try'),
      },
    );
  };

  const onComplete = (summary: Done['summary']) => {
    setDone({ summary, bonus: null });
    complete.mutate({ userId: me.id, lessonId: lesson.id }, {
      onSuccess: (r) => {
        setDone({ summary, bonus: r.starsAwarded, pending: r.pending });
        if (r.newlyUnlocked.length) queueUnlocks(r.newlyUnlocked);
      },
      onError: (e) => { setDone({ summary, bonus: 0, failed: true }); toast(errText(e, 'Chưa lưu được bài. Em thử lại sau nhé!'), 'try'); },
    });
  };

  if (showEnd && done) return <Completion lessonTitle={lesson.title} mascot={lesson.mascot ?? SUBJECTS[lesson.subject]?.mascot ?? companion} done={done} lessonId={lesson.id} subject={lesson.subject} />;

  return (
    <SelfPacedPlayer
      lesson={lesson}
      items={itemsQ.data ?? {}}
      packages={packages}
      progress={progressQ.data ?? null}
      settings={settings}
      onProgress={(p) =>
        save.mutate({
          userId: me.id, lessonId: lesson.id, slideIndex: p.slideIndex, completedSlides: p.completedSlideIds,
          answers: {}, starsEarned: progressQ.data?.starsEarned ?? 0, updatedAt: new Date().toISOString(),
        })
      }
      onAnswer={onAnswer}
      onComplete={onComplete}
      pendingFeedback={!online}
      onHint={(r) => hint.mutateAsync({ userId: me.id, item: r.item, response: r.response, attempt: r.attempt })}
      onExit={() => (done ? setShowEnd(true) : nav('/'))}
    />
  );
}

function Completion({ lessonTitle, mascot, done, lessonId, subject }: { lessonTitle: string; mascot: MascotId; done: Done; lessonId: string; subject: string }) {
  const me = useMe();
  const nav = useNavigate();
  const tasks = useTodayTasks(me.id).data ?? [];
  useEffect(() => { sfx.fanfare(); }, []);
  const next = tasks.find((t) => t.kind === 'lesson' && t.progress < 1 && t.targetId !== lessonId);
  const { correct, total } = done.summary;
  return (
    <div className="ln-complete">
      <Confetti show durationMs={3500} count={60} />
      <div className="ln-complete__card">
        <div className="ln-complete__hero"><Mascot id={mascot} mood="cheer" size={180} animate title="" /></div>
        <h1 className="ln-complete__title">Hoàn thành bài học!</h1>
        <p className="ln-complete__lesson">{lessonTitle}</p>
        <div className="ln-complete__stats">
          <div className="ln-complete__stat">
            <StarCount value={done.summary.stars + (done.bonus ?? 0)} size="lg" />
            <span>sao em nhận được</span>
          </div>
          {total > 0 && (
            <div className="ln-complete__stat">
              <strong className="ln-complete__big">{correct}/{total}</strong>
              <span>câu trả lời đúng</span>
            </div>
          )}
        </div>
        <p className="ln-complete__note">
          {done.bonus === null ? 'Đang cất sao vào túi…' : done.bonus > 0 ? `Thưởng hoàn thành bài: +${done.bonus} sao!` : done.pending ? 'Đã lưu bài trên máy. Có mạng, cô chấm và sao sẽ về túi em nhé!' : done.failed ? 'Mình sẽ lưu bài khi có mạng nhé.' : 'Học lại giúp em nhớ thật lâu. Giỏi lắm!'}
        </p>
        <div className="ln-complete__actions">
          <Button size="xl" block onClick={() => nav(next ? `/bai/${next.targetId}` : `/hoc?mon=${subject}`)} icon={<Icon name="next" size={28} />}>Học bài tiếp</Button>
          <Button size="lg" block variant="secondary" onClick={() => nav('/')} icon={<Icon name="home" size={24} />}>Về trang Hôm nay</Button>
        </div>
      </div>
    </div>
  );
}
