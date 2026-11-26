/**
 * Thông báo (SQL 23): chuông trong app + đăng kí thông báo đẩy.
 *  - Supabase: RPC notify_* / push_*; tin mới đến qua Realtime (bảng v2.notifications), dự phòng tải lại định kì.
 *  - Demo: lưu trên trình duyệt (notify/demo.ts); không có thông báo đẩy.
 */
import type { DataSource, NotifyList, NotifyPrefs, Profile, PushInfo } from '@openedu/contracts';
import { getSupabaseClient } from '../supabase/client';
import { readEnv } from '../env';
import { parentHubError } from '../parenthub/errors';
import { demoNotify } from './demo';

export interface PushKeys { endpoint: string; p256dh: string; auth: string }

export interface NotifySource {
  list(limit?: number, before?: number): Promise<NotifyList>;
  read(ids?: number[]): Promise<number>;
  prefs(): Promise<NotifyPrefs>;
  savePrefs(p: Partial<Omit<NotifyPrefs, 'devices'>>): Promise<NotifyPrefs>;
  pushInfo(): Promise<PushInfo>;
  /** Khoá VAPID công khai (lần đầu nhờ hàm push sinh). null = trường chưa bật thông báo đẩy. */
  publicKey(): Promise<string | null>;
  subscribe(keys: PushKeys, app: 'hoc' | 'gv'): Promise<NotifyPrefs>;
  unsubscribe(endpoint?: string): Promise<number>;
  test(): Promise<number>;
  /** Nghe tin mới của người dùng; trả về hàm huỷ. */
  watch(userId: string, onChange: () => void): () => void;
}

class SupabaseNotify implements NotifySource {
  private async rpc<T>(fn: string, args: Record<string, unknown>, vi: string): Promise<T> {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw parentHubError(error, vi);
    return data as T;
  }
  async list(limit = 50, before?: number) {
    const r = await this.rpc<NotifyList>('notify_list', { p_limit: limit, p_before: before ?? null }, 'Chưa tải được thông báo.');
    return { unread: r.unread ?? 0, items: r.items ?? [] };
  }
  async read(ids?: number[]) { return this.rpc<number>('notify_read', { p_ids: ids ?? null }, 'Chưa đánh dấu được.'); }
  async prefs() { return this.rpc<NotifyPrefs>('notify_prefs_get', {}, 'Chưa tải được cài đặt thông báo.'); }
  async savePrefs(p: Partial<NotifyPrefs>) { return this.rpc<NotifyPrefs>('notify_prefs_save', { p }, 'Chưa lưu được cài đặt thông báo.'); }
  async pushInfo() { return this.rpc<PushInfo>('push_info', {}, 'Chưa kiểm tra được thông báo đẩy.'); }
  async publicKey() {
    const info = await this.pushInfo();
    if (!info.ready) return null;
    if (info.publicKey) return info.publicKey;
    const url = readEnv('VITE_SUPABASE_URL');
    const key = readEnv('VITE_SUPABASE_ANON_KEY');
    try {
      const r = await fetch(`${url}/functions/v1/push`, { headers: { apikey: key ?? '' } });
      if (!r.ok) return null;
      return ((await r.json()) as { publicKey?: string }).publicKey ?? null;
    } catch { return null; }
  }
  async subscribe(keys: PushKeys, app: 'hoc' | 'gv') {
    return this.rpc<NotifyPrefs>('push_subscribe', { p: { ...keys, app, ua: globalThis.navigator?.userAgent?.slice(0, 300) } }, 'Chưa bật được thông báo trên máy này.');
  }
  async unsubscribe(endpoint?: string) { return this.rpc<number>('push_unsubscribe', { p_endpoint: endpoint ?? null }, 'Chưa tắt được.'); }
  async test() { return this.rpc<number>('notify_test', {}, 'Chưa gửi được thông báo thử.'); }
  watch(userId: string, onChange: () => void) {
    let off = () => undefined as void;
    let closed = false;
    void getSupabaseClient().then((sb) => {
      if (closed) return;
      const ch = sb.channel(`notify:${userId}:${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes', { event: '*', schema: 'v2', table: 'notifications', filter: `user_id=eq.${userId}` }, () => onChange())
        .subscribe();
      off = () => { void sb.removeChannel(ch); };
    }).catch(() => undefined);
    return () => { closed = true; off(); };
  }
}

class DemoNotify implements NotifySource {
  constructor(private ds: DataSource) {}
  private async me(): Promise<Profile> {
    const u = await this.ds.getCurrentUser();
    if (!u) throw new Error('Cần đăng nhập trước.');
    return u;
  }
  async list(limit = 50) {
    const all = demoNotify.list(await this.me());
    return { unread: all.filter((x) => !x.readAt).length, items: all.slice(0, limit) };
  }
  async read(ids?: number[]) { return demoNotify.read((await this.me()).id, ids); }
  async prefs() { return demoNotify.prefs((await this.me()).id); }
  async savePrefs(p: Partial<NotifyPrefs>) {
    if ((p.quietFrom === null) !== (p.quietTo === null) && 'quietFrom' in p && 'quietTo' in p) throw new Error('Cần cả giờ bắt đầu và giờ kết thúc.');
    return demoNotify.savePrefs((await this.me()).id, p);
  }
  async pushInfo() { return { ready: false, publicKey: null, devices: 0 }; }
  async publicKey() { return null; }
  async subscribe(): Promise<NotifyPrefs> { throw new Error('Bản demo không gửi thông báo đẩy.'); }
  async unsubscribe() { return 0; }
  async test() {
    const u = await this.me();
    demoNotify.add([u.id], { kind: 'thu', title: 'Thông báo thử của OPEN-EDU', body: 'Thấy dòng này là chuông đã hoạt động.', link: '/', ref: {} });
    return 1;
  }
  watch(_userId: string, onChange: () => void) { return demoNotify.subscribe(onChange); }
}

const cache = new WeakMap<DataSource, NotifySource>();
export function getNotify(ds: DataSource): NotifySource {
  let s = cache.get(ds);
  if (!s) {
    s = ds.mode === 'demo' ? new DemoNotify(ds) : new SupabaseNotify();
    cache.set(ds, s);
  }
  return s;
}
