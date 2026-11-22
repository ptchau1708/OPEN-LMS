import { useEffect, useMemo, useState } from 'react';
import { bridge } from '@openedu/data';
import { Btn, Empty } from '../../components/common';
import { applyPicks, baseName, ExcelPicker, FileSummary, MatchChip, StudentSelect, type BridgeData, type OpenedFile } from './shared';
import { VnEduBookFill } from './VnEduBookFill';

/** "Điền vào mẫu": tải tệp từ VnEdu → ghép học sinh → chọn dữ liệu cho từng cột → xem trước → tải tệp đã điền. */
export function TemplateFill({ data, onChanged }: { data: BridgeData; onChanged: () => void }) {
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [manual, setManual] = useState(false);
  const book = useMemo(() => (file ? bridge.recognizeVnEdu(file.opened.wb) : null), [file]);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [mapping, setMapping] = useState<bridge.ColumnMapping>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [done, setDone] = useState<{ mode: 'patched' | 'rebuilt'; note?: string; filled: number; formulas: number; fileName: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');

  const fields = useMemo(() => bridge.bridgeFields(data), [data]);
  const groups = useMemo(() => {
    const m = new Map<string, bridge.BridgeField[]>();
    for (const f of fields) m.set(f.group, [...(m.get(f.group) ?? []), f]);
    return [...m.entries()];
  }, [fields]);
  const table = file?.opened.table;
  const sheet = file ? file.opened.wb.sheets[file.opened.sheetIndex] : undefined;
  const auto = useMemo(() => (table ? bridge.matchRows(table.students, bridge.toMatchStudents(data)) : []), [table, data]);
  const matches = useMemo(() => applyPicks(auto, picks), [auto, picks]);
  const taken = useMemo(() => new Set(matches.map((m) => m.studentId).filter((x): x is string => !!x)), [matches]);
  const summary = bridge.matchSummary(matches);

  useEffect(() => {
    if (!table) return;
    const saved = bridge.loadSavedMapping(table);
    const valid = new Set(fields.map((f) => f.id));
    if (saved) {
      // Đề kiểm tra đổi theo tháng: trường đã lưu không còn trong danh mục thì bỏ, GV chọn lại.
      setMapping(Object.fromEntries(Object.entries(saved.mapping).filter(([, f]) => valid.has(f))));
      setSavedAt(saved.savedAt);
    } else {
      setMapping(bridge.suggestMapping(table, fields));
      setSavedAt(null);
    }
    setPicks({});
    setDone(null);
    setError('');
    // chỉ chạy khi đổi tệp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const plan = useMemo(() => (table && sheet ? bridge.buildFillPlan(sheet, table, matches, mapping, data, { overwrite }) : null), [table, sheet, matches, mapping, data, overwrite]);
  const mappedCols = Object.keys(mapping).map(Number).filter((c) => mapping[c]).sort((a, b) => a - b);
  const targetCols = table ? table.columns.filter((c) => c.label && c.kind !== 'stt' && c.kind !== 'name' && c.kind !== 'lastName' && c.kind !== 'firstName') : [];
  const nameOf = (id?: string) => data.students.find((s) => s.id === id)?.name ?? '';

  const download = () => {
    if (!file || !table || !plan) return;
    setError('');
    try {
      const res = bridge.fillTemplate(file.bytes, file.opened.wb, file.opened.sheetIndex, table, plan);
      const fileName = `${baseName(file.name)}-da-dien.${res.ext}`;
      bridge.downloadBytes(fileName, res.bytes, res.ext === 'xls' ? 'application/vnd.ms-excel' : bridge.XLSX_MIME);
      bridge.saveMapping(table, mapping);
      setSavedAt(new Date().toISOString());
      setDone({ mode: res.mode, note: res.note, filled: plan.filled, formulas: res.formulasReplaced, fileName });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa tạo được tệp.');
    }
  };

  if (!file || !table || !sheet) {
    return (
      <section className="tc-card br-step">
        <h2>Điền điểm, nhận xét vào tệp tải từ VnEdu</h2>
        <ol className="br-howto">
          <li>Trên VnEdu, tải tệp Excel mẫu của lớp (sổ điểm, bảng nhận xét TT27, danh sách…) về máy.</li>
          <li>Tải tệp đó lên đây. OPEN-EDU tự tìm dòng tiêu đề và ghép từng dòng với học sinh của lớp.</li>
          <li>Chọn dữ liệu cho từng cột, xem trước, rồi tải tệp đã điền về và nhập lại vào VnEdu.</li>
        </ol>
        <ExcelPicker testId="br-fill-file" label="Chọn tệp Excel từ VnEdu" hint="Tệp .xls hoặc .xlsx. Sổ điểm các môn và mẫu nhận xét năng lực phẩm chất của VnEdu được nhận ra và điền tự động. Tệp giữ nguyên định dạng, không rời khỏi máy thầy cô." onOpen={(f) => { setManual(false); setFile(f); }} />
      </section>
    );
  }

  if (book && !manual) return <VnEduBookFill data={data} file={file} book={book} onManual={() => setManual(true)} onClear={() => setFile(null)} onChanged={onChanged} />;

  const review = matches.filter((m) => !m.studentId || m.status === 'manual' || m.status === 'loose');
  const shown = showAll ? matches : review;

  return (
    <div className="br-stack">
      <FileSummary file={file} onClear={() => setFile(null)} />

      <section className="tc-card br-step">
        <header className="tc-card__head">
          <h2>1. Ghép học sinh</h2>
          <span className="tc-row tc-wrap">
            <span className="tc-chip tc-chip--ok" data-testid="br-matched">Đã ghép {summary.matched}/{matches.length}</span>
            {summary.review ? <span className="tc-chip tc-chip--warn">Cần chọn: {summary.review}</span> : null}
            {summary.missing ? <span className="tc-chip tc-chip--warn">Chưa thấy: {summary.missing}</span> : null}
            <Btn size="sm" kind="ghost" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Chỉ hiện dòng cần xem' : 'Hiện tất cả'}</Btn>
          </span>
        </header>
        {!shown.length ? <p className="tc-small tc-ok">Mọi dòng đều khớp chắc chắn (theo mã hoặc đúng họ tên).</p> : (
          <div className="tc-tablewrap br-scroll">
            <table className="tc-table br-table">
              <thead><tr><th>Dòng</th><th>Mã trong tệp</th><th>Họ tên trong tệp</th><th>Kết quả</th><th>Học sinh OPEN-EDU</th></tr></thead>
              <tbody>
                {shown.map((m) => {
                  const r = table.students.find((s) => s.row === m.row);
                  return (
                    <tr key={m.row}>
                      <td>{m.row + 1}</td><td>{r?.code}</td><td>{r?.name}</td>
                      <td><MatchChip status={m.status} /></td>
                      <td><StudentSelect label={`Học sinh cho dòng ${m.row + 1}`} students={data.students} value={m.studentId ?? ''} candidates={m.candidates} taken={taken} onChange={(id) => setPicks((p) => ({ ...p, [m.row]: id }))} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="tc-small tc-muted">“Khớp gần đúng” là khi tệp ghi đủ họ tên (Nguyễn Minh Hải) còn OPEN-EDU ghi tên ngắn (Minh Hải). Dòng không ghép sẽ được để nguyên.</p>
      </section>

      <section className="tc-card br-step">
        <header className="tc-card__head">
          <h2>2. Chọn dữ liệu cho từng cột</h2>
          <span className="tc-row tc-wrap">
            {savedAt ? <span className="tc-chip tc-chip--ok" title="Mẫu này đã dùng trước đây">Đã nhớ cách ghép ({new Date(savedAt).toLocaleDateString('vi-VN')})</span> : mappedCols.length ? <span className="tc-chip">Gợi ý tự động — thầy cô xem lại</span> : null}
            {mappedCols.length ? <Btn size="sm" kind="ghost" onClick={() => { setMapping({}); if (savedAt) { bridge.forgetMapping(table); setSavedAt(null); } }}>Bỏ chọn tất cả</Btn> : null}
          </span>
        </header>
        <div className="br-map">
          {targetCols.map((c) => (
            <label key={c.index} className={`br-map__row${mapping[c.index] ? ' is-on' : ''}`}>
              <span className="br-map__col"><b>{bridge.colLetters(c.index)}</b> {c.label}</span>
              <select className="tc-input tc-input--sm" data-testid={`br-map-${c.index}`} value={mapping[c.index] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [c.index]: e.target.value }))}>
                <option value="">— Không điền —</option>
                {groups.map(([g, list]) => <optgroup key={g} label={g}>{list.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>)}
              </select>
            </label>
          ))}
        </div>
        <label className="tc-row tc-small br-check">
          <input type="checkbox" checked={!overwrite} onChange={(e) => setOverwrite(!e.target.checked)} /> Giữ nguyên ô đã có dữ liệu trong tệp (chỉ điền ô trống)
        </label>
      </section>

      <section className="tc-card br-step">
        <header className="tc-card__head">
          <h2>3. Xem trước và tải về</h2>
          {plan ? <span className="tc-row tc-wrap">
            <span className="tc-chip tc-chip--ok" data-testid="br-filled">Sẽ điền {plan.filled} ô</span>
            {plan.noData ? <span className="tc-chip" title="OPEN-EDU chưa có dữ liệu cho các ô này nên để nguyên">Chưa có dữ liệu: {plan.noData} ô</span> : null}
            {plan.kept ? <span className="tc-chip">Giữ nguyên: {plan.kept} ô</span> : null}
          </span> : null}
        </header>
        {!mappedCols.length || !plan ? <Empty icon="pencil" title="Chưa chọn cột nào"><span className="tc-small tc-muted">Chọn dữ liệu cho ít nhất một cột ở bước 2.</span></Empty> : (
          <>
            <div className="tc-tablewrap br-scroll">
              <table className="tc-table br-table br-preview">
                <thead><tr><th>Dòng</th><th>Học sinh</th>{mappedCols.map((c) => <th key={c}><b>{bridge.colLetters(c)}</b> {table.columns[c]?.label}</th>)}</tr></thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row + 1}</td><td>{nameOf(r.studentId)}</td>
                      {r.cells.map((cell) => (
                        <td key={cell.c} className={cell.skipped ? 'br-cell--skip' : 'br-cell--new'} title={cell.skipped === 'kept' ? 'Giữ nguyên ô đã có' : cell.skipped === 'empty' ? 'OPEN-EDU chưa có dữ liệu' : cell.previous ? `Thay cho: ${cell.previous}` : undefined}>
                          {cell.skipped ? (cell.previous || '–') : typeof cell.value === 'number' ? String(cell.value).replace('.', ',') : cell.value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tc-row tc-wrap br-actions">
              <Btn kind="primary" icon="check" size="lg" data-testid="br-download" disabled={!plan.filled} onClick={download}>Tải tệp đã điền (.{file.opened.wb.format === 'xls' ? 'xls' : 'xlsx'})</Btn>
              <span className="tc-small tc-muted">Tệp mới có tên “{baseName(file.name)}-da-dien.{file.opened.wb.format === 'xls' ? 'xls' : 'xlsx'}”. Tệp gốc không bị sửa.</span>
            </div>
          </>
        )}
        {error ? <div className="tc-alert tc-alert--error" role="alert"><span>{error}</span></div> : null}
        {done ? (
          <div className={`tc-alert ${done.mode === 'patched' ? 'tc-alert--ok' : 'tc-alert--info'}`} role="status" data-testid="br-done">
            <span>
              Đã tải “{done.fileName}” với {done.filled} ô được điền. {done.mode === 'patched' ? 'Định dạng, ô gộp và các trang tính khác của tệp gốc được giữ nguyên.' : done.note}
              {done.formulas ? ` Có ${done.formulas} ô công thức đã được thay bằng giá trị.` : ''} Thầy cô mở tệp kiểm tra lại trước khi nhập vào VnEdu nhé.
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
