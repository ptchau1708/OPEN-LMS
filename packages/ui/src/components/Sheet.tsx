import { useEffect, useLayoutEffect, useRef, useState, useId } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export interface SheetProps { open: boolean; onClose: () => void; title?: string; children: ReactNode }

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bảng trượt từ đáy (điện thoại) / hộp thoại giữa màn hình (màn rộng).
 * Esc hoặc chạm nền mờ để đóng; tự đưa tiêu điểm vào nút đầu tiên.
 * Gắn vào .k-shell gần nhất (giữ được chữ to, font) thay vì body.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();

  useLayoutEffect(() => {
    setHost((anchor.current?.closest('.k-shell') as HTMLElement | null) ?? document.body);
  }, []);

  useEffect(() => {
    if (!open || !host) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current(); } };
    document.addEventListener('keydown', onKey);
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => {
      const p = panel.current;
      if (!p) return;
      const first = (p.querySelector(`.k-sheet__body button:not([disabled])`) as HTMLElement | null)
        ?? (p.querySelector(FOCUSABLE) as HTMLElement | null) ?? p;
      first.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      body.style.overflow = prevOverflow;
      if (before && document.contains(before)) before.focus();
    };
  }, [open, host]);

  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const els = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const sheet = (
    <div className="k-sheet">
      <div className="k-sheet__backdrop" onClick={() => close.current()} />
      <div
        ref={panel}
        className="k-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Bảng'}
        tabIndex={-1}
        onKeyDown={trap}
      >
        <div className="k-sheet__grab" aria-hidden="true" />
        <div className="k-sheet__head">
          {title ? <h2 className="k-sheet__title" id={titleId}>{title}</h2> : <span />}
          <button type="button" className="k-sheet__close" onClick={() => close.current()} aria-label="Đóng">
            <Icon name="close" size={26} strokeWidth={2.6} />
          </button>
        </div>
        <div className="k-sheet__body">{children}</div>
      </div>
    </div>
  );

  return (
    <>
      <span ref={anchor} hidden />
      {open && host ? createPortal(sheet, host) : null}
    </>
  );
}
