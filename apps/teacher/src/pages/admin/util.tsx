import type { ReactNode } from 'react';
import { QrCode } from '@openedu/ui';
import { formatCode } from '@openedu/data';
import type { AccountSlip, GuardianCode, MasteryLevel } from '@openedu/contracts';
import { cx } from '../../lib/format';

function env(name: string): string | undefined {
  const v = (import.meta.env as Record<string, unknown>)[name];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
export function learnerBase(): string {
  const host = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
  return (env('VITE_LEARNER_URL') ?? `http://${host}:5173`).replace(/\/+$/, '');
}
/** Link (mã QR) phụ huynh mở để đăng ký & liên kết. */
export function parentLinkUrl(code: string): string {
  return `${learnerBase()}/phu-huynh/lien-ket?ma=${encodeURIComponent(code)}`;
}

export const pct = (v: number | null | undefined, empty = '–') => (v === null || v === undefined ? empty : `${Math.round(v * 100)}%`);
export function levelOfP(p: number | null | undefined, n = 1): MasteryLevel {
  if (p === null || p === undefined || n <= 0) return 'chua-hoc';
  return p >= 0.85 ? 'vung' : p >= 0.6 ? 'dang-hoc' : 'can-on';
}

/** Thanh ngang nhỏ trong bảng (0..1). */
export function Meter({ value, label }: { value: number | null | undefined; label?: string }) {
  if (value === null || value === undefined) return <span className="tc-muted">–</span>;
  const lv = levelOfP(value);
  return (
    <span className="ad-meter" title={label}>
      <span className="ad-meter__track"><i className={cx('tc-lv', `tc-lv--${lv}`)} style={{ width: `${Math.max(3, Math.round(value * 100))}%` }} /></span>
      <span className="ad-meter__v">{pct(value)}</span>
    </span>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="ad-kpi">
      <span className="ad-kpi__label">{label}</span>
      <strong className="ad-kpi__value">{value}</strong>
      {sub ? <span className="ad-kpi__sub">{sub}</span> : null}
    </div>
  );
}

/** Phiếu mã liên kết phụ huynh (in, cắt theo đường chấm). */
export function CodeSlip({ code, studentName, className, schoolName }: { code: GuardianCode; studentName: string; className: string; schoolName?: string }) {
  const url = parentLinkUrl(code.code);
  return (
    <article className="ad-slip">
      <header className="ad-slip__head"><strong>{schoolName || 'OPEN-EDU'}</strong><span>Lớp {className}</span></header>
      <div className="ad-slip__body">
        <QrCode value={url} size={112} title={`Mã QR liên kết cho ${studentName}`} />
        <div className="ad-slip__text">
          <p className="ad-slip__lead">Kính gửi phụ huynh em <strong>{studentName}</strong></p>
          <p>Quét mã QR (mã tự điền sẵn) hoặc mở <span className="ad-slip__url">{learnerBase().replace(/^https?:\/\//, '')}/phu-huynh/lien-ket</span> rồi nhập mã:</p>
          <p className="ad-slip__code">{formatCode(code.code)}</p>
          <p className="ad-slip__fine">Mã dùng một lần, hết hạn {new Date(code.expiresAt).toLocaleDateString('vi-VN')}. Mỗi con tối đa 4 tài khoản phụ huynh.</p>
        </div>
      </div>
    </article>
  );
}

/** Phiếu tài khoản HS/GV (mật khẩu chỉ hiện một lần). */
export function AccountSlipCard({ slip, schoolName }: { slip: AccountSlip; schoolName?: string }) {
  return (
    <article className="ad-slip ad-slip--acc">
      <header className="ad-slip__head"><strong>{schoolName || 'OPEN-EDU'}</strong><span>{slip.className ? `Lớp ${slip.className}` : slip.role === 'teacher' ? 'Giáo viên' : slip.role === 'parent' ? 'Phụ huynh' : slip.role === 'admin' ? 'Quản trị' : ''}</span></header>
      <p className="ad-slip__lead"><strong>{slip.name}</strong></p>
      <dl className="ad-slip__acc">
        <dt>{slip.role === 'parent' ? 'Đăng nhập bằng' : 'Tên đăng nhập'}</dt><dd>{slip.username}</dd>
        <dt>{slip.temporary ? 'Mật khẩu tạm' : 'Mật khẩu'}</dt><dd>{slip.password}</dd>
      </dl>
      {slip.temporary
        ? <p className="ad-slip__fine">Mở {learnerBase().replace(/^https?:\/\//, '')} · Đăng nhập bằng mật khẩu tạm, hệ thống sẽ yêu cầu đặt mật khẩu mới ngay.</p>
        : <p className="ad-slip__fine">Mở {learnerBase().replace(/^https?:\/\//, '')} · Giữ phiếu cẩn thận, không cho bạn khác xem.</p>}
    </article>
  );
}
