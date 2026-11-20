import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { AnyResponse, Item, MascotId, RemediationOutcome, RemediationSet, ScoreResult } from '@openedu/contracts';
import { MISCONCEPTIONS, skillShort } from '@openedu/contracts';
import { useHint, useItemsByIds, usePassport, useRemediationSets, useSkillMastery, useSubmitAnswer, useSubmitRemediation } from '@openedu/data';
import { ActivityView, isComplete } from '@openedu/activity-engine';
import { Button, Confetti, Icon, Mascot, MascotBubble, SpeakButton, StarBurst, StarCount, StarShape, sfx } from '@openedu/ui';
import { EmptyState, ErrorState, LoadingScreen, TopBack } from '../components/Common';
import { BandAid } from './Home';
import { useUi } from '../lib/store';
import { daysFromToday, resolveSettings, useMe } from '../lib/util';
import '../styles/tower.css';
import '../styles/remediation.css';

const WEEKDAY = ['Chủ nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'];
const GENERIC_HINT = 'Em đọc lại đề thật chậm, làm từng bước một nhé!';

/** Lời nhắc theo câu trả lời sai (lựa chọn / đáp án → mã quan niệm sai), nếu có. */
function hintFor(item: Item, value: AnyResponse | undefined): string | null {
  const v = value as Record<string, unknown> | undefined;
  if (!v) return null;
  const keyMap = (item.key as { misconceptions?: Record<string, string> } | undefined)?.misconceptions;
  const content = item.payload as { options?: { id: string; misconception?: string }[] } | undefined;
  let code: string | undefined;
  if (typeof v.choice === 'string') code = content?.options?.find((o) => o.id === v.choice)?.misconception ?? keyMap?.[v.choice];
  else if (typeof v.text === 'string') code = keyMap?.[v.text.trim()];
  else if (typeof v.value === 'number') code = keyMap?.[String(v.value)];
  return code && MISCONCEPTIONS[code] ? MISCONCEPTIONS[code].kidHint : null;
}

export default function Remediation() {
  const me = useMe();
  const { setId = '' } = useParams();
  const id = decodeURIComponent(setId);
  const setsQ = useRemediationSets(me.id);
  const companion: MascotId = usePassport(me.id).data?.companion ?? me.avatarMascot;
  // Giữ bộ ôn đã mở: sau khi nộp, danh sách đổi (chặng mới) nhưng màn kết quả vẫn cần bộ cũ.
  const kept = useRef<RemediationSet | null>(null);
  const found = (setsQ.data ?? []).find((s) => s.id === id);
  if (found && !kept.current) kept.current = found;
  const set = kept.current;
  const itemsQ = useItemsByIds(set?.itemIds);

  if (!set) {
    if (setsQ.isPending) return <LoadingScreen label="Mình đang chuẩn bị" mascot={companion} />;
    if (setsQ.isError) return <ErrorState message="Chưa tải được bài ôn." onRetry={() => void setsQ.refetch()} mascot={companion} />;
    return <div className="ln-page"><TopBack title="Ôn lại cho chắc" /><EmptyState title="Bài ôn này em làm xong rồi!" text="Mình về trang Hôm nay xem còn gì vui nhé." mascot={companion} /></div>;
  }
  if (itemsQ.isPending) return <LoadingScreen label="Mình đang chuẩn bị" mascot={companion} />;
  if (itemsQ.isError) return <ErrorState message="Chưa tải được câu hỏi." onRetry={() => void itemsQ.refetch()} mascot={companion} />;
  const items = set.itemIds.map((i) => itemsQ.data?.[i]).filter((x): x is Item => !!x);
  if (!items.length) return <div className="ln-page"><TopBack title="Ôn lại cho chắc" /><EmptyState title="Câu hỏi đang được chuẩn bị" text="Em quay lại sau một chút nhé!" mascot={companion} /></div>;
  return <Flow set={set} items={items} companion={companion} />;
}

type Phase = 'intro' | 'play' | 'result';

function Flow({ set, items, companion }: { set: RemediationSet; items: Item[]; companion: MascotId }) {
  const me = useMe();
  const nav = useNavigate();
  const bigText = resolveSettings(me).bigText;
  const mastery = useSkillMastery(me.id).data;
  const submit = useSubmitAnswer();
  const finishM = useSubmitRemediation();
  const toast = useUi((s) => s.toast);
  const queueUnlocks = useUi((s) => s.queueUnlocks);
  const [phase, setPhase] = useState<Phase>('intro');
  const [i, setI] = useState(0);
  const [value, setValue] = useState<AnyResponse | undefined>(undefined);
  const [attempt, setAttempt] = useState(1);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // Gợi ý từng bước (docs/PHASE7_AI_HINT.md): mẹo hiện sẵn tính là mức 1, mỗi lần bấm xin mức kế (tối đa 3).
  const hintM = useHint();
  const [hintLevel, setHintLevel] = useState(1);
  const [burst, setBurst] = useState(false);
  const [stars, setStars] = useState(0);
  const [answers, setAnswers] = useState<{ itemId: string; correct: boolean }[]>([]);
  const [outcome, setOutcome] = useState<RemediationOutcome | null>(null);

  // Mẹo cho màn mở đầu: quan niệm sai em hay gặp nhất ở kĩ năng này.
  const m = (mastery ?? []).find((x) => x.skillCode === set.skillCode) ?? (mastery ?? []).find((x) => x.skillCode === set.rootSkill);
  const topCode = m ? Object.keys(m.misconceptions).sort((a, b) => m.misconceptions[b] - m.misconceptions[a])[0] : undefined;
  const fallback = Object.keys(MISCONCEPTIONS).map((k) => MISCONCEPTIONS[k]).find((x) => x.skill === set.skillCode || x.rootSkill === set.rootSkill);
  const tip = (topCode && MISCONCEPTIONS[topCode]?.kidHint) || fallback?.kidHint;
  const main = skillShort(set.skillCode);
  const root = set.rootSkill !== set.skillCode ? skillShort(set.rootSkill) : null;
  const intro = set.kind === 'review'
    ? `Mình cùng ôn lại “${main}” một chút để em nhớ thật lâu nhé! Chỉ ${items.length} câu thôi.`
    : `Hôm nay mình cùng luyện “${root ?? main}”${root ? ` để làm “${main}” dễ hơn` : ''} nhé! Chỉ ${items.length} câu ngắn thôi.`;

  const item = items[i];
  const itemRef = useRef(item.id);
  itemRef.current = item.id;
  const ready = (() => { try { return isComplete(item, value); } catch { return value !== undefined; } })();
  const settled = !!result && (result.correct || attempt >= 2);

  const check = () => {
    if (!ready || submit.isPending || result) return;
    submit.mutate({ userId: me.id, item, response: value as AnyResponse, context: { source: 'practice' }, attempt }, {
      onSuccess: (res) => {
        setResult(res.result);
        if (res.award?.newlyUnlocked.length) queueUnlocks(res.award.newlyUnlocked);
        if (res.result.correct || !res.result.graded) { sfx.correct(); setBurst(true); setStars((s) => s + res.starsAwarded); setHint(null); }
        else { sfx.tryAgain(); setHint(hintFor(item, value) ?? item.hint ?? tip ?? GENERIC_HINT); }
      },
      onError: () => toast('Chưa gửi được câu trả lời. Em kiểm tra mạng rồi bấm lại nhé!', 'try'),
    });
  };
  const askHint = () => {
    if (hintM.isPending || hintLevel >= 3 || value === undefined) return;
    const forItem = item.id;
    const ask = (level: number) => {
      hintM.mutate({ userId: me.id, item, response: value, attempt: level }, {
        onSuccess: (h) => {
          if (forItem !== itemRef.current) return;
          // Trùng với mẹo đang hiện (vd cùng một lời nhắc) → xin luôn mức kế.
          if (h.text === hint && level < 3) { ask(level + 1); return; }
          setHintLevel(level);
          setHint(h.text);
        },
      });
    };
    sfx.tap();
    ask(hintLevel + 1);
  };
  const retry = () => { sfx.tap(); setAttempt(2); setResult(null); setValue(undefined); };
  const next = () => {
    if (!result) return;
    const all = answers.concat({ itemId: item.id, correct: result.correct || !result.graded });
    setAnswers(all);
    if (i + 1 < items.length) { setI(i + 1); setValue(undefined); setResult(null); setAttempt(1); setHint(null); setHintLevel(1); return; }
    setPhase('result');
    finishM.mutate({ userId: me.id, setId: set.id, results: all }, {
      onSuccess: (o) => { setOutcome(o); if (o.passed) sfx.fanfare(); },
      onError: () => toast('Chưa lưu được kết quả. Em bấm “Lưu lại” nhé!', 'try'),
    });
  };

  const keyRef = useRef<() => void>(() => undefined);
  keyRef.current = () => { if (phase !== 'play') return; if (!result) check(); else if (settled) next(); else retry(); };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); keyRef.current(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (phase === 'intro') {
    const said = `${intro}${tip ? ` Mẹo nhỏ: ${tip}` : ''}`;
    return (
      <div className="ln-page ln-rem">
        <TopBack title="Ôn lại cho chắc" />
        <div className="ln-rem-intro k-card">
          <span className="ln-rem-intro__art" aria-hidden="true"><BandAid size={56} /></span>
          <Mascot id={companion} mood="wave" size={132} animate title="" />
          <h1 className="ln-rem-intro__title">{root ?? main}</h1>
          <p className="ln-rem-intro__text">{intro}</p>
          {tip && <div className="ln-rem-tip"><Icon name="hint" size={24} /><span><strong>Mẹo nhỏ:</strong> {tip}</span></div>}
          <div className="ln-rem-chips">
            <span className="ln-mini-chip"><Icon name="pencil" size={18} /> {items.length} câu</span>
            <span className="ln-mini-chip"><Icon name="clock" size={18} /> {set.minutes} phút</span>
            {set.reviewStage > 0 && <span className="ln-mini-chip">Ôn lại lần {set.reviewStage}/3</span>}
          </div>
          <div className="ln-row ln-row--center">
            <SpeakButton text={said} label="Nghe đọc" />
            <Button size="xl" onClick={() => { sfx.tap(); setPhase('play'); }} icon={<Icon name="play" size={30} />}>Bắt đầu nhé</Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    const correct = outcome?.correct ?? answers.filter((a) => a.correct).length;
    const total = outcome?.total ?? answers.length;
    const waiting = !!outcome?.pending;
    const passed = outcome?.passed ?? false;
    const nextAt = outcome?.mastery.nextReviewAt;
    const nd = nextAt ? daysFromToday(nextAt) : null;
    const when = nextAt ? (nd === 1 ? 'ngày mai' : `${WEEKDAY[new Date(nextAt).getDay()]}`) : null;
    const earned = waiting ? 0 : Math.max(1, Math.round((correct / Math.max(1, total)) * 3));
    return (
      <div className="ln-page ln-rem">
        <Confetti show={passed} />
        <div className={`ln-rem-result k-card${passed ? ' is-pass' : ''}`}>
          {waiting ? <p className="ln-rem-soft"><Icon name="clock" size={22} /> Đã lưu {total} câu — sẽ chấm khi có mạng</p> : <Ring value={correct} total={total} />}
          <div className="ln-rem-stars" aria-label={`${earned} trên 3 sao`}>
            {[0, 1, 2].map((k) => <span key={k} className={`ln-rem-star${k < earned ? ' is-on' : ''}`} style={{ animationDelay: `${k * 180}ms` }}><StarShape size={52} /></span>)}
          </div>
          <MascotBubble mascot={companion} mood={passed ? 'cheer' : 'happy'} size={88}>
            <strong>{waiting ? 'Em làm xong rồi!' : passed ? 'Em làm tốt lắm!' : 'Em đã cố gắng rất nhiều!'}</strong>{' '}
            {outcome?.message ?? (finishM.isPending ? 'Mình đang ghi lại…' : '')}
          </MascotBubble>
          {passed && when && (
            <div className="ln-rem-next">
              <Icon name="clock" size={28} />
              <span><strong>Lần ôn tiếp theo: {when}{nd !== null && nd > 1 ? `, ${new Date(nextAt as string).getDate()}/${new Date(nextAt as string).getMonth() + 1}` : ''}</strong>
                Mình sẽ hỏi lại vào {when} để em nhớ lâu hơn nhé!</span>
            </div>
          )}
          {outcome && !passed && !waiting && <p className="ln-rem-soft">Không sao đâu! Mình sẽ cùng ôn thêm vào lần sau, mỗi lần em lại giỏi hơn một chút.</p>}
          {stars > 0 && <p className="ln-rem-earn"><StarCount value={stars} size="sm" /> sao em nhận thêm</p>}
          {finishM.isError && <Button size="lg" onClick={() => finishM.mutate({ userId: me.id, setId: set.id, results: answers }, { onSuccess: setOutcome })} icon={<Icon name="retry" size={24} />}>Lưu lại</Button>}
          <Button size="xl" block onClick={() => nav('/')} icon={<Icon name="home" size={28} />}>Về Hôm nay</Button>
        </div>
      </div>
    );
  }

  const ok = !!result && (result.correct || !result.graded);
  return (
    <div className="ln-tower-play ln-rem-play">
      <header className="ln-tower-bar">
        <Button variant="secondary" icon={<Icon name="close" size={26} />} aria-label="Dừng ôn tập" onClick={() => nav('/')} />
        <span className="ln-floor-badge ln-rem-badge"><Icon name="star" size={22} /> Ôn lại cho chắc</span>
        <span className="ln-qdots" aria-label={`Câu ${i + 1} trên ${items.length}`}>{items.map((x, k) => <i key={x.id} className={k < i ? 'is-done' : k === i ? 'is-on' : ''} />)}</span>
        <StarCount value={stars} size="sm" />
      </header>
      <div className="ln-tower-main">
        <section className="ln-tower-q">
          <div className="ln-qcard" key={item.id + attempt}>
            <ActivityView item={item} value={value} onChange={setValue} disabled={!!result || submit.isPending} reveal={settled && item.key != null} result={result ?? undefined} bigText={bigText} />
          </div>
        </section>
      </div>
      <footer className={`ln-tower-foot${result ? (ok ? ' is-ok' : ' is-try') : ''}`}>
        <StarBurst show={burst} onDone={() => setBurst(false)} />
        {result ? (
          <>
            <MascotBubble mascot={companion} mood={ok ? 'cheer' : 'think'} size={64} className="ln-tower-feedback">
              {ok ? <strong>{attempt > 1 ? 'Đúng rồi! Em sửa giỏi quá!' : 'Đúng rồi! Giỏi quá!'}</strong>
                : attempt < 2 ? <><strong>Gần đúng rồi! Em xem mẹo này nhé:</strong> <span className="ln-rem-hint">{hintM.isPending ? <em className="ln-hint-thinking">Mình đang nghĩ…</em> : hint}</span></>
                : <><strong>Không sao đâu!</strong> Mình xem cách làm đúng rồi đi tiếp nhé.</>}
            </MascotBubble>
            {settled
              ? <Button size="xl" onClick={next} icon={<Icon name="next" size={28} />}>{i + 1 < items.length ? 'Tiếp' : 'Xem kết quả'}</Button>
              : <>
                  {hintLevel < 3 && (
                    <button type="button" className="ln-hint-btn" onClick={askHint} disabled={hintM.isPending} aria-busy={hintM.isPending || undefined}>
                      <Icon name="hint" size={26} /><span>{hintLevel > 1 ? 'Gợi ý thêm' : 'Gợi ý cho em'}</span>
                    </button>
                  )}
                  <Button size="xl" variant="subject" color="var(--k-try)" onClick={retry} icon={<Icon name="retry" size={28} />}>Thử lại</Button>
                </>}
          </>
        ) : (
          <Button size="xl" className="ln-tower-check" onClick={check} disabled={!ready || submit.isPending} icon={<Icon name="check" size={28} />}>
            {submit.isPending ? 'Đang chấm…' : 'Kiểm tra'}
          </Button>
        )}
      </footer>
    </div>
  );
}

function Ring({ value, total }: { value: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const f = total ? value / total : 0;
  return (
    <div className="ln-rem-ring" role="img" aria-label={`Đúng ${value} trên ${total} câu`}>
      <svg viewBox="0 0 128 128" width="150" height="150">
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--k-line)" strokeWidth="14" />
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--k-ok)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 64 64)" className="ln-rem-ring__arc" />
      </svg>
      <span className="ln-rem-ring__n"><strong>{value}/{total}</strong><span>câu đúng</span></span>
    </div>
  );
}
