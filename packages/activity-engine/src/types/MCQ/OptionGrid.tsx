import { useMemo } from 'react';
import type { ActivityMode, Choice } from '@openedu/contracts';
import { Icon, Media, sfx, speak } from '@openedu/ui';
import { seededShuffle } from '../../shared/shuffle';
import './style.css';

/** Màu huy hiệu A/B/C/D… theo bảng màu các môn. */
// Tránh xanh lá / cam ở các vị trí đầu để màu huy hiệu không lẫn với màu "đúng" (--k-ok) và "chưa đúng" (--k-try).
const BADGE_COLORS = ['--k-math', '--k-art', '--k-eng', '--k-sci', '--k-viet', '--k-nat', '--k-other'];

export function badgeColor(i: number): string {
  return `var(${BADGE_COLORS[i % BADGE_COLORS.length]})`;
}
export function badgeLetter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
}

/** Thứ tự hiển thị ổn định theo item id (giống nhau trên mọi máy HS, TV và màn GV). */
export function useDisplayOrder(options: readonly Choice[], seed: string, shuffle: boolean): Choice[] {
  return useMemo(() => (shuffle ? seededShuffle(options, seed) : options.slice()), [options, seed, shuffle]);
}

export interface OptionGridProps {
  options: readonly Choice[];
  /** Seed xáo (item.id). */
  seed: string;
  shuffle?: boolean;
  columns?: 1 | 2 | 4;
  selected: readonly string[];
  onPick?: (id: string) => void;
  multi?: boolean;
  disabled?: boolean;
  /** Đang hiện đáp án. */
  reveal?: boolean;
  /** ScoreResult.parts: true = đáp án đúng, false = đã chọn nhưng chưa đúng. */
  parts?: Record<string, boolean>;
  mode: ActivityMode;
  /** Đọc to lựa chọn khi chạm (lớp 1–2). */
  speakOnPick?: boolean;
  lang?: 'vi-VN' | 'en-US';
  /** false: chỉ hiển thị (POLL trên TV). */
  interactive?: boolean;
  ariaLabel: string;
  className?: string;
}

/** Lưới thẻ lựa chọn to, dễ chạm: huy hiệu chữ cái màu, hình và/hoặc chữ, trạng thái chọn rõ ràng. */
export function OptionGrid({
  options, seed, shuffle = true, columns, selected, onPick, multi = false, disabled = false,
  reveal = false, parts, mode, speakOnPick = false, lang, interactive = true, ariaLabel, className,
}: OptionGridProps) {
  const shown = useDisplayOrder(options, seed, shuffle);
  const n = shown.length;
  const want = columns ?? (mode === 'bigscreen' && n <= 4 && n > 2 && shown.every((o) => !!o.image) ? 4 : 2);
  const cols = Math.max(1, Math.min(want, n || 1));
  const visual = n > 0 && shown.every((o) => !!o.image);
  const locked = disabled || reveal || !interactive;

  const pick = (c: Choice) => {
    if (locked || !onPick) return;
    const wasOn = selected.includes(c.id);
    sfx.tap();
    if (speakOnPick && !wasOn) {
      const say = (c.speak ?? c.text ?? '').trim();
      if (say) speak(say, { lang });
    }
    onPick(c.id);
  };

  return (
    <div
      className={`ae-opts ae-opts--${mode}${visual ? ' ae-opts--visual' : ''}${multi ? ' ae-opts--multi' : ''}${reveal ? ' is-revealing' : ''}${className ? ' ' + className : ''}`}
      style={{ ['--ae-cols' as string]: cols }}
      role={interactive ? (multi ? 'group' : 'radiogroup') : 'list'}
      aria-label={ariaLabel}
    >
      {shown.map((c, i) => {
        const on = selected.includes(c.id);
        const part = reveal && parts ? parts[c.id] : undefined;
        const state = part === true ? (on ? 'is-correct' : 'is-missed') : part === false ? 'is-wrong' : reveal && parts ? 'is-dim' : '';
        const label = c.text?.trim() || c.speak?.trim() || `Lựa chọn ${badgeLetter(i)}`;
        const cls = `ae-opt${on ? ' is-selected' : ''}${state ? ' ' + state : ''}${c.image ? ' ae-opt--media' : ''}${c.text ? '' : ' ae-opt--notext'}${locked ? ' is-locked' : ''}`;
        const style = { ['--opt-color' as string]: badgeColor(i) };
        const inner = (
          <>
            <span className="ae-opt__badge" aria-hidden="true">{badgeLetter(i)}</span>
            {c.image ? (
              <span className="ae-opt__media">
                <Media src={c.image} alt={c.text ? '' : label} className="ae-opt__img" />
              </span>
            ) : null}
            {c.text ? <span className="ae-opt__text">{c.text}</span> : null}
            {interactive ? (
              <span className="ae-opt__mark" aria-hidden="true">
                {state === 'is-wrong' ? <Icon name="retry" size={20} /> : <Icon name="check" size={20} />}
              </span>
            ) : null}
          </>
        );
        return interactive ? (
          <button
            key={c.id}
            type="button"
            className={cls}
            style={style}
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            aria-disabled={locked || undefined}
            aria-label={c.text ? undefined : label}
            onClick={() => pick(c)}
          >
            {inner}
          </button>
        ) : (
          <div key={c.id} className={cls} style={style} role="listitem" aria-label={c.text ? undefined : label}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
