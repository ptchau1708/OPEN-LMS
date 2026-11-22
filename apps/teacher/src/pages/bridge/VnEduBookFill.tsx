import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SUBJECTS, TT27_TERM_LABEL } from '@openedu/contracts';
import { bridge, useDataSource } from '@openedu/data';
import { Btn } from '../../components/common';
import { baseName, type BridgeData, type OpenedFile } from './shared';

const XLS_MIME = 'application/vnd.ms-excel';
const normClass = (s: string) => s.toLowerCase().replace(/^lớp\s*/, '').replace(/[^0-9a-zà-ỹ]/gi, '');

/**
 * Tệp VnEdu được nhận ra tự động (sổ điểm các môn / mẫu năng lực phẩm chất): điền mọi trang cùng lúc,
 * không phải ghép cột. Ra cùng định dạng tệp gốc (.xls).
 */
export function VnEduBookFill({ data, file, book, onManual, onClear, onChanged }: {
  data: BridgeData;
  file: OpenedFile;
  book: bridge.VnEduBook;
  onManual: () => void;
  onClear: () => void;
  onChanged: () => void;
}) {
  const ds = useDataSource();
  const [overwrite, setOverwrite] = useState(true);
  const [nlpcTerm, setNlpcTerm] = useState(String(bridge.defaultNlpcTerm(data.termId)));
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<{ fileName: string; filled: number } | null>(null);
  const [error, setError] = useState('');
  const wb = file.opened.wb;

  const plan = useMemo(() => bridge.planVnEduFill(wb, book, data, { overwrite, nlpcTerm: /^\d+$/.test(nlpcTerm.trim()) ? Number(nlpcTerm.trim()) : nlpcTerm.trim() }), [wb, book, data, overwrite, nlpcTerm]);
  const nameOf = (id: string) => data.students.find((s) => s.id === id)?.name ?? '';

  // Mã VnEdu chưa lưu trong OPEN-EDU (lấy từ trang đầu tiên có danh sách).
  const codeSheet = book.kind === 'so-diem' ? plan.sheets.find((s) => s.matches.length) : undefined;
  const codeSheetTable = codeSheet ? book.sheets.find((s) => s.sheetName === codeSheet.sheetName)?.table : undefined;
  const newCodes = useMemo(() => {
    if (!codeSheet || !codeSheetTable) return [];
    return codeSheet.matches.flatMap((m) => {
      const code = codeSheetTable.students.find((r) => r.row === m.row)?.code ?? '';
      const st = data.students.find((s) => s.id === m.studentId);
      return st && code && st.externalCode !== code ? [{ studentId: st.id, externalCode: code }] : [];
    });
  }, [codeSheet, codeSheetTable, data.students]);
  const unmatched = codeSheet && codeSheetTable ? codeSheet.matches.filter((m) => !m.studentId).map((m) => codeSheetTable.students.find((r) => r.row === m.row)?.name ?? `dòng ${m.row + 1}`) : [];
  const saveCodes = useMutation({
    mutationFn: () => bridge.getBridgeSource(ds).setExternalIds(data.cls.id, newCodes),
    onSuccess: () => onChanged(),
  });

  const warnings: string[] = [];
  if (book.termId && book.termId !== data.termId) warnings.push(`Tệp là “${book.termText ?? TT27_TERM_LABEL[book.termId]}” nhưng trang đang lấy đánh giá “${TT27_TERM_LABEL[data.termId]}”. Đổi ô “Kì” ở đầu trang thành “${TT27_TERM_LABEL[book.termId]}” rồi tải tệp lại.`);
  if (book.schoolYear && book.schoolYear !== data.schoolYear) warnings.push(`Tệp là năm học ${book.schoolYear}, OPEN-EDU đang dùng năm học ${data.schoolYear}.`);
  if (book.className && normClass(book.className) !== normClass(data.cls.name)) warnings.push(`Tệp của lớp ${book.className}, thầy cô đang chọn lớp ${data.cls.name}.`);

  const download = () => {
    setError('');
    try {
      const res = bridge.writeVnEduFill(file.bytes, wb, plan);
      const fileName = `${baseName(file.name)}-da-dien.${res.ext}`;
      bridge.downloadBytes(fileName, res.bytes, res.ext === 'xls' ? XLS_MIME : bridge.XLSX_MIME);
      setDone({ fileName, filled: res.filled });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa tạo được tệp.');
    }
  };

  const nlpc = book.kind === 'nlpc' ? plan.sheets[0] : undefined;
  const subjectName = (s: bridge.VnEduSheetPlan) => (s.subjectId ? SUBJECTS[s.subjectId]?.name : '') ?? '';

  return (
    <div className="br-stack" data-testid="br-vnedu">
      <div className="tc-alert tc-alert--ok br-filesum" role="status">
        <span>
          <strong>Đã nhận ra tệp VnEdu</strong>: {bridge.describeBook(book)} · <strong>{file.name}</strong>
          {book.key ? <span className="tc-muted"> · mã bảng {book.key}</span> : null}
        </span>
        <span className="tc-row tc-wrap">
          <Btn size="sm" kind="ghost" onClick={onManual}>Tự ghép cột</Btn>
          <Btn size="sm" onClick={onClear}>Chọn tệp khác</Btn>
        </span>
      </div>
      {warnings.map((w) => <div key={w} className="tc-alert tc-alert--warn" role="alert"><span>{w}</span></div>)}

      {book.kind === 'so-diem' ? (
        <section className="tc-card br-step">
          <header className="tc-card__head">
            <h2>1. Các môn trong tệp</h2>
            <span className="tc-chip tc-chip--ok" data-testid="br-vn-filled">Sẽ điền {plan.filled} ô</span>
          </header>
          <div className="tc-tablewrap">
            <table className="tc-table br-table">
              <thead><tr><th>Trang tính</th><th>Môn</th><th>Học sinh trong tệp</th><th>Ghép được</th><th>Sẽ điền</th><th>Ghi chú</th><th /></tr></thead>
              <tbody>
                {book.sheets.map((s, i) => {
                  const r = plan.sheets[i];
                  const matched = r.matches.filter((m) => m.studentId).length;
                  return (
                    <tr key={s.sheetName}>
                      <td>{s.sheetName}</td>
                      <td>{s.label}{s.subjectId && subjectName(s) ? <span className="tc-muted"> → {subjectName(s)}</span> : null}</td>
                      <td>{s.table?.students.length ?? 0}</td>
                      <td>{r.matches.length ? `${matched}/${r.matches.length}` : '–'}</td>
                      <td><b>{r.filled}</b>{r.noData ? <span className="tc-muted" title="OPEN-EDU chưa có đánh giá TT27 cho các ô này"> · thiếu {r.noData}</span> : null}{r.kept ? <span className="tc-muted"> · giữ {r.kept}</span> : null}</td>
                      <td className="tc-small tc-muted">{s.skip ? bridge.VNEDU_SKIP_LABEL[s.skip] : Object.keys(s.mapping).map((c) => s.table?.columns[Number(c)]?.label).join(', ')}</td>
                      <td>{r.preview.length ? <Btn size="sm" kind="ghost" onClick={() => setOpen(open === s.sheetName ? null : s.sheetName)}>{open === s.sheetName ? 'Ẩn' : 'Xem trước'}</Btn> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="tc-small tc-muted">
            Lấy từ đánh giá TT27 “{TT27_TERM_LABEL[data.termId]}” trong OPEN-EDU: Nhận xét, điểm KT (số nguyên 1–10) và mức XL (T/H/C). Cột “Sau thi lại” để nguyên.
            Môn OPEN-EDU chưa có (Lịch sử và Địa lí, Đạo đức, Tin học, Công nghệ, GD thể chất, HĐ trải nghiệm…) thầy cô nhập trên VnEdu như cũ.
          </p>
          {unmatched.length ? (
            <div className="tc-alert tc-alert--warn"><span>Chưa ghép được {unmatched.length} em (dòng để nguyên): {unmatched.join(', ')}. Nếu tên trong OPEN-EDU viết khác, thầy cô dùng “Tự ghép cột” để chọn tay, hoặc tab “Nhập danh sách”.</span></div>
          ) : null}
          {newCodes.length ? (
            <div className="tc-row tc-wrap br-actions">
              <Btn size="sm" icon="check" disabled={saveCodes.isPending} onClick={() => saveCodes.mutate()} data-testid="br-vn-codes">Lưu mã học sinh VnEdu vào OPEN-EDU ({newCodes.length} em)</Btn>
              <span className="tc-small tc-muted">Cần để điền mẫu năng lực phẩm chất và ghép chắc chắn ở lần sau.</span>
              {saveCodes.isSuccess ? <span className="tc-small tc-ok">Đã lưu mã cho {saveCodes.data} em.</span> : null}
              {saveCodes.error ? <span className="tc-small br-err">{saveCodes.error instanceof Error ? saveCodes.error.message : 'Chưa lưu được.'}</span> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {nlpc ? (
        <section className="tc-card br-step">
          <header className="tc-card__head">
            <h2>1. Năng lực, phẩm chất</h2>
            <span className="tc-chip tc-chip--ok" data-testid="br-vn-filled">Sẽ điền {plan.filled} ô</span>
          </header>
          {nlpc.added !== undefined ? (
            <p className="tc-small">Mẫu đang trống → OPEN-EDU viết thêm <b>{nlpc.added}</b> dòng (STT, mã học sinh, họ tên, học kì, các mức T/Đ/C) theo đánh giá TT27 “{TT27_TERM_LABEL[data.termId]}”.</p>
          ) : <p className="tc-small">Mẫu đã có {nlpc.matches.length} dòng học sinh → ghép theo mã / họ tên rồi điền các mức T/Đ/C.</p>}
          {nlpc.missingCode?.length ? (
            <div className="tc-alert tc-alert--warn"><span>{nlpc.missingCode.length} em chưa có mã học sinh VnEdu nên chưa đưa vào tệp: {nlpc.missingCode.join(', ')}. Thầy cô tải sổ điểm VnEdu của lớp vào đây rồi bấm “Lưu mã học sinh VnEdu vào OPEN-EDU”, hoặc nhập mã ở tab “Mã học sinh”.</span></div>
          ) : null}
          <label className="tc-row tc-small">Giá trị ghi vào cột “Học kì” <input className="tc-input tc-input--sm" style={{ width: 80 }} value={nlpcTerm} onChange={(e) => setNlpcTerm(e.target.value)} aria-label="Giá trị cột Học kì" /></label>
          <p className="tc-small tc-muted">Ba cột “Nhận xét về…” để trống để thầy cô tự viết. Nếu VnEdu báo lỗi cột Học kì, thầy cô đổi giá trị cho đúng cách VnEdu yêu cầu rồi tải lại.</p>
          <Btn size="sm" kind="ghost" onClick={() => setOpen(open ? null : nlpc.sheetName)}>{open ? 'Ẩn xem trước' : 'Xem trước'}</Btn>
        </section>
      ) : null}

      {open ? (() => {
        const i = book.sheets.findIndex((s) => s.sheetName === open);
        const s = book.sheets[i];
        const r = plan.sheets[i];
        const cols = [...new Set(r.preview.flatMap((p) => Object.keys(p.values).map(Number)))].sort((a, b) => a - b);
        return (
          <section className="tc-card br-step">
            <h2>Xem trước: {s.label}</h2>
            <div className="tc-tablewrap br-scroll">
              <table className="tc-table br-table br-preview">
                <thead><tr><th>Dòng</th><th>Học sinh</th>{cols.map((c) => <th key={c}><b>{bridge.colLetters(c)}</b> {s.table?.columns[c]?.label}</th>)}</tr></thead>
                <tbody>
                  {r.preview.map((p) => (
                    <tr key={p.row}>
                      <td>{p.row + 1}</td><td>{nameOf(p.studentId)}</td>
                      {cols.map((c) => <td key={c} className={p.values[c] !== undefined ? 'br-cell--new' : 'br-cell--skip'} title={typeof p.values[c] === 'string' ? String(p.values[c]) : undefined}>{p.values[c] === undefined ? '–' : String(p.values[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })() : null}

      <section className="tc-card br-step">
        <h2>2. Tải tệp đã điền</h2>
        <label className="tc-row tc-small br-check">
          <input type="checkbox" checked={!overwrite} onChange={(e) => setOverwrite(!e.target.checked)} /> Giữ nguyên ô đã có dữ liệu trong tệp (chỉ điền ô trống)
        </label>
        <div className="tc-row tc-wrap br-actions">
          <Btn kind="primary" icon="check" size="lg" data-testid="br-vn-download" disabled={!plan.filled} onClick={download}>Tải tệp đã điền (.{file.opened.wb.format === 'xlsx' ? 'xlsx' : 'xls'})</Btn>
          <span className="tc-small tc-muted">Giữ nguyên định dạng, cột ẩn, mã bảng của VnEdu. Tệp gốc không bị sửa và không rời khỏi máy thầy cô.</span>
        </div>
        {error ? <div className="tc-alert tc-alert--error" role="alert"><span>{error}</span></div> : null}
        {done ? (
          <div className="tc-alert tc-alert--ok" role="status" data-testid="br-vn-done">
            <span>Đã tải “{done.fileName}” ({done.filled} ô). Trên VnEdu, vào đúng màn hình nhập điểm / nhận xét của lớp và chọn “Nhập từ Excel”, rồi chọn tệp này. Lần đầu thầy cô nên mở tệp kiểm tra vài dòng trước khi nhập.</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
