/** Đổi mật khẩu cho giáo viên / quản trị (docs/MAT_KHAU.md). Dùng làm trang /doi-mat-khau và màn bắt buộc khi đang dùng mật khẩu tạm. */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { newPasswordProblem, PASSWORD_MIN, useChangePassword, useSignOut } from '@openedu/data';
import { Btn, ErrorNote, Field, PageHead } from '../components/common';
import { Brand } from '../components/Layout';

function ChangeForm({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const change = useChangePassword();
  const problem = next ? newPasswordProblem(next, current || undefined) : null;
  const ready = !!current && !!next && !problem && next === again;
  return (
    <form className="tc-stack" onSubmit={(e) => { e.preventDefault(); change.mutate({ current, next }, { onSuccess: onDone }); }}>
      <Field label={forced ? 'Mật khẩu tạm (trên phiếu)' : 'Mật khẩu đang dùng'}>
        <input className="tc-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="pw-current" />
      </Field>
      <Field label={`Mật khẩu mới (ít nhất ${PASSWORD_MIN} kí tự)`} help={problem ?? undefined}>
        <input className="tc-input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="pw-new" />
      </Field>
      <Field label="Nhập lại mật khẩu mới" help={again && again !== next ? 'Hai lần nhập chưa giống nhau.' : undefined}>
        <input className="tc-input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} data-testid="pw-again" />
      </Field>
      <ErrorNote error={change.error} />
      <Btn kind="primary" type="submit" disabled={!ready || change.isPending}>{change.isPending ? 'Đang đổi…' : 'Lưu mật khẩu mới'}</Btn>
    </form>
  );
}

/** /doi-mat-khau */
export default function ChangePasswordPage() {
  const [done, setDone] = useState(false);
  return (
    <div className="tc-page">
      <PageHead title="Đổi mật khẩu" sub="Mật khẩu dùng cho cả Bàn làm việc giáo viên và trang đăng nhập chung." />
      <section className="tc-card" style={{ maxWidth: 480 }}>
        {done ? <p className="tc-alert tc-alert--info" role="status">Đã đổi mật khẩu. Lần sau đăng nhập bằng mật khẩu mới.</p> : <ChangeForm onDone={() => setDone(true)} />}
      </section>
    </div>
  );
}

/** Đang dùng mật khẩu tạm do quản trị cấp → phải đổi trước khi vào. */
export function ForcedChange({ user }: { user: Profile }) {
  const out = useSignOut();
  const nav = useNavigate();
  return (
    <div className="tc-app theme-pro tc-login">
      <div className="tc-login__card">
        <Brand />
        <h1>Đặt mật khẩu mới</h1>
        <p className="tc-muted">Chào {user.name}. Tài khoản đang dùng mật khẩu tạm do quản trị trường cấp. Xin đặt mật khẩu của riêng mình trước khi làm việc.</p>
        <ChangeForm forced onDone={() => undefined} />
        <Btn kind="ghost" onClick={() => out.mutate(undefined, { onSuccess: () => nav('/') })}>Đăng xuất</Btn>
      </div>
    </div>
  );
}
