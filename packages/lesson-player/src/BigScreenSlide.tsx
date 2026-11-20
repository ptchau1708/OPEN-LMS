import { useEffect, useState } from 'react';
import type { AnyResponse, BigScreenSlideProps, Slide } from '@openedu/contracts';
import { TimerRing } from '@openedu/ui';
import { LiveResultsBar } from './LiveResultsBar';
import { SlideView } from './SlideView';
import { cx, findItem, lessonMascot, timerTotalSeconds } from './util';
import './base.css';
import './live.css';

const ACTIVITY_PHASES = ['activity-open', 'activity-closed', 'reveal'];

/** Slide hiện tại trên TV lớp (context 'screen'), kèm bảng kết quả khi đang mở hoạt động. */
export function BigScreenSlide({ slide, items, state, responses, packages }: BigScreenSlideProps) {
  const allItems = { ...items, ...(state.items ?? {}) };
  const mascot = state.lesson ? lessonMascot(state.lesson) : undefined;
  const activityPhase = ACTIVITY_PHASES.indexOf(state.phase) >= 0;
  const activeId = state.activeItemId ?? (slide.layout === 'activity' ? slide.item?.id ?? slide.itemId : undefined);
  const active = activityPhase ? findItem(activeId, allItems, state.lesson) ?? (slide.layout === 'activity' ? slide.item : undefined) : undefined;
  // Bảng tương tác: GV/HS chạm thử trên TV để minh họa (không gửi đi đâu).
  const [demo, setDemo] = useState<AnyResponse | undefined>(undefined);
  const activeKey = active ? `${state.slideIndex}:${active.id}` : '';
  useEffect(() => setDemo(undefined), [activeKey]);

  if (!active) {
    return (
      <div className="lp-bigscreen">
        <SlideView slide={slide} items={allItems} packages={packages} context="screen" mascot={mascot} interactive />
      </div>
    );
  }

  // Hoạt động mở từ slide khác bố cục (vd câu hỏi chen trong video): hiển thị như slide hoạt động.
  const shown: Slide = slide.layout === 'activity' && (slide.item?.id ?? slide.itemId) === active.id ? slide : { id: `${slide.id}:${active.id}`, layout: 'activity', title: slide.title, item: active, lang: slide.lang };
  const mine = responses.filter((r) => r.slideIndex === state.slideIndex && r.itemId === active.id);
  const reveal = state.phase === 'reveal';
  const open = state.phase === 'activity-open';

  const aside = (
    <div className={cx('lp-bs-panel', reveal && 'is-reveal')}>
      <div className="lp-bs-panel__head">
        <span className={cx('lp-bs-panel__phase', `is-${state.phase}`)}>{open ? 'Đang trả lời' : reveal ? 'Đáp án' : 'Đã hết giờ'}</span>
        {open && state.timerEndsAt && <TimerRing key={state.timerEndsAt} endsAt={state.timerEndsAt} totalSeconds={timerTotalSeconds(state.timerEndsAt)} size={96} tick />}
      </div>
      <LiveResultsBar item={active} responses={mine} total={state.participants.length} reveal={reveal} size="lg" />
    </div>
  );

  return (
    <div className="lp-bigscreen">
      <SlideView slide={shown} items={allItems} packages={packages} context="screen" mascot={mascot} activity={{ mode: 'bigscreen', value: reveal ? undefined : demo, onChange: setDemo, disabled: !open, reveal }} aside={aside} />
    </div>
  );
}
