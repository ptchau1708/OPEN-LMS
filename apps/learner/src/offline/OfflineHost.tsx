/**
 * Thanh nhỏ báo mất mạng + số bài chờ gửi + "Đồng bộ ngay"; tự đồng bộ; chúc mừng khi bài làm offline đã được chấm;
 * tự tải bài được giao khi có Wi-Fi (nếu bật). Tải lười từ App (docs/PHASE6_OFFLINE.md).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MascotId } from '@openedu/contracts';
import { getDataSource, getOfflineController, onWifi, type SyncReport } from '@openedu/data';

import { Button, Confetti, Icon, Mascot, sfx } from '@openedu/ui';
import { useUi } from '../lib/store';
import { autoWifiEnabled, getDownloads, registerBackgroundSync } from './manager';
import { useOfflineState } from './state';
import '../styles/offline.css';

export function CloudOff({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 18h10.5a3.5 3.5 0 0 0 .6-6.95A6 6 0 0 0 7.2 9.1 4.5 4.5 0 0 0 7 18z" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export default function OfflineHost() {
  const st = useOfflineState();
  const qc = useQueryClient();
  const queueUnlocks = useUi((s) => s.queueUnlocks);
  const toast = useUi((s) => s.toast);
  const [party, setParty] = useState<SyncReport | null>(null);
  const wasOffline = useRef(!st.online);

  // Tự đồng bộ + nghe kết quả.
  useEffect(() => {
    const c = getOfflineController();
    if (!c) return;
    const stop = c.startAutoSync();
    const off = c.onSynced((r) => {
      void qc.invalidateQueries();
      if (r.newlyUnlocked.length) queueUnlocks(r.newlyUnlocked as MascotId[]);
      if (r.stars > 0 || r.graded > 0) { setParty(r); sfx.fanfare(); }
      else toast('Đã gửi xong bài em học lúc mất mạng!', 'ok');
    });
    return () => { stop(); off(); };
  }, [qc, queueUnlocks, toast]);

  // Có mạng lại (demo thường không có hàng đợi): làm mới dữ liệu.
  useEffect(() => {
    if (st.online && wasOffline.current) void qc.invalidateQueries();
    wasOffline.current = !st.online;
  }, [st.online, qc]);

  useEffect(() => {
    if (st.pending > 0 && !st.online) void registerBackgroundSync();
  }, [st.pending, st.online]);

  // Wi-Fi + đã bật "tự tải": tải các bài được giao chưa có trên máy.
  useEffect(() => {
    if (!st.online || !autoWifiEnabled() || onWifi() !== true) return;
    let stop = false;
    void (async () => {
      try {
        const ds = getDataSource();
        const me = await ds.getCurrentUser();
        if (!me || me.role !== 'student') return;
        const dm = await getDownloads();
        for (const t of await ds.getTodayTasks(me.id)) {
          if (stop) return;
          if (t.kind === 'lesson' && !(await dm.has(t.targetId))) await dm.download(t.targetId).catch(() => undefined);
        }
      } catch { /* thử lại lần sau */ }
    })();
    return () => { stop = true; };
  }, [st.online]);

  const sync = () => {
    sfx.tap();
    const c = getOfflineController();
    if (!c) return;
    void c.syncNow({ force: true }).then((r) => {
      if (r.stoppedOffline) toast('Mạng còn yếu, mình thử lại sau nhé.', 'try');
    });
  };

  const show = !st.online || st.pending > 0 || st.syncing;
  const bar = useRef<HTMLDivElement>(null);
  // Trình phát bài giảng (position: fixed) né thanh này qua biến --ln-banner-h.
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    const set = () => root.setProperty('--ln-banner-h', `${bar.current?.offsetHeight ?? 0}px`);
    set();
    if (!bar.current || typeof ResizeObserver === 'undefined') return () => root.removeProperty('--ln-banner-h');
    const ro = new ResizeObserver(set);
    ro.observe(bar.current);
    return () => { ro.disconnect(); root.removeProperty('--ln-banner-h'); };
  }, [show]);
  return (
    <>
      {show && (
        <div ref={bar} className={`ln-offline${st.online ? ' is-online' : ''}`} role="status" aria-live="polite">
          <span className="ln-offline__icon">{st.online ? <Icon name="upload" size={20} /> : <CloudOff />}</span>
          <span className="ln-offline__text">
            {!st.online ? 'Đang học không cần mạng' : st.syncing ? 'Đang gửi bài lên cho cô…' : 'Có mạng rồi! Gửi bài em đã làm nhé'}
          </span>
          {st.pending > 0 && <span className="ln-offline__badge" aria-label={`${st.pending} việc chờ gửi`}>{st.pending} chờ gửi</span>}
          {st.online && st.pending > 0 && !st.syncing && (
            <Button size="md" className="ln-offline__sync" onClick={sync} icon={<Icon name="retry" size={20} />}>Đồng bộ ngay</Button>
          )}
        </div>
      )}
      {party && <SyncParty r={party} onClose={() => setParty(null)} />}
    </>
  );
}

function SyncParty({ r, onClose }: { r: SyncReport; onClose: () => void }) {
  useEffect(() => { const t = window.setTimeout(onClose, 9000); return () => window.clearTimeout(t); }, [onClose]);
  return (
    <div className="ln-syncparty" role="dialog" aria-label="Đã chấm bài em làm lúc mất mạng">
      <Confetti show durationMs={2600} count={50} />
      <div className="ln-syncparty__card k-card">
        <Mascot id="nghe" mood="cheer" size={110} animate title="" />
        <div className="ln-syncparty__body">
          <strong className="ln-syncparty__head">Cô đã chấm bài em làm lúc mất mạng!</strong>
          {r.graded > 0 && <span>Em làm đúng {r.correct}/{r.graded} câu.</span>}
          {r.stars > 0 && <span className="ln-syncparty__stars">+{r.stars} <Icon name="star" size={26} /> vào túi của em</span>}
        </div>
        <Button size="lg" onClick={onClose} icon={<Icon name="check" size={24} />}>Tuyệt quá!</Button>
      </div>
    </div>
  );
}
