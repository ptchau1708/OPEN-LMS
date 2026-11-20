import { useMemo, useState } from 'react';
import { uid } from '@openedu/contracts';
import { ACTIVITY_TYPES, SUBJECT_LIST, SUBJECTS, type Grade, type Item, type ItemType, type SubjectId } from '@openedu/contracts';
import { useDeleteItem, useItems, useLessons, useSaveItem } from '@openedu/data';
import { Btn, ConfirmBar, Empty, ErrorNote, Loading, PageHead } from '../components/common';
import { ItemPreview, ItemStudio, newItemOfType, TypeBadge, TypePickerDialog } from '../components/items';
import { cx, relTime, shorten } from '../lib/format';
import { exportBankXlsx, QuickAddDialog } from './itembank/QuickAdd';

export default function ItemBank() {
  const [subject, setSubject] = useState<SubjectId | ''>('');
  const [grade, setGrade] = useState<Grade | 0>(0);
  const [type, setType] = useState<ItemType | ''>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{ item: Item; mode: 'view' | 'edit'; isNew?: boolean } | null>(null);
  const [typePick, setTypePick] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [quick, setQuick] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
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
  const list = q.data ? [...q.data].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')) : [];

  const close = () => { setOpen(null); setConfirm(false); save.reset(); };
  const doSave = () => open && save.mutate(open.item, { onSuccess: (it) => setOpen({ item: it, mode: 'view' }) });
  /** Nhân bản: mở bản sao (id mới) ở chế độ sửa, chưa lưu. */
  const duplicate = (it: Item) => {
    const copy = JSON.parse(JSON.stringify(it)) as Item;
    delete copy.updatedAt;
    setConfirm(false);
    setOpen({ item: { ...copy, id: uid('it'), prompt: { ...copy.prompt, text: `${copy.prompt.text} (bản sao)` } } as Item, mode: 'edit', isNew: true });
  };
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
      <PageHead title="Ngân hàng hoạt động" sub="Câu hỏi và hoạt động dùng chung cho bài giảng, luyện tập và lớp trực tiếp." actions={<>
        <Btn icon="upload" onClick={() => void doExport()} disabled={!list.length} title="Xuất các câu đang hiện (theo bộ lọc) ra Excel, cùng mẫu với nhập">Xuất ra Excel</Btn>
        <Btn icon="plus" onClick={() => setQuick(true)} data-testid="qb-open">Thêm nhanh nhiều câu</Btn>
        <Btn kind="primary" icon="plus" onClick={() => setTypePick(true)}>Tạo hoạt động</Btn>
      </>} />
      {toast ? <div className={cx('tc-alert tc-bank__toast', toast.error ? 'tc-alert--error' : 'tc-alert--ok')} role="status"><span>{toast.text}</span><Btn size="sm" kind="ghost" icon="close" aria-label="Đóng thông báo" onClick={() => setToast(null)} /></div> : null}
      <div className="tc-filters tc-card tc-card--flat">
        <input className="tc-input tc-filters__search" placeholder="Tìm theo đề bài, kĩ năng, thẻ…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="tc-input" value={subject} onChange={(e) => setSubject(e.target.value as SubjectId | '')} aria-label="Môn"><option value="">Mọi môn</option>{SUBJECT_LIST.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="tc-input" value={grade} onChange={(e) => setGrade(Number(e.target.value) as Grade | 0)} aria-label="Lớp"><option value={0}>Mọi lớp</option>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select>
        <select className="tc-input" value={type} onChange={(e) => setType(e.target.value as ItemType | '')} aria-label="Dạng"><option value="">Mọi dạng</option>{ACTIVITY_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}{t.isNew ? ' (mới)' : ''}</option>)}</select>
        <span className="tc-muted tc-small">{q.data ? `${q.data.length} hoạt động` : ''}</span>
      </div>
      {q.isLoading ? <Loading /> : !list.length ? <Empty icon="puzzle" title="Không có hoạt động phù hợp">Bỏ bớt bộ lọc hoặc tạo hoạt động mới.</Empty> : (
        <ul className="tc-list tc-card tc-card--flush">
          {list.map((it) => (
            <li key={it.id}>
              <button type="button" className={cx('tc-listrow', open?.item.id === it.id && 'is-active')} onClick={() => { setConfirm(false); setOpen({ item: it, mode: 'view' }); }}>
                <TypeBadge type={it.type} />
                <span className="tc-listrow__main">{shorten(it.prompt.text, 120)}</span>
                <span className="tc-muted tc-small tc-listrow__meta">{SUBJECTS[it.subject]?.name} · Lớp {it.grade}{usage[it.id] ? ` · ${usage[it.id].length} bài` : ''}</span>
              </button>
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
      <QuickAddDialog open={quick} onClose={() => setQuick(false)} initial={{ ...(subject ? { subject } : {}), ...(grade ? { grade } : {}) }} onSaved={(n) => n > 0 && setToast({ text: `Đã lưu ${n} câu vào ngân hàng.` })} />
      <TypePickerDialog open={typePick} onClose={() => setTypePick(false)} onPick={(t) => { setTypePick(false); setOpen({ item: newItemOfType(t, grade || undefined, subject || undefined), mode: 'edit', isNew: true }); }} />
    </div>
  );
}
