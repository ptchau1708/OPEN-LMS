import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Choice } from '@openedu/contracts';
import { sfx, speak } from '@openedu/ui';
import { subjectColorVar } from '../../shared/PromptView';
import { seededShuffle } from '../../shared/shuffle';
import { parseBlanks } from '../../shared/text';
import type { TypePlayerProps } from '../../shared/typeApi';
import { score } from './score';
import './style.css';

interface Pos { left: number; top: number; arrow: number }

export function Player({ item, value, onChange, disabled, reveal, result, mode }: TypePlayerProps<'INLINE_DROPDOWN'>) {
  const passage = item.payload.passage ?? '';
  const segs = useMemo(() => parseBlanks(passage), [passage]);
  const dropdowns = item.payload.dropdowns ?? {};
  const shuffled = useMemo(() => {
    const out: Record<string, Choice[]> = {};
    Object.keys(dropdowns).forEach((id) => { out[id] = seededShuffle(dropdowns[id] ?? [], `${item.id}:${id}`); });
    return out;
  }, [dropdowns, item.id]);
  const blanks = value?.blanks ?? {};
  const locked = disabled || reveal;
  const parts = reveal ? (result?.parts ?? (item.key ? score(item, value).parts : undefined)) : undefined;
  const lang = item.prompt.lang === 'en-US' ? 'en' : 'vi';

  const [open, setOpen] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const btns = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => { if (locked) setOpen(null); }, [locked]);

  // đặt popover ngay dưới ô, không tràn khỏi khung đoạn văn
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const wrap = wrapRef.current;
      const btn = btns.current[open];
      const pop = popRef.current;
      if (!wrap || !btn || !pop) return;
      const wr = wrap.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      const pw = pop.offsetWidth;
      const center = br.left + br.width / 2 - wr.left;
      const left = Math.max(0, Math.min(center - pw / 2, wr.width - pw));
      setPos({ left, top: br.bottom - wr.top + 14, arrow: Math.max(18, Math.min(pw - 18, center - left)) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  // đóng khi chạm ra ngoài / bấm Esc; đưa popover vào tầm nhìn
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btns.current[open]?.contains(t)) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(null); btns.current[open]?.focus(); }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    if (!open || !pos) return;
    const pop = popRef.current;
    if (!pop) return;
    pop.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    const first = (pop.querySelector('[aria-selected="true"]') ?? pop.querySelector('button')) as HTMLButtonElement | null;
    first?.focus({ preventScroll: true });
  }, [open, pos]);

  const choose = (id: string, c: Choice) => {
    sfx.tap();
    if (mode === 'player' && item.grade <= 2 && (c.speak ?? c.text)) speak(c.speak ?? c.text ?? '', { lang: item.prompt.lang });
    onChange({ blanks: { ...blanks, [id]: c.id } });
    setOpen(null);
    btns.current[id]?.focus({ preventScroll: true });
  };

  const textOf = (id: string, choiceId: string | undefined) =>
    choiceId ? (dropdowns[id] ?? []).find((c) => c.id === choiceId)?.text ?? '' : '';

  const openChoices = open ? shuffled[open] ?? [] : [];

  let n = 0;
  return (
    <div className={`ae-dd ae-dd--${mode}`} style={{ ['--ae-accent' as string]: subjectColorVar(item) }}>
      <div className="ae-passage ae-dd__passage" lang={lang} ref={wrapRef}>
        {segs.map((s, i) => {
          if (s.type === 'text') return <span key={i} className="ae-passage__text">{s.text}</span>;
          const id = s.id;
          n++;
          const chosen = blanks[id];
          const txt = textOf(id, chosen);
          const st = parts && id in parts ? (parts[id] ? ' ae-ok is-ok' : ' ae-try is-try') : '';
          const fix = st.includes('is-try') && item.key?.blanks?.[id]
            ? textOf(id, item.key.blanks[id]) || item.key.blanks[id]
            : undefined;
          return (
            <span key={i} className="ae-blank-wrap">
              <button
                ref={(el) => { btns.current[id] = el; }}
                type="button"
                className={`ae-dd__slot${txt ? ' is-filled' : ''}${open === id ? ' is-open' : ''}${st}${locked ? ' is-locked' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={open === id}
                aria-label={txt ? `Ô chọn số ${n}: ${txt}` : `Ô chọn số ${n}, chưa chọn`}
                onClick={() => {
                  if (locked) return;
                  sfx.tap();
                  setOpen(open === id ? null : id);
                }}
              >
                <span className="ae-dd__value">{txt || <span className="ae-dd__q">?</span>}</span>
                {!locked ? <span className="ae-dd__caret" aria-hidden="true" /> : null}
              </button>
              {fix ? <span className="ae-fix">{fix}</span> : null}
            </span>
          );
        })}

        {open ? (
          <div
            ref={popRef}
            className={`ae-dd__pop${pos ? ' is-placed' : ''}`}
            role="listbox"
            aria-label="Chọn từ đúng"
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, ['--arrow' as string]: `${pos?.arrow ?? 24}px` }}
          >
            {openChoices.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={blanks[open] === c.id}
                className={`ae-dd__opt${blanks[open] === c.id ? ' is-selected' : ''}`}
                onClick={() => choose(open, c)}
              >
                {c.text}
              </button>
            ))}
            {openChoices.length === 0 ? <span className="ae-dd__none">Chưa có lựa chọn</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
