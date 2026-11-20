import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { MascotId, SubmissionDetail, WorkTask } from '@openedu/contracts';
import { compressWorkImage, usePassport, useRemediationSets, useRequestAiGrade, useStudentProfile, useSubmission, useSubmissions, useSubmitWork, useWorkTask } from '@openedu/data';
import { Button, Confetti, Icon, Mascot, MascotBubble, SpeakButton, StarShape, sfx, usePrefersReducedMotion } from '@openedu/ui';
import { ErrorState, LoadingScreen, TopBack } from '../components/Common';
import { LevelSticker } from '../components/WorkCards';
import { remPath } from '../lib/remediation';
import { useUi } from '../lib/store';
import { dayLabel, dueLabel, errText, resolveSettings, safeGet, safeSet, timeLabel, useMe } from '../lib/util';
import { cap, clearDraft, draftKey, isSeen, LEVEL_CHEER, LEVEL_STARS, markSeen, rotateDataUrl, splitFeedback, teacherWord, weakSet, wordCount, workState } from '../lib/work';
import '../styles/work.css';

const MAX_PAGES = 4;

export default function WorkPage() {
  const { taskId = '' } = useParams();
  const me = useMe();
  const taskQ = useWorkTask(taskId);
  const subsQ = useSubmissions({ taskId, studentId: me.id });
  const mascot: MascotId = usePassport(me.id).data?.companion ?? me.avatarMascot;
  const tw = teacherWord(useStudentProfile(me.id).data?.class?.teacherName);
  const [justSent, setJustSent] = useState(false);

  if (taskQ.isPending || subsQ.isPending) return <LoadingScreen label="Đang mở bài" mascot={mascot} />;
  if (taskQ.isError || subsQ.isError) return <ErrorState message="Chưa mở được bài viết này." onRetry={() => { void taskQ.refetch(); void subsQ.refetch(); }} mascot={mascot} />;
  const task = taskQ.data;
  if (!task) return <ErrorState title="Không tìm thấy bài" message="Bài viết này không còn nữa. Em về trang Hôm nay nhé." mascot={mascot} />;
  const latest = subsQ.data?.[0];
  const state = workState(latest);

  return (
    <div className="ln-page ln-work">
      <TopBack title={task.title} />
      {justSent ? <Sent mascot={mascot} tw={tw} />
        : state === 'feedback' && latest ? <Feedback subId={latest.id} task={task} mascot={mascot} tw={tw} />
        : state === 'waiting' && latest ? <Waiting sub={latest} task={task} mascot={mascot} tw={tw} />
        : <SubmitForm task={task} redo={state === 'redo' ? latest : undefined} mascot={mascot} tw={tw} onSent={() => setJustSent(true)} />}
    </div>
  );
}

function PromptCard({ task, compact }: { task: WorkTask; compact?: boolean }) {
  const due = task.dueAt ? dueLabel(task.dueAt) : null;
  return (
    <section className={`ln-wprompt k-card${compact ? ' is-compact' : ''}`} aria-labelledby="ln-wprompt-h">
      <div className="ln-wprompt__head">
        <h2 id="ln-wprompt-h" className="ln-wprompt__k"><Icon name="book" size={20} /> Đề bài</h2>
        {due && !compact && <span className={`ln-due${due.late ? ' is-late' : ''}`}><Icon name="clock" size={16} /> {due.text}</span>}
        <SpeakButton text={task.prompt.text} label="Nghe đọc đề bài" showLabel={!compact} />
      </div>
      <p className="ln-wprompt__text">{task.prompt.text}</p>
      {task.prompt.image && <img className="ln-wprompt__img" src={task.prompt.image} alt="Hình của đề bài" />}
    </section>
  );
}

interface Page { id: string; url: string; width: number; height: number }
let pageSeq = 0;

function SubmitForm({ task, redo, mascot, tw, onSent }: { task: WorkTask; redo?: SubmissionDetail; mascot: MascotId; tw: string; onSent: () => void }) {
  const me = useMe();
  const toast = useUi((s) => s.toast);
  const key = draftKey(me.id, task.id);
  const both = task.allowPhoto && task.allowText;
  const [mode, setMode] = useState<'photo' | 'text' | null>(both ? (safeGet(key) ? 'text' : null) : task.allowPhoto ? 'photo' : 'text');
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(() => safeGet(key) ?? redo?.text ?? '');
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const retakeRef = useRef<HTMLInputElement>(null);
  const retakeIdx = useRef(-1);
  const submit = useSubmitWork();
  const grade = useRequestAiGrade();

  useEffect(() => {
    setSaved(false);
    const t = window.setTimeout(() => { if (text.trim()) { safeSet(key, text); setSaved(true); } else clearDraft(key); }, 500);
    return () => window.clearTimeout(t);
  }, [text, key]);

  const load = async (files: File[]): Promise<Page[]> => {
    const out: Page[] = [];
    for (const f of files) { const im = await compressWorkImage(f); out.push({ id: `p${++pageSeq}`, url: im.url, width: im.width, height: im.height }); }
    return out;
  };
  const onAdd = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PAGES - pages.length);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true); setErr(null);
    try { const add = await load(files); setPages((p) => p.concat(add).slice(0, MAX_PAGES)); sfx.correct(); }
    catch (x) { setErr(errText(x, 'Ảnh không mở được. Em chụp lại nhé!')); sfx.tryAgain(); }
    finally { setBusy(false); }
  };
  const onRetake = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; const i = retakeIdx.current;
    e.target.value = '';
    if (!f || i < 0) return;
    setBusy(true); setErr(null);
    try { const [np] = await load([f]); setPages((p) => p.map((x, j) => (j === i ? np : x))); }
    catch (x) { setErr(errText(x, 'Ảnh không mở được. Em chụp lại nhé!')); }
    finally { setBusy(false); }
  };
  const rotate = async (i: number) => {
    sfx.tap();
    try { const r = await rotateDataUrl(pages[i].url); setPages((p) => p.map((x, j) => (j === i ? { ...x, ...r } : x))); }
    catch (x) { toast(errText(x), 'try'); }
  };
  const remove = (i: number) => { sfx.tap(); setPages((p) => p.filter((_, j) => j !== i)); };

  const words = wordCount(text);
  const ready = mode === 'photo' ? pages.length > 0 : mode === 'text' ? words > 0 : false;
  const send = () => {
    if (!ready || !mode) return;
    setErr(null);
    submit.mutate(
      { taskId: task.id, studentId: me.id, submittedBy: 'student', ...(mode === 'text' ? { text: text.trim() } : { images: pages.map((p) => p.url) }) },
      {
        onSuccess: (d) => { clearDraft(key); sfx.fanfare(); grade.mutate(d.id, { onError: () => { /* GV sẽ chấm tay */ } }); onSent(); },
        onError: (x) => { setErr(errText(x, 'Chưa nộp được bài. Em kiểm tra mạng rồi bấm Nộp bài lần nữa nhé!')); sfx.tryAgain(); },
      },
    );
  };

  return (
    <>
      {redo && (
        <MascotBubble mascot={mascot} mood="wave" size={84} className="ln-wredo">
          <span className="ln-wredo__t">{cap(tw)} nhờ em sửa lại bài một chút nhé. Em làm được mà!</span>
          {redo.review?.note && <span className="ln-wredo__note">“{redo.review.note}”</span>}
        </MascotBubble>
      )}
      <PromptCard task={task} />

      {both && (
        <div className="ln-wpick" role="group" aria-label="Em muốn nộp bài bằng cách nào?">
          <button type="button" className={`ln-wpick__b${mode === 'photo' ? ' is-on' : ''}`} aria-pressed={mode === 'photo'} onClick={() => { sfx.tap(); setMode('photo'); }}>
            <span className="ln-wpick__ic"><Icon name="image" size={40} /></span><strong>Chụp ảnh bài làm</strong><span>Bài em viết trên giấy</span>
          </button>
          <button type="button" className={`ln-wpick__b${mode === 'text' ? ' is-on' : ''}`} aria-pressed={mode === 'text'} onClick={() => { sfx.tap(); setMode('text'); }}>
            <span className="ln-wpick__ic"><Icon name="pencil" size={40} /></span><strong>Gõ bài làm</strong><span>Gõ chữ trên máy</span>
          </button>
        </div>
      )}

      <input ref={addRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void onAdd(e)} />
      <input ref={retakeRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onRetake(e)} />

      {mode === 'photo' && (
        <section className="ln-wphotos" aria-label="Ảnh bài làm">
          <p className="ln-whint"><Icon name="hint" size={20} /> Đặt vở chỗ sáng, chụp thẳng, thấy rõ cả trang nhé. Tối đa {MAX_PAGES} trang.</p>
          <div className="ln-wpages">
            {pages.map((p, i) => (
              <div key={p.id} className="ln-wpage">
                <span className="ln-wpage__img"><img src={p.url} alt={`Trang ${i + 1}`} /><span className="ln-wpage__n">Trang {i + 1}</span></span>
                <span className="ln-wpage__acts">
                  <button type="button" className="ln-wact" onClick={() => void rotate(i)}><Icon name="retry" size={22} /> Xoay</button>
                  <button type="button" className="ln-wact" onClick={() => { retakeIdx.current = i; retakeRef.current?.click(); }}><Icon name="image" size={22} /> Chụp lại</button>
                  <button type="button" className="ln-wact ln-wact--soft" onClick={() => remove(i)}><Icon name="trash" size={22} /> Bỏ</button>
                </span>
              </div>
            ))}
            {pages.length < MAX_PAGES && (
              <button type="button" className="ln-wadd" onClick={() => { sfx.tap(); addRef.current?.click(); }} disabled={busy}>
                <Icon name={busy ? 'clock' : 'plus'} size={36} />
                <strong>{busy ? 'Đang xử lí ảnh…' : pages.length ? `Chụp trang ${pages.length + 1}` : 'Chụp trang 1'}</strong>
              </button>
            )}
          </div>
        </section>
      )}

      {mode === 'text' && (
        <section className="ln-wtext">
          <label htmlFor="ln-wtext-ta" className="ln-wtext__l">Bài làm của em</label>
          <textarea id="ln-wtext-ta" className="ln-wtext__ta" value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder="Em gõ bài làm vào đây nhé…" spellCheck={false} />
          <div className="ln-wtext__foot">
            <span className="ln-wtext__wc">{words} chữ</span>
            {saved && <span className="ln-wtext__saved"><Icon name="check" size={16} /> Đã lưu nháp</span>}
          </div>
        </section>
      )}

      {err && <p className="ln-werr" role="alert"><Icon name="hint" size={22} /> {err}</p>}
      {mode && (
        <div className="ln-wsend">
          <Button size="xl" block onClick={send} disabled={!ready || submit.isPending || busy} icon={<Icon name="upload" size={30} />}>
            {submit.isPending ? 'Đang nộp…' : redo ? 'Nộp lại bài' : 'Nộp bài'}
          </Button>
          {!ready && <p className="ln-wsend__hint">{mode === 'photo' ? 'Em chụp ít nhất 1 trang để nộp nhé.' : 'Em gõ bài làm rồi bấm Nộp bài nhé.'}</p>}
        </div>
      )}
    </>
  );
}

function Sent({ mascot, tw }: { mascot: MascotId; tw: string }) {
  const nav = useNavigate();
  return (
    <div className="ln-wsent">
      <Confetti show />
      <Mascot id={mascot} mood="cheer" size={150} animate title="" />
      <h2 className="ln-wsent__t">Em nộp bài rồi!</h2>
      <p className="ln-wsent__p">{cap(tw)} sẽ xem bài của em nhé!</p>
      <SpeakButton text={`Em nộp bài rồi! ${cap(tw)} sẽ xem bài của em nhé!`} size="sm" label="Nghe" />
      <Button size="lg" onClick={() => nav('/')} icon={<Icon name="home" size={24} />}>Về trang Hôm nay</Button>
    </div>
  );
}

function SubmittedWork({ sub }: { sub: SubmissionDetail }) {
  return (
    <div className="ln-wmine">
      {sub.images.length > 0 && <div className="ln-wmine__imgs">{sub.images.map((im, i) => <img key={i} src={im.url} alt={`Trang ${i + 1} bài của em`} loading="lazy" />)}</div>}
      {sub.text && <p className="ln-wmine__text">{sub.text}</p>}
    </div>
  );
}

function Waiting({ sub, task, mascot, tw }: { sub: SubmissionDetail; task: WorkTask; mascot: MascotId; tw: string }) {
  return (
    <>
      <div className="ln-wwait">
        <Mascot id={mascot} mood="happy" size={110} animate title="" />
        <div>
          <p className="ln-wwait__badge"><Icon name="clock" size={20} /> Đang chờ {tw} xem</p>
          <p className="ln-wwait__p">Em đã nộp bài {dayLabel(sub.createdAt).toLowerCase()} lúc {timeLabel(sub.createdAt)}. Khi {tw} xem xong, lời nhận xét sẽ hiện ở đây nhé!</p>
        </div>
      </div>
      <PromptCard task={task} compact />
      <h2 className="ln-h2">Bài em đã nộp</h2>
      <SubmittedWork sub={sub} />
    </>
  );
}

function Feedback({ subId, task, mascot, tw }: { subId: string; task: WorkTask; mascot: MascotId; tw: string }) {
  const me = useMe();
  const nav = useNavigate();
  const q = useSubmission(subId);
  const sets = useRemediationSets(me.id).data;
  const reduced = usePrefersReducedMotion() || resolveSettings(me).reducedMotion;
  const [fresh] = useState(() => !isSeen(subId));
  useEffect(() => { markSeen(subId); if (fresh) sfx.fanfare(); }, [subId, fresh]);

  const sub = q.data;
  if (q.isPending) return <div className="ln-skeleton-list"><i /><i /></div>;
  if (!sub || !sub.final) return <ErrorState message="Chưa tải được lời nhận xét." onRetry={() => void q.refetch()} mascot={mascot} />;
  const f = sub.final;
  const level = f.level;
  const stars = LEVEL_STARS[level];
  const { praise, next } = splitFeedback(f.feedbackStudent);
  const strengths = sub.grade?.strengths ?? [];
  const rem = weakSet(sub, sets);
  const note = sub.review?.note;

  return (
    <>
      <Confetti show={fresh && !reduced && level !== 'C'} />
      <section className={`ln-fb-hero ln-fb-hero--${level}`}>
        <LevelSticker level={level} size="lg" />
        <p className="ln-fb-hero__cheer">{LEVEL_CHEER[level]}</p>
        <div className={`ln-fb-stars${reduced ? '' : ' is-anim'}`} aria-label={`Em nhận được ${stars} sao`}>
          {Array.from({ length: stars }).map((_, i) => <span key={i} className="ln-fb-star" style={{ animationDelay: `${0.25 + i * 0.22}s` }}><StarShape size={48} /></span>)}
          <span className="ln-fb-stars__n">+{stars} sao</span>
        </div>
      </section>

      <MascotBubble mascot={mascot} mood={level === 'C' ? 'happy' : 'cheer'} size={96} className="ln-fb-bubble" animate={!reduced}>
        <span className="ln-fb-bubble__t">{praise}</span>
        <SpeakButton text={f.feedbackStudent} size="sm" label="Nghe lời nhận xét" />
      </MascotBubble>

      {note && <p className="ln-fb-note"><strong>Lời nhắn của {tw}:</strong> {note}</p>}

      {strengths.length > 0 && (
        <section className="ln-fb-card">
          <h2 className="ln-fb-h">Em đã làm tốt</h2>
          <ul className="ln-fb-strengths">{strengths.map((s, i) => <li key={i}><StarShape size={28} /> <span>{s}</span></li>)}</ul>
        </section>
      )}

      {next && (
        <section className="ln-fb-card ln-fb-next">
          <h2 className="ln-fb-h"><Icon name="next" size={24} /> Bước tiếp theo</h2>
          <p className="ln-fb-next__t">{next}</p>
        </section>
      )}

      {rem && (
        <button type="button" className="ln-fb-rem" onClick={() => { sfx.tap(); nav(remPath(rem.id)); }}>
          <span className="ln-fb-rem__ic"><Icon name="puzzle" size={30} /></span>
          <span className="ln-fb-rem__b"><strong>{rem.title}</strong><span>{rem.itemIds.length} câu ngắn · khoảng {rem.minutes} phút — luyện thêm cho chắc nhé!</span></span>
          <Icon name="play" size={26} />
        </button>
      )}

      <details className="ln-fb-mine">
        <summary>Xem lại bài em đã nộp</summary>
        <PromptCard task={task} compact />
        <SubmittedWork sub={sub} />
      </details>
    </>
  );
}
