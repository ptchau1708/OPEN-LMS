import { unzipSync, strFromU8 } from 'fflate';
import type { PackageKind } from '@openedu/contracts';

export interface DetectedPackage { kind: PackageKind; title: string; entry: string; fileCount: number; totalBytes: number; rootFolder: string; warnings: string[] }

const WANT = /(^|\/)(h5p\.json|imsmanifest\.xml|index\.html?)$/i;

export function detectPackage(buf: ArrayBuffer, fileName: string): DetectedPackage {
  let count = 0;
  let total = 0;
  const names: string[] = [];
  const files = unzipSync(new Uint8Array(buf), {
    filter: (f) => {
      if (f.name.endsWith('/')) return false;
      count++;
      total += f.originalSize;
      names.push(f.name);
      return WANT.test(f.name) && f.name.split('/').length <= 3;
    },
  });
  if (!count) throw new Error('Tệp nén trống hoặc không đọc được.');
  const tops = new Set(names.map((n) => (n.includes('/') ? n.split('/')[0] + '/' : '')));
  const root = tops.size === 1 && [...tops][0] ? [...tops][0] : '';
  const rel = (n: string) => (root && n.startsWith(root) ? n.slice(root.length) : n);
  const get = (name: string): string | undefined => {
    const k = Object.keys(files).filter((f) => rel(f).toLowerCase() === name).sort((a, b) => a.length - b.length)[0];
    return k ? strFromU8(files[k]) : undefined;
  };
  const warnings: string[] = [];
  const base = fileName.replace(/\.(zip|h5p)$/i, '');
  const h5p = get('h5p.json');
  if (h5p) {
    let title = base;
    try {
      title = (JSON.parse(h5p) as { title?: string }).title || base;
    } catch {
      warnings.push('h5p.json không đúng định dạng JSON.');
    }
    return { kind: 'h5p', title, entry: '', fileCount: count, totalBytes: total, rootFolder: root, warnings };
  }
  const manifest = get('imsmanifest.xml');
  if (manifest) {
    const doc = new DOMParser().parseFromString(manifest, 'application/xml');
    const ver = (doc.getElementsByTagName('schemaversion')[0]?.textContent ?? '').trim();
    const kind: PackageKind = /2004|CAM 1\.3|1\.3/i.test(ver) || /adlcp_v1p3/i.test(manifest) ? 'scorm2004' : 'scorm12';
    if (!ver) warnings.push('Không thấy schemaversion — đoán phiên bản theo namespace.');
    const org = doc.getElementsByTagName('organization')[0];
    const title = (org?.getElementsByTagName('title')[0]?.textContent ?? '').trim() || base;
    const res = Array.from(doc.getElementsByTagName('resource'));
    const sco = res.find((r) => /sco/i.test(r.getAttribute('adlcp:scormtype') ?? r.getAttribute('adlcp:scormType') ?? '')) ?? res.find((r) => r.getAttribute('href'));
    const entry = sco?.getAttribute('href') ?? 'index.html';
    return { kind, title, entry, fileCount: count, totalBytes: total, rootFolder: root, warnings };
  }
  const idx = get('index.html') ?? get('index.htm');
  if (idx) {
    const m = idx.match(/<title[^>]*>([^<]*)<\/title>/i);
    const entry = Object.keys(files).map(rel).find((f) => /^index\.html?$/i.test(f)) ?? 'index.html';
    return { kind: 'html', title: (m?.[1] ?? '').trim() || base, entry, fileCount: count, totalBytes: total, rootFolder: root, warnings };
  }
  throw new Error('Không nhận ra gói: cần có h5p.json (H5P), imsmanifest.xml (SCORM) hoặc index.html (HTML5) ở thư mục gốc.');
}

export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'goi';
}
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
