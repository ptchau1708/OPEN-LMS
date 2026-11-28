/** Hình minh hoạ nhỏ cho hai kiểu ôn thi (SVG tự vẽ, không dùng hình của sân chơi nào). */
import type { OnThiStyle } from '@openedu/contracts';

export function StyleArt({ style, size = 96 }: { style: OnThiStyle; size?: number }) {
  if (style === 'tn') {
    return (
      <svg className="ln-ot-art" width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="46" fill="#15294a" />
        <circle cx="48" cy="48" r="38" fill="none" stroke="#ffb31a" strokeWidth="2" strokeDasharray="3 5" />
        <rect x="26" y="30" width="44" height="40" rx="4" fill="#fff3d6" />
        <rect x="21" y="26" width="10" height="48" rx="5" fill="#ffb31a" />
        <rect x="65" y="26" width="10" height="48" rx="5" fill="#ffb31a" />
        <path d="M36 42h24M36 50h24M36 58h16" stroke="#15294a" strokeWidth="3" strokeLinecap="round" />
        <circle cx="62" cy="61" r="7" fill="#e8485f" />
        <path d="M59 61l2 2 4-4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="ln-ot-art" width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" fill="#1f63cf" />
      <path d="M8 60a42 42 0 0 0 80 0z" fill="#0b9494" opacity="0.55" />
      <circle cx="48" cy="52" r="24" fill="#e2efff" stroke="#fff" strokeWidth="4" />
      <rect x="43" y="20" width="10" height="8" rx="2" fill="#fff" />
      <path d="M66 32l5-5" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M50 36 38 55h9l-2 13 13-19h-9z" fill="#ffb31a" stroke="#15294a" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
