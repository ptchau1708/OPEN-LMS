/** Chuông thông báo (GV): số chưa đọc, danh sách thả xuống, bấm để mở đúng trang. */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AppNotification, NotifyList } from '@openedu/contracts';
import { useMarkNotificationsRead } from '@openedu/data';
import { Icon } from '@openedu/ui';
import { cx, relTime } from '../lib/format';

export function NotifyBell({ data, id, testId = 'notify-bell' }: { data?: NotifyList; id: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const read = useMarkNotificationsRead();
  const unread = data?.unread ?? 0;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  const go = (n: AppNotification) => {
    if (!n.readAt) read.mutate([n.id]);
    setOpen(false);
    if (n.link) nav(n.link);
  };
  return (
    <div className="tc-bell" ref={box}>
      <button type="button" className="tc-btn tc-btn--ghost tc-btn--icon tc-bell__btn" aria-expanded={open} aria-controls={`${id}-panel`}
        aria-label={unread ? `Thông báo: ${unread} chưa đọc` : 'Thông báo'} onClick={() => setOpen((v) => !v)} data-testid={testId}>
        <Icon name="bell" size={22} />
        {unread ? <span className="tc-bell__n" aria-hidden="true">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="tc-bell__panel" id={`${id}-panel`} role="dialog" aria-label="Thông báo" data-testid="notify-panel">
          <header className="tc-row">
            <strong>Thông báo</strong>
            <span className="tc-spacer" />
            {unread ? <button type="button" className="tc-linkbtn" onClick={() => read.mutate(undefined)}>Đã đọc tất cả</button> : null}
          </header>
          {!data ? <p className="tc-muted tc-small">Đang tải…</p> : data.items.length === 0 ? <p className="tc-muted tc-small">Chưa có thông báo.</p> : (
            <ul className="tc-bell__list">
              {data.items.slice(0, 30).map((n) => (
                <li key={n.id}>
                  <button type="button" className={cx('tc-bell__item', !n.readAt && 'is-unread')} onClick={() => go(n)}>
                    <span className="tc-bell__title">{n.title}</span>
                    {n.body ? <span className="tc-bell__body">{n.body}</span> : null}
                    <span className="tc-bell__at">{relTime(n.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <footer><Link to="/thong-bao" onClick={() => setOpen(false)}>Cài đặt thông báo · nhận trên điện thoại</Link></footer>
        </div>
      ) : null}
    </div>
  );
}
