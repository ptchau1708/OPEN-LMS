import { useRef, useState, type ReactNode } from 'react';
import type { Profile } from '@openedu/contracts';
import { bridge } from '@openedu/data';
import { Btn } from '../../components/common';

export type BridgeData = bridge.BridgeData;

export interface OpenedFile { name: string; bytes: Uint8Array; opened: bridge.OpenedTemplate }

/** Ô chọn tệp Excel: đọc, tìm bảng học sinh, báo lỗi dễ hiểu. */
export function ExcelPicker({ label, hint, onOpen, testId }: { label: string; hint?: ReactNode; onOpen: (f: OpenedFile) => void; testId?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Tệp lớn hơn 20 MB. Thầy/cô kiểm tra lại có đúng tệp không nhé.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      onOpen({ name: file.name, bytes, opened: bridge.openTemplate(bytes) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được tệp này.');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div className="br-picker">
      <input ref={ref} type="file" accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden data-testid={testId} onChange={(e) => void onPick(e.target.files?.[0])} />
      <Btn kind="primary" icon="upload" size="lg" disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Đang đọc tệp…' : label}</Btn>
      {hint ? <span className="tc-small tc-muted">{hint}</span> : null}
      {error ? <div className="tc-alert tc-alert--error" role="alert"><span>{error}</span></div> : null}
    </div>
  );
}

export function FileSummary({ file, onClear }: { file: OpenedFile; onClear: () => void }) {
  const t = file.opened.table;
  return (
    <div className="tc-alert tc-alert--info br-filesum">
      <span>
        <strong>{file.name}</strong> · trang tính “{t.sheetName}” · dòng tiêu đề {t.headerStart === t.headerEnd ? t.headerStart + 1 : `${t.headerStart + 1}–${t.headerEnd + 1}`} · <strong>{t.students.length}</strong> học sinh
        {t.col.code === undefined ? ' · không có cột mã học sinh (sẽ ghép theo họ tên)' : ''}
      </span>
      <Btn size="sm" onClick={onClear}>Chọn tệp khác</Btn>
    </div>
  );
}

const TONE: Record<bridge.MatchStatus, string> = { code: 'tc-chip--ok', name: 'tc-chip--ok', loose: 'tc-chip--ok', manual: 'tc-chip--ok', ambiguous: 'tc-chip--warn', missing: 'tc-chip--warn' };
export function MatchChip({ status }: { status: bridge.MatchStatus }) {
  return <span className={`tc-chip ${TONE[status]}`}>{bridge.MATCH_STATUS_LABEL[status]}</span>;
}

/** Ô chọn học sinh để ghép tay một dòng. `taken`: các em đã được ghép với dòng khác. */
export function StudentSelect({ students, value, candidates, taken, onChange, emptyLabel = '— Bỏ qua dòng này —', label }: { students: Profile[]; value: string; candidates: string[]; taken: Set<string>; onChange: (id: string) => void; emptyLabel?: string; label: string }) {
  const first = students.filter((s) => candidates.includes(s.id));
  const rest = students.filter((s) => !candidates.includes(s.id));
  const opt = (s: Profile) => <option key={s.id} value={s.id} disabled={taken.has(s.id) && s.id !== value}>{s.name}{s.externalCode ? ` (${s.externalCode})` : ''}{taken.has(s.id) && s.id !== value ? ' — đã ghép' : ''}</option>;
  return (
    <select className="tc-input tc-input--sm" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {first.length ? <optgroup label="Gợi ý">{first.map(opt)}</optgroup> : null}
      <optgroup label="Cả lớp">{rest.map(opt)}</optgroup>
    </select>
  );
}

/** Áp lựa chọn tay của GV lên kết quả ghép tự động. picks[row] = studentId ('' = bỏ qua). */
export function applyPicks(auto: bridge.RowMatch[], picks: Record<number, string>): bridge.RowMatch[] {
  return auto.map((m) => {
    if (!(m.row in picks)) return m;
    const id = picks[m.row];
    return id ? { ...m, status: 'manual' as const, studentId: id } : { row: m.row, status: m.status === 'missing' ? 'missing' as const : 'ambiguous' as const, candidates: m.candidates };
  });
}

export function baseName(name: string): string {
  return name.replace(/\.(xlsx|xlsm|xls)$/i, '');
}
