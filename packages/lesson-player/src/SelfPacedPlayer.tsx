import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, SelfPacedPlayerProps, Slide, VideoQuestion } from '@openedu/contracts';
import { SUBJECTS } from '@openedu/contracts';
import { ActivityView } from '@openedu/activity-engine';
import { Button, Icon, Mascot, ProgressDots, StarCount, unlockAudio } from '@openedu/ui';
import { ActivityRunner } from './ActivityRunner';
import type { ActivityOutcome } from './ActivityRunner';
import { SlideView } from './SlideView';
import { clamp, cx, isGradedType, lessonMascot, play, resolveSlideItem } from './util';
import './base.css';
import './player.css';

interface AnswerRecord {
  graded: boolean;
  correct: boolean;
  score: number;
}

interface OpenQuestion {
  slideId: string;
  q: VideoQuestion;
  item: Item;
  resume?: () => void;
  /** Mở bằng nút "Tiếp" (video chưa tới câu hỏi): trả lời xong thì hỏi câu kế / sang slide sau. */
  advanceAfter?: boolean;
}

const qKey = (slideId: string, itemId: string) => `${slideId}:${itemId}`;

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}
function isButtonLike(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button';
}

/** Trình phát tự học toàn màn hình cho học sinh. */
export function SelfPacedPlayer({ lesson, items, packages, progress, settings, onProgress, onAnswer, onComplete, onExit, pendingFeedback, onHint }: SelfPacedPlayerProps) {
  const slides = lesson.slides;
  const last = slides.length - 1;
  const mascot = lessonMascot(lesson);
  const subject = SUBJECTS[lesson.subject] ?? SUBJECTS.khac;
  const bigText = settings?.bigText ?? lesson.grade <= 2;
  const sound = settings?.sound !== false;

  const [index, setIndex] = useState(() => clamp(progress?.slideIndex ?? 0, 0, Math.max(0, last)));
  const [maxVisited, setMaxVisited] = useState(index);
  const [completed, setCompleted] = useState<string[]>(() => (progress?.completedSlides ?? []).slice());
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>(() => {
    const out: Record<string, AnswerRecord> = {};
    const prev = progress?.answers ?? {};
    Object.keys(prev).forEach((k) => (out[k] = { graded: true, correct: prev[k].correct, score: prev[k].score }));
    return out;
  });
  const [awarded, setAwarded] = useState<string[]>(() => Object.keys(progress?.answers ?? {}).filter((k) => progress?.answers[k]?.correct));
  const [stars, setStars] = useState(progress?.starsEarned ?? 0);
  const [asked, setAsked] = useState<Record<string, string[]>>({});
  const [question, setQuestion] = useState<OpenQuestion | null>(null);
  const [finished, setFinished] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const completeSent = useRef(false);
  const runnerPrimary = useRef<(() => void) | null>(null);
  const overlayPrimary = useRef<(() => void) | null>(null);

  const slide: Slide | undefined = slides[index];
  const item = slide?.layout === 'activity' ? resolveSlideItem(slide, items) : undefined;

  /* ---------- tổng kết ---------- */
  const totals = useMemo(() => {
    let total = 0;
    slides.forEach((s) => {
      if (s.layout === 'activity') {
        const it = resolveSlideItem(s, items);
        if (it && isGradedType(it.type)) total++;
      }
      (s.video?.questions ?? []).forEach((q) => {
        const it = items[q.itemId];
        if (it && isGradedType(it.type)) total++;
      });
    });
    const correct = Object.keys(answers).filter((k) => answers[k].correct).length;
    return { correct, total: Math.max(total, correct), stars };
  }, [slides, items, answers, stars]);
  const totalsRef = useRef(totals);
  totalsRef.current = totals;

  const sendComplete = useCallback(() => {
    if (completeSent.current) return;
    completeSent.current = true;
    onComplete?.(totalsRef.current);
  }, [onComplete]);

  /* ---------- tiến độ ---------- */
  const markDone = useCallback((id: string) => {
    setCompleted((c) => (c.indexOf(id) >= 0 ? c : c.concat(id)));
  }, []);

  useEffect(() => {
    if (!slide) return;
    if (slide.layout !== 'activity') markDone(slide.id);
    if (slide.layout === 'summary') sendComplete();
  }, [slide, markDone, sendComplete]);

  const firstProgress = useRef(true);
  useEffect(() => {
    if (firstProgress.current) {
      firstProgress.current = false;
      return;
    }
    onProgress?.({ slideIndex: index, completedSlideIds: completed.slice() });
    // onProgress là callback của app; chỉ báo khi slide / danh sách hoàn thành đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, completed]);

  /* ---------- điều hướng ---------- */
  const go = useCallback(
    (i: number) => {
      const n = clamp(i, 0, Math.max(0, last));
      setIndex(n);
      setMaxVisited((m) => Math.max(m, n));
    },
    [last],
  );

  const unaskedQuestion = (s: Slide | undefined): OpenQuestion | null => {
    if (!s || s.layout !== 'fullscreen' || !s.video?.questions?.length) return null;
    const done = asked[s.id] ?? [];
    const qs = s.video.questions.slice().sort((a, b) => a.atSec - b.atSec);
    for (const q of qs) {
      if (done.indexOf(q.itemId) >= 0) continue;
      const it = items[q.itemId];
      if (it) return { slideId: s.id, q, item: it, advanceAfter: true };
    }
    return null;
  };

  const markAsked = (slideId: string, itemId: string) => setAsked((a) => ({ ...a, [slideId]: (a[slideId] ?? []).concat(itemId) }));

  const finish = useCallback(() => {
    sendComplete();
    if (slide?.layout === 'summary') onExit?.();
    else setFinished(true);
  }, [sendComplete, slide, onExit]);

  const next = () => {
    if (question || finished) return;
    const pending = unaskedQuestion(slide);
    if (pending) {
      markAsked(pending.slideId, pending.q.itemId);
      setQuestion(pending);
      return;
    }
    play('tap', sound);
    if (index < last) go(index + 1);
    else finish();
  };
  const prev = () => {
    if (question || finished || index <= 0) return;
    go(index - 1);
  };

  /* ---------- trả lời ---------- */
  const resolve = (key: string, o: ActivityOutcome) => {
    setAnswers((a) => {
      const old = a[key];
      return { ...a, [key]: { graded: o.graded, correct: o.correct || !!old?.correct, score: Math.max(o.score, old?.score ?? 0) } };
    });
    if (o.stars > 0) {
      setStars((s) => s + o.stars);
      setAwarded((w) => (w.indexOf(key) >= 0 ? w : w.concat(key)));
    }
  };

  const onVideoQuestion = (q: VideoQuestion, resume: () => void) => {
    if (!slide) return;
    markAsked(slide.id, q.itemId);
    const it = items[q.itemId];
    if (!it) {
      resume();
      return;
    }
    setQuestion({ slideId: slide.id, q, item: it, resume });
  };

  const closeQuestion = () => {
    const q = question;
    setQuestion(null);
    if (!q) return;
    if (q.resume) q.resume();
    else if (q.advanceAfter) {
      // hỏi tiếp câu chưa hỏi (nếu còn), xong thì sang slide sau
      const s = slides.find((x) => x.id === q.slideId);
      const done = (asked[q.slideId] ?? []).concat(q.q.itemId);
      const more = (s?.video?.questions ?? [])
        .slice()
        .sort((a, b) => a.atSec - b.atSec)
        .find((x) => done.indexOf(x.itemId) < 0 && items[x.itemId]);
      if (more && s) {
        markAsked(s.id, more.itemId);
        setQuestion({ slideId: s.id, q: more, item: items[more.itemId], advanceAfter: true });
      } else if (index < last) go(index + 1);
      else finish();
    }
  };

  const onPackageResult = (r: { score?: number; completed?: boolean }) => {
    if (!slide || !r.completed) return;
    markDone(slide.id);
    if (awarded.indexOf(slide.id) < 0) {
      setAwarded((w) => w.concat(slide.id));
      setStars((s) => s + 1);
      play('star', sound);
      setToast('Hoàn thành bài chơi! +1 sao');
    }
  };
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  /* ---------- bàn phím ---------- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const typing = isTypingTarget(e.target);
    if (e.key === 'Enter') {
      if (isButtonLike(e.target)) return; // nút đang được chọn tự xử lý Enter
      if (question) overlayPrimary.current?.();
      else if (finished) onExit?.();
      else if (slide?.layout === 'activity' && item && runnerPrimary.current) runnerPrimary.current();
      else if (!typing) next();
      else return;
      e.preventDefault();
      return;
    }
    if (typing || question || finished) return;
    if (e.key === 'ArrowRight') {
      if (slide?.layout === 'activity' && item && completed.indexOf(slide.id) < 0) return;
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const regRunner = useCallback((fn: (() => void) | null) => {
    runnerPrimary.current = fn;
  }, []);
  const regOverlay = useCallback((fn: (() => void) | null) => {
    overlayPrimary.current = fn;
  }, []);

  const unlocked = useRef(false);
  const unlockOnce = () => {
    if (unlocked.current) return;
    unlocked.current = true;
    unlockAudio();
  };

  /* ---------- giao diện ---------- */
  const rootClass = cx('lp-player', bigText && 'k-big', settings?.reducedMotion && 'k-reduced');
  const done = slides.map((s) => completed.indexOf(s.id) >= 0);

  const topBar = (
    <header className="lp-top">
      <button type="button" className="lp-top__close" onClick={() => onExit?.()} aria-label="Thoát bài học">
        <Icon name="close" size={28} />
      </button>
      <div className="lp-top__dots">
        <ProgressDots total={Math.max(1, slides.length)} current={finished ? last : index} done={done} color={`var(${subject.colorVar})`} onSelect={(i) => !question && !finished && i <= maxVisited && go(i)} />
      </div>
      <div className="lp-top__stars" aria-label={`Em có ${stars} sao trong bài này`}>
        <StarCount value={stars} size="md" />
      </div>
    </header>
  );

  if (!slide) {
    return (
      <div className={rootClass} onPointerDown={unlockOnce}>
        {topBar}
        <main className="lp-stage lp-empty">
          <Mascot id={mascot} mood="think" size={160} />
          <p>Bài học này chưa có trang nào. Em quay lại sau nhé!</p>
          <Button variant="primary" size="xl" onClick={() => onExit?.()}>
            Quay lại
          </Button>
        </main>
      </div>
    );
  }

  if (finished) {
    const end: Slide = { id: '__end', layout: 'summary', title: 'Em đã học xong bài!', text: lesson.title, mascot };
    return (
      <div className={rootClass} onPointerDown={unlockOnce}>
        {topBar}
        <main className="lp-stage">
          <SlideView slide={end} items={items} context="student" mascot={mascot} bigText={bigText} sound={sound} summary={totals} />
        </main>
        <div className="lp-bar">
          <div className="lp-bar__lead" />
          <div className="lp-bar__main">
            <Button variant="primary" size="xl" className="lp-cta" onClick={() => onExit?.()} icon={<Icon name="home" size={28} />}>
              Về trang chính
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const backBtn =
    index > 0 ? (
      <Button variant="ghost" size="lg" className="lp-back" onClick={prev} icon={<Icon name="back" size={26} />} aria-label="Quay lại trang trước">
        <span className="lp-back__label">Quay lại</span>
      </Button>
    ) : null;

  const isLast = index === last;
  const nextLabel = isLast ? (slide.layout === 'summary' ? 'Xong rồi!' : 'Hoàn thành') : 'Tiếp';
  const slideCommon = {
    items,
    packages,
    context: 'student' as const,
    mascot,
    bigText,
    sound,
    autoRead: settings?.autoRead,
  };

  return (
    <div className={rootClass} onPointerDown={unlockOnce} style={{ ['--lp-accent' as string]: `var(${subject.colorVar})` }}>
      {topBar}
      {slide.layout === 'activity' && item ? (
        <ActivityRunner
          key={slide.id}
          slide={slide}
          item={item}
          mascot={mascot}
          sound={sound}
          pendingFeedback={pendingFeedback}
          getHint={onHint}
          alreadyAwarded={awarded.indexOf(slide.id) >= 0}
          allowSkip={completed.indexOf(slide.id) >= 0}
          onAnswer={onAnswer}
          onResolved={(o) => {
            resolve(slide.id, o);
            markDone(slide.id);
          }}
          onContinue={() => {
            markDone(slide.id);
            if (index < last) go(index + 1);
            else finish();
          }}
          registerPrimary={regRunner}
          leading={backBtn}
          continueLabel={isLast ? 'Hoàn thành' : 'Tiếp tục'}
        >
          {(activity) => (
            <main className="lp-stage">
              <SlideView slide={slide} {...slideCommon} activity={activity} />
            </main>
          )}
        </ActivityRunner>
      ) : (
        <>
          <main className="lp-stage" key={slide.id}>
            <SlideView
              slide={slide}
              {...slideCommon}
              summary={slide.layout === 'summary' ? totals : undefined}
              onVideoQuestion={onVideoQuestion}
              askedVideoQuestions={asked[slide.id]}
              onPackageResult={onPackageResult}
            />
          </main>
          <div className="lp-bar">
            <div className="lp-bar__lead">{backBtn}</div>
            <div className="lp-bar__main">
              <Button variant="primary" size="xl" className="lp-cta" onClick={next} icon={<Icon name={isLast ? 'check' : 'next'} size={28} />}>
                {nextLabel}
              </Button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="lp-toast" role="status">
          <Icon name="star" size={24} /> {toast}
        </div>
      )}

      {question && (
        <div className="lp-overlay" role="dialog" aria-modal="true" aria-label="Câu hỏi trong video">
          <div className="lp-overlay__card">
            <div className="lp-overlay__tag">
              <Icon name="video" size={22} /> Câu hỏi trong video
            </div>
            <ActivityRunner
              key={qKey(question.slideId, question.q.itemId)}
              slide={slides.find((s) => s.id === question.slideId) ?? slide}
              item={question.item}
              mascot={mascot}
              sound={sound}
              pendingFeedback={pendingFeedback}
              getHint={onHint}
              alreadyAwarded={awarded.indexOf(qKey(question.slideId, question.q.itemId)) >= 0}
              onAnswer={onAnswer}
              onResolved={(o) => resolve(qKey(question.slideId, question.q.itemId), o)}
              onContinue={closeQuestion}
              registerPrimary={regOverlay}
              continueLabel={question.resume ? 'Xem tiếp video' : 'Tiếp tục'}
            >
              {(a) => (
                <div className="lp-overlay__body">
                  <ActivityView item={question.item} value={a.value} onChange={a.onChange ?? (() => undefined)} disabled={a.disabled} reveal={a.reveal} result={a.result} bigText={bigText} />
                </div>
              )}
            </ActivityRunner>
          </div>
        </div>
      )}
    </div>
  );
}
