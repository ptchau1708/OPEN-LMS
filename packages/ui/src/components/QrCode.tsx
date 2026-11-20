import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

export interface QrCodeProps { value: string; size?: number; className?: string; title?: string }

const QUIET = 4; // vùng trắng 4 ô theo chuẩn

function build(value: string): { n: number; d: string } | null {
  try {
    const qr = qrcode(0, 'M');
    // Mã hóa UTF-8 để chữ tiếng Việt có dấu đọc đúng.
    const bytes = qrcode.stringToBytesFuncs['UTF-8'];
    const prev = qrcode.stringToBytes;
    if (bytes) qrcode.stringToBytes = bytes;
    try { qr.addData(value, 'Byte'); qr.make(); } finally { qrcode.stringToBytes = prev; }
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (!qr.isDark(y, x)) { x++; continue; }
        let run = 1;
        while (x + run < n && qr.isDark(y, x + run)) run++;
        d += `M${x + QUIET} ${y + QUIET}h${run}v1h${-run}z`;
        x += run;
      }
    }
    return { n, d };
  } catch {
    return null;
  }
}

/** Mã QR dạng một <path> SVG duy nhất (mức sửa lỗi M, có viền trắng). */
export function QrCode({ value, size = 120, className, title }: QrCodeProps) {
  const qr = useMemo(() => build(value), [value]);
  const label = title ?? 'Mã QR';
  if (!qr) {
    return (
      <div className={`k-qr k-qr--error${className ? ' ' + className : ''}`} style={{ width: size, height: size }} role="img" aria-label={label}>
        Mã quá dài
      </div>
    );
  }
  const vb = qr.n + QUIET * 2;
  return (
    <svg
      className={`k-qr${className ? ' ' + className : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <rect className="k-qr__bg" width={vb} height={vb} fill="#ffffff" />
      <path className="k-qr__mod" d={qr.d} fill="#22304a" />
    </svg>
  );
}
