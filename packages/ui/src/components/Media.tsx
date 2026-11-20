import { useEffect, useState } from 'react';
import { Icon } from './Icon';

export interface MediaProps { src: string; alt?: string; size?: number | string; className?: string; fit?: 'contain' | 'cover' }

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** "emoji:🐟" → emoji to; còn lại là <img>. Ảnh lỗi → ô giữ chỗ dịu mắt. */
export function Media({ src, alt = '', size, className, fit = 'contain' }: MediaProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const cx = className ? ' ' + className : '';
  if (src.startsWith('emoji:')) {
    return (
      <span
        className={`k-media k-media--emoji${cx}`}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        style={{ fontSize: size, fontFamily: EMOJI_FONT }}
      >
        {src.slice(6)}
      </span>
    );
  }
  if (broken || !src) {
    return (
      <span className={`k-media k-media--missing${cx}`} role="img" aria-label={alt || 'Ảnh'} style={{ width: size ?? 96, height: size ?? 96 }}>
        <Icon name="image" size={32} />
      </span>
    );
  }
  return (
    <img
      className={`k-media${cx}`}
      src={src}
      alt={alt}
      style={{ width: size, height: size, objectFit: fit }}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}
