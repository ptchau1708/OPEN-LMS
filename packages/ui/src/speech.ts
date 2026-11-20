/**
 * Đọc to. Ưu tiên file âm thanh sinh sẵn (TTS server); không có thì dùng giọng của trình duyệt.
 * Nhiều máy (đặc biệt Windows 7, Android cũ) không có giọng tiếng Việt → hasVoice() trả false,
 * app nên ẩn nút loa hoặc báo "Máy chưa có giọng đọc tiếng Việt".
 */
let currentAudio: HTMLAudioElement | null = null;

export type SpeakLang = 'vi-VN' | 'en-US';

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

export function findVoice(lang: SpeakLang): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const voices = s.getVoices();
  const short = lang.slice(0, 2);
  return voices.find((v) => v.lang === lang) || voices.find((v) => v.lang.toLowerCase().startsWith(short)) || null;
}

export function hasVoice(lang: SpeakLang = 'vi-VN'): boolean {
  return !!findVoice(lang);
}

/** Một số trình duyệt nạp danh sách giọng muộn; gọi để chờ. */
export function voicesReady(timeoutMs = 1500): Promise<void> {
  const s = synth();
  if (!s) return Promise.resolve();
  if (s.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { s.removeEventListener?.('voiceschanged', done); resolve(); };
    s.addEventListener?.('voiceschanged', done);
    setTimeout(done, timeoutMs);
  });
}

export interface SpeakOptions {
  lang?: SpeakLang;
  /** URL âm thanh sinh sẵn; nếu có thì phát file này. */
  audioUrl?: string;
  rate?: number;
  onEnd?: () => void;
}

export function stopSpeaking(): void {
  synth()?.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Trả về false nếu không đọc được (không có giọng, không có file). */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  stopSpeaking();
  if (opts.audioUrl) {
    const a = new Audio(opts.audioUrl);
    currentAudio = a;
    a.onended = () => opts.onEnd?.();
    a.play().catch(() => opts.onEnd?.());
    return true;
  }
  const s = synth();
  const lang = opts.lang ?? 'vi-VN';
  const voice = findVoice(lang);
  if (!s || !voice || !text.trim()) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice.lang;
  u.voice = voice;
  u.rate = opts.rate ?? (lang === 'vi-VN' ? 0.95 : 0.9);
  u.onend = () => opts.onEnd?.();
  s.speak(u);
  return true;
}
