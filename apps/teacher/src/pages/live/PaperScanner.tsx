import { useEffect, useRef, useState } from 'react';
import { loadPaperReader, type PaperHit } from '../../lib/paperScan';

/**
 * Camera sau của điện thoại GV: mỗi ~0,3 giây đọc mọi thẻ trong khung hình, báo (số thẻ, chữ đang ở trên).
 * Nhãn tên em hiện ngay trên thẻ vừa đọc được để GV biết đã quét.
 */
export function PaperScanner({ onHits, labels }: { onHits: (hits: PaperHit[]) => void; labels: Record<number, string> }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hits, setHits] = useState<PaperHit[]>([]);
  const cb = useRef(onHits);
  cb.current = onHits;

  useEffect(() => {
    let stop = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Trình duyệt này không mở được camera. Thầy/cô dùng Chrome trên điện thoại nhé.');
        const [s, read] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }),
          loadPaperReader(),
        ]);
        stream = s;
        if (stop) return;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => undefined);
        setReady(true);
        const tick = async () => {
          if (stop) return;
          if (v.videoWidth && ctx) {
            const scale = Math.min(1, 1280 / v.videoWidth);
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            try {
              const found = await read(ctx.getImageData(0, 0, canvas.width, canvas.height));
              setHits(found);
              if (found.length) cb.current(found);
            } catch {
              /* khung hình lỗi: bỏ qua */
            }
          }
          if (!stop) timer = window.setTimeout(() => void tick(), 300);
        };
        void tick();
      } catch (e) {
        const name = (e as { name?: string }).name;
        setErr(name === 'NotAllowedError' ? 'Thầy/cô chưa cho phép dùng camera. Bấm biểu tượng ổ khóa trên thanh địa chỉ → cho phép Camera.' : e instanceof Error ? e.message : 'Không mở được camera.');
      }
    })();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="tc-scan" data-testid="paper-scanner">
      {err ? <p className="tc-alert tc-alert--error" role="alert">{err}</p> : null}
      <div className="tc-scan__stage">
        <video ref={video} playsInline muted aria-label="Camera quét thẻ" />
        {hits.map((h) => (
          <span key={h.card} className="tc-scan__tag" style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}>{labels[h.card] ?? `Thẻ ${h.card}`}: <b>{h.letter}</b></span>
        ))}
        {!ready && !err ? <span className="tc-scan__wait">Đang mở camera…</span> : null}
      </div>
      <p className="tc-small tc-muted">Đứng ở cuối lớp, đưa điện thoại quét chậm một lượt cả lớp. Mỗi em được ghi khi tên hiện trên thẻ.</p>
    </div>
  );
}
