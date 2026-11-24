import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { uid, type AnyResponse, type ContentPackage, type Grade, type Item, type Lesson, type Profile, type Slide, type SlideLayout, type SubjectId, subjectLabelFor, subjectOptionsFor } from '@openedu/contracts';
import { scoreItem } from '@openedu/activity-engine';
import { SelfPacedPlayer, SlideView, lessonMascot, resolveSlideItem } from '@openedu/lesson-player';
import { Icon, KidShell } from '@openedu/ui';
import { lessonItemIds, useClasses, useCreateLiveSession, useDeleteLesson, useItemsByIds, useLesson, usePackages, useSaveItem, useSaveLesson } from '@openedu/data';
import { Btn, Dialog, Empty, ErrorNote, Loading, Seg } from '../../components/common';
import { FramePreview } from '../../components/FramePreview';
import { ItemPickerDialog, ItemStudio, newItemOfType, TypePickerGrid } from '../../components/items';
import { cx, fmtTime, layoutMeta } from '../../lib/format';
import { AiDialog } from './AiDialog';
import { PackageImportDialog } from './PackageImport';
import { LessonPanel, SlidePanel } from './SlidePanel';
import { SlideList } from './SlideList';
import type { DraftResult } from '../../lib/aiDraft';

type Device = 'phone' | 'tablet' | 'tv';
const DEVICES: Record<Device, { w: number; h: number; label: string }> = {
  phone: { w: 390, h: 780, label: 'Điện thoại' },
  tablet: { w: 1180, h: 820, label: 'Máy tính bảng' },
  tv: { w: 1920, h: 1080, label: 'TV' },
};

function blankSlide(layout: SlideLayout, lesson: Lesson): Slide {
  const id = uid('s');
  switch (layout) {
    case 'title': return { id, layout, title: lesson.title, mascot: lessonMascot(lesson) };
    case 'image-text': return { id, layout, title: 'Tiêu đề slide', text: 'Nội dung ngắn gọn cho học sinh.', image: 'emoji:📘' };
    case 'fullscreen': return { id, layout, title: 'Quan sát tranh', image: 'emoji:🌈' };
    case 'activity': return { id, layout, title: 'Em thử nhé!' };
    case 'compare': return { id, layout, title: 'So sánh', columns: [{ title: 'Bên trái', text: '' }, { title: 'Bên phải', text: '' }] };
    case 'game': return { id, layout, title: 'Vòng quay may mắn', game: { kind: 'wheel', entries: ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'] } };
    case 'package': return { id, layout, title: 'Trò chơi HTML5' };
    case 'summary': return { id, layout, title: 'Em đã học được gì?', text: '• Ý chính thứ nhất\n• Ý chính thứ hai', mascot: lessonMascot(lesson) };
  }
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export default function LessonEditor({ user }: { user: Profile }) {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useLesson(id);
  const saveLesson = useSaveLesson();
  const saveItem = useSaveItem();
  const del = useDeleteLesson();
  const live = useCreateLiveSession();
  const classes = useClasses(user.role === 'admin' ? undefined : user.id);
  const pkgQ = usePackages();

  const [draft, setDraftState] = useState<Lesson | null>(null);
  const draftRef = useRef<Lesson | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [tab, setTab] = useState<'slide' | 'lesson'>('slide');
  const [device, setDevice] = useState<Device>('tablet');
  const [save, setSave] = useState<SaveState>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveErr, setSaveErr] = useState<unknown>(null);
  const version = useRef(0);
  const timer = useRef<number | undefined>();
  const [extra, setExtra] = useState<Record<string, Item>>({});
  const [picker, setPicker] = useState<null | 'slide' | { videoQ: number }>(null);
  const [typePick, setTypePick] = useState(false);
  const [editing, setEditing] = useState<{ item: Item; isNew: boolean } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [studentView, setStudentView] = useState(false);
  const [pvValue, setPvValue] = useState<AnyResponse | undefined>();
  const [pvReveal, setPvReveal] = useState(false);

  useEffect(() => {
    if (q.data && (!draftRef.current || draftRef.current.id !== q.data.id)) {
      draftRef.current = q.data;
      setDraftState(q.data);
      setSelId(q.data.slides[0]?.id ?? null);
    }
  }, [q.data]);

  const doSave = useCallback(async () => {
    window.clearTimeout(timer.current);
    const snap = draftRef.current;
    if (!snap) return;
    const v = version.current;
    setSave('saving');
    try {
      await saveLesson.mutateAsync(snap);
      setSavedAt(new Date());
      setSaveErr(null);
      setSave(version.current === v ? 'saved' : 'dirty');
    } catch (e) {
      setSaveErr(e);
      setSave('error');
    }
  }, [saveLesson]);

  const update = useCallback((fn: (l: Lesson) => Lesson) => {
    const cur = draftRef.current;
    if (!cur) return;
    const next = fn(cur);
    draftRef.current = next;
    setDraftState(next);
    version.current++;
    setSave('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void doSave(), 1200);
  }, [doSave]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void doSave(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [doSave]);
  // Rời trình soạn: lưu nốt thay đổi.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => { if (saveRef.current === 'dirty' && draftRef.current) void saveLesson.mutateAsync(draftRef.current).catch(() => undefined); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ids = useMemo(() => lessonItemIds(draft), [draft]);
  const itemsQ = useItemsByIds(ids);
  const items = useMemo(() => ({ ...(itemsQ.data ?? {}), ...extra }), [itemsQ.data, extra]);
  const packages = useMemo(() => Object.fromEntries((pkgQ.data ?? []).map((p) => [p.id, p])) as Record<string, ContentPackage>, [pkgQ.data]);

  if (q.isLoading) return <Loading label="Đang mở bài giảng…" />;
  if (!q.data && !draft) return <div className="tc-page"><Empty title="Không tìm thấy bài giảng">Có thể bài đã bị xóa. <Link to="/bai-giang">Về danh sách bài giảng</Link></Empty></div>;
  if (!draft) return <Loading />;

  const idx = Math.max(0, draft.slides.findIndex((s) => s.id === selId));
  const slide = draft.slides[idx];
  const classId = classes.data?.find((c) => c.grade === draft.grade)?.id ?? classes.data?.[0]?.id;

  const setSlide = (s: Slide) => update((l) => ({ ...l, slides: l.slides.map((x) => (x.id === s.id ? s : x)) }));
  const addSlide = (layout: SlideLayout) => {
    const s = blankSlide(layout, draft);
    update((l) => { const sl = l.slides.slice(); sl.splice(idx + 1, 0, s); return { ...l, slides: sl }; });
    setSelId(s.id);
    setTab('slide');
  };
  const move = (from: number, to: number) => update((l) => { if (to < 0 || to >= l.slides.length) return l; const sl = l.slides.slice(); const [x] = sl.splice(from, 1); sl.splice(to, 0, x); return { ...l, slides: sl }; });
  const duplicate = (i: number) => {
    const copy = { ...JSON.parse(JSON.stringify(draft.slides[i])) as Slide, id: uid('s') };
    update((l) => { const sl = l.slides.slice(); sl.splice(i + 1, 0, copy); return { ...l, slides: sl }; });
    setSelId(copy.id);
  };
  const remove = (i: number) => {
    const next = draft.slides[i + 1] ?? draft.slides[i - 1];
    update((l) => ({ ...l, slides: l.slides.filter((_, j) => j !== i) }));
    setSelId(next?.id ?? null);
  };

  const pickItem = (it: Item) => {
    setExtra((e) => ({ ...e, [it.id]: it }));
    if (picker === 'slide') setSlide({ ...slide, itemId: it.id, item: undefined });
    else if (picker && slide.video) setSlide({ ...slide, video: { url: slide.video.url, questions: (slide.video.questions ?? []).map((q2, j) => (j === picker.videoQ ? { ...q2, itemId: it.id } : q2)) } });
    setPicker(null);
  };
  const saveEditing = async () => {
    if (!editing) return;
    const saved = await saveItem.mutateAsync(editing.item);
    setExtra((e) => ({ ...e, [saved.id]: saved }));
    if (slide.layout === 'activity' && (editing.isNew || slide.item?.id === saved.id)) setSlide({ ...slide, itemId: saved.id, item: undefined });
    setEditing(null);
  };
  const applyDraft = async (r: DraftResult, mode: 'replace' | 'append') => {
    for (const it of r.items) {
      const saved = await saveItem.mutateAsync(it);
      setExtra((e) => ({ ...e, [saved.id]: saved }));
    }
    update((l) => ({ ...l, ...(mode === 'replace' && l.slides.length <= 1 ? { title: r.title } : {}), slides: mode === 'replace' ? r.slides : [...l.slides, ...r.slides] }));
    setSelId(r.slides[0]?.id ?? null);
  };
  const present = async () => {
    await doSave();
    live.mutate({ lessonId: draft.id, classId }, { onSuccess: (s) => nav(`/truc-tiep/${s.sessionId}${classId ? `?lop=${classId}` : ''}`) });
  };

  const pvItem = slide?.layout === 'activity' ? resolveSlideItem(slide, items) : undefined;
  const pvResult = pvItem && (pvReveal || pvValue !== undefined) ? scoreItem(pvItem, pvValue) : undefined;
  const dev = DEVICES[device];
  const saveLabel = save === 'saving' ? 'Đang lưu…' : save === 'dirty' ? 'Chưa lưu' : save === 'error' ? 'Lỗi khi lưu' : savedAt ? `Đã lưu lúc ${fmtTime(savedAt)}` : 'Đã lưu';

  return (
    <div className="tc-editor">
      <header className="tc-ebar">
        <Link to="/bai-giang" className="tc-btn tc-btn--ghost tc-btn--icon" aria-label="Về danh sách bài giảng"><Icon name="back" size={20} /></Link>
        <input className="tc-ebar__title" value={draft.title} onChange={(e) => update((l) => ({ ...l, title: e.target.value }))} aria-label="Tên bài giảng" />
        <select className="tc-input tc-input--sm" value={draft.subject} onChange={(e) => update((l) => ({ ...l, subject: e.target.value as SubjectId }))} aria-label="Môn">
          {subjectOptionsFor(draft.grade, [draft.subject]).map((s) => <option key={s.id} value={s.id}>{subjectLabelFor(s.id, draft.grade)}</option>)}
        </select>
        <select className="tc-input tc-input--sm" value={draft.grade} onChange={(e) => update((l) => ({ ...l, grade: Number(e.target.value) as Grade }))} aria-label="Lớp">
          {[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>Lớp {g}</option>)}
        </select>
        <button type="button" className={cx('tc-savestate', `is-${save}`)} onClick={() => void doSave()} title="Lưu ngay (Ctrl+S)">
          <i aria-hidden="true" />{saveLabel}
        </button>
        <span className="tc-ebar__spacer" />
        <Btn size="sm" icon="star" title="AI tạo bài từ SGK" onClick={() => setAiOpen(true)}>AI tạo bài từ SGK</Btn>
        <Btn size="sm" icon="upload" title="Nhập gói HTML5" onClick={() => setPkgOpen(true)}>Nhập gói HTML5</Btn>
        <label className="tc-switch tc-switch--pub"><input type="checkbox" checked={draft.status === 'published'} onChange={(e) => update((l) => ({ ...l, status: e.target.checked ? 'published' : 'draft' }))} /> {draft.status === 'published' ? 'Đã xuất bản' : 'Xuất bản'}</label>
        <Btn size="sm" icon="eye" title="Xem như học sinh" onClick={() => setStudentView(true)}>Xem như học sinh</Btn>
        <Btn size="sm" kind="primary" icon="tv" onClick={() => void present()} disabled={live.isPending}>{live.isPending ? 'Đang mở…' : 'Trình chiếu'}</Btn>
      </header>
      {saveErr && save === 'error' ? <ErrorNote error={saveErr} onRetry={() => void doSave()} /> : null}
      {live.error ? <ErrorNote error={live.error} onRetry={() => void present()} /> : null}

      <div className="tc-ework">
        <SlideList lesson={draft} items={items} packages={packages} selectedId={slide?.id ?? null} onSelect={(sid) => { setSelId(sid); setTab('slide'); setPvValue(undefined); setPvReveal(false); }} onMove={move} onDuplicate={duplicate} onDelete={remove} onAdd={addSlide} />

        <section className="tc-stage">
          <div className="tc-stage__bar">
            <Seg label="Thiết bị xem trước" value={device} onChange={setDevice} options={(Object.keys(DEVICES) as Device[]).map((d) => ({ value: d, label: DEVICES[d].label }))} />
            <span className="tc-muted tc-small">{slide ? `Slide ${idx + 1}/${draft.slides.length} · ${layoutMeta(slide.layout).label}` : ''} · {dev.w}×{dev.h}</span>
            {pvItem ? <label className="tc-switch"><input type="checkbox" checked={pvReveal} onChange={(e) => setPvReveal(e.target.checked)} /> Xem đáp án</label> : null}
          </div>
          <div className={cx('tc-stage__device', `tc-device--${device}`)}>
            {slide ? (
              <FramePreview key={device} width={dev.w} height={dev.h} title={`Xem trước trên ${dev.label}`}>
                <KidShell bigText={draft.grade <= 2 && device !== 'tv'} className="tc-frame-shell">
                  <SlideView
                    key={slide.id}
                    slide={slide}
                    items={items}
                    packages={packages}
                    context={device === 'tv' ? 'screen' : 'student'}
                    mascot={lessonMascot(draft)}
                    bigText={draft.grade <= 2 && device !== 'tv'}
                    sound={false}
                    activity={pvItem ? { value: pvValue, onChange: setPvValue, reveal: pvReveal, result: pvReveal ? pvResult : undefined } : undefined}
                  />
                </KidShell>
              </FramePreview>
            ) : <Empty title="Bài chưa có slide">Bấm “Thêm slide”.</Empty>}
          </div>
        </section>

        <aside className="tc-propsbox">
          <div className="tc-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'slide'} onClick={() => setTab('slide')}>Slide {slide ? idx + 1 : ''}</button>
            <button type="button" role="tab" aria-selected={tab === 'lesson'} onClick={() => setTab('lesson')}>Bài giảng</button>
          </div>
          {tab === 'slide' && slide ? (
            <SlidePanel
              lesson={draft}
              slide={slide}
              items={items}
              packages={pkgQ.data ?? []}
              classId={classId}
              onChange={setSlide}
              onPickItem={setPicker}
              onNewItem={() => setTypePick(true)}
              onEditItem={(it) => setEditing({ item: it, isNew: false })}
              onImportPackage={() => setPkgOpen(true)}
            />
          ) : tab === 'lesson' ? (
            <LessonPanel lesson={draft} onChange={(p) => update((l) => ({ ...l, ...p }))} onDelete={() => { window.clearTimeout(timer.current); saveRef.current = 'saved'; del.mutate(draft.id, { onSuccess: () => nav('/bai-giang') }); }} />
          ) : null}
        </aside>
      </div>

      <ItemPickerDialog open={picker !== null} onClose={() => setPicker(null)} onPick={pickItem} grade={draft.grade} subject={draft.subject} />
      <Dialog open={typePick} onClose={() => setTypePick(false)} title="Tạo hoạt động mới — chọn dạng" wide>
        <TypePickerGrid onPick={(t) => { setTypePick(false); setEditing({ item: newItemOfType(t, draft.grade, draft.subject), isNew: true }); }} />
      </Dialog>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? 'Soạn hoạt động mới' : 'Sửa hoạt động'}
        full
        footer={<>
          {!editing?.isNew ? <span className="tc-muted tc-small">Hoạt động trong ngân hàng dùng chung — sửa ở đây sẽ đổi ở mọi bài dùng nó.</span> : <span className="tc-muted tc-small">Hoạt động sẽ được lưu vào ngân hàng và gắn vào slide này.</span>}
          {editing && !editing.isNew ? <Btn onClick={() => setEditing({ item: { ...editing.item, id: uid('it') }, isNew: true })}>Tạo bản sao để sửa riêng</Btn> : null}
          <Btn onClick={() => setEditing(null)}>Hủy</Btn>
          <Btn kind="primary" onClick={() => void saveEditing()} disabled={saveItem.isPending}>{saveItem.isPending ? 'Đang lưu…' : 'Lưu hoạt động'}</Btn>
        </>}
      >
        {editing ? <ItemStudio item={editing.item} onChange={(it) => setEditing({ ...editing, item: it })} /> : null}
        <ErrorNote error={saveItem.error} />
      </Dialog>
      <AiDialog open={aiOpen} onClose={() => setAiOpen(false)} lesson={draft} onApply={applyDraft} />
      <PackageImportDialog open={pkgOpen} onClose={() => setPkgOpen(false)} ownerId={user.id} onRegistered={(p) => { if (slide?.layout === 'package') setSlide({ ...slide, packageId: p.id }); }} />

      {studentView ? (
        <div className="tc-studentview">
          <KidShell bigText={draft.grade <= 2}>
            <SelfPacedPlayer lesson={draft} items={items} packages={packages} onExit={() => setStudentView(false)} />
          </KidShell>
          <button type="button" className="tc-studentview__close" onClick={() => setStudentView(false)}><Icon name="close" size={18} /> Thoát xem thử</button>
        </div>
      ) : null}
    </div>
  );
}
