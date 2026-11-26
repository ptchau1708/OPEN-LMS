/**
 * Thông báo đẩy phía trình duyệt: kiểm tra máy hỗ trợ, xin quyền, đăng kí với dịch vụ đẩy, báo máy chủ.
 * iPhone/iPad: cần iOS 16.4+ và mở app từ biểu tượng trên Màn hình chính (Safari → Chia sẻ → Thêm vào MH chính).
 */
import { b64url, fromB64url } from '../webpush/webpush';
import type { NotifySource } from './source';

export type PushState = 'on' | 'off' | 'denied' | 'unsupported' | 'ios-home' ;

interface Env { nav: Navigator | undefined; win: (Window & typeof globalThis) | undefined }
const env = (): Env => ({ nav: globalThis.navigator, win: (globalThis as { window?: Window & typeof globalThis }).window });

export function isIos(): boolean {
  const n = env().nav;
  if (!n) return false;
  return /iPad|iPhone|iPod/.test(n.userAgent) || (n.platform === 'MacIntel' && (n.maxTouchPoints ?? 0) > 1);
}

export function isStandalone(): boolean {
  const { nav, win } = env();
  return !!(win?.matchMedia?.('(display-mode: standalone)').matches || (nav as Navigator & { standalone?: boolean } | undefined)?.standalone);
}

export function pushSupported(): boolean {
  const { nav, win } = env();
  return !!(nav && 'serviceWorker' in nav && win && 'PushManager' in win && 'Notification' in win);
}

/** Trạng thái hiện tại trên máy này (không hỏi quyền). */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'ios-home' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const nav = env().nav;
  if (!nav?.serviceWorker) return null;
  const ready = nav.serviceWorker.ready;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
  return (await Promise.race([ready, timeout])) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function keysOf(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const p = sub.getKey('p256dh');
  const a = sub.getKey('auth');
  if (!p || !a) throw new Error('Trình duyệt chưa cấp khoá nhận thông báo.');
  return { endpoint: sub.endpoint, p256dh: b64url(new Uint8Array(p)), auth: b64url(new Uint8Array(a)) };
}

export type EnableResult = 'on' | 'denied' | 'unsupported' | 'ios-home' | 'not-ready';

/** Bật thông báo đẩy (gọi trong sự kiện bấm nút — iPhone chỉ cho xin quyền lúc người dùng bấm). */
export async function enablePush(src: NotifySource, app: 'hoc' | 'gv'): Promise<EnableResult> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'ios-home' : 'unsupported';
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const key = await src.publicKey();
  if (!key) return 'not-ready';
  const reg = await registration();
  if (!reg) return 'unsupported';
  let sub = await reg.pushManager.getSubscription();
  // Khoá máy chủ đổi (hiếm) → đăng kí lại.
  const cur = sub?.options?.applicationServerKey;
  if (sub && cur && b64url(new Uint8Array(cur)) !== key) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(key) as unknown as BufferSource });
  await src.subscribe(keysOf(sub), app);
  return 'on';
}

/** Tắt trên máy này: bỏ đăng kí ở máy chủ và ở trình duyệt. */
export async function disablePush(src: NotifySource): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    await src.unsubscribe(sub.endpoint).catch(() => 0);
    await sub.unsubscribe().catch(() => false);
  }
}

/** Mở app: nếu máy đã bật thông báo, báo lại máy chủ (đổi tài khoản trên máy dùng chung, khoá trình duyệt đổi). */
export async function syncPush(src: NotifySource, app: 'hoc' | 'gv'): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await src.subscribe(keysOf(sub), app).catch(() => undefined);
}

/** Đăng xuất: máy này thôi nhận thông báo của tài khoản vừa thoát (giữ đăng kí trình duyệt cho người khác). */
export async function forgetPushOnSignOut(src: NotifySource): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (sub) await src.unsubscribe(sub.endpoint);
  } catch { /* không chặn đăng xuất */ }
}

/** Số trên biểu tượng app (Android / iPhone hỗ trợ). */
export function setAppBadge(n: number): void {
  const nav = env().nav as (Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }) | undefined;
  try {
    if (n > 0) void nav?.setAppBadge?.(n).catch(() => undefined);
    else void nav?.clearAppBadge?.().catch(() => undefined);
  } catch { /* bỏ qua */ }
}
