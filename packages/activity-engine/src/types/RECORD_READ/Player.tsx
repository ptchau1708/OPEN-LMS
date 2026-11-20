import { useEffect, useRef, useState } from 'react';
import { Button, SpeakButton, sfx, unlockAudio } from '@openedu/ui';
import type { TypePlayerProps } from '../../shared/typeApi';
import './style.css';

type Phase = 'idle' | 'asking' | 'recording' | 'done';

const BAR_SHAPE = [0.55, 0.8, 1, 0.9, 1, 0.8, 0.55];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  return list.find((t) => MediaRecorder.isTypeSupported(t));
}

function supportProblem(): string | null {
  if (typeof window === 'undefined') return 'Máy này chưa ghi âm được.';
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (typeof MediaRecorder === 'undefined' || !md || typeof md.getUserMedia !== 'function') {
    return window.isSecureContext === false
      ? 'Trang cần mở bằng địa chỉ https:// thì mới dùng được micro. Em hãy đọc to cho thầy cô nghe nhé!'
      : 'Máy này chưa ghi âm được. Em hãy đọc to cho thầy cô hoặc bố mẹ nghe nhé!';
  }
  return null;
}

function micError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
    return 'Em cần cho phép dùng micro. Nhờ bố mẹ hoặc thầy cô bấm "Cho phép" rồi thử lại nhé.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError')
    return 'Không tìm thấy micro. Nhờ người lớn cắm tai nghe có micro rồi thử lại nhé.';
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'Micro đang bận (có ứng dụng khác đang dùng). Đóng ứng dụng đó rồi thử lại nhé.';
  return 'Chưa ghi âm được. Em thử lại nhé.';
}

/** Đọc to: hiện đoạn văn chữ to; ghi âm / dừng / nghe lại; thanh âm lượng; đếm ngược tới maxSeconds. */
export function Player({ item, value, onChange, disabled, mode }: TypePlayerProps<'RECORD_READ'>) {
  const { text } = item.payload;
  const max = Math.min(300, Math.max(5, Math.round(item.payload.maxSeconds || 30)));
  const view = mode === 'bigscreen';
  const [problem] = useState<string | null>(() => (view ? null : supportProblem()));
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(value?.audioUrl ? 'done' : 'idle');
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);

  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const actx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const tick = useRef<number | undefined>(undefined);
  const t0 = useRef(0);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const myUrls = useRef<string[]>([]);
  const alive = useRef(true);
  const discard = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stopMeter = () => {
    cancelAnimationFrame(raf.current);
    window.clearInterval(tick.current);
    if (actx.current) {
      actx.current.close().catch(() => undefined);
      actx.current = null;
    }
    bars.current.forEach((b) => b && (b.style.transform = ''));
  };
  const stopStream = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  const stopPlay = () => {
    if (audio.current) {
      audio.current.pause();
      audio.current = null;
    }
    setPlaying(false);
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      discard.current = true;
      try {
        if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
      } catch {
        /* bỏ qua */
      }
      stopMeter();
      stopStream();
      if (audio.current) audio.current.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMeter = (s: MediaStream) => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const c = new AC();
      actx.current = c;
      const src = c.createMediaStreamSource(s);
      const an = c.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const x = (buf[i] - 128) / 128;
          sum += x * x;
        }
        const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 5);
        bars.current.forEach((b, i) => {
          if (b) b.style.transform = `scaleY(${(0.12 + lvl * BAR_SHAPE[i] * 0.88).toFixed(3)})`;
        });
        raf.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      /* không có thanh âm lượng vẫn ghi được */
    }
  };

  const stop = () => {
    const r = rec.current;
    if (r && r.state !== 'inactive') {
      try {
        r.stop();
      } catch {
        /* bỏ qua */
      }
    }
  };

  const start = async () => {
    if (disabled || problem || phase === 'asking' || phase === 'recording') return;
    unlockAudio();
    stopPlay();
    setErr(null);
    const before = phase;
    setPhase('asking');
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      if (!alive.current) return;
      setErr(micError(e));
      setPhase(before === 'done' ? 'done' : 'idle');
      return;
    }
    if (!alive.current) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream.current = s;
    const mime = pickMime();
    let r: MediaRecorder;
    try {
      r = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
    } catch (e) {
      stopStream();
      setErr(micError(e));
      setPhase(before === 'done' ? 'done' : 'idle');
      return;
    }
    rec.current = r;
    chunks.current = [];
    discard.current = false;
    r.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) chunks.current.push(ev.data);
    };
    r.onstop = () => {
      stopMeter();
      stopStream();
      rec.current = null;
      if (discard.current || !alive.current) return;
      const dur = Math.max(0.1, (Date.now() - t0.current) / 1000);
      const blob = new Blob(chunks.current, { type: r.mimeType || mime || 'audio/webm' });
      if (!blob.size) {
        setErr('Chưa nghe thấy gì. Em thử ghi lại nhé.');
        setPhase('idle');
        return;
      }
      const url = URL.createObjectURL(blob);
      // bản ghi cũ do chính khung này tạo → giải phóng
      myUrls.current.forEach((u) => u !== url && URL.revokeObjectURL(u));
      myUrls.current = [url];
      onChangeRef.current({ audioUrl: url, durationSec: Math.round(dur * 10) / 10 });
      setPhase('done');
      sfx.star();
    };
    r.start(250);
    t0.current = Date.now();
    setElapsed(0);
    setPhase('recording');
    sfx.tap();
    startMeter(s);
    tick.current = window.setInterval(() => {
      const sec = (Date.now() - t0.current) / 1000;
      setElapsed(sec);
      if (sec >= max) stop();
    }, 200);
  };

  const play = () => {
    if (!value?.audioUrl) return;
    unlockAudio();
    if (playing) {
      stopPlay();
      return;
    }
    const a = new Audio(value.audioUrl);
    audio.current = a;
    a.onended = () => alive.current && setPlaying(false);
    a.onerror = () => {
      if (!alive.current) return;
      setPlaying(false);
      setErr('Không phát được bản ghi này. Em thử ghi lại nhé.');
    };
    a.play().then(() => alive.current && setPlaying(true)).catch(() => alive.current && setPlaying(false));
  };

  const left = Math.max(0, Math.ceil(max - elapsed));
  const dur = value?.durationSec ?? 0;
  const has = !!value?.audioUrl;

  return (
    <div className={`ae-rr ae-rr--${phase}${view ? ' ae-rr--view' : ''}`}>
      <div className="ae-rr-paper">
        <p className="ae-rr-text">{text}</p>
        <SpeakButton text={text} label="Nghe đọc mẫu" className="ae-rr-model" />
      </div>

      {view ? (
        has ? (
          <div className="ae-rr-controls">
            <Button variant="secondary" size="xl" onClick={play}>{playing ? '■ Dừng' : '▶ Nghe bài đọc'}</Button>
          </div>
        ) : null
      ) : problem ? (
        <p className="ae-rr-msg" role="status">{problem}</p>
      ) : (
        <>
          {phase === 'recording' ? (
            <div className="ae-rr-live" aria-live="polite">
              <span className="ae-rr-dot" aria-hidden="true" />
              <span className="ae-rr-meter" aria-hidden="true">
                {BAR_SHAPE.map((_, i) => (
                  <span key={i} className="ae-rr-bar" ref={(el) => (bars.current[i] = el)} />
                ))}
              </span>
              <span className="ae-rr-left">
                Còn <strong>{left}</strong> giây
              </span>
              <span className="ae-rr-track" aria-hidden="true">
                <span className="ae-rr-progress" style={{ transform: `scaleX(${Math.min(1, elapsed / max).toFixed(3)})` }} />
              </span>
            </div>
          ) : null}

          <div className="ae-rr-controls">
            {phase === 'recording' ? (
              <Button variant="primary" size="xl" className="ae-rr-btn ae-rr-btn--stop" onClick={stop}>■ Dừng</Button>
            ) : (
              <Button
                variant={has ? 'secondary' : 'primary'}
                size="xl"
                className="ae-rr-btn ae-rr-btn--rec"
                disabled={disabled || phase === 'asking'}
                onClick={() => void start()}
              >
                <span className="ae-rr-mic" aria-hidden="true">🎙️</span> {phase === 'asking' ? 'Đang mở micro…' : has ? 'Ghi lại' : 'Bắt đầu đọc'}
              </Button>
            )}
            {has && phase !== 'recording' ? (
              <Button variant="primary" size="xl" className="ae-rr-btn ae-rr-btn--play" onClick={play}>
                {playing ? '■ Dừng nghe' : '▶ Nghe lại'}
              </Button>
            ) : null}
          </div>

          {phase === 'idle' && !err ? <p className="ae-rr-help">Bấm nút rồi đọc to, rõ ràng nhé. Em có {max} giây.</p> : null}
          {has && phase === 'done' ? (
            <p className="ae-rr-saved ae-pop-in">Đã ghi xong bài đọc ({Math.round(dur)} giây). Em nghe lại, nếu chưa ưng thì ghi lại nhé!</p>
          ) : null}
          {err ? (
            <div className="ae-rr-msg" role="alert">
              <span>{err}</span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
