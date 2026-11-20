import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { bridge, useDataSource } from '@openedu/data';
import { Btn, ErrorNote } from '../../components/common';
import type { BridgeData } from './shared';

/** Xem / sửa mã học sinh VnEdu của cả lớp. */
export function CodeEditor({ data, onChanged }: { data: BridgeData; onChanged: () => void }) {
  const ds = useDataSource();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft({}); }, [data]);
  const val = (s: Profile) => draft[s.id] ?? s.externalCode ?? '';
  const changed = data.students.filter((s) => s.id in draft && draft[s.id].trim() !== (s.externalCode ?? ''));
  const dup = new Set<string>();
  const seen = new Set<string>();
  for (const s of data.students) { const v = val(s).trim().toLowerCase(); if (!v) continue; if (seen.has(v)) dup.add(v); seen.add(v); }
  const save = useMutation({
    mutationFn: () => bridge.getBridgeSource(ds).setExternalIds(data.cls.id, changed.map((s) => ({ studentId: s.id, externalCode: draft[s.id].trim() }))),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['students'] }); onChanged(); },
  });
  return (
    <section className="tc-card br-step">
      <header className="tc-card__head">
        <h2>Mã học sinh VnEdu — lớp {data.cls.name}</h2>
        <span className="tc-row tc-wrap">
          <span className="tc-chip">{data.students.filter((s) => s.externalCode).length}/{data.students.length} em có mã</span>
          {saved && !changed.length ? <span className="tc-small tc-ok" role="status">Đã lưu</span> : null}
          <Btn kind="primary" icon="check" data-testid="br-code-save" disabled={!changed.length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Đang lưu…' : `Lưu ${changed.length || ''} thay đổi`}</Btn>
        </span>
      </header>
      <p className="tc-small tc-muted">Mã này dùng để ghép chắc chắn khi điền vào mẫu VnEdu (không phụ thuộc cách viết họ tên). Có thể nhập cả loạt từ tệp ở thẻ “Nhập danh sách”.</p>
      <ErrorNote error={save.error} />
      {dup.size ? <div className="tc-alert tc-alert--info"><span>Có mã bị trùng giữa các em: {[...dup].join(', ')}. Thầy cô kiểm tra lại.</span></div> : null}
      <ul className="br-codes">
        {data.students.map((s, i) => (
          <li key={s.id}>
            <span className="tc-muted">{i + 1}</span>
            <Link to={`/hoc-sinh/${s.id}`}>{s.name}</Link>
            <span className="tc-small tc-muted">{s.username}</span>
            <input className="tc-input tc-input--sm" data-testid={`br-code-${s.username ?? s.id}`} value={val(s)} maxLength={64} spellCheck={false} placeholder="Mã học sinh" aria-label={`Mã học sinh của ${s.name}`} onChange={(e) => { setSaved(false); setDraft((d) => ({ ...d, [s.id]: e.target.value })); }} />
          </li>
        ))}
      </ul>
    </section>
  );
}
