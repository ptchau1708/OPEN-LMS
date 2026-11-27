/** Cài đặt thông báo (GV): nhận trên điện thoại / máy tính, loại thông báo, giờ yên lặng, gửi thử. */
import { useEffect, useState } from 'react';
import { NOTIFY_KINDS, type NotifyPrefs } from '@openedu/contracts';
import { isIos, useDataSource, useDisablePush, useEnablePush, useNotifyPrefs, useNotifyTest, usePushInfo, usePushState, useSaveNotifyPrefs } from '@openedu/data';
import { Btn, ErrorNote, Field, Loading, PageHead } from '../components/common';
import '../styles/parents.css';

const ENABLE_TEXT: Record<string, string> = {
  on: 'Đã bật. Máy này sẽ nhận thông báo kể cả khi đóng trang.',
  denied: 'Trình duyệt đang chặn thông báo của trang này. Mở cài đặt trang (biểu tượng ổ khoá cạnh địa chỉ) → Thông báo → Cho phép, rồi bấm lại.',
  unsupported: 'Trình duyệt này chưa hỗ trợ thông báo đẩy. Dùng Chrome, Edge, Firefox (máy tính, Android) hoặc Safari trên iPhone/iPad iOS 16.4+ (cài vào Màn hình chính).',
  'ios-home': 'Trên iPhone/iPad: mở trang bằng Safari → nút Chia sẻ → “Thêm vào MH chính”, rồi mở OPEN-EDU từ biểu tượng mới và bấm lại nút này.',
  'not-ready': 'Trường chưa bật thông báo đẩy (quản trị cần triển khai hàm push). Thông báo vẫn hiện ở chuông trong app.',
};

export default function NotifySettings() {
  const ds = useDataSource();
  const prefs = useNotifyPrefs();
  const save = useSaveNotifyPrefs();
  const info = usePushInfo();
  const state = usePushState();
  const enable = useEnablePush('gv');
  const disable = useDisablePush();
  const test = useNotifyTest();
  const [draft, setDraft] = useState<NotifyPrefs | null>(null);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => { if (prefs.data) setDraft(prefs.data); }, [prefs.data]);
  if (prefs.isLoading || !draft) return prefs.error ? <div className="tc-page"><ErrorNote error={prefs.error} /></div> : <Loading />;
  const mine = NOTIFY_KINDS.filter((k) => k.who === 'gv');
  const quiet = draft.quietFrom !== null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(prefs.data);
  return (
    <div className="tc-page tc-ntf">
      <PageHead title="Thông báo" sub="Nhận thông báo khi phụ huynh nhắn tin, học sinh nộp bài, phụ huynh xác nhận… ngay trên điện thoại hoặc máy tính." />
      <section className="tc-card" data-testid="push-card">
        <h2 className="tc-h2">Nhận trên máy này</h2>
        {ds.mode === 'demo' ? <p className="tc-alert tc-alert--info">Bản demo không gửi thông báo đẩy — thông báo chỉ hiện ở chuông.</p> : null}
        <p className="tc-small tc-muted">
          {state.data === 'on' ? 'Máy này đang nhận thông báo.' : 'Máy này chưa nhận thông báo.'} Tài khoản của thầy/cô đang nhận trên {draft.devices} máy.
          {isIos() ? ' iPhone/iPad: cần iOS 16.4 trở lên và mở OPEN-EDU từ biểu tượng trên Màn hình chính.' : ''}
        </p>
        <div className="tc-row tc-wrap">
          {state.data === 'on'
            ? <Btn onClick={() => disable.mutate(undefined, { onSuccess: () => setResult('Đã tắt trên máy này.') })} disabled={disable.isPending}>Tắt trên máy này</Btn>
            : <Btn kind="primary" icon="bell" disabled={enable.isPending || ds.mode === 'demo' || info.data?.ready === false}
                onClick={() => enable.mutate(undefined, { onSuccess: (r) => setResult(ENABLE_TEXT[r] ?? null) })} data-testid="push-enable">Bật thông báo trên máy này</Btn>}
          <Btn onClick={() => test.mutate(undefined, { onSuccess: () => setResult('Đã gửi thông báo thử — xem ở chuông (và trên máy nếu đã bật).') })} disabled={test.isPending} data-testid="notify-test">Gửi thử</Btn>
        </div>
        {info.data && !info.data.ready && ds.mode !== 'demo' ? <p className="tc-small tc-warn">{ENABLE_TEXT['not-ready']}</p> : null}
        {result ? <p className="tc-alert tc-alert--info" role="status">{result}</p> : null}
        <ErrorNote error={enable.error ?? disable.error ?? test.error} />
      </section>

      <section className="tc-card">
        <h2 className="tc-h2">Loại thông báo đẩy lên máy</h2>
        <p className="tc-small tc-muted">Bỏ chọn: loại đó chỉ hiện ở chuông trong app, không reo trên máy.</p>
        <ul className="tc-ntf__kinds">
          {mine.map((k) => (
            <li key={k.kind}>
              <label className="tc-check"><input type="checkbox" checked={!draft.pushOff.includes(k.kind)}
                onChange={(e) => setDraft({ ...draft, pushOff: e.target.checked ? draft.pushOff.filter((x) => x !== k.kind) : [...draft.pushOff, k.kind] })} /> {k.label}</label>
            </li>
          ))}
        </ul>
        <h3 className="tc-ph-sub">Giờ yên lặng</h3>
        <label className="tc-check"><input type="checkbox" checked={quiet} onChange={(e) => setDraft({ ...draft, quietFrom: e.target.checked ? '21:00' : null, quietTo: e.target.checked ? '06:30' : null })} /> Không reo trong khoảng giờ này (thông báo chờ đến sáng)</label>
        {quiet ? (
          <div className="tc-row tc-wrap tc-ph-hours">
            <Field label="Từ"><input type="time" className="tc-input tc-input--sm" value={draft.quietFrom ?? ''} onChange={(e) => setDraft({ ...draft, quietFrom: e.target.value })} /></Field>
            <Field label="đến"><input type="time" className="tc-input tc-input--sm" value={draft.quietTo ?? ''} onChange={(e) => setDraft({ ...draft, quietTo: e.target.value })} /></Field>
          </div>
        ) : null}
        <label className="tc-check"><input type="checkbox" checked={draft.showSensitive} onChange={(e) => setDraft({ ...draft, showSensitive: e.target.checked })} /> Hiện nội dung tin nhạy cảm trên màn hình khoá</label>
        <ErrorNote error={save.error} />
        <div className="tc-row">
          <Btn kind="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate({ pushOff: draft.pushOff, quietFrom: draft.quietFrom, quietTo: draft.quietTo, showSensitive: draft.showSensitive })}>Lưu</Btn>
          {!dirty && save.isSuccess ? <span className="tc-chip tc-chip--ok" role="status">Đã lưu.</span> : null}
        </div>
      </section>
    </div>
  );
}
