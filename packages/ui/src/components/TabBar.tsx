import type { ReactNode, CSSProperties } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Màu khi đang chọn (mặc định var(--k-info)). */
  color?: string;
}
export interface TabBarProps {
  items: TabItem[];
  active: string;
  onSelect: (id: string) => void;
  /** Mặc định true: cố định ở đáy màn hình (kèm khoảng đệm để nội dung không bị che). */
  fixed?: boolean;
  className?: string;
}

/** Thanh điều hướng đáy cho trẻ: biểu tượng trên, chữ dưới. */
export function TabBar({ items, active, onSelect, fixed = true, className }: TabBarProps) {
  const nav = (
    <nav
      className={`k-tabbar${fixed ? ' k-tabbar--fixed' : ''}${className ? ' ' + className : ''}`}
      aria-label="Điều hướng chính"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
    >
      {items.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            className={`k-tabbar__tab${on ? ' is-active' : ''}`}
            style={t.color ? ({ '--tab-color': t.color } as CSSProperties) : undefined}
            aria-current={on ? 'page' : undefined}
            onClick={() => onSelect(t.id)}
          >
            <span className="k-tabbar__icon" aria-hidden="true">{t.icon}</span>
            <span className="k-tabbar__label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
  if (!fixed) return nav;
  return (
    <>
      <div className="k-tabbar-spacer" aria-hidden="true" />
      {nav}
    </>
  );
}
