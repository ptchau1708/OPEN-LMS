/**
 * Google Identity Services (luồng "token" trong trình duyệt): tải script lười, xin access token theo phạm vi.
 * Chỉ dùng khi có VITE_GOOGLE_CLIENT_ID. Token chỉ giữ trong bộ nhớ trang (không lưu xuống máy), hết hạn sau ~1 giờ.
 * ⚠ Chưa thử với Google thật.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string; scope?: string }
interface TokenClient { requestAccessToken(opts?: { prompt?: string }): void }
interface GoogleNs { accounts: { oauth2: { initTokenClient(cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string; message?: string }) => void }): TokenClient } } }

export function googleClientId(): string {
  try {
    const v = (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_GOOGLE_CLIENT_ID;
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

let loading: Promise<GoogleNs> | null = null;
function loadGis(): Promise<GoogleNs> {
  const w = window as unknown as { google?: GoogleNs };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  if (!loading) {
    loading = new Promise<GoogleNs>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => (w.google?.accounts?.oauth2 ? resolve(w.google) : reject(new Error('Không tải được thư viện đăng nhập Google.')));
      s.onerror = () => reject(new Error('Không tải được thư viện đăng nhập Google (mạng chặn accounts.google.com?).'));
      document.head.appendChild(s);
    });
    loading.catch(() => { loading = null; });
  }
  return loading;
}

export interface GoogleToken { token: string; expiresAt: number; scopes: string[] }

/** Mở cửa sổ Google xin quyền; phải gọi từ một lần bấm của người dùng (trình duyệt chặn cửa sổ bật lên nếu không). */
export async function requestGoogleToken(scopes: readonly string[]): Promise<GoogleToken> {
  const clientId = googleClientId();
  if (!clientId) throw new Error('Chưa cấu hình VITE_GOOGLE_CLIENT_ID.');
  const g = await loadGis();
  return new Promise<GoogleToken>((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes.join(' '),
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error === 'access_denied' ? 'Thầy/cô chưa cho phép OPEN-EDU truy cập Classroom.' : `Google từ chối: ${r.error_description ?? r.error ?? 'không rõ lí do'}`));
        const granted = (r.scope ?? '').split(' ').filter(Boolean);
        const missing = scopes.filter((s) => granted.length && !granted.includes(s));
        if (missing.length) return reject(new Error('Thầy/cô cần đánh dấu đủ các ô quyền trên màn hình Google rồi bấm Tiếp tục.'));
        resolve({ token: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 - 60_000, scopes: [...scopes] });
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Cửa sổ Google đã bị đóng trước khi xong.' : e.type === 'popup_failed_to_open' ? 'Trình duyệt chặn cửa sổ bật lên. Cho phép cửa sổ bật lên rồi thử lại.' : e.message ?? 'Không đăng nhập được Google.')),
    });
    client.requestAccessToken();
  });
}
