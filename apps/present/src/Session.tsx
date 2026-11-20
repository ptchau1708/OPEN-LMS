import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnyResponse, Item, LiveCommand, LiveState } from '@openedu/contracts';
import { lessonItemIds, useItemsByIds, useLesson, useLiveChannel } from '@openedu/data';
import { Icon, Mascot } from '@openedu/ui';
import { Lobby } from './Lobby';
import { Ended } from './Ended';
import { Controls } from './Controls';
import { slideItemId } from './util';

const Stage = lazy(() => import('./Stage'));

export const BOARD_USER = 'bang-lop';

export interface SessionProps {
  sessionId: string;
  ctl: boolean;
  onLeave: () => void;
}

export function Session({ sessionId, ctl, onLeave }: SessionProps) {
  const view = useLiveChannel(sessionId, ctl ? 'teacher' : 'screen');
  const { channel, status, error } = view;
  const raw = view.state;
  // Chế độ Supabase: state không kèm bài giảng/item → tải riêng.
  const lessonQ = useLesson(raw && !raw.lesson ? raw.lessonId : undefined);
  const lesson = raw?.lesson ?? lessonQ.data ?? null;
  const ids = useMemo(() => (raw?.items ? [] : lessonItemIds(lesson)), [raw?.items, lesson]);
  const itemsQ = useItemsByIds(ids);
  const items: Record<string, Item> = raw?.items ?? itemsQ.data ?? {};
  const state: LiveState | null = useMemo(() => (raw && !raw.lesson && lesson ? { ...raw, lesson } : raw), [raw, lesson]);

  // Kênh không phát tin cho câu trả lời của chính máy này → tự vẽ lại.
  const [, setTick] = useState(0);
  const responses = channel && state ? channel.responses(state.slideIndex) : [];

  const cmd = useCallback(
    (c: LiveCommand) => {
      if (!channel) return;
      channel.send(c).catch(() => undefined);
    },
    [channel],
  );

  const sendTimer = useRef<number | undefined>(undefined);
  const onBoardAnswer = useCallback(
    (itemId: string, response: AnyResponse) => {
      if (!channel || !state) return;
      const slideIndex = state.slideIndex;
      window.clearTimeout(sendTimer.current);
      sendTimer.current = window.setTimeout(() => {
        channel
          .respond({ sessionId, userId: BOARD_USER, itemId, slideIndex, response })
          .catch(() => undefined)
          .then(() => setTick((t) => t + 1));
      }, 350);
    },
    [channel, state, sessionId],
  );
  useEffect(() => () => window.clearTimeout(sendTimer.current), []);

  const idle = useIdle(3000);
  const offline = status !== 'open';

  let body;
  if (!state) {
    body = (
      <div className="pr-center">
        <Mascot id="nghe" mood={status === 'error' ? 'think' : 'happy'} size={200} animate className="pr-center__mascot" />
        <h1 className="pr-center__h">{status === 'error' ? 'Chưa vào được lớp' : 'Đang mở lớp học…'}</h1>
        {status === 'error' && <p className="pr-center__p">{error ?? 'Không tìm thấy lớp học trực tiếp này.'}</p>}
        <button type="button" className="pr-link" onClick={onLeave}>
          Nhập mã lớp khác
        </button>
      </div>
    );
  } else if (state.phase === 'lobby') {
    body = <Lobby state={state} />;
  } else if (state.phase === 'ended') {
    body = <Ended state={state} />;
  } else {
    body = (
      <Suspense fallback={<div className="pr-center"><Mascot id="nghe" size={160} animate className="pr-center__mascot" /></div>}>
        <Stage state={state} items={items} responses={responses} board={ctl} onBoardAnswer={onBoardAnswer} />
      </Suspense>
    );
  }

  return (
    <div className={`pr-app${idle ? ' is-idle' : ''}${ctl ? ' is-ctl' : ''}`}>
      {body}
      {state?.locked && state.phase !== 'ended' && (
        <div className="pr-locked" role="status">
          <Icon name="eye" size={32} /> Học sinh đang nhìn lên bảng
        </div>
      )}
      {state && offline && (
        <div className="pr-conn" role="status">
          <span className="pr-conn__dot" /> Đang kết nối lại…
        </div>
      )}
      <FullscreenButton />
      {ctl && state && (
        <Controls
          state={state}
          activityId={slideItemId(state.lesson?.slides[state.slideIndex])}
          slideCount={state.lesson?.slides.length ?? 0}
          send={cmd}
        />
      )}
    </div>
  );
}

function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), ms);
    };
    const evs = ['pointermove', 'pointerdown', 'keydown'];
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [ms]);
  return idle;
}

function FullscreenButton() {
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (!el.requestFullscreen && !el.webkitRequestFullscreen) return null;
  const toggle = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
      else el.webkitRequestFullscreen?.();
    } catch {
      /* trình duyệt TV không cho toàn màn hình: bỏ qua */
    }
  };
  return (
    <button type="button" className="pr-fs" onClick={toggle} aria-label={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'} title={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>
      <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
        <path d={full ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
