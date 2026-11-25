/**
 * Nhập thông tin bổ sung cho NHIỀU học sinh từ Excel (trang Hồ sơ học sinh).
 * 1) Tải tệp mẫu có sẵn danh sách lớp → 2) điền / đổi cột → 3) chọn tệp, xem trước (ghép học sinh) → 4) nhập.
 * Mỗi học sinh có dữ liệu → một ghi chép trong hồ sơ (tiêu đề, nhóm, ngày chung cho cả lần nhập).
 */
import { useRef, useState } from 'react';
import type { ClassInfo, Profile } from '@openedu/contracts';
import { NOTE_CATEGORIES, NOTE_CATEGORY_LABEL, useImportStudentNotes, type NoteCategory, type NotesSheet } from '@openedu/data';
import { Btn, Dialog, ErrorNote, Field } from './common';
import { downloadBytes, loadImportLib } from '../pages/itembank/lib';
import { cx } from '../lib/format';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function NotesExcelImport({ cls, students, onClose, onDone }: { cls: ClassInfo; students: Profile[]; onClose: () => void; onDone: (n: number) => void }) {
  const imp = useImportStudentNotes();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<NotesSheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState<Error | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<NoteCategory>('hoc-tap');
  const [date, setDate] = useState(today());
  const [share, setShare] = useState(false);
  const ok = sheet?.rows.filter((r) => r.student) ?? [];
  const bad = sheet?.rows.filter((r) => !r.student) ?? [];

  const template = async () => {
    setErr(null);
    try {
      const lib = await loadImportLib();
      downloadBytes(lib.buildNotesTemplate(students, cls.name), `thong-tin-bo-sung-lop-${cls.name.replace(/[^\p{L}\p{N}]+/gu, '')}.xlsx`, XLSX);
    } catch (e) { setErr(e as Error); }
  };
  const read = async (f: File) => {
    setErr(null); setSheet(null);
    try {
      const lib = await loadImportLib();
      const { rows } = lib.readXlsx(new Uint8Array(await f.arrayBuffer()));
      const s = lib.parseNotesSheet(rows, students);
      if (!s.rows.length) throw new Error('Tệp chưa có dòng nào có dữ liệu (ngoài họ tên).');
      setSheet(s);
      setFileName(f.name);
      if (!title) setTitle(f.name.replace(/\.xlsx$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200));
    } catch (e) { setErr(e as Error); }
  };
  const run = () => {
    imp.mutate(ok.map((r) => ({
      studentId: r.student!.id, category, title: title.trim(), body: r.body, fields: r.fields, date, source: 'excel' as const, sourceName: fileName, shareParent: share,
    })), { onSuccess: (n) => onDone(n) });
  };

  return (
    <Dialog open wide title={`Nhập thông tin bổ sung từ Excel — Lớp ${cls.name}`} onClose={onClose} footer={<>
      <label className="tc-switch"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Cho phụ huynh xem</label>
      <span className="tc-ebar__spacer" />
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" disabled={!ok.length || !title.trim() || imp.isPending} onClick={run} data-testid="nx-import">{imp.isPending ? 'Đang nhập…' : `Nhập cho ${ok.length} em`}</Btn>
    </>}>
      <div className="tc-stack tc-nximport">
        <ol className="tc-small tc-stack" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Tải <b>tệp mẫu</b> (có sẵn danh sách {students.length} em của lớp). Đổi tên, thêm hoặc xoá các cột dữ liệu tuỳ ý — vd Thị lực, Nhóm máu, Điểm thi Violympic, Sở thích. Cột <b>Ghi chú</b> là nội dung.</li>
          <li>Điền dữ liệu rồi chọn tệp. OPEN-EDU ghép học sinh theo Tên đăng nhập → Mã HS → Họ và tên.</li>
        </ol>
        <div className="tc-row tc-wrap">
          <Btn icon="upload" onClick={() => void template()} data-testid="nx-template">Tải tệp mẫu Excel</Btn>
          <Btn kind="primary" icon="upload" onClick={() => fileRef.current?.click()} data-testid="nx-pick">Chọn tệp Excel đã điền</Btn>
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden aria-label="Chọn tệp Excel" data-testid="nx-file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f); }} />
          {fileName ? <span className="tc-small tc-muted">{fileName}</span> : null}
        </div>
        <ErrorNote error={err ?? imp.error} />
        {sheet ? (
          <>
            <div className="tc-grid2 tc-grid2--tight">
              <Field label="Tiêu đề cho các ghi chép"><input className="tc-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="vd: Khám sức khoẻ đầu năm" aria-label="Tiêu đề ghi chép" /></Field>
              <div className="tc-grid2 tc-grid2--tight">
                <Field label="Nhóm"><select className="tc-input" value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)} aria-label="Nhóm ghi chép">{NOTE_CATEGORIES.map((c) => <option key={c} value={c}>{NOTE_CATEGORY_LABEL[c]}</option>)}</select></Field>
                <Field label="Ngày"><input className="tc-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Ngày ghi nhận" /></Field>
              </div>
            </div>
            <p className="tc-small" data-testid="nx-summary">
              <b>{ok.length}</b> em ghép được{bad.length ? <>, <b className="tc-warn">{bad.length}</b> dòng chưa ghép (sẽ bỏ qua)</> : null}. Cột dữ liệu: {sheet.dataColumns.length ? sheet.dataColumns.join(', ') : '—'}{sheet.bodyColumn ? ` · nội dung: ${sheet.bodyColumn}` : ''}.
            </p>
            <div className="tc-tablewrap" style={{ maxHeight: 320 }}>
              <table className="tc-table">
                <thead><tr><th>Dòng</th><th>Học sinh</th>{sheet.dataColumns.map((c) => <th key={c}>{c}</th>)}{sheet.bodyColumn ? <th>{sheet.bodyColumn}</th> : null}</tr></thead>
                <tbody>
                  {sheet.rows.map((r) => (
                    <tr key={r.rowNo} className={cx(!r.student && 'is-bad')}>
                      <td>{r.rowNo}</td>
                      <td>{r.student ? r.student.name : <>{r.name} — <i>{r.problem}</i></>}</td>
                      {sheet.dataColumns.map((c) => <td key={c}>{r.fields[c] ?? ''}</td>)}
                      {sheet.bodyColumn ? <td>{r.body}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
