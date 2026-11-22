import { describe, expect, it } from 'vitest';
import {
  AGS_CLAIM, LTI_CLAIM, MemoryLtiStore, ROLE, SCOPE, decodeJwt, generateKeyPair, handleLti, launchStartUrl, ltiPath, pemToJwk, randomId, signJwt, toolConfigJson, verifyJwt, type LtiDeps,
} from '../lti';

const ISS = 'https://abc.supabase.co/functions/v1/lti';
const TOOL = 'https://doc.truong.edu.vn';

async function setup(opts: { now?: number } = {}) {
  const toolKey = await generateKeyPair();
  const store = new MemoryLtiStore({
    tools: [
      { appId: 'luyen-doc', name: 'Luyện đọc', clientId: 'cid', deploymentId: 'd1', loginUrl: `${TOOL}/lti/login`, launchUrl: `${TOOL}/lti/launch`, redirectUris: [], publicJwk: toolKey.publicJwk, enabled: true },
      { appId: 'tat', name: 'Đã tắt', clientId: 'cid-off', deploymentId: 'd2', loginUrl: `${TOOL}/x`, launchUrl: `${TOOL}/y`, redirectUris: [], publicJwk: toolKey.publicJwk, enabled: false },
      { appId: 'khac', name: 'App khác', clientId: 'cid-2', deploymentId: 'd3', loginUrl: `${TOOL}/x`, launchUrl: `${TOOL}/z`, redirectUris: [], publicJwk: toolKey.publicJwk, enabled: true },
    ],
    users: [
      { id: 'hs1', name: 'Nguyễn Minh An', role: 'student', username: 'minhan', grade: 5 },
      { id: 'hs2', name: 'Lê Bình', role: 'student' },
      { id: 'gv1', name: 'Cô Thu', role: 'teacher' },
    ],
    contexts: [
      { id: '5a1', name: '5A1', grade: 5, learners: ['hs1'], teachers: ['gv1'] },
      { id: '5a2', name: '5A2', grade: 5, learners: ['hs2'], teachers: [] },
    ],
  });
  const deps: LtiDeps = { store, issuer: ISS, authenticate: async (r) => (r.headers.get('Authorization') ?? '').replace('Bearer tok-', '') || null, corsOrigin: () => 'https://hoc.truong.edu.vn', ...(opts.now ? { now: () => opts.now as number } : {}) };
  const call = (path: string, init: RequestInit = {}) => handleLti(new Request(`${ISS}${path}`, init), deps);
  const authorize = (uid: string, p: Record<string, string>) => call('/authorize', { method: 'POST', headers: { Authorization: `Bearer tok-${uid}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'openid', response_type: 'id_token', response_mode: 'form_post', prompt: 'none', client_id: 'cid', redirect_uri: `${TOOL}/lti/launch`, login_hint: uid, nonce: 'n-1', state: 's-1', ...p }) });
  const assertion = async (claims: Record<string, unknown> = {}, key = toolKey) => signJwt({ iss: 'cid', sub: 'cid', aud: `${ISS}/token`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, jti: randomId(), ...claims }, key.privateJwk, key.kid);
  const token = async (scope = Object.values(SCOPE).join(' '), claims: Record<string, unknown> = {}) => call('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await assertion(claims), scope }).toString() });
  return { store, deps, call, authorize, token, toolKey, assertion };
}

describe('JWT', () => {
  it('kí và kiểm RS256; sai khóa thì từ chối', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const t = await signJwt({ x: 1 }, a.privateJwk, a.kid);
    expect(await verifyJwt(t, a.publicJwk)).toEqual({ x: 1 });
    await expect(verifyJwt(t, b.publicJwk)).rejects.toThrow();
    expect(decodeJwt(t).header).toMatchObject({ alg: 'RS256', kid: a.kid });
  });
  it('đọc khóa PEM (BEGIN PUBLIC KEY)', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const der = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    const pem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')}\n-----END PUBLIC KEY-----`;
    const jwk = await pemToJwk(pem);
    expect(jwk.kty).toBe('RSA');
    const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
    expect(await verifyJwt(await signJwt({ ok: true }, priv, 'k'), jwk)).toEqual({ ok: true });
  });
});

describe('LTI: mở app (OIDC)', () => {
  it('địa chỉ bước 1 và đường dẫn', () => {
    const u = new URL(launchStartUrl({ loginUrl: `${TOOL}/lti/login`, launchUrl: `${TOOL}/lti/launch`, clientId: 'cid', deploymentId: 'd1' }, ISS, 'hs1', '5a1'));
    expect(Object.fromEntries(u.searchParams)).toEqual({ iss: ISS, login_hint: 'hs1', target_link_uri: `${TOOL}/lti/launch`, client_id: 'cid', lti_deployment_id: 'd1', lti_message_hint: '5a1' });
    expect(ltiPath('https://abc.supabase.co/lti/ags/5a1/lineitems')).toEqual(['ags', '5a1', 'lineitems']);
    expect(ltiPath('https://abc.supabase.co/functions/v1/lti/jwks')).toEqual(['jwks']);
    const cfg = toolConfigJson(ISS, 'https://hoc.truong.edu.vn/lti/auth', { clientId: 'cid', deploymentId: 'd1' });
    expect(cfg[ISS]).toEqual([expect.objectContaining({ client_id: 'cid', auth_token_url: `${ISS}/token`, key_set_url: `${ISS}/jwks`, deployment_ids: ['d1'] })]);
  });

  it('kí id_token đủ claim LTI 1.3 + AGS, kiểm được bằng JWKS', async () => {
    const { authorize, call } = await setup();
    const r = await authorize('hs1', { lti_message_hint: '5a1' });
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://hoc.truong.edu.vn');
    const out = await r.json() as { action: string; fields: { id_token: string; state: string } };
    expect(out.action).toBe(`${TOOL}/lti/launch`);
    expect(out.fields.state).toBe('s-1');
    const jwks = await (await call('/jwks')).json() as { keys: JsonWebKey[] };
    const c = await verifyJwt(out.fields.id_token, jwks.keys[0]);
    expect(c).toMatchObject({ iss: ISS, sub: 'hs1', aud: 'cid', nonce: 'n-1', name: 'Nguyễn Minh An', given_name: 'An', family_name: 'Nguyễn Minh' });
    expect(c[`${LTI_CLAIM}message_type`]).toBe('LtiResourceLinkRequest');
    expect(c[`${LTI_CLAIM}version`]).toBe('1.3.0');
    expect(c[`${LTI_CLAIM}deployment_id`]).toBe('d1');
    expect(c[`${LTI_CLAIM}roles`]).toEqual([ROLE.learner]);
    expect(c[`${LTI_CLAIM}resource_link`]).toEqual({ id: 'luyen-doc:5a1', title: 'Luyện đọc' });
    expect(c[`${LTI_CLAIM}context`]).toMatchObject({ id: '5a1', label: '5A1' });
    expect(c[AGS_CLAIM]).toMatchObject({ lineitems: `${ISS}/ags/5a1/lineitems`, lineitem: `${ISS}/ags/5a1/lineitems/li1` });
  });

  it('giáo viên mở → vai trò Instructor; không gợi ý lớp → lớp đầu tiên', async () => {
    const { authorize } = await setup();
    const out = await (await authorize('gv1', {})).json() as { fields: { id_token: string } };
    const c = decodeJwt(out.fields.id_token).payload;
    expect(c[`${LTI_CLAIM}roles`]).toEqual([ROLE.instructor]);
    expect((c[`${LTI_CLAIM}context`] as { id: string }).id).toBe('5a1');
  });

  it('từ chối: chưa đăng nhập, phiên người khác, sai redirect_uri, app tắt, lớp không thuộc, thiếu nonce', async () => {
    const { authorize, call } = await setup();
    expect((await call('/authorize', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await authorize('hs1', { login_hint: 'hs2' })).status).toBe(403);
    expect((await authorize('hs1', { redirect_uri: 'https://ke-gian.vn/launch' })).status).toBe(400);
    expect((await authorize('hs1', { client_id: 'cid-off' })).status).toBe(400);
    expect((await authorize('hs1', { lti_message_hint: '5a2' })).status).toBe(403);
    expect((await authorize('hs1', { nonce: '' })).status).toBe(400);
    expect((await authorize('hs1', { scope: 'profile' })).status).toBe(400);
  });
});

describe('LTI: gửi điểm (AGS)', () => {
  async function ready() {
    const s = await setup();
    await s.authorize('hs1', { lti_message_hint: '5a1' });
    const t = await (await s.token()).json() as { access_token: string; scope: string };
    const auth = { Authorization: `Bearer ${t.access_token}` };
    return { ...s, auth, at: t.access_token };
  }
  const score = (body: Record<string, unknown>) => ({ method: 'POST', headers: { 'Content-Type': 'application/vnd.ims.lis.v1.score+json' }, body: JSON.stringify({ timestamp: '2026-11-20T08:00:00.000Z', activityProgress: 'Completed', gradingProgress: 'FullyGraded', ...body }) });

  it('đổi access token rồi gửi điểm, đọc lại kết quả', async () => {
    const { call, auth, store } = await ready();
    const r = await call('/ags/5a1/lineitems/li1/scores', { ...score({ userId: 'hs1', scoreGiven: 7, scoreMaximum: 10, comment: 'Tốt' }), headers: { ...auth, 'Content-Type': 'application/json' } });
    expect(r.status).toBe(200);
    expect(store.scores[0]).toMatchObject({ appId: 'luyen-doc', lineItemId: 'li1', score: { userId: 'hs1', scoreGiven: 7, scoreMaximum: 10, comment: 'Tốt' } });
    const res = await (await call('/ags/5a1/lineitems/li1/results', { headers: auth })).json() as { userId: string; resultScore: number; resultMaximum: number }[];
    expect(res).toEqual([expect.objectContaining({ userId: 'hs1', resultScore: 70, resultMaximum: 100 })]);
  });

  it('tạo, tìm cột điểm theo tag', async () => {
    const { call, auth } = await ready();
    const c = await call('/ags/5a1/lineitems', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/vnd.ims.lis.v2.lineitem+json' }, body: JSON.stringify({ label: 'Bài 3', scoreMaximum: 10, tag: 'bai-3', resourceId: 'b3' }) });
    expect(c.status).toBe(201);
    const li = await c.json() as { id: string };
    expect(li.id).toBe(`${ISS}/ags/5a1/lineitems/li2`);
    const list = await (await call('/ags/5a1/lineitems?tag=bai-3', { headers: auth })).json() as unknown[];
    expect(list).toEqual([{ id: li.id, label: 'Bài 3', scoreMaximum: 10, tag: 'bai-3', resourceId: 'b3' }]);
    expect((await call('/ags/5a1/lineitems', { headers: auth })).headers.get('Content-Type')).toContain('lineitemcontainer');
  });

  it('từ chối: HS lớp khác, cột điểm của lớp / app khác, không token, scope thiếu', async () => {
    const { call, auth, token } = await ready();
    expect((await call('/ags/5a1/lineitems/li1/scores', { ...score({ userId: 'hs2', scoreGiven: 1, scoreMaximum: 10 }), headers: auth })).status).toBe(403);
    expect((await call('/ags/5a2/lineitems/li1/scores', { ...score({ userId: 'hs2', scoreGiven: 1, scoreMaximum: 10 }), headers: auth })).status).toBe(404);
    expect((await call('/ags/5a1/lineitems/li1/scores', score({ userId: 'hs1', scoreGiven: 1, scoreMaximum: 10 }))).status).toBe(401);
    expect((await call('/ags/5a1/lineitems/li1/scores', { ...score({ userId: 'hs1', scoreGiven: 5 }), headers: auth })).status).toBe(400);
    const ro = await (await token(SCOPE.lineitemRead)).json() as { access_token: string };
    expect((await call('/ags/5a1/lineitems/li1/scores', { ...score({ userId: 'hs1', scoreGiven: 1, scoreMaximum: 10 }), headers: { Authorization: `Bearer ${ro.access_token}` } })).status).toBe(403);
  });

  it('access token của app khác không chạm được cột điểm của app này', async () => {
    const s = await setup();
    await s.authorize('hs1', { lti_message_hint: '5a1' });
    const other = await s.call('/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await s.assertion({ iss: 'cid-2', sub: 'cid-2' }), scope: SCOPE.score }).toString() });
    const at = (await other.json() as { access_token: string }).access_token;
    expect((await s.call('/ags/5a1/lineitems/li1/scores', { method: 'POST', headers: { Authorization: `Bearer ${at}` }, body: JSON.stringify({ userId: 'hs1', scoreGiven: 1, scoreMaximum: 2 }) })).status).toBe(404);
  });

  it('/token từ chối: dùng lại jti, sai khóa, sai aud, hết hạn, app tắt', async () => {
    const s = await setup();
    const form = (a: string) => ({ method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: a, scope: SCOPE.score }).toString() });
    const a = await s.assertion();
    expect((await s.call('/token', form(a))).status).toBe(200);
    expect((await s.call('/token', form(a))).status).toBe(400);
    const wrong = await generateKeyPair();
    expect((await s.call('/token', form(await s.assertion({}, wrong)))).status).toBe(401);
    expect((await s.call('/token', form(await s.assertion({ aud: 'https://khac.vn/token' })))).status).toBe(400);
    expect((await s.call('/token', form(await s.assertion({ exp: Math.floor(Date.now() / 1000) - 120 })))).status).toBe(400);
    expect((await s.call('/token', form(await s.assertion({ iss: 'cid-off', sub: 'cid-off' })))).status).toBe(401);
    expect((await s.call('/token', { method: 'POST', body: 'grant_type=password' })).status).toBe(400);
  });
});

/* ======================= Deep Linking, trang học, xAPI, lưu trạng thái ======================= */
import { DL_CLAIM, LtiPlatformStorage, XAPI_CLAIM, XAPI_SKILLS_EXT, isoDurationSec, parseStatement, xapiVerbKind } from '../lti';

async function setupDl() {
  const s = await setup();
  s.store.data.tools[0].deepLinkUrl = `${TOOL}/lti/chon-bai`;
  s.store.data.apps = [{ appId: 'trang-html', enabled: true, allowedOrigins: ['https://html.truong.edu.vn'] }];
  return s;
}

describe('LTI: Deep Linking (GV chọn bài trong app → Trang học)', () => {
  it('kí yêu cầu chọn bài cho GV; HS không được', async () => {
    const { authorize } = await setupDl();
    const r = await authorize('gv1', { lti_message_hint: 'dl:5a1', redirect_uri: `${TOOL}/lti/chon-bai` });
    expect(r.status).toBe(200);
    const c = decodeJwt((await r.json() as { fields: { id_token: string } }).fields.id_token).payload;
    expect(c[`${LTI_CLAIM}message_type`]).toBe('LtiDeepLinkingRequest');
    expect(c[`${LTI_CLAIM}target_link_uri`]).toBe(`${TOOL}/lti/chon-bai`);
    const st = c[`${DL_CLAIM}deep_linking_settings`] as { deep_link_return_url: string; accept_types: string[]; data: string };
    expect(st.deep_link_return_url).toBe(`${ISS}/deep-link`);
    expect(st.accept_types).toEqual(['ltiResourceLink']);
    expect(c[`${LTI_CLAIM}resource_link`]).toBeUndefined();
    expect((await authorize('hs1', { lti_message_hint: 'dl:5a1', redirect_uri: `${TOOL}/lti/chon-bai` })).status).toBe(403);
  });

  it('nhận phản hồi kí bằng khóa app → tạo trang học → HS mở đúng bài, có cột điểm riêng', async () => {
    const { authorize, call, store, toolKey } = await setupDl();
    const req = decodeJwt((await (await authorize('gv1', { lti_message_hint: 'dl:5a1', redirect_uri: `${TOOL}/lti/chon-bai` })).json() as { fields: { id_token: string } }).fields.id_token).payload;
    const data = (req[`${DL_CLAIM}deep_linking_settings`] as { data: string }).data;
    const now = Math.floor(Date.now() / 1000);
    const resp = await signJwt({
      iss: 'cid', aud: ISS, iat: now, exp: now + 300, nonce: 'x',
      [`${LTI_CLAIM}message_type`]: 'LtiDeepLinkingResponse', [`${LTI_CLAIM}version`]: '1.3.0', [`${LTI_CLAIM}deployment_id`]: 'd1',
      [`${DL_CLAIM}data`]: data,
      [`${DL_CLAIM}content_items`]: [
        { type: 'ltiResourceLink', title: 'Bài 3 - Cây bàng', url: `${TOOL}/bai/3`, custom: { bai: '3' }, lineItem: { scoreMaximum: 10, label: 'Bài 3', tag: 'bai-3' }, iframe: {} },
        { type: 'ltiResourceLink', title: 'Bài lạ', url: 'https://ke-gian.vn/x' },
        { type: 'html', html: '<b>x</b>' },
      ],
    }, toolKey.privateJwk, toolKey.kid);
    const r = await call('/deep-link', { method: 'POST', body: new URLSearchParams({ JWT: resp }).toString() });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('Đã thêm 2 bài');
    expect(store.data.pages).toHaveLength(2);
    expect(store.data.pages?.[0]).toMatchObject({ title: 'Bài 3 - Cây bàng', url: `${TOOL}/bai/3`, custom: { bai: '3' }, scoreMaximum: 10, tag: 'bai-3', openIn: 'iframe' });
    expect(store.data.pages?.[1].url).toBeUndefined();
    // HS mở bài: target_link_uri = url của bài, custom của bài, cột điểm theo bài.
    const o = await authorize('hs1', { lti_message_hint: 'page:page1', redirect_uri: `${TOOL}/bai/3` });
    expect(o.status).toBe(200);
    const c = decodeJwt((await o.json() as { fields: { id_token: string } }).fields.id_token).payload;
    expect(c[`${LTI_CLAIM}target_link_uri`]).toBe(`${TOOL}/bai/3`);
    expect(c[`${LTI_CLAIM}resource_link`]).toEqual({ id: 'page1', title: 'Bài 3 - Cây bàng' });
    expect(c[`${LTI_CLAIM}custom`]).toMatchObject({ bai: '3', username: 'minhan' });
    expect(store.items.find((x) => x.resourceLinkId === 'page1')).toMatchObject({ label: 'Bài 3 - Cây bàng', scoreMaximum: 10, tag: 'bai-3' });
    expect(c[XAPI_CLAIM]).toMatchObject({ endpoint: `${ISS}/xapi` });
    // HS lớp khác không mở được.
    expect((await authorize('hs2', { lti_message_hint: 'page:page1', login_hint: 'hs2', redirect_uri: `${TOOL}/bai/3` })).status).toBe(403);
  });

  it('từ chối phản hồi giả (khóa khác) hoặc dữ liệu phiên bị sửa, và về trang GV khi có return_url', async () => {
    const { authorize, call, store } = await setupDl();
    const out = await (await call('/authorize', { method: 'POST', headers: { Authorization: 'Bearer tok-gv1' }, body: JSON.stringify({ scope: 'openid', client_id: 'cid', redirect_uri: `${TOOL}/lti/chon-bai`, login_hint: 'gv1', nonce: 'n', lti_message_hint: 'dl:5a1', return_url: 'https://gv.truong.edu.vn/trang-hoc' }) })).json() as { fields: { id_token: string } };
    const data = (decodeJwt(out.fields.id_token).payload[`${DL_CLAIM}deep_linking_settings`] as { data: string }).data;
    void authorize;
    const now = Math.floor(Date.now() / 1000);
    const claims = (d: string) => ({ iss: 'cid', aud: ISS, iat: now, exp: now + 300, [`${LTI_CLAIM}message_type`]: 'LtiDeepLinkingResponse', [`${LTI_CLAIM}version`]: '1.3.0', [`${LTI_CLAIM}deployment_id`]: 'd1', [`${DL_CLAIM}data`]: d, [`${DL_CLAIM}content_items`]: [{ type: 'ltiResourceLink', title: 'X' }] });
    const fake = await generateKeyPair();
    expect((await call('/deep-link', { method: 'POST', body: new URLSearchParams({ JWT: await signJwt(claims(data), fake.privateJwk, fake.kid) }).toString() })).status).toBe(401);
    const s2 = await setupDl();
    const ok = await call('/deep-link', { method: 'POST', body: new URLSearchParams({ JWT: await signJwt(claims(data + 'x'), s2.toolKey.privateJwk, s2.toolKey.kid) }).toString() });
    expect(ok.status).toBe(401);
    expect(store.data.pages ?? []).toHaveLength(0);
  });
});

describe('xAPI', () => {
  const stmt = (extra: Record<string, unknown> = {}) => ({
    actor: { account: { homePage: ISS, name: 'hs1' } },
    verb: { id: 'http://adlnet.gov/expapi/verbs/answered' },
    object: { id: 'https://doc.truong.edu.vn/bai/3/cau/2', definition: { name: { 'vi-VN': 'Câu 2: Ý chính của đoạn 1?' }, extensions: { [XAPI_SKILLS_EXT]: ['TV5-DH-YCHINH'] } } },
    result: { success: false, score: { raw: 0, max: 1 }, duration: 'PT45S', response: 'B' },
    ...extra,
  });

  it('đọc câu xAPI: kĩ năng, điểm, thời lượng; người học luôn là người đã xác thực', () => {
    const r = parseStatement(stmt({ actor: { mbox: 'mailto:ke-gian@x.vn' } }), 'hs1', Date.now());
    expect(r).toMatchObject({ userId: 'hs1', verb: 'http://adlnet.gov/expapi/verbs/answered', objectName: 'Câu 2: Ý chính của đoạn 1?', success: false, scaled: 0, durationSec: 45, skills: ['TV5-DH-YCHINH'] });
    expect((r.statement.actor as { account: { name: string } }).account.name).toBe('hs1');
    expect(isoDurationSec('PT1H2M3.4S')).toBe(3723);
    expect(xapiVerbKind('http://adlnet.gov/expapi/verbs/completed')).toBe('completed');
    expect(() => parseStatement({ verb: { id: 'answered' }, object: { id: 'x' } }, 'hs1', Date.now())).toThrow();
  });

  it('app có máy chủ gửi bằng access token (scope xapi); thiếu scope / HS lạ bị từ chối', async () => {
    const s = await setupDl();
    const at = (await (await s.token(`${SCOPE.score} ${SCOPE.xapi}`)).json() as { access_token: string }).access_token;
    const r = await s.call('/xapi/statements', { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify([stmt(), stmt({ verb: { id: 'http://adlnet.gov/expapi/verbs/completed' }, result: { score: { scaled: 0.8 }, completion: true } })]) });
    expect(r.status).toBe(200);
    expect(r.headers.get('X-Experience-API-Version')).toBe('1.0.3');
    expect((await r.json() as string[])).toHaveLength(2);
    expect(s.store.xapi.map((x) => x.appId)).toEqual(['luyen-doc', 'luyen-doc']);
    const noScope = (await (await s.token(SCOPE.score)).json() as { access_token: string }).access_token;
    expect((await s.call('/xapi/statements', { method: 'POST', headers: { Authorization: `Bearer ${noScope}` }, body: JSON.stringify(stmt()) })).status).toBe(403);
    expect((await s.call('/xapi/statements', { method: 'POST', headers: { Authorization: `Bearer ${at}` }, body: JSON.stringify(stmt({ actor: { account: { name: 'gv1' } } })) })).status).toBe(403);
  });

  it('trang HTML gửi bằng phiên đăng nhập của em: phải đúng app + origin đã đăng kí', async () => {
    const s = await setupDl();
    const send = (origin: string, app = 'trang-html') => s.call('/xapi/statements', { method: 'POST', headers: { Authorization: 'Bearer tok-hs1', Origin: origin, 'X-OpenEdu-App': app }, body: JSON.stringify(stmt({ actor: { account: { name: 'hs2' } } })) });
    const ok = await send('https://html.truong.edu.vn');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://html.truong.edu.vn');
    expect(s.store.xapi[0].row.userId).toBe('hs1');
    expect((await send('https://ke-gian.vn')).status).toBe(403);
    expect((await send('https://html.truong.edu.vn', 'khong-co')).status).toBe(403);
    const pre = await s.call('/xapi/statements', { method: 'OPTIONS', headers: { Origin: 'https://html.truong.edu.vn' } });
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('x-openedu-app');
  });
});

describe('Lưu trạng thái qua nền tảng (app trong khung)', () => {
  it('trả lời đúng app, tách theo origin, bỏ qua origin lạ', () => {
    const st = new LtiPlatformStorage(() => ['https://doc.vn', 'https://khac.vn']);
    expect(st.handle('https://doc.vn', { subject: 'lti.capabilities', message_id: 1 })).toMatchObject({ subject: 'lti.capabilities.response', message_id: 1 });
    expect(st.handle('https://doc.vn', { subject: 'lti.put_data', message_id: 2, key: 'state-1', value: 'abc' })).toMatchObject({ subject: 'lti.put_data.response', key: 'state-1', value: 'abc' });
    expect(st.handle('https://doc.vn', { subject: 'lti.get_data', message_id: 3, key: 'state-1' })).toMatchObject({ value: 'abc' });
    expect(st.handle('https://khac.vn', { subject: 'lti.get_data', message_id: 4, key: 'state-1' })).toMatchObject({ value: null });
    expect(st.handle('https://ke-gian.vn', { subject: 'lti.get_data', message_id: 5, key: 'state-1' })).toBeNull();
    expect(st.handle('https://doc.vn', { type: 'khac' })).toBeNull();
  });
});
