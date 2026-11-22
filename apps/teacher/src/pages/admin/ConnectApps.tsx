/** Quản trị → Ứng dụng kết nối: sổ đăng kí app ngoài được "Đăng nhập bằng OPEN-EDU" (docs/KET_NOI_APP_NGOAI.md). */
import { useState } from 'react';
import {
  APP_ID_RE, MAX_ORIGINS, buildConnectSnippet, ltiConfigError, newLtiClientId, parseOrigins, toolConfigJson, useDeleteExternalApp, useExternalApps, useLtiIssuer, useSaveExternalApp,
  type ExternalApp, type LtiConfig,
} from '@openedu/data';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading, PageHead } from '../../components/common';
import { fmtDate } from '../../lib/format';
import { learnerBase } from './util';
import '../../styles/admin.css';

interface LtiDraft { on: boolean; clientId: string; deploymentId: string; loginUrl: string; launchUrl: string; deepLinkUrl: string; jwksUrl: string; publicKey: string; redirects: string }
interface Draft { isNew: boolean; id: string; name: string; description: string; origins: string; enabled: boolean; lti: LtiDraft }

const ltiDraft = (c: LtiConfig | null): LtiDraft => ({
  on: !!c, clientId: c?.clientId ?? newLtiClientId(), deploymentId: c?.deploymentId ?? '1', loginUrl: c?.loginUrl ?? '', launchUrl: c?.launchUrl ?? '', deepLinkUrl: c?.deepLinkUrl ?? '',
  jwksUrl: c?.jwksUrl ?? '', publicKey: c?.publicKey ?? '', redirects: (c?.redirectUris ?? []).join('\n'),
});
function ltiOf(d: LtiDraft): LtiConfig | null {
  if (!d.on) return null;
  const redirectUris = d.redirects.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  return {
    clientId: d.clientId.trim(), deploymentId: d.deploymentId.trim(), loginUrl: d.loginUrl.trim(), launchUrl: d.launchUrl.trim(),
    ...(d.deepLinkUrl.trim() ? { deepLinkUrl: d.deepLinkUrl.trim() } : {}),
    ...(d.jwksUrl.trim() ? { jwksUrl: d.jwksUrl.trim() } : {}), ...(d.publicKey.trim() ? { publicKey: d.publicKey.trim() } : {}),
    ...(redirectUris.length ? { redirectUris } : {}),
  };
}

export default function ConnectApps() {
  const apps = useExternalApps();
  const save = useSaveExternalApp();
  const del = useDeleteExternalApp();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [snippet, setSnippet] = useState<ExternalApp | null>(null);
  const [confirm, setConfirm] = useState<ExternalApp | null>(null);
  const [copied, setCopied] = useState(false);
  const [ltiInfo, setLtiInfo] = useState<ExternalApp | null>(null);
  const issuer = useLtiIssuer().data ?? null;

  const parsed = parseOrigins(edit?.origins ?? '');
  const idOk = !!edit && APP_ID_RE.test(edit.id);
  const lti = edit ? ltiOf(edit.lti) : null;
  const ltiErr = lti ? ltiConfigError(lti) : null;
  const canSave = !!edit && idOk && !!edit.name.trim() && !parsed.invalid.length && parsed.origins.length <= MAX_ORIGINS && !ltiErr;
  const close = () => { setEdit(null); save.reset(); };
  const submit = () => {
    if (!edit || !canSave) return;
    save.mutate({ input: { id: edit.id, name: edit.name, description: edit.description, allowedOrigins: parsed.origins, enabled: edit.enabled, lti }, isNew: edit.isNew }, { onSuccess: close });
  };
  const toggle = (a: ExternalApp) => save.mutate({ input: { ...a, enabled: !a.enabled }, isNew: false });
  const code = snippet ? buildConnectSnippet(learnerBase(), snippet.id) : '';
  const copy = (text = code) => {
    void navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }, () => undefined);
  };
  const authUrl = `${learnerBase()}/lti/auth`;
  const ltiJson = ltiInfo?.lti && issuer ? JSON.stringify(toolConfigJson(issuer, authUrl, ltiInfo.lti), null, 2) : '';
  const newDraft = (): Draft => ({ isNew: true, id: '', name: '', description: '', origins: '', enabled: true, lti: ltiDraft(null) });

  return (
    <div className="tc-page ad-page">
      <PageHead
        title="Ứng dụng kết nối"
        sub="Cho phép app hoặc trang HTML bên ngoài dùng “Đăng nhập bằng OPEN-EDU” và ghi kết quả học vào hồ sơ học sinh."
        actions={<Btn kind="primary" icon="plus" onClick={() => setEdit(newDraft())}>Thêm ứng dụng</Btn>}
      />
      <div className="tc-alert tc-alert--info">
        <span>Chỉ đăng kí ứng dụng nhà trường tin cậy: khi học sinh bấm “Cho phép”, ứng dụng nhận tên, lớp và một phiên đăng nhập của em (hết hạn sau khoảng 1 giờ). Điểm từ ứng dụng ngoài hiển thị riêng trong hồ sơ, không cộng sao và không đổi mức thành thạo.</span>
      </div>
      <ErrorNote error={apps.error ?? del.error ?? (edit ? null : save.error)} onRetry={apps.error ? () => void apps.refetch() : undefined} />
      {confirm ? <ConfirmBar text={`Xóa ứng dụng «${confirm.name}»? Chỉ xóa được khi chưa có dữ liệu học sinh.`} busy={del.isPending} onCancel={() => setConfirm(null)} onConfirm={() => del.mutate(confirm.id, { onSettled: () => setConfirm(null) })} /> : null}
      {apps.isPending ? <Loading /> : !(apps.data ?? []).length ? (
        <Empty icon="puzzle" title="Chưa có ứng dụng nào">Bấm “Thêm ứng dụng” để đăng kí app đọc hiểu hoặc trang HTML của trường.</Empty>
      ) : (
        <section className="tc-card tc-card--flush">
          <div className="tc-tablewrap">
            <table className="tc-table ad-table">
              <thead><tr><th>Ứng dụng</th><th>Địa chỉ được phép (origin)</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {(apps.data ?? []).map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.name}</strong><span className="ad-sub"><code className="ad-code">{a.id}</code> · thêm {fmtDate(a.createdAt)}</span>{a.description ? <span className="ad-sub">{a.description}</span> : null}</td>
                    <td>{a.allowedOrigins.length ? a.allowedOrigins.map((o) => <div key={o}><code className="ad-code">{o}</code></div>) : a.lti ? <span className="tc-muted">—</span> : <span className="tc-chip tc-chip--warn">Chưa có địa chỉ</span>}</td>
                    <td>{a.enabled ? <span className="tc-chip tc-chip--ok">Đang bật</span> : <span className="tc-chip">Đã tắt</span>}{a.lti ? <> <span className="tc-chip" title="Kết nối theo chuẩn LTI 1.3">LTI 1.3</span></> : null}</td>
                    <td className="ad-actions">
                      {a.lti ? <Btn size="sm" onClick={() => { setLtiInfo(a); setCopied(false); }} data-testid={`lti-info-${a.id}`}>Cấu hình LTI</Btn> : null}
                      {a.allowedOrigins.length || !a.lti ? <Btn size="sm" onClick={() => { setSnippet(a); setCopied(false); }}>Mã nhúng</Btn> : null}
                      <Btn size="sm" icon="pencil" onClick={() => setEdit({ isNew: false, id: a.id, name: a.name, description: a.description, origins: a.allowedOrigins.join('\n'), enabled: a.enabled, lti: ltiDraft(a.lti) })}>Sửa</Btn>
                      <Btn size="sm" kind="ghost" disabled={save.isPending} onClick={() => toggle(a)}>{a.enabled ? 'Tắt' : 'Bật'}</Btn>
                      <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xóa ${a.name}`} title="Xóa" onClick={() => setConfirm(a)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Dialog open={!!edit} onClose={close} title={edit?.isNew ? 'Thêm ứng dụng' : `Sửa «${edit?.name ?? ''}»`}
        footer={<><Btn onClick={close}>Hủy</Btn><Btn kind="primary" disabled={!canSave || save.isPending} onClick={submit}>Lưu</Btn></>}>
        {edit ? (
          <div className="tc-stack">
            <ErrorNote error={save.error} />
            <Field label="Tên ứng dụng" help="Học sinh sẽ thấy tên này trên màn hình xin phép."><input className="tc-input" value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Mã ứng dụng" help={edit.id && !idOk ? 'Chỉ gồm chữ thường không dấu, số và gạch nối, 2–40 kí tự. Ví dụ: doc-hieu' : 'Dùng trong mã nhúng (appId). Không đổi được sau khi tạo.'}>
              <input className="tc-input" value={edit.id} maxLength={40} disabled={!edit.isNew} placeholder="doc-hieu" onChange={(e) => setEdit({ ...edit, id: e.target.value.trim().toLowerCase() })} />
            </Field>
            <Field label="Địa chỉ được phép (mỗi dòng một origin)"
              help={parsed.invalid.length
                ? <span className="tc-warn">Chưa đúng: {parsed.invalid.join(', ')}. Chỉ ghi phần đầu địa chỉ, ví dụ https://doc.truong.edu.vn (không có đường dẫn, không dùng *). http chỉ dùng cho localhost khi thử.</span>
                : 'Ví dụ https://doc.truong.edu.vn hoặc http://localhost:3000 (khi thử trên máy). Tệp HTML mở thẳng từ ổ đĩa (file://) không kết nối được — hãy đưa lên một trang web.'}>
              <textarea className="tc-input" rows={3} value={edit.origins} spellCheck={false} onChange={(e) => setEdit({ ...edit, origins: e.target.value })} />
            </Field>
            <Field label="Ghi chú"><input className="tc-input" value={edit.description} maxLength={300} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <label className="tc-row"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> <span>Đang bật (học sinh kết nối được)</span></label>
            <fieldset className="ad-lti">
              <legend>
                <label className="tc-row"><input type="checkbox" data-testid="lti-on" checked={edit.lti.on} onChange={(e) => setEdit({ ...edit, lti: { ...edit.lti, on: e.target.checked } })} /> <strong>Kết nối chuẩn LTI 1.3</strong></label>
              </legend>
              <p className="tc-small tc-muted">Dùng khi app đã có sẵn mã LTI (ví dụ FastAPI + pylti1p3). Học sinh mở app từ mục “Ứng dụng học”, app nhận tên, lớp và gửi điểm về hồ sơ. Không cần điền ô “Địa chỉ được phép” ở trên.</p>
              {edit.lti.on ? (
                <div className="tc-stack">
                  <Field label="Login URL của app" help="Địa chỉ /lti/login của app."><input className="tc-input" data-testid="lti-login" value={edit.lti.loginUrl} placeholder="https://doc.truong.edu.vn/lti/login" spellCheck={false} onChange={(e) => setEdit({ ...edit, lti: { ...edit.lti, loginUrl: e.target.value } })} /></Field>
                  <Field label="Launch URL của app" help="Địa chỉ /lti/launch (target_link_uri, cũng là redirect_uri)."><input className="tc-input" data-testid="lti-launch" value={edit.lti.launchUrl} placeholder="https://doc.truong.edu.vn/lti/launch" spellCheck={false} onChange={(e) => setEdit({ ...edit, lti: { ...edit.lti, launchUrl: e.target.value } })} /></Field>
                  <Field label="Deep link URL của app (không bắt buộc)" help="Địa chỉ /lti/chon-bai — để giáo viên chọn bài trong app rồi giao cho lớp (mục Trang học)."><input className="tc-input" data-testid="lti-dl" value={edit.lti.deepLinkUrl} placeholder="https://doc.truong.edu.vn/lti/chon-bai" spellCheck={false} onChange={(e) => setEdit({ ...edit, lti: { ...edit.lti, deepLinkUrl: e.target.value } })} /></Field>
                  <Field label="JWKS URL của app" help="Địa chỉ /lti/jwks — OPEN-EDU lấy khóa công khai của app ở đây để kiểm khi app gửi điểm."><input className="tc-input" data-testid="lti-jwks" value={edit.lti.jwksUrl} placeholder="https://doc.truong.edu.vn/lti/jwks" spellCheck={false} onChange={(e) => setEdit({ ...edit, lti: { ...edit.lti, jwksUrl: e.target.value } })} /></Field>
                  <Field label="Hoặc dán khóa công khai của app (public.key)" help="Chỉ cần khi app không có JWKS URL."><textarea className="tc-input" rows={3} value={edit.lti.publicKey} spellCheck={false} placeholder="-----BEGIN PUBLIC KEY-----" onChange={(e) => setEdit({ ...edit, lti: { ...edit.lti, publicKey: e.target.value } })} /></Field>
                  <div className="ad-lti__ids">
                    <Field label="Client ID (OPEN-EDU tự tạo)"><input className="tc-input" value={edit.lti.clientId} spellCheck={false} onChange={(e) => setEdit({ ...edit, lti: { ...edit.lti, clientId: e.target.value.trim() } })} /></Field>
                    <Field label="Deployment ID"><input className="tc-input" value={edit.lti.deploymentId} spellCheck={false} onChange={(e) => setEdit({ ...edit, lti: { ...edit.lti, deploymentId: e.target.value.trim() } })} /></Field>
                  </div>
                  {ltiErr && (edit.lti.loginUrl || edit.lti.launchUrl) ? <span className="tc-warn tc-small" data-testid="lti-err">{ltiErr}</span> : null}
                </div>
              ) : null}
            </fieldset>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={!!ltiInfo} onClose={() => setLtiInfo(null)} wide title={`Cấu hình LTI 1.3 cho «${ltiInfo?.name ?? ''}»`}
        footer={<><Btn onClick={() => setLtiInfo(null)}>Đóng</Btn>{ltiJson ? <Btn kind="primary" onClick={() => copy(ltiJson)}>{copied ? 'Đã chép' : 'Chép lti_config.json'}</Btn> : null}</>}>
        {ltiInfo?.lti ? (
          <div className="tc-stack" data-testid="lti-info">
            {!issuer ? <div className="tc-alert tc-alert--info"><span>Đang chạy chế độ thử (demo): chưa có máy chủ để kí đăng nhập LTI. Nối OPEN-EDU với Supabase rồi mở lại trang này để lấy cấu hình đúng.</span></div> : null}
            <p className="tc-muted">Điền các giá trị sau vào app (với pylti1p3: tệp <code className="ad-code">lti_config.json</code>). Mã mẫu FastAPI: <code className="ad-code">examples/lti-fastapi</code>, hướng dẫn: docs/KET_NOI_LTI.md.</p>
            <table className="tc-table ad-table ad-lti__table">
              <tbody>
                <tr><th>Issuer (iss)</th><td><code className="ad-code">{issuer ?? '(cần Supabase)'}</code></td></tr>
                <tr><th>Client ID</th><td><code className="ad-code">{ltiInfo.lti.clientId}</code></td></tr>
                <tr><th>Deployment ID</th><td><code className="ad-code">{ltiInfo.lti.deploymentId}</code></td></tr>
                <tr><th>Auth login URL</th><td><code className="ad-code">{authUrl}</code></td></tr>
                <tr><th>Token URL</th><td><code className="ad-code">{issuer ? `${issuer}/token` : '—'}</code></td></tr>
                <tr><th>Key set (JWKS) URL</th><td><code className="ad-code">{issuer ? `${issuer}/jwks` : '—'}</code></td></tr>
              </tbody>
            </table>
            {ltiJson ? <pre className="ad-snippet" tabIndex={0}><code>{ltiJson}</code></pre> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog open={!!snippet} onClose={() => setSnippet(null)} wide title={`Mã nhúng cho «${snippet?.name ?? ''}»`}
        footer={<><Btn onClick={() => setSnippet(null)}>Đóng</Btn><Btn kind="primary" onClick={() => copy()}>{copied ? 'Đã chép' : 'Chép mã'}</Btn></>}>
        <div className="tc-stack">
          <p className="tc-muted">Dán đoạn này vào trang của ứng dụng (trước thẻ đóng &lt;/body&gt;). Hướng dẫn đầy đủ: docs/KET_NOI_APP_NGOAI.md, trang mẫu: examples/connect/doc-hieu-mau.html.</p>
          <pre className="ad-snippet" tabIndex={0}><code>{code}</code></pre>
          <p className="tc-muted">Địa chỉ app học sinh đang dùng: <code className="ad-code">{learnerBase()}</code>{snippet && !snippet.allowedOrigins.length ? ' · Ứng dụng này chưa có địa chỉ được phép nên chưa kết nối được.' : ''}</p>
        </div>
      </Dialog>
    </div>
  );
}
