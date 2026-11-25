import { useState } from 'react';
import { uid, type ContentPackage, type PackageKind } from '@openedu/contracts';
import { useDeletePackage, usePackages, useSavePackage } from '@openedu/data';
import { Btn, ConfirmBar, Dialog, ErrorNote, Field } from '../../components/common';
import { contentOrigin } from '../../lib/env';
import { detectPackage, fmtBytes, slugify, type DetectedPackage } from '../../lib/pkgDetect';

const KIND_LABEL: Record<PackageKind, string> = { h5p: 'H5P', scorm12: 'SCORM 1.2', scorm2004: 'SCORM 2004', html: 'HTML5' };

export function PackageImportDialog({ open, onClose, ownerId, onRegistered }: { open: boolean; onClose: () => void; ownerId: string; onRegistered?: (p: ContentPackage) => void }) {
  const pkgs = usePackages();
  const delPkg = useDeletePackage();
  const [askDel, setAskDel] = useState<string | null>(null);
  const save = useSavePackage();
  const [det, setDet] = useState<DetectedPackage | null>(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<PackageKind>('html');
  const [entry, setEntry] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<ContentPackage | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null); setDet(null); setSaved(null); setBusy(true); setFileName(f.name);
    try {
      const d = detectPackage(await f.arrayBuffer(), f.name);
      setDet(d); setTitle(d.title); setKind(d.kind); setEntry(d.entry);
      setBaseUrl(`${contentOrigin()}packages/${slugify(d.title)}-${Math.random().toString(36).slice(2, 6)}/`);
    } catch (e) {
      setErr(e instanceof Error ? e : new Error('Không đọc được tệp nén này.'));
    } finally {
      setBusy(false);
    }
  };
  const register = () => {
    const b = baseUrl.trim().endsWith('/') ? baseUrl.trim() : `${baseUrl.trim()}/`;
    try { new URL(b); } catch { setErr(new Error('URL gốc chưa hợp lệ, ví dụ http://localhost:5180/packages/ten-goi/')); return; }
    save.mutate({ id: uid('pkg'), kind, title: title.trim() || fileName, baseUrl: b, entry: entry.trim(), ownerId, createdAt: new Date().toISOString() }, {
      onSuccess: (p) => { setSaved(p); onRegistered?.(p); },
    });
  };
  const folder = baseUrl.replace(contentOrigin(), '').replace(/\/$/, '');

  return (
    <Dialog open={open} onClose={onClose} title="Nhập gói HTML5 (H5P · SCORM · HTML)" wide footer={<><Btn onClick={onClose}>Đóng</Btn>{det && !saved ? <Btn kind="primary" onClick={register} disabled={save.isPending}>Đăng ký gói</Btn> : null}</>}>
      <div className="tc-stack">
        <label className="tc-drop">
          <input type="file" accept=".zip,.h5p,application/zip" onChange={(e) => void onFile(e.target.files?.[0])} />
          <strong>{busy ? 'Đang giải nén…' : fileName || 'Chọn tệp .zip hoặc .h5p'}</strong>
          <span className="tc-muted tc-small">Giải nén ngay trên trình duyệt để nhận dạng gói — chưa tải lên đâu cả.</span>
        </label>
        <ErrorNote error={err ?? save.error} />
        {det ? (
          <>
            <dl className="tc-dl">
              <dt>Loại</dt><dd>{KIND_LABEL[det.kind]}</dd>
              <dt>Tiêu đề</dt><dd>{det.title}</dd>
              <dt>Tệp mở đầu</dt><dd><code>{det.entry || '(thư mục gốc, có h5p.json)'}</code></dd>
              <dt>Số tệp</dt><dd>{det.fileCount} tệp · {fmtBytes(det.totalBytes)}{det.rootFolder ? ` · trong thư mục “${det.rootFolder}”` : ''}</dd>
            </dl>
            {det.warnings.map((w) => <p key={w} className="tc-small tc-warn">{w}</p>)}
            {!saved ? (
              <div className="tc-grid2 tc-grid2--tight">
                <Field label="Tiêu đề"><input className="tc-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
                <Field label="Loại gói"><select className="tc-input" value={kind} onChange={(e) => setKind(e.target.value as PackageKind)}>{(Object.keys(KIND_LABEL) as PackageKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>
                <Field label="Tệp mở đầu"><input className="tc-input" value={entry} onChange={(e) => setEntry(e.target.value)} /></Field>
                <Field label="URL gốc trên origin nội dung"><input className="tc-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} /></Field>
              </div>
            ) : (
              <div className="tc-alert tc-alert--ok"><span>Đã đăng ký gói <strong>{saved.title}</strong>. Gói dùng được ngay khi các tệp đã có ở <code>{saved.baseUrl}</code>.</span></div>
            )}
            <div className="tc-alert tc-alert--info">
              <span>
                <strong>Bước tải lên (làm tay ở giai đoạn này):</strong> giải nén tệp và chép {det.rootFolder ? `nội dung thư mục “${det.rootFolder}”` : 'toàn bộ tệp'} vào <code>content-host/{folder || 'packages/<ten-goi>'}</code> (máy chạy thử) hoặc tải lên bucket R2 của origin nội dung, sao cho <code>{baseUrl}{entry || 'h5p.json'}</code> mở được. Tải lên tự động qua Edge Function <code>pkg-sign</code> sẽ có ở giai đoạn sau.
              </span>
            </div>
          </>
        ) : null}
        <section>
          <h3 className="tc-h3">Gói đã có ({pkgs.data?.length ?? 0})</h3>
          <ul className="tc-list tc-list--plain">
            {(pkgs.data ?? []).map((p) => (
              <li key={p.id} className="tc-pkgrow">
                <span className="tc-chip">{KIND_LABEL[p.kind]}</span><strong>{p.title}</strong><code className="tc-small tc-muted">{p.baseUrl}{p.entry}</code>
                {askDel === p.id
                  ? <ConfirmBar text={`Xoá gói “${p.title}”? Bài giảng / bài đã giao đang dùng gói này sẽ không mở được nữa.`} busy={delPkg.isPending} onCancel={() => setAskDel(null)} onConfirm={() => delPkg.mutate(p.id, { onSuccess: () => setAskDel(null) })} />
                  : <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xoá gói ${p.title}`} onClick={() => setAskDel(p.id)} />}
              </li>
            ))}
          </ul>
          <ErrorNote error={delPkg.error} />
        </section>
      </div>
    </Dialog>
  );
}
