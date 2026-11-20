import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActivityMode, AnyResponse, ContentPackage, Item, MascotId, PackageHostProps, ScoreResult, Slide, VideoQuestion } from '@openedu/contracts';
import { ActivityView } from '@openedu/activity-engine';
import { Confetti, Icon, Mascot, Media, SpeakButton, StarCount } from '@openedu/ui';
import { GameView } from './games';
import { PackageHost } from './PackageHost';
import { Inline, RichText } from './RichText';
import { VideoBlock } from './VideoBlock';
import { EmbedBlock } from './EmbedBlock';
import { cx, plainText, play, resolveSlideItem, slideSpeakText } from './util';
import './base.css';
import './slide.css';

export type SlideContext = 'student' | 'screen';

/** Điều khiển ActivityView của slide 'activity' (trình phát truyền vào; bỏ trống = xem trước, chỉ đọc). */
export interface SlideActivityProps {
  value?: AnyResponse;
  onChange?: (value: AnyResponse) => void;
  disabled?: boolean;
  reveal?: boolean;
  result?: ScoreResult;
  mode?: ActivityMode;
}

export interface SlideViewProps {
  slide: Slide;
  items: Record<string, Item>;
  packages?: Record<string, ContentPackage>;
  /** 'student' = máy HS (co giãn điện thoại/máy tính bảng/PC); 'screen' = TV 16:9 chữ rất to. */
  context: SlideContext;
  /** Cho phép tương tác (quay vòng quay, xem video, chơi gói). Mặc định true. false = bản sao chỉ xem. */
  interactive?: boolean;
  /** Linh vật dự phòng khi slide.mascot trống (linh vật của bài / môn). */
  mascot?: MascotId;
  bigText?: boolean;
  /** Bản thu gọn (máy HS trong lớp trực tiếp). */
  compact?: boolean;
  /** Tự đọc to khi slide hiện ra. */
  autoRead?: boolean;
  /** Âm thanh hiệu ứng (mặc định bật). */
  sound?: boolean;
  activity?: SlideActivityProps;
  /** Cột phụ cạnh hoạt động (vd bảng kết quả trực tiếp trên TV). */
  aside?: ReactNode;
  /** Số liệu cho slide 'summary'. */
  summary?: { correct: number; total: number; stars: number };
  /** Video có câu hỏi: dừng ở atSec và gọi hàm này (chỉ khi truyền). */
  onVideoQuestion?: (q: VideoQuestion, resume: () => void) => void;
  askedVideoQuestions?: string[];
  onPackageResult?: PackageHostProps['onResult'];
  className?: string;
}

const noop = () => undefined;

/** Hiển thị một slide theo bố cục, tự xếp lại theo màn hình. */
export function SlideView(props: SlideViewProps) {
  const { slide, items, context, compact, bigText, autoRead } = props;
  const item = slide.layout === 'activity' ? resolveSlideItem(slide, items) : undefined;
  const speakText = slideSpeakText(slide, item);
  const lang = slide.lang ?? item?.prompt.lang ?? 'vi-VN';
  const screen = context === 'screen';

  return (
    <section
      className={cx('lp-slide', `lp-slide--${slide.layout}`, `lp-slide--${context}`, compact && 'lp-slide--compact', bigText && 'k-big', props.className)}
      aria-label={slide.title ? plainText(slide.title) : undefined}
      lang={lang === 'en-US' ? 'en' : 'vi'}
    >
      {speakText && (
        <div className="lp-slide__speak">
          <SpeakButton key={slide.id} text={speakText} lang={lang} size={screen ? 'lg' : 'md'} label="Nghe" autoPlay={autoRead} />
        </div>
      )}
      <div className="lp-slide__body">{renderLayout(props, item)}</div>
    </section>
  );
}

function renderLayout(p: SlideViewProps, item: Item | undefined): ReactNode {
  const { slide } = p;
  switch (slide.layout) {
    case 'title':
      return <TitleLayout {...p} />;
    case 'image-text':
      return <ImageTextLayout {...p} />;
    case 'fullscreen':
      return <FullscreenLayout {...p} />;
    case 'activity':
      return <ActivityLayout {...p} item={item} />;
    case 'compare':
      return <CompareLayout {...p} />;
    case 'game':
      return (
        <div className="lp-gamewrap">
          {slide.title && <h2 className="lp-h2"><Inline text={slide.title} /></h2>}
          {slide.text && <RichText className="lp-text lp-text--center" text={slide.text} />}
          <GameView kind={slide.game?.kind ?? 'wheel'} entries={slide.game?.entries} seconds={slide.game?.seconds} interactive={p.interactive !== false} sound={p.sound} big={p.context === 'screen'} />
        </div>
      );
    case 'package':
      return <PackageLayout {...p} />;
    case 'summary':
      return <SummaryLayout {...p} />;
    default:
      return <ImageTextLayout {...p} />;
  }
}

function emojiOrImage(src: string, emojiSize: string): { size: string; fit: 'contain' | 'cover' } {
  return src.startsWith('emoji:') ? { size: emojiSize, fit: 'contain' } : { size: '100%', fit: 'contain' };
}

function TitleLayout({ slide, mascot }: SlideViewProps) {
  const m = slide.mascot ?? mascot ?? 'nghe';
  return (
    <div className="lp-title">
      <div className="lp-title__mascot">
        <Mascot id={m} mood="wave" size={220} animate />
      </div>
      <div className="lp-title__words">
        {slide.title && <h1 className="lp-h1"><Inline text={slide.title} /></h1>}
        {slide.text && <RichText className="lp-text lp-title__sub" text={slide.text} />}
        {slide.image && (
          <div className="lp-title__img">
            <Media src={slide.image} alt="" {...emojiOrImage(slide.image, 'clamp(64px, 14vmin, 180px)')} />
          </div>
        )}
      </div>
    </div>
  );
}

function ImageTextLayout({ slide }: SlideViewProps) {
  const hasImg = !!slide.image;
  return (
    <div className={cx('lp-split', !hasImg && 'lp-split--text-only')}>
      {hasImg && (
        <div className="lp-split__media lp-card">
          <Media src={slide.image as string} alt={plainText(slide.title)} {...emojiOrImage(slide.image as string, 'clamp(96px, 26vmin, 360px)')} />
        </div>
      )}
      <div className="lp-split__text lp-card">
        {slide.title && <h2 className="lp-h2"><Inline text={slide.title} /></h2>}
        <RichText className="lp-text" text={slide.text} />
      </div>
    </div>
  );
}

function FullscreenLayout({ slide, interactive, onVideoQuestion, askedVideoQuestions }: SlideViewProps) {
  const caption = slide.title || slide.text;
  return (
    <div className={cx('lp-full', slide.video && 'lp-full--video', !slide.video && slide.embed && 'lp-full--embed')}>
      {!slide.video && slide.embed ? (
        <EmbedBlock url={slide.embed.url} title={slide.title} interactive={interactive !== false} />
      ) : slide.video ? (
        <VideoBlock
          url={slide.video.url}
          questions={slide.video.questions}
          onQuestion={onVideoQuestion}
          asked={askedVideoQuestions}
          interactive={interactive !== false}
          title={slide.title}
        />
      ) : slide.image ? (
        <div className="lp-full__img">
          <Media src={slide.image} alt={plainText(slide.title)} {...(slide.image.startsWith('emoji:') ? { size: 'clamp(140px, 40vmin, 520px)', fit: 'contain' as const } : { size: '100%', fit: 'cover' as const })} />
        </div>
      ) : (
        <div className="lp-full__img lp-full__img--empty" />
      )}
      {caption && (
        <div className="lp-full__caption">
          {slide.title && <h2 className="lp-h2"><Inline text={slide.title} /></h2>}
          {slide.text && <RichText className="lp-text" text={slide.text} />}
        </div>
      )}
    </div>
  );
}

function ActivityLayout({ slide, item, activity, context, bigText, aside, interactive }: SlideViewProps & { item: Item | undefined }) {
  if (!item) {
    return (
      <div className="lp-missing lp-card">
        <Icon name="puzzle" size={48} />
        <p>Ôi, chưa tìm thấy câu hỏi này. Em bấm “Tiếp” để học tiếp nhé!</p>
      </div>
    );
  }
  const a = activity ?? {};
  return (
    <div className={cx('lp-act', aside != null && 'lp-act--with-aside')}>
      <div className="lp-act__main">
        {slide.title && <h2 className="lp-h2 lp-act__title"><Inline text={slide.title} /></h2>}
        {slide.text && <RichText className="lp-text lp-act__text" text={slide.text} />}
        <div className="lp-card lp-act__card">
          <ActivityView
            key={item.id}
            item={item}
            value={a.value}
            onChange={a.onChange ?? noop}
            disabled={a.disabled ?? (!activity || interactive === false)}
            reveal={a.reveal}
            result={a.result}
            mode={a.mode ?? (context === 'screen' ? 'bigscreen' : 'player')}
            bigText={bigText}
          />
        </div>
      </div>
      {aside != null && <aside className="lp-act__aside">{aside}</aside>}
    </div>
  );
}

function CompareLayout({ slide }: SlideViewProps) {
  const cols = slide.columns ?? [{ title: 'Bên trái' }, { title: 'Bên phải' }];
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setActive(el.scrollLeft > el.clientWidth / 3 ? 1 : 0);
  };
  const go = (i: number) => {
    const el = scroller.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };
  return (
    <div className="lp-compare">
      {slide.title && <h2 className="lp-h2 lp-compare__title"><Inline text={slide.title} /></h2>}
      {slide.text && <RichText className="lp-text lp-text--center" text={slide.text} />}
      <div className="lp-compare__cols" ref={scroller} onScroll={onScroll}>
        {cols.map((c, i) => (
          <article key={i} className={cx('lp-card lp-compare__col', `lp-compare__col--${i}`)}>
            <h3 className="lp-compare__h"><Inline text={c.title} /></h3>
            {c.image && (
              <div className="lp-compare__img">
                <Media src={c.image} alt={c.title} {...emojiOrImage(c.image, 'clamp(80px, 18vmin, 240px)')} />
              </div>
            )}
            <RichText className="lp-text" text={c.text} />
          </article>
        ))}
        <span className="lp-compare__vs" aria-hidden="true">
          VS
        </span>
      </div>
      <div className="lp-compare__dots" role="tablist" aria-label="Chọn cột">
        {cols.map((c, i) => (
          <button key={i} type="button" role="tab" aria-selected={active === i} className={cx('lp-compare__dot', active === i && 'is-on')} onClick={() => go(i)}>
            {c.title}
          </button>
        ))}
      </div>
      <p className="lp-compare__swipe" aria-hidden="true">
        Vuốt sang để xem bên kia <Icon name="next" size={18} />
      </p>
    </div>
  );
}

function PackageLayout({ slide, packages, interactive, onPackageResult }: SlideViewProps) {
  const pkg = slide.packageId ? packages?.[slide.packageId] : undefined;
  if (!pkg) {
    return (
      <div className="lp-missing lp-card">
        <Icon name="puzzle" size={48} />
        <p>Ôi, bài chơi này chưa sẵn sàng. Em bấm “Tiếp” để học tiếp nhé!</p>
      </div>
    );
  }
  if (interactive === false) {
    return (
      <div className="lp-missing lp-card">
        <Icon name="tv" size={48} />
        <p>
          <strong>{pkg.title}</strong>
          <br />
          Cùng chơi trên bảng nhé!
        </p>
      </div>
    );
  }
  return (
    <div className="lp-pkgwrap">
      {slide.title && <h2 className="lp-h2"><Inline text={slide.title} /></h2>}
      <div className="lp-pkgwrap__frame">
        <PackageHost pkg={pkg} onResult={onPackageResult} height="100%" />
      </div>
    </div>
  );
}

function SummaryLayout({ slide, mascot, summary, sound, context }: SlideViewProps) {
  const m = slide.mascot ?? mascot ?? 'nghe';
  const [party, setParty] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setParty(true);
      play('fanfare', sound);
    }, 250);
    return () => window.clearTimeout(t);
    // chỉ chúc mừng một lần khi slide hiện ra
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id]);
  return (
    <div className="lp-summary">
      <Confetti show={party} durationMs={4000} />
      <div className="lp-summary__mascot">
        <Mascot id={m} mood="cheer" size={context === 'screen' ? 280 : 200} animate />
      </div>
      <h1 className="lp-h1 lp-summary__title"><Inline text={slide.title ?? 'Hoàn thành rồi!'} /></h1>
      {slide.text ? <RichText className="lp-text lp-text--center" text={slide.text} /> : <p className="lp-text lp-text--center">Em giỏi lắm! Cùng ôn lại bài nhé.</p>}
      {summary && (
        <div className="lp-summary__stats">
          <div className="lp-summary__stars">
            <StarCount value={summary.stars} size="lg" />
            <span>sao em nhận được</span>
          </div>
          {summary.total > 0 && (
            <div className="lp-summary__correct">
              <strong>
                {summary.correct}/{summary.total}
              </strong>
              <span>câu làm đúng</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
