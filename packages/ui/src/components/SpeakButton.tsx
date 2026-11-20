import { useEffect, useRef, useState } from 'react';
import { speak, stopSpeaking, hasVoice, voicesReady } from '../speech';
import type { SpeakLang } from '../speech';

export interface SpeakButtonProps {
  text: string;
  lang?: SpeakLang;
  audioUrl?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  autoPlay?: boolean;
  /** Hiện chữ (label) cạnh loa thay vì chỉ có biểu tượng. */
  showLabel?: boolean;
}

const NO_VOICE = 'Máy chưa có giọng đọc tiếng Việt';

/* Chỉ một nút được "đang đọc" tại một thời điểm: nút mới bắt đầu thì báo các nút khác tắt sóng. */
let currentOwner = 0;
let nextOwner = 1;
const listeners = new Set<(owner: number) => void>();
function claim(owner: number) {
  currentOwner = owner;
  listeners.forEach((l) => l(owner));
}

export function SpeakButton({ text, lang = 'vi-VN', audioUrl, label = 'Nghe', size = 'md', className, autoPlay, showLabel }: SpeakButtonProps) {
  const me = useRef(0);
  if (!me.current) me.current = nextOwner++;
  const [voice, setVoice] = useState(() => hasVoice(lang));
  const [speaking, setSpeaking] = useState(false);
  const fallback = useRef<number | undefined>(undefined);
  const latest = useRef({ text, lang, audioUrl });
  latest.current = { text, lang, audioUrl };

  useEffect(() => {
    let alive = true;
    voicesReady().then(() => { if (alive) setVoice(hasVoice(lang)); });
    return () => { alive = false; };
  }, [lang]);

  useEffect(() => {
    const l = (owner: number) => { if (owner !== me.current) { setSpeaking(false); window.clearTimeout(fallback.current); } };
    listeners.add(l);
    return () => {
      listeners.delete(l);
      window.clearTimeout(fallback.current);
      if (currentOwner === me.current) { stopSpeaking(); currentOwner = 0; }
    };
  }, []);

  const finish = () => {
    window.clearTimeout(fallback.current);
    setSpeaking(false);
    if (currentOwner === me.current) currentOwner = 0;
  };

  const start = (): boolean => {
    const { text: t, lang: lg, audioUrl: au } = latest.current;
    claim(me.current);
    const ok = speak(t, { lang: lg, audioUrl: au, onEnd: finish });
    if (!ok) { finish(); return false; }
    setSpeaking(true);
    // Một số trình duyệt không gọi onend — tự tắt sóng sau thời gian ước lượng.
    window.clearTimeout(fallback.current);
    fallback.current = window.setTimeout(finish, Math.min(60000, 2500 + t.length * 110));
    return true;
  };

  useEffect(() => {
    if (!autoPlay) return;
    let alive = true;
    voicesReady().then(() => { if (alive) start(); });
    return () => { alive = false; };
    // Chỉ đọc một lần khi gắn vào trang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const available = !!audioUrl || voice;
  const onClick = () => {
    if (speaking) { stopSpeaking(); finish(); return; }
    start();
  };

  return (
    <button
      type="button"
      className={`k-speak k-speak--${size}${speaking ? ' is-speaking' : ''}${showLabel ? ' k-speak--labeled' : ''}${className ? ' ' + className : ''}`}
      onClick={onClick}
      disabled={!available}
      title={available ? label : NO_VOICE}
      aria-label={available ? (speaking ? `${label} (đang đọc, bấm để dừng)` : label) : NO_VOICE}
      aria-pressed={available ? speaking : undefined}
    >
      <svg className="k-speak__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3.5 9.3h3.6L11.6 5.4v13.2l-4.5-3.9H3.5z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path className="k-speak__w1" d="M15 9.3a3.8 3.8 0 0 1 0 5.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path className="k-speak__w2" d="M17.6 6.8a7.3 7.3 0 0 1 0 10.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path className="k-speak__w3" d="M20.2 4.3a10.8 10.8 0 0 1 0 15.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        {!available && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
      </svg>
      {showLabel && <span className="k-speak__label">{label}</span>}
    </button>
  );
}
