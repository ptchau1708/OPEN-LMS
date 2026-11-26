/** Chuông thông báo (HS / phụ huynh): số tin chưa đọc → trang Thông báo. */
import { useNavigate } from 'react-router';
import { useNotifications, usePushSync } from '@openedu/data';
import { Icon, sfx } from '@openedu/ui';

export function NotifyBell({ className }: { className?: string }) {
  const nav = useNavigate();
  const n = useNotifications(true, false).data?.unread ?? 0;
  return (
    <button type="button" className={`ln-bell${className ? ` ${className}` : ''}`} onClick={() => { sfx.tap(); nav('/thong-bao'); }}
      aria-label={n ? `Thông báo: ${n} tin mới` : 'Thông báo'} data-testid="ln-bell">
      <Icon name="bell" size={26} />
      {n ? <span className="ln-bell__n" aria-hidden="true">{n > 99 ? '99+' : n}</span> : null}
    </button>
  );
}

/** Đặt một lần trong app: nghe tin mới (Realtime + service worker), cập nhật số trên biểu tượng app. */
export function NotifyWatch() {
  useNotifications(true, true);
  usePushSync('hoc');
  return null;
}
