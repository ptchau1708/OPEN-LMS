/**
 * Phòng làm bài luyện Ôn thi.
 *  - Kiểu Trạng Nguyên: bảng câu để nhảy qua lại, mỗi câu 10 điểm, đúng hết mới được điểm.
 *  - Kiểu VioEdu: mỗi lần một câu, nút Bỏ qua (cuối bài quay lại câu đã bỏ), thanh nhịp thời gian.
 * Tự lưu từng câu; hết giờ tự nộp; nộp xong sang trang kết quả.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { AnyResponse, Item, OnThiSession, OnThiStyle } from '@openedu/contracts';
import { onThiKeys, useOnThiCards, useOnThiService } from '@openedu/data';
import { ActivityView, isComplete } from '@openedu/activity-engine';
import { Button, Icon, Mascot, sfx } from '@openedu/ui';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { errText, resolveSettings, useMe } from '../../lib/util';
import { StyleArt } from './Art';
import { STYLE_PATH, fmtClock, fmtScore, styleFromPath, styleTitle, typeLabel } from './shared';
import '../exam/exam.css';
import './onthi.css';

type Phase = 'loading' | 'intro' | 'taking' | 'error';

const answered = (it: Item | undefined, r: AnyResponse | undefined) => {
  if (!it || r === undefined || r === null) return false;
  try { return isComplete(it, r); } catch { return true; }
};

export default function OnThiRoom() {
  const { style: sp, setId = '' } = useParams();
  const style = styleFromPath(sp);
  if (!style) return <div className="ln-page"><TopBack title="Ôn thi" to="/on-thi" /><EmptyState title="Không có trang này" /></div>;
  return <Room style={style} setId={setId} />;
}

function Room({ style, setId }: { style: OnThiStyle; setId: string }) {
  const me = useMe();
  const settings = resolveSettings(me);
  const nav = useNavigate();
  const qc = useQueryClient();
  const svc = useOnThiService();
  const cards = useOnThiCards(style);
  const card = (cards.data ?? []).find((c) => c.setId === setId);
  const base = `/on-thi/${STYLE_PATH[style]}`;

  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [s, setS] = useState<OnThiSession | null>(null);
  const [idx, setIdx] = useState(0);
  const [resp, setResp] = useState<Record<string, AnyResponse>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [nudge, setNudge] = useState<string | null>(null);
  const skew = useRef(0);
  const msRef = useRef<Record<string, number>>({});
  const enteredAt = useRef(Date.now());
  const pending = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const sess = await svc.start(setId);
      skew.current = Date.parse(sess.serverNow) - Date.now();
      const r: Record<string, AnyResponse> = {};
      for (const [id, a] of Object.entries(sess.answers)) {
        if (a.response !== null && a.response !== undefined) r[id] = a.response;
        msRef.current[id] = a.ms;
      }
      setS(sess);
      setResp(r);
      // Kiểu VioEdu: tiếp tục ở câu đầu tiên chưa làm.
      if (sess.style === 'vio') {
        const first = sess.items.findIndex((it) => !answered(it, r[it.id]));
        setIdx(first < 0 ? 0 : first);
      }
      enteredAt.current = Date.now();
      setPhase('taking');
      void qc.invalidateQueries({ queryKey: onThiKeys.cards(style) });
    } catch (e) {
      setErr(errText(e));
      setPhase('error');
    }
  }, [svc, setId, qc, style]);

  // Lần đầu: có bài đang làm dở → vào thẳng; chưa có → màn quy định.
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || cards.isPending) return;
    decided.current = true;
    if (cards.isError) { setErr(errText(cards.error)); setPhase('error'); return; }
    if (!card) { setErr('Không tìm thấy bài luyện này.'); setPhase('error'); return; }
    if (card.locked) { setErr(`Em cần đạt bài "${card.lockedBy}" trước nhé.`); setPhase('error'); return; }
    if (card.inProgress) void load();
    else setPhase('intro');
  }, [cards.isPending, cards.isError, cards.error, card, load]);

  const items = s?.items ?? [];
  const cur = items[idx];
  const deadline = s ? Date.parse(s.deadlineAt) - skew.current : 0;
  const left = deadline - now;
  const totalMs = s ? s.minutes * 60_000 : 1;

  /* ---------- lưu ---------- */
  const flush = useCallback(async () => {
    if (!s) return;
    const ids = [...pending.current];
    if (!ids.length) return;
    setSaveState('saving');
    try {
      for (const id of ids) {
        await svc.saveAnswer(s.attemptId, id, { response: resp[id] ?? null, ms: msRef.current[id] ?? 0 });
        pending.current.delete(id);
      }
      setSaveState('saved');
    } catch {
      setSaveState('offline');
    }
  }, [s, svc, resp]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    if (phase !== 'taking' || !pending.current.size) return;
    const t = window.setTimeout(() => void flushRef.current(), 700);
    return () => window.clearTimeout(t);
  }, [resp, phase]);
  const touch = (id: string) => pending.current.add(id);

  const leaveQuestion = useCallback(() => {
    if (!cur) return;
    msRef.current[cur.id] = (msRef.current[cur.id] ?? 0) + (Date.now() - enteredAt.current);
    enteredAt.current = Date.now();
    touch(cur.id);
  }, [cur]);
  const goto = (i: number) => {
    if (!s || i < 0 || i >= items.length || i === idx) return;
    leaveQuestion();
    setIdx(i);
    sfx.tap();
  };

  /* ---------- đồng hồ, tự nộp ---------- */
  useEffect(() => {
    if (phase !== 'taking') return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [phase]);

  const submit = useCallback(async () => {
    if (!s || submitting) return;
    setSubmitting(true);
    leaveQuestion();
    try {
      await flushRef.current();
      const r = await svc.submit(s.attemptId);
      void qc.invalidateQueries({ queryKey: onThiKeys.all });
      qc.setQueryData(onThiKeys.result(r.attemptId), r);
      sfx.correct();
      nav(`${base}/ket-qua/${r.attemptId}`, { replace: true });
    } catch (e) {
      setConfirm(false);
      setNudge(errText(e, 'Chưa nộp được bài. Em kiểm tra mạng rồi bấm Nộp bài lần nữa nhé.'));
    } finally {
      setSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, submitting, svc, leaveQuestion, qc, nav, base]);
  const warned = useRef<Record<number, boolean>>({});
  useEffect(() => {
    if (phase !== 'taking' || !s) return;
    if (left <= 0) { void submit(); return; }
    for (const m of [5, 1]) if (left <= m * 60_000 && !warned.current[m] && s.minutes > m) { warned.current[m] = true; setNudge(`Còn ${m} phút nữa. Em kiểm tra lại các câu chưa làm nhé!`); }
  }, [left, phase, s, submit]);

  /* ---------- Caps Lock ---------- */
  useEffect(() => {
    if (phase !== 'taking') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
      if (typeof e.getModifierState === 'function' && e.getModifierState('CapsLock')) setNudge('Phím Caps Lock đang bật: chữ sẽ thành chữ in hoa. Em tắt Caps Lock rồi gõ lại nhé.');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  /* ---------- giao diện ---------- */
  if (phase === 'loading') return <LoadingScreen label="Đang mở bài luyện" />;
  if (phase === 'error') return <ErrorState message={err} onRetry={() => nav(base)} extra={null} />;
  if (phase === 'intro' && card) return <Intro style={style} title={card.title} questions={card.questions} minutes={card.minutes} points={card.points} passScore={card.passScore} maxScore={card.maxScore} onStart={() => { sfx.tap(); void load(); }} back={base} />;
  if (!s || !cur) return <ErrorState message="Bài luyện chưa có câu hỏi." onRetry={() => nav(base)} />;

  const doneCount = items.filter((it) => answered(it, resp[it.id])).length;
  const low = left < 60_000 * Math.min(5, Math.max(1, s.minutes / 6));
  const onChange = (v: AnyResponse) => { setResp((r) => ({ ...r, [cur.id]: v })); touch(cur.id); if (skipped[cur.id]) setSkipped((x) => ({ ...x, [cur.id]: false })); };

  /* ----- VioEdu: câu tiếp / bỏ qua ----- */
  const nextVio = (skip: boolean) => {
    if (skip && !answered(cur, resp[cur.id])) setSkipped((x) => ({ ...x, [cur.id]: true }));
    for (let i = idx + 1; i < items.length; i++) if (!answered(items[i], resp[items[i].id])) return goto(i);
    for (let i = 0; i < idx; i++) {
      if (!answered(items[i], resp[items[i].id])) {
        setNudge('Em quay lại các câu đã bỏ qua nhé.');
        return goto(i);
      }
    }
    leaveQuestion();
    setConfirm(true);
  };

  const bar = (
    <header className={`ln-ex-bar ln-ot-bar ln-ot-bar--${style}`}>
      <span className="ln-ex-bar__title">{s.title}</span>
      <span className={`ln-ex-clock ${low ? 'is-low' : ''}`} role="timer" aria-label={`Còn ${fmtClock(left)}`}><Icon name="clock" size={22} /> {fmtClock(left)}</span>
      <span className="ln-ex-save" aria-live="polite">{saveState === 'saving' ? 'Đang lưu…' : saveState === 'saved' ? 'Đã lưu' : saveState === 'offline' ? 'Chưa lưu được — máy thử lại' : ''}</span>
      <Button size="md" variant="secondary" onClick={() => { leaveQuestion(); setConfirm(true); }} data-testid="onthi-submit-open">Nộp bài</Button>
    </header>
  );
  const head = (
    <div className="ln-ex-q__head">
      <span className="ln-ex-q__no">Câu {idx + 1}<small>/{items.length}</small></span>
      <span className="ln-ex-q__pts">{fmtScore(s.points)} điểm</span>
      <span className="ln-ot-qtype">{typeLabel(cur.type)}</span>
    </div>
  );
  const body = (
    <div className="ln-ex-q__body">
      <ActivityView key={cur.id} item={cur} value={resp[cur.id]} onChange={onChange} bigText={settings.bigText} />
    </div>
  );

  return (
    <div className={`ln-ex-take ln-ot-room ln-ot-room--${style}`}>
      {bar}
      {style === 'vio' ? <PaceBar usedMs={totalMs - Math.max(0, left)} totalMs={totalMs} done={doneCount} total={items.length} /> : null}
      {nudge ? <div className="ln-alert ln-ex-nudge" role="status" onClick={() => setNudge(null)}><Icon name="hint" size={22} /> {nudge}</div> : null}
      {style === 'tn' ? (
        <div className="ln-ex-main">
          <section className="ln-ex-q" aria-label={`Câu ${idx + 1}`}>
            {head}
            {body}
            <footer className="ln-ex-q__nav">
              <Button size="lg" variant="secondary" disabled={idx === 0} icon={<Icon name="back" size={24} />} onClick={() => goto(idx - 1)}>Câu trước</Button>
              {idx < items.length - 1
                ? <Button size="lg" onClick={() => goto(idx + 1)} data-testid="onthi-next">Câu tiếp <Icon name="next" size={24} /></Button>
                : <Button size="lg" onClick={() => { leaveQuestion(); setConfirm(true); }}>Xong — Nộp bài</Button>}
            </footer>
          </section>
          <aside className="ln-ex-nav" aria-label="Bảng câu hỏi">
            <p className="ln-ex-nav__sum">Đã làm <b>{doneCount}</b>/{items.length}</p>
            <div className="ln-ex-grid ln-ot-grid">
              {items.map((it, i) => (
                <button key={it.id} type="button" onClick={() => goto(i)} aria-current={i === idx ? 'step' : undefined}
                  aria-label={`Câu ${i + 1}${answered(it, resp[it.id]) ? ', đã làm' : ', chưa làm'}`}
                  className={`${answered(it, resp[it.id]) ? 'is-done' : ''} ${i === idx ? 'is-cur' : ''}`}>{i + 1}</button>
              ))}
            </div>
            <p className="ln-ex-legend"><i className="is-done" /> đã làm</p>
          </aside>
        </div>
      ) : (
        <div className="ln-ot-vio">
          <section className="ln-ex-q" aria-label={`Câu ${idx + 1}`}>
            {head}
            {body}
            <footer className="ln-ex-q__nav">
              <Button size="lg" variant="secondary" onClick={() => nextVio(true)} data-testid="onthi-skip">Bỏ qua</Button>
              <Button size="lg" disabled={!answered(cur, resp[cur.id])} onClick={() => nextVio(false)} data-testid="onthi-next">Câu tiếp <Icon name="next" size={24} /></Button>
            </footer>
          </section>
          <p className="ln-ot-vio__dots" aria-label={`Đã làm ${doneCount} trên ${items.length} câu`}>
            {items.map((it, i) => <span key={it.id} className={`${answered(it, resp[it.id]) ? 'is-done' : skipped[it.id] ? 'is-skip' : ''}${i === idx ? ' is-cur' : ''}`} />)}
          </p>
        </div>
      )}
      {confirm ? (
        <div className="ln-ex-scrim" role="dialog" aria-modal="true" aria-label="Nộp bài">
          <div className="ln-ex-confirm">
            <Mascot id="nghe" mood="think" size={90} title="" />
            <h2 className="ln-h2">Em nộp bài nhé?</h2>
            <p>Em đã làm <b>{doneCount}</b>/{items.length} câu.{items.length - doneCount > 0 ? <> Còn <b>{items.length - doneCount}</b> câu chưa làm.</> : null}</p>
            <p className="ln-ex-hint">Còn {fmtClock(left)}. Nộp rồi thì không sửa được nữa.</p>
            <div className="ln-ex-introact">
              <Button size="lg" variant="secondary" onClick={() => { enteredAt.current = Date.now(); setConfirm(false); }}>Làm tiếp</Button>
              <Button size="lg" disabled={submitting} onClick={() => void submit()} data-testid="onthi-submit">{submitting ? 'Đang nộp…' : 'Nộp bài'}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Thanh nhịp (kiểu VioEdu): thời gian đã dùng so với số câu đã làm. */
function PaceBar({ usedMs, totalMs, done, total }: { usedMs: number; totalMs: number; done: number; total: number }) {
  const t = Math.min(1, Math.max(0, usedMs / totalMs));
  const p = total ? done / total : 0;
  const slow = t - p > 0.08 && usedMs > 20_000;
  return (
    <div className={`ln-ot-pace${slow ? ' is-slow' : ''}`} role="img" aria-label={slow ? 'Em đang chậm hơn nhịp' : 'Em đang đúng nhịp'}>
      <span className="ln-ot-pace__track"><span className="ln-ot-pace__time" style={{ width: `${t * 100}%` }} /><span className="ln-ot-pace__mark" style={{ left: `${p * 100}%` }} /></span>
      <span className="ln-ot-pace__label"><Icon name="bolt" size={18} /> {slow ? 'Chậm hơn nhịp — câu khó thì bỏ qua' : 'Đúng nhịp'}</span>
    </div>
  );
}

const fold = (x: string) => x.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Màn quy định trước khi làm bài (theo kiểu thi) + ô gõ thử bộ gõ tiếng Việt. */
function Intro({ style, title, questions, minutes, points, passScore, maxScore, onStart, back }: {
  style: OnThiStyle; title: string; questions: number; minutes: number; points: number; passScore: number; maxScore: number; onStart: () => void; back: string;
}) {
  const [typed, setTyped] = useState('');
  const [caps, setCaps] = useState(false);
  const target = 'Trạng nguyên';
  const ok = useMemo(() => fold(typed) === fold(target), [typed]);
  const tried = typed.trim().length >= target.length - 2;
  return (
    <div className={`ln-page ln-ot ln-ot--${style}`}>
      <TopBack title={styleTitle(style)} to={back} />
      <div className="ln-ex-introcard ln-ot-intro">
        <StyleArt style={style} size={92} />
        <h1 className="ln-h1">{title}</h1>
        <p className="ln-ex-meta"><span><Icon name="book" size={22} /> {questions} câu</span><span><Icon name="clock" size={22} /> {minutes} phút</span><span><Icon name="star" size={22} /> {fmtScore(maxScore)} điểm</span></p>
        <ul className="ln-ex-rules">
          {style === 'tn' ? (
            <>
              <li>Mỗi câu <b>{fmtScore(points)} điểm</b>. Câu có nhiều ý (ghép cặp, xếp nhóm, điền nhiều chỗ) phải làm <b>đúng hết</b> mới được điểm.</li>
              <li>Em làm câu nào trước cũng được: bấm số câu ở bảng bên cạnh.</li>
              <li>Đạt từ <b>{fmtScore(passScore)}</b> điểm là qua bài. Bằng điểm thì bạn làm nhanh hơn xếp trên.</li>
              <li>Bài tự lưu. Hết giờ, máy tự nộp bài giúp em.</li>
            </>
          ) : (
            <>
              <li>Mỗi câu <b>{fmtScore(points)} điểm</b>, làm sai không bị trừ điểm.</li>
              <li>Mỗi lần một câu. Câu khó thì bấm <b>Bỏ qua</b>, làm hết rồi máy đưa em quay lại.</li>
              <li>Câu có ô vuông <b>“Em có thể chọn nhiều đáp án”</b>: em chọn đủ mọi đáp án đúng, thiếu hay thừa đều mất điểm.</li>
              <li>Bằng điểm thì bạn nhanh hơn, rồi bạn ít câu sai hơn xếp trên. Đừng đoán bừa!</li>
            </>
          )}
        </ul>
        {style === 'tn' ? (
          <div className="ln-ot-typing">
            <label htmlFor="ot-typing">Gõ thử chữ có dấu: <b>{target}</b></label>
            <input id="ot-typing" className="ln-ot-typing__input" value={typed} autoComplete="off" spellCheck={false} placeholder={target}
              onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => setCaps(typeof e.getModifierState === 'function' && e.getModifierState('CapsLock'))} />
            {caps ? <p className="ln-ot-typing__msg is-try">Phím Caps Lock đang bật. Em tắt đi rồi gõ lại nhé.</p>
              : ok ? <p className="ln-ot-typing__msg is-ok"><Icon name="check" size={18} /> Bộ gõ tiếng Việt của em đã đúng.</p>
                : tried ? <p className="ln-ot-typing__msg is-try">Chữ chưa đúng dấu. Trên máy tính, em bật bộ gõ tiếng Việt kiểu Telex rồi gõ: Trangj nguyeen.</p>
                  : <p className="ln-ot-typing__msg">Khi thi thật trên máy tính, em cần bộ gõ tiếng Việt (Telex) và tắt Caps Lock.</p>}
          </div>
        ) : null}
        <Button size="xl" icon={<Icon name="play" size={30} />} onClick={onStart} data-testid="onthi-start">Bắt đầu làm bài</Button>
      </div>
    </div>
  );
}
