/** Tôi › Bài đã tải về: danh sách, dung lượng, xóa, bộ nhớ máy, tự tải khi có Wi-Fi, hàng chờ gửi. */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { getOfflineController, requestPersist, storageInfo, type AnyOutboxOp, type DownloadEntry } from '@openedu/data';
import { Button, Icon, ProgressBar, sfx } from '@openedu/ui';
import { AppTabs, EmptyState, TopBack } from '../components/Common';
import { useUi } from '../lib/store';
import { subjectColor } from '../lib/util';
import { autoWifiEnabled, formatBytes, getDownloads, setAutoWifi } from '../offline/manager';
import { useOfflineState } from '../offline/state';
import '../styles/offline.css';

const KIND_LABEL: Record<AnyOutboxOp['kind'], string> = { answer: 'Câu trả lời', progress: 'Tiến độ bài', complete: 'Hoàn thành bài', event: 'Nhật ký học', work: 'Bài viết / ảnh', remediation: 'Bài ôn tập' };

export default function Downloads() {
  const nav = useNavigate();
  const toast = useUi((s) => s.toast);
  const st = useOfflineState();
  const [list, setList] = useState<DownloadEntry[] | null>(null);
  const [mem, setMem] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [auto, setAuto] = useState(autoWifiEnabled());
  const [ops, setOps] = useState<AnyOutboxOp[]>([]);

  const load = useCallback(async () => {
    const dm = await getDownloads();
    setList(await dm.list());
    setMem(await storageInfo());
    setOps((await getOfflineController()?.listOps()) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load, st.pending, st.failed]);

  const remove = async (id: string) => {
    sfx.tap();
    await (await getDownloads()).remove(id);
    toast('Đã xóa bài khỏi máy.', 'ok');
    void load();
  };
  const persist = async () => {
    const ok = await requestPersist();
    toast(ok ? 'Máy sẽ giữ bài đã tải, không tự xóa.' : 'Trình duyệt chưa cho giữ lâu. Bài vẫn lưu, nhưng có thể bị xóa khi máy đầy.', ok ? 'ok' : 'try', 4000);
    void load();
  };
  const total = (list ?? []).reduce((s, e) => s + e.bytes, 0);
  const failed = ops.filter((o) => o.status === 'failed');
  const ctrl = getOfflineController();

  return (
    <div className="ln-page ln-dlpage">
      <TopBack title="Bài đã tải về" to="/toi" />

      <section className="ln-dlpage__mem k-card" aria-label="Bộ nhớ">
        <div className="ln-dlpage__memrow">
          <span><strong>{formatBytes(total)}</strong> cho {list?.length ?? 0} bài</span>
          {mem.quota ? <span className="k-small k-muted">Máy đã dùng {formatBytes(mem.usage)} / {formatBytes(mem.quota)}</span> : null}
        </div>
        {mem.quota ? <ProgressBar value={Math.min(1, (mem.usage ?? 0) / mem.quota)} label="Bộ nhớ đã dùng" /> : null}
        <div className="ln-dlpage__opts">
          <label className="ln-dlpage__toggle">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); setAutoWifi(e.target.checked); sfx.tap(); }} />
            <span>Tự tải bài được giao khi có Wi-Fi</span>
          </label>
          {mem.persisted ? <span className="ln-dl__done"><Icon name="lock" size={18} /> Máy giữ bài lâu dài</span>
            : <Button size="md" variant="secondary" onClick={() => void persist()}>Giữ bài lâu trên máy</Button>}
        </div>
      </section>

      {(st.pending > 0 || failed.length > 0) && (
        <section className="ln-dlpage__queue k-card" aria-labelledby="ln-q-h">
          <h2 id="ln-q-h" className="ln-h2">Chờ gửi lên cho cô <span className="ln-offline__badge">{st.pending}</span></h2>
          <ul className="ln-dlpage__ops">
            {ops.slice(0, 8).map((o) => (
              <li key={o.id} className={o.status === 'failed' ? 'is-failed' : ''}>
                <span>{KIND_LABEL[o.kind]}</span>
                <span className="k-small k-muted">{new Date(o.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}{o.status === 'failed' ? ' · chưa gửi được' : ''}</span>
              </li>
            ))}
            {ops.length > 8 && <li className="k-muted">… và {ops.length - 8} việc nữa</li>}
          </ul>
          <div className="ln-row">
            <Button size="lg" disabled={!st.online || st.syncing || !st.pending} onClick={() => { sfx.tap(); void ctrl?.syncNow({ force: true }).then(load); }} icon={<Icon name="retry" size={22} />}>
              {st.syncing ? 'Đang gửi…' : st.online ? 'Đồng bộ ngay' : 'Chờ có mạng'}
            </Button>
            {failed.length > 0 && <Button size="lg" variant="secondary" onClick={() => void ctrl?.retryFailed().then(load)}>Thử gửi lại {failed.length} việc</Button>}
            {failed.length > 0 && <Button size="lg" variant="ghost" onClick={() => void ctrl?.discardFailed().then(load)}>Bỏ việc lỗi</Button>}
          </div>
        </section>
      )}

      {list === null ? (
        <div className="ln-skeleton-list"><i /><i /></div>
      ) : list.length === 0 ? (
        <EmptyState title="Chưa có bài nào trên máy" text="Mở Bản đồ phiêu lưu, chọn một bài rồi bấm “Tải về” để học cả khi mất mạng nhé." mascot="kiwi"
          action={<Button onClick={() => nav('/hoc')} icon={<Icon name="map" size={24} />}>Mở bản đồ</Button>} />
      ) : (
        <ul className="ln-dlpage__list">
          {list.map((e) => (
            <li key={e.lessonId} className="ln-dlitem k-card" style={{ ['--subj' as string]: subjectColor(e.subject as never) }}>
              <button type="button" className="ln-dlitem__main" onClick={() => nav(`/bai/${e.lessonId}`)}>
                <span className="ln-dlitem__tile" aria-hidden="true"><Icon name="book" size={28} /></span>
                <span className="ln-dlitem__body">
                  <span className="ln-dlitem__title">{e.title}</span>
                  <span className="k-small k-muted">{formatBytes(e.bytes)} · {e.itemIds.length} câu hỏi{e.failedMedia ? ` · ${e.failedMedia} ảnh chưa tải được` : ''}</span>
                  {e.needsNetwork.length > 0 && <span className="ln-dlitem__net">Cần mạng: {e.needsNetwork.join(', ')}</span>}
                </span>
              </button>
              <Button variant="ghost" size="lg" onClick={() => void remove(e.lessonId)} icon={<Icon name="trash" size={24} />} aria-label={`Xóa bài ${e.title} khỏi máy`} />
            </li>
          ))}
        </ul>
      )}
      <AppTabs active="me" />
    </div>
  );
}
