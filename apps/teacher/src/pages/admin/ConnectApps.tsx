/** Quản trị → Ứng dụng kết nối: sổ đăng kí app ngoài được "Đăng nhập bằng OPEN-EDU" (docs/KET_NOI_APP_NGOAI.md). */
import { useState } from 'react';
import {
  APP_ID_RE, MAX_ORIGINS, buildConnectSnippet, parseOrigins, useDeleteExternalApp, useExternalApps, useSaveExternalApp,
  type ExternalApp,
} from '@openedu/data';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading, PageHead } from '../../components/common';
import { fmtDate } from '../../lib/format';
import { learnerBase } from './util';
import '../../styles/admin.css';

interface Draft { isNew: boolean; id: string; name: string; description: string; origins: string; enabled: boolean }

export default function ConnectApps() {
  const apps = useExternalApps();
  const save = useSaveExternalApp();
  const del = useDeleteExternalApp();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [snippet, setSnippet] = useState<ExternalApp | null>(null);
  const [confirm, setConfirm] = useState<ExternalApp | null>(null);
  const [copied, setCopied] = useState(false);

  const parsed = parseOrigins(edit?.origins ?? '');
  const idOk = !!edit && APP_ID_RE.test(edit.id);
  const canSave = !!edit && idOk && !!edit.name.trim() && !parsed.invalid.length && parsed.origins.length <= MAX_ORIGINS;
  const close = () => { setEdit(null); save.reset(); };
  const submit = () => {
    if (!edit || !canSave) return;
    save.mutate({ input: { id: edit.id, name: edit.name, description: edit.description, allowedOrigins: parsed.origins, enabled: edit.enabled }, isNew: edit.isNew }, { onSuccess: close });
  };
  const toggle = (a: ExternalApp) => save.mutate({ input: { ...a, enabled: !a.enabled }, isNew: false });
  const code = snippet ? buildConnectSnippet(learnerBase(), snippet.id) : '';
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }, () => undefined);
  };

  return (
    <div className="tc-page ad-page">
      <PageHead
        title="Ứng dụng kết nối"
        sub="Cho phép app hoặc trang HTML bên ngoài dùng “Đăng nhập bằng OPEN-EDU” và ghi kết quả học vào hồ sơ học sinh."
        actions={<Btn kind="primary" icon="plus" onClick={() => setEdit({ isNew: true, id: '', name: '', description: '', origins: '', enabled: true })}>Thêm ứng dụng</Btn>}
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
                    <td>{a.allowedOrigins.length ? a.allowedOrigins.map((o) => <div key={o}><code className="ad-code">{o}</code></div>) : <span className="tc-chip tc-chip--warn">Chưa có địa chỉ</span>}</td>
                    <td>{a.enabled ? <span className="tc-chip tc-chip--ok">Đang bật</span> : <span className="tc-chip">Đã tắt</span>}</td>
                    <td className="ad-actions">
                      <Btn size="sm" onClick={() => { setSnippet(a); setCopied(false); }}>Mã nhúng</Btn>
                      <Btn size="sm" icon="pencil" onClick={() => setEdit({ isNew: false, id: a.id, name: a.name, description: a.description, origins: a.allowedOrigins.join('\n'), enabled: a.enabled })}>Sửa</Btn>
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
          </div>
        ) : null}
      </Dialog>

      <Dialog open={!!snippet} onClose={() => setSnippet(null)} wide title={`Mã nhúng cho «${snippet?.name ?? ''}»`}
        footer={<><Btn onClick={() => setSnippet(null)}>Đóng</Btn><Btn kind="primary" onClick={copy}>{copied ? 'Đã chép' : 'Chép mã'}</Btn></>}>
        <div className="tc-stack">
          <p className="tc-muted">Dán đoạn này vào trang của ứng dụng (trước thẻ đóng &lt;/body&gt;). Hướng dẫn đầy đủ: docs/KET_NOI_APP_NGOAI.md, trang mẫu: examples/connect/doc-hieu-mau.html.</p>
          <pre className="ad-snippet" tabIndex={0}><code>{code}</code></pre>
          <p className="tc-muted">Địa chỉ app học sinh đang dùng: <code className="ad-code">{learnerBase()}</code>{snippet && !snippet.allowedOrigins.length ? ' · Ứng dụng này chưa có địa chỉ được phép nên chưa kết nối được.' : ''}</p>
        </div>
      </Dialog>
    </div>
  );
}
