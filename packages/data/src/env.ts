/**
 * Đọc biến môi trường Vite một cách an toàn: chạy được trong Vite (import.meta.env), trong Vitest/Node
 * (import.meta.env có thể thiếu) và cho phép ghi đè khi kiểm thử qua setEnvOverrides().
 */
export type EnvName =
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_ANON_KEY'
  | 'VITE_DATA_MODE'
  | 'VITE_RELAY_URL'
  | 'VITE_CONTENT_ORIGIN'
  | 'VITE_STUDENT_EMAIL_DOMAIN'
  /** CHỈ DEMO: khóa OpenRouter gọi thẳng từ trình duyệt (lộ khóa cho người dùng máy đó — không dùng thật). */
  | 'VITE_DEMO_AI_KEY'
  | 'VITE_DEMO_AI_MODEL'
  /** CHỈ DEMO/KIỂM THỬ: '1' = bọc DemoDataSource trong lớp "mạng giả" + OfflineAwareDataSource (docs/PHASE6_OFFLINE.md). */
  | 'VITE_OFFLINE_SIM';

let overrides: Partial<Record<EnvName, string | undefined>> = {};

/** Chỉ dùng trong kiểm thử. */
export function setEnvOverrides(o: Partial<Record<EnvName, string | undefined>>): void {
  overrides = { ...o };
}

function viteEnv(): Record<string, unknown> {
  try {
    // Vite thay import.meta.env bằng object chứa mọi biến VITE_*. Ngoài Vite có thể là undefined.
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    return env ?? {};
  } catch {
    return {};
  }
}

export function readEnv(name: EnvName): string | undefined {
  if (name in overrides) return overrides[name] || undefined;
  const v = viteEnv()[name];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** true khi dùng dữ liệu mẫu trên máy (không có Supabase hoặc ép VITE_DATA_MODE=demo). */
export function isDemoMode(): boolean {
  if (readEnv('VITE_DATA_MODE') === 'demo') return true;
  return !(readEnv('VITE_SUPABASE_URL') && readEnv('VITE_SUPABASE_ANON_KEY'));
}

/** Origin chứa gói HTML5 (content-host), luôn kết thúc bằng '/'. */
export function contentOrigin(): string {
  const v = readEnv('VITE_CONTENT_ORIGIN') ?? 'http://localhost:5180/';
  return v.endsWith('/') ? v : `${v}/`;
}

/** Địa chỉ WebSocket của tools/live-relay. */
export function relayWsUrl(): string {
  const v = readEnv('VITE_RELAY_URL');
  if (v) return v.replace(/\/+$/, '');
  let host = 'localhost';
  try {
    const loc = (globalThis as { location?: { hostname?: string; protocol?: string } }).location;
    if (loc?.hostname) host = loc.hostname;
  } catch {
    /* không có location (Node) */
  }
  return `ws://${host}:8787`;
}

/** ws://host:8787 → http://host:8787 (dùng cho GET /pin/:pin). */
export function relayHttpUrl(wsUrl = relayWsUrl()): string {
  return wsUrl.replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '');
}
