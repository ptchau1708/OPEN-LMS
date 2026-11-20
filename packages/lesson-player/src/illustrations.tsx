/* Minh họa SVG nhỏ, vẽ tay (được phép dùng mã màu trực tiếp theo CONVENTIONS — minh họa). */

/** Đôi mắt to nhìn lên — màn "Nhìn lên bảng nhé!". */
export function BigEyes({ size = 260 }: { size?: number }) {
  return (
    <svg className="lp-eyes" width={size} height={size * 0.62} viewBox="0 0 260 160" role="img" aria-label="Đôi mắt nhìn lên">
      <title>Đôi mắt nhìn lên</title>
      {[70, 190].map((cx, i) => (
        <g key={cx}>
          <path d={`M${cx - 44} 34 Q${cx} ${i === 0 ? 6 : 6} ${cx + 44} 34`} fill="none" stroke="#3b2f4a" strokeWidth="9" strokeLinecap="round" className="lp-eyes__brow" />
          <ellipse cx={cx} cy="98" rx="50" ry="56" fill="#ffffff" stroke="#3b2f4a" strokeWidth="7" />
          <g className="lp-eyes__pupil">
            <circle cx={cx} cy="78" r="25" fill="#2b2140" />
            <circle cx={cx + 9} cy="68" r="8" fill="#ffffff" />
            <circle cx={cx - 8} cy="88" r="4" fill="#ffffff" opacity="0.8" />
          </g>
          <g className="lp-eyes__lid">
            <ellipse cx={cx} cy="98" rx="50" ry="56" fill="#ffd9b8" stroke="#3b2f4a" strokeWidth="7" />
          </g>
        </g>
      ))}
    </svg>
  );
}

/** Chú vịt cao su cho trò Đua vịt. */
export function Duck({ size = 56, color = '#ffd23f' }: { size?: number; color?: string }) {
  return (
    <svg className="lp-duck" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="34" cy="52" rx="24" ry="5" fill="#000000" opacity="0.12" />
      <path d="M10 36 Q8 50 26 52 L44 52 Q58 50 56 36 Q54 30 46 30 L30 30 Q18 30 10 36 Z" fill={color} stroke="#c98a00" strokeWidth="2" />
      <path d="M22 38 Q30 44 40 38" fill="none" stroke="#c98a00" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="44" cy="22" r="13" fill={color} stroke="#c98a00" strokeWidth="2" />
      <path d="M55 22 Q64 22 63 26 Q60 30 53 27 Z" fill="#ff8a3d" stroke="#d9661f" strokeWidth="1.5" />
      <circle cx="47" cy="19" r="3" fill="#22304a" />
      <circle cx="48" cy="18" r="1" fill="#ffffff" />
      <circle cx="41" cy="26" r="3" fill="#ff9fb4" opacity="0.7" />
    </svg>
  );
}

/** Quả bom hoạt hình; `fuse` 0..1 = độ dài dây cháy còn lại. */
export function Bomb({ size = 240, fuse = 1, label }: { size?: number; fuse?: number; label?: string }) {
  const f = Math.max(0, Math.min(1, fuse));
  return (
    <svg className="lp-bomb" width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={label ?? 'Bom hẹn giờ'}>
      <title>{label ?? 'Bom hẹn giờ'}</title>
      <g className="lp-bomb__fuse" style={{ transform: `scale(${0.35 + 0.65 * f})`, transformOrigin: '120px 62px' }}>
        <path d="M120 62 Q132 30 158 26" fill="none" stroke="#8a6f5a" strokeWidth="7" strokeLinecap="round" strokeDasharray="6 5" />
        <g className="lp-bomb__spark" style={{ transformOrigin: '160px 24px' }}>
          <circle cx="160" cy="24" r="11" fill="#ffc22e" />
          <circle cx="160" cy="24" r="5" fill="#fff6c9" />
          <path d="M160 6 L160 0 M176 12 L182 8 M178 28 L186 30 M144 12 L139 7" stroke="#ff9f43" strokeWidth="4" strokeLinecap="round" />
        </g>
      </g>
      <rect x="104" y="54" width="34" height="22" rx="6" fill="#4a5168" transform="rotate(28 121 65)" />
      <circle cx="96" cy="118" r="70" fill="#2f3447" />
      <ellipse cx="70" cy="92" rx="18" ry="12" fill="#ffffff" opacity="0.25" transform="rotate(-30 70 92)" />
      <circle cx="74" cy="122" r="7" fill="#ffffff" />
      <circle cx="118" cy="122" r="7" fill="#ffffff" />
      <circle cx="75" cy="123" r="3.5" fill="#22304a" />
      <circle cx="119" cy="123" r="3.5" fill="#22304a" />
      <path d="M84 144 Q96 152 108 144" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Tia nổ hoạt hình (không đáng sợ): ngôi sao nhiều cánh màu vàng cam. */
export function Burst({ size = 260, text }: { size?: number; text: string }) {
  const pts: string[] = [];
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 96 : 66;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${100 + r * Math.cos(a)},${100 + r * Math.sin(a)}`);
  }
  return (
    <svg className="lp-burst" width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={text}>
      <polygon points={pts.join(' ')} fill="#ffc22e" stroke="#ff9f43" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="100" cy="100" r="54" fill="#fff3c4" />
      <text x="100" y="112" textAnchor="middle" fontSize="34" fontWeight="900" fill="#e8642c" fontFamily="'Baloo 2', Nunito, sans-serif">
        {text}
      </text>
    </svg>
  );
}

/** Ba chấm nhảy — đang tải / đang chờ. */
export function Dots() {
  return (
    <span className="lp-dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
