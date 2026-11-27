/** /phu-huynh/lien-ket?ma=XXXX — phụ huynh tạo tài khoản bằng mã của con, hoặc đăng nhập rồi thêm con. Mở được khi chưa đăng nhập (QR trên phiếu). */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { formatCode, isDemoMode, useChildren, normalizeCode, useCurrentUser, useRedeemGuardianCode, useRegisterParent, useSignIn, useSignOut, DEMO_SIBLING_CODE } from '@openedu/data';
import { Button, Icon, Mascot } from '@openedu/ui';
import { LoadingScreen } from '../../components/Common';
import { errText } from '../../lib/util';
import '../../styles/parent.css';
import '../../styles/parent5.css';

export default function ParentLink() {
  const me = useCurrentUser();
  const [sp] = useSearchParams();
  const initial = normalizeCode(sp.get('ma') ?? '');
  const [done, setDone] = useState<string | null>(null);
  const [code, setCode] = useState(initial);
  const [auto, setAuto] = useState(false);
  const reg = useRegisterParent(); // giữ ở đây: đăng ký xong `me` đổi sang phụ huynh, form con bị gỡ
  if (me.isPending) return <LoadingScreen />;
  const user = me.data ?? null;
  if (done !== null || reg.isSuccess) return <div className="ln-parent ln-pl"><Done name={done ?? ''} /></div>;
  return (
    <div className="ln-parent ln-pl">
      <header className="ln-pp-head">
        <div className="ln-pp-head__brand"><Icon name="parent" size={26} /> Liên kết với con</div>
        {user?.role === 'parent' ? <Link className="k-btn k-btn--secondary" to="/phu-huynh"><span className="k-btn__label">Trang phụ huynh</span></Link> : <Link className="k-btn k-btn--ghost" to="/dang-nhap"><span className="k-btn__label">Trang đăng nhập</span></Link>}
      </header>
      {user && user.role !== 'parent' ? <NotParent user={user} /> : user ? <Redeem code={code} setCode={setCode} auto={auto} onDone={setDone} /> : <Register code={code} setCode={setCode} onSignedIn={() => setAuto(true)} reg={reg} />}
    </div>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="ln-field">
      <span className="ln-field__label">Mã liên kết (8 kí tự trên phiếu thầy/cô gửi)</span>
      <input className="ln-input ln-pl__code" value={formatCode(value)} onChange={(e) => onChange(normalizeCode(e.target.value).slice(0, 8))} autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false} placeholder="ABCD-EFGH" inputMode="text" />
    </label>
  );
}

function Done({ name }: { name: string }) {
  const nav = useNavigate();
  const me = useCurrentUser().data;
  const kids = useChildren(me?.role === 'parent' ? me.id : undefined).data ?? [];
  if (!name) name = kids[kids.length - 1]?.name ?? 'con';
  return (
    <section className="ln-pp-card ln-pl__done" role="status">
      <Mascot id="nghe" mood="happy" size={96} title="" />
      <h2 className="ln-pp-h">Đã liên kết với {name}!</h2>
      <p className="ln-pp-muted">Từ nay bố mẹ xem được việc học, bài làm đã chấm, chuyên cần và nhận xét của thầy/cô.</p>
      <Button size="lg" onClick={() => nav('/phu-huynh', { replace: true })} icon={<Icon name="next" size={22} />}>Xem việc học của con</Button>
    </section>
  );
}

function Redeem({ code, setCode, auto, onDone }: { code: string; setCode: (c: string) => void; auto: boolean; onDone: (name: string) => void }) {
  const redeem = useRedeemGuardianCode();
  // Vừa đăng nhập từ form “Đã có tài khoản” → liên kết luôn bằng mã đã nhập.
  useEffect(() => { if (auto && code.length === 8) redeem.mutate(code, { onSuccess: (r) => onDone(r.child.name) }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e: FormEvent) => { e.preventDefault(); redeem.mutate(code, { onSuccess: (r) => onDone(r.child.name) }); };
  return (
    <form className="ln-pp-card ln-pl__form" onSubmit={submit}>
      <h2 className="ln-pp-h">Thêm con vào tài khoản</h2>
      <p className="ln-pp-muted">Mỗi con có một mã riêng. Bố mẹ có nhiều con học ở trường thì nhập lần lượt từng mã.</p>
      <CodeInput value={code} onChange={setCode} />
      {redeem.isError && <p className="ln-alert" role="alert"><Icon name="hint" size={22} /> {errText(redeem.error)}</p>}
      <Button type="submit" size="lg" block disabled={code.length !== 8 || redeem.isPending}>{redeem.isPending ? 'Đang liên kết…' : 'Liên kết'}</Button>
      {isDemoMode() && <p className="ln-pp-muted ln-pl__demo">Bản demo: mã mẫu cho con thứ hai (Bảo Chi, lớp 2A) là <button type="button" className="ln-link" onClick={() => setCode(DEMO_SIBLING_CODE)}>{formatCode(DEMO_SIBLING_CODE)}</button>.</p>}
    </form>
  );
}

const RELATIONS = ['Mẹ', 'Bố', 'Ông', 'Bà', 'Người giám hộ'];

function Register({ code, setCode, onSignedIn, reg }: { code: string; setCode: (c: string) => void; onSignedIn: () => void; reg: ReturnType<typeof useRegisterParent> }) {
  const [mode, setMode] = useState<'new' | 'old'>('new');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [login, setLogin] = useState('');
  const [pw, setPw] = useState('');
  const [reveal, setReveal] = useState(false);
  const signIn = useSignIn();
  const busy = reg.isPending || signIn.isPending;
  const error = reg.error ?? signIn.error;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'new') reg.mutate({ login, password: pw, name: name.trim() || `${relation || 'Phụ huynh'} bé`, code, relation: relation || undefined });
    else { onSignedIn(); signIn.mutate({ username: login, password: pw }); }
  };
  const wrongRole = signIn.data && signIn.data.role !== 'parent';
  return (
    <form className="ln-pp-card ln-pl__form" onSubmit={submit}>
      <div className="ln-pl__tabs" role="tablist" aria-label="Bố mẹ đã có tài khoản chưa?">
        <button type="button" role="tab" aria-selected={mode === 'new'} onClick={() => setMode('new')}>Tạo tài khoản mới</button>
        <button type="button" role="tab" aria-selected={mode === 'old'} onClick={() => setMode('old')}>Đã có tài khoản</button>
      </div>
      <CodeInput value={code} onChange={setCode} />
      {mode === 'new' && (
        <div className="ln-pl__two">
          <label className="ln-field"><span className="ln-field__label">Bố mẹ là</span>
            <select className="ln-input" value={relation} onChange={(e) => setRelation(e.target.value)}><option value="">Chọn…</option>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
          <label className="ln-field"><span className="ln-field__label">Tên hiển thị</span>
            <input className="ln-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mẹ bé Khoa" autoComplete="name" />
          </label>
        </div>
      )}
      <label className="ln-field"><span className="ln-field__label">Email hoặc số điện thoại</span>
        <input className="ln-input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="0912 345 678" inputMode="email" />
      </label>
      <label className="ln-field"><span className="ln-field__label">{mode === 'new' ? 'Đặt mật khẩu (ít nhất 6 kí tự)' : 'Mật khẩu'}</span>
        <span className="ln-input-wrap">
          <input className="ln-input" type={reveal ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'new' ? 'new-password' : 'current-password'} />
          <button type="button" className="ln-input-eye" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={reveal}><Icon name={reveal ? 'close' : 'eye'} size={26} /></button>
        </span>
      </label>
      {error && <p className="ln-alert" role="alert"><Icon name="hint" size={22} /> {errText(error)}</p>}
      {wrongRole && <p className="ln-alert" role="alert"><Icon name="hint" size={22} /> Đây là tài khoản học sinh, không phải tài khoản phụ huynh.</p>}
      <Button type="submit" size="lg" block disabled={busy || code.length !== 8 || !login.trim() || pw.length < (mode === 'new' ? 6 : 1)}>
        {busy ? 'Đang xử lí…' : mode === 'new' ? 'Tạo tài khoản & liên kết' : 'Đăng nhập & liên kết'}
      </Button>
      <p className="ln-pp-muted ln-pl__fine">Tài khoản phụ huynh mới hoàn toàn — mật khẩu của hệ thống cũ không dùng lại. Mỗi con tối đa 4 tài khoản phụ huynh.</p>
      {isDemoMode() && <p className="ln-pp-muted ln-pl__demo">Bản demo: phụ huynh mẫu <strong>phuhuynh4a</strong> / 123456; mã mẫu <button type="button" className="ln-link" onClick={() => setCode(DEMO_SIBLING_CODE)}>{formatCode(DEMO_SIBLING_CODE)}</button> (Bảo Chi, lớp 2A).</p>}
    </form>
  );
}

function NotParent({ user }: { user: Profile }) {
  const out = useSignOut();
  return (
    <section className="ln-pp-card ln-pl__done">
      <Mascot id="nghe" mood="think" size={96} title="" />
      <h2 className="ln-pp-h">Trang này dành cho bố mẹ</h2>
      <p className="ln-pp-muted">Máy đang đăng nhập tài khoản của {user.name}. Bố mẹ đăng xuất rồi mở lại đường link / mã QR trên phiếu nhé.</p>
      <Button variant="secondary" onClick={() => out.mutate()}>Đăng xuất</Button>
    </section>
  );
}
