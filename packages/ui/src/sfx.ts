/**
 * Âm thanh phản hồi tổng hợp bằng Web Audio — không cần tải file nào.
 * Trình duyệt chỉ cho phát sau lần chạm đầu tiên; gọi unlockAudio() trong một onClick bất kỳ.
 */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}
export function isSoundEnabled(): boolean {
  return enabled;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18): void {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

export const sfx = {
  /** Chạm nhẹ vào nút/thẻ. */
  tap(): void {
    if (!enabled) return;
    tone(660, 0, 0.06, 'triangle', 0.08);
  },
  /** Trả lời đúng: hai nốt đi lên. */
  correct(): void {
    if (!enabled) return;
    tone(784, 0, 0.12, 'triangle');
    tone(1175, 0.1, 0.22, 'triangle');
  },
  /** Chưa đúng: một nốt trầm, dịu — không phải tiếng "sai" gắt. */
  tryAgain(): void {
    if (!enabled) return;
    tone(392, 0, 0.18, 'sine', 0.12);
    tone(330, 0.14, 0.22, 'sine', 0.1);
  },
  /** Nhận sao. */
  star(): void {
    if (!enabled) return;
    [988, 1319, 1568].forEach((f, i) => tone(f, i * 0.07, 0.16, 'triangle', 0.12));
  },
  /** Hoàn thành bài / mở khóa linh vật. */
  fanfare(): void {
    if (!enabled) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.25, 'triangle', 0.14));
    tone(1319, 0.5, 0.4, 'triangle', 0.12);
  },
  /** Thả thẻ vào ô. */
  drop(): void {
    if (!enabled) return;
    tone(523, 0, 0.07, 'square', 0.05);
  },
  /** Tích tắc đồng hồ đếm ngược. */
  tick(): void {
    if (!enabled) return;
    tone(1200, 0, 0.03, 'square', 0.04);
  },
};
