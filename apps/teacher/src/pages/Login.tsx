import { useEffect, useRef, useState } from 'react';
import type { Profile } from '@openedu/contracts';
import { handoffTo, useClasses, useDataSource, useDemoUsers, useSignIn, useSignOut } from '@openedu/data';
import { learnerBase } from '../lib/env';
import { Avatar, Btn, ErrorNote, Field } from '../components/common';
import { Brand } from '../components/Layout';

const QUICK = ['cothu', 'colan', 'cohoa', 'thaynam', 'admin'];

export function Login({ wrongRole }: { wrongRole: Profile | null }) {
  const ds = useDataSource();
  const signIn = useSignIn();
  const signOut = useSignOut();
  const demo = useDemoUsers();
  const classes = useClasses();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  // Đăng nhập chung (docs/DANG_NHAP_CHUNG.md): HS / phụ huynh đăng nhập nhầm ở đây → tự chuyển sang app học sinh kèm phiên.
  const moved = useRef(false);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    if (!wrongRole || moved.current) return;
    moved.current = true;
    setMoving(true);
    void handoffTo(learnerBase()).finally(() => setTimeout(() => setMoving(false), 4000));
  }, [wrongRole]);
  const quick = (demo.data ?? []).filter((x) => QUICK.includes(x.username ?? '')).sort((a, b) => QUICK.indexOf(a.username ?? '') - QUICK.indexOf(b.username ?? ''));

  return (
    <div className="tc-app theme-pro tc-login">
      <div className="tc-login__card">
        <Brand />
        <h1>Đăng nhập</h1>
        <p className="tc-muted">Soạn bài giảng tương tác, giao bài và điều khiển lớp học trực tiếp.</p>
        <p className="tc-muted">Có thể đăng nhập ở <a href={learnerBase()}>trang đăng nhập chung</a> — hệ thống tự chuyển đúng chỗ.</p>
        {wrongRole && moving ? (
          <div className="tc-alert" role="status">Đang chuyển <strong>{wrongRole.name}</strong> sang Góc học tập…</div>
        ) : wrongRole ? (
          <div className="tc-alert">
            <span>Tài khoản <strong>{wrongRole.name}</strong> không phải tài khoản giáo viên. Học sinh và phụ huynh dùng app Góc học tập.</span>
            <Btn size="sm" onClick={() => signOut.mutate()}>Đăng xuất</Btn>
          </div>
        ) : null}
        <form className="tc-stack" onSubmit={(e) => { e.preventDefault(); signIn.mutate({ username: u, password: p }); }}>
          <Field label="Email hoặc tên đăng nhập">
            <input className="tc-input" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} placeholder="vd: colan hoặc co.lan@truong.edu.vn" />
          </Field>
          <Field label="Mật khẩu">
            <input className="tc-input" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} />
          </Field>
          <ErrorNote error={signIn.error} />
          <Btn kind="primary" size="lg" type="submit" disabled={signIn.isPending || !u}>{signIn.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}</Btn>
        </form>
        <p className="tc-muted"><a href={`${learnerBase()}/quen-mat-khau`} data-testid="login-forgot">Quên mật khẩu?</a> Đăng nhập bằng tên đăng nhập thì nhờ quản trị trường cấp lại.</p>
        {ds.mode === 'demo' && quick.length ? (
          <section className="tc-login__demo">
            <h2>Tài khoản mẫu (chế độ demo, mật khẩu 123456)</h2>
            <div className="tc-quick">
              {quick.map((x) => {
                const cls = classes.data?.find((c) => c.id === x.classId);
                return (
                  <button key={x.id} type="button" className="tc-quick__card" disabled={signIn.isPending} onClick={() => signIn.mutate({ username: x.username ?? '', password: '123456' })}>
                    <Avatar mascot={x.avatarMascot} color={x.avatarColor} size={40} />
                    <span><strong>{x.name}</strong><small>{x.role === 'admin' ? 'Quản trị trường' : cls ? `Chủ nhiệm lớp ${cls.name}` : 'Giáo viên'}</small></span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
