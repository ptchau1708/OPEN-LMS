/**
 * Trang học: GV / quản trị thêm trang web (đã được phép nhúng) hoặc bài trong app LTI cho lớp; học sinh mở ngay trong
 * OPEN-EDU (mục "Ứng dụng học"). Kèm danh sách "Trang được phép nhúng" (GV và quản trị đều thêm / bớt được).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Profile } from '@openedu/contracts';
import {
  buildPageTree, flattenTree, isEmbeddable, launchStartUrl, MAX_PAGE_DEPTH, moveAmongSiblings, parentOptions, siteOrigin, useAddEmbedSite, useClassPages,
  useDeleteClassPage, useEmbedSites, useLtiIssuer, useLtiTools, useMovePages, useRemoveEmbedSite, useSaveClassPage, type ClassPage, type ClassPageKind, type LtiToolPublic,
} from '@openedu/data';
import { Icon } from '@openedu/ui';
import { Btn, ConfirmBar, Dialog, Empty, ErrorNote, Field, Loading, PageHead } from '../../components/common';
import { ClassPicker, useClassPick } from '../../lib/assess';
import { learnerBase } from '../admin/util';
import './pages.css';
import { discussionEmbedToken, useDiscussions } from '@openedu/data';

/** Chèn một phòng thảo luận vào trang: thêm dòng [[thao-luan:…]] — HS thấy nút “Vào thảo luận”. */
function InsertDiscussion({ classId, onPick }: { classId: string; onPick: (token: string) => void }) {
  const q = useDiscussions(classId || undefined);
  const list = (q.data ?? []).filter((d) => !d.archived);
  if (!list.length) return null;
  return (
    <label className="tc-row tc-wrap tc-small">
      <span>Chèn phòng thảo luận:</span>
      <select className="tc-input tc-input--sm" value="" onChange={(e) => { const d = list.find((x) => x.id === e.target.value); if (d) onPick(discussionEmbedToken(d)); }} data-testid="pg-insert-discussion">
        <option value="">— chọn phòng —</option>
        {list.map((d) => <option key={d.id} value={d.id}>{d.kind === 'chat' ? '💬 ' : ''}{d.title}</option>)}
      </select>
    </label>
  );
}

interface Draft { id?: string; kind: ClassPageKind; title: string; description: string; url: string; openIn: 'iframe' | 'window'; hidden: boolean; parentId: string | null; body: string; appId: string | null }
const empty = (kind: ClassPageKind = 'section', parentId: string | null = null): Draft => ({ kind, title: '', description: '', url: '', openIn: 'iframe', hidden: false, parentId, body: '', appId: null });
const fromPage = (p: ClassPage): Draft => ({ id: p.id, kind: p.kind, title: p.title, description: p.description, url: p.url ?? '', openIn: p.openIn, hidden: p.hidden, parentId: p.parentId, body: p.body, appId: p.appId });
const KIND_ICON = { section: 'book', link: 'map', lti: 'puzzle' } as const;

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
  const move = useMovePages();
  const all = pages.data ?? [];
  const tree = flattenTree(buildPageTree(all));
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
  const canSave = !!edit && !!edit.title.trim() && (edit.kind !== 'link' || !!draftOrigin);
  const close = () => { setEdit(null); save.reset(); };
  const submit = async () => {
    if (!edit || !canSave || !cls) return;
    // "Mở ngay trong OPEN-EDU" với trang chưa có trong danh sách: thêm vào danh sách được phép nhúng trước (GV / quản trị đều được).
    if (edit.kind === 'link' && edit.openIn === 'iframe' && !allowed && draftOrigin) {
      try { await addSite.mutateAsync({ origin: draftOrigin, name: edit.title.trim().slice(0, 80) }); } catch { /* đã có hoặc không thêm được: lỗi hiện ở dưới */ }
    }
    save.mutate({
      id: edit.id, classId: cls.id, title: edit.title, description: edit.description, kind: edit.kind,
      url: edit.kind === 'link' ? edit.url.trim() : edit.kind === 'lti' ? (edit.url || null) : null,
      appId: edit.kind === 'lti' ? edit.appId : null, openIn: edit.openIn, hidden: edit.hidden, parentId: edit.parentId, body: edit.body,
    }, { onSuccess: close });
  };
  const moveBy = (p: ClassPage, dir: -1 | 1) => { const m = moveAmongSiblings(all, p.id, dir); if (m.length) move.mutate(m); };
  const sibIndex = (p: ClassPage) => { const sib = all.filter((x) => (x.parentId ?? null) === (p.parentId ?? null)).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)); return { i: sib.findIndex((x) => x.id === p.id), n: sib.length }; };
  const parents = edit ? parentOptions(all, edit.id) : [];
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
      <PageHead title="Trang học" sub="Trang của lớp như một trang web nhỏ (giống Google Sites): trang nội dung, trang con, trang web nhúng và bài trong ứng dụng. Học sinh mở ngay trong OPEN-EDU." actions={<>
        <ClassPicker list={list} value={classId} onChange={setClassId} />
        <Btn icon="plus" disabled={!cls} onClick={() => setEdit(empty('link'))} data-testid="pg-add">Thêm trang web</Btn>
        <Btn kind="primary" icon="plus" disabled={!cls} onClick={() => setEdit(empty('section'))} data-testid="pg-add-section">Thêm trang</Btn>
      </>} />
      {notice ? <div className="tc-alert tc-alert--ok" role="status"><span>{notice}</span></div> : null}
      <ErrorNote error={classes.error ?? pages.error ?? del.error ?? (edit ? null : save.error)} />
      {confirm ? <ConfirmBar text={`Xóa trang «${confirm.title}» khỏi lớp?${all.some((x) => x.parentId === confirm.id) ? ' Các trang con của nó sẽ lên làm trang chính (không bị xóa).' : ''}`} busy={del.isPending} onCancel={() => setConfirm(null)} onConfirm={() => del.mutate(confirm.id, { onSettled: () => setConfirm(null) })} /> : null}

      <section className="tc-card">
        <header className="tc-card__head"><h2>Trang học của lớp {cls?.name ?? ''}</h2></header>
        {pages.isPending && classId ? <Loading /> : !(pages.data ?? []).length ? (
          <Empty icon="puzzle" title="Chưa có trang nào">Bấm <strong>Thêm trang</strong> để tạo trang theo môn / chủ đề (vd “Tiếng Việt”, “Tuần 12”), rồi thêm trang con và trang web nhúng vào trong. Hoặc chọn bài trong ứng dụng ở bên dưới.</Empty>
        ) : (
          <ul className="pg-list pg-tree" data-testid="pg-list">
            {tree.map(({ page: p, depth }) => {
              const { i, n } = sibIndex(p);
              return (
                <li key={p.id} className={p.hidden ? 'is-hidden' : ''} style={{ ['--depth' as string]: depth }} data-testid="pg-row">
                  <div className="pg-list__main">
                    <span className="pg-tree__title"><Icon name={KIND_ICON[p.kind]} size={18} /> <strong>{p.title}</strong></span>
                    <span className="tc-small tc-muted">
                      {p.kind === 'section' ? `Trang nội dung${all.some((x) => x.parentId === p.id) ? ` · ${all.filter((x) => x.parentId === p.id).length} trang con` : ''}` : p.kind === 'lti' ? `Ứng dụng: ${toolName(p.appId)}${p.lti.custom ? ' · bài đã chọn' : ''}` : p.url}
                      {p.kind !== 'section' ? ` · ${p.openIn === 'iframe' ? 'mở trong OPEN-EDU' : 'mở thẻ mới'}` : ''}{p.hidden ? ' · đang ẩn' : ''}
                    </span>
                  </div>
                  <span className="pg-list__actions">
                    <Btn size="sm" kind="ghost" aria-label={`Đưa ${p.title} lên`} title="Đưa lên" disabled={i <= 0 || move.isPending} onClick={() => moveBy(p, -1)} data-testid="pg-up">↑</Btn>
                    <Btn size="sm" kind="ghost" aria-label={`Đưa ${p.title} xuống`} title="Đưa xuống" disabled={i >= n - 1 || move.isPending} onClick={() => moveBy(p, 1)}>↓</Btn>
                    {depth < MAX_PAGE_DEPTH - 1 ? <Btn size="sm" icon="plus" onClick={() => setEdit(empty('section', p.id))} data-testid="pg-add-child">Trang con</Btn> : null}
                    <a className="tc-btn tc-btn--ghost tc-btn--sm" href={`${learnerBase()}/trang/${p.id}`} target="_blank" rel="noopener noreferrer">Xem như học sinh</a>
                    <Btn size="sm" icon="pencil" onClick={() => setEdit(fromPage(p))} data-testid="pg-edit">Sửa</Btn>
                    <Btn size="sm" kind="ghost" onClick={() => save.mutate({ id: p.id, classId: p.classId, title: p.title, description: p.description, kind: p.kind, url: p.url, appId: p.appId, openIn: p.openIn, hidden: !p.hidden })}>{p.hidden ? 'Hiện' : 'Ẩn'}</Btn>
                    <Btn size="sm" kind="ghost" icon="trash" aria-label={`Xóa ${p.title}`} onClick={() => setConfirm(p)} />
                  </span>
                </li>
              );
            })}
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

      <Dialog open={!!edit} onClose={close} wide title={edit?.id ? 'Sửa trang' : edit?.kind === 'link' ? 'Thêm trang web nhúng' : 'Thêm trang'}
        footer={<><Btn onClick={close}>Hủy</Btn><Btn kind="primary" disabled={!canSave || save.isPending || addSite.isPending} onClick={() => void submit()} data-testid="pg-save">Lưu</Btn></>}>
        {edit ? (
          <div className="tc-stack">
            <ErrorNote error={save.error ?? addSite.error} />
            {edit.kind !== 'lti' ? (
              <div className="tc-seg" role="group" aria-label="Loại trang">
                <button type="button" aria-pressed={edit.kind === 'section'} onClick={() => setEdit({ ...edit, kind: 'section' })} data-testid="pg-kind-section">Trang nội dung</button>
                <button type="button" aria-pressed={edit.kind === 'link'} onClick={() => setEdit({ ...edit, kind: 'link' })} data-testid="pg-kind-link">Trang web nhúng</button>
              </div>
            ) : <p className="tc-small tc-muted">Bài trong ứng dụng: {toolName(edit.appId)}</p>}
            <Field label="Tên trang"><input className="tc-input" value={edit.title} maxLength={200} onChange={(e) => setEdit({ ...edit, title: e.target.value })} data-testid="pg-title" placeholder={edit.kind === 'section' ? 'vd: Tiếng Việt · Tuần 12 · Ôn tập học kì I' : 'vd: Bài đọc “Cây bàng”'} /></Field>
            <Field label="Nằm trong" help="Chọn trang cha để đặt trang này làm trang con. Sâu tối đa 4 tầng.">
              <select className="tc-input" value={edit.parentId ?? ''} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })} data-testid="pg-parent">
                <option value="">— Trang chính (không nằm trong trang nào) —</option>
                {parents.map(({ page, depth }) => <option key={page.id} value={page.id}>{`${'\u00a0\u00a0\u00a0'.repeat(depth)}${depth ? '└ ' : ''}${page.title}`}</option>)}
              </select>
            </Field>
            {edit.kind === 'link' ? (
              <>
                <Field label="Địa chỉ trang" help={!edit.url ? 'Dán link trang web: bài đọc, video YouTube, Google Tài liệu, Wordwall, Canva…' : !draftOrigin ? <span className="tc-warn">Địa chỉ phải bắt đầu bằng https://</span> : allowed ? <span className="tc-ok">Trang này được phép nhúng.</span> : (
                  <span className="tc-warn">{draftOrigin} chưa có trong danh sách được phép nhúng — khi lưu với “Mở ngay trong OPEN-EDU”, trang sẽ được thêm vào danh sách. <Btn size="sm" disabled={addSite.isPending} onClick={() => addSiteNow(draftOrigin)} data-testid="pg-allow">Cho phép ngay</Btn></span>
                )}>
                  <input className="tc-input" value={edit.url} spellCheck={false} onChange={(e) => setEdit({ ...edit, url: e.target.value })} data-testid="pg-url" />
                </Field>
                <label className="tc-row"><input type="radio" checked={edit.openIn === 'iframe'} onChange={() => setEdit({ ...edit, openIn: 'iframe' })} data-testid="pg-open-iframe" /> <span>Hiện ngay trong trang (OPEN-EDU)</span></label>
                <label className="tc-row"><input type="radio" checked={edit.openIn === 'window'} onChange={() => setEdit({ ...edit, openIn: 'window' })} /> <span>Mở ở thẻ mới</span></label>
                <p className="tc-small tc-muted">Một số trang không cho hiện trong khung của trang khác (vd Google Drive cần link “Xem trước” hoặc “Nhúng”, Facebook…). Khi đó học sinh bấm “Mở thẻ mới ↗” ngay trên trang.</p>
              </>
            ) : null}
            {edit.kind === 'lti' ? (
              <>
                <label className="tc-row"><input type="radio" checked={edit.openIn === 'iframe'} onChange={() => setEdit({ ...edit, openIn: 'iframe' })} /> <span>Hiện ngay trong trang (OPEN-EDU)</span></label>
                <label className="tc-row"><input type="radio" checked={edit.openIn === 'window'} onChange={() => setEdit({ ...edit, openIn: 'window' })} /> <span>Mở ở thẻ mới</span></label>
              </>
            ) : null}
            <Field label={edit.kind === 'section' ? 'Nội dung trang' : 'Lời dẫn (hiện phía trên trang)'} help="Viết như bình thường; xuống dòng để tách đoạn. Dòng bắt đầu bằng “- ” thành gạch đầu dòng.">
              <textarea className="tc-input" rows={edit.kind === 'section' ? 8 : 3} maxLength={20000} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} data-testid="pg-body" />
            </Field>
            <InsertDiscussion classId={classId} onPick={(tok) => setEdit({ ...edit, body: `${edit.body.trimEnd()}${edit.body.trim() ? '\n\n' : ''}${tok}\n` })} />
            <Field label="Mô tả ngắn (hiện trên thẻ trang)"><input className="tc-input" value={edit.description} maxLength={500} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <label className="tc-row"><input type="checkbox" checked={edit.hidden} onChange={(e) => setEdit({ ...edit, hidden: e.target.checked })} /> <span>Tạm ẩn với học sinh (ẩn cả các trang con)</span></label>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
