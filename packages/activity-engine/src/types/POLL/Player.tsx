import type { TypePlayerProps } from '../../shared/typeApi';
import { OptionGrid } from '../MCQ/OptionGrid';
import './style.css';

/** Thăm dò ý kiến: không có đúng/sai. Trên TV chỉ hiện các lựa chọn (cả lớp chọn trên máy mình). */
export function Player({ item, value, onChange, disabled, mode }: TypePlayerProps<'POLL'>) {
  const n = item.payload.options.length;
  const big = mode === 'bigscreen';
  const cols = big ? (n <= 4 ? 4 : 2) : 2;
  return (
    <div className={`ae-poll ae-poll--${mode}`}>
      {!big ? <span className="ae-tip">Không có đúng hay sai đâu, em chọn theo ý thích nhé!</span> : null}
      <OptionGrid
        options={item.payload.options}
        seed={item.id}
        shuffle={false}
        columns={cols as 2 | 4}
        selected={!big && value?.choice ? [value.choice] : []}
        onPick={(id) => onChange({ choice: id })}
        disabled={disabled}
        mode={mode}
        interactive={!big}
        speakOnPick={!big && item.grade <= 2}
        lang={item.prompt.lang}
        ariaLabel="Các lựa chọn"
      />
    </div>
  );
}
