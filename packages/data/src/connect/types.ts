/** Cầu nối với app ngoài (docs/KET_NOI_APP_NGOAI.md) — kiểu dữ liệu. Đặt ở đây (không ở contracts) để ít đụng tệp dùng chung. */

/** Cấu hình LTI 1.3 của một app (OPEN-EDU làm nền tảng, app là "tool") — docs/KET_NOI_LTI.md. */
export interface LtiConfig {
  /** OPEN-EDU tự sinh khi bật LTI. */
  clientId: string;
  deploymentId: string;
  /** Địa chỉ đăng nhập OIDC của app (vd https://doc.truong.edu.vn/lti/login). */
  loginUrl: string;
  /** Địa chỉ mở bài (target_link_uri, vd https://doc.truong.edu.vn/lti/launch). */
  launchUrl: string;
  /** Địa chỉ chọn bài (Deep Linking) — GV chọn bài trong app rồi giao cho lớp. Không bắt buộc. */
  deepLinkUrl?: string;
  /** redirect_uri được phép thêm (mặc định chỉ launchUrl). */
  redirectUris?: string[];
  /** Khóa công khai của app: JWKS URL … */
  jwksUrl?: string;
  /** … hoặc dán khóa PEM "BEGIN PUBLIC KEY" / JWK. */
  publicKey?: string;
}

/** App LTI đang bật — phần học sinh / giáo viên thấy để mở app. */
export interface LtiToolPublic {
  id: string;
  name: string;
  description: string;
  clientId: string;
  deploymentId: string;
  loginUrl: string;
  launchUrl: string;
  deepLinkUrl?: string | null;
}

/** Tham số app ngoài gửi tới trang /lti/auth (bước 2 của OIDC). */
export type LtiAuthParams = Record<string, string>;
/** Biểu mẫu tự gửi tới app ngoài (bước 4). */
export interface LtiAuthForm { action: string; fields: Record<string, string> }

/** Một app / trang HTML bên ngoài đã được nhà trường đăng kí. */
export interface ExternalApp {
  /** Mã ngắn (slug): chữ thường, số, gạch nối. */
  id: string;
  name: string;
  description: string;
  /** Origin chính xác, vd https://doc.truong.edu.vn */
  allowedOrigins: string[];
  enabled: boolean;
  createdAt: string;
  /** null = không dùng LTI (chỉ dùng openedu-connect.js). */
  lti: LtiConfig | null;
}
/** Phần học sinh (trang /ket-noi) được biết về app. */
export type ExternalAppPublic = Pick<ExternalApp, 'id' | 'name' | 'allowedOrigins'>;
export type ExternalAppInput = Pick<ExternalApp, 'id' | 'name' | 'description' | 'allowedOrigins' | 'enabled'> & { lti?: LtiConfig | null };

/** Một kết quả học do app ngoài gửi về. Không đổi sao/xu, không đổi mức thành thạo. */
export interface ExternalActivity {
  id: string;
  userId: string;
  appId: string;
  appName: string;
  activityId: string;
  title: string;
  /** vd 'reading', 'quiz', 'game', 'other'. */
  kind: string;
  score: number | null;
  maxScore: number | null;
  correct: number | null;
  total: number | null;
  durationSec: number | null;
  completed: boolean;
  detail: Record<string, unknown>;
  skills: string[];
  at: string;
}

export interface ConnectToken {
  accessToken: string;
  /** Giây kể từ 1970 (epoch). */
  expiresAt: number;
}
export interface ConnectApi {
  url: string;
  anonKey: string;
}

/** Tin nhắn trang /ket-noi gửi cho cửa sổ đã mở nó (window.opener.postMessage). */
export interface ConnectMessage {
  type: 'openedu:connect';
  state: string;
  error?: string;
  user?: { id: string; name: string; grade: number | null; classId: string | null; className: string | null; avatarMascot: string };
  /** null ở chế độ demo (không có máy chủ để ghi). */
  token?: ConnectToken | null;
  api?: ConnectApi | null;
}

export interface ConnectSource {
  /** Quản trị: toàn bộ sổ đăng kí. */
  listApps(): Promise<ExternalApp[]>;
  /** Quản trị: thêm (isNew) hoặc sửa. */
  saveApp(input: ExternalAppInput, isNew: boolean): Promise<void>;
  /** Quản trị: xóa (chỉ được khi app chưa có dữ liệu). */
  deleteApp(id: string): Promise<void>;
  /** Người đã đăng nhập: app đang bật, hoặc null. */
  getApp(id: string): Promise<ExternalAppPublic | null>;
  listActivities(userId: string, limit?: number): Promise<ExternalActivity[]>;
  /** Phiên đăng nhập hiện tại để trao cho app ngoài (không bao giờ kèm refresh token). Demo: null. */
  getAccess(): Promise<{ token: ConnectToken; api: ConnectApi } | null>;

  /* ---------- LTI 1.3 ---------- */
  /** Mã nền tảng (iss) = <Supabase URL>/functions/v1/lti. Demo: null (không có máy chủ kí id_token). */
  ltiIssuer(): string | null;
  /** App LTI đang bật. */
  listLtiTools(): Promise<LtiToolPublic[]>;
  /** Bước 3: máy chủ kiểm tra rồi kí id_token cho người đang đăng nhập. */
  ltiAuthorize(params: LtiAuthParams, returnUrl?: string): Promise<LtiAuthForm>;
}
