/**
 * Edge Function `lti` — OPEN-EDU làm nền tảng LTI 1.3 (docs/KET_NOI_LTI.md).
 * Mã giao thức nằm ở _shared/lti (chép từ packages/data/src/lti bằng tools/sync-scoring.mjs, có kiểm thử, kể cả
 * kiểm thử đầu-cuối với pylti1p3 thật). Tệp này chỉ cắm kho dữ liệu Supabase (service role) vào.
 *
 * config.toml: verify_jwt = false — app ngoài gọi /jwks, /token, /ags không có JWT Supabase; /authorize tự kiểm
 * JWT đăng nhập của học sinh. Triển khai:
 *   npx supabase@latest functions deploy lti --project-ref <ref> --no-verify-jwt --use-api
 * Biến môi trường (không bắt buộc): LTI_ISSUER (mặc định <SUPABASE_URL>/functions/v1/lti), CORS_ORIGINS, STUDENT_EMAIL_DOMAIN.
 * ⚠ Chưa chạy trên project Supabase thật.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsAllow } from '../_shared/http.ts';
import { adminClient, env } from '../_shared/supabase.ts';
import { refreshMastery } from '../_shared/mastery-store.ts';
import {
  generateKeyPair, handleLti, pemToJwk,
  xapiVerbKind,
  type LtiContext, type LtiLineItem, type LtiPage, type LtiPageInput, type LtiResult, type LtiScore, type LtiStore, type LtiTool, type LtiUser, type XapiRow,
} from '../_shared/lti/index.ts';

const DOMAIN = (Deno.env.get('STUDENT_EMAIL_DOMAIN') ?? 'openlms.edu').toLowerCase();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PgErr { message: string }
function check<T>(r: { data: T; error: PgErr | null }): T {
  if (r.error) throw new Error(`db: ${r.error.message}`);
  return r.data;
}

interface LtiCfg { clientId: string; deploymentId: string; loginUrl: string; launchUrl: string; deepLinkUrl?: string; redirectUris?: string[]; jwksUrl?: string; publicKey?: string }
interface AppRow { id: string; name: string; enabled: boolean; lti: LtiCfg | null }
interface LiRow { id: string; app_id: string; class_id: string; label: string; score_maximum: number | string; resource_link_id: string | null; resource_id: string | null; tag: string | null }

const keyCache = new Map<string, JsonWebKey>();
async function toolKey(text: string | undefined): Promise<JsonWebKey | undefined> {
  const t = (text ?? '').trim();
  if (!t) return undefined;
  const hit = keyCache.get(t);
  if (hit) return hit;
  let jwk: JsonWebKey;
  if (t.startsWith('{')) jwk = JSON.parse(t) as JsonWebKey;
  else jwk = await pemToJwk(t);
  keyCache.set(t, jwk);
  return jwk;
}

async function toTool(r: AppRow | null): Promise<LtiTool | null> {
  if (!r || !r.lti) return null;
  const c = r.lti;
  const publicJwk = await toolKey(c.publicKey).catch(() => undefined);
  return {
    appId: r.id, name: r.name, enabled: r.enabled, clientId: c.clientId, deploymentId: c.deploymentId,
    loginUrl: c.loginUrl, launchUrl: c.launchUrl, redirectUris: Array.isArray(c.redirectUris) ? c.redirectUris : [],
    ...(c.jwksUrl ? { jwksUrl: c.jwksUrl } : {}), ...(publicJwk ? { publicJwk } : {}), ...(c.deepLinkUrl ? { deepLinkUrl: c.deepLinkUrl } : {}),
  };
}

const toLi = (r: LiRow): LtiLineItem => ({
  id: r.id, appId: r.app_id, contextId: r.class_id, label: r.label, scoreMaximum: Number(r.score_maximum),
  ...(r.resource_link_id ? { resourceLinkId: r.resource_link_id } : {}), ...(r.resource_id ? { resourceId: r.resource_id } : {}), ...(r.tag ? { tag: r.tag } : {}),
});
const LI_COLS = 'id,app_id,class_id,label,score_maximum,resource_link_id,resource_id,tag';

let cachedKey: { privateJwk: JsonWebKey; publicJwk: JsonWebKey; kid: string } | null = null;

class SupabaseLtiStore implements LtiStore {
  private db = adminClient();

  async platformKey() {
    if (cachedKey) return cachedKey;
    const read = async () => check(await this.db.from('lti_platform_keys').select('kid,private_jwk,public_jwk').eq('id', 1).maybeSingle()) as { kid: string; private_jwk: JsonWebKey; public_jwk: JsonWebKey } | null;
    let row = await read();
    if (!row) {
      const k = await generateKeyPair();
      // Hai máy chủ cùng tạo: chỉ một bản thắng (khóa chính id = 1), rồi cả hai đọc lại.
      await this.db.from('lti_platform_keys').upsert({ id: 1, kid: k.kid, private_jwk: k.privateJwk, public_jwk: k.publicJwk }, { onConflict: 'id', ignoreDuplicates: true });
      row = await read();
      if (!row) throw new Error('Chưa tạo được khóa LTI.');
    }
    cachedKey = { kid: row.kid, privateJwk: row.private_jwk, publicJwk: row.public_jwk };
    return cachedKey;
  }

  async toolByClientId(clientId: string) {
    const r = check(await this.db.from('external_apps').select('id,name,enabled,lti').eq('lti->>clientId', clientId).maybeSingle()) as AppRow | null;
    return toTool(r);
  }
  async tool(appId: string) {
    const r = check(await this.db.from('external_apps').select('id,name,enabled,lti').eq('id', appId).maybeSingle()) as AppRow | null;
    return toTool(r);
  }

  async user(id: string): Promise<LtiUser | null> {
    if (!UUID.test(id)) return null;
    const p = check(await this.db.from('profiles').select('id,name,role,username,grade').eq('id', id).maybeSingle()) as { id: string; name: string; role: LtiUser['role']; username: string | null; grade: number | null } | null;
    if (!p) return null;
    let email: string | undefined;
    if (p.role === 'student' && p.username) email = `${p.username}@${DOMAIN}`;
    else {
      const { data } = await this.db.auth.admin.getUserById(id);
      email = data.user?.email ?? undefined;
    }
    return { id: p.id, name: p.name, role: p.role, ...(p.username ? { username: p.username } : {}), ...(email ? { email } : {}), grade: p.grade };
  }

  async context(id: string): Promise<LtiContext | null> {
    const c = check(await this.db.from('classes').select('id,name,grade').eq('id', id).maybeSingle()) as LtiContext | null;
    return c;
  }

  async contextsOf(uid: string): Promise<LtiContext[]> {
    const u = await this.user(uid);
    if (!u) return [];
    let ids: string[] = [];
    if (u.role === 'admin') {
      const all = check(await this.db.from('classes').select('id,name,grade').order('name').limit(300)) as LtiContext[];
      return all;
    }
    if (u.role === 'student') {
      const m = check(await this.db.from('class_members').select('class_id').eq('user_id', uid).eq('role', 'student')) as { class_id: string }[];
      const p = check(await this.db.from('profiles').select('class_id').eq('id', uid).maybeSingle()) as { class_id: string | null } | null;
      ids = [...(p?.class_id ? [p.class_id] : []), ...m.map((x) => x.class_id)];
    } else if (u.role === 'teacher') {
      const own = check(await this.db.from('classes').select('id').eq('teacher_id', uid)) as { id: string }[];
      const m = check(await this.db.from('class_members').select('class_id').eq('user_id', uid).eq('role', 'teacher')) as { class_id: string }[];
      ids = [...own.map((x) => x.id), ...m.map((x) => x.class_id)];
    }
    ids = [...new Set(ids)];
    if (!ids.length) return [];
    const rows = check(await this.db.from('classes').select('id,name,grade').in('id', ids)) as LtiContext[];
    return ids.map((id) => rows.find((r) => r.id === id)).filter((x): x is LtiContext => !!x);
  }

  async isLearner(uid: string, ctx: string): Promise<boolean> {
    if (!UUID.test(uid)) return false;
    const m = check(await this.db.from('class_members').select('user_id').eq('class_id', ctx).eq('user_id', uid).eq('role', 'student').maybeSingle());
    if (m) return true;
    const p = check(await this.db.from('profiles').select('id').eq('id', uid).eq('class_id', ctx).eq('role', 'student').maybeSingle());
    return !!p;
  }

  async lineItems(appId: string, ctx: string) {
    return (check(await this.db.from('lti_lineitems').select(LI_COLS).eq('app_id', appId).eq('class_id', ctx).order('created_at').limit(500)) as LiRow[]).map(toLi);
  }
  async lineItem(id: string) {
    if (!UUID.test(id)) return null;
    const r = check(await this.db.from('lti_lineitems').select(LI_COLS).eq('id', id).maybeSingle()) as LiRow | null;
    return r ? toLi(r) : null;
  }
  async createLineItem(li: Omit<LtiLineItem, 'id'>) {
    const r = check(await this.db.from('lti_lineitems').insert({
      app_id: li.appId, class_id: li.contextId, label: li.label.slice(0, 200), score_maximum: li.scoreMaximum,
      resource_link_id: li.resourceLinkId ?? null, resource_id: li.resourceId ?? null, tag: li.tag ?? null,
    }).select(LI_COLS).single()) as LiRow;
    return toLi(r);
  }

  async saveScore(li: LtiLineItem, s: LtiScore, tool: LtiTool) {
    const max = s.scoreMaximum !== undefined ? Math.min(Math.max(s.scoreMaximum, 0), 100000) : null;
    const score = s.scoreGiven !== undefined ? Math.min(Math.max(s.scoreGiven, 0), max ?? 100000) : null;
    const at = new Date(Math.min(Math.max(Date.parse(s.timestamp), Date.now() - 30 * 86400_000), Date.now() + 300_000)).toISOString();
    check(await this.db.from('external_activities').upsert({
      user_id: s.userId, app_id: tool.appId, client_id: `lti:${li.id}`.slice(0, 80),
      activity_id: (li.resourceId ?? li.tag ?? li.id).slice(0, 120), title: li.label.slice(0, 200), kind: 'lti',
      score, max_score: max, completed: s.activityProgress === 'Completed' || s.activityProgress === 'Submitted',
      detail: { comment: s.comment ?? '', activityProgress: s.activityProgress, gradingProgress: s.gradingProgress, lineItem: li.id, classId: li.contextId },
      at,
    }, { onConflict: 'app_id,user_id,client_id' }));
  }

  async results(li: LtiLineItem, userId?: string): Promise<LtiResult[]> {
    let q = this.db.from('external_activities').select('user_id,score,max_score,detail').eq('app_id', li.appId).eq('client_id', `lti:${li.id}`.slice(0, 80));
    if (userId) q = q.eq('user_id', userId);
    const rows = check(await q.limit(1000)) as { user_id: string; score: number | null; max_score: number | null; detail: { comment?: string } }[];
    return rows.map((r) => ({
      userId: r.user_id,
      ...(r.score !== null && r.max_score ? { resultScore: (Number(r.score) / Number(r.max_score)) * li.scoreMaximum } : {}),
      resultMaximum: li.scoreMaximum,
      ...(r.detail?.comment ? { comment: r.detail.comment } : {}),
    }));
  }

  async rememberJti(key: string, expiresAt: number) {
    const ok = check(await this.db.rpc('lti_remember_jti', { p_key: key, p_expires: new Date(expiresAt * 1000).toISOString() })) as boolean;
    return ok === true;
  }

  async canTeach(uid: string, ctx: string): Promise<boolean> {
    const u = await this.user(uid);
    if (!u) return false;
    if (u.role === 'admin') return true;
    if (u.role !== 'teacher') return false;
    const own = check(await this.db.from('classes').select('id').eq('id', ctx).eq('teacher_id', uid).maybeSingle());
    if (own) return true;
    return !!check(await this.db.from('class_members').select('user_id').eq('class_id', ctx).eq('user_id', uid).eq('role', 'teacher').maybeSingle());
  }

  async page(id: string): Promise<LtiPage | null> {
    if (!UUID.test(id)) return null;
    const r = check(await this.db.from('class_pages').select('id,class_id,app_id,title,url,lti,kind,hidden').eq('id', id).maybeSingle()) as
      { id: string; class_id: string; app_id: string | null; title: string; url: string | null; kind: string; hidden: boolean; lti: { custom?: Record<string, string>; lineItem?: { scoreMaximum?: number; resourceId?: string; tag?: string } } } | null;
    if (!r || r.kind !== 'lti' || !r.app_id || r.hidden) return null;
    const li = r.lti?.lineItem ?? {};
    return {
      id: r.id, contextId: r.class_id, appId: r.app_id, title: r.title,
      ...(r.url ? { url: r.url } : {}), ...(r.lti?.custom ? { custom: r.lti.custom } : {}),
      ...(typeof li.scoreMaximum === 'number' ? { scoreMaximum: li.scoreMaximum } : {}),
      ...(li.resourceId ? { resourceId: li.resourceId } : {}), ...(li.tag ? { tag: li.tag } : {}),
    };
  }

  async createPages(tool: LtiTool, ctx: string, uid: string, items: LtiPageInput[]): Promise<number> {
    const rows = items.map((it, i) => ({
      class_id: ctx, title: it.title, kind: 'lti', app_id: tool.appId, url: it.url ?? null, open_in: it.openIn, created_by: uid, position: i,
      lti: { ...(it.custom ? { custom: it.custom } : {}), lineItem: { ...(it.scoreMaximum ? { scoreMaximum: it.scoreMaximum } : {}), ...(it.resourceId ? { resourceId: it.resourceId } : {}), ...(it.tag ? { tag: it.tag } : {}) } },
    }));
    const data = check(await this.db.from('class_pages').insert(rows).select('id')) as { id: string }[];
    return data.length;
  }

  async connectApp(appId: string) {
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(appId)) return null;
    const r = check(await this.db.from('external_apps').select('id,enabled,allowed_origins').eq('id', appId).maybeSingle()) as { id: string; enabled: boolean; allowed_origins: string[] } | null;
    return r ? { appId: r.id, enabled: r.enabled, allowedOrigins: r.allowed_origins ?? [] } : null;
  }

  async saveXapi(appId: string, rows: XapiRow[]): Promise<void> {
    // Giới hạn: 3000 câu / HS / ngày.
    for (const uid of [...new Set(rows.map((r) => r.userId))]) {
      const since = new Date(Date.now() - 86400_000).toISOString();
      const { count } = await this.db.from('xapi_statements').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('stored', since);
      if ((count ?? 0) + rows.length > 3000) throw new Error('db: quá nhiều xAPI trong ngày');
    }
    check(await this.db.from('xapi_statements').upsert(rows.map((r) => ({
      id: r.id, user_id: r.userId, app_id: appId, verb: r.verb, object_id: r.objectId, object_name: r.objectName,
      success: r.success ?? null, score_scaled: r.scaled ?? null, duration_sec: r.durationSec ?? null, skills: r.skills, statement: r.statement, at: r.at,
    })), { onConflict: 'id', ignoreDuplicates: true }));
    // Câu trả lời có kĩ năng → sự kiện học 'external' → tính lại mức thành thạo.
    const answers = rows.filter((r) => xapiVerbKind(r.verb) === 'answered' && typeof r.success === 'boolean');
    if (answers.length) {
      check(await this.db.from('learning_events').insert(answers.map((r) => ({
        user_id: r.userId, verb: 'answered', object_type: 'external', object_id: `xapi:${r.id}`.slice(0, 128), at: r.at,
        result: { correct: r.success, ...(r.scaled !== undefined ? { score: Math.max(0, r.scaled) } : {}), skills: r.skills, app: appId, object: r.objectId.slice(0, 300), ...(r.durationSec !== undefined ? { durationMs: r.durationSec * 1000 } : {}) },
      }))));
      const bySkill = new Map<string, string[]>();
      for (const r of answers) if (r.skills.length) bySkill.set(r.userId, [...(bySkill.get(r.userId) ?? []), ...r.skills]);
      for (const [uid, skills] of bySkill) await refreshMastery(this.db, uid, skills);
    }
    // Hoàn thành có điểm → hồ sơ "hoạt động ở ứng dụng khác".
    for (const r of rows.filter((x) => xapiVerbKind(x.verb) === 'completed')) {
      const max = r.max ?? (r.scaled !== undefined ? 100 : null);
      const score = r.raw ?? (r.scaled !== undefined ? Math.max(0, r.scaled) * 100 : null);
      check(await this.db.from('external_activities').upsert({
        user_id: r.userId, app_id: appId, client_id: `xapi:${r.objectId}`.slice(0, 80), activity_id: r.objectId.slice(0, 120), title: (r.objectName || r.objectId).slice(0, 200), kind: 'xapi',
        score, max_score: max, duration_sec: r.durationSec ?? null, completed: r.completion ?? true, skills: r.skills, at: r.at,
        detail: { verb: r.verb, success: r.success ?? null },
      }, { onConflict: 'app_id,user_id,client_id' }));
    }
  }
}

const store = new SupabaseLtiStore();
const issuer = (Deno.env.get('LTI_ISSUER') ?? `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/lti`).replace(/\/+$/, '');

async function authenticate(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const c = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

/** Tải JWKS của app ngoài: chỉ https (hoặc localhost), tối đa 5 giây, 64 KB. */
async function fetchJson(url: string): Promise<unknown> {
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) throw new Error('JWKS phải là https');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    const text = await r.text();
    if (!r.ok || text.length > 65536) throw new Error(`JWKS ${r.status}`);
    return JSON.parse(text);
  } finally { clearTimeout(t); }
}

Deno.serve((req) => handleLti(req, {
  store,
  issuer,
  authenticate,
  fetchJson,
  corsOrigin: (r) => corsAllow(r.headers.get('Origin') ?? '', Deno.env.get('CORS_ORIGINS')),
}));
