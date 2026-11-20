/**
 * "Nhúng trang web" an toàn: chỉ nhận các trang học tập quen thuộc (danh sách cho phép), đổi link chia sẻ thành link nhúng.
 * Nguồn khác bị từ chối (GV có thể dùng nút "Mở trong tab mới"). Danh sách origin ở đây PHẢI trùng với frame-src
 * trong tools/make-headers.mjs (EMBED_FRAME_ORIGINS) — kiểm thử make-headers.test.mjs so khớp hai danh sách.
 */
import { youtubeId } from './util';

export type EmbedProvider = 'youtube' | 'google-slides' | 'google-docs' | 'google-sheets' | 'google-forms' | 'google-drive' | 'quizizz' | 'wordwall' | 'canva' | 'padlet' | 'geogebra' | 'scratch';

export const EMBED_PROVIDER_LABEL: Record<EmbedProvider, string> = {
  youtube: 'YouTube',
  'google-slides': 'Google Trang trình bày',
  'google-docs': 'Google Tài liệu',
  'google-sheets': 'Google Trang tính',
  'google-forms': 'Google Biểu mẫu',
  'google-drive': 'Google Drive',
  quizizz: 'Quizizz / Wayground',
  wordwall: 'Wordwall',
  canva: 'Canva',
  padlet: 'Padlet',
  geogebra: 'GeoGebra',
  scratch: 'Scratch',
};

/** Origin được phép làm khung nhúng (đồng bộ với CSP frame-src). */
export const EMBED_FRAME_ORIGINS = [
  'https://www.youtube-nocookie.com',
  'https://docs.google.com',
  'https://drive.google.com',
  'https://quizizz.com',
  'https://wayground.com',
  'https://wordwall.net',
  'https://www.canva.com',
  'https://padlet.com',
  'https://www.geogebra.org',
  'https://scratch.mit.edu',
] as const;

export type EmbedResult =
  | { ok: true; provider: EmbedProvider; src: string; openUrl: string }
  | { ok: false; reason: string; openUrl?: string };

/** Thầy cô hay dán cả mã <iframe …>: lấy src ra. */
function extractUrl(input: string): string {
  const s = input.trim();
  const m = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(s);
  return (m ? m[1] : s).replace(/&amp;/g, '&');
}

export function toEmbed(input: string): EmbedResult {
  const raw = extractUrl(input ?? '');
  if (!raw) return { ok: false, reason: 'Dán link trang cần nhúng.' };
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: 'Link chưa đúng dạng.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'Chỉ nhận link http(s).' };
  const open = u.toString();
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  const p = u.pathname;
  const ok = (provider: EmbedProvider, src: string): EmbedResult => ({ ok: true, provider, src, openUrl: open });

  const yt = youtubeId(open);
  if (yt) return ok('youtube', `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?rel=0&modestbranding=1&playsinline=1`);

  if (host === 'docs.google.com') {
    let m = /^\/presentation\/d\/(e\/[\w-]+|[\w-]{20,})/.exec(p);
    if (m) return ok('google-slides', `https://docs.google.com/presentation/d/${m[1]}/embed?start=false&loop=false&delayms=3000`);
    m = /^\/document\/d\/(e\/[\w-]+|[\w-]{20,})/.exec(p);
    if (m) return ok('google-docs', m[1].startsWith('e/') ? `https://docs.google.com/document/d/${m[1]}/pub?embedded=true` : `https://docs.google.com/document/d/${m[1]}/preview`);
    m = /^\/spreadsheets\/d\/(e\/[\w-]+|[\w-]{20,})/.exec(p);
    if (m) return ok('google-sheets', m[1].startsWith('e/') ? `https://docs.google.com/spreadsheets/d/${m[1]}/pubhtml?widget=true&headers=false` : `https://docs.google.com/spreadsheets/d/${m[1]}/preview`);
    m = /^\/forms\/d\/(e\/[\w-]+|[\w-]{20,})/.exec(p);
    if (m) {
      if (!m[1].startsWith('e/')) return { ok: false, reason: 'Đây là link sửa biểu mẫu. Trong Google Biểu mẫu, bấm Gửi → biểu tượng <> (Nhúng HTML) hoặc biểu tượng liên kết, rồi dán link đó.', openUrl: open };
      return ok('google-forms', `https://docs.google.com/forms/d/${m[1]}/viewform?embedded=true`);
    }
  }
  if (host === 'forms.gle') return { ok: false, reason: 'Link rút gọn forms.gle không nhúng được. Trong Google Biểu mẫu, bấm Gửi → <> (Nhúng HTML) và dán mã đó.', openUrl: open };
  if (host === 'drive.google.com') {
    const m = /^\/file\/d\/([\w-]{20,})/.exec(p) ?? (u.searchParams.get('id') ? [null, u.searchParams.get('id') as string] as const : null);
    if (m) return ok('google-drive', `https://drive.google.com/file/d/${m[1]}/preview`);
  }
  if (host === 'quizizz.com' || host === 'wayground.com') {
    const m = /\/(?:embed\/)?(?:admin\/)?quiz\/([0-9a-f]{24})/i.exec(p) ?? /\/(?:admin\/)?presentation\/([0-9a-f]{24})/i.exec(p);
    if (m) return ok('quizizz', `https://${host}/embed/${p.includes('presentation') ? 'presentation' : 'quiz'}/${m[1]}`);
  }
  if (host === 'wordwall.net') {
    let m = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?embed\/(.+)$/i.exec(p);
    if (m) return ok('wordwall', `https://wordwall.net/embed/${m[1]}${u.search}`);
    m = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:resource|play)\/(\d+)/i.exec(p);
    if (m) return { ok: false, reason: 'Wordwall cần mã nhúng riêng: mở hoạt động → Chia sẻ → Nhúng (Embed), sao chép mã rồi dán vào đây.', openUrl: open };
  }
  if (host === 'canva.com') {
    const m = /^\/design\/([\w-]+)(?:\/([\w-]+))?\/(?:view|watch|edit)/.exec(p);
    if (m) return ok('canva', `https://www.canva.com/design/${m[1]}${m[2] ? `/${m[2]}` : ''}/view?embed`);
  }
  if (host === 'padlet.com') {
    const m = /^\/embed\/([\w-]+)/.exec(p);
    if (m) return ok('padlet', `https://padlet.com/embed/${m[1]}`);
    return { ok: false, reason: 'Padlet cần mã nhúng: mở bảng → Chia sẻ → Nhúng vào blog hoặc trang web, sao chép mã rồi dán vào đây.', openUrl: open };
  }
  if (host === 'geogebra.org') {
    const m = /^\/(?:m|classic|calculator|graphing|geometry|3d|material\/show\/id|material\/iframe\/id)\/([\w]+)/.exec(p);
    if (m && !/^(app|about)$/.test(m[1])) return ok('geogebra', `https://www.geogebra.org/material/iframe/id/${m[1]}/width/1024/height/640/border/888888/rc/false/ai/false/sdz/true/smb/false/stb/false/stbh/false/ld/false/sri/false`);
  }
  if (host === 'scratch.mit.edu') {
    const m = /^\/projects\/(\d+)/.exec(p);
    if (m) return ok('scratch', `https://scratch.mit.edu/projects/${m[1]}/embed`);
  }
  return { ok: false, reason: 'Trang này chưa nằm trong danh sách được nhúng (YouTube, Google Trang trình bày / Tài liệu / Biểu mẫu / Trang tính / Drive, Quizizz, Wordwall, Canva, Padlet, GeoGebra, Scratch). Học sinh vẫn mở được bằng nút “Mở trong tab mới”.', openUrl: open };
}
