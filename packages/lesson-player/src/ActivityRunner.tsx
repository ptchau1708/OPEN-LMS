import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AnswerEvent, AnyResponse, Item, MascotId, ScoreResult, Slide } from '@openedu/contracts';
import { isComplete, scoreItem } from '@openedu/activity-engine';
import { Button, Icon, MascotBubble, StarBurst } from '@openedu/ui';
import type { SlideActivityProps } from './SlideView';
import { canGradeLocally, cx, isGradedType, play } from './util';

export const MAX_TRIES = 2;
/** Mức gợi ý cao nhất cho một câu (1: đọc lại / để ý gì → 2: bước đầu → 3: cách làm với ví dụ nhỏ hơn). */
export const MAX_HINTS = 3;

/** Yêu cầu gợi ý gửi cho app (app gọi DataSource.getHint). Gói này không phụ thuộc @openedu/data. */
export interface HintRequest {
  item: Item;
  /** Câu trả lời chưa đúng em vừa kiểm tra. */
  response: AnyResponse;
  /** Mức gợi ý muốn xin (1..3). */
  attempt: number;
}
export type HintFn = (req: HintRequest) => Promise<{ text: string }>;

type Phase = 'answer' | 'correct' | 'retry' | 'revealed' | 'sent' | 'saved';

export interface ActivityOutcome {
  /** Có chấm được không (false: dạng không chấm hoặc item thiếu key). */
  graded: boolean;
  correct: boolean;
  score: number;
  /** Sao được cộng lần này. */
  stars: number;
}

export interface ActivityRunnerProps {
  slide: Slide;
  item: Item;
  mascot: MascotId;
  sound?: boolean;
  /** Đã được cộng sao cho câu này trước đó (học lại) → không cộng nữa. */
  alreadyAwarded?: boolean;
  /** Đã làm trước đó → hiện thêm nút "Tiếp" để đi qua. */
  allowSkip?: boolean;
  onAnswer?: (e: AnswerEvent) => void;
  /** Khi có kết quả cuối (đúng / hết lượt / đã gửi). */
  onResolved: (o: ActivityOutcome) => void;
  /** Khi em bấm "Tiếp tục" hoặc "Tiếp". */
  onContinue: () => void;
  /** Đăng ký hành động chính cho phím Enter. */
  registerPrimary?: (fn: (() => void) | null) => void;
  /** Phần thân: SlideView (slide activity) hoặc ActivityView (câu hỏi trong video). */
  children: (activity: SlideActivityProps) => ReactNode;
  /** Nút phụ bên trái thanh hành động (vd "Quay lại"). */
  leading?: ReactNode;
  continueLabel?: string;
  /** Mất mạng + câu có chấm nhưng thiếu đáp án → phase 'saved' (chấm khi đồng bộ, sao về sau). */
  pendingFeedback?: boolean;
  /**
   * Hàm xin gợi ý từng bước (không lộ đáp án). Có → sau khi làm chưa đúng hiện nút "Gợi ý cho em".
   * Chỉ truyền ở chế độ tự học / luyện tập / ôn tập — KHÔNG truyền trong bài kiểm tra, lớp trực tiếp, thi đấu.
   */
  getHint?: HintFn;
}

function safeScore(item: Item, value: AnyResponse | undefined): ScoreResult {
  try {
    return scoreItem(item, value);
  } catch {
    return { graded: false, correct: false, score: 0 };
  }
}
function safeComplete(item: Item, value: AnyResponse | undefined): boolean {
  try {
    return isComplete(item, value);
  } catch {
    return value !== undefined;
  }
}

const TRY_LINES = ['Gần đúng rồi, em thử lại nhé!', 'Chưa đúng rồi, em nghĩ thêm chút nữa nhé!'];

/** Luồng làm bài tự học: Kiểm tra → khen / gợi ý → Thử lại (tối đa 2 lượt) → xem đáp án. */
export function ActivityRunner(p: ActivityRunnerProps) {
  const { item, slide, mascot, sound } = p;
  const [value, setValue] = useState<AnyResponse | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('answer');
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<ScoreResult | undefined>(undefined);
  const [stars, setStars] = useState(0);
  const [burst, setBurst] = useState(false);
  // Gợi ý: nếu câu đã có gợi ý soạn sẵn (item.hint hiện ngay khi làm chưa đúng) thì lần xin đầu bắt đầu từ mức 2.
  const [hintLevel, setHintLevel] = useState(item.hint ? 1 : 0);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const startedAt = useRef(Date.now());
  const gradable = canGradeLocally(item);
  const ready = safeComplete(item, value);

  function check() {
    if (phase !== 'answer' || !ready) return;
    const n = attempts + 1;
    setAttempts(n);
    const r = safeScore(item, value);
    setResult(r);
    p.onAnswer?.({ slide, item, response: value as AnyResponse, result: r, attempts: n, durationMs: Date.now() - startedAt.current });
    if (!r.graded && p.pendingFeedback && isGradedType(item.type)) {
      setStars(0);
      setPhase('saved');
      play('star', sound);
      p.onResolved({ graded: false, correct: false, score: 0, stars: 0 });
    } else if (!r.graded) {
      const s = p.alreadyAwarded ? 0 : 1;
      setStars(s);
      setPhase('sent');
      if (s) setBurst(true);
      play('star', sound);
      p.onResolved({ graded: false, correct: false, score: r.score, stars: s });
    } else if (r.correct) {
      const s = p.alreadyAwarded ? 0 : item.stars ?? 1;
      setStars(s);
      setPhase('correct');
      setBurst(true);
      play('correct', sound);
      p.onResolved({ graded: true, correct: true, score: r.score, stars: s });
    } else if (n < MAX_TRIES) {
      setPhase('retry');
      play('tryAgain', sound);
    } else {
      setStars(0);
      setPhase('revealed');
      play('tryAgain', sound);
      p.onResolved({ graded: true, correct: false, score: r.score, stars: 0 });
    }
  }

  function retry() {
    setPhase('answer');
    setResult(undefined);
    setHintText(null);
    startedAt.current = Date.now();
  }

  const { getHint } = p;
  const canHint = !!getHint && phase === 'retry' && hintLevel < MAX_HINTS && value !== undefined;
  function askHint() {
    if (!getHint || !canHint || hintBusy) return;
    const level = hintLevel + 1;
    setHintBusy(true);
    play('tap', sound);
    getHint({ item, response: value as AnyResponse, attempt: level })
      .then((h) => {
        if (!alive.current) return;
        const text = (h?.text ?? '').trim();
        if (text) setHintText(text);
        setHintLevel(level);
      })
      .catch(() => {
        // App luôn có gợi ý dự phòng; nếu vẫn lỗi thì giữ nguyên lời nhắc cũ, em bấm lại được.
      })
      .then(() => {
        if (alive.current) setHintBusy(false);
      });
  }

  const primary = (): void => {
    if (phase === 'answer') {
      if (ready) check();
    } else if (phase === 'retry') retry();
    else p.onContinue();
  };
  const primaryRef = useRef(primary);
  primaryRef.current = primary;
  const { registerPrimary } = p;
  useEffect(() => {
    registerPrimary?.(() => primaryRef.current());
    return () => registerPrimary?.(null);
  }, [registerPrimary]);

  const activity: SlideActivityProps = {
    value,
    onChange: (v) => setValue(v),
    disabled: phase !== 'answer',
    reveal: phase === 'correct' || phase === 'revealed',
    result: phase === 'correct' || phase === 'revealed' ? result : undefined,
  };

  const checkLabel = gradable ? 'Kiểm tra' : 'Gửi';
  const cont = p.continueLabel ?? 'Tiếp tục';

  return (
    <div className="lp-runner">
      <div className="lp-runner__body">{p.children(activity)}</div>
      <StarBurst show={burst} count={Math.max(1, stars)} onDone={() => setBurst(false)} />
      {phase === 'answer' ? (
        <div className="lp-bar">
          <div className="lp-bar__lead">{p.leading}</div>
          <div className="lp-bar__main">
            {p.allowSkip && (
              <Button variant="secondary" size="lg" onClick={p.onContinue} icon={<Icon name="next" size={24} />}>
                Tiếp
              </Button>
            )}
            <Button variant="primary" size="xl" className="lp-cta" disabled={!ready} onClick={check} icon={<Icon name={gradable ? 'check' : 'upload'} size={28} />}>
              {checkLabel}
            </Button>
          </div>
        </div>
      ) : (
        <Feedback phase={phase} item={item} mascot={mascot} stars={stars} onRetry={retry} onContinue={p.onContinue} attempts={attempts} continueLabel={cont} hintText={hintText} hintBusy={hintBusy} hintMore={hintText !== null} onHint={canHint ? askHint : undefined} />
      )}
    </div>
  );
}

interface FeedbackProps {
  phase: Phase;
  item: Item;
  mascot: MascotId;
  stars: number;
  onRetry: () => void;
  onContinue: () => void;
  attempts: number;
  continueLabel: string;
  /** Gợi ý vừa xin (thay cho lời nhắc mặc định). */
  hintText?: string | null;
  hintBusy?: boolean;
  /** Đã xin ít nhất một gợi ý → nút đổi thành "Gợi ý thêm". */
  hintMore?: boolean;
  /** Có → hiện nút xin gợi ý. */
  onHint?: () => void;
}

function Feedback({ phase, item, mascot, stars, onRetry, onContinue, attempts, continueLabel, hintText, hintBusy, hintMore, onHint }: FeedbackProps) {
  const tone = phase === 'correct' || phase === 'sent' || phase === 'saved' ? 'ok' : 'try';
  let mood: 'cheer' | 'think' | 'happy' = 'cheer';
  let head: string;
  let body: string | null = null;
  if (phase === 'correct') {
    head = 'Giỏi quá!';
    body = item.explanation ?? null;
  } else if (phase === 'sent') {
    head = 'Đã gửi rồi!';
    body = 'Cảm ơn em nhé. Thầy/cô sẽ xem bài của em.';
    mood = 'happy';
  } else if (phase === 'saved') {
    head = 'Đã lưu — sẽ chấm khi có mạng';
    body = 'Em làm tiếp nhé! Có mạng lại, mình chấm và gửi sao cho em.';
    mood = 'happy';
  } else if (phase === 'retry') {
    head = hintText || item.hint ? 'Gợi ý nè:' : TRY_LINES[(attempts - 1) % TRY_LINES.length];
    body = hintText ?? item.hint ?? null;
    mood = 'think';
  } else {
    head = 'Không sao đâu! Cùng xem đáp án nhé.';
    body = item.explanation ?? 'Đáp án đúng đang được tô màu xanh. Lần sau em sẽ làm được!';
    mood = 'happy';
  }
  return (
    <div className={cx('lp-feedback', `lp-feedback--${tone}`)} role="status" aria-live="polite">
      <div className="lp-feedback__inner">
        <MascotBubble mascot={mascot} mood={mood} size={84} className="lp-feedback__bubble">
          <strong className="lp-feedback__head">{head}</strong>
          {phase === 'retry' && hintBusy ? (
            <span className="lp-feedback__body lp-hint-thinking">
              Mình đang nghĩ
              <span className="lp-hint-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </span>
          ) : (
            body && <span className="lp-feedback__body">{body}</span>
          )}
        </MascotBubble>
        <div className="lp-feedback__actions">
          {stars > 0 && (
            <span className="lp-feedback__stars" aria-label={`Em được cộng ${stars} sao`}>
              +{stars} <Icon name="star" size={28} />
            </span>
          )}
          {phase === 'retry' && onHint && (
            <button type="button" className="lp-hint-btn" onClick={onHint} disabled={hintBusy} aria-busy={hintBusy || undefined}>
              <Icon name="hint" size={26} />
              <span>{hintMore ? 'Gợi ý thêm' : 'Gợi ý cho em'}</span>
            </button>
          )}
          {phase === 'retry' ? (
            <Button variant="primary" size="xl" className="lp-cta lp-cta--try" onClick={onRetry} icon={<Icon name="retry" size={28} />}>
              Thử lại
            </Button>
          ) : (
            <Button variant="primary" size="xl" className="lp-cta" onClick={onContinue} icon={<Icon name="next" size={28} />}>
              {continueLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
