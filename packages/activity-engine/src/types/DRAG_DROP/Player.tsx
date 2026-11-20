import { useMemo } from 'react';
import type { TypePlayerProps } from '../../shared/typeApi';
import { ZoneBoard } from './ZoneBoard';
import type { BoardZone } from './ZoneBoard';
import { score } from './score';
import './style.css';

/** Màu ô theo thứ tự (token): ô 1 xanh dương, ô 2 xanh lá… */
export const ZONE_COLORS = ['var(--k-math)', 'var(--k-nat)', 'var(--k-viet)', 'var(--k-eng)', 'var(--k-art)', 'var(--k-sci)', 'var(--k-music)', 'var(--k-star-dark)'];

export function Player({ item, value, onChange, disabled, reveal, result, mode, bigText }: TypePlayerProps<'DRAG_DROP'>) {
  const zones = useMemo<BoardZone[]>(
    () => item.payload.zones.map((z, i) => ({ id: z.id, label: z.label, image: z.image, color: ZONE_COLORS[i % ZONE_COLORS.length] })),
    [item.payload.zones],
  );
  const parts = reveal ? result?.parts ?? (item.key ? score(item, value).parts : undefined) : undefined;
  return (
    <ZoneBoard
      tokens={item.payload.tokens}
      zones={zones}
      seed={item.id}
      placement={value?.placement ?? {}}
      onChange={(placement) => onChange({ placement })}
      disabled={disabled}
      reveal={reveal}
      parts={parts}
      correct={reveal ? item.key?.placement : undefined}
      variant="card"
      subject={item.subject}
      bigText={bigText}
      mode={mode}
      noun="thẻ"
    />
  );
}
