import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useFindLiveSession, usePassport } from '@openedu/data';
import { MascotBubble, sfx } from '@openedu/ui';
import { NumberPad, TopBack } from '../components/Common';
import { errText, useMe } from '../lib/util';
import '../styles/live.css';

export default function LiveJoin() {
  const me = useMe();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const find = useFindLiveSession();
  const companion = usePassport(me.id).data?.companion ?? me.avatarMascot;
  const [pin, setPin] = useState(() => (params.get('pin') ?? '').replace(/\D/g, '').slice(0, 6));
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const tried = useRef('');

  const go = (p: string) => {
    if (p.length !== 6 || find.isPending) return;
    tried.current = p;
    setMsg(null);
    find.mutate(p, {
      onSuccess: (info) => {
        if (!info) { sfx.tryAgain(); setMsg('Không tìm thấy lớp có mã này. Em nhìn lại mã trên bảng nhé!'); setShake((s) => s + 1); setPin(''); return; }
        sfx.correct();
        nav(`/lop/${encodeURIComponent(info.sessionId)}?bai=${encodeURIComponent(info.lessonId)}`, { replace: true });
      },
      onError: (e) => { sfx.tryAgain(); setMsg(errText(e, 'Chưa kết nối được lớp học. Em thử lại nhé!')); setShake((s) => s + 1); },
    });
  };

  // Đủ 6 số thì tự vào lớp.
  useEffect(() => { if (pin.length === 6 && tried.current !== pin) go(pin); });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((x) => (x.length < 6 ? x + e.key : x));
      else if (e.key === 'Backspace') { tried.current = ''; setPin((x) => x.slice(0, -1)); }
      else if (e.key === 'Enter') go(pin);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <div className="ln-page ln-join">
      <TopBack title="Vào lớp trực tiếp" />
      <div className="ln-join__body">
        <MascotBubble mascot={companion} mood={find.isPending ? 'think' : 'wave'} size={88}>
          {find.isPending ? 'Đang tìm lớp của em…' : 'Em nhập mã 6 số trên bảng nhé!'}
        </MascotBubble>
        <div key={shake} className={`ln-pin${shake ? ' is-shake' : ''}`} aria-label={`Mã lớp: ${pin.split('').join(' ') || 'chưa nhập'}`} role="status">
          {Array.from({ length: 6 }, (_, i) => <span key={i} className={`ln-pin__box${i < pin.length ? ' is-filled' : ''}${i === pin.length ? ' is-next' : ''}`}>{pin[i] ?? ''}</span>)}
        </div>
        {msg && <p className="ln-alert" role="alert">{msg}</p>}
        <NumberPad
          onDigit={(d) => { setMsg(null); setPin((x) => (x.length < 6 ? x + d : x)); }}
          onBack={() => { tried.current = ''; setPin((x) => x.slice(0, -1)); }}
          onOk={() => { tried.current = ''; go(pin); }}
          okLabel="Vào lớp"
          okDisabled={pin.length !== 6 || find.isPending}
        />
      </div>
    </div>
  );
}
