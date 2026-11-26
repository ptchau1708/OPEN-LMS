/** Phụ huynh thấy gì: chế độ từng mục của lớp, giờ nhận tin nhắn, xem như phụ huynh của một em. */
import { useEffect, useState } from 'react';
import { SHARE_KINDS, SHARE_MODE_LABEL, type ClassInfo, type ParentShareSettings, type ShareKind, type ShareMode } from '@openedu/contracts';
import { useParentPreview, useParentShare, useSaveParentShare } from '@openedu/data';
import { Btn, ErrorNote, Field, Loading, Seg } from '../../components/common';
import { useRoster } from '../../lib/assess';

export function VisibilityPanel({ cls }: { cls: ClassInfo }) {
  const q = useParentShare(cls.id);
  const save = useSaveParentShare();
  const [draft, setDraft] = useState<ParentShareSettings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (q.data) setDraft(q.data); }, [q.data]);
  if (q.isLoading || !draft) return q.error ? <ErrorNote error={q.error} onRetry={() => void q.refetch()} /> : <Loading />;
  const setMode = (k: ShareKind, m: ShareMode) => { setSaved(false); setDraft({ ...draft, modes: { ...draft.modes, [k]: m } }); };
  const dirty = JSON.stringify(draft) !== JSON.stringify(q.data);
  return (
    <div className="tc-ph-vis">
      <section className="tc-card" data-testid="ph-visibility">
        <h2 className="tc-h2">Mục phụ huynh lớp {cls.name} được xem</h2>
        <p className="tc-small tc-muted">
          Đã có {draft.parents} phụ huynh liên kết với {draft.linkedStudents}/{draft.students} em.
          “Cô duyệt rồi mới gửi”: mục mới vào thẻ Chờ duyệt, phụ huynh chỉ thấy khi cô bấm Gửi. Tắt một mục thì phụ huynh không xem được (máy chủ chặn, không chỉ ẩn trên màn hình).
        </p>
        <ul className="tc-ph-kinds">
          {SHARE_KINDS.map((k) => (
            <li key={k.kind} className="tc-ph-kinds__row">
              <div>
                <strong>{k.label}</strong>
                <p className="tc-small tc-muted">{k.detail}</p>
              </div>
              <Seg label={k.label} value={draft.modes[k.kind]} onChange={(m) => setMode(k.kind, m)} options={k.modes.map((m) => ({ value: m, label: SHARE_MODE_LABEL[m] }))} />
            </li>
          ))}
        </ul>
        <h3 className="tc-ph-sub">Tin nhắn của phụ huynh</h3>
        <div className="tc-row tc-wrap tc-ph-hours">
          <label className="tc-check"><input type="checkbox" checked={draft.msgEnabled} onChange={(e) => { setSaved(false); setDraft({ ...draft, msgEnabled: e.target.checked }); }} data-testid="ph-msg-enabled" /> Cho phụ huynh nhắn tin cho cô</label>
          <Field label="Nhận tin từ"><input type="time" className="tc-input tc-input--sm" value={draft.msgFrom} onChange={(e) => { setSaved(false); setDraft({ ...draft, msgFrom: e.target.value }); }} /></Field>
          <Field label="đến"><input type="time" className="tc-input tc-input--sm" value={draft.msgTo} onChange={(e) => { setSaved(false); setDraft({ ...draft, msgTo: e.target.value }); }} /></Field>
        </div>
        <p className="tc-small tc-muted">Ngoài giờ này phụ huynh vẫn gửi được, nhưng cô chỉ nhận thông báo khi vào giờ (máy cô không reo lúc đêm).</p>
        <ErrorNote error={save.error} />
        <div className="tc-row">
          <Btn kind="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate({ classId: cls.id, patch: { modes: draft.modes, msgEnabled: draft.msgEnabled, msgFrom: draft.msgFrom, msgTo: draft.msgTo } }, { onSuccess: () => setSaved(true) })} data-testid="ph-vis-save">
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </Btn>
          {saved && !dirty ? <span className="tc-chip tc-chip--ok" role="status">Đã lưu.</span> : null}
        </div>
      </section>
      <PreviewCard cls={cls} />
    </div>
  );
}

function PreviewCard({ cls }: { cls: ClassInfo }) {
  const { roster } = useRoster(cls);
  const [sid, setSid] = useState('');
  const q = useParentPreview(sid || undefined);
  return (
    <section className="tc-card tc-ph-preview" data-testid="ph-preview">
      <h2 className="tc-h2">Xem như phụ huynh</h2>
      <Field label="Học sinh">
        <select className="tc-input" value={sid} onChange={(e) => setSid(e.target.value)} data-testid="ph-preview-student">
          <option value="">— Chọn em —</option>
          {roster.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      {!sid ? <p className="tc-small tc-muted">Chọn một em để xem phụ huynh của em đang thấy những gì (30 ngày gần đây).</p> : q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : q.data ? (
        <>
          <p className="tc-small">
            {q.data.parents.length ? <>Phụ huynh: {q.data.parents.map((p) => `${p.name}${p.relation ? ` (${p.relation})` : ''}`).join(', ')}</> : <span className="tc-chip tc-chip--warn">Chưa có phụ huynh liên kết</span>}
            {q.data.waiting ? <> · <b>{q.data.waiting}</b> mục chờ cô duyệt</> : null}
          </p>
          <ul className="tc-ph-prev">
            {q.data.items.map((it) => {
              const k = SHARE_KINDS.find((x) => x.kind === it.kind)!;
              return (
                <li key={it.kind} className={`is-${it.mode}`}>
                  <span>{k.label}</span>
                  <span className="tc-small">{it.mode === 'off' ? 'Không gửi' : it.total ? `Thấy ${it.shown}/${it.total}${it.mode === 'review' ? ' · cô duyệt' : ''}` : it.mode === 'review' ? 'Cô duyệt rồi mới gửi' : 'Tự động'}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
