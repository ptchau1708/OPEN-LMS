import { createDecipheriv, createECDH, createHmac, createPublicKey, verify as nodeVerify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64url, classifyStatus, encryptPayload, fromB64url, generateVapidKeys, pushMessage, pushTopic, sendPush, vapidAuthorization, type ClaimedNotification } from '../webpush';

/** Giải mã aes128gcm phía máy nhận — viết độc lập bằng node:crypto để đối chiếu. */
function decrypt(body: Buffer, uaPrivate: Buffer, uaPublic: Buffer, authSecret: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(asPublic);
  const h = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest();
  const prkKey = h(authSecret, shared);
  const ikm = h(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = h(salt, ikm);
  const cek = h(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = h(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  expect(plain[plain.length - 1]).toBe(2);
  return plain.subarray(0, plain.length - 1).toString('utf8');
}

describe('web push (RFC 8291 / 8292)', () => {
  it('khớp vector mẫu của RFC 8291 §5', async () => {
    const body = await encryptPayload(
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      {
        salt: fromB64url('DGv6ra1nlYgDCS1FRnbzlw'),
        serverKey: {
          publicRaw: fromB64url('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
          d: fromB64url('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
        },
      },
    );
    expect(b64url(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('máy nhận giải mã được (khoá tạm ngẫu nhiên)', async () => {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const auth = Buffer.from('0123456789abcdef');
    const target = { p256dh: b64url(ua.getPublicKey()), auth: b64url(auth) };
    const msg = JSON.stringify({ title: 'Cô Thu: Họp phụ huynh', body: 'Thứ Bảy 8:00 — phòng 5A' });
    const body = await encryptPayload(target, new TextEncoder().encode(msg));
    expect(decrypt(Buffer.from(body), ua.getPrivateKey(), ua.getPublicKey(), auth)).toBe(msg);
    // Mỗi lần mã hoá khác nhau (salt + khoá tạm mới).
    expect(b64url(await encryptPayload(target, new TextEncoder().encode(msg)))).not.toBe(b64url(body));
  });

  it('JWT VAPID ký đúng, đúng aud/exp/sub', async () => {
    const keys = { ...(await generateVapidKeys()), subject: 'https://abc.supabase.co' };
    expect(fromB64url(keys.publicKey)).toHaveLength(65);
    const now = Date.UTC(2026, 10, 27, 10, 0, 0);
    const h = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/xyz', keys, now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
    expect(m).not.toBeNull();
    const [, head, claims, sig, k] = m!;
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(Buffer.from(fromB64url(head)).toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const c = JSON.parse(Buffer.from(fromB64url(claims)).toString());
    expect(c).toEqual({ aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'https://abc.supabase.co' });
    const jwk = JSON.parse(keys.privateKey);
    const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
    expect(nodeVerify('sha256', Buffer.from(`${head}.${claims}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(fromB64url(sig)))).toBe(true);
  });

  it('gửi: đủ header, phân loại kết quả', async () => {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const keys = { ...(await generateVapidKeys()), subject: 'mailto:gv@truong.edu.vn' };
    let seen: { url: string; headers: Record<string, string>; bytes: number } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string>, bytes: (init.body as ArrayBuffer).byteLength };
      return new Response(null, { status: 410 });
    }) as unknown as typeof fetch;
    const r = await sendPush({ endpoint: 'https://web.push.apple.com/abc', p256dh: b64url(ua.getPublicKey()), auth: b64url(Buffer.alloc(16, 7)) },
      { title: 'x' }, keys, { fetchImpl: fake, topic: await pushTopic('msg:123'), urgency: 'high' });
    expect(r).toEqual({ outcome: 'gone', status: 410 });
    expect(seen!.headers['Content-Encoding']).toBe('aes128gcm');
    expect(seen!.headers.TTL).toBe('86400');
    expect(seen!.headers.Urgency).toBe('high');
    expect(seen!.headers.Topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(seen!.headers.Authorization).toMatch(/^vapid t=/);
    expect(classifyStatus(201)).toBe('ok');
    expect(classifyStatus(404)).toBe('gone');
    expect(classifyStatus(429)).toBe('retry');
    expect(classifyStatus(503)).toBe('retry');
    expect(classifyStatus(400)).toBe('fail');
  });

  it('tin nhạy cảm không lộ nội dung; máy dùng chung có tên người nhận', () => {
    const n: ClaimedNotification = {
      id: 1, userId: 'u', kind: 'ph-nhac-nho', title: 'An: cô nhắc nhở Nói chuyện riêng', body: 'Trong giờ Toán', link: '/phu-huynh',
      sensitive: true, showSensitive: false, count: 1, tag: 'x', name: 'Mẹ An', badge: 3, subs: [],
    };
    expect(pushMessage(n, { shared: false })).toMatchObject({ title: 'OPEN-EDU: có thông tin mới', body: 'Mở ứng dụng để xem chi tiết.', badge: 3 });
    expect(pushMessage({ ...n, showSensitive: true }, { shared: true }).title).toBe('Mẹ An · An: cô nhắc nhở Nói chuyện riêng');
    expect(pushMessage({ ...n, link: 'https://lạ.vn' }, { shared: false }).link).toBe('/');
  });
});
