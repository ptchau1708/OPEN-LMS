/**
 * AWS Signature V4 — tạo URL ký sẵn (query-string auth) cho API S3, dùng WebCrypto (không cần AWS SDK).
 * Dùng cho Cloudflare R2: host = <accountId>.r2.cloudflarestorage.com, region = 'auto', service = 's3'.
 * Payload không ký (UNSIGNED-PAYLOAD) — chuẩn cho URL ký sẵn của S3.
 */

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(data)));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, encoder.encode(data));
}

/** Mã hóa URI theo RFC 3986 như S3 yêu cầu (chỉ giữ A-Z a-z 0-9 - _ . ~). */
export function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Mã hóa từng đoạn của đường dẫn, giữ dấu '/'. */
export function encodePath(p: string): string {
  return p.split('/').map(encodeRfc3986).join('/');
}

function amzDate(d: Date): { amz: string; day: string } {
  const iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20130524T000000Z
  return { amz: iso, day: iso.slice(0, 8) };
}

export interface PresignOptions {
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE';
  host: string;
  /** Đường dẫn CHƯA mã hóa, bắt đầu bằng '/', vd '/bucket/pkg/abc/index.html'. */
  path: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSec: number;
  date?: Date;
  /** Header phải gửi đúng giá trị khi dùng URL (vd content-length để giới hạn kích thước). Tên viết thường. */
  headers?: Record<string, string>;
}

export async function presignUrl(o: PresignOptions): Promise<string> {
  if (o.expiresSec < 1 || o.expiresSec > 604800) throw new Error('expiresSec phải từ 1 đến 604800');
  const { amz, day } = amzDate(o.date ?? new Date());
  const scope = `${day}/${o.region}/${o.service}/aws4_request`;

  const headers: Record<string, string> = { host: o.host };
  for (const [k, v] of Object.entries(o.headers ?? {})) headers[k.toLowerCase()] = String(v).trim();
  const headerNames = Object.keys(headers).sort();
  const signedHeaders = headerNames.join(';');
  const canonicalHeaders = headerNames.map((h) => `${h}:${headers[h]}\n`).join('');

  const query: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${o.accessKeyId}/${scope}`],
    ['X-Amz-Date', amz],
    ['X-Amz-Expires', String(Math.floor(o.expiresSec))],
    ['X-Amz-SignedHeaders', signedHeaders],
  ];
  const canonicalQuery = query
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalUri = encodePath(o.path);
  const canonicalRequest = [
    o.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, await sha256Hex(canonicalRequest)].join('\n');

  const kDate = await hmac(encoder.encode('AWS4' + o.secretAccessKey), day);
  const kRegion = await hmac(kDate, o.region);
  const kService = await hmac(kRegion, o.service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `https://${o.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
