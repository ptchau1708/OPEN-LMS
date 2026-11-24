/** Nhận giọng nói tiếng Việt → chữ (Web Speech API, Chrome / Android). Trình duyệt không hỗ trợ thì `supported` = false. */
import { useRef, useState } from 'react';

type SR = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; start(): void; stop(): void };
export function useSpeech(onText: (t: string) => void) {
  const Ctor = (typeof window !== 'undefined' ? (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }) : {});
  const C = Ctor.SpeechRecognition ?? Ctor.webkitSpeechRecognition;
  const [on, setOn] = useState(false);
  const ref = useRef<SR | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  const toggle = () => {
    if (!C) return;
    if (on) { ref.current?.stop(); return; }
    const r = new C();
    r.lang = 'vi-VN';
    r.interimResults = false;
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' '); if (t) cb.current(t); };
    r.onend = () => setOn(false);
    ref.current = r;
    try { r.start(); setOn(true); } catch { setOn(false); }
  };
  return { supported: !!C, on, toggle };
}

