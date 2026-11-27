/**
 * Ô nhập nhận xét có gợi ý từ ngân hàng nhận xét: bấm vào ô → hiện các câu hay dùng (cùng môn, cùng mức trước);
 * gõ vài chữ → lọc theo phần đang gõ dở (sau dấu câu cuối, không cần dấu). Chọn bằng chuột hoặc ↑ ↓ Enter; Esc để đóng.
 * Chọn câu: thay phần đang gõ dở; ô đã có nhận xét thì nối thêm vào sau (không xoá câu cũ).
 * Danh sách câu lấy từ <BankProvider> (một lần cho cả trang).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { foldVietnamese, suggestComments, type BankComment } from '@openedu/data';

const BankCtx = createContext<readonly BankComment[]>([]);
export const BankProvider = BankCtx.Provider;

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (v: string) => void;
  /** Phạm vi ngân hàng: 'tt27:<mã môn>' | 'tt27:chung' … */
  scope: string;
  /** Mức đang chọn (T/H/C/Đ) — câu cùng mức xếp trước. */
  level?: string;
};

export function CommentInput({ value, onChange, scope, level, onFocus, onBlur, onKeyDown, ...rest }: Props) {
  const bank = useContext(BankCtx);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  /** Đã gõ từ lúc bấm vào ô → lọc theo phần đang gõ dở; vừa bấm vào → hiện câu hay dùng (chưa lọc). */
  const [typing, setTyping] = useState(false);
  const frag = typing ? (value.split(/[.!?;\n]/).pop() ?? '') : '';
  const sugg = useMemo(() => {
    if (!open) return [];
    const have = foldVietnamese(value);
    return suggestComments(bank, scope, { level, typed: frag, limit: 12 }).filter((c) => !have.includes(foldVietnamese(c.text))).slice(0, 6);
  }, [open, bank, scope, level, frag, value]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      // Gần đáy màn hình → mở lên phía trên ô.
      setPos(window.innerHeight - r.bottom < 300 && r.top > 300 ? { left, bottom: window.innerHeight - r.top + 4, width } : { left, top: r.bottom + 4, width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);
  useEffect(() => { setHi(-1); }, [value, scope]);

  const pick = (t: string) => {
    // Đang gõ dở → thay phần dở bằng câu đầy đủ; còn lại → nối vào sau nhận xét đang có.
    const head = (frag.trim() ? value.slice(0, value.length - frag.length) : value).trim();
    onChange(head ? `${head} ${t}` : t);
    setTyping(false);
    setOpen(false);
  };

  return (
    <>
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => { onChange(e.target.value); setTyping(true); setOpen(true); }}
        onFocus={(e) => { setTyping(false); setOpen(true); onFocus?.(e); }}
        onBlur={(e) => { setOpen(false); onBlur?.(e); }}
        onKeyDown={(e) => {
          if (open && sugg.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % sugg.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h <= 0 ? sugg.length - 1 : h - 1)); return; }
            if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(sugg[hi]!.text); return; }
          }
          if (e.key === 'Escape' && open) { setOpen(false); return; }
          onKeyDown?.(e);
        }}
        aria-autocomplete="list"
        aria-expanded={open && sugg.length > 0}
      />
      {open && sugg.length && pos ? createPortal(
        <ul className="tc-sugg" role="listbox" aria-label="Gợi ý từ ngân hàng nhận xét" style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}>
          <li className="tc-sugg__head" aria-hidden>Ngân hàng nhận xét · ↑↓ Enter</li>
          {sugg.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === hi} className={i === hi ? 'is-hi' : undefined}
              onMouseDown={(e) => { e.preventDefault(); pick(c.text); }} onMouseEnter={() => setHi(i)}>
              {c.level ? <span className={`tc-sugg__lv tc-pick--${c.level === 'Đ' ? 'D' : c.level}`}>{c.level}</span> : null}
              <span className="tc-sugg__text">{c.text}</span>
              {!c.mine ? <span className="tc-sugg__meta" title="Câu thầy/cô khác chia sẻ">chung</span> : c.uses > 1 ? <span className="tc-sugg__meta" title="Số lần đã dùng">×{c.uses}</span> : null}
            </li>
          ))}
        </ul>,
        // Gắn vào gốc ứng dụng (giữ biến màu / giao diện), không có thì vào body.
        document.querySelector('.tc-app') ?? document.body,
      ) : null}
    </>
  );
}
