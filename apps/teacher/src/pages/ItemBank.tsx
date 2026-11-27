import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from '@openedu/ui';
import { uid, type Lesson, type Profile, subjectInGrade, subjectOptionsFor } from '@openedu/contracts';
import { ACTIVITY_TYPES, SUBJECTS, type Grade, type Item, type ItemType, type SubjectId } from '@openedu/contracts';
import { useCurrentUser, useDataSource, useDeleteItem, useItems, useLessons, useSaveItem, useSaveLesson } from '@openedu/data';
import { useClasses } from '../lib/focusGrade';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading, PageHead } from '../components/common';
import { SampleContent } from './admin/Admin';
import { ItemPreview, ItemStudio, newItemOfType, TypeBadge, TypePickerDialog } from '../components/items';
import { cx, relTime, shorten } from '../lib/format';
import { exportBankXlsx, QuickAddDialog } from './itembank/QuickAdd';
import { GameSetupDialog } from './live/GameSetup';
import { ArenaPoolDialog } from './arena/ArenaPoolDialog';
import { byFocus, useFocusGrade } from '../lib/focusGrade';

/** Giao các câu đã chọn: tạo một bài luyện tập (mỗi câu một trang hoạt động) rồi sang trang Giao bài để chọn lớp, hạn nộp. */
function AssignDialog({ items, me, onClose }: { items: Item[]; me: Profile; onClose: () => void }) {
  const nav = useNavigate();
  const saveLesson = useSaveLesson();
  const top = <K extends 'subject' | 'grade'>(k: K) => {
    const c = new Map<Item[K], number>();
    items.forEach((it) => c.set(it[k], (c.get(it[k]) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  };
  const subject = top('subject');
  const grade = top('grade');
  const [title, setTitle] = useState(`Luyện tập ${SUBJECTS[subject]?.name ?? ''} lớp ${grade} (${items.length} câu)`);
  const create = () => {
    const id = uid('ls');
    const lesson: Lesson = {
      id, title: title.trim() || 'Bài luyện tập', subject, grade, ownerId: me.id, status: 'published', updatedAt: new Date().toISOString(),
      minutes: Math.max(5, Math.round(items.length * 1.5)),
      description: 'Tạo từ Ngân hàng câu hỏi.',
      slides: items.map((it, i) => ({ id: `${id}-s${i + 1}`, layout: 'activity' as const, title: `Câu ${i + 1}`, itemId: it.id })),
    };
    saveLesson.mutate(lesson, { onSuccess: (l) => nav(`/giao-bai?bai=${encodeURIComponent(l.id)}`) });
  };
  return (
    <Dialog open title={`Giao ${items.length} câu cho học sinh`} onClose={onClose} footer={<>
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" icon="check" disabled={saveLesson.isPending || !title.trim()} onClick={create} data-testid="qb-assign-go">{saveLesson.isPending ? 'Đang tạo…' : 'Tạo bài và chọn lớp'}</Btn>
    </>}>
      <div className="tc-stack">
        <p className="tc-muted">Các câu đã chọn được gộp thành một <strong>bài luyện tập</strong> (mỗi câu một trang, theo thứ tự trong danh sách). Bước sau: chọn lớp hoặc từng em, ngày mở và hạn nộp. Kết quả từng câu vào hồ sơ học tập và mức thành thạo kĩ năng như bài giảng thường.</p>
        <Field label="Tên bài cho học sinh"><input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <ol className="tc-small tc-qbpicked">{items.map((it) => <li key={it.id}>{shorten(it.prompt.text, 90)}</li>)}</ol>
        <ErrorNote error={saveLesson.error} />
      </div>
    </Dialog>
  );
}

export default function ItemBank() {
  const [subject, setSubject] = useState<SubjectId | ''>('');
  const focus = useFocusGrade().grade;
  // Mặc định: khối ưu tiên (lớp 5); "Mọi lớp" xem hết, khối ưu tiên vẫn đứng đầu.
  const [grade, setGrade] = useState<Grade | 0>(focus);
  const [type, setType] = useState<ItemType | ''>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{ item: Item; mode: 'view' | 'edit'; isNew?: boolean } | null>(null);
  const [typePick, setTypePick] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [quick, setQuick] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [assign, setAssign] = useState(false);
  const [play, setPlay] = useState(false);
  const [rowDel, setRowDel] = useState<string | null>(null);
  const [bulkDel, setBulkDel] = useState<null | 'ask' | { done: number; total: number; failed: string[] }>(null);
  const me = useCurrentUser().data;
  const [arena, setArena] = useState(false);
  const myClasses = useClasses(me && me.role !== 'admin' ? me.id : undefined).data ?? [];
  const ds = useDataSource();
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const q = useItems({ ...(subject ? { subject } : {}), ...(grade ? { grade } : {}), ...(type ? { type } : {}), ...(search.trim() ? { search: search.trim() } : {}) });
  const lessons = useLessons();
  const save = useSaveItem();
  const del = useDeleteItem();
  const usage = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const l of lessons.data ?? []) for (const s of l.slides) {
      const ids = [s.itemId, ...(s.video?.questions ?? []).map((x) => x.itemId)].filter(Boolean) as string[];
      ids.forEach((id) => { (m[id] = m[id] ?? []).includes(l.title) || m[id].push(l.title); });
    }
    return m;
  }, [lessons.data]);
  const list = useMemo(() => {
    const byTime = q.data ? [...q.data].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')) : [];
    return grade ? byTime : byFocus(byTime, focus, (it) => it.grade);
  }, [q.data, grade, focus]);

  const close = () => { setOpen(null); setConfirm(false); save.reset(); };
  const doSave = () => open && save.mutate(open.item, { onSuccess: (it) => setOpen({ item: it, mode: 'view' }) });
  /** Nhân bản: mở bản sao (id mới) ở chế độ sửa, chưa lưu. */
  const duplicate = (it: Item) => {
    const copy = JSON.parse(JSON.stringify(it)) as Item;
    delete copy.updatedAt;
    setConfirm(false);
    setOpen({ item: { ...copy, id: uid('it'), prompt: { ...copy.prompt, text: `${copy.prompt.text} (bản sao)` } } as Item, mode: 'edit', isNew: true });
  };
  /** Xoá nhiều câu đã chọn (lần lượt; câu không xoá được — của người khác — báo lại). */
  const deleteMany = async (ids: string[]) => {
    const failed: string[] = [];
    const failedIds = new Set<string>();
    let done = 0;
    setBulkDel({ done, total: ids.length, failed });
    for (const id of ids) {
      try {
        await del.mutateAsync(id);
      } catch (e) {
        failedIds.add(id);
        failed.push(`“${shorten(list.find((x) => x.id === id)?.prompt.text ?? id, 50)}”: ${e instanceof Error ? e.message : String(e)}`);
      }
      done++;
      setBulkDel({ done, total: ids.length, failed: [...failed] });
    }
    setPicked((p) => p.filter((id) => !ids.includes(id) || failedIds.has(id)));
    if (open && ids.includes(open.item.id) && !failedIds.has(open.item.id)) setOpen(null);
    setBulkDel(null);
    setToast(failed.length
      ? { text: `Đã xoá ${ids.length - failed.length}/${ids.length} câu. Không xoá được ${failed.length} câu — ${failed[0]}`, error: true }
      : { text: `Đã xoá ${ids.length} câu.` });
  };
  const deleteOne = (it: Item) => del.mutate(it.id, {
    onSuccess: () => { setRowDel(null); setPicked((p) => p.filter((x) => x !== it.id)); if (open?.item.id === it.id) setOpen(null); setToast({ text: 'Đã xoá câu hỏi.' }); },
    onError: (e) => { setRowDel(null); setToast({ text: e instanceof Error ? e.message : String(e), error: true }); },
  });
  const doExport = async () => {
    try {
      const r = await exportBankXlsx(list);
      setToast({ text: `Đã xuất ${r.exported} câu ra Excel${r.skipped ? ` — ${r.skipped} hoạt động dạng khác (kéo thả, có ảnh trong lựa chọn…) chưa xuất được bằng mẫu Excel` : ''}. Sửa trong Excel rồi "Thêm nhanh → Từ tệp" để cập nhật.` });
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  return (
    <div className={cx('tc-page tc-bank', open && 'has-drawer')}>
      <PageHead title="Ngân hàng câu hỏi" sub="Câu hỏi và hoạt động dùng chung cho bài giảng, luyện tập và lớp trực tiếp. Tích chọn các câu rồi bấm “Giao cho học sinh” (làm ở nhà) hoặc “Chơi trực tiếp” (thi đua trên lớp)." actions={<>
        <Link className="tc-btn tc-btn--ghost" to="/ki-nang" title="Xem, thêm, sửa, xoá kĩ năng; xuất danh mục kĩ năng ra Excel" data-testid="qb-skills"><Icon name="puzzle" size={16} /><span>Danh mục kĩ năng</span></Link>
        <Btn icon="upload" onClick={() => void doExport()} disabled={!list.length} title="Xuất các câu đang hiện (theo bộ lọc) ra Excel, cùng mẫu với nhập">Xuất ra Excel</Btn>
        <Btn icon="plus" onClick={() => setQuick(true)} data-testid="qb-open">Thêm nhanh nhiều câu</Btn>
        <Btn kind="primary" icon="plus" onClick={() => setTypePick(true)}>Tạo hoạt động</Btn>
      </>} />
      {toast ? <div className={cx('tc-alert tc-bank__toast', toast.error ? 'tc-alert--error' : 'tc-alert--ok')} role="status"><span>{toast.text}</span><Btn size="sm" kind="ghost" icon="close" aria-label="Đóng thông báo" onClick={() => setToast(null)} /></div> : null}
      <div className="tc-filters tc-card tc-card--flat">
        <input className="tc-input tc-filters__search" placeholder="Tìm theo đề bài, kĩ năng, thẻ…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="tc-input" value={subject} onChange={(e) => setSubject(e.target.value as SubjectId | '')} aria-label="Môn"><option value="">Mọi môn</option>{subjectOptionsFor(grade, [subject]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="tc-input" value={grade} onChange={(e) => { const g = Number(e.target.value) as Grade | 0; setGrade(g); if (g && subject && !subjectInGrade(subject, g)) setSubject(''); }} aria-label="Lớp"><option value={0}>Mọi lớp</option>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select>
        <select className="tc-input" value={type} onChange={(e) => setType(e.target.value as ItemType | '')} aria-label="Dạng"><option value="">Mọi dạng</option>{ACTIVITY_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}{t.isNew ? ' (mới)' : ''}</option>)}</select>
        <span className="tc-muted tc-small">{q.data ? `${q.data.length} câu` : ''}</span>
      </div>
      {list.length ? (
        <div className="tc-qbbar" data-testid="qb-bar">
          <label className="tc-row tc-small"><input type="checkbox" checked={list.length > 0 && list.every((it) => picked.includes(it.id))} onChange={(e) => setPicked(e.target.checked ? Array.from(new Set([...picked, ...list.map((it) => it.id)])) : picked.filter((id) => !list.some((it) => it.id === id)))} data-testid="qb-pick-all" /> Chọn tất cả câu đang hiện</label>
          {picked.length ? <>
            <strong className="tc-small">Đã chọn {picked.length} câu</strong>
            <Btn size="sm" kind="ghost" onClick={() => setPicked([])}>Bỏ chọn</Btn>
            <span className="tc-ebar__spacer" />
            <Btn kind="danger" icon="trash" disabled={!!bulkDel} onClick={() => setBulkDel('ask')} data-testid="qb-del-picked">Xoá {picked.length} câu</Btn>
            <Btn icon="trophy" disabled={!me || !myClasses.length} onClick={() => setArena(true)} data-testid="qb-arena" title="Thêm câu vào bộ câu Đấu trường của lớp (Đấu 1–1, Leo tháp) hoặc mở giải đấu loại trực tiếp">Đưa vào Đấu trường</Btn>
            <Btn icon="play" disabled={!me} onClick={() => setPlay(true)} data-testid="qb-play" title="Thi đua trực tiếp trên lớp: kiểu Kahoot, Quizizz hoặc thẻ giấy">Chơi trực tiếp</Btn>
            <Btn kind="primary" icon="check" disabled={!me} onClick={() => setAssign(true)} data-testid="qb-assign">Giao cho học sinh ({picked.length} câu)</Btn>
          </> : <span className="tc-muted tc-small">Tích ô trước mỗi câu để chọn câu giao cho học sinh, chơi trực tiếp hoặc xoá nhiều câu.</span>}
          {bulkDel === 'ask' ? (
            <div className="tc-w100">
              <ConfirmBar
                text={`Xoá ${picked.length} câu đã chọn?${picked.some((id) => usage[id]) ? ` Có ${picked.filter((id) => usage[id]).length} câu đang dùng trong bài giảng — slide đó sẽ báo thiếu câu hỏi.` : ''} Không hoàn tác được.`}
                confirmLabel={`Xoá ${picked.length} câu`}
                onCancel={() => setBulkDel(null)}
                onConfirm={() => void deleteMany([...picked])}
              />
            </div>
          ) : bulkDel ? <span className="tc-small" role="status">Đang xoá {bulkDel.done}/{bulkDel.total}…</span> : null}
        </div>
      ) : null}
      {q.isLoading ? <Loading /> : !list.length ? (
        subject || grade || type || search.trim() ? <Empty icon="puzzle" title="Không có câu phù hợp">Bỏ bớt bộ lọc hoặc tạo câu mới.</Empty> : (
          <div className="tc-stack">
            <Empty icon="puzzle" title="Ngân hàng câu hỏi đang trống">Bấm <strong>Tạo hoạt động</strong> để soạn từng câu, <strong>Thêm nhanh nhiều câu</strong> để dán / nhập từ Excel{me?.role === 'admin' && ds.mode !== 'demo' ? ', hoặc nạp bộ câu hỏi mẫu ngay bên dưới' : '. Quản trị trường có thể nạp bộ câu hỏi mẫu'}.</Empty>
            {me?.role === 'admin' && ds.mode !== 'demo' ? <SampleContent /> : null}
          </div>
        )
      ) : (
        <ul className="tc-list tc-card tc-card--flush">
          {list.map((it) => (
            <li key={it.id} className={cx('tc-qbrow', picked.includes(it.id) && 'is-picked')}>
              <input type="checkbox" className="tc-qbrow__pick" checked={picked.includes(it.id)} onChange={() => togglePick(it.id)} aria-label={`Chọn câu: ${shorten(it.prompt.text, 60)}`} />
              <button type="button" className={cx('tc-listrow', open?.item.id === it.id && 'is-active')} onClick={() => { setConfirm(false); setOpen({ item: it, mode: 'view' }); }}>
                <TypeBadge type={it.type} />
                <span className="tc-listrow__main">{shorten(it.prompt.text, 120)}</span>
                <span className="tc-muted tc-small tc-listrow__meta">{SUBJECTS[it.subject]?.name} · Lớp {it.grade}{usage[it.id] ? ` · ${usage[it.id].length} bài` : ''}</span>
              </button>
              <span className="tc-qbrow__acts">
                <Btn size="sm" kind="ghost" icon="pencil" title="Sửa câu này" aria-label={`Sửa câu: ${shorten(it.prompt.text, 50)}`} onClick={() => { setConfirm(false); setOpen({ item: it, mode: 'edit' }); }} data-testid="qb-row-edit" />
                <Btn size="sm" kind="ghost" icon="trash" title="Xoá câu này" aria-label={`Xoá câu: ${shorten(it.prompt.text, 50)}`} onClick={() => setRowDel(rowDel === it.id ? null : it.id)} data-testid="qb-row-del" />
              </span>
              {rowDel === it.id ? (
                <div className="tc-qbrow__confirm">
                  <ConfirmBar text={usage[it.id] ? `Câu này đang dùng trong ${usage[it.id].length} bài giảng — xoá thì slide đó báo thiếu câu hỏi. Vẫn xoá?` : 'Xoá câu hỏi này? Không hoàn tác được.'} confirmLabel="Xoá" busy={del.isPending} onCancel={() => setRowDel(null)} onConfirm={() => deleteOne(it)} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <aside className={cx('tc-drawer', open.mode === 'edit' && 'tc-drawer--wide')} aria-label="Chi tiết hoạt động">
          <header className="tc-drawer__head">
            <TypeBadge type={open.item.type} />
            <strong>{open.isNew ? 'Hoạt động mới' : open.mode === 'edit' ? 'Sửa hoạt động' : 'Xem trước'}</strong>
            <span className="tc-ebar__spacer" />
            <Btn kind="ghost" icon="close" aria-label="Đóng" onClick={close} />
          </header>
          <div className="tc-drawer__body">
            {open.mode === 'view' ? (
              <>
                <ItemPreview key={open.item.id} item={open.item} />
                <dl className="tc-dl">
                  <dt>Môn · lớp</dt><dd>{SUBJECTS[open.item.subject]?.name} · Lớp {open.item.grade}</dd>
                  {open.item.skill ? <><dt>Yêu cầu cần đạt</dt><dd>{open.item.skill}</dd></> : null}
                  <dt>Dùng trong</dt><dd>{usage[open.item.id]?.join(', ') || 'Chưa dùng trong bài giảng nào'}</dd>
                  {open.item.updatedAt ? <><dt>Cập nhật</dt><dd>{relTime(open.item.updatedAt)}</dd></> : null}
                </dl>
              </>
            ) : (
              <ItemStudio item={open.item} onChange={(it) => setOpen({ ...open, item: it })} />
            )}
            <ErrorNote error={save.error ?? del.error} />
          </div>
          <footer className="tc-drawer__foot">
            {open.mode === 'view' ? (
              confirm ? (
                <ConfirmBar text={usage[open.item.id] ? `Đang dùng trong ${usage[open.item.id].length} bài giảng — xóa thì slide đó báo thiếu câu hỏi. Vẫn xóa?` : 'Xóa hoạt động này?'} busy={del.isPending} onCancel={() => setConfirm(false)} onConfirm={() => del.mutate(open.item.id, { onSuccess: close })} />
              ) : (
                <>
                  <Btn kind="danger" icon="trash" onClick={() => setConfirm(true)}>Xóa</Btn>
                  <span className="tc-ebar__spacer" />
                  <Btn onClick={() => duplicate(open.item)} title="Tạo một câu mới giống hệt câu này để sửa">Nhân bản câu này</Btn>
                  <Btn kind="primary" icon="pencil" onClick={() => setOpen({ ...open, mode: 'edit' })}>Sửa</Btn>
                </>
              )
            ) : (
              <>
                <span className="tc-ebar__spacer" />
                <Btn onClick={() => (open.isNew ? close() : setOpen({ item: q.data?.find((x) => x.id === open.item.id) ?? open.item, mode: 'view' }))}>Hủy</Btn>
                <Btn kind="primary" onClick={doSave} disabled={save.isPending}>{save.isPending ? 'Đang lưu…' : 'Lưu'}</Btn>
              </>
            )}
          </footer>
        </aside>
      ) : null}
      {play && me ? <GameSetupDialog user={me} items={picked.map((id) => (q.data ?? []).find((it) => it.id === id)).filter((x): x is Item => !!x)} onClose={() => setPlay(false)} /> : null}
      {arena && me ? <ArenaPoolDialog classes={myClasses} items={picked.map((id) => (q.data ?? []).find((it) => it.id === id)).filter((x): x is Item => !!x)} onClose={() => setArena(false)} onDone={(text) => { setArena(false); setToast({ text }); }} /> : null}
      {assign && me ? <AssignDialog items={picked.map((id) => (q.data ?? []).find((it) => it.id === id)).filter((x): x is Item => !!x)} me={me} onClose={() => setAssign(false)} /> : null}
      <QuickAddDialog open={quick} onClose={() => setQuick(false)} initial={{ ...(subject ? { subject } : {}), ...(grade ? { grade } : {}) }} onSaved={(n) => n > 0 && setToast({ text: `Đã lưu ${n} câu vào ngân hàng.` })} />
      <TypePickerDialog open={typePick} onClose={() => setTypePick(false)} onPick={(t) => { setTypePick(false); setOpen({ item: newItemOfType(t, grade || focus, subject || undefined), mode: 'edit', isNew: true }); }} />
    </div>
  );
}
