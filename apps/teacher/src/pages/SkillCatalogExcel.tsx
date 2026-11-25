/**
 * Danh mục kĩ năng ↔ Excel: xuất toàn bộ (tra mã, tổ chuyên môn rà soát) và nhập lại (thêm nhiều, sửa chữ, ẩn / hiện).
 * Mã đọc / ghi Excel tải lười (loadImportLib) để không làm nặng gói đầu.
 */
import { useRef, useState } from 'react';
import { SUBJECTS } from '@openedu/contracts';
import { useApplySkillsBatch, type SkillsBatchOp } from '@openedu/data';
import type { SkillPlanKind, SkillsImportPlan } from '@openedu/data/import';
import { Btn, Dialog, ErrorNote } from '../components/common';
import { downloadBytes, loadImportLib, readFileBytes, todayStamp } from './itembank/lib';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const KIND_TEXT: Record<SkillPlanKind, string> = { add: 'Thêm mới', edit: 'Sửa chữ', hide: 'Ẩn', show: 'Hiện lại', same: 'Không đổi', error: 'Lỗi' };

export async function exportSkillsXlsx(): Promise<void> {
  const lib = await loadImportLib();
  downloadBytes(lib.buildSkillsXlsx({ withHidden: true }), `danh-muc-ki-nang-${todayStamp()}.xlsx`, XLSX_MIME);
}

export function SkillsImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [plan, setPlan] = useState<SkillsImportPlan | null>(null);
  const [file, setFile] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<{ row?: number; code: string; error: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const apply = useApplySkillsBatch();

  const pick = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setErr(null);
    setFailed([]);
    setBusy(true);
    try {
      if (!f.name.toLowerCase().endsWith('.xlsx')) throw new Error('Chỉ nhận tệp Excel .xlsx (xuất từ nút "Xuất Excel" rồi sửa).');
      const lib = await loadImportLib();
      const p = lib.planSkillsImport(await readFileBytes(f));
      setPlan(p);
      setFile(f.name);
    } catch (e) {
      setErr(e);
      setPlan(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const ops: SkillsBatchOp[] = (plan?.rows ?? [])
    .filter((r) => r.kind === 'add' || r.kind === 'edit' || r.kind === 'hide' || r.kind === 'show')
    .map((r) => ({ kind: r.kind as SkillsBatchOp['kind'], code: r.code, subject: r.subject, grade: r.grade, topic: r.topic, short: r.short, text: r.text, hidden: r.hidden, row: r.row }));
  const changes = (plan?.rows ?? []).filter((r) => r.kind !== 'same');
  const running = !!progress && progress.done < progress.total;

  const run = (): void => {
    setProgress({ done: 0, total: ops.length });
    apply.mutate({ ops, onProgress: (done, total) => setProgress({ done, total }) }, {
      onSuccess: (r) => {
        if (r.failed.length) {
          setFailed(r.failed.map((f) => ({ row: f.op.row, code: f.op.code, error: f.error })));
          setProgress(null);
          setPlan(null);
        } else onDone(`Đã cập nhật danh mục kĩ năng: ${ops.length} thay đổi từ “${file}”.`);
      },
      onError: (e) => { setErr(e); setProgress(null); },
    });
  };

  return (
    <Dialog open wide title="Nhập danh mục kĩ năng từ Excel" onClose={running ? () => undefined : onClose} footer={<>
      <Btn onClick={onClose} disabled={running}>{failed.length ? 'Đóng' : 'Hủy'}</Btn>
      <Btn kind="primary" icon="check" disabled={!ops.length || running || busy} onClick={run} data-testid="sk-import-go">
        {running ? `Đang lưu ${progress!.done}/${progress!.total}…` : `Áp dụng ${ops.length} thay đổi`}
      </Btn>
    </>}>
      <div className="tc-stack">
        <p className="tc-small tc-muted">
          Cách làm: bấm <b>Xuất Excel</b> → sửa trong Excel (sửa chữ, thêm dòng mới để <b>trống mã</b>, đổi cột Trạng thái thành “Đã ẩn”) → chọn tệp ở đây.
          Máy chỉ đổi những dòng khác với danh mục hiện tại; xoá dòng trong tệp <b>không</b> xoá kĩ năng.
        </p>
        <label className="tc-qb-drop">
          <strong>{busy ? 'Đang đọc tệp…' : file ? `Đã chọn: ${file} — chọn tệp khác` : 'Chọn tệp Excel danh mục kĩ năng'}</strong>
          <input ref={input} type="file" accept=".xlsx" onChange={(e) => void pick(e.target.files?.[0])} disabled={busy || running} data-testid="sk-import-file" />
        </label>
        <ErrorNote error={err ?? apply.error} />
        {failed.length ? (
          <div className="tc-alert tc-alert--error" role="alert"><span>
            Có {failed.length} dòng chưa lưu được: {failed.slice(0, 5).map((f) => `dòng ${f.row ?? '?'} (${f.code}): ${f.error}`).join(' · ')}{failed.length > 5 ? ' …' : ''}
          </span></div>
        ) : null}
        {plan ? (
          <>
            <div className="tc-row tc-wrap" role="status" data-testid="sk-import-summary">
              {(['add', 'edit', 'hide', 'show', 'error', 'same'] as SkillPlanKind[]).map((k) => (
                <span key={k} className={`tc-chip${k === 'error' && plan.counts.error ? ' tc-chip--danger' : k === 'add' || k === 'edit' ? ' tc-chip--ok' : ''}`}>{KIND_TEXT[k]}: {plan.counts[k]}</span>
              ))}
            </div>
            {plan.warnings.map((w, i) => <p key={i} className="tc-small tc-warn">{w}</p>)}
            {changes.length ? (
              <div className="tc-tablewrap tc-skimport">
                <table className="tc-table tc-small">
                  <thead><tr><th>Dòng</th><th>Việc</th><th>Mã</th><th>Môn · lớp</th><th>Tên ngắn</th><th>Yêu cầu cần đạt / ghi chú</th></tr></thead>
                  <tbody>
                    {changes.slice(0, 300).map((r) => (
                      <tr key={`${r.row}-${r.code}`} className={r.kind === 'error' ? 'is-error' : undefined}>
                        <td>{r.row}</td>
                        <td>{KIND_TEXT[r.kind]}{r.hidden !== undefined && (r.kind === 'edit' || r.kind === 'add') ? (r.hidden ? ' + ẩn' : ' + hiện') : ''}</td>
                        <td><code>{r.code || '—'}</code></td>
                        <td>{r.subject ? `${SUBJECTS[r.subject]?.name ?? r.subject} · ${r.grade}` : ''}</td>
                        <td>{r.short}</td>
                        <td>{r.kind === 'error' ? <b>{r.message}</b> : r.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {changes.length > 300 ? <p className="tc-small tc-muted">… và {changes.length - 300} dòng nữa.</p> : null}
              </div>
            ) : <p className="tc-muted">Tệp không có thay đổi nào so với danh mục hiện tại.</p>}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

