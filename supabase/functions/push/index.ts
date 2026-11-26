/**
 * Edge Function `push` — gửi thông báo đẩy (web push) cho các máy đã bật "Nhận thông báo trên điện thoại" (SQL 23).
 *
 *   GET  → { publicKey }  Khoá VAPID công khai để trình duyệt đăng kí. Lần đầu tự sinh cặp khoá và lưu vào v2.push_config.
 *   POST → gửi hàng đợi v2.notifications (push_state = 'pending', đến giờ). Chỉ CSDL gọi (pg_net, header x-openedu-push).
 *
 * CSDL tự gọi hàm này khi có thông báo mới (trigger) và mỗi phút (pg_cron). Không cần khoá bí mật nào ngoài các biến
 * Supabase tự cấp (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 * Triển khai:  npx supabase@latest functions deploy push --project-ref <ref> --no-verify-jwt --use-api
 * Rồi chạy một lần trong SQL Editor:  select v2.push_setup('https://<ref>.supabase.co/functions/v1/push');
 */
import { adminClient, env } from '../_shared/supabase.ts';
import { generateVapidKeys, pushMessage, pushTopic, sendPush, type ClaimedNotification, type VapidKeys } from '../_shared/webpush/index.ts';

interface KeyRow { publicKey: string | null; privateKey: string | null; subject: string | null; hookToken: string | null; url: string | null }

const URGENT = new Set(['ph-chuyen-can', 'ph-tin-nhan', 'gv-tin-nhan', 'hs-giai-dau', 'thu']);
let cached: (VapidKeys & { hookToken: string }) | null = null;

async function loadKeys(): Promise<VapidKeys & { hookToken: string }> {
  if (cached) return cached;
  const db = adminClient();
  const got = await db.rpc('push_keys_get');
  if (got.error) throw new Error(`db: ${got.error.message}`);
  let k = got.data as KeyRow;
  if (!k?.publicKey || !k?.privateKey) {
    const g = await generateVapidKeys();
    const set = await db.rpc('push_keys_set', { p_public: g.publicKey, p_private: g.privateKey });
    if (set.error) throw new Error(`db: ${set.error.message}`);
    k = set.data as KeyRow;
  }
  cached = {
    publicKey: k.publicKey!,
    privateKey: k.privateKey!,
    subject: k.subject || new URL(env('SUPABASE_URL')).origin,
    hookToken: k.hookToken ?? '',
  };
  return cached;
}

/** Chạy các việc với số luồng song song giới hạn. */
async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

async function flush(keys: VapidKeys): Promise<{ batches: number; sent: number; retry: number; gone: number }> {
  const db = adminClient();
  const started = Date.now();
  const total = { batches: 0, sent: 0, retry: 0, gone: 0 };
  while (Date.now() - started < 25_000) {
    const claim = await db.rpc('push_claim', { p_limit: 100 });
    if (claim.error) throw new Error(`db: ${claim.error.message}`);
    const rows = (claim.data ?? []) as ClaimedNotification[];
    if (!rows.length) break;
    total.batches++;
    const sent: number[] = [];
    const retry: number[] = [];
    const failed: number[] = [];
    const gone = new Set<string>();
    const ok = new Set<string>();
    await pool(rows, 10, async (n) => {
      if (!n.subs.length) { sent.push(n.id); return; }
      const topic = await pushTopic(n.tag);
      const results = await Promise.all(n.subs.map(async (s) => {
        const r = await sendPush(s, pushMessage(n, s), keys, { topic, urgency: URGENT.has(n.kind) ? 'high' : 'normal', ttlSeconds: 2 * 86_400 });
        if (r.outcome === 'gone') gone.add(s.id);
        if (r.outcome === 'ok') ok.add(s.id);
        return r.outcome;
      }));
      if (results.includes('ok')) sent.push(n.id);
      else if (results.includes('retry')) retry.push(n.id);
      else if (results.every((o) => o === 'gone')) sent.push(n.id);
      else failed.push(n.id);
    });
    const done = await db.rpc('push_done', { p: { sent, retry, failed, gone: [...gone], ok: [...ok] } });
    if (done.error) throw new Error(`db: ${done.error.message}`);
    total.sent += sent.length;
    total.retry += retry.length;
    total.gone += gone.size;
  }
  return total;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const keys = await loadKeys();
    if (req.method === 'GET') return json({ publicKey: keys.publicKey });
    if (req.method !== 'POST') return json({ error: 'Phương thức không hỗ trợ.' }, 405);
    if (!keys.hookToken || req.headers.get('x-openedu-push') !== keys.hookToken) {
      return json({ error: 'Chỉ cơ sở dữ liệu của trường gọi được.' }, 401);
    }
    return json(await flush(keys));
  } catch (e) {
    cached = null;
    console.error('push', e);
    return json({ error: 'Chưa gửi được thông báo.' }, 500);
  }
});
