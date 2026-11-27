import { useMemo, useState } from 'react';
import { ACTIVITY_TYPES, SUBJECTS, uid, type AnyResponse, type Grade, type Item, type ItemType, type SubjectId, subjectInGrade, subjectOptionsFor } from '@openedu/contracts';
import { ActivityView, ItemEditor, sampleItem, scoreItem } from '@openedu/activity-engine';
import { Icon, KidShell } from '@openedu/ui';
import { useItems } from '@openedu/data';
import { Btn, Dialog, Empty, Loading, Seg } from './common';
import { cx, shorten, TYPE_ICON, typeLabel } from '../lib/format';
import { useFocusGrade } from '../lib/focusGrade';

export function TypeBadge({ type }: { type: ItemType }) {
  const meta = ACTIVITY_TYPES.find((t) => t.type === type);
  return (
    <span className={cx('tc-typebadge', meta && !meta.graded && 'is-ungraded')}>
      <Icon name={TYPE_ICON[type]} size={14} />
      {typeLabel(type)}
    </span>
  );
}

/** Xem trước hoạt động bằng giao diện học sinh, có nút "Xem đáp án". */
export function ItemPreview({ item, compact }: { item: Item; compact?: boolean }) {
  const [value, setValue] = useState<AnyResponse | undefined>();
  const [reveal, setReveal] = useState(false);
  const [checked, setChecked] = useState(false);
  const result = useMemo(() => (reveal || checked ? scoreItem(item, value) : undefined), [item, value, reveal, checked]);
  const key = `${item.id}:${item.type}`;
  return (
    <div className={cx('tc-ipreview', compact && 'tc-ipreview--compact')}>
      <div className="tc-ipreview__bar">
        <span className="tc-muted tc-small">Xem như học sinh</span>
        <span className="tc-row">
          {result && checked && !reveal ? <span className={cx('tc-chip', result.correct ? 'tc-chip--ok' : 'tc-chip--warn')}>{result.graded ? (result.correct ? 'Đúng' : `Chưa đúng · ${Math.round(result.score * 100)}%`) : 'Không chấm'}</span> : null}
          <Btn size="sm" onClick={() => setChecked(true)} disabled={value === undefined}>Chấm thử</Btn>
          <Btn size="sm" onClick={() => { setValue(undefined); setChecked(false); setReveal(false); }} icon="retry">Làm lại</Btn>
          <label className="tc-switch"><input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> Xem đáp án</label>
        </span>
      </div>
      <KidShell className="tc-ipreview__kid" bigText={item.grade <= 2}>
        <ActivityView key={key} item={item} value={value} onChange={(v) => { setValue(v); setChecked(false); }} reveal={reveal || checked} result={result} bigText={item.grade <= 2} />
      </KidShell>
    </div>
  );
}

/** Soạn hoạt động: ItemEditor bên trái, xem trước trực tiếp bên phải. */
export function ItemStudio({ item, onChange }: { item: Item; onChange: (it: Item) => void }) {
  return (
    <div className="tc-studio">
      <div className="tc-studio__edit"><ItemEditor item={item} onChange={onChange} /></div>
      <div className="tc-studio__preview"><ItemPreview item={item} /></div>
    </div>
  );
}

export function newItemOfType(type: ItemType, grade?: Grade, subject?: SubjectId): Item {
  const s = sampleItem(type) as Item;
  return { ...s, id: uid('it'), ...(grade ? { grade } : {}), ...(subject ? { subject } : {}) } as Item;
}

/** Lưới chọn dạng hoạt động (16 dạng, nhãn "Mới"). */
export function TypePickerGrid({ onPick }: { onPick: (t: ItemType) => void }) {
  return (
    <div className="tc-typegrid">
      {ACTIVITY_TYPES.map((t) => (
        <button key={t.type} type="button" className="tc-typecard" onClick={() => onPick(t.type)}>
          <span className="tc-typecard__icon"><Icon name={TYPE_ICON[t.type]} size={22} /></span>
          <span className="tc-typecard__text">
            <strong>{t.label}{t.isNew ? <em className="tc-new">Mới</em> : null}</strong>
            <span>{t.description}</span>
            {!t.graded ? <small className="tc-muted">Không chấm điểm</small> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export function TypePickerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: ItemType) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Chọn dạng hoạt động" wide>
      <TypePickerGrid onPick={onPick} />
    </Dialog>
  );
}

/** Chọn item trong ngân hàng: tìm kiếm + lọc + xem trước. */
export function ItemPickerDialog({ open, onClose, onPick, grade, subject }: { open: boolean; onClose: () => void; onPick: (it: Item) => void; grade?: Grade; subject?: SubjectId }) {
  const [search, setSearch] = useState('');
  const [sub, setSub] = useState<SubjectId | ''>(subject ?? '');
  const focus = useFocusGrade().grade;
  const [gr, setGr] = useState<Grade | 0>(grade ?? focus);
  const [type, setType] = useState<ItemType | ''>('');
  const [sel, setSel] = useState<Item | null>(null);
  const q = useItems({ ...(sub ? { subject: sub } : {}), ...(gr ? { grade: gr } : {}), ...(type ? { type } : {}), ...(search.trim() ? { search: search.trim() } : {}) });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Chọn hoạt động từ ngân hàng"
      full
      footer={<><span className="tc-muted tc-small">{q.data ? `${q.data.length} hoạt động` : ''}</span><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" disabled={!sel} onClick={() => sel && onPick(sel)}>Dùng hoạt động này</Btn></>}
    >
      <div className="tc-picker">
        <div className="tc-picker__list">
          <div className="tc-filters">
            <input className="tc-input" placeholder="Tìm theo đề bài, kĩ năng…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="tc-input" value={sub} onChange={(e) => setSub(e.target.value as SubjectId | '')}>
              <option value="">Mọi môn</option>
              {subjectOptionsFor(gr, [sub]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="tc-input" value={gr} onChange={(e) => { const g = Number(e.target.value) as Grade | 0; setGr(g); if (g && sub && !subjectInGrade(sub, g)) setSub(''); }}>
              <option value={0}>Mọi lớp</option>
              {[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>Lớp {g}</option>)}
            </select>
            <select className="tc-input" value={type} onChange={(e) => setType(e.target.value as ItemType | '')}>
              <option value="">Mọi dạng</option>
              {ACTIVITY_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
          </div>
          {q.isLoading ? <Loading /> : !q.data?.length ? <Empty icon="puzzle" title="Không có hoạt động phù hợp">Thử bỏ bớt bộ lọc.</Empty> : (
            <ul className="tc-list">
              {q.data.map((it) => (
                <li key={it.id}>
                  <button type="button" className={cx('tc-listrow', sel?.id === it.id && 'is-active')} onClick={() => setSel(it)}>
                    <TypeBadge type={it.type} />
                    <span className="tc-listrow__main">{shorten(it.prompt.text, 110)}</span>
                    <span className="tc-muted tc-small">{SUBJECTS[it.subject]?.name} · Lớp {it.grade}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="tc-picker__preview">
          {sel ? <ItemPreview item={sel} /> : <Empty icon="eye" title="Chọn một hoạt động để xem trước" />}
        </div>
      </div>
    </Dialog>
  );
}

export { Seg };
