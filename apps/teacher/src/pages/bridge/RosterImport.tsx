import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccountSlip } from '@openedu/contracts';
import { bridge, useDataSource } from '@openedu/data';
import { Btn, ErrorNote } from '../../components/common';
import { SlipSheet } from '../admin/Admin';
import { applyPicks, ExcelPicker, FileSummary, MatchChip, StudentSelect, type BridgeData, type OpenedFile } from './shared';

const NEW = '__new__';

/** Nhập danh sách lớp từ tệp VnEdu: tạo tài khoản cho em chưa có, cập nhật mã học sinh cho em đã có. */
export function RosterImport({ data, onChanged }: { data: BridgeData; onChanged: () => void }) {
  const ds = useDataSource();
  const qc = useQueryClient();
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [slips, setSlips] = useState<AccountSlip[] | null>(null);
  const [msg, setMsg] = useState('');
  const table = file?.opened.table;
  const auto = useMemo(() => (table ? bridge.matchRows(table.students, bridge.toMatchStudents(data)) : []), [table, data]);
  // Lựa chọn "tạo mới" không phải học sinh có sẵn → tách riêng khỏi applyPicks.
  const realPicks = useMemo(() => Object.fromEntries(Object.entries(picks).filter(([, v]) => v !== NEW)), [picks]);
  const matches = useMemo(() => applyPicks(auto, realPicks), [auto, realPicks]);
  const taken = useMemo(() => new Set(matches.map((m) => m.studentId).filter((x): x is string => !!x)), [matches]);
  const rowOf = (row: number) => table?.students.find((s) => s.row === row);

  const willCreate = matches.filter((m) => !m.studentId && (picks[m.row] === NEW || (m.status === 'missing' && picks[m.row] === undefined)));
  const willUpdate = matches.filter((m) => {
    if (!m.studentId) return false;
    const code = rowOf(m.row)?.code ?? '';
    return !!code && data.students.find((s) => s.id === m.studentId)?.externalCode !== code;
  });
  const undecided = matches.filter((m) => !m.studentId && !willCreate.includes(m) && picks[m.row] === undefined);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['students'] });
    void qc.invalidateQueries({ queryKey: ['classes'] });
    void qc.invalidateQueries({ queryKey: ['class'] });
    void qc.invalidateQueries({ queryKey: ['school'] });
    onChanged();
  };
  const update = useMutation({
    mutationFn: () => bridge.getBridgeSource(ds).setExternalIds(data.cls.id, willUpdate.map((m) => ({ studentId: m.studentId as string, externalCode: rowOf(m.row)?.code ?? '' }))),
    onSuccess: (n) => { setMsg(`Đã cập nhật mã cho ${n} học sinh.`); refresh(); },
  });
  const create = useMutation({
    mutationFn: () => bridge.getBridgeSource(ds).createStudents(data.cls.id, willCreate.map((m) => ({ name: rowOf(m.row)?.name ?? '', externalCode: rowOf(m.row)?.code || undefined }))),
    onSuccess: (list) => { setSlips(list); setMsg(`Đã tạo ${list.length} tài khoản.`); refresh(); },
  });

  if (slips) return <SlipSheet slips={slips} title={`Tài khoản lớp ${data.cls.name}`} onBack={() => { setSlips(null); setFile(null); setPicks({}); }} />;

  if (!file || !table) {
    return (
      <section className="tc-card br-step">
        <h2>Nhập danh sách lớp từ tệp VnEdu</h2>
        <ol className="br-howto">
          <li>Trên VnEdu, xuất danh sách học sinh của lớp ra Excel.</li>
          <li>Tải tệp lên đây. Em nào đã có trong lớp {data.cls.name} thì chỉ cập nhật mã học sinh; em chưa có thì tạo tài khoản mới.</li>
          <li>In phiếu tài khoản (tên đăng nhập + mật khẩu) cho các em mới.</li>
        </ol>
        <ExcelPicker testId="br-roster-file" label="Chọn tệp danh sách lớp" hint="Cần có cột Họ và tên; nên có cột Mã học sinh." onOpen={(f) => { setFile(f); setPicks({}); setMsg(''); }} />
        {msg ? <div className="tc-alert tc-alert--ok" role="status"><span>{msg}</span></div> : null}
      </section>
    );
  }

  return (
    <div className="br-stack">
      <FileSummary file={file} onClear={() => setFile(null)} />
      <section className="tc-card br-step">
        <header className="tc-card__head">
          <h2>Xem trước — lớp {data.cls.name}</h2>
          <span className="tc-row tc-wrap">
            <span className="tc-chip tc-chip--ok">Đã có trong lớp: {matches.filter((m) => m.studentId).length}</span>
            <span className="tc-chip" data-testid="br-roster-new">Sẽ tạo mới: {willCreate.length}</span>
            {undecided.length ? <span className="tc-chip tc-chip--warn">Cần chọn: {undecided.length}</span> : null}
          </span>
        </header>
        <div className="tc-tablewrap br-scroll">
          <table className="tc-table br-table">
            <thead><tr><th>Dòng</th><th>Mã học sinh</th><th>Họ và tên</th><th>Ngày sinh</th><th>Kết quả</th><th>Việc sẽ làm</th></tr></thead>
            <tbody>
              {matches.map((m) => {
                const r = rowOf(m.row);
                const cur = data.students.find((s) => s.id === m.studentId);
                return (
                  <tr key={m.row}>
                    <td>{m.row + 1}</td><td>{r?.code}</td><td>{r?.name}</td><td>{r?.dob}</td>
                    <td><MatchChip status={m.status} /></td>
                    <td>
                      <span className="tc-row tc-wrap">
                        <StudentSelect label={`Việc làm với dòng ${m.row + 1}`} students={data.students} value={m.studentId ?? ''} candidates={m.candidates} taken={taken} emptyLabel={willCreate.includes(m) ? 'Tạo tài khoản mới' : '— Chưa chọn —'} onChange={(id) => setPicks((p) => ({ ...p, [m.row]: id || NEW }))} />
                        {cur ? <span className="tc-small tc-muted">{!r?.code ? 'tệp không có mã' : cur.externalCode === r.code ? 'mã đã đúng' : cur.externalCode ? `đổi mã ${cur.externalCode} → ${r.code}` : `thêm mã ${r.code}`}</span>
                          : !willCreate.includes(m) ? <Btn size="sm" onClick={() => setPicks((p) => ({ ...p, [m.row]: NEW }))}>Tạo mới</Btn>
                          : <Btn size="sm" kind="ghost" onClick={() => setPicks((p) => ({ ...p, [m.row]: '' }))}>Bỏ qua</Btn>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ErrorNote error={update.error ?? create.error} />
        {msg ? <div className="tc-alert tc-alert--ok" role="status" data-testid="br-roster-msg"><span>{msg}</span></div> : null}
        <div className="tc-row tc-wrap br-actions">
          <Btn kind="primary" icon="check" data-testid="br-roster-update" disabled={!willUpdate.length || update.isPending} onClick={() => update.mutate()}>{update.isPending ? 'Đang lưu…' : `Cập nhật mã cho ${willUpdate.length} em đã có`}</Btn>
          <Btn kind="primary" icon="plus" data-testid="br-roster-create" disabled={!willCreate.length || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Đang tạo…' : `Tạo ${willCreate.length} tài khoản mới`}</Btn>
          <span className="tc-small tc-muted">Tài khoản mới có tên đăng nhập kiểu “an{data.cls.name.toLowerCase()}12” và mật khẩu 6 số, hiện một lần để in phiếu.</span>
        </div>
      </section>
    </div>
  );
}
