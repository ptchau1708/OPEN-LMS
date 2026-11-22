/**
 * /lti/auth (app giáo viên) — giáo viên chọn bài trong app LTI (Deep Linking). App học sinh chuyển yêu cầu 'dl:' sang
 * đây vì phiên đăng nhập của giáo viên nằm ở app này. Gọi /authorize kèm phiên đăng nhập → tự gửi biểu mẫu tới app.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useLtiAuthorize } from '@openedu/data';
import { Loading } from '../../components/common';

const KEEP = ['scope', 'response_type', 'response_mode', 'prompt', 'client_id', 'redirect_uri', 'login_hint', 'lti_message_hint', 'state', 'nonce'];

export default function TeacherLtiAuth() {
  const loc = useLocation();
  const auth = useLtiAuthorize();
  const [params] = useState(() => {
    const q = new URLSearchParams(loc.search);
    return Object.fromEntries(KEEP.filter((k) => q.has(k)).map((k) => [k, q.get(k) ?? '']));
  });
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !params.client_id) return;
    started.current = true;
    auth.mutate({ params, returnUrl: `${location.origin}/trang-hoc?lop=${encodeURIComponent((params.lti_message_hint ?? '').replace(/^dl:/, ''))}` }, {
      onSuccess: (r) => {
        const f = document.createElement('form');
        f.method = 'POST';
        f.action = r.action;
        for (const [k, v] of Object.entries(r.fields)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); }
        document.body.appendChild(f);
        f.submit();
      },
    });
  }, [params, auth]);
  return (
    <div className="tc-app theme-pro tc-center">
      {!params.client_id ? <p>Thiếu thông tin. Thầy cô mở lại từ mục “Trang học”.</p>
        : auth.isError ? <div className="tc-alert tc-alert--error" role="alert"><span data-testid="lti-auth-error">{auth.error instanceof Error ? auth.error.message : 'Chưa mở được ứng dụng.'}</span></div>
        : <Loading label="Đang mở ứng dụng…" />}
    </div>
  );
}
