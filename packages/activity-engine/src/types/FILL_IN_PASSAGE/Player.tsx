import { useMemo, useRef, useState } from 'react';
import type { Choice } from '@openedu/contracts';
import { sfx } from '@openedu/ui';
import { subjectColorVar } from '../../shared/PromptView';
import { seededShuffle } from '../../shared/shuffle';
import { blankIds, normalizeText, parseBlanks } from '../../shared/text';
import type { TypePlayerProps } from '../../shared/typeApi';
import { score } from './score';
import './style.css';

/** Thẻ nào trong kho từ đã được dùng (so theo chữ; hai thẻ cùng chữ được tính riêng). */
function usedChipIds(bank: readonly Choice[], blanks: Record<string, string>): Set<string> {
  const count = new Map<string, number>();
  Object.values(blanks).forEach((t) => {
    const k = normalizeText(t ?? '');
    if (k) count.set(k, (count.get(k) ?? 0) + 1);
  });
  const used = new Set<string>();
  for (const c of bank) {
    const k = normalizeText(c.text ?? '');
    const n = count.get(k) ?? 0;
    if (n > 0) {
      used.add(c.id);
      count.set(k, n - 1);
    }
  }
  return used;
}

export function Player({ item, value, onChange, disabled, reveal, result, mode }: TypePlayerProps<'FILL_IN_PASSAGE'>) {
  const passage = item.payload.passage ?? '';
  const segs = useMemo(() => parseBlanks(passage), [passage]);
  const ids = useMemo(() => blankIds(passage), [passage]);
  const rawBank = item.payload.bank;
  const bank = useMemo(() => (rawBank && rawBank.length ? seededShuffle(rawBank, `${item.id}:bank`) : []), [rawBank, item.id]);
  const hasBank = bank.length > 0;
  const blanks = value?.blanks ?? {};
  const locked = disabled || reveal;
  const parts = reveal ? (result?.parts ?? (item.key ? score(item, value).parts : undefined)) : undefined;
  const lang = item.prompt.lang === 'en-US' ? 'en' : 'vi';

  const [chip, setChip] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const used = useMemo(() => usedChipIds(bank, blanks), [bank, blanks]);
  const chipObj = chip ? bank.find((c) => c.id === chip) : undefined;
  const filledCount = ids.filter((id) => (blanks[id] ?? '').trim()).length;

  const emit = (next: Record<string, string>) => onChange({ blanks: next });
  const fill = (id: string, text: string) => {
    sfx.drop();
    emit({ ...blanks, [id]: text });
  };
  const clear = (id: string) => {
    const next = { ...blanks };
    delete next[id];
    sfx.tap();
    emit(next);
  };
  const nextEmpty = (after: string, filled: Record<string, string>) => {
    const start = ids.indexOf(after);
    const order = [...ids.slice(start + 1), ...ids.slice(0, start)];
    return order.find((id) => !(filled[id] ?? '').trim()) ?? null;
  };

  const tapChip = (c: Choice) => {
    if (locked || used.has(c.id)) return;
    if (target) {
      const after = { ...blanks, [target]: c.text ?? '' };
      fill(target, c.text ?? '');
      setTarget(nextEmpty(target, after));
      setChip(null);
      return;
    }
    sfx.tap();
    setChip(chip === c.id ? null : c.id);
  };

  const tapBlank = (id: string) => {
    if (locked) return;
    if (chipObj) {
      fill(id, chipObj.text ?? '');
      setChip(null);
      setTarget(null);
      return;
    }
    if ((blanks[id] ?? '').trim()) {
      clear(id);
      setTarget(id);
      return;
    }
    sfx.tap();
    setTarget(target === id ? null : id);
  };

  const fixText = (id: string): string | undefined => {
    const acc = item.key?.blanks?.[id]?.[0];
    if (!acc) return undefined;
    return (item.payload.bank ?? []).find((c) => c.id === acc)?.text ?? acc;
  };

  let tip: string | null = null;
  if (!locked && hasBank) {
    if (chipObj) tip = `Chạm vào chỗ trống để đặt từ “${chipObj.text ?? ''}” nhé!`;
    else if (target) tip = 'Giờ em chọn một từ ở dưới nhé!';
    else if (ids.length && filledCount === ids.length) tip = 'Em điền xong rồi! Chạm vào ô nếu muốn đổi từ.';
    else tip = 'Chạm vào một từ, rồi chạm vào chỗ trống.';
  }

  let n = 0;
  return (
    <div
      className={`ae-fip ae-fip--${mode}${hasBank ? ' ae-fip--bank' : ' ae-fip--type'}${chip ? ' is-carrying' : ''}`}
      style={{ ['--ae-accent' as string]: subjectColorVar(item) }}
    >
      <div className="ae-passage" lang={lang}>
        {segs.map((s, i) => {
          if (s.type === 'text') return <span key={i} className="ae-passage__text">{s.text}</span>;
          const id = s.id;
          n++;
          const v = blanks[id] ?? '';
          const filled = !!v.trim();
          const st = parts && id in parts ? (parts[id] ? ' ae-ok is-ok' : ' ae-try is-try') : '';
          const fix = st.includes('is-try') ? fixText(id) : undefined;
          if (!hasBank) {
            const idx = ids.indexOf(id);
            return (
              <span key={i} className="ae-blank-wrap">
                <input
                  ref={(el) => { inputs.current[id] = el; }}
                  className={`ae-blank-input${filled ? ' is-filled' : ''}${st}`}
                  value={v}
                  readOnly={locked}
                  aria-label={`Chỗ trống số ${n}`}
                  placeholder={String(n)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint={idx < ids.length - 1 ? 'next' : 'done'}
                  style={{ width: `${Math.max(4, Math.min(18, v.length + 2))}ch` }}
                  onChange={(e) => emit({ ...blanks, [id]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const nx = ids[idx + 1];
                      if (nx) inputs.current[nx]?.focus();
                      else (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
                {fix ? <span className="ae-fix">{fix}</span> : null}
              </span>
            );
          }
          return (
            <span key={i} className="ae-blank-wrap">
              <button
                type="button"
                className={`ae-blank${filled ? ' is-filled' : ''}${target === id ? ' is-target' : ''}${chip && !locked ? ' is-droppable' : ''}${st}${locked ? ' is-locked' : ''}`}
                aria-label={filled ? `Chỗ trống số ${n}: ${v}. Chạm để bỏ từ` : `Chỗ trống số ${n}`}
                aria-pressed={target === id}
                onClick={() => tapBlank(id)}
              >
                {filled ? <span className="ae-blank__word">{v}</span> : <span className="ae-blank__num">{n}</span>}
              </button>
              {fix ? <span className="ae-fix">{fix}</span> : null}
            </span>
          );
        })}
      </div>

      {hasBank ? (
        <div className="ae-bank-wrap">
          {tip ? <span key={tip} className="ae-tip ae-tip--live ae-fip__tip">{tip}</span> : null}
          <div className="ae-bank" role="group" aria-label="Kho từ" lang={lang}>
            {bank.map((c) => {
              const isUsed = used.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`ae-chip${chip === c.id ? ' is-selected' : ''}${isUsed ? ' is-used' : ''}${locked ? ' is-locked' : ''}`}
                  aria-pressed={chip === c.id}
                  aria-disabled={isUsed || locked || undefined}
                  onClick={() => tapChip(c)}
                >
                  {c.text}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
