import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useFindLiveSession } from '@openedu/data';
import { Icon, Mascot } from '@openedu/ui';
import { Session } from './Session';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];

export function Start() {
  const [params, setParams] = useSearchParams();
  const sid = params.get('s');
  const ctl = params.get('ctl') === '1';
  if (sid) return <Session key={sid} sessionId={sid} ctl={ctl} onLeave={() => setParams(ctl ? { ctl: '1' } : {}, { replace: true })} />;
  return <PinEntry onFound={(s) => setParams(ctl ? { s, ctl: '1' } : { s }, { replace: true })} />;
}

function PinEntry({ onFound }: { onFound: (sessionId: string) => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const find = useFindLiveSession();
  const btns = useRef<(HTMLButtonElement | null)[]>([]);

  const submit = (p = pin) => {
    if (p.length !== 6 || find.isPending) return;
    setMsg(null);
    find.mutate(p, {
      onSuccess: (info) => (info ? onFound(info.sessionId) : setMsg('Chưa thấy lớp nào có mã này. Thầy cô xem lại mã trên máy giáo viên nhé!')),
      onError: (e) => setMsg(e instanceof Error ? e.message : 'Chưa kết nối được máy chủ lớp học. Thử lại nhé!'),
    });
  };
  const press = (k: string) => {
    if (k === 'ok') return submit();
    setMsg(null);
    setPin((p) => (k === 'del' ? p.slice(0, -1) : p.length < 6 ? p + k : p));
  };

  useEffect(() => {
    btns.current[0]?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const onBtn = (e.target as HTMLElement | null)?.tagName === 'BUTTON';
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter' && !onBtn) submit();
      else if (e.key.startsWith('Arrow')) {
        const cur = btns.current.findIndex((b) => b === document.activeElement);
        const i = cur < 0 ? 0 : cur;
        const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -3 : 3;
        const n = Math.min(KEYS.length - 1, Math.max(0, i + d));
        btns.current[n]?.focus();
        e.preventDefault();
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className="pr-start">
      <div className="pr-start__head">
        <Mascot id="nghe" mood="wave" size={120} animate className="pr-start__mascot" />
        <div>
          <h1 className="pr-start__title">Màn hình lớp</h1>
          <p className="pr-start__sub">Nhập mã lớp 6 số trên máy của thầy cô</p>
        </div>
      </div>
      <div className="pr-pin" aria-label={`Mã đã nhập: ${pin.split('').join(' ')}`} role="status">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`pr-pin__slot${pin[i] ? ' is-filled' : ''}${i === pin.length ? ' is-next' : ''}${i === 3 ? ' is-gap' : ''}`}>
            {pin[i] ?? ''}
          </span>
        ))}
      </div>
      <p className="pr-start__msg" aria-live="polite">{find.isPending ? 'Đang tìm lớp…' : msg ?? ' '}</p>
      <div className="pr-pad">
        {KEYS.map((k, i) => (
          <button
            key={k}
            ref={(el) => (btns.current[i] = el)}
            type="button"
            className={`pr-pad__key${k === 'ok' ? ' is-ok' : k === 'del' ? ' is-del' : ''}`}
            disabled={k === 'ok' && (pin.length !== 6 || find.isPending)}
            onClick={() => press(k)}
            aria-label={k === 'del' ? 'Xóa' : k === 'ok' ? 'Vào lớp' : k}
          >
            {k === 'del' ? <Icon name="back" size={40} /> : k === 'ok' ? 'Vào' : k}
          </button>
        ))}
      </div>
    </main>
  );
}
