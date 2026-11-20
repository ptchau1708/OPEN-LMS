import type { ReactNode, HTMLAttributes, CSSProperties, KeyboardEvent } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'color'> {
  /** Màu viền/điểm nhấn theo môn. */
  color?: string;
  interactive?: boolean;
  children?: ReactNode;
}

/** Thẻ bo tròn lớn. `interactive` + `onClick` → thẻ bấm được (có bàn phím, nổi lên khi rê, lún khi nhấn). */
export function Card({ color, interactive, children, className, style, onClick, onKeyDown, ...rest }: CardProps) {
  const clickable = !!interactive && !!onClick;
  const st: CSSProperties | undefined = color ? { ...style, ['--card-color' as string]: color } : style;
  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (!clickable || e.defaultPrevented || e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.currentTarget.click();
    }
  };
  return (
    <div
      className={`k-card${interactive ? ' k-card--interactive' : ''}${color ? ' k-card--accent' : ''}${className ? ' ' + className : ''}`}
      style={st}
      onClick={onClick}
      onKeyDown={keyDown}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
