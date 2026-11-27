/**
 * Mật khẩu (docs/MAT_KHAU.md):
 * - /doi-mat-khau      — tự đổi (đang đăng nhập). Cũng hiện BẮT BUỘC khi đang dùng mật khẩu tạm (ForcedChange).
 * - /quen-mat-khau     — gửi thư đặt lại, CHỈ với email thật; tài khoản tên đăng nhập / SĐT → nhờ GVCN cấp lại.
 * - /dat-lai-mat-khau  — mở từ link trong thư, đặt mật khẩu mới.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { isDemoMode, isSystemEmail, NO_REAL_EMAIL_TEXT, newPasswordProblem, PASSWORD_MIN, useChangePassword, useCompletePasswordReset, useCurrentUser, useRequestPasswordReset, useSignOut } from '@openedu/data';
import { Button, Icon, Mascot } from '@openedu/ui';
import { LoadingScreen } from '../../components/Common';
import { errText } from '../../lib/util';
import { takeAuthLinkError } from '../../lib/authLink';
import '../../styles/parent.css';
import '../../styles/parent5.css';

function Shell({ title, children, back }: { title: string; children: ReactNode; back?: ReactNode }) {
  return (
    <div className="ln-parent ln-pl">
      <header className="ln-pp-head">
        <div className="ln-pp-head__brand"><Icon name="lock" size={26} /> {title}</div>
        {back}
      </header>
      {children}
    </div>
  );
}

function PwField({ label, value, onChange, auto, testId }: { label: string; value: string; onChange: (v: string) => void; auto: string; testId?: string }) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="ln-field">
      <span className="ln-field__label">{label}</span>
      <span className="ln-input-wrap">
        <input className="ln-input" type={reveal ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={auto} data-testid={testId} />
        <button type="button" className="ln-input-eye" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={reveal}><Icon name={reveal ? 'close' : 'eye'} size={26} /></button>
      </span>
    </label>
  );
}

/** Mật khẩu mới + nhập lại. Trả lỗi (nếu có) để nút gửi khóa lại. */
function useNewPassword(current?: string) {
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const problem = next ? newPasswordProblem(next, current || undefined) : null;
  const mismatch = !!again && again !== next;
  const ready = !!next && !problem && next === again;
  const fields = (
    <>
      <PwField label={`Mật khẩu mới (ít nhất ${PASSWORD_MIN} kí tự)`} value={next} onChange={setNext} auto="new-password" testId="pw-new" />
      <PwField label="Nhập lại mật khẩu mới" value={again} onChange={setAgain} auto="new-password" testId="pw-again" />
      {problem && <p className="ln-pp-muted" role="status">{problem}</p>}
      {mismatch && <p className="ln-pp-muted" role="status">Hai lần nhập chưa giống nhau.</p>}
    </>
  );
  return { next, ready, fields };
}

function ChangeForm({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const np = useNewPassword(current);
  const change = useChangePassword();
  const submit = (e: FormEvent) => { e.preventDefault(); change.mutate({ current, next: np.next }, { onSuccess: onDone }); };
  return (
    <form className="ln-pp-card ln-pl__form" onSubmit={submit}>
      {forced ? (
        <>
          <h2 className="ln-pp-h">Đặt mật khẩu của riêng mình</h2>
          <p className="ln-pp-muted">Thầy/cô vừa cấp cho tài khoản này một mật khẩu tạm. Để giữ an toàn, xin đặt mật khẩu mới trước khi dùng tiếp.</p>
        </>
      ) : <h2 className="ln-pp-h">Đổi mật khẩu</h2>}
      <PwField label={forced ? 'Mật khẩu tạm (trên phiếu)' : 'Mật khẩu đang dùng'} value={current} onChange={setCurrent} auto="current-password" testId="pw-current" />
      {np.fields}
      {change.isError && <p className="ln-alert" role="alert"><Icon name="hint" size={22} /> {errText(change.error)}</p>}
      <Button type="submit" size="lg" block disabled={!current || !np.ready || change.isPending}>{change.isPending ? 'Đang đổi…' : 'Lưu mật khẩu mới'}</Button>
    </form>
  );
}

function Done({ text, to, label }: { text: string; to: string; label: string }) {
  const nav = useNavigate();
  return (
    <section className="ln-pp-card ln-pl__done" role="status">
      <Mascot id="nghe" mood="happy" size={96} title="" />
      <h2 className="ln-pp-h">{text}</h2>
      <p className="ln-pp-muted">Lần sau đăng nhập bằng mật khẩu mới nhé.</p>
      <Button size="lg" onClick={() => nav(to, { replace: true })}>{label}</Button>
    </section>
  );
}

const home = (me?: Profile | null) => (me?.role === 'parent' ? '/phu-huynh' : '/');

/** /doi-mat-khau */
export default function ChangePasswordPage() {
  const me = useCurrentUser();
  const [done, setDone] = useState(false);
  if (me.isPending) return <LoadingScreen />;
  if (!me.data) return <Shell title="Đổi mật khẩu" back={<Link className="k-btn k-btn--ghost" to="/dang-nhap"><span className="k-btn__label">Đăng nhập</span></Link>}><p className="ln-pp-muted">Đăng nhập trước rồi mới đổi mật khẩu được.</p></Shell>;
  const back = <Link className="k-btn k-btn--secondary" to={me.data.role === 'student' ? '/toi' : home(me.data)}><span className="k-btn__label">Quay lại</span></Link>;
  return (
    <Shell title="Mật khẩu" back={done ? undefined : back}>
      {done ? <Done text="Đã đổi mật khẩu!" to={home(me.data)} label="Tiếp tục" /> : <ChangeForm onDone={() => setDone(true)} />}
    </Shell>
  );
}

/** Đang dùng mật khẩu tạm → chặn mọi trang cho tới khi đổi. */
export function ForcedChange({ me }: { me: Profile }) {
  const out = useSignOut();
  const nav = useNavigate();
  return (
    <Shell title="Mật khẩu" back={<Button variant="ghost" onClick={() => out.mutate(undefined, { onSuccess: () => nav('/dang-nhap', { replace: true }) })}>Đăng xuất</Button>}>
      <p className="ln-pp-muted">Xin chào {me.name}.</p>
      <ChangeForm forced onDone={() => undefined} />
    </Shell>
  );
}

/** /quen-mat-khau */
export function ForgotPasswordPage() {
  const [login, setLogin] = useState('');
  const req = useRequestPasswordReset();
  const sys = !!login.trim() && isSystemEmail(login);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    req.mutate({ email: login.trim(), redirectTo: `${location.origin}/dat-lai-mat-khau` });
  };
  return (
    <Shell title="Quên mật khẩu" back={<Link className="k-btn k-btn--ghost" to="/dang-nhap"><span className="k-btn__label">Trang đăng nhập</span></Link>}>
      {req.isSuccess ? (
        <section className="ln-pp-card ln-pl__done" role="status">
          <Mascot id="nghe" mood="happy" size={96} title="" />
          <h2 className="ln-pp-h">Đã gửi thư!</h2>
          <p className="ln-pp-muted">Nếu <strong>{login.trim()}</strong> có tài khoản, thư đặt lại mật khẩu sẽ tới trong vài phút. Mở thư và bấm vào link (link dùng được một lần). Không thấy thư thì xem cả mục Thư rác.</p>
        </section>
      ) : (
        <form className="ln-pp-card ln-pl__form" onSubmit={submit}>
          <h2 className="ln-pp-h">Lấy lại mật khẩu qua email</h2>
          <label className="ln-field">
            <span className="ln-field__label">Email đã dùng để đăng kí</span>
            <input className="ln-input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email" placeholder="me.lan@gmail.com" data-testid="forgot-email" />
          </label>
          {sys && <p className="ln-alert" role="alert" data-testid="forgot-no-email"><Icon name="hint" size={22} /> {NO_REAL_EMAIL_TEXT}</p>}
          {req.isError && !sys && <p className="ln-alert" role="alert"><Icon name="hint" size={22} /> {errText(req.error)}</p>}
          <Button type="submit" size="lg" block disabled={!login.trim() || sys || req.isPending}>{req.isPending ? 'Đang gửi…' : 'Gửi thư đặt lại mật khẩu'}</Button>
          <ul className="ln-pp-muted ln-pl__fine">
            <li><strong>Học sinh</strong> quên mật khẩu: nhờ thầy/cô chủ nhiệm in lại phiếu.</li>
            <li><strong>Phụ huynh đăng kí bằng số điện thoại</strong>: nhờ thầy/cô chủ nhiệm cấp mật khẩu tạm.</li>
            <li><strong>Thầy/cô</strong> đăng nhập bằng tên đăng nhập: nhờ quản trị trường cấp lại.</li>
          </ul>
          {isDemoMode() && <p className="ln-pp-muted ln-pl__demo">Bản thử không gửi thư thật.</p>}
        </form>
      )}
    </Shell>
  );
}

/** /dat-lai-mat-khau — mở từ link trong thư. */
export function ResetPasswordPage() {
  const me = useCurrentUser();
  const np = useNewPassword();
  const done = useCompletePasswordReset();
  const [linkError] = useState(takeAuthLinkError);
  if (me.isPending) return <LoadingScreen />;
  const expired = !!linkError || !me.data;
  return (
    <Shell title="Đặt lại mật khẩu">
      {done.isSuccess ? <Done text="Đã đặt mật khẩu mới!" to={home(me.data)} label="Vào OPEN-EDU" /> : expired ? (
        <section className="ln-pp-card ln-pl__done" role="alert">
          <Mascot id="nghe" mood="think" size={96} title="" />
          <h2 className="ln-pp-h">Link đã hết hạn hoặc đã được dùng</h2>
          <p className="ln-pp-muted">Mỗi link chỉ dùng được một lần và trong thời gian ngắn. Xin gửi lại thư mới.</p>
          <Link className="k-btn k-btn--primary k-btn--lg" to="/quen-mat-khau"><span className="k-btn__label">Gửi lại thư</span></Link>
        </section>
      ) : (
        <form className="ln-pp-card ln-pl__form" onSubmit={(e) => { e.preventDefault(); done.mutate(np.next); }}>
          <h2 className="ln-pp-h">Đặt mật khẩu mới cho {me.data?.name}</h2>
          {np.fields}
          {done.isError && <p className="ln-alert" role="alert"><Icon name="hint" size={22} /> {errText(done.error)}</p>}
          <Button type="submit" size="lg" block disabled={!np.ready || done.isPending}>{done.isPending ? 'Đang lưu…' : 'Lưu mật khẩu mới'}</Button>
        </form>
      )}
    </Shell>
  );
}
