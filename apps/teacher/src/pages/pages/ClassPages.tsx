/**
 * Trang học: GV / quản trị thêm trang web (đã được phép nhúng) hoặc bài trong app LTI cho lớp; học sinh mở ngay trong
 * OPEN-EDU (mục "Ứng dụng học"). Kèm danh sách "Trang được phép nhúng" (GV và quản trị đều thêm / bớt được).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Profile } from '@openedu/contracts';
import {
  isEmbeddable, launchStartUrl, siteOrigin, useAddEmbedSite, useClassPages, useDeleteClassPage, useEmbedSites, useLtiIssuer, useLtiTools,
  useRemoveEmbedSite, useSaveClassPage, type ClassPage, type LtiToolPublic,
} from '@openedu/data';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading, PageHead } from '../../components/common';
import { ClassPicker, useClassPick } from '../../lib/assess';
import { learnerBase } from '../admin/util';
import './pages.css';

interface Draft { id?: string; title: string; description: string; url: string; openIn: 'iframe' | 'window'; hidden: boolean }
const empty = (): Draft => ({ title: '', description: '', url: '', openIn: 'iframe', hidden: false });

export default function ClassPages({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const pages = useClassPages(classId || undefined);
  const sites = useEmbedSites();
  const tools = useLtiTools();
  const issuer = useLtiIssuer().data ?? null;
  const save = useSaveClassPage();
  const del = useDeleteClassPage();
  const addSite = useAddEmbedSite();
  const removeSite = useRemoveEmbedSite();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<ClassPage | null>(null);
  const [site, setSite] = useState({ origin: '', name: '' });
  const [sp, setSp] = useSearchParams();
  const [notice, setNotice] = useState('');

  // Quay về từ app sau khi chọn bài (Deep Linking): ?lti_dl=<số bài>.
  useEffect(() => {
    const n = sp.get('lti_dl');
    if (n !== null) {
      setNotice(Number(n) > 0 ? `Đã thêm ${n} bài từ ứng dụng vào Trang học của lớp.` : 'Chưa chọn bài nào trong ứng dụng.');
      setSp((p) => { const x = new URLSearchParams(p); x.delete('lti_dl'); return x; }, { replace: true });
    }
  }, [sp, setSp]);

  const origins = (sites.data ?? []).map((s) => s.origin);
  const draftOrigin = edit ? siteOrigin(edit.url) : null;
  const allowed = !!edit && isEmbeddable(edit.url, origins);
  const canSave = !!edit && !!edit.title.trim() && !!draftOrigin && (allowed || edit.openIn === 'window');
  const close = () => { setEdit(null); save.reset(); };
  const submit = () => {
    if (!edit || !canSave || !cls) return;
    save.mutate({ id: edit.id, classId: cls.id, title: edit.title, description: edit.description, kind: 'link', url: edit.url.trim(), appId: null, openIn: allowed ? edit.openIn : 'window', hidden: edit.hidden }, { onSuccess: close });
  };
  const toolName = (id: string | null) => (tools.data ?? []).find((t) => t.id === id)?.name ?? id ?? '';

  const addWholeApp = (t: LtiToolPublic) => cls && save.mutate({ classId: cls.id, title: t.name, description: t.description, kind: 'lti', url: null, appId: t.id, openIn: 'iframe', hidden: false });
  const pickInApp = (t: LtiToolPublic) => {
    if (!issuer || !cls || !t.deepLinkUrl) return;
    // Mở app ở thẻ mới: app → trang /lti/auth (app học sinh chuyển sang app giáo viên) → GV chọn bài → về lại trang này.
    window.open(launchStartUrl(t, issuer, user.id, `dl:${cls.id}`), '_blank', 'noopener');
  };
  const addSiteNow = (origin: string, name = '') => addSite.mutate({ origin, name }, { onSuccess: () => setSite({ origin: '', name: '' }) });
  const siteO = siteOrigin(site.origin);

  return (
    <div className="tc-page pg-page">
      <PageHead title="Trang học" sub="Trang web và bài trong ứng dụng học tập mà học sinh mở ngay trong OPEN-EDU." actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <Btn kind="primary" icon="plus" disabled={!cls} onClick={() => setEdit(empty())} data-testid="pg-add">Thêm trang web</Btn>
      </>} />
      {notice ? <div className="tc-alert tc-alert--ok" role="status"><span>{notice}</span></div> : null}
      <ErrorNote error={classes.error ?? pages.error ?? del.error ?? (edit ? null : save.error)} />
      {confirm ? <ConfirmBar text={`Xóa trang «${confirm.title}» khỏi lớp?`} busy={del.isPending} onCancel={() => setConfirm(null)} onConfirm={() => del.mutate(confirm.id, { onSettled: () => setConfirm(null) })} /> : null}

      <section className="tc-card">
        <header className="tc-card__head"><h2>Trang học của lớp {cls?.name ?? ''}</h2></header>
        {pages.isPending && classId ? <Loading /> : !(pages.data ?? []).length ? (
          <Empty icon="puzzle" title="Chưa có trang nào">Thêm trang web (bài đọc, video, trò chơi học tập…) hoặc chọn bài trong ứng dụng ở bên dưới.</Empty>
        ) : (
          <ul className="pg-list" data-testid="pg-list">
            {(pages.data ?? []).map((p) => (
              <li key={p.id} className={p.hidden ? 'is-hidden' : ''}>
                <div className="pg-list__main">
                  <strong>{p.title}</strong>
                  <span className="tc-small tc-muted">
                    {p.kind === 'lti' ? `Ứng dụng: ${toolName(p.appId)}${p.lti.custom ? ' · bài đã chọn' : ''}` : p.url}
                    {' · '}{p.openIn === 'iframe' ? 'mở trong OPEN-EDU' : 'mở thẻ mới'}{p.hidden ? ' · đang ẩn' : ''}
                  </span>
                </div>
                <span className="pg-list__actions">
                  <a className="tc-btn tc-btn--ghost tc-btn--sm" href={`${learnerBase()}/trang/${p.id}`} target="_blank" rel="noopener noreferrer">Xem như học sinh</a>
                  {p.kind === 'link' ? <Btn size="sm" icon="pencil" onClick={() => setEdit({ id: p.id, title: p.title, description: p.description, url: p.url ?? '', openIn: p.openIn, hidden: p.hidden })}>Sửa</Btn> : null}
                  <Btn size="sm" kind="ghost" onClick={() => save.mutate({ id: p.id, classId: p.classId, title: p.title, description: p.description, kind: p.kind, url: p.url, appId: p.appId, openIn: p.openIn, hidden: !p.hidden })}>{p.hidden ? 'Hiện' : 'Ẩn'}</Btn>
                  <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xóa ${p.title}`} onClick={() => setConfirm(p)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tc-card">
        <header className="tc-card__head"><h2>Bài trong ứng dụng học tập (LTI)</h2></header>
        {!(tools.data ?? []).length ? <p className="tc-small tc-muted">Chưa có ứng dụng LTI nào. Quản trị thêm ở “Ứng dụng kết nối”.</p> : (
          <ul className="pg-list">
            {(tools.data ?? []).map((t) => (
              <li key={t.id}>
                <div className="pg-list__main"><strong>{t.name}</strong>{t.description ? <span className="tc-small tc-muted">{t.description}</span> : null}</div>
                <span className="pg-list__actions">
                  {t.deepLinkUrl ? <Btn size="sm" kind="primary" disabled={!issuer || !cls} onClick={() => pickInApp(t)} title={!issuer ? 'Cần nối Supabase' : undefined}>Chọn bài trong app</Btn> : null}
                  <Btn size="sm" disabled={!cls || save.isPending} onClick={() => addWholeApp(t)}>Thêm cả ứng dụng</Btn>
                </span>
              </li>
            ))}
          </ul>
        )}
        {!issuer ? <p className="tc-small tc-muted">Chế độ thử (demo): chưa chọn bài trong app được vì chưa nối máy chủ.</p> : null}
      </section>

      <section className="tc-card" data-testid="pg-sites">
        <header className="tc-card__head"><h2>Trang được phép nhúng</h2></header>
        <p className="tc-small tc-muted">Chỉ trang trong danh sách này mới hiện được trong bài giảng (slide “Nhúng trang web”) và Trang học. Giáo viên và quản trị đều thêm / bớt được. Trang web phải cho phép hiện trong khung — nếu không, học sinh dùng nút “Mở trong tab mới”.</p>
        <div className="pg-siteform">
          <input className="tc-input" placeholder="https://doc.truong.edu.vn" value={site.origin} onChange={(e) => setSite({ ...site, origin: e.target.value })} aria-label="Địa chỉ trang" data-testid="pg-site-origin" />
          <input className="tc-input" placeholder="Tên (vd Luyện đọc của trường)" value={site.name} maxLength={80} onChange={(e) => setSite({ ...site, name: e.target.value })} aria-label="Tên trang" />
          <Btn icon="plus" disabled={!siteO || addSite.isPending} onClick={() => siteO && addSiteNow(siteO, site.name)} data-testid="pg-site-add">Thêm</Btn>
        </div>
        {site.origin && !siteO ? <p className="tc-small tc-warn">Địa chỉ phải bắt đầu bằng https:// (http chỉ dùng cho localhost khi thử).</p> : siteO && siteO !== site.origin.trim().replace(/\/+$/, '').toLowerCase() ? <p className="tc-small tc-muted">Sẽ thêm cả trang <code>{siteO}</code> (chỉ phần đầu địa chỉ).</p> : null}
        <ErrorNote error={addSite.error ?? removeSite.error} />
        <ul className="pg-sites">
          {(sites.data ?? []).map((s) => (
            <li key={s.origin}>
              <code>{s.origin}</code> <span className="tc-small tc-muted">{s.name}{s.builtin ? ' · có sẵn' : ''}</span>
              <Btn size="sm" kind="ghost" icon="trash" aria-label={`Bớt ${s.origin}`} disabled={removeSite.isPending} onClick={() => removeSite.mutate(s.origin)} />
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={!!edit} onClose={close} title={edit?.id ? 'Sửa trang' : 'Thêm trang web cho lớp'}
        footer={<><Btn onClick={close}>Hủy</Btn><Btn kind="primary" disabled={!canSave || save.isPending} onClick={submit} data-testid="pg-save">Lưu</Btn></>}>
        {edit ? (
          <div className="tc-stack">
            <ErrorNote error={save.error} />
            <Field label="Tên trang"><input className="tc-input" value={edit.title} maxLength={200} onChange={(e) => setEdit({ ...edit, title: e.target.value })} data-testid="pg-title" /></Field>
            <Field label="Địa chỉ trang" help={!edit.url ? 'Dán link trang web, ví dụ bài đọc trên trang luyện đọc của trường.' : !draftOrigin ? <span className="tc-warn">Địa chỉ phải bắt đầu bằng https://</span> : allowed ? <span className="tc-ok">Trang này được phép nhúng.</span> : (
              <span className="tc-warn">{draftOrigin} chưa có trong danh sách được phép nhúng. <Btn size="sm" disabled={addSite.isPending} onClick={() => addSiteNow(draftOrigin)} data-testid="pg-allow">Cho phép nhúng trang này</Btn> hoặc chọn “Mở ở thẻ mới”.</span>
            )}>
              <input className="tc-input" value={edit.url} spellCheck={false} onChange={(e) => setEdit({ ...edit, url: e.target.value })} data-testid="pg-url" />
            </Field>
            <Field label="Ghi chú cho học sinh"><input className="tc-input" value={edit.description} maxLength={500} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <label className="tc-row"><input type="radio" checked={edit.openIn === 'iframe'} disabled={!allowed} onChange={() => setEdit({ ...edit, openIn: 'iframe' })} /> <span>Mở ngay trong OPEN-EDU</span></label>
            <label className="tc-row"><input type="radio" checked={edit.openIn === 'window' || !allowed} onChange={() => setEdit({ ...edit, openIn: 'window' })} /> <span>Mở ở thẻ mới</span></label>
            <label className="tc-row"><input type="checkbox" checked={edit.hidden} onChange={(e) => setEdit({ ...edit, hidden: e.target.checked })} /> <span>Tạm ẩn với học sinh</span></label>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
