/**
 * Ảnh bài làm phía trình duyệt: nén về JPEG cạnh dài ≤ 1600 px. Ngoài trình duyệt (Node/kiểm thử) giữ nguyên dataURL.
 */
import type { WorkImage } from '@openedu/contracts';

export const WORK_IMAGE_MAX_SIDE = 1600;
export const WORK_IMAGE_QUALITY = 0.82;
/** Ảnh lớn hơn (sau nén) bị từ chối. */
export const WORK_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof Image !== 'undefined';
}

function blobToDataUrl(b: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Không đọc được ảnh.'));
      r.readAsDataURL(b);
    });
  }
  return b.arrayBuffer().then((buf) => {
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:${b.type || 'image/jpeg'};base64,${btoa(bin)}`;
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Ảnh không mở được. Em chụp lại hoặc chọn ảnh khác nhé.'));
    im.src = src;
  });
}

/** Nén một ảnh (Blob/File hoặc dataURL / URL) → JPEG dataURL ≤ 1600 px. */
export async function compressWorkImage(input: Blob | string): Promise<WorkImage & { blob?: Blob }> {
  const src = typeof input === 'string' ? input : await blobToDataUrl(input);
  if (!hasDom()) return { url: src, width: 0, height: 0 };
  const im = await loadImage(src);
  const scale = Math.min(1, WORK_IMAGE_MAX_SIDE / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
  const w = Math.max(1, Math.round(im.naturalWidth * scale));
  const h = Math.max(1, Math.round(im.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { url: src, width: im.naturalWidth, height: im.naturalHeight };
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(im, 0, 0, w, h);
  const url = canvas.toDataURL('image/jpeg', WORK_IMAGE_QUALITY);
  const blob = await new Promise<Blob | undefined>((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', WORK_IMAGE_QUALITY));
  if (blob && blob.size > WORK_IMAGE_MAX_BYTES) throw new Error('Ảnh quá lớn. Em chụp gần hơn hoặc chọn ảnh khác nhé.');
  return { url, width: w, height: h, ...(blob ? { blob } : {}) };
}

/** Ảnh → dataURL (để gửi AI từ trình duyệt khi ảnh là URL thường). */
export async function imageUrlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Không tải được ảnh bài làm.');
  return blobToDataUrl(await res.blob());
}
