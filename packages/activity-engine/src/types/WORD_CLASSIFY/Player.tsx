import { useMemo } from 'react';
import type { TypePlayerProps } from '../../shared/typeApi';
import { cssColor } from '../../shared/drag';
import { ZoneBoard } from '../DRAG_DROP/ZoneBoard';
import type { BoardZone } from '../DRAG_DROP/ZoneBoard';
import { score } from './score';
import './style.css';

export function Player({ item, value, onChange, disabled, reveal, result, mode, bigText }: TypePlayerProps<'WORD_CLASSIFY'>) {
  const zones = useMemo<BoardZone[]>(
    () => item.payload.groups.map((g, i) => ({ id: g.id, label: g.label, color: cssColor(g.color, i) })),
    [item.payload.groups],
  );
  const parts = reveal ? result?.parts ?? (item.key ? score(item, value).parts : undefined) : undefined;
  return (
    <ZoneBoard
      tokens={item.payload.words}
      zones={zones}
      seed={item.id}
      placement={value?.placement ?? {}}
      onChange={(placement) => onChange({ placement })}
      disabled={disabled}
      reveal={reveal}
      parts={parts}
      correct={reveal ? item.key?.placement : undefined}
      variant="word"
      subject={item.subject}
      bigText={bigText}
      mode={mode}
      noun="từ"
    />
  );
}
