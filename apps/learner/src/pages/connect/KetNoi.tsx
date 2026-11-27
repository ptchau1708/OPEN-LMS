/**
 * /ket-noi — "Đăng nhập bằng OPEN-EDU" cho app ngoài (docs/KET_NOI_APP_NGOAI.md).
 * App ngoài mở trang này trong cửa sổ bật lên: /ket-noi?app=<mã>&origin=<origin của nó>&state=<ngẫu nhiên>.
 * Quy tắc an toàn:
 *  • Chỉ trao tên/lớp + access token khi `origin` nằm CHÍNH XÁC trong danh sách nhà trường đăng kí cho app đó,
 *    và postMessage luôn dùng targetOrigin = origin đó (trình duyệt không giao tin nếu cửa sổ mở ra ở origin khác).
 *  • Không bao giờ gửi refresh token. Chỉ tài khoản học sinh (không trao phiên của giáo viên / quản trị).
 *  • Tin báo lỗi trước khi xác thực origin chỉ chứa { type, state, error } — không có dữ liệu người dùng.
 * Lưu ý vận hành: KHÔNG thêm header Cross-Origin-Opener-Policy cho app học sinh (sẽ làm mất window.opener).
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import {
  isAllowedOrigin, parseConnectRequest, useClass, useConnectAccess, useCurrentUser, useExternalApp, useSignOut,
  type ConnectMessage, type ConnectRequest,
} from '@openedu/data';
import { Button, Mascot } from '@openedu/ui';
import { Avatar, LoadingScreen } from '../../components/Common';
import '../../styles/connect.css';

type ErrorCode = 'denied' | 'unknown_app' | 'origin_not_allowed' | 'not_student' | 'error';

function opener(): Window | null {
  try {
    const o = window.opener as Window | null;
    return o && o !== window ? o : null;
  } catch {
    return null;
  }
}
function post(req: ConnectRequest, msg: Omit<ConnectMessage, 'type' | 'state'>): boolean {
  const o = opener();
  if (!o) return false;
  try {
    o.postMessage({ type: 'openedu:connect', state: req.state, ...msg } satisfies ConnectMessage, req.origin);
    return true;
  } catch {
    return false;
  }
}
function closeSoon() {
  window.setTimeout(() => { try { window.close(); } catch { /* trình duyệt không cho đóng: màn hình "xong" vẫn hiện */ } }, 150);
}

export default function KetNoi() {
  const loc = useLocation();
  const nav = useNavigate();
  const [req] = useState(() => parseConnectRequest(loc.search));
  const hasOpener = !!opener();
  const meQ = useCurrentUser();
  const me = meQ.data ?? null;
  const isStudent = me?.role === 'student';
  const appQ = useExternalApp(req?.appId, !!req && hasOpener && isStudent);
  const classQ = useClass(isStudent ? me?.classId : undefined);
  const access = useConnectAccess();
  const out = useSignOut();
  const [done, setDone] = useState<'ok' | ErrorCode | null>(null);
  const reported = useRef(false);

  const app = appQ.data ?? null;
  const originOk = !!req && !!app && isAllowedOrigin(req.origin, app.allowedOrigins);
  // Lỗi không cần hỏi học sinh: báo cho app ngoài một lần rồi để em đọc lời giải thích.
  const autoError: ErrorCode | null = !req || !hasOpener || !me ? null
    : !isStudent ? 'not_student'
    : appQ.isSuccess && !app ? 'unknown_app'
    : appQ.isSuccess && !originOk ? 'origin_not_allowed'
    : null;
  useEffect(() => {
    if (autoError && req && !reported.current) { reported.current = true; post(req, { error: autoError }); }
  }, [autoError, req]);

  if (!req || !hasOpener) {
    return (
      <Shell mood="think" title="Trang này dùng để kết nối ứng dụng khác">
        <p className="ln-state__text">Em hãy mở lại từ nút “Đăng nhập bằng OPEN-EDU” trong ứng dụng học tập của mình nhé.</p>
        <Button size="lg" onClick={() => nav('/')}>Về trang Hôm nay</Button>
      </Shell>
    );
  }
  if (meQ.isPending) return <LoadingScreen />;
  if (!me) return <Navigate to="/dang-nhap" replace state={{ from: loc.pathname + loc.search }} />;

  const finish = (code: ErrorCode) => { post(req, { error: code }); setDone(code); closeSoon(); };
  const allow = () => {
    access.mutate(undefined, {
      onSuccess: (a) => {
        const sent = post(req, {
          user: { id: me.id, name: me.name, grade: me.grade ?? null, classId: me.classId ?? null, className: classQ.data?.name ?? null, avatarMascot: me.avatarMascot },
          token: a ? a.token : null,
          api: a ? a.api : null,
        });
        setDone(sent ? 'ok' : 'error');
        if (sent) closeSoon();
      },
      onError: () => { post(req, { error: 'error' }); setDone('error'); },
    });
  };
  const switchUser = () => out.mutate(undefined, { onSuccess: () => nav('/dang-nhap', { replace: true, state: { from: loc.pathname + loc.search } }) });

  if (done === 'ok') return <Shell mood="happy" title="Xong rồi!"><p className="ln-state__text">Em quay lại ứng dụng để học tiếp nhé. Cửa sổ này sẽ tự đóng.</p></Shell>;
  if (done === 'denied') return <Shell mood="think" title="Em đã chọn Không"><p className="ln-state__text">Em có thể đóng cửa sổ này.</p></Shell>;
  if (done === 'error') return <Shell mood="sad" title="Chưa kết nối được"><p className="ln-state__text">Em đóng cửa sổ này rồi bấm đăng nhập lại nhé.</p></Shell>;

  if (autoError === 'not_student') {
    return <Shell mood="think" title="Chỉ dành cho học sinh"><p className="ln-state__text">Tài khoản {me.name} không phải tài khoản học sinh nên không kết nối với ứng dụng ngoài được.</p>
      <Button size="lg" variant="secondary" onClick={switchUser}>Đổi tài khoản</Button></Shell>;
  }
  if (appQ.isPending) return <LoadingScreen label="Đang kiểm tra ứng dụng" />;
  if (appQ.isError) {
    return <Shell mood="sad" title="Chưa kiểm tra được ứng dụng"><p className="ln-state__text">Có thể mạng đang chập chờn. Em thử lại nhé!</p>
      <Button size="lg" onClick={() => void appQ.refetch()}>Thử lại</Button></Shell>;
  }
  if (autoError === 'unknown_app') {
    return <Shell mood="sad" title="Ứng dụng này chưa được nhà trường cho phép"><p className="ln-state__text">Em báo thầy/cô giúp nhé. Mã ứng dụng: <b>{req.appId}</b></p></Shell>;
  }
  if (autoError === 'origin_not_allowed' || !app) {
    return <Shell mood="sad" title="Địa chỉ này chưa được nhà trường cho phép"><p className="ln-state__text">Trang <b className="ln-connect__origin">{req.origin}</b> chưa được đăng kí cho ứng dụng «{app?.name ?? req.appId}». Em báo thầy/cô giúp nhé.</p></Shell>;
  }

  return (
    <div className="ln-state ln-connect">
      <Avatar mascot={me.avatarMascot} color={me.avatarColor} size={96} />
      <h1 className="ln-state__title">Chào {me.name}!</h1>
      <p className="ln-connect__ask">Cho phép <b>«{app.name}»</b> biết <b>tên, lớp</b> của em và <b>ghi kết quả học</b> vào hồ sơ?</p>
      <p className="ln-connect__origin" title="Địa chỉ của ứng dụng">{req.origin}</p>
      <div className="ln-row ln-row--center ln-connect__actions">
        <Button size="lg" variant="secondary" onClick={() => finish('denied')} disabled={access.isPending}>Không</Button>
        <Button size="lg" onClick={allow} disabled={access.isPending}>{access.isPending ? 'Đang kết nối…' : 'Cho phép'}</Button>
      </div>
      <button type="button" className="ln-connect__switch" onClick={switchUser}>Không phải {me.name}? Đổi tài khoản</button>
    </div>
  );
}

function Shell({ mood, title, children }: { mood: 'happy' | 'think' | 'sad'; title: string; children: React.ReactNode }) {
  return (
    <div className="ln-state ln-connect" role="status">
      <Mascot id="nghe" mood={mood} size={120} title="" />
      <h1 className="ln-state__title">{title}</h1>
      {children}
    </div>
  );
}
