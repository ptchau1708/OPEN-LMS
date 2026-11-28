/** Kết quả một lần làm bài luyện: điểm, thời gian, theo dạng câu, bảng xếp hạng, xem lại từng câu. */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Item, ItemType, OnThiResult, OnThiStyle } from '@openedu/contracts';
import { useItemsByIds, useOnThiCards, useOnThiResult } from '@openedu/data';
import { ActivityView } from '@openedu/activity-engine';
import { Button, Confetti, Icon, MascotBubble, sfx } from '@openedu/ui';
import { EmptyState, ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { resolveSettings, useMe } from '../../lib/util';
import { BoardList } from './Board';
import { STYLE_PATH, fmtScore, fmtTime, styleFromPath, styleTitle, typeLabel } from './shared';
import '../exam/exam.css';
import './onthi.css';

export default function OnThiResultPage() {
  const { style: sp, attemptId = '' } = useParams();
  const style = styleFromPath(sp);
  const q = useOnThiResult(attemptId);
  if (!style) return <div className="ln-page"><TopBack title="Ôn thi" to="/on-thi" /><EmptyState title="Không có trang này" /></div>;
  if (q.isPending) return <LoadingScreen label="Đang chấm bài" />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error | null)?.message ?? 'Chưa tải được kết quả.'} onRetry={() => void q.refetch()} />;
  return <ResultBody style={style} r={q.data} />;
}

function ResultBody({ style, r }: { style: OnThiStyle; r: OnThiResult }) {
  const me = useMe();
  const nav = useNavigate();
  const base = `/on-thi/${STYLE_PATH[style]}`;
  const card = (useOnThiCards(style).data ?? []).find((c) => c.setId === r.setId);
  const ids = useMemo(() => r.items.map((x) => x.itemId), [r.items]);
  const itemsQ = useItemsByIds(ids);
  const [open, setOpen] = useState<string | null>(null);
  const [onlyWrong, setOnlyWrong] = useState(true);

  const byType = useMemo(() => {
    const m = new Map<ItemType, { n: number; ok: number }>();
    for (const x of r.items) {
      const t = m.get(x.type) ?? { n: 0, ok: 0 };
      t.n++;
      if (x.correct) t.ok++;
      m.set(x.type, t);
    }
    return [...m.entries()];
  }, [r.items]);
  const mood = r.passed ? 'happy' : 'think';
  const msg = r.passed
    ? r.newBest ? 'Tuyệt quá! Em đạt bài và lập kỉ lục mới của mình!' : 'Em đạt bài rồi! Thử làm nhanh hơn để lên hạng nhé.'
    : `Em cần ${fmtScore(r.passScore)} điểm để đạt. Xem lại các câu sai rồi làm lại nhé!`;
  const list = r.items.filter((x) => !onlyWrong || !x.correct);

  return (
    <div className={`ln-page ln-ot ln-ot--${style}`}>
      <TopBack title={styleTitle(style)} to={base} />
      <Confetti show={r.passed} />
      <section className="ln-ot-score" aria-label="Kết quả">
        <MascotBubble mascot={me.avatarMascot} mood={mood}>{msg}</MascotBubble>
        <div className="ln-ot-score__big" data-testid="onthi-score"><b>{fmtScore(r.score)}</b><span>/{fmtScore(r.maxScore)} điểm</span></div>
        <p className="ln-ot-score__tags">
          <span className={r.passed ? 'is-ok' : 'is-try'}>{r.passed ? 'Đạt' : 'Chưa đạt'}</span>
          {r.newBest ? <span className="is-star"><Icon name="trophy" size={18} /> Kỉ lục mới</span> : null}
          <span><Icon name="clock" size={18} /> {fmtTime(r.durationMs)}</span>
        </p>
        <p className="ln-ot-score__counts"><span>Đúng <b>{r.correct}</b></span><span>Sai <b>{r.wrong}</b></span><span>Bỏ qua <b>{r.skipped}</b></span></p>
        <div className="ln-ex-introact">
          <Button size="lg" icon={<Icon name="retry" size={24} />} onClick={() => { sfx.tap(); nav(`${base}/bai/${r.setId}`); }}>Làm lại</Button>
          <Button size="lg" variant="secondary" onClick={() => nav(base)}>Về danh sách bài</Button>
        </div>
      </section>

      <h2 className="ln-h2 ln-ot-h">Theo dạng câu</h2>
      <ul className="ln-ot-types-sum">
        {byType.map(([t, v]) => (
          <li key={t}><span>{typeLabel(t)}</span><span className="ln-ot-types-sum__bar" aria-hidden="true"><i style={{ width: `${(v.ok / v.n) * 100}%` }} /></span><b>{v.ok}/{v.n}</b></li>
        ))}
      </ul>

      {card?.showBoard ? (
        <>
          <h2 className="ln-h2 ln-ot-h">Bảng xếp hạng</h2>
          <BoardList setId={r.setId} meId={me.id} maxScore={r.maxScore} />
        </>
      ) : null}

      <h2 className="ln-h2 ln-ot-h">Xem lại bài</h2>
      <label className="ln-ot-check"><input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} /> Chỉ hiện câu sai và câu bỏ qua</label>
      {list.length === 0 ? <p className="k-muted">Em làm đúng hết rồi!</p> : null}
      <ol className="ln-ot-review">
        {list.map((x) => {
          const no = r.items.indexOf(x) + 1;
          const it = itemsQ.data?.[x.itemId];
          const isOpen = open === x.itemId;
          return (
            <li key={x.itemId} className={`ln-ot-review__row ${x.correct ? 'is-ok' : x.answered ? 'is-try' : 'is-skip'}`}>
              <button type="button" className="ln-ot-review__head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : x.itemId)}>
                <span className="ln-ot-review__no">Câu {no}</span>
                <span className="ln-ot-review__type">{typeLabel(x.type)}</span>
                <span className="ln-ot-review__state">{x.correct ? 'Đúng' : x.answered ? 'Chưa đúng' : 'Bỏ qua'} · {fmtScore(x.earned)}/{fmtScore(x.points)}</span>
                <Icon name="chevron" size={20} className="ln-ot-review__chev" />
              </button>
              {isOpen ? (it ? <ReviewItem item={it} r={r} /> : <p className="k-muted">Đang tải câu hỏi…</p>) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ReviewItem({ item, r }: { item: Item; r: OnThiResult }) {
  const me = useMe();
  const settings = resolveSettings(me);
  const key = r.keys?.[item.id];
  const withKey = (key !== undefined && key !== null ? { ...item, key } : item) as Item;
  const canReveal = !!(withKey as Item & { key?: unknown }).key;
  return (
    <div className="ln-ot-review__body">
      <ActivityView item={withKey} value={r.responses[item.id] ?? undefined} onChange={() => undefined} disabled reveal={canReveal} bigText={settings.bigText} />
      {!canReveal ? <p className="k-muted">Thầy/cô chưa cho xem đáp án của bài này.</p> : null}
      {canReveal && item.explanation ? <p className="ln-ot-review__expl"><Icon name="hint" size={18} /> {item.explanation}</p> : null}
    </div>
  );
}
