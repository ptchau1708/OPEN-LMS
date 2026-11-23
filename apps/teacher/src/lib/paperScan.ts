/**
 * Quét thẻ giấy (chế độ giấy): đọc nhiều mã QR trong một khung hình bằng zxing-wasm (tải lười, ~1 MB, chỉ khi mở camera),
 * hướng mã QR → chữ A/B/C/D đang ở phía trên (paperLetterFromCorners).
 */
import { paperLetterFromCorners, parsePaperCode, type PaperLetter } from '@openedu/data';

export interface PaperHit {
  card: number;
  letter: PaperLetter;
  /** Tâm mã trong khung hình (0..1) để vẽ nhãn. */
  x: number;
  y: number;
}

type Reader = (img: ImageData) => Promise<PaperHit[]>;
let readerPromise: Promise<Reader> | null = null;

export function loadPaperReader(): Promise<Reader> {
  if (!readerPromise) {
    readerPromise = (async () => {
      const [{ prepareZXingModule, readBarcodes }, wasm] = await Promise.all([
        import('zxing-wasm/reader'),
        import('zxing-wasm/reader/zxing_reader.wasm?url'),
      ]);
      const wasmUrl = (wasm as { default: string }).default;
      prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
      return async (img: ImageData) => {
        const res = await readBarcodes(img, { formats: ['QRCode'], maxNumberOfSymbols: 60, tryHarder: true, tryRotate: true });
        const out: PaperHit[] = [];
        for (const r of res) {
          const card = parsePaperCode(r.text);
          if (!card || !r.position) continue;
          const p = r.position;
          out.push({
            card,
            letter: paperLetterFromCorners(p.topLeft, p.topRight),
            x: (p.topLeft.x + p.topRight.x + p.bottomLeft.x + p.bottomRight.x) / 4 / img.width,
            y: (p.topLeft.y + p.topRight.y + p.bottomLeft.y + p.bottomRight.y) / 4 / img.height,
          });
        }
        return out;
      };
    })();
    readerPromise.catch(() => {
      readerPromise = null;
    });
  }
  return readerPromise;
}
