/**
 * Edge Function `pkg-sign` — URL tải lên có ký (PUT) tới Cloudflare R2 cho gói HTML5 (H5P đã giải nén, SCORM, HTML).
 *
 * Vào:  { packageId, files: (string | { path, size })[] }
 *         path tương đối trong gói, vd "index.html", "assets/app.js". size (byte, tùy chọn) → URL bắt buộc
 *         đúng Content-Length (trình duyệt tự gửi khi PUT một Blob/File) và được tính vào giới hạn dung lượng.
 * Ra:   { uploads: { path, url }[], baseUrl, expiresIn }
 *         Client PUT từng file tới url (nên đặt Content-Type đúng loại file), rồi lưu v2.packages
 *         với base_url = baseUrl.
 *
 * Chỉ GV/admin. Nếu packageId đã có trong v2.packages thì phải là chủ gói (hoặc admin).
 * Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, CONTENT_ORIGIN
 * Tùy chọn: PKG_MAX_FILES (2000), PKG_MAX_FILE_MB (100), PKG_MAX_TOTAL_MB (500), PKG_URL_TTL_SEC (900)
 */
import { HttpError, isObject, readJsonObject, requireString, serveJson } from '../_shared/http.ts';
import { adminClient, env, fromPgError, isStaff, requireCaller } from '../_shared/supabase.ts';
import { presignUrl } from '../_shared/sigv4.ts';

const ALLOWED_EXT = new Set([
  // trang & mã
  'html', 'htm', 'xhtml', 'js', 'mjs', 'css', 'json', 'map', 'wasm',
  // SCORM / H5P / dữ liệu
  'xml', 'xsd', 'dtd', 'txt', 'csv', 'vtt', 'srt',
  // ảnh
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp',
  // âm thanh & video
  'mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'mp4', 'm4v', 'webm', 'ogv',
  // phông chữ & tài liệu
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'pdf',
]);

function intEnv(name: string, fallback: number): number {
  const n = Number(Deno.env.get(name));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

interface FileReq {
  path: string;
  size: number | null;
}

function validatePath(raw: string): string {
  let p = raw.trim();
  while (p.startsWith('./')) p = p.slice(2);
  if (p.length === 0 || p.length > 300) throw new HttpError(400, `Đường dẫn tệp không hợp lệ: "${raw}".`, 'bad_path');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\?#]/.test(p) || p.startsWith('/')) {
    throw new HttpError(400, `Đường dẫn tệp không hợp lệ: "${raw}".`, 'bad_path');
  }
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new HttpError(400, `Đường dẫn tệp không hợp lệ: "${raw}".`, 'bad_path');
  }
  const name = segments[segments.length - 1];
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!ALLOWED_EXT.has(ext)) {
    throw new HttpError(400, `Loại tệp ".${ext || '?'}" không được phép trong gói (${p}).`, 'bad_ext');
  }
  return p;
}

function parseFiles(v: unknown, maxFiles: number): FileReq[] {
  if (!Array.isArray(v) || v.length === 0) throw new HttpError(400, 'Thiếu danh sách tệp ("files").', 'bad_request');
  if (v.length > maxFiles) throw new HttpError(400, `Mỗi gói tối đa ${maxFiles} tệp.`, 'too_many_files');
  const seen = new Set<string>();
  const out: FileReq[] = [];
  for (const f of v) {
    let path: string;
    let size: number | null = null;
    if (typeof f === 'string') {
      path = validatePath(f);
    } else if (isObject(f) && typeof f.path === 'string') {
      path = validatePath(f.path);
      if (f.size !== undefined && f.size !== null) {
        if (typeof f.size !== 'number' || !Number.isInteger(f.size) || f.size < 0) {
          throw new HttpError(400, `Kích thước tệp không hợp lệ (${path}).`, 'bad_size');
        }
        size = f.size;
      }
    } else {
      throw new HttpError(400, 'Mỗi tệp là một chuỗi đường dẫn hoặc { path, size }.', 'bad_request');
    }
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, size });
  }
  return out;
}

serveJson(async (req) => {
  const caller = await requireCaller(req);
  if (!isStaff(caller)) throw new HttpError(403, 'Chỉ thầy/cô mới tải gói nội dung lên được.', 'forbidden');

  const body = await readJsonObject(req, 1_000_000);
  const packageId = requireString(body.packageId, 'packageId', 64);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(packageId)) {
    throw new HttpError(400, 'Mã gói chỉ gồm chữ, số, "-" và "_" (tối đa 64 ký tự).', 'bad_request');
  }

  const maxFiles = intEnv('PKG_MAX_FILES', 2000);
  const maxFileBytes = intEnv('PKG_MAX_FILE_MB', 100) * 1024 * 1024;
  const maxTotalBytes = intEnv('PKG_MAX_TOTAL_MB', 500) * 1024 * 1024;
  const ttl = Math.min(intEnv('PKG_URL_TTL_SEC', 900), 3600);
  const files = parseFiles(body.files, maxFiles);

  let total = 0;
  for (const f of files) {
    if (f.size === null) continue;
    if (f.size > maxFileBytes) {
      throw new HttpError(400, `Tệp ${f.path} lớn hơn ${Math.round(maxFileBytes / 1048576)} MB.`, 'file_too_large');
    }
    total += f.size;
  }
  if (total > maxTotalBytes) {
    throw new HttpError(400, `Gói lớn hơn ${Math.round(maxTotalBytes / 1048576)} MB.`, 'package_too_large');
  }

  // Gói đã tồn tại → chỉ chủ gói (hoặc admin) được ghi đè tệp.
  const { data: pkg, error } = await adminClient().from('packages').select('id, owner_id').eq('id', packageId).maybeSingle();
  if (error) throw fromPgError(error);
  const existing = pkg as { id: string; owner_id: string | null } | null;
  if (existing && existing.owner_id !== caller.id && caller.role !== 'admin') {
    throw new HttpError(403, 'Gói này thuộc thầy/cô khác.', 'forbidden');
  }

  const accountId = env('R2_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET');
  const origin = env('CONTENT_ORIGIN').replace(/\/+$/, '');
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();

  const uploads = await Promise.all(
    files.map(async (f) => ({
      path: f.path,
      url: await presignUrl({
        method: 'PUT',
        host,
        path: `/${bucket}/pkg/${packageId}/${f.path}`,
        region: 'auto',
        service: 's3',
        accessKeyId,
        secretAccessKey,
        expiresSec: ttl,
        date: now,
        headers: f.size !== null ? { 'content-length': String(f.size) } : undefined,
      }),
    })),
  );

  return {
    uploads,
    baseUrl: `${origin}/pkg/${packageId}/`,
    expiresIn: ttl,
  };
});
