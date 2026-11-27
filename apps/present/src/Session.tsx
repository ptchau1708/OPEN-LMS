import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnyResponse, Item, LiveCommand, LiveState } from '@openedu/contracts';
import { lessonItemIds, useItemsByIds, useLesson, useLiveChannel } from '@openedu/data';
import { Icon, Mascot, QrCode } from '@openedu/ui';
import { Lobby } from './Lobby';
import { Ended } from './Ended';
import { Controls } from './Controls';
import { formatPin, joinUrls, slideItemId } from './util';

const Stage = lazy(() => import('./Stage'));
const GameStage = lazy(() => import('./GameStage'));
const GameEnded = lazy(() => import('./GameStage').then((m) => ({ default: m.GameEnded })));

export const BOARD_USER = 'bang-lop';

export interface SessionProps {
  sessionId: string;
  /** Mã lớp 6 số (link "Mở trên TV" hoặc nhập trên TV) — TV xem được khi chưa đăng nhập. */
  pin?: string;
  ctl: boolean;
  onLeave: () => void;
}

export function Session({ sessionId, pin, ctl, onLeave }: SessionProps) {
  const view = useLiveChannel(sessionId, ctl ? 'teacher' : 'screen', ctl ? null : pin);
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
  // Phóng to mã QR cho HS ngồi xa: bấm vào mã QR, hoặc phím Q (Esc để đóng).
  const [bigQr, setBigQr] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      if (e.key === 'q' || e.key === 'Q') setBigQr((v) => !v);
      else if (e.key === 'Escape') setBigQr(false);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  // Quá 8 giây chưa có trạng thái lớp → báo cách khắc phục thay vì quay mãi.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (state) return;
    const t = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(t);
  }, [state]);
  const offline = status !== 'open';

  let body;
  if (!state) {
    const stuck = status === 'error' || slow;
    body = (
      <div className="pr-center">
        <Mascot id="nghe" mood={stuck ? 'think' : 'happy'} size={200} animate className="pr-center__mascot" />
        <h1 className="pr-center__h">{status === 'error' ? 'Chưa vào được lớp' : 'Đang mở lớp học…'}</h1>
        {status === 'error' ? <p className="pr-center__p">{error ?? 'Không tìm thấy lớp học trực tiếp này.'}</p>
          : slow ? <p className="pr-center__p">{pin || ctl ? 'Lớp đang mở chậm. Thầy/cô kiểm tra mạng, hoặc bấm “Nhập mã lớp khác” rồi nhập mã 6 số trên máy giáo viên.' : 'Link này thiếu mã lớp. Bấm “Nhập mã lớp khác” rồi nhập mã 6 số trên máy giáo viên, hoặc bấm lại “Mở trên TV”.'}</p> : null}
        <button type="button" className="pr-link" onClick={onLeave}>
          Nhập mã lớp khác
        </button>
      </div>
    );
  } else if (state.phase === 'lobby') {
    body = <Lobby state={state} />;
  } else if (state.game) {
    body = (
      <Suspense fallback={<div className="pr-center"><Mascot id="nghe" size={160} animate className="pr-center__mascot" /></div>}>
        {state.phase === 'ended' ? <GameEnded state={state} /> : <GameStage state={state} items={items} responses={responses} />}
      </Suspense>
    );
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
    <div
      className={`pr-app${idle ? ' is-idle' : ''}${ctl ? ' is-ctl' : ''}`}
      onClick={(e) => { if ((e.target as HTMLElement).closest('.pr-join__qr, .pr-corner')) setBigQr(true); }}
    >
      {body}
      {bigQr && state ? <QrOverlay pin={state.pin} onClose={() => setBigQr(false)} /> : null}
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
      {ctl && state && !state.game && (
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

/** Mã QR toàn màn hình (HS ở cuối lớp quét được). */
function QrOverlay({ pin, onClose }: { pin: string; onClose: () => void }) {
  const { full, short } = joinUrls(pin);
  return (
    <div className="pr-qrbig" role="dialog" aria-label="Mã QR vào lớp (phóng to)" onClick={(e) => { e.stopPropagation(); onClose(); }} data-testid="tv-qr-big">
      <QrCode value={full} size={900} className="pr-qrbig__qr" title="Quét mã để vào lớp" />
      <div className="pr-qrbig__side">
        <p className="pr-qrbig__l">Mã lớp</p>
        <p className="pr-qrbig__pin">{formatPin(pin)}</p>
        <p className="pr-qrbig__u">{short}</p>
        <p className="pr-qrbig__hint">Bấm vào màn hình hoặc phím Esc để thu nhỏ</p>
      </div>
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
