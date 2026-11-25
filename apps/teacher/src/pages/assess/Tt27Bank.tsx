/**
 * TT27 — hộp "Ngân hàng nhận xét" (xem / sửa / xoá / thêm / chia sẻ câu) và hộp "Môn hiển thị" (GV chọn cột môn).
 */
import { useMemo, useState } from 'react';
import { subjectGroupAt, SUBJECT_GROUP_LABEL, SUBJECTS, subjectLabelFor, TT27_LEVEL_LABEL, type SubjectGroup, type SubjectId } from '@openedu/contracts';
import { foldVietnamese, useAddToBank, useCommentBankList, useDeleteBankComment, usePref, useUpdateBankComment, type BankLevel } from '@openedu/data';
import { Btn, Dialog, Empty, ErrorNote, Field } from '../../components/common';

export const TT27_GENERAL_SCOPE = 'tt27:chung';
export const tt27Scope = (s: SubjectId) => `tt27:${s}`;
export const TT27_BANK_AUTO_KEY = 'tt27-bank-auto';

/** Tự lưu nhận xét mới vào ngân hàng khi bấm Lưu nháp / Chốt (mặc định bật). */
export function useBankAuto(userId: string) {
  const p = usePref<boolean>(userId, TT27_BANK_AUTO_KEY);
  return { on: p.value !== false, set: (v: boolean) => p.set(v) };
}

export function Tt27BankDialog({ userId, subjects, initialScope, onClose }: { userId: string; subjects: SubjectId[]; initialScope?: string; onClose: () => void }) {
  const list = useCommentBankList();
  const add = useAddToBank();
  const upd = useUpdateBankComment();
  const del = useDeleteBankComment();
  const auto = useBankAuto(userId);
  const scopes = useMemo(() => [...subjects.map((s) => ({ scope: tt27Scope(s), label: SUBJECTS[s].name })), { scope: TT27_GENERAL_SCOPE, label: 'Nhận xét chung' }], [subjects]);
  const [scope, setScope] = useState(initialScope && scopes.some((s) => s.scope === initialScope) ? initialScope : scopes[0]!.scope);
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [level, setLevel] = useState<BankLevel | ''>('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const items = useMemo(() => {
    const f = foldVietnamese(q).toLowerCase();
    return (list.data?.items ?? []).filter((c) => c.scope === scope && (!f || foldVietnamese(c.text).toLowerCase().includes(f)))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || b.uses - a.uses);
  }, [list.data, scope, q]);
  const count = (s: string) => (list.data?.items ?? []).filter((c) => c.scope === s).length;
  const err = list.error ?? add.error ?? upd.error ?? del.error;
  return (
    <Dialog open wide title="Ngân hàng nhận xét" onClose={onClose} footer={<>
      <label className="tc-switch tc-small"><input type="checkbox" checked={auto.on} onChange={(e) => auto.set(e.target.checked)} data-testid="bank-auto" /> Tự lưu nhận xét mới khi bấm Lưu nháp / Chốt</label>
      <span className="tc-ebar__spacer" />
      <Btn kind="primary" onClick={onClose}>Xong</Btn>
    </>}>
      <div className="tc-stack">
        <p className="tc-small tc-muted">
          Câu trong ngân hàng hiện ra khi thầy cô bấm vào ô nhận xét — chọn để điền nhanh. Câu mới tự được lưu khi lưu bảng
          (bỏ qua câu có tên riêng của học sinh).{list.data && !list.data.synced ? ' Đang lưu trên trình duyệt này — chạy SQL 20 để dùng trên mọi máy.' : ''}
        </p>
        <div className="tc-row tc-wrap">
          <select className="tc-input" aria-label="Phạm vi ngân hàng" value={scope} onChange={(e) => { setScope(e.target.value); setEditing(null); }} data-testid="bank-scope">
            {scopes.map((s) => <option key={s.scope} value={s.scope}>{s.label} ({count(s.scope)})</option>)}
          </select>
          <input className="tc-input tc-grow" placeholder="Tìm câu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm câu trong ngân hàng" />
        </div>
        <div className="tc-card tc-card--flat tc-stack">
          <Field label="Thêm câu mới">
            <textarea className="tc-input" rows={2} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="vd: Em đọc to, rõ ràng; hiểu nội dung bài." aria-label="Câu nhận xét mới" />
          </Field>
          <div className="tc-row tc-wrap">
            <select className="tc-input tc-input--sm" aria-label="Mức của câu mới" value={level} onChange={(e) => setLevel(e.target.value as BankLevel | '')}>
              <option value="">Mọi mức</option>
              {(scope === TT27_GENERAL_SCOPE ? (['T', 'Đ', 'C'] as BankLevel[]) : (['T', 'H', 'C'] as BankLevel[])).map((l) => <option key={l} value={l}>{l} · {l === 'Đ' ? 'Đạt' : TT27_LEVEL_LABEL[l as 'T' | 'H' | 'C']}</option>)}
            </select>
            <Btn size="sm" icon="plus" disabled={!text.trim() || add.isPending} onClick={() => add.mutate([{ scope, text, ...(level ? { level } : {}) }], { onSuccess: () => setText('') })} data-testid="bank-add">Thêm vào ngân hàng</Btn>
          </div>
        </div>
        <ErrorNote error={err} />
        {!items.length ? <Empty icon="book" title="Chưa có câu nào">Thêm câu ở trên, hoặc nhập nhận xét trên bảng rồi bấm Lưu — câu mới tự vào ngân hàng.</Empty> : (
          <ul className="tc-banklist2" data-testid="bank-list">
            {items.map((c) => (
              <li key={c.id}>
                {editing?.id === c.id ? (
                  <div className="tc-stack tc-grow">
                    <textarea className="tc-input tc-input--sm" rows={2} value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} aria-label="Sửa câu nhận xét" />
                    <div className="tc-row"><Btn size="sm" kind="primary" disabled={!editing.text.trim()} onClick={() => upd.mutate({ id: c.id, text: editing.text }, { onSuccess: () => setEditing(null) })}>Lưu</Btn><Btn size="sm" onClick={() => setEditing(null)}>Hủy</Btn></div>
                  </div>
                ) : (
                  <span className="tc-grow">{c.level ? <b className={`tc-sugg__lv tc-pick--${c.level === 'Đ' ? 'D' : c.level}`}>{c.level}</b> : null} {c.text} <span className="tc-muted tc-small">· dùng {c.uses} lần{c.mine ? '' : ' · thầy cô khác chia sẻ'}</span></span>
                )}
                {c.mine && editing?.id !== c.id ? (
                  <span className="tc-row">
                    <select className="tc-input tc-input--sm" aria-label={`Mức của câu: ${c.text}`} value={c.level ?? ''} onChange={(e) => upd.mutate({ id: c.id, level: (e.target.value || null) as BankLevel | null })}>
                      <option value="">Mọi mức</option>
                      {(['T', 'H', 'C', 'Đ'] as BankLevel[]).map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <label className="tc-switch tc-small" title="Chia sẻ câu này cho thầy cô khác trong trường"><input type="checkbox" checked={c.shared} onChange={(e) => upd.mutate({ id: c.id, shared: e.target.checked })} /> Chia sẻ</label>
                    <Btn size="sm" kind="ghost" icon="pencil" aria-label={`Sửa câu: ${c.text}`} onClick={() => setEditing({ id: c.id, text: c.text })} />
                    <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xoá câu: ${c.text}`} onClick={() => del.mutate(c.id)} data-testid="bank-del" />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

/** Chọn cột môn hiển thị trên bảng TT27 (theo GV + lớp). Dữ liệu môn ẩn vẫn giữ nguyên. */
export function Tt27ColumnsDialog({ grade, all, value, defaults, onSave, onClose }: { grade: number; all: SubjectId[]; value: SubjectId[]; defaults: SubjectId[]; onSave: (v: SubjectId[] | null) => void; onClose: () => void }) {
  const [sel, setSel] = useState<Set<SubjectId>>(new Set(value));
  const groups = useMemo(() => {
    const order: SubjectGroup[] = ['bat-buoc', 'hoat-dong', 'tu-chon'];
    return order.map((g) => ({ g, items: all.filter((s) => subjectGroupAt(s, grade) === g) })).filter((x) => x.items.length);
  }, [all, grade]);
  const toggle = (s: SubjectId) => setSel((x) => { const n = new Set(x); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  return (
    <Dialog open title={`Môn hiển thị — lớp ${grade}`} onClose={onClose} footer={<>
      <Btn kind="ghost" onClick={() => setSel(new Set(defaults))}>Mặc định</Btn>
      <span className="tc-ebar__spacer" />
      <Btn onClick={onClose}>Hủy</Btn>
      <Btn kind="primary" disabled={!sel.size} onClick={() => onSave(all.filter((s) => sel.has(s)))} data-testid="tt27-cols-save">Lưu ({sel.size} môn)</Btn>
    </>}>
      <div className="tc-stack">
        <p className="tc-small tc-muted">Thầy cô dạy môn nào thì tích môn đó. Môn bị ẩn chỉ không hiện cột — nhận xét đã nhập của môn đó vẫn giữ nguyên. Lưu riêng cho từng lớp, theo tài khoản.</p>
        <div className="tc-row tc-wrap"><Btn size="sm" kind="ghost" onClick={() => setSel(new Set(all))}>Chọn tất cả</Btn><Btn size="sm" kind="ghost" onClick={() => setSel(new Set())}>Bỏ chọn hết</Btn></div>
        {groups.map(({ g, items }) => (
          <fieldset key={g} className="tc-fieldset">
            <legend className="tc-small">{SUBJECT_GROUP_LABEL[g]}</legend>
            <ul className="tc-hmpick">
              {items.map((s) => <li key={s}><label className="tc-switch"><input type="checkbox" checked={sel.has(s)} onChange={() => toggle(s)} /><span>{subjectLabelFor(s, grade)}</span></label></li>)}
            </ul>
          </fieldset>
        ))}
        {!sel.size ? <p className="tc-small tc-warn">Chọn ít nhất một môn.</p> : null}
      </div>
    </Dialog>
  );
}
