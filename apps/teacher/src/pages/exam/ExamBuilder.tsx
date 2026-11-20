import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { EXAM_QTYPE_LABEL, type Exam, type ExamMatrix, type ExamShortfall, type ExamSlot, type ExamVariant, type Item, type Profile } from '@openedu/contracts';
import { openSlots, paperPoints, swapSlot, useClasses, useExam, useExamMatrices, useExamService, useItemsByIds, useSaveExam } from '@openedu/data';
import { Btn, Dialog, Empty, ErrorNote, Field, Loading, PageHead, Seg } from '../../components/common';
import { ItemPreview, TypeBadge } from '../../components/items';
import { shorten, toLocalInput } from '../../lib/format';
import { ExamTabs, LevelTag, fmtPoints } from './shared';

const HOUR = 3_600_000;

function draftFrom(m: ExamMatrix, paper: Exam['paper'], classId: string): Exam {
  const open = new Date(Math.ceil(Date.now() / (15 * 60_000)) * 15 * 60_000);
  return {
    id: '', title: `Kiểm tra ${m.title}`, matrixId: m.id, subject: m.subject, grade: m.grade, ...(m.termId ? { termId: m.termId } : {}),
    classId, durationMin: m.durationMin, openAt: open.toISOString(), closeAt: new Date(open.getTime() + 7 * 24 * HOUR).toISOString(),
    resultsPolicy: 'after-release', releasedAt: null, maxAttempts: 1, onlineVariants: 'AB', fullscreenPrompt: true, status: 'draft',
    rows: m.rows.map((r) => ({ id: r.id, label: r.label })), paper,
  };
}

export default function ExamBuilder({ user }: { user: Profile }) {
  const { examId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const svc = useExamService();
  const mq = useExamMatrices();
  const eq = useExam(examId);
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const save = useSaveExam();
  const [exam, setExam] = useState<Exam | null>(null);
  const [shortfalls, setShortfalls] = useState<ExamShortfall[]>([]);
  const [variant, setVariant] = useState<ExamVariant>('A');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [swap, setSwap] = useState<ExamSlot | null>(null);
  const [cands, setCands] = useState<Item[] | null>(null);
  const [preview, setPreview] = useState<Item | null>(null);

  const matrixId = exam?.matrixId ?? sp.get('maTran') ?? '';
  const matrix = mq.data?.find((m) => m.id === matrixId) ?? null;

  const generate = async (m: ExamMatrix, base: Exam | null) => {
    setBusy(true);
    try {
      const r = await svc.generate(m);
      setShortfalls(r.shortfalls);
      const cls = (classes.data ?? []).find((c) => c.grade === m.grade) ?? classes.data?.[0];
      setExam(base ? { ...base, paper: r.paper } : draftFrom(m, r.paper, cls?.id ?? ''));
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (exam) return;
    if (examId && eq.data) setExam(eq.data);
    else if (!examId && matrix && classes.data) void generate(matrix, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, eq.data, matrix, classes.data]);

  const ids = useMemo(() => (exam ? [...exam.paper.A, ...exam.paper.B].map((s) => s.itemId).filter((x): x is string => !!x) : []), [exam]);
  const items = useItemsByIds(ids);
  const map = items.data ?? {};

  if (!exam) {
    if ((examId && eq.isLoading) || mq.isLoading || busy) return <div className="tc-page"><Loading label="Đang chọn câu từ ngân hàng…" /></div>;
    if (eq.error) return <div className="tc-page"><ErrorNote error={eq.error} /></div>;
    return <div className="tc-page"><Empty title="Không tìm thấy ma trận hoặc đề">Quay lại <a href="/de-kiem-tra">Đề kiểm tra</a>.</Empty></div>;
  }
  const slots = exam.paper[variant];
  const missing = openSlots(exam.paper).filter((o) => exam.onlineVariants === 'AB' || o.variant === 'A');
  const set = (p: Partial<Exam>) => setExam({ ...exam, ...p });
  const rowLabel = (id: string) => exam.rows.find((r) => r.id === id)?.label ?? id;

  const openSwap = async (s: ExamSlot) => {
    setSwap(s);
    setCands(null);
    if (!matrix) { setCands([]); return; }
    setCands(await svc.candidates(matrix, s, slots.map((x) => x.itemId).filter((x): x is string => !!x)));
  };
  const doSave = (status: Exam['status']) => {
    if (status === 'published' && missing.length) { setMsg({ ok: false, text: `Còn ${missing.length} ô chưa có câu. Thầy cô chọn câu (nút “Chọn câu”) hoặc giảm số câu trong ma trận.` }); return; }
    if (!exam.classId) { setMsg({ ok: false, text: 'Chọn lớp làm bài.' }); return; }
    save.mutate({ ...exam, status }, {
      onSuccess: (saved) => {
        setExam(saved);
        setMsg({ ok: true, text: status === 'published' ? 'Đã giao đề. Học sinh thấy bài ở mục Hôm nay khi đến giờ mở.' : 'Đã lưu nháp.' });
        if (!examId) nav(`/de-kiem-tra/${saved.id}/sua`, { replace: true });
      },
      onError: (e) => setMsg({ ok: false, text: (e as Error).message }),
    });
  };

  return (
    <div className="tc-page ex-page">
      <PageHead title={exam.title || 'Đề mới'} sub={matrix ? `Từ ma trận “${matrix.title}” · ${slots.filter((s) => s.itemId).length} câu · ${fmtPoints(paperPoints(slots))} điểm` : undefined}
        actions={<>
          {matrix ? <Btn icon="retry" onClick={() => void generate(matrix, exam)} disabled={busy}>Chọn lại cả đề</Btn> : null}
          <Btn onClick={() => doSave('draft')} disabled={save.isPending}>Lưu nháp</Btn>
          {exam.id ? <Btn onClick={() => nav(`/de-kiem-tra/${exam.id}/in`)}>Xem bản in</Btn> : null}
          <Btn kind="primary" icon="check" onClick={() => doSave('published')} disabled={save.isPending}>{exam.status === 'published' ? 'Lưu thay đổi' : 'Giao cho lớp'}</Btn>
        </>} />
      <ExamTabs exam={exam} />
      {msg ? <div className={`tc-alert ${msg.ok ? 'tc-alert--ok' : 'tc-alert--warn'}`} role="status">{msg.text}</div> : null}
      {shortfalls.length ? (
        <section className="tc-alert tc-alert--warn ex-short" aria-label="Ngân hàng còn thiếu">
          <div><b>Ngân hàng câu hỏi chưa đủ cho ma trận:</b>
            <ul>{shortfalls.map((s) => <li key={`${s.rowId}${s.level}${s.qtype}`}>{s.message}{s.missing > 0 && s.reusedInB ? `; đề B dùng lại ${s.reusedInB} câu` : ''}</li>)}</ul>
            <span className="tc-small">Thêm câu ở Ngân hàng câu hỏi (gắn kĩ năng + độ khó), hoặc chọn tay câu khác cho ô thiếu.</span>
          </div>
        </section>
      ) : null}
      <div className="ex-build">
        <section className="tc-card tc-card--flush">
          <div className="ex-pad tc-row ex-between">
            <Seg label="Đề" value={variant} onChange={setVariant} options={[{ value: 'A', label: 'Đề A' }, { value: 'B', label: 'Đề B' }]} />
            <span className="tc-muted tc-small">Thứ tự câu và đáp án được xáo riêng cho từng em khi làm trực tuyến.</span>
          </div>
          <ol className="ex-slots">
            {slots.map((s) => {
              const it = s.itemId ? map[s.itemId] : undefined;
              return (
                <li key={s.id} className={s.itemId ? '' : 'is-missing'}>
                  <span className="ex-no">{s.no}</span>
                  <div className="ex-slot__body">
                    <div className="tc-row ex-wrap"><LevelTag level={s.level} /><span className="tc-chip">{EXAM_QTYPE_LABEL[s.qtype]}</span><span className="tc-small tc-muted">{rowLabel(s.rowId)}</span><span className="tc-small"><b>{fmtPoints(s.points)}</b> đ</span>{it ? <TypeBadge type={it.type} /> : null}</div>
                    <p className="ex-slot__q">{it ? shorten(it.prompt.text, 140) : s.itemId ? '…' : 'Chưa có câu phù hợp trong ngân hàng.'}</p>
                  </div>
                  <span className="tc-row">
                    {it ? <Btn size="sm" kind="ghost" icon="eye" aria-label="Xem câu" onClick={() => setPreview(it)} /> : null}
                    <Btn size="sm" onClick={() => void openSwap(s)} disabled={!matrix}>{s.itemId ? 'Đổi câu' : 'Chọn câu'}</Btn>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
        <aside className="tc-card ex-settings">
          <h2 className="ex-h2">Cài đặt bài kiểm tra</h2>
          <Field label="Tên bài"><input className="tc-input" value={exam.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Lớp"><select className="tc-input" value={exam.classId} onChange={(e) => set({ classId: e.target.value })}><option value="">Chọn lớp…</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>Lớp {c.name}</option>)}</select></Field>
          <div className="ex-dates">
            <Field label="Mở đề"><input type="datetime-local" className="tc-input" value={toLocalInput(new Date(exam.openAt))} onChange={(e) => e.target.value && set({ openAt: new Date(e.target.value).toISOString() })} /></Field>
            <Field label="Đóng đề"><input type="datetime-local" className="tc-input" value={toLocalInput(new Date(exam.closeAt))} onChange={(e) => e.target.value && set({ closeAt: new Date(e.target.value).toISOString() })} /></Field>
          </div>
          <Field label="Thời gian làm bài (phút)"><input className="tc-input tc-input--num" inputMode="numeric" value={exam.durationMin} onChange={(e) => set({ durationMin: Math.max(5, Math.min(180, Number(e.target.value) || 5)) })} /></Field>
          <Field label="Điểm hiện cho học sinh"><Seg label="Khi nào hiện điểm" value={exam.resultsPolicy} onChange={(v) => set({ resultsPolicy: v })} options={[{ value: 'immediate', label: 'Ngay khi nộp' }, { value: 'after-release', label: 'Khi cô công bố' }]} /></Field>
          <Field label="Làm trực tuyến" help="Đề A/B: máy chia ngẫu nhiên đề cho từng em (bạn ngồi cạnh thường khác đề).">
            <Seg label="Đề trực tuyến" value={exam.onlineVariants} onChange={(v) => set({ onlineVariants: v })} options={[{ value: 'A', label: 'Chỉ đề A' }, { value: 'AB', label: 'Đề A và B' }]} />
          </Field>
          <Field label="Số lần làm"><Seg label="Số lần làm" value={exam.maxAttempts} onChange={(v) => set({ maxAttempts: v })} options={[{ value: 1, label: '1 lần' }, { value: 2, label: '2 lần' }]} /></Field>
          <label className="tc-switch"><input type="checkbox" checked={exam.fullscreenPrompt} onChange={(e) => set({ fullscreenPrompt: e.target.checked })} /> Gợi ý bật toàn màn hình khi bắt đầu</label>
          <p className="tc-small tc-muted">Máy ghi nhận lại (không trừ điểm): rời màn hình, thoát toàn màn hình, thử dán chữ, mở bài ở 2 nơi, trả lời quá nhanh. Mỗi câu chỉ có đáp án ở máy chủ.</p>
        </aside>
      </div>
      {save.error ? <ErrorNote error={save.error} /> : null}
      <Dialog open={!!swap} onClose={() => setSwap(null)} title={swap ? `Câu ${swap.no} — chọn câu thay thế` : ''} wide>
        {!cands ? <Loading /> : !cands.length ? <Empty title="Không còn câu cùng mức, cùng dạng">Thêm câu vào Ngân hàng (gắn kĩ năng của mạch và độ khó) rồi thử lại.</Empty> : (
          <ul className="ex-cands">
            {cands.map((c) => (
              <li key={c.id}>
                <div><div className="tc-row"><TypeBadge type={c.type} /><span className="tc-small tc-muted">{(c.skills ?? []).join(', ')}</span></div><p>{shorten(c.prompt.text, 160)}</p></div>
                <span className="tc-row"><Btn size="sm" kind="ghost" icon="eye" aria-label="Xem" onClick={() => setPreview(c)} /><Btn size="sm" kind="primary" onClick={() => { if (swap) setExam(exam && { ...exam, paper: swapSlot(exam.paper, variant, swap.id, c.id) }); setSwap(null); }}>Chọn</Btn></span>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      <Dialog open={!!preview} onClose={() => setPreview(null)} title="Xem câu hỏi" wide>{preview ? <ItemPreview item={preview} /> : null}</Dialog>
    </div>
  );
}
