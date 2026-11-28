import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Icon, Mascot, type IconName } from '@openedu/ui';
import { navFor, tint } from '../lib/nav';
import type { MascotId } from '@openedu/contracts';
import { cx } from '../lib/format';

export function Btn({ kind = 'default', icon, children, className, size, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'default' | 'primary' | 'ghost' | 'danger'; icon?: IconName; size?: 'sm' | 'lg' }) {
  return (
    <button type="button" className={cx('tc-btn', `tc-btn--${kind}`, size && `tc-btn--${size}`, !children && 'tc-btn--icon', className)} {...rest}>
      {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 18} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function Dialog({ open, onClose, title, children, footer, wide, full }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; full?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button.tc-btn--primary')?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return (
    <div className="tc-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={cx('tc-dialog', wide && 'tc-dialog--wide', full && 'tc-dialog--full')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="tc-dialog__head">
          <h2>{title}</h2>
          <Btn kind="ghost" icon="close" aria-label="Đóng" onClick={onClose} />
        </header>
        <div className="tc-dialog__body">{children}</div>
        {footer ? <footer className="tc-dialog__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Xác nhận ngay trên trang (không dùng window.confirm). */
export function ConfirmBar({ text, confirmLabel = 'Xóa', onConfirm, onCancel, busy }: { text: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return (
    <div className="tc-confirm" role="alertdialog" aria-label={text}>
      <span>{text}</span>
      <span className="tc-row">
        <Btn size="sm" onClick={onCancel}>Hủy</Btn>
        <Btn size="sm" kind="danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</Btn>
      </span>
    </div>
  );
}

export function Empty({ icon = 'book', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="tc-empty">
      <Icon name={icon} size={32} />
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return <div className="tc-loading" role="status"><span className="tc-spin" aria-hidden="true" />{label}</div>;
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="tc-alert tc-alert--error" role="alert">
      <span>{msg}</span>
      {onRetry ? <Btn size="sm" onClick={onRetry}>Thử lại</Btn> : null}
    </div>
  );
}

export function Avatar({ mascot, color, size = 32, title }: { mascot: MascotId; color?: string; size?: number; title?: string }) {
  return (
    <span className="tc-avatar" style={{ width: size, height: size, background: color }} title={title}>
      <Mascot id={mascot} size={size * 0.92} title={title ?? ''} />
    </span>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label, size }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; size?: 'lg' }) {
  return (
    <div className={cx('tc-seg', size && 'tc-seg--lg')} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Field({ label, children, help }: { label: string; children: ReactNode; help?: ReactNode }) {
  return (
    <label className="tc-field">
      <span className="tc-field__label">{label}</span>
      {children}
      {help ? <span className="tc-field__help">{help}</span> : null}
    </label>
  );
}

/** Nhóm nút (Seg, chip…) có nhãn — không bọc <label> để nhãn không lẫn vào tên nút. */
export function GroupField({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="tc-field" role="group" aria-label={label}>
      <span className="tc-field__label">{label}</span>
      {children}
      {help ? <span className="tc-field__help">{help}</span> : null}
    </div>
  );
}

export function PageHead({ title, sub, actions, icon, color }: { title: string; sub?: ReactNode; actions?: ReactNode; icon?: IconName; color?: string }) {
  // Ô biểu tượng màu ở đầu trang: lấy theo mục thanh bên của trang đang xem (lib/nav.ts).
  const item = navFor(useLocation().pathname);
  const ic = icon ?? item?.icon;
  const c = color ?? item?.color;
  return (
    <header className="tc-pagehead">
      <div className="tc-pagehead__title">
        {ic && c ? <span className="tc-pagehead__ico" aria-hidden="true" style={{ ['--c' as string]: c, ['--c-soft' as string]: tint(c, 0.14) } as CSSProperties}><Icon name={ic} size={22} /></span> : null}
        <div>
          <h1>{title}</h1>
          {sub ? <p className="tc-muted">{sub}</p> : null}
        </div>
      </div>
      {actions ? <div className="tc-row tc-wrap">{actions}</div> : null}
    </header>
  );
}

export function SubjectDot({ colorVar }: { colorVar: string }) {
  return <i className="tc-dot" style={{ background: `var(${colorVar})` }} aria-hidden="true" />;
}
