import { useEffect, useMemo, useRef, useState } from 'react';
import type { PackageHostProps } from '@openedu/contracts';
import { Button, Icon, Mascot, ProgressBar } from '@openedu/ui';
import { contentOrigin, isBridgeMessage, launcherUrl, unitNumber } from './bridge';
import { Dots } from './illustrations';
import { cx } from './util';
import './base.css';
import './package.css';

const READY_TIMEOUT_MS = 15000;

type Status = 'loading' | 'ready' | 'error';

/** Chạy gói HTML5 / H5P / SCORM trong iframe trỏ tới launcher.html trên origin nội dung riêng. */
export function PackageHost({ pkg, allowedOrigin, onResult, height }: PackageHostProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const setup = useMemo(() => {
    try {
      const origin = contentOrigin(pkg);
      const appOrigin = window.location.origin;
      if (origin === appOrigin) {
        return { error: 'Gói nội dung phải đặt ở máy chủ nội dung riêng, không đặt chung địa chỉ với ứng dụng.' };
      }
      return { origin, src: launcherUrl(pkg, appOrigin) };
    } catch {
      return { error: 'Địa chỉ gói nội dung chưa đúng.' };
    }
  }, [pkg]);
  const accept = allowedOrigin ?? setup.origin;
  const shown: Status = setup.error ? 'error' : status;

  useEffect(() => {
    setStatus(setup.error ? 'error' : 'loading');
    setProblem(setup.error ?? null);
    setProgress(null);
    setCompleted(false);
    if (setup.error || !accept) return;
    let ready = false;
    const onMsg = (e: MessageEvent) => {
      // Chỉ nhận tin từ đúng origin nội dung VÀ đúng iframe của gói này.
      if (e.origin !== accept) return;
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data;
      if (!isBridgeMessage(d)) return;
      if (d.type === 'ready') {
        ready = true;
        setStatus('ready');
      } else if (d.type === 'progress') {
        ready = true;
        setStatus('ready');
        const p = unitNumber(d.progress);
        if (p !== undefined) setProgress(p);
      } else if (d.type === 'result') {
        ready = true;
        setStatus('ready');
        const score = unitNumber(d.score);
        const done = d.completed === true;
        if (done) {
          setCompleted(true);
          setProgress(1);
        }
        onResultRef.current?.({ score, completed: d.completed, raw: d.raw });
      } else if (d.type === 'error') {
        setStatus('error');
        setProblem(typeof d.message === 'string' ? d.message : null);
      }
    };
    window.addEventListener('message', onMsg);
    const t = window.setTimeout(() => {
      if (!ready) setStatus('error');
    }, READY_TIMEOUT_MS);
    return () => {
      window.removeEventListener('message', onMsg);
      window.clearTimeout(t);
    };
  }, [setup, accept, attempt]);

  return (
    <div className={cx('lp-pkg', `lp-pkg--${shown}`)} style={height != null ? { height } : undefined}>
      {setup.src && (
        <iframe
          key={attempt}
          ref={frame}
          className="lp-pkg__frame"
          src={setup.src}
          title={pkg.title}
          /*
           * allow-same-origin CHỈ chấp nhận được vì gói luôn được phục vụ từ một origin nội dung RIÊNG
           * (content-host, vd content.openedu.vn), không bao giờ từ origin của app. Khi đó "same origin" nghĩa là
           * cùng origin với chính máy chủ nội dung — gói không đọc được cookie, localStorage, phiên đăng nhập
           * Supabase hay DOM của app. Launcher cần cờ này để: nhúng SCO/HTML cùng origin vào iframe con,
           * cho SCO tìm window.API (SCORM), và cho H5P dùng storage. Nếu đặt gói chung origin với app,
           * allow-scripts + allow-same-origin sẽ cho gói tự gỡ sandbox — vì vậy component từ chối trường hợp đó ở trên.
           */
          sandbox="allow-scripts allow-same-origin allow-forms"
          allow="autoplay; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      )}
      {progress != null && shown === 'ready' && (
        <div className="lp-pkg__progress">
          <ProgressBar value={progress} label="Tiến độ bài chơi" />
        </div>
      )}
      {completed && (
        <div className="lp-pkg__done" role="status">
          <Icon name="check" size={22} /> Em đã hoàn thành!
        </div>
      )}
      {shown === 'loading' && (
        <div className="lp-pkg__overlay" role="status" aria-live="polite">
          <Mascot id="nghe" mood="happy" size={120} animate />
          <p className="lp-pkg__msg">
            Đang mở bài chơi <Dots />
          </p>
        </div>
      )}
      {shown === 'error' && (
        <div className="lp-pkg__overlay lp-pkg__overlay--error" role="alert">
          <Mascot id="nghe" mood="think" size={120} />
          <p className="lp-pkg__msg">Ôi, bài chơi chưa mở được.</p>
          <p className="lp-pkg__hint">{setup.error ?? problem ?? 'Em kiểm tra mạng rồi bấm “Thử lại” nhé. Nếu vẫn chưa được, em báo thầy/cô nhé.'}</p>
          {!setup.error && (
            <Button variant="primary" size="lg" icon={<Icon name="retry" size={24} />} onClick={() => setAttempt((a) => a + 1)}>
              Thử lại
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
