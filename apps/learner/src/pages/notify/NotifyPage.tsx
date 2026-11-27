/**
 * Thông báo (HS / phụ huynh): danh sách tin, bật nhận trên điện thoại (hướng dẫn iPhone), loại tin, giờ yên lặng.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { NOTIFY_KINDS, type AppNotification, type NotifyPrefs } from '@openedu/contracts';
import {
  isIos, isStandalone, useDataSource, useDisablePush, useEnablePush, useMarkNotificationsRead, useNotifications, useNotifyPrefs, useNotifyTest,
  usePushInfo, usePushState, useSaveNotifyPrefs,
} from '@openedu/data';
import { Button, Icon } from '@openedu/ui';
import { ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { useMe } from '../../lib/util';
import '../../styles/notify.css';

const ENABLE_TEXT: Record<string, string> = {
  on: 'Đã bật! Máy này sẽ nhận thông báo kể cả khi không mở app.',
  denied: 'Máy đang chặn thông báo của OPEN-EDU. Vào Cài đặt của máy → Thông báo → OPEN-EDU → Cho phép, rồi bấm lại.',
  unsupported: 'Trình duyệt này chưa nhận được thông báo. Trên Android dùng Chrome; trên iPhone/iPad cài OPEN-EDU vào Màn hình chính (xem hướng dẫn bên dưới).',
  'ios-home': 'Trên iPhone/iPad, cần cài OPEN-EDU vào Màn hình chính trước (xem hướng dẫn bên dưới).',
  'not-ready': 'Trường chưa bật thông báo đẩy. Tin mới vẫn hiện ở đây khi mở app.',
};

function when(iso: string): string {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function NotifyPage() {
  const me = useMe();
  const nav = useNavigate();
  const q = useNotifications(true, false);
  const read = useMarkNotificationsRead();
  const back = me.role === 'parent' ? '/phu-huynh' : '/';
  if (q.isPending) return <LoadingScreen label="Đang mở thông báo" />;
  if (q.isError) return <ErrorState message="Chưa tải được thông báo." onRetry={() => void q.refetch()} />;
  const items = q.data.items;
  const open = (n: AppNotification) => {
    if (!n.readAt) read.mutate([n.id]);
    if (n.link && n.link !== '/thong-bao') nav(n.link);
  };
  return (
    <div className="ln-page ln-ntf">
      <TopBack title="Thông báo" to={back} right={q.data.unread ? <Button variant="secondary" onClick={() => read.mutate(undefined)}>Đã đọc hết</Button> : null} />
      {items.length === 0 ? <p className="ln-ntf__empty">Chưa có thông báo nào.</p> : (
        <ul className="ln-ntf__list" data-testid="ln-ntf-list">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" className={`ln-ntf__item${n.readAt ? '' : ' is-new'}`} onClick={() => open(n)}>
                <span className="ln-ntf__dot" aria-hidden="true" />
                <span className="ln-ntf__main">
                  <strong>{n.title}</strong>
                  {n.body ? <span className="ln-ntf__body">{n.body}</span> : null}
                  <span className="ln-ntf__at">{when(n.at)}</span>
                </span>
                {n.link ? <Icon name="next" size={20} /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <PushSettings role={me.role === 'parent' ? 'ph' : 'hs'} />
    </div>
  );
}

function PushSettings({ role }: { role: 'hs' | 'ph' }) {
  const ds = useDataSource();
  const prefs = useNotifyPrefs();
  const save = useSaveNotifyPrefs();
  const info = usePushInfo();
  const state = usePushState();
  const enable = useEnablePush('hoc');
  const disable = useDisablePush();
  const test = useNotifyTest();
  const [draft, setDraft] = useState<NotifyPrefs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (prefs.data) setDraft(prefs.data); }, [prefs.data]);
  const ios = isIos();
  const needHome = ios && !isStandalone();
  const kinds = NOTIFY_KINDS.filter((k) => k.who === role);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(prefs.data);
  const quiet = draft?.quietFrom != null;
  return (
    <section className="ln-ntf__card ln-ntf__set" aria-label="Nhận thông báo trên điện thoại" data-testid="ln-push">
      <h2 className="ln-ntf__h"><Icon name="bell" size={22} /> Nhận thông báo trên điện thoại</h2>
      {ds.mode === 'demo' ? <p className="ln-ntf__note">Bản demo không gửi thông báo lên điện thoại — tin chỉ hiện ở trang này.</p> : null}
      <p className="ln-ntf__note">
        {state.data === 'on' ? 'Máy này đang nhận thông báo.' : role === 'ph' ? 'Bật để biết ngay khi thầy/cô gửi thông báo, nhắn tin, hay khi con vắng học.' : 'Bật để biết ngay khi thầy/cô giao bài mới, chấm bài, hay đến lượt em đấu.'}
      </p>
      <div className="ln-row ln-row--wrap">
        {state.data === 'on'
          ? <Button variant="secondary" disabled={disable.isPending} onClick={() => disable.mutate(undefined, { onSuccess: () => setMsg('Đã tắt trên máy này.') })}>Tắt trên máy này</Button>
          : <Button icon={<Icon name="bell" size={22} />} disabled={enable.isPending || ds.mode === 'demo' || info.data?.ready === false}
              onClick={() => enable.mutate(undefined, { onSuccess: (r) => setMsg(ENABLE_TEXT[r] ?? null) })} data-testid="ln-push-enable">Bật thông báo</Button>}
        <Button variant="secondary" disabled={test.isPending} onClick={() => test.mutate(undefined, { onSuccess: () => setMsg('Đã gửi một thông báo thử.') })}>Gửi thử</Button>
      </div>
      {msg ? <p className="ln-ntf__msg" role="status">{msg}</p> : null}
      {enable.error ? <p className="ln-ntf__msg is-err" role="alert">{(enable.error as Error).message}</p> : null}

      {needHome || ios ? (
        <details className="ln-ntf__ios" open={needHome}>
          <summary>iPhone / iPad: cài OPEN-EDU vào Màn hình chính</summary>
          <ol>
            <li>Mở trang này bằng <b>Safari</b> (iOS 16.4 trở lên).</li>
            <li>Bấm nút <b>Chia sẻ</b> (hình vuông có mũi tên lên) ở cuối màn hình.</li>
            <li>Chọn <b>Thêm vào MH chính</b> → <b>Thêm</b>.</li>
            <li>Mở <b>OPEN-EDU</b> từ biểu tượng mới trên Màn hình chính, đăng nhập, vào trang Thông báo và bấm <b>Bật thông báo</b> → <b>Cho phép</b>.</li>
          </ol>
        </details>
      ) : (
        <details className="ln-ntf__ios">
          <summary>Android: cài OPEN-EDU như một ứng dụng</summary>
          <ol>
            <li>Mở trang bằng <b>Chrome</b>.</li>
            <li>Bấm menu <b>⋮</b> → <b>Thêm vào màn hình chính</b> (hoặc <b>Cài đặt ứng dụng</b>).</li>
            <li>Mở OPEN-EDU từ biểu tượng mới, bấm <b>Bật thông báo</b> → <b>Cho phép</b>.</li>
          </ol>
        </details>
      )}

      {draft ? (
        <details className="ln-ntf__kinds">
          <summary>Chọn loại thông báo, giờ yên lặng</summary>
          <ul>
            {kinds.map((k) => (
              <li key={k.kind}>
                <label><input type="checkbox" checked={!draft.pushOff.includes(k.kind)}
                  onChange={(e) => setDraft({ ...draft, pushOff: e.target.checked ? draft.pushOff.filter((x) => x !== k.kind) : [...draft.pushOff, k.kind] })} /> {k.label}</label>
              </li>
            ))}
          </ul>
          <label className="ln-ntf__q"><input type="checkbox" checked={quiet} onChange={(e) => setDraft({ ...draft, quietFrom: e.target.checked ? '21:00' : null, quietTo: e.target.checked ? '06:30' : null })} /> Giờ yên lặng (máy không reo)</label>
          {quiet ? (
            <div className="ln-row ln-row--wrap ln-ntf__hours">
              <label>Từ <input type="time" className="ln-input" value={draft.quietFrom ?? ''} onChange={(e) => setDraft({ ...draft, quietFrom: e.target.value })} /></label>
              <label>đến <input type="time" className="ln-input" value={draft.quietTo ?? ''} onChange={(e) => setDraft({ ...draft, quietTo: e.target.value })} /></label>
            </div>
          ) : null}
          {role === 'ph' ? <label className="ln-ntf__q"><input type="checkbox" checked={draft.showSensitive} onChange={(e) => setDraft({ ...draft, showSensitive: e.target.checked })} /> Hiện nội dung tin nhắc nhở / vắng học trên màn hình khoá</label> : null}
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate({ pushOff: draft.pushOff, quietFrom: draft.quietFrom, quietTo: draft.quietTo, showSensitive: draft.showSensitive }, { onSuccess: () => setMsg('Đã lưu.') })}>Lưu</Button>
          {save.error ? <p className="ln-ntf__msg is-err" role="alert">{(save.error as Error).message}</p> : null}
        </details>
      ) : null}
    </section>
  );
}
