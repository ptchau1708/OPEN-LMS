import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnyResponse, Item, Lesson, LiveResponse, LiveState, LiveStudentViewProps, ScoreResult } from '@openedu/contracts';
import { ActivityView, isComplete, scoreItem } from '@openedu/activity-engine';
import { Button, Confetti, Icon, Mascot, MascotBubble, StarBurst, StarCount, TimerRing, unlockAudio } from '@openedu/ui';
import { BigEyes, Dots } from './illustrations';
import { SlideView } from './SlideView';
import { canGradeLocally, cx, findItem, lessonMascot, play, safeSession, saveSession, timerTotalSeconds } from './util';
import './base.css';
import './live.css';

/** Mở rộng tùy chọn (ngoài hợp đồng): bài giảng khi state.lesson trống (chế độ Supabase). */
export interface LiveStudentViewExtraProps {
  lesson?: Lesson;
}

interface Sent {
  response: AnyResponse;
  correct?: boolean;
  score?: number;
}

type SendState = 'idle' | 'sending' | 'error';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/** Máy học sinh trong lớp học trực tiếp. Mọi thứ suy ra từ channel.getState() → vào lại sau rớt mạng vẫn đúng. */
export function LiveStudentView({ channel, items, me, settings, lesson: lessonProp }: LiveStudentViewProps & LiveStudentViewExtraProps) {
  const [state, setState] = useState<LiveState | null>(() => channel.getState());
  const sound = settings?.sound !== false;

  useEffect(() => {
    setState(channel.getState());
    const off = channel.subscribe((msg) => {
      if (msg.kind === 'state') setState(msg.state);
      else if (msg.kind === 'presence') setState((s) => (s ? { ...s, participants: msg.participants } : s));
    });
    const refresh = () => setState(channel.getState());
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      off();
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [channel]);

  /* ---------- câu đã gửi (nhớ qua tải lại trang) ---------- */
  const storeKey = `lp-live:${channel.sessionId}:${me.userId}`;
  const [sent, setSent] = useState<Record<string, Sent>>(() => safeSession<Record<string, Sent>>(storeKey) ?? {});
  useEffect(() => saveSession(storeKey, sent), [storeKey, sent]);

  const lesson = lessonProp ?? state?.lesson;
  const allItems = useMemo(() => ({ ...items, ...(state?.items ?? {}) }), [items, state?.items]);
  const slide = lesson?.slides[state?.slideIndex ?? 0];
  const item = state?.activeItemId ? findItem(state.activeItemId, allItems, lesson) ?? (slide?.item?.id === state.activeItemId ? slide.item : undefined) : undefined;
  const rKey = state && item ? `${state.slideIndex}:${item.id}` : '';

  // Dự phòng khi vào lại: hỏi kênh xem em đã gửi chưa.
  let mySent: Sent | undefined = rKey ? sent[rKey] : undefined;
  if (!mySent && state && item) {
    try {
      const list: LiveResponse[] = channel.responses(state.slideIndex);
      const mine = list.filter((r) => r.userId === me.userId && r.itemId === item.id);
      const r = mine[mine.length - 1];
      if (r) mySent = { response: r.response, correct: r.correct, score: r.score };
    } catch {
      /* kênh HS có thể không giữ danh sách câu trả lời */
    }
  }

  const [draft, setDraft] = useState<AnyResponse | undefined>(undefined);
  const [sendState, setSendState] = useState<SendState>('idle');
  useEffect(() => {
    setDraft(undefined);
    setSendState('idle');
  }, [rKey]);

  const timerOn = !!state?.timerEndsAt && state.phase === 'activity-open';
  const now = useNow(timerOn);
  const timeUp = timerOn && !!state?.timerEndsAt && now >= new Date(state.timerEndsAt).getTime();

  /* ---------- sao của em ---------- */
  const myStars = state?.studentStars?.[me.userId] ?? 0;
  const prevStars = useRef(myStars);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (myStars > prevStars.current) {
      setBurst(true);
      play('star', sound);
    }
    prevStars.current = myStars;
  }, [myStars, sound]);

  /* ---------- âm thanh khi công bố đáp án ---------- */
  const revealResult = useMemo((): ScoreResult | undefined => {
    if (!item || !mySent || !canGradeLocally(item)) return undefined;
    try {
      return scoreItem(item, mySent.response);
    } catch {
      return undefined;
    }
  }, [item, mySent]);
  const myCorrect: boolean | undefined = mySent ? mySent.correct ?? (revealResult?.graded ? revealResult.correct : undefined) : undefined;
  const revealKey = state?.phase === 'reveal' ? rKey : '';
  useEffect(() => {
    if (!revealKey) return;
    if (myCorrect === true) play('correct', sound);
    else if (myCorrect === false) play('tryAgain', sound);
    // chỉ phát một lần mỗi lần công bố
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  const me2 = state?.participants.find((p) => p.userId === me.userId);
  const myMascot = me2?.mascot ?? lessonMascot(lesson);
  const team = me2?.teamId ? state?.teams.find((t) => t.id === me2.teamId) : undefined;
  const bigText = settings?.bigText ?? (lesson ? lesson.grade <= 2 : false);

  async function send() {
    if (!state || !item || draft === undefined || sendState === 'sending') return;
    setSendState('sending');
    play('tap', sound);
    try {
      const res = await channel.respond({ sessionId: state.sessionId || channel.sessionId, userId: me.userId, itemId: item.id, slideIndex: state.slideIndex, response: draft });
      setSent((s) => ({ ...s, [rKey]: { response: draft, correct: res?.correct, score: res?.score } }));
      setSendState('idle');
      play('drop', sound);
    } catch {
      setSendState('error');
    }
  }

  const root = cx('lp-live', bigText && 'k-big', settings?.reducedMotion && 'k-reduced');

  /* ---------- kết nối ---------- */
  if (!state) {
    return (
      <div className={root}>
        <div className="lp-live__center">
          <Mascot id={myMascot} mood="happy" size={150} animate />
          <h1 className="lp-live__h">
            Đang vào lớp <Dots />
          </h1>
          <p className="lp-live__p">Em chờ một chút nhé!</p>
        </div>
      </div>
    );
  }

  const header = (
    <header className="lp-live__top">
      <span className="lp-live__me">
        <Mascot id={myMascot} mood="happy" size={44} />
        <span className="lp-live__name">{me.name}</span>
      </span>
      {team && (
        <span className="lp-live__team" style={{ background: team.color }}>
          <Icon name="team" size={20} /> {team.name}
        </span>
      )}
      <span className="lp-live__stars">
        <StarCount value={myStars} size="md" />
      </span>
    </header>
  );

  /* ---------- kết thúc ---------- */
  if (state.phase === 'ended') {
    return (
      <div className={root}>
        {header}
        <Confetti show durationMs={4000} />
        <div className="lp-live__center">
          <Mascot id={myMascot} mood="cheer" size={190} animate />
          <h1 className="lp-live__h">Buổi học kết thúc rồi!</h1>
          <div className="lp-live__starbig">
            <StarCount value={myStars} size="lg" />
            <span>sao em nhận được hôm nay</span>
          </div>
          <p className="lp-live__p">Cảm ơn em đã học thật chăm chỉ!</p>
        </div>
      </div>
    );
  }

  /* ---------- khóa màn hình ---------- */
  if (state.locked) {
    return (
      <div className={cx(root, 'lp-live--locked')}>
        <div className="lp-live__center">
          <BigEyes size={300} />
          <h1 className="lp-live__h lp-live__h--huge">Nhìn lên bảng nhé!</h1>
          <p className="lp-live__p">Thầy/cô đang nói điều quan trọng đó.</p>
        </div>
      </div>
    );
  }

  let body: JSX.Element;
  if (state.phase === 'lobby') {
    body = (
      <div className="lp-live__center">
        <MascotBubble mascot={myMascot} mood="wave" size={170} className="lp-live__lobby-bubble">
          <strong>Chờ thầy/cô bắt đầu nhé!</strong>
        </MascotBubble>
        <p className="lp-live__p">
          Chào <strong>{me.name}</strong>! Em đã vào lớp rồi.
        </p>
        <p className="lp-live__chip">
          <Icon name="team" size={20} /> {state.participants.length} bạn đã vào lớp
        </p>
        <Dots />
      </div>
    );
  } else if ((state.phase === 'activity-open' || state.phase === 'activity-closed' || state.phase === 'reveal') && item) {
    body = renderActivity();
  } else if (slide) {
    body = (
      <div className="lp-live__mirror">
        <p className="lp-live__tag">
          <Icon name="tv" size={20} /> Trang {state.slideIndex + 1}
          {lesson ? `/${lesson.slides.length}` : ''} · cùng nhìn lên bảng nhé
        </p>
        <div className="lp-live__mirror-card">
          <SlideView slide={slide} items={allItems} context="student" interactive={false} compact mascot={lessonMascot(lesson)} bigText={bigText} sound={sound} />
        </div>
      </div>
    );
  } else {
    body = (
      <div className="lp-live__center">
        <Mascot id={myMascot} mood="happy" size={150} animate />
        <h1 className="lp-live__h">Cùng nhìn lên bảng với thầy/cô nhé!</h1>
        <p className="lp-live__p">Khi có câu hỏi, câu hỏi sẽ hiện ở đây.</p>
      </div>
    );
  }

  return (
    <div className={root} onPointerDown={() => unlockAudio()}>
      {header}
      <StarBurst show={burst} onDone={() => setBurst(false)} />
      <main className="lp-live__main">{body}</main>
    </div>
  );

  function renderActivity(): JSX.Element {
    const it = item as Item;
    const phase = state!.phase;
    const timer =
      phase === 'activity-open' && state!.timerEndsAt && !timeUp ? (
        <TimerRing key={state!.timerEndsAt} endsAt={state!.timerEndsAt} totalSeconds={timerTotalSeconds(state!.timerEndsAt)} size={72} tick={false} />
      ) : null;

    if (phase === 'reveal') {
      const showKey = it.key != null;
      let banner: JSX.Element;
      if (!mySent) banner = <MascotBubble mascot={myMascot} mood="think" size={72}><strong>Em chưa trả lời câu này.</strong> Cùng xem đáp án nhé!</MascotBubble>;
      else if (myCorrect === true) banner = <MascotBubble mascot={myMascot} mood="cheer" size={72}><strong>Đúng rồi! Giỏi quá!</strong></MascotBubble>;
      else if (myCorrect === false) banner = <MascotBubble mascot={myMascot} mood="happy" size={72}><strong>Chưa đúng rồi.</strong> Không sao, lần sau em cố lên nhé!</MascotBubble>;
      else banner = <MascotBubble mascot={myMascot} mood="happy" size={72}><strong>Cảm ơn em đã trả lời!</strong></MascotBubble>;
      return (
        <div className={cx('lp-live__act', myCorrect === true && 'is-ok', myCorrect === false && 'is-try')}>
          <div className="lp-live__banner">{banner}</div>
          {showKey || mySent ? (
            <div className="lp-card lp-live__card">
              <ActivityView item={it} value={mySent?.response} onChange={() => undefined} disabled reveal={showKey} result={revealResult} bigText={bigText} />
            </div>
          ) : null}
          {it.explanation && <p className="lp-live__explain">{it.explanation}</p>}
          <Confetti show={myCorrect === true} durationMs={2500} />
        </div>
      );
    }

    if (mySent) {
      return (
        <div className="lp-live__center">
          <div className="lp-live__sent-icon">
            <Icon name="check" size={64} />
          </div>
          <h1 className="lp-live__h">Đã gửi!</h1>
          <p className="lp-live__p">{phase === 'activity-closed' ? 'Chờ thầy/cô công bố đáp án nhé!' : 'Chờ các bạn nhé!'}</p>
          {timer}
          <Mascot id={myMascot} mood="happy" size={110} animate />
        </div>
      );
    }

    if (phase === 'activity-closed' || timeUp) {
      return (
        <div className="lp-live__center">
          <Icon name="clock" size={64} />
          <h1 className="lp-live__h">Hết giờ rồi!</h1>
          <p className="lp-live__p">Cùng chờ xem đáp án nhé.</p>
          <Mascot id={myMascot} mood="think" size={110} />
        </div>
      );
    }

    const ready = (() => {
      try {
        return isComplete(it, draft);
      } catch {
        return draft !== undefined;
      }
    })();
    return (
      <div className="lp-live__act">
        <div className="lp-card lp-live__card">
          <ActivityView item={it} value={draft} onChange={(v) => setDraft(v)} disabled={sendState === 'sending'} bigText={bigText} />
        </div>
        <div className="lp-live__send">
          {timer}
          {sendState === 'error' && <p className="lp-live__err">Chưa gửi được. Em kiểm tra mạng rồi bấm “Gửi” lại nhé!</p>}
          <Button variant="primary" size="xl" className="lp-cta" disabled={!ready || sendState === 'sending'} onClick={send} icon={<Icon name="upload" size={28} />}>
            {sendState === 'sending' ? 'Đang gửi…' : 'Gửi'}
          </Button>
        </div>
      </div>
    );
  }
}
