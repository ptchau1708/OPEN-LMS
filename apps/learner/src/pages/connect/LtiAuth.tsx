/**
 * /lti/auth — bước 2–4 của đăng nhập LTI 1.3 (docs/KET_NOI_LTI.md). App ngoài chuyển trình duyệt về đây với
 * scope, response_type, client_id, redirect_uri, login_hint, state, nonce, lti_message_hint…
 * Trang gửi các tham số đó + phiên đăng nhập của em lên máy chủ (Edge Function `lti`, /authorize). Máy chủ kiểm tra
 * (app đã đăng kí, redirect_uri khớp, login_hint đúng là em, em thuộc lớp) rồi kí id_token; trang tự gửi biểu mẫu
 * (form_post) id_token + state về app. Trang KHÔNG tự kí gì và không lộ phiên đăng nhập cho app.
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useCurrentUser, useLtiAuthorize, useSignOut } from '@openedu/data';
import { Button, Mascot } from '@openedu/ui';
import { LoadingScreen } from '../../components/Common';
import { teacherUrl } from '../../lib/util';
import '../../styles/connect.css';

const KEEP = ['scope', 'response_type', 'response_mode', 'prompt', 'client_id', 'redirect_uri', 'login_hint', 'lti_message_hint', 'state', 'nonce', 'lti_storage_target'];

function postForm(action: string, fields: Record<string, string>) {
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = action;
  f.style.display = 'none';
  for (const [k, v] of Object.entries(fields)) {
    const i = document.createElement('input');
    i.type = 'hidden';
    i.name = k;
    i.value = v;
    f.appendChild(i);
  }
  document.body.appendChild(f);
  f.submit();
}

export default function LtiAuth() {
  const loc = useLocation();
  const nav = useNavigate();
  const meQ = useCurrentUser();
  const me = meQ.data ?? null;
  const auth = useLtiAuthorize();
  const out = useSignOut();
  const [params] = useState(() => {
    const q = new URLSearchParams(loc.search);
    return Object.fromEntries(KEEP.filter((k) => q.has(k)).map((k) => [k, q.get(k) ?? '']));
  });
  const started = useRef(false);
  // Giáo viên chọn bài (Deep Linking): đăng nhập ở app giáo viên → chuyển nguyên tham số sang /lti/auth của app đó.
  const isDl = (params.lti_message_hint ?? '').startsWith('dl:');
  useEffect(() => { if (isDl) window.location.replace(`${teacherUrl().replace(/\/+$/, '')}/lti/auth${loc.search}`); }, [isDl, loc.search]);
  const valid = !!params.client_id && !!params.redirect_uri && !!params.nonce && !!params.login_hint;
  const wrongUser = !!me && !!params.login_hint && params.login_hint !== me.id;

  useEffect(() => {
    if (isDl || !me || !valid || wrongUser || started.current) return;
    started.current = true;
    auth.mutate({ params }, { onSuccess: (r) => postForm(r.action, r.fields) });
  }, [isDl, me, valid, wrongUser, params, auth]);

  if (isDl) return <LoadingScreen label="Đang chuyển sang trang giáo viên" />;

  if (!valid) return <Shell mood="think" title="Chưa mở được ứng dụng"><p className="ln-state__text">Em hãy mở lại ứng dụng từ mục “Ứng dụng học” trong OPEN-EDU nhé.</p><Button size="lg" onClick={() => nav('/')}>Về trang Hôm nay</Button></Shell>;
  if (meQ.isPending) return <LoadingScreen />;
  if (!me) return <Navigate to="/dang-nhap" replace state={{ from: loc.pathname + loc.search }} />;
  const switchUser = () => out.mutate(undefined, { onSuccess: () => nav('/dang-nhap', { replace: true, state: { from: loc.pathname + loc.search } }) });
  if (wrongUser) {
    return <Shell mood="think" title="Tài khoản khác"><p className="ln-state__text">Ứng dụng được mở bằng tài khoản khác với <b>{me.name}</b>. Em đăng nhập đúng tài khoản rồi mở lại nhé.</p>
      <Button size="lg" variant="secondary" onClick={switchUser}>Đổi tài khoản</Button></Shell>;
  }
  if (auth.isError) {
    return <Shell mood="sad" title="Chưa mở được ứng dụng"><p className="ln-state__text" data-testid="lti-auth-error">{auth.error instanceof Error ? auth.error.message : 'Em thử lại nhé.'}</p>
      <Button size="lg" onClick={() => nav('/ung-dung')}>Về Ứng dụng học</Button></Shell>;
  }
  return <LoadingScreen label="Đang mở ứng dụng" />;
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
