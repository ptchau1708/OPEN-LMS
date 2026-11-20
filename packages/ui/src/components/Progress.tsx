import type { CSSProperties } from 'react';

export interface ProgressDotsProps { total: number; current: number; done?: boolean[]; color?: string; onSelect?: (index: number) => void }
export interface ProgressBarProps { value: number; color?: string; label?: string; className?: string }

/** Chấm tiến độ cho slide: đã xong = xanh lá, đang xem = to hơn. */
export function ProgressDots({ total, current, done, color, onSelect }: ProgressDotsProps) {
  const st = color ? ({ '--dots-color': color } as CSSProperties) : undefined;
  return (
    <div className={`k-dots${onSelect ? ' k-dots--nav' : ''}${total > 14 ? ' k-dots--many' : ''}`} style={st} role={onSelect ? 'group' : 'img'} aria-label={`Trang ${current + 1} trên ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const cls = `k-dots__dot${done?.[i] ? ' is-done' : ''}${i === current ? ' is-current' : ''}`;
        if (!onSelect) return <span key={i} className="k-dots__item"><i className={cls} /></span>;
        return (
          <button key={i} type="button" className="k-dots__item" onClick={() => onSelect(i)} aria-label={`Trang ${i + 1}${done?.[i] ? ' (đã xong)' : ''}`} aria-current={i === current ? 'step' : undefined}>
            <i className={cls} />
          </button>
        );
      })}
    </div>
  );
}

/** Thanh tiến độ bo tròn, value 0..1. */
export function ProgressBar({ value, color, label, className }: ProgressBarProps) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = Math.round(v * 100);
  return (
    <div className={`k-pbar${className ? ' ' + className : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <i className="k-pbar__fill" style={{ transform: `translateX(${pct - 100}%)`, background: color }} />
    </div>
  );
}
