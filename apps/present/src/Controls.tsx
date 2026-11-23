import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LiveCommand, LiveState } from '@openedu/contracts';
import { Icon } from '@openedu/ui';

export interface ControlsProps {
  state: LiveState;
  activityId?: string;
  slideCount: number;
  send: (c: LiveCommand) => void;
}

const OPEN_SECONDS = 30;

/** Dải điều khiển cho lớp chỉ có TV/bảng tương tác (?ctl=1), kèm phím tắt. */
export function Controls({ state, activityId, slideCount, send }: ControlsProps) {
  const [shown, setShown] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { phase, slideIndex } = state;
  const lobby = phase === 'lobby';
  const ended = phase === 'ended';
  const open = phase === 'activity-open';
  const canPrev = !lobby && !ended && slideIndex > 0;
  const canNext = !ended && (lobby || slideIndex < slideCount - 1);
  const canToggle = !lobby && !ended && !!activityId;
  const canReveal = open || phase === 'activity-closed';

  const prev = () => canPrev && send({ type: 'go', slideIndex: slideIndex - 1 });
  const next = () => canNext && send({ type: 'go', slideIndex: lobby ? 0 : slideIndex + 1 });
  const toggle = () => {
    if (!canToggle || !activityId) return;
    send(open ? { type: 'close' } : { type: 'open', itemId: activityId, seconds: OPEN_SECONDS });
  };
  const reveal = () => canReveal && send({ type: 'reveal' });
  const award = (i: number) => {
    const t = state.teams[i];
    if (t && !ended) send({ type: 'award', target: { kind: 'team', id: t.id }, stars: 1 });
  };
  const endTimer = useRef<number | undefined>(undefined);
  const end = () => {
    if (ended) return;
    if (!confirmEnd) {
      setConfirmEnd(true);
      window.clearTimeout(endTimer.current);
      endTimer.current = window.setTimeout(() => setConfirmEnd(false), 3000);
      return;
    }
    setConfirmEnd(false);
    send({ type: 'end' });
  };
  useEffect(() => () => window.clearTimeout(endTimer.current), []);

  const act = { prev, next, toggle, reveal, award };
  const ref = useRef(act);
  ref.current = act;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const a = ref.current;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'PageUp') a.prev();
      else if (k === 'ArrowRight' || k === 'PageDown') a.next();
      else if (k === ' ' || k === 'Spacebar') a.toggle();
      else if (k === 'r' || k === 'R') a.reveal();
      else if (k >= '1' && k <= '9') a.award(Number(k) - 1);
      else if (k === '0') a.award(9);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!shown) {
    return (
      <button type="button" className="pr-ctl-show" onClick={() => setShown(true)} aria-label="Hiện bảng điều khiển">
        <Icon name="menu" size={36} />
      </button>
    );
  }
  return (
    <div className="pr-ctl" role="toolbar" aria-label="Điều khiển lớp học">
      <button type="button" className="pr-ctl__b" onClick={prev} disabled={!canPrev} aria-label="Trang trước (←)">
        <Icon name="back" size={34} />
      </button>
      <button type="button" className="pr-ctl__b" onClick={next} disabled={!canNext} aria-label="Trang sau (→)">
        <Icon name="next" size={34} />
      </button>
      <button type="button" className={`pr-ctl__b is-wide${open ? ' is-on' : ''}`} onClick={toggle} disabled={!canToggle} title="Phím cách">
        <Icon name={open ? 'stop' : 'play'} size={30} /> {open ? 'Đóng hoạt động' : `Mở hoạt động (${OPEN_SECONDS} giây)`}
      </button>
      <button type="button" className="pr-ctl__b is-wide" onClick={reveal} disabled={!canReveal} title="Phím R">
        <Icon name="eye" size={30} /> Hiện đáp án
      </button>
      {state.teams.slice(0, 10).map((t, i) => (
        <button key={t.id} type="button" className="pr-ctl__b is-team" style={{ '--team': t.color } as CSSProperties} onClick={() => award(i)} disabled={ended} title={`Phím ${(i + 1) % 10}`}>
          <Icon name="star" size={28} /> {t.name} +1
        </button>
      ))}
      <button type="button" className={`pr-ctl__b is-wide is-end${confirmEnd ? ' is-confirm' : ''}`} onClick={end} disabled={ended}>
        {confirmEnd ? 'Bấm lần nữa để kết thúc' : 'Kết thúc'}
      </button>
      <button type="button" className="pr-ctl__b" onClick={() => setShown(false)} aria-label="Ẩn bảng điều khiển">
        <Icon name="close" size={30} />
      </button>
    </div>
  );
}
