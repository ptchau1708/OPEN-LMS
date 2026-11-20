/**
 * Bộ khung soạn thảo dùng chung cho các Editor của agent E2 (giao diện pro, token --p-*).
 * Đặt tạm ở đây vì phạm vi file; có thể chuyển sang src/shared/ sau.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { uid } from '@openedu/contracts';
import type { Choice } from '@openedu/contracts';
import { Media } from '@openedu/ui';
import './edkit.css';

export function newId(prefix: string): string {
  return uid(prefix);
}

export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const out = arr.slice();
  if (to < 0 || to >= out.length || from === to) return out;
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/** Tách nhập nhanh: "Em / đi / học" hoặc mỗi dòng một mục (hoặc dấu phẩy nếu sep=','). */
export function splitQuick(s: string, sep: '/' | ',' = '/'): string[] {
  const re = sep === ',' ? /[,\n;]/ : /[/\n]/;
  return s.split(re).map((x) => x.trim()).filter(Boolean);
}

export function EdRoot({ type, children }: { type: string; children: ReactNode }) {
  return <div className={`ae-ed ae-ed-k ae-ed--${type.toLowerCase()}`}>{children}</div>;
}

export function EdSection({ title, hint, actions, children }: { title: string; hint?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="ae-ed-sec">
      <header className="ae-ed-sec__head">
        <h4 className="ae-ed-sec__title">{title}</h4>
        {actions ? <div className="ae-ed-sec__actions">{actions}</div> : null}
      </header>
      {hint ? <p className="ae-ed-hint">{hint}</p> : null}
      {children}
    </section>
  );
}

export function EdWarn({ children }: { children: ReactNode }) {
  return <p className="ae-ed-warn" role="status">{children}</p>;
}

export function EdBtn({ children, onClick, kind = 'default', disabled, title }: { children: ReactNode; onClick: () => void; kind?: 'default' | 'primary' | 'ghost' | 'danger'; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className={`ae-ed-btn ae-ed-btn--${kind}`} onClick={onClick} disabled={disabled} title={title} aria-label={title}>
      {children}
    </button>
  );
}

export function EdField({ label, children, grow }: { label: string; children: ReactNode; grow?: boolean }) {
  return (
    <label className={`ae-ed-fld${grow ? ' ae-ed-fld--grow' : ''}`}>
      <span className="ae-ed-fld__lbl">{label}</span>
      {children}
    </label>
  );
}

/** Ô nhập ảnh: "emoji:🐟" hoặc URL. Có xem trước. */
export function ImageInput({ value, onChange, placeholder = 'emoji:🐟 hoặc URL ảnh' }: { value?: string; onChange: (v: string | undefined) => void; placeholder?: string }) {
  return (
    <span className="ae-ed-img">
      <span className="ae-ed-img__prev" aria-hidden="true">{value ? <Media src={value} size={28} /> : '🖼'}</span>
      <input className="ae-ed-input" value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)} />
    </span>
  );
}

export interface ChoiceRowsProps {
  items: Choice[];
  onChange: (items: Choice[]) => void;
  /** Gọi khi xoá một mục (để dọn key). */
  onRemove?: (id: string) => void;
  idPrefix: string;
  addLabel: string;
  placeholder?: string;
  withImage?: boolean;
  withSpeak?: boolean;
  numbered?: boolean;
  min?: number;
  max?: number;
  extra?: (c: Choice, i: number) => ReactNode;
}

/** Danh sách thẻ/lựa chọn: sửa chữ, ảnh, đọc to; lên/xuống; xoá; thêm. */
export function ChoiceRows({ items, onChange, onRemove, idPrefix, addLabel, placeholder = 'Nội dung thẻ', withImage = true, withSpeak = false, numbered = false, min = 1, max = 20, extra }: ChoiceRowsProps) {
  const set = (i: number, patch: Partial<Choice>) => {
    const next = items.slice();
    const c = { ...next[i], ...patch };
    (Object.keys(c) as (keyof Choice)[]).forEach((k) => c[k] === undefined && delete c[k]);
    next[i] = c;
    onChange(next);
  };
  return (
    <div className="ae-ed-rows">
      {items.map((c, i) => (
        <div className="ae-ed-row" key={c.id}>
          <span className="ae-ed-row__move">
            <EdBtn kind="ghost" title="Lên" disabled={i === 0} onClick={() => onChange(moveItem(items, i, i - 1))}>↑</EdBtn>
            <EdBtn kind="ghost" title="Xuống" disabled={i === items.length - 1} onClick={() => onChange(moveItem(items, i, i + 1))}>↓</EdBtn>
          </span>
          {numbered ? <span className="ae-ed-row__num">{i + 1}</span> : null}
          <input className="ae-ed-input ae-ed-row__text" value={c.text ?? ''} placeholder={placeholder} aria-label={`${placeholder} ${i + 1}`} onChange={(e) => set(i, { text: e.target.value || undefined })} />
          {withImage ? <ImageInput value={c.image} onChange={(v) => set(i, { image: v })} /> : null}
          {withSpeak ? <input className="ae-ed-input ae-ed-row__speak" value={c.speak ?? ''} placeholder="Đọc to (tuỳ chọn)" aria-label="Câu đọc to" onChange={(e) => set(i, { speak: e.target.value || undefined })} /> : null}
          {extra ? <span className="ae-ed-row__extra">{extra(c, i)}</span> : null}
          <EdBtn
            kind="danger"
            title="Xoá"
            disabled={items.length <= min}
            onClick={() => {
              onChange(items.filter((x) => x.id !== c.id));
              onRemove?.(c.id);
            }}
          >✕</EdBtn>
        </div>
      ))}
      <div className="ae-ed-rows__foot">
        <EdBtn kind="primary" disabled={items.length >= max} onClick={() => onChange([...items, { id: newId(idPrefix), text: '' }])}>+ {addLabel}</EdBtn>
      </div>
    </div>
  );
}

/** Nhập nhanh nhiều mục một lúc. */
export function QuickAdd({ label, placeholder, sep = '/', onAdd, buttonLabel = 'Thêm' }: { label: string; placeholder: string; sep?: '/' | ','; onAdd: (texts: string[]) => void; buttonLabel?: string }) {
  const [v, setV] = useState('');
  const go = () => {
    const t = splitQuick(v, sep);
    if (!t.length) return;
    onAdd(t);
    setV('');
  };
  return (
    <div className="ae-ed-quick">
      <span className="ae-ed-fld__lbl">{label}</span>
      <div className="ae-ed-quick__row">
        <input
          className="ae-ed-input"
          value={v}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go();
            }
          }}
        />
        <EdBtn onClick={go} disabled={!v.trim()}>{buttonLabel}</EdBtn>
      </div>
    </div>
  );
}

/** Chọn màu từ bảng token cho nhóm / ô. */
export const COLOR_OPTIONS: { value: string; name: string }[] = [
  { value: 'var(--k-math)', name: 'Xanh dương' },
  { value: 'var(--k-viet)', name: 'Cam' },
  { value: 'var(--k-nat)', name: 'Xanh lá' },
  { value: 'var(--k-eng)', name: 'Tím' },
  { value: 'var(--k-art)', name: 'Hồng' },
  { value: 'var(--k-sci)', name: 'Xanh ngọc' },
  { value: 'var(--k-music)', name: 'Đỏ' },
  { value: 'var(--k-star-dark)', name: 'Vàng đậm' },
];

export function ColorPick({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <span className="ae-ed-colors" role="radiogroup" aria-label="Màu nhóm">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          title={c.name}
          aria-label={c.name}
          className={`ae-ed-swatch${value === c.value ? ' is-on' : ''}`}
          style={{ background: c.value }}
          onClick={() => onChange(c.value)}
        />
      ))}
    </span>
  );
}
