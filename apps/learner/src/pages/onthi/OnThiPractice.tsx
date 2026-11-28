/** Luyện theo dạng: làm liền vài câu cùng một dạng, biết đúng sai ngay sau mỗi câu (không tính xếp hạng). */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { AnyResponse, Item, ItemType, OnThiStyle, ScoreResult } from '@openedu/contracts';
import { ACTIVITY_TYPES } from '@openedu/contracts';
import { usePracticeItems, useSubmitAnswer } from '@openedu/data';
import { ActivityView, isComplete } from '@openedu/activity-engine';
import { Button, Confetti, Icon, MascotBubble, ProgressBar, sfx } from '@openedu/ui';
import { EmptyState, ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { errText, resolveSettings, useMe } from '../../lib/util';
import { STYLE_PATH, styleFromPath, typeLabel } from './shared';
import '../exam/exam.css';
import './onthi.css';

const TYPES = new Set<string>(ACTIVITY_TYPES.map((a) => a.type));

export default function OnThiPractice() {
  const { style: sp, type = '' } = useParams();
  const style = styleFromPath(sp);
  if (!style || !TYPES.has(type)) return <div className="ln-page"><TopBack title="Luyện theo dạng" to="/on-thi" /><EmptyState title="Không có dạng câu này" /></div>;
  return <Practice style={style} type={type as ItemType} />;
}

function Practice({ style, type }: { style: OnThiStyle; type: ItemType }) {
  const me = useMe();
  const settings = resolveSettings(me);
  const nav = useNavigate();
  const base = `/on-thi/${STYLE_PATH[style]}`;
  const q = usePracticeItems(style, type);
  const submit = useSubmitAnswer();
  const [i, setI] = useState(0);
  const [value, setValue] = useState<AnyResponse | undefined>(undefined);
  const [checked, setChecked] = useState<ScoreResult | null>(null);
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [startedAt, setStartedAt] = useState(Date.now());

  if (q.isPending) return <LoadingScreen label="Đang chọn câu luyện" />;
  if (q.isError) return <ErrorState message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const items: Item[] = q.data ?? [];
  const title = `Luyện: ${typeLabel(type)}`;
  if (!items.length) return <div className="ln-page ln-ot"><TopBack title={title} to={base} /><EmptyState title="Chưa có câu dạng này" text="Thầy/cô chưa có bài luyện dạng câu này cho khối của em." /></div>;

  const restart = () => { setI(0); setValue(undefined); setChecked(null); setRight(0); setDone(false); setStartedAt(Date.now()); void q.refetch(); };
  if (done) {
    const good = right >= Math.ceil(items.length * 0.8);
    return (
      <div className={`ln-page ln-ot ln-ot--${style}`}>
        <TopBack title={title} to={base} />
        <Confetti show={good} />
        <section className="ln-ot-score">
          <MascotBubble mascot={me.avatarMascot} mood={good ? 'happy' : 'think'}>{good ? 'Em làm dạng này chắc tay rồi!' : 'Luyện thêm một lượt nữa là quen ngay!'}</MascotBubble>
          <div className="ln-ot-score__big" data-testid="onthi-practice-score"><b>{right}</b><span>/{items.length} câu đúng</span></div>
          <div className="ln-ex-introact">
            <Button size="lg" icon={<Icon name="retry" size={24} />} onClick={() => { sfx.tap(); restart(); }}>Luyện lượt mới</Button>
            <Button size="lg" variant="secondary" onClick={() => nav(base)}>Về trang ôn thi</Button>
          </div>
        </section>
      </div>
    );
  }

  const it = items[i];
  const canCheck = value !== undefined && (() => { try { return isComplete(it, value); } catch { return true; } })();
  const check = async () => {
    if (!canCheck || submit.isPending) return;
    setErr('');
    try {
      const r = await submit.mutateAsync({ userId: me.id, item: it, response: value as AnyResponse, context: { source: 'practice' }, attempt: 1 });
      setChecked(r.result);
      if (r.result.correct) { setRight((x) => x + 1); sfx.correct(); } else sfx.tryAgain();
    } catch (e) {
      setErr(errText(e, 'Chưa chấm được. Em kiểm tra mạng rồi thử lại nhé.'));
    }
  };
  const next = () => {
    sfx.tap();
    if (i + 1 >= items.length) { setDone(true); return; }
    setI(i + 1); setValue(undefined); setChecked(null); setStartedAt(Date.now());
  };
  void startedAt;
  return (
    <div className={`ln-page ln-ot ln-ot--${style}`}>
      <TopBack title={title} to={base} />
      <div className="ln-ot-prac">
        <ProgressBar value={(i + (checked ? 1 : 0)) / items.length} />
        <p className="ln-ot-prac__count">Câu {i + 1}/{items.length} · đúng {right}</p>
        <section className="ln-ex-q">
          <ActivityView key={it.id} item={it} value={value} onChange={(v) => { if (!checked) setValue(v); }} disabled={!!checked} reveal={!!checked} result={checked ?? undefined} bigText={settings.bigText} />
          {checked ? (
            <div className={`ln-ot-feedback ${checked.correct ? 'is-ok' : 'is-try'}`} role="status">
              <b>{checked.correct ? 'Đúng rồi!' : 'Chưa đúng.'}</b>
              {it.explanation ? <span> {it.explanation}</span> : null}
            </div>
          ) : null}
          {err ? <p className="ln-alert">{err}</p> : null}
          <footer className="ln-ex-q__nav">
            {checked
              ? <Button size="lg" onClick={next} data-testid="onthi-practice-next">{i + 1 >= items.length ? 'Xem kết quả' : 'Câu tiếp'} <Icon name="next" size={24} /></Button>
              : <Button size="lg" disabled={!canCheck || submit.isPending} onClick={() => void check()} data-testid="onthi-practice-check">{submit.isPending ? 'Đang chấm…' : 'Kiểm tra'}</Button>}
          </footer>
        </section>
      </div>
    </div>
  );
}
