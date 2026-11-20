/**
 * HTTP dùng chung cho Edge Functions: CORS, đọc JSON có giới hạn, lỗi JSON thống nhất.
 * Lỗi trả về: { "error": "<thông báo tiếng Việt>", "code": "<mã máy đọc>" } với HTTP status phù hợp.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Origin máy cá nhân / mạng nội bộ / app Capacitor — luôn được phép để chạy thử không cần cấu hình. */
const LOCAL_ORIGIN = /^(https?|capacitor|ionic):\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

/**
 * CORS_ORIGINS: danh sách origin của các app (cách nhau bởi dấu phẩy), ví dụ
 *   https://hoc.truong.edu.vn,https://gv.truong.edu.vn,https://tv.truong.edu.vn
 * KHÔNG đặt → chỉ nhận origin máy cá nhân / mạng nội bộ (trang web lạ bị trình duyệt chặn).
 * Đặt '*' để mở cho mọi origin (không khuyến nghị).
 */
export function corsAllow(origin: string, setting: string | undefined): string {
  const allowed = (setting ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter((s) => s.length > 0);
  if (allowed.includes('*')) return '*';
  if (allowed.includes(origin) || LOCAL_ORIGIN.test(origin)) return origin;
  return allowed[0] ?? 'null';
}

function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': corsAllow(req.headers.get('Origin') ?? '', Deno.env.get('CORS_ORIGINS')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function jsonResponse(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...extra, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Bọc handler: preflight, chỉ POST, bắt lỗi → JSON. */
export function serveJson(handler: (req: Request) => Promise<unknown>): void {
  Deno.serve(async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Chỉ hỗ trợ phương thức POST.', code: 'method_not_allowed' }, 405, cors);
    }
    try {
      const body = await handler(req);
      return jsonResponse(body, 200, cors);
    } catch (e) {
      if (e instanceof HttpError) {
        return jsonResponse({ error: e.message, code: e.code }, e.status, cors);
      }
      console.error('unhandled', e);
      return jsonResponse({ error: 'Máy chủ đang bận, em thử lại sau nhé.', code: 'internal' }, 500, cors);
    }
  });
}

export type JsonObject = Record<string, unknown>;

export function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Đọc thân yêu cầu JSON (object) với giới hạn kích thước. */
export async function readJsonObject(req: Request, maxBytes: number): Promise<JsonObject> {
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.', 'too_large');
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.', 'too_large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Dữ liệu gửi lên không phải JSON hợp lệ.', 'bad_json');
  }
  if (!isObject(parsed)) throw new HttpError(400, 'Dữ liệu gửi lên phải là một đối tượng JSON.', 'bad_json');
  return parsed;
}

export function requireString(v: unknown, field: string, maxLen = 128): string {
  if (typeof v !== 'string' || v.trim() === '') throw new HttpError(400, `Thiếu "${field}".`, 'bad_request');
  if (v.length > maxLen) throw new HttpError(400, `"${field}" quá dài.`, 'bad_request');
  return v.trim();
}

export function optionalString(v: unknown, field: string, maxLen = 128): string | null {
  if (v === undefined || v === null || v === '') return null;
  return requireString(v, field, maxLen);
}

export function optionalInt(v: unknown, field: string, min: number, max: number): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new HttpError(400, `"${field}" phải là số nguyên từ ${min} đến ${max}.`, 'bad_request');
  }
  return v;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function optionalUuid(v: unknown, field: string): string | null {
  const s = optionalString(v, field, 64);
  if (s !== null && !UUID_RE.test(s)) throw new HttpError(400, `"${field}" không hợp lệ.`, 'bad_request');
  return s;
}
