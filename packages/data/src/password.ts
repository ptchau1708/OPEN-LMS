/** Quy tắc mật khẩu dùng chung (docs/MAT_KHAU.md). Thuần, không phụ thuộc. */
import { readEnv } from './env';

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

/** Lí do mật khẩu mới chưa dùng được, hoặc null nếu được. */
export function newPasswordProblem(next: string, current?: string): string | null {
  const p = next ?? '';
  if (p.length < PASSWORD_MIN) return `Mật khẩu mới cần ít nhất ${PASSWORD_MIN} kí tự.`;
  if (p.length > PASSWORD_MAX) return `Mật khẩu mới dài quá (tối đa ${PASSWORD_MAX} kí tự).`;
  if (/^\s|\s$/.test(p)) return 'Mật khẩu không bắt đầu hay kết thúc bằng dấu cách.';
  if (current !== undefined && p === current) return 'Mật khẩu mới phải khác mật khẩu đang dùng.';
  if (/^(.)\1+$/.test(p) || ['123456', '1234567', '12345678', '654321', 'abcdef', 'matkhau'].includes(p.toLowerCase())) return 'Mật khẩu này dễ đoán quá, chọn mật khẩu khác nhé.';
  return null;
}

/**
 * Địa chỉ do hệ thống tự ghép (HS / GV tạo bằng tên đăng nhập, phụ huynh đăng kí bằng SĐT) — KHÔNG có hộp thư thật,
 * không gửi thư khôi phục tới đó. Không phải email (tên đăng nhập, SĐT) cũng tính là không có email thật.
 */
export function isSystemEmail(login: string, domain = readEnv('VITE_STUDENT_EMAIL_DOMAIN') ?? 'openlms.edu'): boolean {
  const e = (login ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return true;
  const d = domain.toLowerCase();
  return e.endsWith(`@${d}`) || e.endsWith(`@parent.${d}`);
}

export const NO_REAL_EMAIL_TEXT = 'Tài khoản này đăng nhập bằng tên đăng nhập hoặc số điện thoại nên không nhận được thư. Xin nhờ thầy cô chủ nhiệm (hoặc quản trị trường) cấp lại mật khẩu.';
