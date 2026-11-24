/**
 * /trang/:pageId và /ung-dung/:appId — mở trang học / ứng dụng NGAY TRONG OPEN-EDU (khung nhúng).
 * • Trang web: chỉ nhúng khi origin nằm trong danh sách được phép (GV / quản trị quản lí); không thì mở thẻ mới.
 * • Ứng dụng LTI: khung mở login URL của app kèm lti_storage_target=_parent; trang này trả lời lti.put_data /
 *   lti.get_data (LtiPlatformStorage) để app giữ state mà không cần cookie bên thứ ba (Safari / iPad).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LtiPlatformStorage, buildPageTree, parseDiscussionEmbed, isEmbeddable, launchStartUrl, pagePath, useClassPage, useClassPages, useEmbedSites, useLtiIssuer, useLtiTools, type ClassPage, type PageNode } from '@openedu/data';
import { Button, Icon } from '@openedu/ui';
import { EmptyState, LoadingScreen } from '../../components/Common';
import { useMe } from '../../lib/util';
import '../../styles/connect.css';

/** Phòng thảo luận GV chèn vào trang ([[thao-luan:id|Tên]]). */
function DiscussionLink({ id, title }: { id: string; title: string }) {
  const nav = useNavigate();
  return (
    <div className="ln-pagedisc">
      <span aria-hidden="true">💬</span>
      <strong>{title}</strong>
      <Button size="md" onClick={() => nav(`/thao-luan/${id}`)} data-testid="page-discussion">Vào thảo luận</Button>
    </div>
  );
}

/** Chữ của trang: tách đoạn theo dòng trống, dòng "- " thành gạch đầu dòng, dòng [[thao-luan:…]] thành nút vào phòng. */
function Body({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/).filter(Boolean);
  if (!blocks.length) return null;
  return (
    <div className="ln-pagebody" data-testid="page-body">
      {blocks.map((b, i) => {
        const embed = parseDiscussionEmbed(b);
        if (embed) return <DiscussionLink key={i} id={embed.id} title={embed.title} />;
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.replace(/^\s*[-•]\s+/, '')}</li>)}</ul>;
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j ? <br /> : null}{l}</span>)}</p>;
      })}
    </div>
  );
}

/** Mục lục các trang của lớp (như thanh điều hướng của Google Sites). */
function TreeNav({ nodes, current, onGo }: { nodes: PageNode[]; current?: string; onGo: (id: string) => void }): ReactNode {
  return (
    <ul className="ln-pagetree">
      {nodes.map((n) => (
        <li key={n.page.id}>
          <button type="button" className={`ln-pagetree__item${n.page.id === current ? ' is-on' : ''}`} aria-current={n.page.id === current ? 'page' : undefined} onClick={() => onGo(n.page.id)}>{n.page.title}</button>
          {n.children.length ? <TreeNav nodes={n.children} current={current} onGo={onGo} /> : null}
        </li>
      ))}
    </ul>
  );
}

function ChildCards({ pages, onGo }: { pages: ClassPage[]; onGo: (id: string) => void }) {
  if (!pages.length) return null;
  return (
    <section className="ln-pagekids" data-testid="page-children">
      {pages.map((c) => (
        <button key={c.id} type="button" className="ln-pagekids__card" onClick={() => onGo(c.id)}>
          <Icon name={c.kind === 'section' ? 'book' : c.kind === 'lti' ? 'puzzle' : 'play'} size={28} />
          <span><strong>{c.title}</strong>{c.description ? <small>{c.description}</small> : null}</span>
        </button>
      ))}
    </section>
  );
}

const originOf = (u?: string | null) => { try { return u ? new URL(u).origin : ''; } catch { return ''; } };

function Frame({ src, title, allowedOrigins }: { src: string; title: string; allowedOrigins?: string[] }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const storage = useMemo(() => (allowedOrigins ? new LtiPlatformStorage(() => allowedOrigins) : null), [allowedOrigins]);
  useEffect(() => {
    if (!storage) return;
    const on = (ev: MessageEvent) => {
      if (ev.source !== ref.current?.contentWindow) return;
      const reply = storage.handle(ev.origin, ev.data);
      if (reply) (ev.source as Window).postMessage(reply, ev.origin);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [storage]);
  return (
    <iframe
      ref={ref}
      className="ln-pageview__frame"
      src={src}
      title={title}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
      allow="fullscreen; autoplay; microphone; camera; clipboard-write"
      referrerPolicy="strict-origin-when-cross-origin"
      data-testid="page-frame"
    />
  );
}

export default function PageView() {
  const { pageId, appId } = useParams();
  const me = useMe();
  const nav = useNavigate();
  const pageQ = useClassPage(pageId);
  const tools = useLtiTools();
  const sites = useEmbedSites();
  const issuer = useLtiIssuer().data ?? null;
  const page = pageQ.data ?? null;
  const classPages = useClassPages(page?.classId ?? me.classId);
  const visible = classPages.data ?? [];
  const tree = useMemo(() => buildPageTree(visible, { onlyVisible: true, hideOrphans: true }), [visible]);
  const [navOpen, setNavOpen] = useState(false);
  const go = (id: string) => { setNavOpen(false); nav(`/trang/${id}`); };
  const tool = (tools.data ?? []).find((t) => t.id === (appId ?? page?.appId));
  const origins = useMemo(() => (tool ? [...new Set([originOf(tool.loginUrl), originOf(tool.launchUrl), originOf(page?.url)].filter(Boolean))] : undefined), [tool, page?.url]);

  const path = page ? pagePath(visible.length ? visible : [page], page.id) : [];
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const back = <Button variant="secondary" size="md" onClick={() => nav(parent ? `/trang/${parent.id}` : '/ung-dung')} icon={<Icon name="back" />}>Về</Button>;
  if ((pageId && pageQ.isPending) || tools.isPending || sites.isPending) return <LoadingScreen />;
  if (pageId && !page) return <div className="ln-page">{back}<EmptyState title="Không thấy trang này" text="Có thể thầy cô đã ẩn hoặc xóa trang." /></div>;

  const title = page?.title ?? tool?.name ?? 'Ứng dụng';
  let src = '';
  let newTab = '';
  let reason = '';
  let storageOrigins: string[] | undefined;
  if (page?.kind === 'section') {
    // Trang nội dung: chỉ có chữ + trang con.
  } else if (page?.kind === 'link' && page.url) {
    newTab = page.url;
    if (page.openIn === 'iframe' && isEmbeddable(page.url, (sites.data ?? []).map((s) => s.origin))) src = page.url;
    else reason = 'Trang này mở ở thẻ mới.';
  } else if (tool) {
    if (!issuer) reason = 'Chế độ thử: chưa mở được ứng dụng vì chưa nối máy chủ.';
    else {
      const hint = page ? `page:${page.id}` : me.classId ?? undefined;
      const target = page?.url ?? undefined;
      newTab = launchStartUrl(tool, issuer, me.id, hint, { targetLinkUri: target });
      if (!page || page.openIn === 'iframe') { src = launchStartUrl(tool, issuer, me.id, hint, { targetLinkUri: target, storageTarget: '_parent' }); storageOrigins = origins; }
      else reason = 'Bài này mở ở thẻ mới.';
    }
  } else reason = 'Ứng dụng này chưa bật hoặc chưa được nối.';

  const children = page ? visible.filter((p) => p.parentId === page.id).sort((x, y) => x.position - y.position || x.createdAt.localeCompare(y.createdAt)) : [];
  const hasTree = !!page && visible.length > 1;
  return (
    <div className={`ln-pageview${hasTree ? ' has-tree' : ''}${page?.kind === 'section' ? ' is-section' : ''}`}>
      <header className="ln-row ln-pageview__bar">
        {back}
        <div className="ln-pageview__head">
          {path.length > 1 ? (
            <nav className="ln-crumbs" aria-label="Đường dẫn trang">
              {path.slice(0, -1).map((p) => <button key={p.id} type="button" onClick={() => go(p.id)}>{p.title}</button>)}
            </nav>
          ) : null}
          <h1 className="ln-h2 ln-pageview__title">{title}</h1>
        </div>
        {hasTree ? <Button variant="secondary" size="md" className="ln-pageview__toc" onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen} data-testid="page-toc">Mục lục</Button> : null}
        {newTab ? <a className="ln-pageview__open" href={newTab} target="_blank" rel="noopener noreferrer" data-testid="page-newtab">Mở thẻ mới ↗</a> : null}
      </header>
      <div className="ln-pageview__wrap">
        {hasTree ? <aside className={`ln-pageview__nav${navOpen ? ' is-open' : ''}`} aria-label="Mục lục trang học" data-testid="page-nav"><TreeNav nodes={tree} current={page?.id} onGo={go} /></aside> : null}
        <div className="ln-pageview__main">
          {page?.body ? <Body text={page.body} /> : null}
          {page?.kind === 'section' ? null : src ? <Frame key={src} src={src} title={title} allowedOrigins={storageOrigins} /> : (
            <div className="ln-state"><p className="ln-state__text" data-testid="page-reason">{reason}</p>
              {newTab ? <Button size="lg" onClick={() => window.open(newTab, '_blank', 'noopener')}>Mở {title}</Button> : null}</div>
          )}
          <ChildCards pages={children} onGo={go} />
          {page?.kind === 'section' && !children.length && !page.body ? <p className="ln-state__text">Trang này chưa có nội dung.</p> : null}
        </div>
      </div>
    </div>
  );
}
