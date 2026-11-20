import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AnyResponse, Item, LiveResponse, LiveState, LiveTeam, Slide } from '@openedu/contracts';
import { BigScreenSlide, LiveResultsBar, SlideView, lessonMascot, latestPerStudent } from '@openedu/lesson-player';
import { scoreItem } from '@openedu/activity-engine';
import { Icon, QrCode, StarCount, TimerRing } from '@openedu/ui';
import { findItem, formatPin, joinUrls, slideItemId, timerTotal, useVmin } from './util';

export interface StageProps {
  state: LiveState;
  items: Record<string, Item>;
  responses: LiveResponse[];
  /** Lớp chỉ có bảng: HS chạm trực tiếp lên bảng, gửi câu trả lời chung của cả lớp. */
  board: boolean;
  onBoardAnswer: (itemId: string, r: AnyResponse) => void;
}

const ACT = ['activity-open', 'activity-closed', 'reveal'];

export default function Stage({ state, items, responses, board, onBoardAnswer }: StageProps) {
  const vmin = useVmin();
  const slides = state.lesson?.slides ?? [];
  const slide = slides[state.slideIndex];
  const all = { ...items, ...(state.items ?? {}) };
  const inAct = ACT.indexOf(state.phase) >= 0;
  const active = inAct ? findItem(state.activeItemId ?? slideItemId(slide), all, state.lesson) : undefined;
  const answered = active ? latestPerStudent(active, responses.filter((r) => r.itemId === active.id)).length : 0;
  const total = Math.max(state.participants.length, answered);
  const { short } = joinUrls(state.pin);

  return (
    <div className={`pr-stage${state.teams.length ? ' has-teams' : ''}`}>
      <header className="pr-hud">
        <div className="pr-corner" aria-label="Vào lớp muộn">
          <QrCode value={joinUrls(state.pin).full} size={120} className="pr-corner__qr" title="Quét mã để vào lớp" />
          <div className="pr-corner__txt">
            <span className="pr-corner__l">Mã lớp</span>
            <strong className="pr-corner__pin">{formatPin(state.pin)}</strong>
            <span className="pr-corner__u">{short}</span>
          </div>
        </div>
        <div className="pr-hud__mid">
          <span className="pr-hud__title">{state.lesson?.title}</span>
          {slides.length > 0 && (
            <span className="pr-hud__page">
              Trang {state.slideIndex + 1}/{slides.length}
            </span>
          )}
        </div>
        <div className="pr-hud__right">
          {active && !(board && state.participants.length === 0) && (
            <span className="pr-chip" role="status">
              <strong>{answered}</strong>/{total} bạn đã trả lời
            </span>
          )}
          {state.phase === 'activity-open' && state.timerEndsAt && (
            <TimerRing key={state.timerEndsAt} endsAt={state.timerEndsAt} totalSeconds={timerTotal(state.timerEndsAt)} size={Math.round(vmin * 11)} />
          )}
        </div>
      </header>
      <div className="pr-slide">
        {!slide ? (
          <div className="pr-center">
            <p className="pr-center__p">Đang tải bài giảng…</p>
          </div>
        ) : board && active ? (
          <BoardActivity slide={slide} item={active} items={all} state={state} responses={responses} onAnswer={onBoardAnswer} />
        ) : (
          <BigScreenSlide slide={slide} items={all} state={state} responses={responses} />
        )}
      </div>
      {state.teams.length > 0 && <TeamBar teams={state.teams} />}
    </div>
  );
}

/** Như BigScreenSlide, nhưng câu chạm trên bảng được gửi đi thành câu trả lời của cả lớp. */
function BoardActivity({ slide, item, items, state, responses, onAnswer }: { slide: Slide; item: Item; items: Record<string, Item>; state: LiveState; responses: LiveResponse[]; onAnswer: (id: string, r: AnyResponse) => void }) {
  const key = `${state.slideIndex}:${item.id}`;
  const [value, setValue] = useState<AnyResponse | undefined>(undefined);
  useEffect(() => setValue(undefined), [key]);
  const open = state.phase === 'activity-open';
  const reveal = state.phase === 'reveal';
  const shown: Slide = slideItemId(slide) === item.id ? slide : { id: `${slide.id}:${item.id}`, layout: 'activity', title: slide.title, item, lang: slide.lang };
  let result;
  if (reveal && value !== undefined) {
    try {
      result = scoreItem(item, value);
    } catch {
      result = undefined;
    }
  }
  const mine = responses.filter((r) => r.slideIndex === state.slideIndex && r.itemId === item.id);
  const aside = (
    <div className={`lp-bs-panel${reveal ? ' is-reveal' : ''}`}>
      <div className="lp-bs-panel__head">
        <span className={`lp-bs-panel__phase is-${state.phase}`}>{open ? 'Cả lớp chọn trên bảng' : reveal ? 'Đáp án' : 'Đã hết giờ'}</span>
      </div>
      <LiveResultsBar item={item} responses={mine} total={Math.max(1, state.participants.length)} reveal={reveal} size="lg" />
    </div>
  );
  return (
    <div className="lp-bigscreen">
      <SlideView
        slide={shown}
        items={items}
        context="screen"
        mascot={state.lesson ? lessonMascot(state.lesson) : undefined}
        activity={{
          mode: 'bigscreen',
          value,
          onChange: (v) => {
            setValue(v);
            onAnswer(item.id, v);
          },
          disabled: !open,
          reveal,
          result,
        }}
        aside={aside}
      />
    </div>
  );
}

function TeamBar({ teams }: { teams: LiveTeam[] }) {
  const prev = useRef<Record<string, number> | null>(null);
  const [gains, setGains] = useState<Record<string, { n: number; k: number }>>({});
  useEffect(() => {
    const before = prev.current;
    const now: Record<string, number> = {};
    const add: Record<string, { n: number; k: number }> = {};
    for (const t of teams) {
      now[t.id] = t.stars;
      if (before && before[t.id] !== undefined && t.stars > before[t.id]) add[t.id] = { n: t.stars - before[t.id], k: Date.now() };
    }
    prev.current = now;
    if (Object.keys(add).length) {
      setGains((g) => ({ ...g, ...add }));
      const ids = Object.keys(add);
      const tm = window.setTimeout(() => setGains((g) => {
        const c = { ...g };
        ids.forEach((id) => delete c[id]);
        return c;
      }), 1600);
      return () => window.clearTimeout(tm);
    }
  }, [teams]);
  const top = Math.max(0, ...teams.map((t) => t.stars));
  return (
    <ol className="pr-teams" aria-label="Điểm các tổ">
      {teams.map((t) => {
        const lead = top > 0 && t.stars === top;
        const g = gains[t.id];
        return (
          <li key={t.id} className={`pr-team${lead ? ' is-lead' : ''}`} style={{ '--team': t.color } as CSSProperties}>
            <span className="pr-team__dot" aria-hidden="true">{lead ? <Icon name="trophy" size={30} /> : null}</span>
            <span className="pr-team__name">{t.name}</span>
            <StarCount value={t.stars} size="lg" className="pr-team__stars" />
            {g && (
              <span key={g.k} className="pr-team__gain" aria-hidden="true">
                +{g.n}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
