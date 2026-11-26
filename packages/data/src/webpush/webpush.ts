/**
 * Web Push THUẦN (chỉ dùng WebCrypto + fetch) — chạy được trong trình duyệt, Node 20+ và Deno (Edge Function `push`).
 *  - VAPID (RFC 8292): JWT ES256 ký bằng khoá riêng của máy chủ → header `Authorization: vapid t=…, k=…`.
 *  - Mã hoá nội dung aes128gcm (RFC 8188 + RFC 8291): ECDH với khoá p256dh của máy nhận + bí mật `auth`.
 * Không cần thư viện ngoài, không cần tài khoản Apple/Google: dịch vụ đẩy của trình duyệt (FCM, APNs, Mozilla…)
 * nhận yêu cầu chuẩn này. Bản chép cho Deno: supabase/functions/_shared/webpush/ (tools/sync-scoring.mjs).
 */

export interface PushTarget {
  endpoint: string;
  /** Khoá công khai P-256 của máy nhận (65 byte, base64url). */
  p256dh: string;
  /** Bí mật xác thực của máy nhận (16 byte, base64url). */
  auth: string;
}

export interface VapidKeys {
  /** Khoá công khai (65 byte, base64url) — cũng là applicationServerKey phía trình duyệt. */
  publicKey: string;
  /** Khoá riêng dạng JWK (JSON). */
  privateKey: string;
  /** mailto: hoặc https: để dịch vụ đẩy liên hệ khi cần. */
  subject: string;
}

export type PushOutcome = 'ok' | 'gone' | 'retry' | 'fail';

const enc = new TextEncoder();

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error('Môi trường này không có WebCrypto.');
  return c.subtle;
}

/** Sao chép sang ArrayBuffer riêng (WebCrypto không nhận view của buffer lớn hơn). */
function ab(u: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u.byteLength);
  new Uint8Array(out).set(u);
  return out;
}

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey('raw', ab(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, ab(data)));
}

/** JWK của khoá P-256 từ khoá công khai thô (65 byte) và (tuỳ chọn) phần riêng d. */
function p256Jwk(raw: Uint8Array, d?: Uint8Array): JsonWebKey {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('Khoá công khai P-256 phải dài 65 byte.');
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33, 65)), ext: true };
  if (d) jwk.d = b64url(d);
  return jwk;
}

/** Sinh cặp khoá VAPID mới. privateKey là JWK (JSON) để lưu trong CSDL. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  const jwk = await subtle().exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(raw), privateKey: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }) };
}

/** Header Authorization VAPID cho một endpoint (hết hạn sau 12 giờ). */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, nowMs = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: keys.subject })));
  const jwk = JSON.parse(keys.privateKey) as JsonWebKey;
  const key = await subtle().importKey('jwk', { ...jwk, key_ops: ['sign'], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, ab(enc.encode(`${header}.${claims}`))));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

export interface EncryptOptions {
  /** Chỉ dùng cho kiểm thử (vector RFC 8291). */
  salt?: Uint8Array;
  /** Chỉ dùng cho kiểm thử: khoá tạm của máy chủ {publicRaw, d}. */
  serverKey?: { publicRaw: Uint8Array; d: Uint8Array };
  /** Kích thước bản ghi (mặc định 4096). */
  recordSize?: number;
}

/** Mã hoá nội dung theo aes128gcm (một bản ghi). Trả về thân yêu cầu gửi tới endpoint. */
export async function encryptPayload(target: Pick<PushTarget, 'p256dh' | 'auth'>, plaintext: Uint8Array, opts: EncryptOptions = {}): Promise<Uint8Array> {
  const uaPublic = fromB64url(target.p256dh);
  const authSecret = fromB64url(target.auth);
  if (uaPublic.length !== 65) throw new Error('Khoá p256dh của máy nhận chưa đúng.');
  if (authSecret.length < 16) throw new Error('Bí mật auth của máy nhận chưa đúng.');
  const rs = opts.recordSize ?? 4096;
  if (plaintext.length + 1 + 16 > rs) throw new Error('Nội dung thông báo quá dài.');

  let asPrivate: CryptoKey;
  let asPublic: Uint8Array;
  if (opts.serverKey) {
    asPublic = opts.serverKey.publicRaw;
    asPrivate = await subtle().importKey('jwk', { ...p256Jwk(asPublic, opts.serverKey.d), key_ops: ['deriveBits'] }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const pair = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  }
  const uaKey = await subtle().importKey('raw', ab(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey } as EcdhKeyDeriveParams, asPrivate, 256));

  // RFC 8291 §3.4: IKM = HKDF(auth, ecdh, "WebPush: info" || 0 || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, ecdh);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);

  // RFC 8188 §2.2: CEK, NONCE từ HKDF(salt, IKM)
  const salt = opts.salt ?? (globalThis as { crypto: Crypto }).crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const key = await subtle().importKey('raw', ab(cek), { name: 'AES-GCM' }, false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([2])); // bản ghi cuối: dấu phân cách 0x02, không đệm thêm
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: ab(nonce), tagLength: 128 }, key, ab(padded)));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/** Topic (gộp thông báo cùng chủ đề ở dịch vụ đẩy): tối đa 32 kí tự base64url. */
export async function pushTopic(tag: string): Promise<string> {
  const h = new Uint8Array(await subtle().digest('SHA-256', ab(enc.encode(tag))));
  return b64url(h).slice(0, 32);
}

export function classifyStatus(status: number): PushOutcome {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'retry';
  return 'fail';
}

export interface SendOptions {
  ttlSeconds?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  topic?: string;
  fetchImpl?: typeof fetch;
}

/** Gửi một thông báo đã mã hoá tới một máy nhận. */
export async function sendPush(target: PushTarget, payload: unknown, keys: VapidKeys, opts: SendOptions = {}): Promise<{ outcome: PushOutcome; status: number }> {
  const body = await encryptPayload(target, enc.encode(typeof payload === 'string' ? payload : JSON.stringify(payload)));
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(target.endpoint, keys),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttlSeconds ?? 86_400),
    Urgency: opts.urgency ?? 'normal',
  };
  if (opts.topic) headers.Topic = opts.topic;
  const f = opts.fetchImpl ?? fetch;
  try {
    const r = await f(target.endpoint, { method: 'POST', headers, body: ab(body) });
    return { outcome: classifyStatus(r.status), status: r.status };
  } catch {
    return { outcome: 'retry', status: 0 };
  }
}
