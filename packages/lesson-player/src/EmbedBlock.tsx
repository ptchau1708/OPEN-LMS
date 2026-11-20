import { useMemo } from 'react';
import { Icon } from '@openedu/ui';
import { EMBED_PROVIDER_LABEL, toEmbed } from './embed';

/**
 * Khung nhúng trang web học tập (danh sách cho phép trong embed.ts), sandbox: không cho chuyển trang chính,
 * không tải xuống. Trang có thể từ chối hiện trong khung (X-Frame-Options) mà trình duyệt không báo cho mình biết,
 * nên luôn có nút "Mở trong tab mới" bên dưới.
 */
export function EmbedBlock({ url, title, interactive = true }: { url: string; title?: string; interactive?: boolean }) {
  const r = useMemo(() => toEmbed(url), [url]);
  if (!interactive) {
    return (
      <div className="lp-video lp-video--placeholder" role="img" aria-label="Trang nhúng đang chiếu trên bảng">
        <span className="lp-video__play"><Icon name="eye" size={48} /></span>
        <span>Cùng xem trên bảng nhé!</span>
      </div>
    );
  }
  const openUrl = r.openUrl;
  return (
    <div className="lp-embed">
      {r.ok ? (
        <div className="lp-embed__frame">
          <iframe
            src={r.src}
            title={title || EMBED_PROVIDER_LABEL[r.provider]}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="lp-embed__blocked" role="note">
          <Icon name="lock" size={36} />
          <p>{r.reason}</p>
        </div>
      )}
      {openUrl ? (
        <p className="lp-embed__bar">
          {r.ok ? <span>Không thấy nội dung? Trang này có thể không cho hiện trong khung.</span> : null}
          <a className="lp-embed__open" href={openUrl} target="_blank" rel="noopener noreferrer">Mở trong tab mới ↗</a>
        </p>
      ) : null}
    </div>
  );
}
