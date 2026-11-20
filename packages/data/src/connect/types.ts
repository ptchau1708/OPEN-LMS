/** Cầu nối với app ngoài (docs/KET_NOI_APP_NGOAI.md) — kiểu dữ liệu. Đặt ở đây (không ở contracts) để ít đụng tệp dùng chung. */

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
}
/** Phần học sinh (trang /ket-noi) được biết về app. */
export type ExternalAppPublic = Pick<ExternalApp, 'id' | 'name' | 'allowedOrigins'>;
export type ExternalAppInput = Pick<ExternalApp, 'id' | 'name' | 'description' | 'allowedOrigins' | 'enabled'>;

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
}
