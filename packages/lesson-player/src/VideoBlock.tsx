import { useEffect, useRef } from 'react';
import type { VideoQuestion } from '@openedu/contracts';
import { Icon } from '@openedu/ui';
import { youtubeId } from './util';

const YT_ORIGIN = 'https://www.youtube-nocookie.com';

export interface VideoBlockProps {
  url: string;
  questions?: VideoQuestion[];
  /** Gọi khi tới giây atSec: video đã dừng, gọi resume() để chạy tiếp. Không truyền = không dừng để hỏi. */
  onQuestion?: (q: VideoQuestion, resume: () => void) => void;
  /** id câu hỏi đã hỏi (để tua lại không hỏi lần nữa). */
  asked?: string[];
  interactive?: boolean;
  title?: string;
}

/** Video MP4 (<video>) hoặc YouTube (youtube-nocookie). */
export function VideoBlock({ url, questions, onQuestion, asked, interactive = true, title }: VideoBlockProps) {
  const yt = youtubeId(url);
  const askedRef = useRef<Set<string>>(new Set(asked ?? []));
  useEffect(() => {
    (asked ?? []).forEach((id) => askedRef.current.add(id));
  }, [asked]);

  const pending = (t: number): VideoQuestion | undefined => {
    if (!onQuestion || !questions?.length) return undefined;
    return questions
      .slice()
      .sort((a, b) => a.atSec - b.atSec)
      .find((q) => t >= q.atSec && t < q.atSec + 4 && !askedRef.current.has(q.itemId));
  };

  if (!interactive) {
    return (
      <div className="lp-video lp-video--placeholder" role="img" aria-label="Video đang chiếu trên bảng">
        <span className="lp-video__play">
          <Icon name="play" size={48} />
        </span>
        <span>Cùng xem video trên bảng nhé!</span>
      </div>
    );
  }
  if (yt) return <YouTubeFrame id={yt} title={title} pending={pending} onQuestion={onQuestion} markAsked={(id) => askedRef.current.add(id)} />;
  return <Mp4 url={url} title={title} pending={pending} onQuestion={onQuestion} markAsked={(id) => askedRef.current.add(id)} />;
}

interface InnerProps {
  title?: string;
  pending: (t: number) => VideoQuestion | undefined;
  onQuestion?: VideoBlockProps['onQuestion'];
  markAsked: (id: string) => void;
}

function Mp4({ url, title, pending, onQuestion, markAsked }: InnerProps & { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const onTime = () => {
    const v = ref.current;
    if (!v || !onQuestion) return;
    const q = pending(v.currentTime);
    if (!q) return;
    markAsked(q.itemId);
    v.pause();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onQuestion(q, () => {
      void v.play().catch(() => undefined);
    });
  };
  return (
    <div className="lp-video">
      <video ref={ref} className="lp-video__el" src={url} controls playsInline preload="metadata" onTimeUpdate={onTime} title={title}>
        Máy của em chưa phát được video này.
      </video>
    </div>
  );
}

/**
 * YouTube qua youtube-nocookie (không cookie theo dõi). Để dừng đúng giây có câu hỏi, dùng giao thức postMessage
 * của trình phát nhúng (enablejsapi=1) — không tải thêm script nào. Nếu không nhận được thời gian
 * (mạng chặn, trình duyệt cũ), SelfPacedPlayer vẫn hỏi các câu còn lại khi em bấm "Tiếp".
 */
function YouTubeFrame({ id, title, pending, onQuestion, markAsked }: InnerProps & { id: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const src = `${YT_ORIGIN}/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  const latest = useRef({ pending, onQuestion });
  latest.current = { pending, onQuestion };
  const wantsQuestions = !!onQuestion;

  useEffect(() => {
    if (!wantsQuestions) return;
    const post = (msg: object) => ref.current?.contentWindow?.postMessage(JSON.stringify(msg), YT_ORIGIN);
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== ref.current?.contentWindow) return;
      let data: { event?: string; info?: { currentTime?: number } } | null = null;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      const t = data?.info?.currentTime;
      const ask = latest.current.onQuestion;
      if (typeof t !== 'number' || !ask) return;
      const q = latest.current.pending(t);
      if (!q) return;
      markAsked(q.itemId);
      post({ event: 'command', func: 'pauseVideo', args: [] });
      ask(q, () => post({ event: 'command', func: 'playVideo', args: [] }));
    };
    window.addEventListener('message', onMsg);
    const listen = () => post({ event: 'listening', id: 1, channel: 'widget' });
    const el = ref.current;
    el?.addEventListener('load', listen);
    const t = window.setTimeout(listen, 1500);
    return () => {
      window.removeEventListener('message', onMsg);
      el?.removeEventListener('load', listen);
      window.clearTimeout(t);
    };
    // pending/onQuestion đọc qua ref `latest` nên không cần đăng ký lại; markAsked chỉ ghi vào ref ổn định.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsQuestions, id]);

  return (
    <div className="lp-video lp-video--yt">
      <iframe
        ref={ref}
        className="lp-video__el"
        src={src}
        title={title ?? 'Video YouTube'}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
