/**
 * /trang/:pageId và /ung-dung/:appId — mở trang học / ứng dụng NGAY TRONG OPEN-EDU (khung nhúng).
 * • Trang web: chỉ nhúng khi origin nằm trong danh sách được phép (GV / quản trị quản lí); không thì mở thẻ mới.
 * • Ứng dụng LTI: khung mở login URL của app kèm lti_storage_target=_parent; trang này trả lời lti.put_data /
 *   lti.get_data (LtiPlatformStorage) để app giữ state mà không cần cookie bên thứ ba (Safari / iPad).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LtiPlatformStorage, isEmbeddable, launchStartUrl, useClassPage, useEmbedSites, useLtiIssuer, useLtiTools } from '@openedu/data';
import { Button, Icon } from '@openedu/ui';
import { EmptyState, LoadingScreen } from '../../components/Common';
import { useMe } from '../../lib/util';
import '../../styles/connect.css';

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
  const tool = (tools.data ?? []).find((t) => t.id === (appId ?? page?.appId));
  const origins = useMemo(() => (tool ? [...new Set([originOf(tool.loginUrl), originOf(tool.launchUrl), originOf(page?.url)].filter(Boolean))] : undefined), [tool, page?.url]);

  const back = <Button variant="secondary" size="md" onClick={() => nav('/ung-dung')} icon={<Icon name="back" />}>Về</Button>;
  if ((pageId && pageQ.isPending) || tools.isPending || sites.isPending) return <LoadingScreen />;
  if (pageId && !page) return <div className="ln-page">{back}<EmptyState title="Không thấy trang này" text="Có thể thầy cô đã ẩn hoặc xóa trang." /></div>;

  const title = page?.title ?? tool?.name ?? 'Ứng dụng';
  let src = '';
  let newTab = '';
  let reason = '';
  let storageOrigins: string[] | undefined;
  if (page?.kind === 'link' && page.url) {
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

  return (
    <div className="ln-pageview">
      <header className="ln-row ln-pageview__bar">
        {back}
        <h1 className="ln-h2 ln-pageview__title">{title}</h1>
        {newTab ? <a className="ln-pageview__open" href={newTab} target="_blank" rel="noopener noreferrer" data-testid="page-newtab">Mở thẻ mới ↗</a> : null}
      </header>
      {src ? <Frame key={src} src={src} title={title} allowedOrigins={storageOrigins} /> : (
        <div className="ln-state"><p className="ln-state__text" data-testid="page-reason">{reason}</p>
          {newTab ? <Button size="lg" onClick={() => window.open(newTab, '_blank', 'noopener')}>Mở {title}</Button> : null}</div>
      )}
    </div>
  );
}
