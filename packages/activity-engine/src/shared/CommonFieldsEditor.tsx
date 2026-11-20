import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Choice, Grade, Item, ItemBase } from '@openedu/contracts';
import { SUBJECT_LIST } from '@openedu/contracts';
import { Media } from '@openedu/ui';
import { blankIds } from './text';
import '../styles.css';

/* ===================================================================== */
/*  Khối dựng trình soạn GV dùng chung (các dạng khác cũng có thể dùng)   */
/* ===================================================================== */

export function EdSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="ae-ed-section">
      <div className="ae-ed-section__head">
        <h3 className="ae-ed-section__title">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EdField({ label, help, span, children }: { label: string; help?: ReactNode; span?: boolean; children: ReactNode }) {
  return (
    <label className={`ae-ed-field${span ? ' ae-ed-span' : ''}`}>
      <span className="ae-ed-label">{label}</span>
      {children}
      {help ? <span className="ae-ed-help">{help}</span> : null}
    </label>
  );
}

/** Nhóm nút chọn một giá trị (lớp, số cột, số sao). */
export function Seg<T extends string | number>({ value, options, onChange, label }: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="ae-ed-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PICTO = /\p{Extended_Pictographic}/u;

/** Đổi chữ GV gõ thành giá trị ảnh: URL giữ nguyên, emoji → "emoji:🐟", rỗng → undefined. */
export function toImageValue(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (t.startsWith('emoji:')) return t;
  if (/^(https?:|data:|blob:|\/|\.\/)/i.test(t) || t.includes('.')) return t;
  if (PICTO.test(t) && t.length <= 16) return `emoji:${t}`;
  return t;
}
function imageDisplay(v: string | undefined): string {
  if (!v) return '';
  return v.startsWith('emoji:') ? v.slice(6) : v;
}

/** Ô nhập ảnh: URL hoặc emoji, có xem trước. */
export function MediaInput({ value, onChange, placeholder = 'URL ảnh hoặc emoji 🐟' }: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
}) {
  return (
    <span className="ae-ed-media">
      <span className="ae-ed-media__preview" aria-hidden="true">{value ? <Media src={value} alt="" size={value.startsWith('emoji:') ? 22 : 36} fit="cover" /> : null}</span>
      <input
        className="ae-ed-input"
        value={imageDisplay(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(toImageValue(e.target.value))}
        spellCheck={false}
      />
    </span>
  );
}

/** Tách danh sách GV gõ, ngăn bằng ; | hoặc xuống dòng. */
export function splitList(s: string): string[] {
  return s.split(/[;|\n]/).map((x) => x.trim()).filter(Boolean);
}

/** Ô nhập nhiều giá trị ("náo nức; háo hức"): giữ nguyên chữ đang gõ, chỉ gửi ra danh sách đã tách. */
export function ListInput({ value, onChange, placeholder, ariaLabel }: {
  value: readonly string[];
  onChange: (list: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const joined = value.join('\u0000');
  const [raw, setRaw] = useState(() => value.join('; '));
  const last = useRef(joined);
  useEffect(() => {
    if (joined !== last.current) {
      last.current = joined;
      setRaw(value.join('; '));
    }
  }, [joined, value]);
  return (
    <input
      className="ae-ed-input"
      value={raw}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        setRaw(e.target.value);
        const list = splitList(e.target.value);
        last.current = list.join('\u0000');
        onChange(list);
      }}
      onBlur={() => setRaw(splitList(raw).join('; '))}
    />
  );
}

/** Id ngắn chưa dùng: không có tiền tố → a, b, c…; có tiền tố → b1, b2… */
export function nextId(existing: readonly string[], prefix = ''): string {
  const used = new Set(existing);
  if (!prefix) {
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(97 + i);
      if (!used.has(c)) return c;
    }
    prefix = 'o';
  }
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function letterOf(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
}

function move<T>(arr: readonly T[], from: number, to: number): T[] {
  const out = arr.slice();
  if (to < 0 || to >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

export interface ChoiceListEditorProps {
  choices: Choice[];
  /** Id các đáp án đúng. Bỏ trống (undefined) = không có cột "Đúng" (POLL, kho từ). */
  correct?: string[];
  /** true: nhiều đáp án đúng (ô vuông); false: một đáp án (nút tròn). */
  multi?: boolean;
  /** Gọi một lần cho mỗi thao tác, kèm danh sách đáp án đúng đã dọn (bỏ id đã xoá). */
  onChange: (choices: Choice[], correct: string[]) => void;
  withImage?: boolean;
  withSpeak?: boolean;
  min?: number;
  max?: number;
  idPrefix?: string;
  addLabel?: string;
  textPlaceholder?: string;
  /** Huy hiệu A, B, C… (mặc định true). */
  letters?: boolean;
}

/** Danh sách lựa chọn: thêm / xoá / đổi thứ tự / chữ / ảnh / đánh dấu đúng. */
export function ChoiceListEditor({
  choices, correct, multi = false, onChange, withImage = true, withSpeak = false,
  min = 1, max = 8, idPrefix = '', addLabel = 'Thêm lựa chọn', textPlaceholder = 'Nội dung',
  letters = true,
}: ChoiceListEditorProps) {
  const group = useId();
  const corr = correct ?? [];
  const emit = (next: Choice[], nextCorrect: string[] = corr) => {
    const ids = new Set(next.map((c) => c.id));
    onChange(next, nextCorrect.filter((id) => ids.has(id)));
  };
  const set = (i: number, patch: Partial<Choice>) => {
    const next = choices.slice();
    const c: Choice = { ...next[i], ...patch };
    (Object.keys(c) as (keyof Choice)[]).forEach((k) => { if (c[k] === undefined || c[k] === '') delete c[k]; });
    if (!c.id) c.id = choices[i].id;
    next[i] = c;
    emit(next);
  };
  const toggleCorrect = (id: string) => {
    if (multi) emit(choices, corr.includes(id) ? corr.filter((x) => x !== id) : [...corr, id]);
    else emit(choices, [id]);
  };
  const add = () => emit([...choices, { id: nextId(choices.map((c) => c.id), idPrefix), text: '' }]);

  return (
    <div className="ae-ed-field">
      <ul className="ae-ed-list">
        {choices.map((c, i) => {
          const isCorrect = corr.includes(c.id);
          return (
            <li key={c.id} className={`ae-ed-rowitem${isCorrect ? ' is-correct' : ''}`}>
              {letters ? <span className="ae-ed-badge" title={`id: ${c.id}`}>{letterOf(i)}</span> : null}
              {correct !== undefined ? (
                <label className={`ae-ed-correct${isCorrect ? ' is-on' : ''}`} title="Đánh dấu là đáp án đúng">
                  <input type={multi ? 'checkbox' : 'radio'} name={group} checked={isCorrect} onChange={() => toggleCorrect(c.id)} />
                  Đúng
                </label>
              ) : null}
              <input
                className="ae-ed-input ae-ed-rowitem__grow"
                value={c.text ?? ''}
                placeholder={textPlaceholder}
                aria-label={`Nội dung lựa chọn ${letterOf(i)}`}
                onChange={(e) => set(i, { text: e.target.value })}
              />
              {withImage ? (
                <span className="ae-ed-rowitem__img"><MediaInput value={c.image} onChange={(v) => set(i, { image: v })} placeholder="Ảnh / emoji" /></span>
              ) : null}
              {withSpeak ? (
                <input
                  className="ae-ed-input ae-ed-rowitem__grow"
                  value={c.speak ?? ''}
                  placeholder="Câu đọc to khi chạm (tuỳ chọn)"
                  onChange={(e) => set(i, { speak: e.target.value })}
                />
              ) : null}
              <span className="ae-ed-rowitem__tools">
                <button type="button" className="ae-ed-icon" aria-label="Chuyển lên" title="Chuyển lên" disabled={i === 0} onClick={() => emit(move(choices, i, i - 1))}>▲</button>
                <button type="button" className="ae-ed-icon" aria-label="Chuyển xuống" title="Chuyển xuống" disabled={i === choices.length - 1} onClick={() => emit(move(choices, i, i + 1))}>▼</button>
                <button type="button" className="ae-ed-icon ae-ed-icon--danger" aria-label="Xoá" title="Xoá" disabled={choices.length <= min} onClick={() => emit(choices.filter((_, j) => j !== i))}>✕</button>
              </span>
            </li>
          );
        })}
      </ul>
      {choices.length < max ? (
        <button type="button" className="ae-ed-btn ae-ed-btn--add" onClick={add}>＋ {addLabel}</button>
      ) : null}
    </div>
  );
}

/** Ô soạn đoạn văn có chỗ trống {{id}}: nút chèn ô tại vị trí con trỏ, liệt kê các ô đã nhận ra. */
export function PassageField({ value, onChange, prefix, insertLabel, label = 'Đoạn văn', help }: {
  value: string;
  onChange: (v: string) => void;
  prefix: string;
  insertLabel: string;
  label?: string;
  help?: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ids = blankIds(value);
  const insert = () => {
    const ta = ref.current;
    const id = nextId(ids, prefix);
    const token = `{{${id}}}`;
    const start = ta ? ta.selectionStart : value.length;
    const end = ta ? ta.selectionEnd : value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const padL = before && !/\s$/.test(before) ? ' ' : '';
    const padR = after && !/^[\s.,!?;:]/.test(after) ? ' ' : '';
    const next = before + padL + token + padR + after;
    onChange(next);
    const caret = (before + padL + token).length;
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.focus();
      ref.current.setSelectionRange(caret, caret);
    });
  };
  return (
    <div className="ae-ed-field">
      <div className="ae-ed-section__head">
        <span className="ae-ed-label">{label}</span>
        <button type="button" className="ae-ed-btn" onClick={insert}>＋ {insertLabel}</button>
      </div>
      <textarea
        ref={ref}
        className="ae-ed-textarea ae-ed-textarea--mono"
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {help ? <p className="ae-ed-help">{help}</p> : null}
      {ids.length ? (
        <div className="ae-ed-chips" aria-label="Các ô đã nhận ra">
          {ids.map((id) => <span key={id} className="ae-ed-chip"><span className="ae-ed-code">{`{{${id}}}`}</span></span>)}
        </div>
      ) : null}
    </div>
  );
}

/* ===================================================================== */
/*  Phần chung của mọi item                                               */
/* ===================================================================== */

const DIFFICULTY: { value: NonNullable<ItemBase['difficulty']>; label: string }[] = [
  { value: 'nhan-biet', label: 'Nhận biết' },
  { value: 'ket-noi', label: 'Kết nối' },
  { value: 'van-dung', label: 'Vận dụng' },
];

function clean<T extends object>(o: T): T {
  const out = { ...o } as Record<string, unknown>;
  Object.keys(out).forEach((k) => { if (out[k] === undefined || out[k] === '') delete out[k]; });
  return out as T;
}

/** Đề bài, câu đọc to, ngôn ngữ, ảnh, lớp, môn, mức độ, gợi ý, giải thích, sao thưởng. */
export function CommonFieldsEditor({ item, onChange }: { item: Item; onChange: (item: Item) => void }) {
  const listen = item.type === 'LISTEN_CHOOSE';
  const up = (patch: Partial<ItemBase>) => onChange(clean({ ...item, ...patch }) as Item);
  const upPrompt = (patch: Partial<Item['prompt']>) =>
    onChange({ ...item, prompt: { ...clean({ ...item.prompt, ...patch }), text: item.prompt.text } } as Item);

  return (
    <EdSection title="Đề bài và thông tin chung">
      <EdField label={listen ? 'Lời dặn (hiện trên màn hình)' : 'Đề bài'} span>
        <textarea
          className="ae-ed-textarea"
          rows={2}
          value={item.prompt.text}
          placeholder={listen ? 'Em nghe và chạm vào tranh đúng nhé!' : 'Viết câu hỏi ngắn, dễ hiểu cho học sinh'}
          onChange={(e) => onChange({ ...item, prompt: { ...item.prompt, text: e.target.value } } as Item)}
        />
      </EdField>
      <div className="ae-ed-grid ae-ed-grid--2">
        <EdField
          label={listen ? 'Nội dung học sinh phải nghe' : 'Câu đọc to (tuỳ chọn)'}
          help={listen ? 'Máy sẽ đọc câu này khi em bấm nút “Nghe”. Không hiện ra màn hình.' : 'Bỏ trống thì máy đọc đúng đề bài.'}
        >
          <input
            className="ae-ed-input"
            value={item.prompt.speak ?? ''}
            placeholder={listen ? 'vd: con gà' : 'Cách đọc khác với chữ viết, vd “8 cộng 5”'}
            onChange={(e) => upPrompt({ speak: e.target.value })}
          />
        </EdField>
        <EdField label="Ngôn ngữ đọc to">
          <select className="ae-ed-select" value={item.prompt.lang ?? 'vi-VN'} onChange={(e) => upPrompt({ lang: e.target.value as 'vi-VN' | 'en-US' })}>
            <option value="vi-VN">Tiếng Việt (vi-VN)</option>
            <option value="en-US">Tiếng Anh (en-US)</option>
          </select>
        </EdField>
        <EdField label="Ảnh minh hoạ" help="Dán URL ảnh hoặc gõ một emoji.">
          <MediaInput value={item.prompt.image} onChange={(v) => upPrompt({ image: v })} />
        </EdField>
        <EdField label="Âm thanh đọc sẵn (URL, tuỳ chọn)">
          <input className="ae-ed-input" value={item.prompt.audio ?? ''} placeholder="https://…/doc-de.mp3" spellCheck={false} onChange={(e) => upPrompt({ audio: e.target.value })} />
        </EdField>
      </div>

      <div className="ae-ed-grid">
        <div className="ae-ed-field">
          <span className="ae-ed-label">Lớp</span>
          <Seg<Grade> label="Lớp" value={item.grade} onChange={(g) => up({ grade: g })} options={[1, 2, 3, 4, 5].map((g) => ({ value: g as Grade, label: String(g) }))} />
        </div>
        <EdField label="Môn học">
          <select className="ae-ed-select" value={item.subject} onChange={(e) => up({ subject: e.target.value as Item['subject'] })}>
            {SUBJECT_LIST.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </EdField>
        <EdField label="Mức độ">
          <select className="ae-ed-select" value={item.difficulty ?? ''} onChange={(e) => up({ difficulty: (e.target.value || undefined) as ItemBase['difficulty'] })}>
            <option value="">— Chưa chọn —</option>
            {DIFFICULTY.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </EdField>
        <div className="ae-ed-field">
          <span className="ae-ed-label">Sao thưởng khi đúng</span>
          <Seg<number> label="Sao thưởng" value={item.stars ?? 1} onChange={(n) => up({ stars: n })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}★` }))} />
        </div>
      </div>

      <div className="ae-ed-grid ae-ed-grid--2">
        <EdField label="Gợi ý (hiện khi em chưa đúng)">
          <textarea className="ae-ed-textarea" rows={2} value={item.hint ?? ''} placeholder="Nhắc nhẹ cách làm, không nói đáp án" onChange={(e) => up({ hint: e.target.value })} />
        </EdField>
        <EdField label="Lời giải thích (hiện sau khi nộp)">
          <textarea className="ae-ed-textarea" rows={2} value={item.explanation ?? ''} placeholder="Vì sao đáp án đúng" onChange={(e) => up({ explanation: e.target.value })} />
        </EdField>
      </div>
    </EdSection>
  );
}
