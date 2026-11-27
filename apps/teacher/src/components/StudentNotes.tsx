/**
 * Hồ sơ học sinh — "Thông tin bổ sung": dữ liệu thầy/cô thu thập bên ngoài ứng dụng (quan sát, sức khoẻ, gia đình,
 * kết quả thi bên ngoài…). Nhập tay, nhập từ tệp Word cho từng em, hoặc nhập Excel cho cả lớp (trang Hồ sơ học sinh).
 * Mặc định chỉ thầy/cô xem; tích "Cho phụ huynh xem" để hiện ở trang phụ huynh.
 */
import { useMemo, useRef, useState } from 'react';
import { NOTE_CATEGORIES, NOTE_CATEGORY_LABEL, NOTE_SOURCE_LABEL, useDeleteStudentNote, useSaveStudentNote, useStudentNotes, type NoteCategory, type StudentNote, type StudentNoteInput } from '@openedu/data';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading } from './common';
import { cx } from '../lib/format';
import { loadImportLib } from '../pages/itembank/lib';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (không qua múi giờ). */
const ymd = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s);
const blankNote = (studentId: string): StudentNoteInput => ({ studentId, category: 'quan-sat', title: '', body: '', fields: {}, date: today(), source: 'tay', shareParent: false });

export function StudentNotesCard({ studentId, studentName, parentView }: { studentId: string; studentName: string; parentView?: boolean }) {
  const q = useStudentNotes(studentId);
  const del = useDeleteStudentNote();
  const [cat, setCat] = useState<NoteCategory | 'all'>('all');
  const [edit, setEdit] = useState<StudentNoteInput | null>(null);
  const [askDel, setAskDel] = useState<string | null>(null);
  const [wordErr, setWordErr] = useState<Error | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const all = useMemo(() => (q.data ?? []).filter((n) => !parentView || n.shareParent), [q.data, parentView]);
  const cats = useMemo(() => NOTE_CATEGORIES.filter((c) => all.some((n) => n.category === c)), [all]);
  const list = all.filter((n) => cat === 'all' || n.category === cat);

  const fromWord = async (file: File) => {
    setWordErr(null);
    try {
      if (!/\.docx$/i.test(file.name)) throw new Error('Thầy/cô chọn tệp Word .docx nhé (tệp .doc đời cũ: mở bằng Word rồi “Lưu thành” .docx).');
      const lib = await loadImportLib();
      const t = lib.docxToText(new Uint8Array(await file.arrayBuffer()));
      const body = t.text.split('\n').map((l) => l.replace(/^✓\s*/, '').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!body) throw new Error('Tệp Word này không có chữ (có thể chỉ có hình ảnh).');
      setEdit({ ...blankNote(studentId), title: file.name.replace(/\.docx$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200), body, source: 'word', sourceName: file.name });
    } catch (e) { setWordErr(e as Error); }
  };

  return (
    <section className={cx('tc-card tc-notes', parentView && 'tc-notes--parent')} aria-label="Thông tin bổ sung" data-testid="notes-card">
      <header className="tc-card__head">
        <h2>Thông tin bổ sung</h2>
        <span className="tc-muted tc-small">{parentView ? 'Chỉ những ghi chép thầy/cô cho phụ huynh xem' : 'Dữ liệu thầy/cô thu thập bên ngoài — mặc định chỉ thầy/cô xem'}</span>
      </header>
      {!parentView ? (
        <div className="tc-row tc-wrap tc-noprint">
          <Btn size="sm" kind="primary" icon="plus" onClick={() => setEdit(blankNote(studentId))} data-testid="note-add">Thêm ghi chép</Btn>
          <Btn size="sm" icon="upload" onClick={() => fileRef.current?.click()} data-testid="note-word">Nhập từ Word</Btn>
          <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden aria-label="Chọn tệp Word" data-testid="note-word-file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromWord(f); }} />
          <span className="tc-small tc-muted">Nhập cho cả lớp từ Excel: trang <b>Hồ sơ học sinh</b> → “Nhập thông tin từ Excel”.</span>
        </div>
      ) : null}
      <ErrorNote error={q.error ?? wordErr ?? del.error} onRetry={() => void q.refetch()} />
      {cats.length > 1 ? (
        <div className="tc-row tc-wrap tc-noprint" role="group" aria-label="Lọc theo nhóm">
          <button type="button" className={cx('tc-chip tc-chip--btn', cat === 'all' && 'is-on')} aria-pressed={cat === 'all'} onClick={() => setCat('all')}>Tất cả {all.length}</button>
          {cats.map((c) => <button key={c} type="button" className={cx('tc-chip tc-chip--btn', cat === c && 'is-on')} aria-pressed={cat === c} onClick={() => setCat(c)}>{NOTE_CATEGORY_LABEL[c]} {all.filter((n) => n.category === c).length}</button>)}
        </div>
      ) : null}
      {q.isLoading ? <Loading /> : !list.length ? (
        <Empty icon="pencil" title={parentView ? 'Chưa có ghi chép cho phụ huynh' : 'Chưa có thông tin bổ sung'}>
          {parentView ? null : <>Ghi lại quan sát, kết quả khám sức khoẻ, thi bên ngoài, hoàn cảnh gia đình… của {studentName}.</>}
        </Empty>
      ) : (
        <ul className="tc-notelist">
          {list.map((n) => {
            const long = n.body.length > 280 && !open[n.id];
            return (
              <li key={n.id} className={cx(!n.shareParent && 'tc-noprint')} data-testid="note-item">
                <div className="tc-row tc-wrap">
                  <strong>{n.title}</strong>
                  <span className="tc-chip">{NOTE_CATEGORY_LABEL[n.category]}</span>
                  <span className="tc-small tc-muted">{ymd(n.date)} · {NOTE_SOURCE_LABEL[n.source]}{n.sourceName ? `: ${n.sourceName}` : ''}</span>
                  {n.shareParent ? <span className="tc-chip tc-chip--ok">Phụ huynh xem được</span> : null}
                  <span className="tc-ebar__spacer" />
                  {!parentView ? (
                    <span className="tc-row tc-noprint">
                      <Btn size="sm" kind="ghost" icon="pencil" aria-label={`Sửa ${n.title}`} onClick={() => setEdit(n)} />
                      <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xoá ${n.title}`} onClick={() => setAskDel(n.id)} data-testid="note-del" />
                    </span>
                  ) : null}
                </div>
                {Object.keys(n.fields).length ? (
                  <dl className="tc-notefields">{Object.entries(n.fields).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                ) : null}
                {n.body ? <p className={cx('tc-notebody', long && 'is-clamped')}>{n.body}</p> : null}
                {n.body.length > 280 ? <Btn size="sm" kind="ghost" className="tc-noprint" onClick={() => setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))}>{open[n.id] ? 'Thu gọn' : 'Xem thêm'}</Btn> : null}
                {askDel === n.id ? <ConfirmBar text={`Xoá ghi chép “${n.title}”?`} busy={del.isPending} onCancel={() => setAskDel(null)} onConfirm={() => del.mutate({ id: n.id, studentId }, { onSuccess: () => setAskDel(null) })} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      {edit ? <NoteDialog value={edit} studentName={studentName} onClose={() => setEdit(null)} /> : null}
    </section>
  );
}

function NoteDialog({ value, studentName, onClose }: { value: StudentNoteInput | StudentNote; studentName: string; onClose: () => void }) {
  const save = useSaveStudentNote();
  const [n, setN] = useState<StudentNoteInput>(value);
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries(value.fields ?? {}));
  const set = (p: Partial<StudentNoteInput>) => setN((x) => ({ ...x, ...p }));
  const fields = Object.fromEntries(rows.filter(([k, v]) => k.trim() && v.trim()));
  const ok = n.title.trim() && (n.body.trim() || Object.keys(fields).length);
  return (
    <Dialog open wide title={`${'id' in value && value.id ? 'Sửa ghi chép' : 'Thêm ghi chép'} — ${studentName}`} onClose={onClose} footer={<>
      <label className="tc-switch"><input type="checkbox" checked={n.shareParent} onChange={(e) => set({ shareParent: e.target.checked })} data-testid="note-share" /> Cho phụ huynh xem</label>
      <span className="tc-ebar__spacer" />
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" disabled={!ok || save.isPending} onClick={() => save.mutate({ ...n, fields }, { onSuccess: onClose })} data-testid="note-save">{save.isPending ? 'Đang lưu…' : 'Lưu'}</Btn>
    </>}>
      <div className="tc-stack">
        {n.source === 'word' ? <p className="tc-small tc-muted">Nội dung lấy từ tệp <b>{n.sourceName}</b> — thầy/cô đọc lại, sửa nếu cần rồi lưu.</p> : null}
        <div className="tc-grid2 tc-grid2--tight">
          <Field label="Tiêu đề"><input className="tc-input" value={n.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="vd: Khám sức khoẻ đầu năm" aria-label="Tiêu đề ghi chép" /></Field>
          <div className="tc-grid2 tc-grid2--tight">
            <Field label="Nhóm"><select className="tc-input" value={n.category} onChange={(e) => set({ category: e.target.value as NoteCategory })} aria-label="Nhóm ghi chép">{NOTE_CATEGORIES.map((c) => <option key={c} value={c}>{NOTE_CATEGORY_LABEL[c]}</option>)}</select></Field>
            <Field label="Ngày"><input className="tc-input" type="date" value={n.date} onChange={(e) => set({ date: e.target.value })} aria-label="Ngày ghi nhận" /></Field>
          </div>
        </div>
        <Field label="Nội dung"><textarea className="tc-input" rows={8} maxLength={20000} value={n.body} onChange={(e) => set({ body: e.target.value })} aria-label="Nội dung ghi chép" placeholder="Ghi lại điều thầy/cô quan sát / thu thập được…" /></Field>
        <div className="tc-stack">
          <span className="tc-field__label">Dữ liệu dạng bảng (không bắt buộc) — vd Chiều cao: 132 cm</span>
          {rows.map(([k, v], i) => (
            <div key={i} className="tc-row">
              <input className="tc-input tc-input--sm" placeholder="Mục" value={k} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} aria-label={`Tên mục ${i + 1}`} />
              <input className="tc-input tc-input--sm tc-grow" placeholder="Giá trị" value={v} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} aria-label={`Giá trị mục ${i + 1}`} />
              <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xoá mục ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Btn size="sm" icon="plus" onClick={() => setRows([...rows, ['', '']])} data-testid="note-field-add">Thêm mục</Btn>
        </div>
        <ErrorNote error={save.error} />
      </div>
    </Dialog>
  );
}
