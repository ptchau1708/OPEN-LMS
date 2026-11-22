import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { isDemoMode, useClasses, useCurrentUser, useDemoUsers, useSignIn } from '@openedu/data';
import { Button, Icon, Mascot, sfx } from '@openedu/ui';
import { Avatar, LoadingScreen } from '../components/Common';
import { errText } from '../lib/util';

const LOGO_COLORS = ['--k-math', '--k-viet', '--k-nat', '--k-art', '--k-eng', '--k-star-dark', '--k-sci', '--k-music'];

export default function Login() {
  const meQ = useCurrentUser();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;
  const demo = isDemoMode();
  const signIn = useSignIn();
  const [showForm, setShowForm] = useState(!demo);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (meQ.isPending) return <LoadingScreen />;
  if (meQ.data) return <Navigate to={meQ.data.role === 'parent' ? '/phu-huynh' : from || '/'} replace />;

  const go = (u: string, p: string, id?: string) => {
    setBusyId(id ?? null);
    signIn.mutate({ username: u, password: p }, {
      onSuccess: (prof) => { sfx.correct(); nav(prof.role === 'parent' ? '/phu-huynh' : from || '/', { replace: true }); },
      onSettled: () => setBusyId(null),
    });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); go(username, password); };

  return (
    <div className="ln-login">
      <header className="ln-login__hero">
        <div className="ln-login__mascot"><Mascot id="nghe" mood="wave" size={150} animate title="Nghé Tí" /></div>
        <div>
          <h1 className="ln-logo" aria-label="OPEN-EDU">
            {'OPEN-EDU'.split('').map((c, i) => <span key={i} style={{ color: `var(${LOGO_COLORS[i % LOGO_COLORS.length]})` }}>{c}</span>)}
          </h1>
          <p className="ln-login__sub">Góc học tập của em</p>
        </div>
      </header>

      {demo && !showForm && <DemoPicker onPick={(u) => go(u.username ?? '', '123456', u.id)} busyId={busyId} />}

      {signIn.isError && <p className="ln-alert" role="alert"><Icon name="hint" size={22} /> {errText(signIn.error)}</p>}

      {showForm ? (
        <form className="ln-login__form k-card" onSubmit={submit}>
          <h2 className="ln-h2">Đăng nhập</h2>
          <label className="ln-field">
            <span className="ln-field__label">Tên đăng nhập, email hoặc số điện thoại</span>
            <input className="ln-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="ví dụ: an2a1 hoặc 0912 345 678" />
          </label>
          <label className="ln-field">
            <span className="ln-field__label">Mật khẩu</span>
            <span className="ln-input-wrap">
              <input className="ln-input" type={reveal ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="ln-input-eye" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={reveal}>
                <Icon name={reveal ? 'close' : 'eye'} size={26} />
              </button>
            </span>
          </label>
          <Button type="submit" size="xl" block disabled={signIn.isPending || !username.trim()} icon={<Icon name="next" size={28} />}>
            {signIn.isPending ? 'Đang vào…' : 'Vào học'}
          </Button>
          <Link className="ln-link ln-login__forgot" to="/quen-mat-khau" data-testid="login-forgot">Quên mật khẩu?</Link>
          {demo && <Button variant="ghost" block onClick={() => setShowForm(false)}>Chọn tài khoản mẫu</Button>}
        </form>
      ) : (
        <div className="ln-login__alt">
          <Button variant="secondary" size="lg" onClick={() => setShowForm(true)} icon={<Icon name="pencil" size={24} />}>Đăng nhập bằng tên</Button>
        </div>
      )}

      <p className="ln-login__teacher">Bố mẹ? <Link to="/phu-huynh/lien-ket">Tạo tài khoản phụ huynh bằng mã của con</Link> · Đăng nhập bằng email / số điện thoại ở ô “Đăng nhập bằng tên”.</p>
      <p className="ln-login__teacher" data-testid="login-staff-note">Thầy cô và quản trị cũng đăng nhập ở đây (bằng email hoặc tên đăng nhập) — trang tự chuyển sang Bàn làm việc giáo viên.</p>
    </div>
  );
}

function DemoPicker({ onPick, busyId }: { onPick: (u: Profile) => void; busyId: string | null }) {
  const users = useDemoUsers();
  const classes = useClasses();
  const className = useMemo(() => {
    const m: Record<string, string> = {};
    (classes.data ?? []).forEach((c) => (m[c.id] = c.name));
    return m;
  }, [classes.data]);
  if (users.isPending) return <p className="ln-center k-muted">Đang tìm các bạn…</p>;
  const list = users.data ?? [];
  const students = list.filter((u) => u.role === 'student');
  const parents = list.filter((u) => u.role === 'parent');
  const staff = list.filter((u) => u.role === 'teacher' || u.role === 'admin');
  const card = (u: Profile, sub: string) => (
    <button key={u.id} type="button" className="ln-pick" onClick={() => onPick(u)} disabled={!!busyId}>
      <Avatar mascot={u.avatarMascot} color={u.avatarColor} size={72} />
      <span className="ln-pick__name">{u.name}</span>
      <span className="ln-pick__sub">{busyId === u.id ? 'Đang vào…' : sub}</span>
    </button>
  );
  return (
    <section className="ln-login__demo">
      <h2 className="ln-h2 ln-center">Em là ai? Chạm vào tên mình nhé</h2>
      <div className="ln-pick-grid">{students.map((u) => card(u, u.classId && className[u.classId] ? `Lớp ${className[u.classId]}` : `Lớp ${u.grade ?? ''}`))}</div>
      {parents.length > 0 && (
        <>
          <h3 className="ln-h3 ln-center">Phụ huynh</h3>
          <div className="ln-pick-grid ln-pick-grid--small">{parents.map((u) => card(u, 'Xem việc học của con'))}</div>
        </>
      )}
      {staff.length > 0 && (
        <>
          <h3 className="ln-h3 ln-center">Thầy cô</h3>
          <div className="ln-pick-grid ln-pick-grid--small">{staff.map((u) => card(u, u.role === 'admin' ? 'Quản trị trường' : 'Bàn làm việc giáo viên'))}</div>
        </>
      )}
    </section>
  );
}
