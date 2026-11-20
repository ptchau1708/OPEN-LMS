import type { TypePlayerProps } from '../../shared/typeApi';
import { SequenceBoard } from '../ORDERING/SequenceBoard';
import { score } from './score';
import './style.css';

export function Player({ item, value, onChange, disabled, reveal, result, mode, bigText }: TypePlayerProps<'SENTENCE_SCRAMBLE'>) {
  const local = reveal && item.key ? score(item, value) : undefined;
  const res = reveal ? result ?? local : undefined;
  return (
    <SequenceBoard
      items={item.payload.words}
      seed={item.id}
      order={value?.order ?? []}
      onChange={(order) => onChange({ order })}
      disabled={disabled}
      reveal={reveal}
      parts={res?.parts}
      correctOrder={reveal && res && !res.correct ? item.key?.order : undefined}
      variant="sentence"
      direction="horizontal"
      subject={item.subject}
      bigText={bigText}
      mode={mode}
    />
  );
}
