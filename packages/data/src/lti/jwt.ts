/**
 * JWT RS256 bằng WebCrypto (chạy được cả trình duyệt, Node ≥ 20 và Deno — Edge Function `lti`). Thuần, có kiểm thử.
 */

export type Json = Record<string, unknown>;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === 'string' ? enc.encode(bytes) : bytes;
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;

/** Khóa công khai RSA dạng JWK chỉ gồm phần cần công bố. */
export function publicPart(jwk: JsonWebKey, kid: string): JsonWebKey & { kid: string; alg: string; use: string } {
  return { kty: 'RSA', n: jwk.n, e: jwk.e, kid, alg: 'RS256', use: 'sig' };
}

/** Mã khóa (kid) = dấu vân tay RFC 7638 của khóa công khai. */
export async function thumbprint(jwk: JsonWebKey): Promise<string> {
  const canon = JSON.stringify({ e: jwk.e, kty: 'RSA', n: jwk.n });
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(canon))));
}

export async function generateKeyPair(): Promise<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey; kid: string }> {
  const pair = (await crypto.subtle.generateKey({ ...RS256, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const kid = await thumbprint(privateJwk);
  return { privateJwk, publicJwk: publicPart(privateJwk, kid), kid };
}

export async function signJwt(payload: Json, privateJwk: JsonWebKey, kid: string): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', { ...privateJwk, alg: 'RS256', key_ops: ['sign'] }, RS256, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const body = b64url(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign(RS256, key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

export interface DecodedJwt { header: Json; payload: Json; signed: string; signature: Uint8Array }

export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT không hợp lệ.');
  const header = JSON.parse(dec.decode(unb64url(parts[0]))) as Json;
  const payload = JSON.parse(dec.decode(unb64url(parts[1]))) as Json;
  if (typeof header !== 'object' || !header || typeof payload !== 'object' || !payload) throw new Error('JWT không hợp lệ.');
  return { header, payload, signed: `${parts[0]}.${parts[1]}`, signature: unb64url(parts[2]) };
}

export async function verifyJwt(token: string, jwk: JsonWebKey): Promise<Json> {
  const d = decodeJwt(token);
  if (d.header.alg !== 'RS256') throw new Error('Chỉ nhận chữ kí RS256.');
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, RS256, false, ['verify']);
  const ok = await crypto.subtle.verify(RS256, key, d.signature as BufferSource, enc.encode(d.signed));
  if (!ok) throw new Error('Chữ kí không đúng.');
  return d.payload;
}

/** Khóa công khai PEM (SPKI, "-----BEGIN PUBLIC KEY-----") → JWK. */
export async function pemToJwk(pem: string): Promise<JsonWebKey> {
  const m = /-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/.exec(pem);
  if (!m) throw new Error('Khóa công khai phải ở dạng PEM "BEGIN PUBLIC KEY".');
  const der = Uint8Array.from(atob(m[1].replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('spki', der, RS256, true, ['verify']);
  return crypto.subtle.exportKey('jwk', key);
}

export function randomId(bytes = 16): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64url(b);
}
