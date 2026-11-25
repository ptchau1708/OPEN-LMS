import { useEffect, useRef } from 'react';
import { QrCode } from '@openedu/ui';
import { Btn } from '../../components/common';

/** Thẻ "QR vào lớp" trên máy GV: mã to vừa phải + nút phóng to toàn màn hình (chiếu cho HS ngồi xa quét). */
export function JoinCard({ pin, joinUrl, onZoom, title = 'Học sinh quét mã để vào chơi' }: { pin: string; joinUrl: string; onZoom: () => void; title?: string }) {
  return (
    <section className="tc-card tc-joincard" data-testid="join-card">
      <button type="button" className="tc-joincard__qr" onClick={onZoom} title="Phóng to mã QR" aria-label="Phóng to mã QR">
        <QrCode value={joinUrl} size={240} title="Mã QR cho học sinh vào lớp" />
      </button>
      <div className="tc-stack">
        <strong>{title}</strong>
        <p className="tc-muted tc-small">hoặc mở Góc học tập → “Vào lớp” và nhập mã <b>{pin}</b></p>
        <code className="tc-small">{joinUrl}</code>
        <div><Btn kind="primary" icon="qr" onClick={onZoom} data-testid="join-zoom">Phóng to toàn màn hình</Btn></div>
        <p className="tc-small tc-muted">Mẹo: chiếu màn hình này lên TV / máy chiếu rồi bấm phóng to — HS ngồi cuối lớp vẫn quét được.</p>
      </div>
    </section>
  );
}

/** Mã QR + mã lớp phủ kín màn hình. Bấm bất kì đâu hoặc Esc để đóng. */
export function BigJoinQr({ pin, joinUrl, onClose }: { pin: string; joinUrl: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const entered = useRef(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    // Toàn màn hình thật nếu trình duyệt cho (máy chiếu): ẩn cả thanh địa chỉ.
    const el = ref.current;
    if (el?.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().then(() => { entered.current = true; }, () => undefined);
    }
    const off = () => { if (entered.current && !document.fullscreenElement) onClose(); };
    document.addEventListener('fullscreenchange', off);
    return () => {
      window.removeEventListener('keydown', on);
      document.removeEventListener('fullscreenchange', off);
      if (entered.current && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);
  const short = joinUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  return (
    <div ref={ref} className="tc-bigqr" role="dialog" aria-label="Mã QR vào lớp (phóng to)" onClick={onClose} data-testid="join-big">
      <QrCode value={joinUrl} size={900} className="tc-bigqr__qr" title="Quét mã để vào lớp" />
      <div className="tc-bigqr__side">
        <p className="tc-bigqr__l">Mã vào lớp</p>
        <p className="tc-bigqr__pin">{pin.slice(0, 3)} {pin.slice(3)}</p>
        <p className="tc-bigqr__u">{short}</p>
        <p className="tc-bigqr__hint">Bấm vào màn hình hoặc phím Esc để thu nhỏ</p>
      </div>
    </div>
  );
}
