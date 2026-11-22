/**
 * OPEN-EDU làm NỀN TẢNG (Platform) LTI 1.3 cho app ngoài (Tool) — ví dụ app luyện đọc hiểu viết bằng FastAPI + pylti1p3.
 * Thuần (Request/Response chuẩn web + WebCrypto), có kiểm thử; Edge Function `lti` chỉ cắm kho dữ liệu Supabase vào.
 *
 * Đường dẫn (sau tiền tố …/functions/v1/lti):
 *   GET  /jwks                                  khóa công khai của OPEN-EDU (app ngoài dùng để kiểm chữ kí id_token)
 *   POST /authorize                             trang /lti/auth của app học sinh gọi (kèm JWT đăng nhập) → id_token
 *   POST /token                                 app ngoài đổi client_assertion lấy access token (OAuth2 client_credentials)
 *   GET  /ags/{lớp}/lineitems                   danh sách cột điểm (Assignment and Grade Services)
 *   POST /ags/{lớp}/lineitems                   tạo cột điểm
 *   GET  /ags/{lớp}/lineitems/{id}              một cột điểm
 *   POST /ags/{lớp}/lineitems/{id}/scores       gửi điểm của một học sinh → ghi vào hồ sơ học tập (external_activities)
 *   GET  /ags/{lớp}/lineitems/{id}/results      đọc lại điểm đã gửi
 *   POST /deep-link                             app ngoài trả bài GV đã chọn (Deep Linking) → tạo "Trang học" cho lớp
 *   POST /xapi/statements                       dữ liệu học chi tiết (xAPI) — app có máy chủ (access token LTI, scope xapi)
 *                                               hoặc trang HTML (phiên đăng nhập OPEN-EDU qua openedu-connect.js)
 *
 * lti_message_hint: '<mã lớp>' (mở app) · 'page:<mã trang học>' (mở một bài đã giao) · 'dl:<mã lớp>' (GV chọn bài).
 *
 * Luồng đăng nhập (OIDC, "third-party initiated login"):
 *   1. HS bấm mở app trong OPEN-EDU → trình duyệt tới login_url của app ngoài với iss, login_hint (= mã HS),
 *      target_link_uri, lti_message_hint (= mã lớp), client_id, lti_deployment_id.
 *   2. App ngoài chuyển về trang /lti/auth của app học sinh (state, nonce, redirect_uri…).
 *   3. Trang đó gọi POST /authorize kèm phiên đăng nhập của HS; máy chủ kiểm tra rồi kí id_token (RS256).
 *   4. Trang tự gửi biểu mẫu (form_post) id_token + state tới redirect_uri của app ngoài.
 */
import { decodeJwt, randomId, signJwt, verifyJwt, type Json } from './jwt';

export const LTI_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/';
export const AGS_CLAIM = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';
export const SCOPE = {
  lineitem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  lineitemRead: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  resultRead: 'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  /** OPEN-EDU: gửi dữ liệu học chi tiết (xAPI) bằng access token. */
  xapi: 'https://open-edu.vn/lti/scope/xapi',
} as const;
export const DL_CLAIM = 'https://purl.imsglobal.org/spec/lti-dl/claim/';
/** OPEN-EDU: nơi app gửi xAPI (kèm trong id_token). */
export const XAPI_CLAIM = 'https://open-edu.vn/lti/claim/xapi';
/** Mở rộng xAPI: mã kĩ năng OPEN-EDU (mảng chuỗi) — đặt ở object.definition.extensions hoặc context.extensions. */
export const XAPI_SKILLS_EXT = 'https://open-edu.vn/xapi/skills';
export const ROLE = {
  learner: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
  instructor: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
  admin: 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
  mentor: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor',
} as const;

export interface LtiTool {
  appId: string;
  name: string;
  clientId: string;
  deploymentId: string;
  loginUrl: string;
  launchUrl: string;
  /** redirect_uri được phép (mặc định = launchUrl). */
  redirectUris: string[];
  /** Nơi lấy khóa công khai của app ngoài (để kiểm client_assertion khi gửi điểm). */
  jwksUrl?: string;
  /** Hoặc dán thẳng khóa công khai (JWK). */
  publicJwk?: JsonWebKey;
  /** Địa chỉ chọn bài (Deep Linking). Không có = app không cho GV chọn bài. */
  deepLinkUrl?: string;
  enabled: boolean;
}

/** "Trang học" của lớp mở một bài trong app LTI. */
export interface LtiPage {
  id: string;
  contextId: string;
  appId: string;
  title: string;
  /** target_link_uri riêng của bài (cùng origin với launchUrl). */
  url?: string;
  custom?: Record<string, string>;
  scoreMaximum?: number;
  resourceId?: string;
  tag?: string;
}
export interface LtiPageInput { title: string; url?: string; custom?: Record<string, string>; scoreMaximum?: number; resourceId?: string; tag?: string; openIn: 'iframe' | 'window' }

/** Một dòng xAPI đã kiểm tra, sẵn để lưu. */
export interface XapiRow {
  id: string;
  userId: string;
  verb: string;
  objectId: string;
  objectName: string;
  success?: boolean;
  scaled?: number;
  raw?: number;
  max?: number;
  durationSec?: number;
  completion?: boolean;
  skills: string[];
  statement: Json;
  at: string;
}

export interface LtiUser { id: string; name: string; role: 'student' | 'teacher' | 'admin' | 'parent'; username?: string; email?: string; grade?: number | null }
export interface LtiContext { id: string; name: string; grade?: number | null }
export interface LtiLineItem { id: string; appId: string; contextId: string; label: string; scoreMaximum: number; resourceLinkId?: string; resourceId?: string; tag?: string }
export interface LtiScore {
  userId: string;
  scoreGiven?: number;
  scoreMaximum?: number;
  comment?: string;
  activityProgress: string;
  gradingProgress: string;
  timestamp: string;
}
export interface LtiResult { userId: string; resultScore?: number; resultMaximum: number; comment?: string }

export interface LtiStore {
  /** Khóa kí của OPEN-EDU (tạo một lần, giữ lâu dài). */
  platformKey(): Promise<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey; kid: string }>;
  toolByClientId(clientId: string): Promise<LtiTool | null>;
  tool(appId: string): Promise<LtiTool | null>;
  user(userId: string): Promise<LtiUser | null>;
  context(contextId: string): Promise<LtiContext | null>;
  /** Lớp người này học (HS) hoặc dạy (GV / quản trị). */
  contextsOf(userId: string): Promise<LtiContext[]>;
  /** HS thuộc lớp. */
  isLearner(userId: string, contextId: string): Promise<boolean>;
  lineItems(appId: string, contextId: string): Promise<LtiLineItem[]>;
  lineItem(id: string): Promise<LtiLineItem | null>;
  createLineItem(li: Omit<LtiLineItem, 'id'>): Promise<LtiLineItem>;
  saveScore(li: LtiLineItem, s: LtiScore, tool: LtiTool): Promise<void>;
  results(li: LtiLineItem, userId?: string): Promise<LtiResult[]>;
  /** Chống dùng lại client_assertion: false nếu jti đã gặp. */
  rememberJti(key: string, expiresAt: number): Promise<boolean>;
  /** GV chủ nhiệm / dạy cùng / quản trị của lớp. */
  canTeach(userId: string, contextId: string): Promise<boolean>;
  page(id: string): Promise<LtiPage | null>;
  /** Deep Linking: tạo Trang học cho lớp. Trả số trang đã tạo. */
  createPages(tool: LtiTool, contextId: string, userId: string, items: LtiPageInput[]): Promise<number>;
  /** App đăng kí (cho xAPI từ trang HTML qua openedu-connect.js): origin được phép. */
  connectApp(appId: string): Promise<{ appId: string; enabled: boolean; allowedOrigins: string[] } | null>;
  /** Lưu xAPI (+ sự kiện học, mức thành thạo, hoạt động ở app ngoài). */
  saveXapi(appId: string, rows: XapiRow[]): Promise<void>;
}

export interface LtiDeps {
  store: LtiStore;
  /** Mã nền tảng (iss), vd https://<ref>.supabase.co/functions/v1/lti — cũng là gốc các đường dẫn ở trên. */
  issuer: string;
  /** Mã người dùng từ JWT đăng nhập ở header Authorization (null = chưa đăng nhập / hết hạn). */
  authenticate(req: Request): Promise<string | null>;
  /** Origin được gọi /authorize từ trình duyệt (CORS). */
  corsOrigin(req: Request): string;
  fetchJson?(url: string): Promise<unknown>;
  now?(): number;
}

export class LtiError extends Error {
  constructor(readonly status: number, message: string, readonly code = 'invalid_request') {
    super(message);
  }
}

const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function json(body: unknown, status = 200, headers: Record<string, string> = {}, type = 'application/json'): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', ...headers } });
}

function splitName(full: string): { given: string; family: string } {
  const w = full.trim().split(/\s+/).filter(Boolean);
  if (w.length < 2) return { given: full.trim(), family: '' };
  return { given: w[w.length - 1], family: w.slice(0, -1).join(' ') };
}

function rolesOf(u: LtiUser): string[] {
  if (u.role === 'student') return [ROLE.learner];
  if (u.role === 'teacher') return [ROLE.instructor];
  if (u.role === 'admin') return [ROLE.admin, ROLE.instructor];
  return [ROLE.mentor];
}

export const lineItemsUrl = (issuer: string, contextId: string) => `${issuer}/ags/${encodeURIComponent(contextId)}/lineitems`;
export const lineItemUrl = (issuer: string, li: LtiLineItem) => `${lineItemsUrl(issuer, li.contextId)}/${encodeURIComponent(li.id)}`;

function lineItemJson(issuer: string, li: LtiLineItem): Json {
  return {
    id: lineItemUrl(issuer, li),
    label: li.label,
    scoreMaximum: li.scoreMaximum,
    ...(li.resourceLinkId ? { resourceLinkId: li.resourceLinkId } : {}),
    ...(li.resourceId ? { resourceId: li.resourceId } : {}),
    ...(li.tag ? { tag: li.tag } : {}),
  };
}

/** resource_link.id của một app trong một lớp (mỗi lớp một "chỗ đặt"). */
export const resourceLinkId = (appId: string, contextId: string) => `${appId}:${contextId}`;

async function defaultLineItem(store: LtiStore, tool: LtiTool, ctx: LtiContext): Promise<LtiLineItem> {
  const rl = resourceLinkId(tool.appId, ctx.id);
  const list = await store.lineItems(tool.appId, ctx.id);
  return list.find((x) => x.resourceLinkId === rl && !x.tag && !x.resourceId)
    ?? store.createLineItem({ appId: tool.appId, contextId: ctx.id, label: tool.name, scoreMaximum: 100, resourceLinkId: rl });
}

async function pageLineItem(store: LtiStore, tool: LtiTool, page: LtiPage): Promise<LtiLineItem> {
  const list = await store.lineItems(tool.appId, page.contextId);
  return list.find((x) => x.resourceLinkId === page.id)
    ?? store.createLineItem({
      appId: tool.appId, contextId: page.contextId, label: page.title, scoreMaximum: page.scoreMaximum && page.scoreMaximum > 0 ? page.scoreMaximum : 100, resourceLinkId: page.id,
      ...(page.resourceId ? { resourceId: page.resourceId } : {}), ...(page.tag ? { tag: page.tag } : {}),
    });
}

const originOf = (u: string): string => { try { return new URL(u).origin; } catch { return ''; } };

/** Địa chỉ con của app (cùng origin với launchUrl) — dùng cho url riêng của từng bài. */
function sameAppOrigin(tool: LtiTool, url: string | undefined): boolean {
  return !!url && /^https?:\/\//.test(url) && originOf(url) === originOf(tool.launchUrl);
}

/* ================================ /authorize ================================ */
export interface AuthorizeInput {
  client_id: string;
  redirect_uri: string;
  login_hint: string;
  lti_message_hint?: string;
  nonce: string;
  state?: string;
  scope?: string;
  response_type?: string;
  response_mode?: string;
  prompt?: string;
  lti_storage_target?: string;
}
export interface AuthorizeOutput { action: string; fields: { id_token: string; state?: string } }

export async function authorize(deps: LtiDeps, userId: string, p: AuthorizeInput, returnUrl?: string): Promise<AuthorizeOutput> {
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  if (!str(p.scope).split(/\s+/).includes('openid')) throw new LtiError(400, 'Thiếu scope=openid.', 'invalid_scope');
  if (p.response_type && p.response_type !== 'id_token') throw new LtiError(400, 'response_type phải là id_token.', 'unsupported_response_type');
  if (p.response_mode && p.response_mode !== 'form_post') throw new LtiError(400, 'response_mode phải là form_post.', 'invalid_request');
  const nonce = str(p.nonce, 400);
  if (!nonce) throw new LtiError(400, 'Thiếu nonce.', 'invalid_request');
  const tool = await deps.store.toolByClientId(str(p.client_id, 200));
  if (!tool || !tool.enabled) throw new LtiError(400, 'Ứng dụng này chưa được nhà trường đăng kí hoặc đã tắt.', 'unauthorized_client');
  if (str(p.login_hint, 200) !== userId) throw new LtiError(403, 'Phiên đăng nhập không khớp. Em mở lại ứng dụng từ OPEN-EDU nhé.', 'login_required');
  const user = await deps.store.user(userId);
  if (!user) throw new LtiError(403, 'Không thấy tài khoản.', 'login_required');
  const contexts = await deps.store.contextsOf(userId);
  const hint = str(p.lti_message_hint, 200);

  // Ba kiểu mở: app (lớp), một trang học, GV chọn bài (Deep Linking).
  let mode: 'app' | 'page' | 'dl' = 'app';
  let ctx: LtiContext | undefined;
  let page: LtiPage | null = null;
  if (hint.startsWith('page:')) {
    mode = 'page';
    page = await deps.store.page(hint.slice(5));
    if (!page || page.appId !== tool.appId) throw new LtiError(404, 'Không thấy bài này.', 'access_denied');
    ctx = contexts.find((c) => c.id === page?.contextId);
    if (!ctx) throw new LtiError(403, 'Em không thuộc lớp của bài này.', 'access_denied');
  } else if (hint.startsWith('dl:')) {
    mode = 'dl';
    if (!tool.deepLinkUrl) throw new LtiError(400, 'Ứng dụng này chưa khai báo địa chỉ chọn bài (Deep Linking).', 'invalid_request');
    ctx = contexts.find((c) => c.id === hint.slice(3));
    if (!ctx || !(await deps.store.canTeach(userId, ctx.id))) throw new LtiError(403, 'Chỉ giáo viên của lớp mới chọn bài cho lớp.', 'access_denied');
  } else {
    ctx = hint ? contexts.find((c) => c.id === hint) : contexts[0];
    if (!ctx) throw new LtiError(403, hint ? 'Em không thuộc lớp này.' : 'Em chưa có lớp nên chưa mở được ứng dụng.', 'access_denied');
  }
  const target = mode === 'dl' ? (tool.deepLinkUrl as string) : mode === 'page' && sameAppOrigin(tool, page?.url) ? (page?.url as string) : tool.launchUrl;
  const redirect = str(p.redirect_uri);
  const allowed = new Set([...(tool.redirectUris.length ? tool.redirectUris : []), tool.launchUrl, ...(tool.deepLinkUrl ? [tool.deepLinkUrl] : []), target]);
  if (!allowed.has(redirect)) throw new LtiError(400, 'Địa chỉ trả về (redirect_uri) không khớp địa chỉ đã đăng kí của ứng dụng.', 'invalid_request');

  const { given, family } = splitName(user.name);
  const key = await deps.store.platformKey();
  const base: Json = {
    iss: deps.issuer,
    sub: user.id,
    aud: tool.clientId,
    azp: tool.clientId,
    iat: now,
    nbf: now - 5,
    exp: now + 300,
    nonce,
    name: user.name,
    given_name: given,
    family_name: family,
    ...(user.email ? { email: user.email } : {}),
    locale: 'vi-VN',
    [`${LTI_CLAIM}version`]: '1.3.0',
    [`${LTI_CLAIM}deployment_id`]: tool.deploymentId,
    [`${LTI_CLAIM}target_link_uri`]: target,
    [`${LTI_CLAIM}roles`]: rolesOf(user),
    [`${LTI_CLAIM}context`]: { id: ctx.id, label: ctx.name, title: `Lớp ${ctx.name}`, type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseSection'] },
    [`${LTI_CLAIM}tool_platform`]: { guid: deps.issuer, name: 'OPEN-EDU', product_family_code: 'open-edu', version: '2' },
    [`${LTI_CLAIM}launch_presentation`]: { document_target: str(p.lti_storage_target) ? 'iframe' : 'window', locale: 'vi-VN', ...(returnUrl ? { return_url: returnUrl } : {}) },
    [XAPI_CLAIM]: { endpoint: `${deps.issuer}/xapi`, scope: SCOPE.xapi, skills_extension: XAPI_SKILLS_EXT },
  };
  let claims: Json;
  if (mode === 'dl') {
    const data = await signJwt({ typ: 'lti-dl', iss: deps.issuer, app: tool.appId, ctx: ctx.id, uid: user.id, ret: returnUrl ?? '', exp: now + 3600 }, key.privateJwk, key.kid);
    claims = {
      ...base,
      [`${LTI_CLAIM}message_type`]: 'LtiDeepLinkingRequest',
      [`${LTI_CLAIM}custom`]: { username: user.username ?? '', class_name: ctx.name, class_grade: ctx.grade ?? '', role: user.role },
      [`${DL_CLAIM}deep_linking_settings`]: {
        deep_link_return_url: `${deps.issuer}/deep-link`,
        accept_types: ['ltiResourceLink'],
        accept_presentation_document_targets: ['iframe', 'window'],
        accept_multiple: true,
        auto_create: true,
        title: `Giao bài cho lớp ${ctx.name}`,
        data,
      },
    };
  } else {
    const li = page ? await pageLineItem(deps.store, tool, page) : await defaultLineItem(deps.store, tool, ctx);
    claims = {
      ...base,
      [`${LTI_CLAIM}message_type`]: 'LtiResourceLinkRequest',
      [`${LTI_CLAIM}resource_link`]: page ? { id: page.id, title: page.title } : { id: resourceLinkId(tool.appId, ctx.id), title: tool.name },
      [`${LTI_CLAIM}custom`]: { ...(page?.custom ?? {}), username: user.username ?? '', grade: user.grade ?? '', class_name: ctx.name, role: user.role },
      [AGS_CLAIM]: { scope: [SCOPE.lineitem, SCOPE.lineitemRead, SCOPE.resultRead, SCOPE.score], lineitems: lineItemsUrl(deps.issuer, ctx.id), lineitem: lineItemUrl(deps.issuer, li) },
    };
  }
  const idToken = await signJwt(claims, key.privateJwk, key.kid);
  return { action: redirect, fields: { id_token: idToken, ...(p.state ? { state: str(p.state, 2000) } : {}) } };
}

/* ================================ /token ================================ */
const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

async function toolKeys(deps: LtiDeps, tool: LtiTool): Promise<JsonWebKey[]> {
  if (tool.publicJwk) return [tool.publicJwk];
  if (tool.jwksUrl && deps.fetchJson) {
    const body = await deps.fetchJson(tool.jwksUrl);
    const keys = (body as { keys?: JsonWebKey[] })?.keys;
    if (Array.isArray(keys)) return keys.filter((k) => k && k.kty === 'RSA');
  }
  throw new LtiError(400, 'Ứng dụng chưa khai báo khóa công khai (JWKS URL hoặc khóa PEM).', 'invalid_client');
}

export async function issueToken(deps: LtiDeps, form: URLSearchParams): Promise<Json> {
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  if (form.get('grant_type') !== 'client_credentials') throw new LtiError(400, 'grant_type phải là client_credentials.', 'unsupported_grant_type');
  if (form.get('client_assertion_type') !== ASSERTION_TYPE) throw new LtiError(400, 'client_assertion_type không đúng.', 'invalid_request');
  const assertion = form.get('client_assertion') ?? '';
  let decoded;
  try { decoded = decodeJwt(assertion); } catch { throw new LtiError(400, 'client_assertion không đọc được.', 'invalid_client'); }
  const { header, payload } = decoded;
  const clientId = str(payload.iss, 200);
  if (!clientId || payload.sub !== clientId) throw new LtiError(400, 'client_assertion: iss và sub phải là client_id.', 'invalid_client');
  const tool = await deps.store.toolByClientId(clientId);
  if (!tool || !tool.enabled) throw new LtiError(401, 'Ứng dụng chưa được đăng kí hoặc đã tắt.', 'invalid_client');
  const aud = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud ?? '')];
  if (!aud.some((a) => a === `${deps.issuer}/token` || a === deps.issuer)) throw new LtiError(400, 'client_assertion: aud phải là địa chỉ /token của OPEN-EDU.', 'invalid_client');
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp < now - 30 || exp > now + 3600) throw new LtiError(400, 'client_assertion đã hết hạn.', 'invalid_client');
  const keys = await toolKeys(deps, tool);
  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  const candidates = kid ? keys.filter((k) => (k as { kid?: string }).kid === kid || !(k as { kid?: string }).kid) : keys;
  let ok = false;
  for (const k of candidates.length ? candidates : keys) {
    try { await verifyJwt(assertion, k); ok = true; break; } catch { /* thử khóa kế */ }
  }
  if (!ok) throw new LtiError(401, 'Chữ kí client_assertion không đúng.', 'invalid_client');
  const jti = str(payload.jti, 200);
  if (!jti) throw new LtiError(400, 'client_assertion thiếu jti.', 'invalid_client');
  if (!(await deps.store.rememberJti(`${clientId}:${jti}`, exp))) throw new LtiError(400, 'client_assertion đã được dùng.', 'invalid_client');
  const supported = Object.values(SCOPE) as string[];
  const scopes = (form.get('scope') ?? '').split(/\s+/).filter((s) => supported.includes(s));
  if (!scopes.length) throw new LtiError(400, 'Không có scope nào được hỗ trợ.', 'invalid_scope');
  const key = await deps.store.platformKey();
  const token = await signJwt({ iss: deps.issuer, aud: deps.issuer, sub: tool.appId, client_id: clientId, scope: scopes.join(' '), iat: now, exp: now + 3600, typ: 'lti-access', jti: randomId() }, key.privateJwk, key.kid);
  return { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: scopes.join(' ') };
}

async function requireAccess(deps: LtiDeps, req: Request, need: string[]): Promise<{ tool: LtiTool; scopes: string[] }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new LtiError(401, 'Thiếu access token.', 'invalid_token');
  const key = await deps.store.platformKey();
  let p: Json;
  try { p = await verifyJwt(token, key.publicJwk); } catch { throw new LtiError(401, 'Access token không hợp lệ.', 'invalid_token'); }
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  if (p.typ !== 'lti-access' || p.iss !== deps.issuer || Number(p.exp) < now) throw new LtiError(401, 'Access token đã hết hạn.', 'invalid_token');
  const scopes = str(p.scope).split(' ');
  if (!need.some((s) => scopes.includes(s))) throw new LtiError(403, 'Access token không có quyền này.', 'insufficient_scope');
  const tool = await deps.store.tool(str(p.sub, 80));
  if (!tool || !tool.enabled) throw new LtiError(401, 'Ứng dụng đã tắt.', 'invalid_token');
  return { tool, scopes };
}

/* ================================ AGS ================================ */
const PROGRESS = ['Initialized', 'Started', 'InProgress', 'Submitted', 'Completed'];
const GRADING = ['FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady'];

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

async function readJson(req: Request, max = 64 * 1024): Promise<Json> {
  const text = await req.text();
  if (text.length > max) throw new LtiError(413, 'Dữ liệu quá lớn.');
  try {
    const v = JSON.parse(text || '{}') as unknown;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error();
    return v as Json;
  } catch { throw new LtiError(400, 'Dữ liệu không phải JSON.'); }
}

async function ags(deps: LtiDeps, req: Request, parts: string[]): Promise<Response> {
  // parts: [ctx, 'lineitems', id?, 'scores'|'results'?]
  const [ctxId, kw, liId, sub] = parts.map((p) => decodeURIComponent(p));
  if (!ctxId || kw !== 'lineitems' || parts.length > 4) throw new LtiError(404, 'Không có đường dẫn này.', 'not_found');
  const LI = 'application/vnd.ims.lis.v2.lineitem+json';
  const container = 'application/vnd.ims.lis.v2.lineitemcontainer+json';
  if (!liId) {
    if (req.method === 'GET') {
      const { tool } = await requireAccess(deps, req, [SCOPE.lineitem, SCOPE.lineitemRead]);
      const q = new URL(req.url).searchParams;
      let list = await deps.store.lineItems(tool.appId, ctxId);
      if (q.get('resource_link_id')) list = list.filter((x) => x.resourceLinkId === q.get('resource_link_id'));
      if (q.get('resource_id')) list = list.filter((x) => x.resourceId === q.get('resource_id'));
      if (q.get('tag')) list = list.filter((x) => x.tag === q.get('tag'));
      const limit = Number(q.get('limit') ?? '0');
      if (limit > 0) list = list.slice(0, limit);
      return json(list.map((x) => lineItemJson(deps.issuer, x)), 200, {}, container);
    }
    if (req.method === 'POST') {
      const { tool } = await requireAccess(deps, req, [SCOPE.lineitem]);
      if (!(await deps.store.context(ctxId))) throw new LtiError(404, 'Không thấy lớp.', 'not_found');
      const b = await readJson(req);
      const max = num(b.scoreMaximum);
      const label = str(b.label, 200);
      if (!label || max === undefined || max <= 0) throw new LtiError(400, 'Cột điểm cần label và scoreMaximum > 0.');
      const li = await deps.store.createLineItem({
        appId: tool.appId, contextId: ctxId, label, scoreMaximum: max,
        ...(str(b.resourceLinkId, 200) ? { resourceLinkId: str(b.resourceLinkId, 200) } : {}),
        ...(str(b.resourceId, 200) ? { resourceId: str(b.resourceId, 200) } : {}),
        ...(str(b.tag, 200) ? { tag: str(b.tag, 200) } : {}),
      });
      return json(lineItemJson(deps.issuer, li), 201, {}, LI);
    }
    throw new LtiError(405, 'Phương thức không hỗ trợ.', 'method_not_allowed');
  }
  const need = !sub ? [SCOPE.lineitem, SCOPE.lineitemRead] : sub === 'scores' ? [SCOPE.score] : sub === 'results' ? [SCOPE.resultRead] : [];
  if (!need.length) throw new LtiError(404, 'Không có đường dẫn này.', 'not_found');
  const { tool } = await requireAccess(deps, req, need);
  const li = await deps.store.lineItem(liId);
  if (!li || li.appId !== tool.appId || li.contextId !== ctxId) throw new LtiError(404, 'Không thấy cột điểm.', 'not_found');
  if (!sub) {
    if (req.method !== 'GET') throw new LtiError(405, 'Phương thức không hỗ trợ.', 'method_not_allowed');
    return json(lineItemJson(deps.issuer, li), 200, {}, LI);
  }
  if (sub === 'results') {
    if (req.method !== 'GET') throw new LtiError(405, 'Phương thức không hỗ trợ.', 'method_not_allowed');
    const uid = new URL(req.url).searchParams.get('user_id') ?? undefined;
    const rows = await deps.store.results(li, uid);
    return json(rows.map((r) => ({
      id: `${lineItemUrl(deps.issuer, li)}/results/${encodeURIComponent(r.userId)}`, scoreOf: lineItemUrl(deps.issuer, li), userId: r.userId,
      ...(r.resultScore !== undefined ? { resultScore: r.resultScore } : {}), resultMaximum: r.resultMaximum, ...(r.comment ? { comment: r.comment } : {}),
    })), 200, {}, 'application/vnd.ims.lis.v2.resultcontainer+json');
  }
  // scores
  if (req.method !== 'POST') throw new LtiError(405, 'Phương thức không hỗ trợ.', 'method_not_allowed');
  const b = await readJson(req);
  const userId = str(b.userId, 80);
  if (!userId) throw new LtiError(400, 'Thiếu userId.');
  if (!(await deps.store.isLearner(userId, ctxId))) throw new LtiError(403, 'Học sinh không thuộc lớp này.', 'forbidden');
  const given = num(b.scoreGiven);
  const max = num(b.scoreMaximum);
  if (given !== undefined && (given < 0 || max === undefined || max <= 0)) throw new LtiError(400, 'scoreGiven cần đi cùng scoreMaximum > 0.');
  const activityProgress = PROGRESS.includes(str(b.activityProgress)) ? str(b.activityProgress) : 'Completed';
  const gradingProgress = GRADING.includes(str(b.gradingProgress)) ? str(b.gradingProgress) : 'FullyGraded';
  const ts = str(b.timestamp, 40);
  await deps.store.saveScore(li, {
    userId, activityProgress, gradingProgress,
    timestamp: ts && !Number.isNaN(Date.parse(ts)) ? new Date(ts).toISOString() : new Date(deps.now?.() ?? Date.now()).toISOString(),
    ...(given !== undefined ? { scoreGiven: given } : {}),
    ...(max !== undefined ? { scoreMaximum: max } : {}),
    ...(str(b.comment, 1000) ? { comment: str(b.comment, 1000) } : {}),
  }, tool);
  return json({}, 200);
}

/* ================================ Deep Linking: nhận bài GV đã chọn ================================ */
function htmlPage(title: string, body: string, status = 200, headers: Record<string, string> = {}): Response {
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><body style="font-family:system-ui,sans-serif;padding:24px;line-height:1.5"><h1 style="font-size:20px">${esc(title)}</h1><p>${esc(body)}</p></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

const isStrMap = (v: unknown): v is Record<string, string> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean');

export interface DeepLinkResult { created: number; returnUrl: string; message?: string }

/** Kiểm tra LtiDeepLinkingResponse (JWT do app kí) rồi tạo Trang học. */
export async function acceptDeepLink(deps: LtiDeps, jwt: string): Promise<DeepLinkResult> {
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  let decoded;
  try { decoded = decodeJwt(jwt); } catch { throw new LtiError(400, 'Phản hồi chọn bài không đọc được.'); }
  const p = decoded.payload;
  const tool = await deps.store.toolByClientId(str(p.iss, 200));
  if (!tool || !tool.enabled) throw new LtiError(401, 'Ứng dụng chưa được đăng kí hoặc đã tắt.', 'invalid_client');
  const keys = await toolKeys(deps, tool);
  let ok = false;
  for (const k of keys) { try { await verifyJwt(jwt, k); ok = true; break; } catch { /* thử khóa kế */ } }
  if (!ok) throw new LtiError(401, 'Chữ kí phản hồi chọn bài không đúng.', 'invalid_client');
  const aud = Array.isArray(p.aud) ? p.aud.map(String) : [String(p.aud ?? '')];
  if (!aud.includes(deps.issuer)) throw new LtiError(400, 'Phản hồi chọn bài gửi nhầm nền tảng (aud).');
  const exp = Number(p.exp);
  if (!Number.isFinite(exp) || exp < now - 30) throw new LtiError(400, 'Phản hồi chọn bài đã hết hạn.');
  if (p[`${LTI_CLAIM}message_type`] !== 'LtiDeepLinkingResponse') throw new LtiError(400, 'Không phải phản hồi chọn bài.');
  if (p[`${LTI_CLAIM}deployment_id`] !== tool.deploymentId) throw new LtiError(400, 'deployment_id không khớp.');
  const key = await deps.store.platformKey();
  let st: Json;
  try { st = await verifyJwt(str(p[`${DL_CLAIM}data`], 4000), key.publicJwk); } catch { throw new LtiError(400, 'Phiên chọn bài không hợp lệ. Thầy cô mở lại từ OPEN-EDU nhé.'); }
  if (st.typ !== 'lti-dl' || st.app !== tool.appId || Number(st.exp) < now) throw new LtiError(400, 'Phiên chọn bài đã hết hạn. Thầy cô mở lại từ OPEN-EDU nhé.');
  const ctxId = str(st.ctx, 200);
  const uid = str(st.uid, 80);
  if (!(await deps.store.canTeach(uid, ctxId))) throw new LtiError(403, 'Chỉ giáo viên của lớp mới giao bài cho lớp.', 'access_denied');
  const raw = Array.isArray(p[`${DL_CLAIM}content_items`]) ? (p[`${DL_CLAIM}content_items`] as unknown[]) : [];
  const items: LtiPageInput[] = [];
  for (const it of raw.slice(0, 50)) {
    if (typeof it !== 'object' || !it) continue;
    const c = it as Json;
    if (c.type !== 'ltiResourceLink') continue;
    const url = str(c.url, 1000);
    const li = typeof c.lineItem === 'object' && c.lineItem ? (c.lineItem as Json) : null;
    const max = li && typeof li.scoreMaximum === 'number' && li.scoreMaximum > 0 ? Math.min(li.scoreMaximum, 100000) : undefined;
    const iframe = typeof c.iframe === 'object' && c.iframe !== null;
    const win = typeof c.window === 'object' && c.window !== null;
    const custom = isStrMap(c.custom) ? Object.fromEntries(Object.entries(c.custom).slice(0, 30).map(([k, v]) => [k.slice(0, 60), String(v).slice(0, 500)])) : undefined;
    items.push({
      title: (str(c.title, 200) || str(li?.label, 200) || tool.name),
      ...(url && sameAppOrigin(tool, url) ? { url } : {}),
      ...(custom ? { custom } : {}),
      ...(max ? { scoreMaximum: max } : {}),
      ...(str(li?.resourceId, 200) ? { resourceId: str(li?.resourceId, 200) } : {}),
      ...(str(li?.tag, 200) ? { tag: str(li?.tag, 200) } : {}),
      openIn: win && !iframe ? 'window' : 'iframe',
    });
  }
  const created = items.length ? await deps.store.createPages(tool, ctxId, uid, items) : 0;
  const msg = str(p[`${DL_CLAIM}msg`], 300) || str(p[`${DL_CLAIM}errormsg`], 300);
  return { created, returnUrl: str(st.ret, 500), ...(msg ? { message: msg } : {}) };
}

/* ================================ xAPI ================================ */
const ISO_DUR = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
export function isoDurationSec(d: unknown): number | undefined {
  if (typeof d !== 'string') return undefined;
  const m = ISO_DUR.exec(d.trim());
  if (!m) return undefined;
  const sec = (Number(m[1] ?? 0) * 86400) + (Number(m[2] ?? 0) * 3600) + (Number(m[3] ?? 0) * 60) + Number(m[4] ?? 0);
  return Number.isFinite(sec) ? Math.min(86400, Math.round(sec)) : undefined;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid4(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function skillList(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : [];
  return [...new Set(arr.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => /^[A-Za-z0-9._-]{1,40}$/.test(x)))].slice(0, 10);
}

/** Kiểm tra một câu xAPI và đổi thành dòng lưu. Lỗi → LtiError 400. */
export function parseStatement(raw: unknown, userId: string, nowMs: number): XapiRow {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new LtiError(400, 'Câu xAPI phải là đối tượng JSON.');
  const s = raw as Json;
  const verb = s.verb as Json | undefined;
  const obj = s.object as Json | undefined;
  const verbId = str(verb?.id, 200);
  const objectId = str(obj?.id, 500);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(verbId)) throw new LtiError(400, 'verb.id phải là địa chỉ (IRI).');
  if (!objectId) throw new LtiError(400, 'Thiếu object.id.');
  const def = (obj?.definition ?? {}) as Json;
  const nameMap = (def.name ?? {}) as Json;
  const objectName = str(nameMap['vi-VN'] ?? nameMap.vi ?? nameMap['en-US'] ?? Object.values(nameMap)[0], 300);
  const res = (s.result ?? {}) as Json;
  const score = (res.score ?? {}) as Json;
  const scaledRaw = typeof score.scaled === 'number' && Number.isFinite(score.scaled) ? Math.max(-1, Math.min(1, score.scaled)) : undefined;
  const rawScore = typeof score.raw === 'number' && Number.isFinite(score.raw) ? score.raw : undefined;
  const maxScore = typeof score.max === 'number' && Number.isFinite(score.max) && score.max > 0 ? score.max : undefined;
  const scaled = scaledRaw ?? (rawScore !== undefined && maxScore ? Math.max(-1, Math.min(1, rawScore / maxScore)) : undefined);
  const ctxExt = ((s.context as Json | undefined)?.extensions ?? {}) as Json;
  const objExt = (def.extensions ?? {}) as Json;
  const skills = skillList(objExt[XAPI_SKILLS_EXT] ?? ctxExt[XAPI_SKILLS_EXT]);
  const id = typeof s.id === 'string' && UUID_RE.test(s.id) ? s.id.toLowerCase() : uuid4();
  const ts = Date.parse(str(s.timestamp, 40));
  const at = new Date(Number.isNaN(ts) ? nowMs : Math.min(Math.max(ts, nowMs - 30 * 86400_000), nowMs + 300_000)).toISOString();
  const text = JSON.stringify(s);
  if (text.length > 16000) throw new LtiError(413, 'Câu xAPI quá lớn (tối đa 16 KB).');
  // Lưu bản đã chuẩn hóa: người học luôn là người đã xác thực.
  const statement: Json = { ...s, id, actor: { objectType: 'Agent', account: { homePage: 'open-edu', name: userId } }, timestamp: at };
  return {
    id, userId, verb: verbId, objectId, objectName,
    ...(typeof res.success === 'boolean' ? { success: res.success } : {}),
    ...(scaled !== undefined ? { scaled } : {}),
    ...(rawScore !== undefined ? { raw: rawScore } : {}),
    ...(maxScore !== undefined ? { max: maxScore } : {}),
    ...(isoDurationSec(res.duration) !== undefined ? { durationSec: isoDurationSec(res.duration) } : {}),
    ...(typeof res.completion === 'boolean' ? { completion: res.completion } : {}),
    skills, statement, at,
  };
}

/** Câu trả lời → sự kiện học (tính mức thành thạo); hoàn thành có điểm → hoạt động ở app ngoài. */
export const xapiVerbKind = (verb: string): 'answered' | 'completed' | 'other' => {
  const v = verb.split(/[/#]/).pop()?.toLowerCase() ?? '';
  if (v === 'answered') return 'answered';
  if (['completed', 'passed', 'failed', 'scored', 'mastered'].includes(v)) return 'completed';
  return 'other';
};

async function xapi(deps: LtiDeps, req: Request, parts: string[]): Promise<Response> {
  const origin = req.headers.get('Origin') ?? '';
  const cors: Record<string, string> = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  if (parts[0] !== 'statements') throw new LtiError(404, 'Không có đường dẫn này.', 'not_found');
  if (req.method !== 'POST' && req.method !== 'PUT') throw new LtiError(405, 'Chỉ nhận POST / PUT.', 'method_not_allowed');
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new LtiError(401, 'Thiếu access token.', 'invalid_token');
  // 1) App có máy chủ: access token LTI (scope xapi); người học = actor.account.name (mã OPEN-EDU).
  // 2) Trang HTML: phiên đăng nhập OPEN-EDU của chính em (openedu-connect.js) + X-OpenEdu-App, origin phải được đăng kí.
  let appId = '';
  let forcedUser: string | null = null;
  const key = await deps.store.platformKey();
  let lti: Json | null = null;
  try { lti = await verifyJwt(token, key.publicJwk); } catch { lti = null; }
  const now = deps.now?.() ?? Date.now();
  if (lti) {
    if (lti.typ !== 'lti-access' || lti.iss !== deps.issuer || Number(lti.exp) < now / 1000) throw new LtiError(401, 'Access token đã hết hạn.', 'invalid_token');
    if (!str(lti.scope).split(' ').includes(SCOPE.xapi)) throw new LtiError(403, 'Access token không có quyền gửi xAPI.', 'insufficient_scope');
    const tool = await deps.store.tool(str(lti.sub, 80));
    if (!tool || !tool.enabled) throw new LtiError(401, 'Ứng dụng đã tắt.', 'invalid_token');
    appId = tool.appId;
  } else {
    const uid = await deps.authenticate(req);
    if (!uid) throw new LtiError(401, 'Phiên đăng nhập đã hết hạn.', 'invalid_token');
    const app = await deps.store.connectApp(str(req.headers.get('X-OpenEdu-App'), 40));
    if (!app || !app.enabled) throw new LtiError(403, 'Ứng dụng chưa được nhà trường đăng kí hoặc đã tắt.', 'forbidden');
    if (!origin || !app.allowedOrigins.includes(origin)) throw new LtiError(403, 'Địa chỉ trang này chưa được đăng kí cho ứng dụng.', 'forbidden');
    appId = app.appId;
    forcedUser = uid;
  }
  const text = await req.text();
  if (text.length > 512 * 1024) throw new LtiError(413, 'Dữ liệu quá lớn.');
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new LtiError(400, 'Dữ liệu không phải JSON.'); }
  const list = Array.isArray(body) ? body : [body];
  if (!list.length || list.length > 50) throw new LtiError(400, 'Gửi 1–50 câu xAPI mỗi lần.');
  const rows: XapiRow[] = [];
  for (const raw of list) {
    let uid = forcedUser;
    if (!uid) {
      const acc = ((raw as Json)?.actor as Json | undefined)?.account as Json | undefined;
      uid = str(acc?.name, 80);
      if (!uid) throw new LtiError(400, 'actor.account.name phải là mã học sinh OPEN-EDU (sub trong id_token).');
      const u = await deps.store.user(uid);
      if (!u || u.role !== 'student') throw new LtiError(403, 'Không thấy học sinh này.', 'forbidden');
    }
    const id = new URL(req.url).searchParams.get('statementId');
    rows.push(parseStatement(req.method === 'PUT' && id ? { ...(raw as Json), id } : raw, uid, now));
  }
  await deps.store.saveXapi(appId, rows);
  return json(rows.map((r) => r.id), 200, { ...cors, 'X-Experience-API-Version': '1.0.3' });
}

/* ================================ định tuyến ================================ */
/** Phần đường dẫn sau ".../lti". */
export function ltiPath(url: string): string[] {
  const p = new URL(url).pathname.replace(/^.*?\/lti(?=\/|$)/, '');
  return p.split('/').filter(Boolean);
}

export async function handleLti(req: Request, deps: LtiDeps): Promise<Response> {
  const parts = ltiPath(req.url);
  const cors = { 'Access-Control-Allow-Origin': deps.corsOrigin(req), 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
  try {
    const [head, ...rest] = parts;
    if (req.method === 'OPTIONS' && head !== 'xapi') return new Response('ok', { headers: cors });
    if (head === 'jwks' && req.method === 'GET') {
      const key = await deps.store.platformKey();
      return json({ keys: [key.publicJwk] }, 200, { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' });
    }
    if (head === 'authorize' && req.method === 'POST') {
      const uid = await deps.authenticate(req);
      if (!uid) throw new LtiError(401, 'Em cần đăng nhập OPEN-EDU trước nhé.', 'login_required');
      const b = await readJson(req, 16 * 1024);
      const out = await authorize(deps, uid, b as unknown as AuthorizeInput, str(b.return_url, 500) || undefined);
      return json(out, 200, cors);
    }
    if (head === 'token' && req.method === 'POST') {
      const text = await req.text();
      if (text.length > 16 * 1024) throw new LtiError(413, 'Dữ liệu quá lớn.');
      return json(await issueToken(deps, new URLSearchParams(text)));
    }
    if (head === 'ags') return await ags(deps, req, rest);
    if (head === 'xapi') {
      if (req.method === 'OPTIONS') return new Response('ok', { headers: xapiPreflight(req) });
      return await xapi(deps, req, rest);
    }
    if (head === 'deep-link' && req.method === 'POST') {
      const form = new URLSearchParams(await req.text());
      try {
        const r = await acceptDeepLink(deps, form.get('JWT') ?? '');
        if (/^https?:\/\//.test(r.returnUrl)) {
          const u = new URL(r.returnUrl);
          u.searchParams.set('lti_dl', String(r.created));
          return new Response(null, { status: 303, headers: { Location: u.toString(), 'Cache-Control': 'no-store' } });
        }
        return htmlPage('Đã giao bài', `Đã thêm ${r.created} bài vào Trang học của lớp. Thầy cô quay lại OPEN-EDU nhé.`);
      } catch (e) {
        if (e instanceof LtiError) return htmlPage('Chưa giao được bài', e.message, e.status);
        throw e;
      }
    }
    throw new LtiError(404, 'Không có đường dẫn này.', 'not_found');
  } catch (e) {
    const h: Record<string, string> = head0(parts) === 'authorize' ? cors : head0(parts) === 'xapi' && req.headers.get('Origin') ? { 'Access-Control-Allow-Origin': req.headers.get('Origin') as string, Vary: 'Origin' } : {};
    if (e instanceof LtiError) return json({ error: e.code, error_description: e.message }, e.status, h);
    console.error('lti', e);
    return json({ error: 'server_error', error_description: 'Máy chủ đang bận, thử lại sau.' }, 500, h);
  }
}
const head0 = (p: string[]) => p[0] ?? '';
/** Preflight của /xapi: trang HTML ở origin bất kì (kiểm origin thật khi gửi). */
function xapiPreflight(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': req.headers.get('Origin') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-openedu-app, x-experience-api-version',
    'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/* ================================ trình duyệt ================================ */
/**
 * Địa chỉ mở app ngoài (bước 1 của luồng đăng nhập). hint: mã lớp, 'page:<mã trang>' hoặc 'dl:<mã lớp>'.
 * storageTarget: '_parent' khi mở trong khung của OPEN-EDU (app lưu state qua nền tảng, không cần cookie bên thứ ba).
 */
export function launchStartUrl(
  tool: Pick<LtiTool, 'loginUrl' | 'launchUrl' | 'clientId' | 'deploymentId'> & { deepLinkUrl?: string | null },
  issuer: string, userId: string, hint?: string, opts: { targetLinkUri?: string; storageTarget?: string } = {},
): string {
  const u = new URL(tool.loginUrl);
  const target = opts.targetLinkUri ?? (hint?.startsWith('dl:') && tool.deepLinkUrl ? tool.deepLinkUrl : tool.launchUrl);
  u.searchParams.set('iss', issuer);
  u.searchParams.set('login_hint', userId);
  u.searchParams.set('target_link_uri', target);
  u.searchParams.set('client_id', tool.clientId);
  u.searchParams.set('lti_deployment_id', tool.deploymentId);
  if (hint) u.searchParams.set('lti_message_hint', hint);
  if (opts.storageTarget) u.searchParams.set('lti_storage_target', opts.storageTarget);
  return u.toString();
}

/** Cấu hình cho app ngoài (dán vào lti_config.json của pylti1p3). */
export function toolConfigJson(issuer: string, authLoginUrl: string, tool: Pick<LtiTool, 'clientId' | 'deploymentId'>): Json {
  return {
    [issuer]: [{
      default: true,
      client_id: tool.clientId,
      auth_login_url: authLoginUrl,
      auth_token_url: `${issuer}/token`,
      auth_audience: `${issuer}/token`,
      key_set_url: `${issuer}/jwks`,
      key_set: null,
      private_key_file: 'private.key',
      public_key_file: 'public.key',
      deployment_ids: [tool.deploymentId],
    }],
  };
}

export { randomId };
