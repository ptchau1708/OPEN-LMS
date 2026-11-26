/**
 * Trận trong giải đấu (HS): làm lần lượt các câu, mỗi câu 20 giây. Hai bạn làm cùng bộ câu, không cần vào cùng lúc.
 * Lỡ thoát ra thì vào lại làm tiếp từ câu chưa làm.
 */
import { useEffect, useRef, useState } from 'react';
import '../duel/duel.css';
import { useQueryClient } from '@tanstack/react-query';
import { CUP_QUESTION_SECONDS, type AnyResponse, type CupPlay } from '@openedu/contracts';
import { getArenaSource, useDataSource } from '@openedu/data';
import { ActivityView, isComplete } from '@openedu/activity-engine';
import { Button, Icon, Mascot, TimerRing, sfx } from '@openedu/ui';
import { useUi } from '../../lib/store';
import { errText, useMe } from '../../lib/util';

export function CupMatchPlay({ play, bigText, onDone, onExit }: { play: CupPlay; bigText: boolean; onDone: () => void; onExit: () => void }) {
  const me = useMe();
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const total = play.items.length;
  const [answers, setAnswers] = useState(() => new Map(play.answered.map((a) => [a.q, a])));
  const firstOpen = () => { for (let i = 0; i < total; i++) if (!answers.has(i)) return i; return total; };
  const [q, setQ] = useState(firstOpen);
  const [value, setValue] = useState<AnyResponse | undefined>(undefined);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<null | { correct: boolean }>(null);
  const [ready, setReady] = useState(q >= total ? true : false);
  const timer = useRef<number | null>(null);
  const item = play.items[q];
  const endsAt = startedAt + CUP_QUESTION_SECONDS * 1000;

  const next = () => {
    setShown(null);
    setValue(undefined);
    setStartedAt(Date.now());
    setQ((x) => x + 1);
  };
  const record = (qi: number, a: { correct: boolean; points: number; ms: number }) => {
    setAnswers((m) => new Map(m).set(qi, { q: qi, ...a }));
    setShown({ correct: a.correct });
    if (a.correct) sfx.correct(); else sfx.tryAgain();
    window.setTimeout(next, 1100);
  };
  // Hết giờ câu này → tính là bỏ qua.
  useEffect(() => {
    if (!ready || q >= total || shown || busy) return;
    timer.current = window.setTimeout(() => {
      setBusy(true);
      getArenaSource(ds).skip(play, q).then(
        () => { setBusy(false); record(q, { correct: false, points: 0, ms: CUP_QUESTION_SECONDS * 1000 }); },
        (e) => { setBusy(false); toast(errText(e), 'try'); },
      );
    }, Math.max(0, endsAt - Date.now()));
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [ready, q, shown, busy, endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Xong hết → báo máy chủ, xem kết quả.
  const finished = q >= total;
  useEffect(() => {
    if (!finished) return;
    for (const k of ['wallet', 'rewards', 'todayTasks', 'skillMastery']) void qc.invalidateQueries({ queryKey: [k] });
    onDone();
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = (() => { if (!item || value === undefined) return false; try { return isComplete(item, value); } catch { return true; } })();
  const submit = () => {
    if (!item || !complete || busy || shown) return;
    sfx.tap();
    setBusy(true);
    getArenaSource(ds).answer(play, q, item, value as AnyResponse, Date.now() - startedAt).then(
      (r) => { setBusy(false); record(q, r); },
      (e) => { setBusy(false); toast(errText(e, 'Chưa gửi được câu trả lời. Em bấm lại nhé!'), 'try'); },
    );
  };

  if (!ready) {
    return (
      <div className="ln-duel-play ln-cupplay" data-testid="cup-play-intro">
        <div className="ln-duel-count" role="status">
          <div className="ln-duel-end__vs">
            <span className="ln-cupplay__side"><span className="ln-duel-vs__p"><Mascot id={me.avatarMascot} mood="cheer" size={84} title="" animate /></span><b>Em</b></span>
            <span className="ln-duel-vs__x">VS</span>
            <span className="ln-cupplay__side"><span className="ln-duel-vs__p"><Mascot id={play.opponent.mascot} mood="happy" size={84} title="" animate /></span><b>{play.opponent.name}</b></span>
          </div>
          <p className="ln-cupplay__rule">{total} câu · mỗi câu {CUP_QUESTION_SECONDS} giây. Đúng nhiều hơn là thắng, bằng nhau thì ai nhanh hơn thắng. {play.opponent.name} làm cùng các câu này.</p>
          <Button size="xl" icon={<Icon name="play" size={28} />} onClick={() => { sfx.tap(); setStartedAt(Date.now()); setReady(true); }} data-testid="cup-play-start">
            {answers.size ? `Làm tiếp từ câu ${q + 1}` : 'Bắt đầu'}
          </Button>
          <Button size="lg" variant="ghost" onClick={onExit}>Để sau</Button>
        </div>
      </div>
    );
  }
  if (finished || !item) return <div className="ln-duel-play"><p className="ln-h1" role="status">Đang tính kết quả…</p></div>;
  return (
    <div className="ln-duel-play ln-cupplay" data-testid="cup-play">
      <header className="ln-duel-bar">
        <Button variant="secondary" icon={<Icon name="close" size={26} />} aria-label="Tạm rời trận" onClick={onExit} />
        <div className="ln-duel-bar__mid">
          {shown ? <span className="ln-duel-qnum">{q + 1}/{total}</span> : <TimerRing key={q} endsAt={new Date(endsAt).toISOString()} totalSeconds={CUP_QUESTION_SECONDS} size={56} tick />}
        </div>
        <span className="ln-cupplay__score" aria-label="Số câu đúng">✓ {[...answers.values()].filter((a) => a.correct).length}</span>
      </header>
      <div className="ln-duel-dots" aria-label={`Câu ${q + 1} trên ${total}`}>
        {play.items.map((_, i) => {
          const a = answers.get(i);
          return <i key={i} className={a ? (a.correct ? 'is-done' : 'is-miss') : i === q ? 'is-on' : ''} />;
        })}
      </div>
      <main className="ln-duel-main">
        <div className="ln-qcard ln-duel-q" key={item.id + q}>
          <ActivityView item={item} value={value} onChange={setValue} disabled={busy || !!shown} bigText={bigText} />
        </div>
        {shown ? (
          <p className={`ln-cupplay__fb ${shown.correct ? 'is-ok' : 'is-bad'}`} role="status">{shown.correct ? 'Đúng rồi!' : 'Chưa đúng — câu sau cố lên!'}</p>
        ) : (
          <Button size="xl" block disabled={!complete || busy} onClick={submit} icon={<Icon name="check" size={28} />} data-testid="cup-answer">{busy ? 'Đang chấm…' : 'Chốt đáp án'}</Button>
        )}
      </main>
    </div>
  );
}
