/**
 * Làm bài kiểm tra trực tuyến: màn nội quy → làm bài (đồng hồ cả bài, bảng câu, đánh dấu xem lại, tự lưu) → nộp → kết quả
 * (theo cài đặt của cô). Chống gian lận NHẸ, thân thiện: ghi lại rời màn hình / thoát toàn màn hình / chặn dán ở ô gõ /
 * mở trùng — chỉ để cô xem, không trừ điểm, không doạ em.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { AnyResponse, ExamSession, ExamStudentResult, IntegrityEvent, Item } from '@openedu/contracts';
import { examKeys, useExamService, useMyExamResult } from '@openedu/data';
import { ActivityView, isComplete } from '@openedu/activity-engine';
import { Button, Confetti, Icon, Mascot, MascotBubble, SpeakButton, sfx } from '@openedu/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { errText, resolveSettings, useMe } from '../../lib/util';
import './exam.css';

type Phase = 'loading' | 'intro' | 'taking' | 'done' | 'error';

function newSessionId(): string {
  const a = new Uint32Array(3);
  (window.crypto ?? { getRandomValues: (x: Uint32Array) => x.map(() => Math.floor(Math.random() * 2 ** 32)) }).getRandomValues(a);
  return Array.from(a, (x) => x.toString(36)).join('-').padEnd(12, '0');
}
const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const canFullscreen = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && !/iPhone|iPod/.test(navigator.userAgent);
const answered = (it: Item | undefined, r: AnyResponse | undefined) => {
  if (!it || r === undefined || r === null) return false;
  try { return isComplete(it, r); } catch { return true; }
};

export default function ExamPage() {
  const { examId = '' } = useParams();
  const me = useMe();
  const settings = resolveSettings(me);
  const nav = useNavigate();
  const qc = useQueryClient();
  const svc = useExamService();
  const sessionId = useMemo(newSessionId, []);
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [s, setS] = useState<ExamSession | null>(null);
  const [idx, setIdx] = useState(0);
  const [resp, setResp] = useState<Record<string, AnyResponse>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [other, setOther] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ExamStudentResult | null>(null);
  const [now, setNow] = useState(Date.now());
  const [nudge, setNudge] = useState<string | null>(null);
  const skew = useRef(0);
  const msRef = useRef<Record<string, number>>({});
  const enteredAt = useRef(Date.now());
  const pending = useRef<Map<string, number>>(new Map());
  const evQueue = useRef<IntegrityEvent[]>([]);
  const myResult = useMyExamResult(phase === 'done' && !result ? examId : undefined);

  /* ---------- tải ---------- */
  const load = useCallback(async () => {
    try {
      const sess = await svc.startExam(examId, sessionId);
      skew.current = Date.parse(sess.serverNow) - Date.now();
      setS(sess);
      const r: Record<string, AnyResponse> = {};
      const f: Record<string, boolean> = {};
      for (const [id, a] of Object.entries(sess.answers)) { if (a.response !== null && a.response !== undefined) r[id] = a.response; if (a.flagged) f[id] = true; msRef.current[id] = a.ms; }
      setResp(r); setFlags(f); setOther(sess.otherSession);
      if (sess.status === 'submitted') setPhase('done');
      else { enteredAt.current = Date.now(); setPhase('taking'); }
    } catch (e) {
      setErr(errText(e)); setPhase('error');
    }
  }, [examId, sessionId, svc]);

  // Lần đầu: chỉ xem trước (không tạo lần làm) — dùng danh sách đề trên Hôm nay; bắt đầu thật khi bấm.
  const [intro, setIntro] = useState<{ title: string; durationMin: number; questions: number } | null>(null);
  useEffect(() => {
    let off = false;
    svc.listMyExams(me.id).then((list) => {
      if (off) return;
      const c = list.find((x) => x.examId === examId);
      if (!c) { setErr('Không tìm thấy bài kiểm tra này.'); setPhase('error'); return; }
      if (c.state === 'in-progress' || c.state === 'submitted') { void load(); return; }
      if (c.state !== 'open') { setErr(c.state === 'upcoming' ? 'Bài kiểm tra chưa mở. Em quay lại sau nhé.' : 'Bài kiểm tra đã đóng.'); setPhase('error'); return; }
      setIntro({ title: c.title, durationMin: c.durationMin, questions: c.questions });
      setPhase('intro');
    }).catch((e) => { if (!off) { setErr(errText(e)); setPhase('error'); } });
    return () => { off = true; };
  }, [examId, me.id, svc, load]);

  const items = s?.items ?? [];
  const cur = items[idx];
  const deadline = s ? Date.parse(s.deadlineAt) - skew.current : 0;
  const left = deadline - now;

  /* ---------- lưu ---------- */
  const flush = useCallback(async () => {
    if (!s) return;
    const ids = [...pending.current.keys()];
    if (!ids.length) return;
    setSaveState('saving');
    try {
      for (const id of ids) {
        await svc.saveAnswer(s.attemptId, id, { response: resp[id] ?? null as unknown as AnyResponse, ms: msRef.current[id] ?? 0, flagged: !!flags[id] });
        pending.current.delete(id);
      }
      setSaveState('saved');
    } catch {
      setSaveState('offline');
    }
  }, [s, svc, resp, flags]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    if (phase !== 'taking' || !pending.current.size) return;
    const t = window.setTimeout(() => void flushRef.current(), 700);
    return () => window.clearTimeout(t);
  }, [resp, flags, phase]);
  const touch = (id: string) => pending.current.set(id, Date.now());

  /* ---------- thời gian ở mỗi câu ---------- */
  const leaveQuestion = useCallback(() => {
    if (!cur) return;
    msRef.current[cur.id] = (msRef.current[cur.id] ?? 0) + (Date.now() - enteredAt.current);
    enteredAt.current = Date.now();
  }, [cur]);
  const goto = (i: number) => {
    if (!s || i < 0 || i >= items.length || i === idx) return;
    leaveQuestion();
    if (cur && resp[cur.id] !== undefined) touch(cur.id);
    setIdx(i);
    sfx.tap();
  };

  /* ---------- đồng hồ, nhịp, tự nộp ---------- */
  useEffect(() => {
    if (phase !== 'taking') return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'taking' || !s) return;
    const beat = () => {
      const ev = evQueue.current.splice(0);
      if (ev.length) svc.logIntegrity(s.attemptId, ev).catch(() => { evQueue.current.unshift(...ev); });
      svc.heartbeat(s.attemptId, sessionId).then((h) => setOther(h.otherSession)).catch(() => undefined);
    };
    const t = window.setInterval(beat, 20_000);
    return () => window.clearInterval(t);
  }, [phase, s, svc, sessionId]);

  const submit = useCallback(async () => {
    if (!s || submitting) return;
    setSubmitting(true);
    leaveQuestion();
    if (cur && resp[cur.id] !== undefined) touch(cur.id);
    try {
      await flushRef.current();
      const ev = evQueue.current.splice(0);
      if (ev.length) await svc.logIntegrity(s.attemptId, ev).catch(() => undefined);
      const r = await svc.submitExam(s.attemptId);
      setResult(r);
      setPhase('done');
      setConfirm(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      void qc.invalidateQueries({ queryKey: examKeys.mine(me.id) });
      sfx.correct();
    } catch (e) {
      setNudge(errText(e, 'Chưa nộp được bài. Em kiểm tra mạng rồi bấm Nộp bài lần nữa nhé.'));
    } finally {
      setSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, submitting, cur, resp, svc, leaveQuestion, qc, me.id]);
  const warned = useRef<Record<number, boolean>>({});
  useEffect(() => {
    if (phase !== 'taking' || !s) return;
    if (left <= 0) { void submit(); return; }
    for (const m of [5, 1]) if (left <= m * 60_000 && !warned.current[m] && s.exam.durationMin > m) { warned.current[m] = true; setNudge(`Còn ${m} phút nữa. Em xem lại các câu đánh dấu nhé!`); }
  }, [left, phase, s, submit]);

  /* ---------- chống gian lận nhẹ ---------- */
  useEffect(() => {
    if (phase !== 'taking') return;
    let leftAt: number | null = null;
    let kind: 'hidden' | 'blur' = 'blur';
    let blurTimer = 0;
    const away = (k: 'hidden' | 'blur') => {
      if (leftAt !== null) { if (k === 'hidden') kind = 'hidden'; return; }
      leftAt = Date.now(); kind = k;
    };
    const back = () => {
      if (leftAt === null) return;
      const ms = Date.now() - leftAt;
      if (ms >= 800) evQueue.current.push({ kind, at: new Date(leftAt).toISOString(), awayMs: ms, ...(cur ? { itemId: cur.id } : {}) });
      leftAt = null;
      enteredAt.current += ms; // không tính thời gian rời màn hình vào câu đang làm
    };
    const onVis = () => (document.visibilityState === 'hidden' ? away('hidden') : back());
    const onBlur = () => { blurTimer = window.setTimeout(() => away('blur'), 300); };
    const onFocus = () => { window.clearTimeout(blurTimer); back(); };
    const onFs = () => { if (!document.fullscreenElement) evQueue.current.push({ kind: 'fullscreen-exit', at: new Date().toISOString() }); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFs);
      window.clearTimeout(blurTimer);
    };
  }, [phase, cur]);
  /** Ô gõ chữ: không dán / kéo thả chữ vào, không sao chép đề. */
  const blockPaste = (e: React.ClipboardEvent | React.DragEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    if (e.type === 'paste' || e.type === 'drop') {
      evQueue.current.push({ kind: 'paste-blocked', at: new Date().toISOString(), ...(cur ? { itemId: cur.id } : {}) });
      setNudge('Em tự gõ câu trả lời nhé!');
    }
  };

  const start = async (fullscreen: boolean) => {
    sfx.tap();
    if (fullscreen && canFullscreen()) await document.documentElement.requestFullscreen().catch(() => undefined);
    setPhase('loading');
    await load();
  };

  /* ---------- giao diện ---------- */
  if (phase === 'loading') return <LoadingScreen label="Đang mở bài kiểm tra" />;
  if (phase === 'error') return <ErrorState message={err} onRetry={() => nav('/')} extra={null} />;

  if (phase === 'intro' && intro) {
    return (
      <div className="ln-page ln-ex-intro">
        <TopBack title="Bài kiểm tra" />
        <div className="ln-ex-introcard">
          <Mascot id="nghe" mood="wave" size={110} title="" />
          <h1 className="ln-h1">{intro.title}</h1>
          <p className="ln-ex-meta"><span><Icon name="book" size={22} /> {intro.questions} câu</span><span><Icon name="clock" size={22} /> {intro.durationMin} phút</span></p>
          <ul className="ln-ex-rules">
            <li>Đồng hồ chạy cho cả bài. Hết giờ, máy tự nộp bài giúp em.</li>
            <li>Em làm câu nào trước cũng được. Câu chưa chắc, bấm <b>Xem lại sau</b>.</li>
            <li>Bài tự lưu sau mỗi câu. Lỡ tắt máy, em mở lại là làm tiếp.</li>
            <li>Em ở lại trong bài và tự làm nhé. Máy ghi lại nếu em rời màn hình để cô biết.</li>
            <li>Em chỉ làm <b>một lần</b>. Làm xong, bấm <b>Nộp bài</b>.</li>
          </ul>
          <SpeakButton text="Đồng hồ chạy cho cả bài. Em làm câu nào trước cũng được. Bài tự lưu. Em ở lại trong bài và tự làm nhé. Làm xong bấm Nộp bài." label="Nghe đọc nội quy" />
          <div className="ln-ex-introact">
            {canFullscreen() ? <Button size="xl" icon={<Icon name="play" size={30} />} onClick={() => void start(true)}>Bắt đầu (toàn màn hình)</Button> : null}
            <Button size="xl" variant={canFullscreen() ? 'secondary' : 'primary'} icon={canFullscreen() ? undefined : <Icon name="play" size={30} />} onClick={() => void start(false)}>{canFullscreen() ? 'Bắt đầu' : 'Bắt đầu làm bài'}</Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const r = result ?? myResult.data ?? null;
    return (
      <div className="ln-page ln-ex-done">
        <TopBack title={s?.exam.title ?? 'Bài kiểm tra'} />
        <Confetti show={!!(r?.released && (r.score10 ?? 0) >= 5)} />
        <div className="ln-ex-introcard">
          <MascotBubble mascot="nghe" mood="happy">{r?.released ? 'Em đã hoàn thành bài kiểm tra!' : 'Em đã nộp bài rồi. Cô sẽ báo điểm sau nhé!'}</MascotBubble>
          {r?.released && r.score10 ? (
            <>
              <div className="ln-ex-score" aria-label={`Điểm ${r.score10}`}><b>{r.score10}</b><span>điểm</span></div>
              <p className="ln-ex-meta"><span>Em làm đúng {r.correct}/{r.total} câu.</span></p>
              <div className="ln-ex-pq" aria-label="Từng câu">{r.perQuestion?.map((q) => <span key={q.no} className={q.correct ? 'is-ok' : 'is-try'}>{q.no}{q.correct ? <Icon name="check" size={14} /> : null}</span>)}</div>
              <p className="ln-ex-hint">Câu màu cam là câu em cần ôn thêm. Mình cùng luyện ở mục Học nhé!</p>
            </>
          ) : !r && myResult.isLoading ? <p>Đang tải…</p> : null}
          <Button size="lg" onClick={() => nav('/')}>Về trang Hôm nay</Button>
        </div>
      </div>
    );
  }

  if (!s || !cur) return <ErrorState message="Bài kiểm tra chưa có câu hỏi." onRetry={() => nav('/')} />;
  const done = items.filter((it) => answered(it, resp[it.id])).length;
  const flaggedCount = items.filter((it) => flags[it.id]).length;
  const low = left < 5 * 60_000;
  return (
    <div className="ln-ex-take" onPaste={blockPaste} onDrop={blockPaste} onCopy={blockPaste} onCut={blockPaste}>
      <header className="ln-ex-bar">
        <span className="ln-ex-bar__title">{s.exam.title}</span>
        <span className={`ln-ex-clock ${low ? 'is-low' : ''}`} role="timer" aria-label={`Còn ${fmtClock(left)}`}><Icon name="clock" size={22} /> {fmtClock(left)}</span>
        <span className="ln-ex-save" aria-live="polite">{saveState === 'saving' ? 'Đang lưu…' : saveState === 'saved' ? 'Đã lưu' : saveState === 'offline' ? 'Chưa lưu được — máy thử lại' : ''}</span>
        <Button size="md" variant="secondary" onClick={() => { leaveQuestion(); setConfirm(true); }}>Nộp bài</Button>
      </header>
      {other ? <div className="ln-alert ln-ex-other" role="status"><Icon name="hint" size={22} /> Bài này đang mở ở máy hoặc tab khác. Em chỉ làm ở một nơi thôi nhé.</div> : null}
      {nudge ? <div className="ln-alert ln-ex-nudge" role="status" onClick={() => setNudge(null)}><Icon name="hint" size={22} /> {nudge}</div> : null}
      <div className="ln-ex-main">
        <section className="ln-ex-q" aria-label={`Câu ${idx + 1}`}>
          <div className="ln-ex-q__head">
            <span className="ln-ex-q__no">Câu {idx + 1}<small>/{items.length}</small></span>
            <span className="ln-ex-q__pts">{String(s.points[cur.id] ?? 1).replace('.', ',')} điểm</span>
            <button type="button" className={`ln-ex-flag ${flags[cur.id] ? 'is-on' : ''}`} aria-pressed={!!flags[cur.id]} onClick={() => { setFlags((f) => ({ ...f, [cur.id]: !f[cur.id] })); touch(cur.id); sfx.tap(); }}>
              <Icon name="star" size={20} /> {flags[cur.id] ? 'Đã đánh dấu' : 'Xem lại sau'}
            </button>
          </div>
          <div className="ln-ex-q__body">
            <ActivityView key={cur.id} item={cur} value={resp[cur.id]} onChange={(v) => { setResp((r) => ({ ...r, [cur.id]: v })); touch(cur.id); }} bigText={settings.bigText} />
          </div>
          <footer className="ln-ex-q__nav">
            <Button size="lg" variant="secondary" disabled={idx === 0} icon={<Icon name="back" size={24} />} onClick={() => goto(idx - 1)}>Câu trước</Button>
            {idx < items.length - 1
              ? <Button size="lg" onClick={() => goto(idx + 1)}>Câu tiếp <Icon name="next" size={24} /></Button>
              : <Button size="lg" onClick={() => { leaveQuestion(); setConfirm(true); }}>Xong — Nộp bài</Button>}
          </footer>
        </section>
        <aside className="ln-ex-nav" aria-label="Bảng câu hỏi">
          <p className="ln-ex-nav__sum">Đã làm <b>{done}</b>/{items.length}</p>
          <div className="ln-ex-grid">
            {items.map((it, i) => (
              <button key={it.id} type="button" onClick={() => goto(i)} aria-current={i === idx ? 'step' : undefined}
                aria-label={`Câu ${i + 1}${answered(it, resp[it.id]) ? ', đã làm' : ', chưa làm'}${flags[it.id] ? ', xem lại sau' : ''}`}
                className={`${answered(it, resp[it.id]) ? 'is-done' : ''} ${flags[it.id] ? 'is-flag' : ''} ${i === idx ? 'is-cur' : ''}`}>{i + 1}</button>
            ))}
          </div>
          <p className="ln-ex-legend"><i className="is-done" /> đã làm <i className="is-flag" /> xem lại</p>
        </aside>
      </div>
      {confirm ? (
        <div className="ln-ex-scrim" role="dialog" aria-modal="true" aria-label="Nộp bài">
          <div className="ln-ex-confirm">
            <Mascot id="nghe" mood="think" size={90} title="" />
            <h2 className="ln-h2">Em nộp bài nhé?</h2>
            <p>Em đã làm <b>{done}</b>/{items.length} câu.{items.length - done > 0 ? <> Còn <b>{items.length - done}</b> câu chưa làm.</> : null}{flaggedCount ? <> Có <b>{flaggedCount}</b> câu đánh dấu xem lại.</> : null}</p>
            <p className="ln-ex-hint">Còn {fmtClock(left)}. Nộp rồi thì không sửa được nữa.</p>
            <div className="ln-ex-introact">
              <Button size="lg" variant="secondary" onClick={() => { enteredAt.current = Date.now(); setConfirm(false); }}>Làm tiếp</Button>
              <Button size="lg" disabled={submitting} onClick={() => void submit()}>{submitting ? 'Đang nộp…' : 'Nộp bài'}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
