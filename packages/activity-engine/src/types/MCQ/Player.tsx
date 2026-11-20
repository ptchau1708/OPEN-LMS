import type { TypePlayerProps } from '../../shared/typeApi';
import { OptionGrid } from './OptionGrid';
import { score } from './score';
import './style.css';

export function Player({ item, value, onChange, disabled, reveal, result, mode }: TypePlayerProps<'MCQ'>) {
  const parts = reveal ? (result?.parts ?? (item.key ? score(item, value).parts : undefined)) : undefined;
  return (
    <OptionGrid
      options={item.payload.options}
      seed={item.id}
      columns={item.payload.columns}
      selected={value?.choice ? [value.choice] : []}
      onPick={(id) => onChange({ choice: id })}
      disabled={disabled}
      reveal={reveal}
      parts={parts}
      mode={mode}
      speakOnPick={mode === 'player' && item.grade <= 2}
      lang={item.prompt.lang}
      ariaLabel="Các đáp án, chọn một"
    />
  );
}
