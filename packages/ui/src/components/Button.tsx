import type { ReactNode, ButtonHTMLAttributes, CSSProperties } from 'react';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'subject' | 'danger';
  /** Màu nền khi variant='subject' (CSS color hoặc var(--k-math)). */
  color?: string;
  size?: 'md' | 'lg' | 'xl';
  icon?: ReactNode;
  block?: boolean;
  children?: ReactNode;
}

/** Nút nổi khối kiểu "sân chơi": viền dưới dày, nhấn thì lún xuống. */
export function Button({ variant = 'primary', color, size = 'md', icon, block, children, className, style, type, ...rest }: ButtonProps) {
  const iconOnly = !!icon && (children === undefined || children === null || children === false || children === '');
  const cls = `k-btn k-btn--${variant} k-btn--${size}${block ? ' k-btn--block' : ''}${iconOnly ? ' k-btn--icon' : ''}${className ? ' ' + className : ''}`;
  const st: CSSProperties | undefined = color ? { ...style, ['--btn-color' as string]: color } : style;
  return (
    <button type={type ?? 'button'} className={cls} style={st} {...rest}>
      {icon ? <span className="k-btn__icon" aria-hidden="true">{icon}</span> : null}
      {iconOnly ? null : <span className="k-btn__label">{children}</span>}
    </button>
  );
}
