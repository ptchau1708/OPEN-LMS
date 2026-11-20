import type { TypePlayerProps } from '../../shared/typeApi';
import { OptionGrid } from '../MCQ/OptionGrid';
import { score } from './score';
import './style.css';

export function Player({ item, value, onChange, disabled, reveal, result, mode }: TypePlayerProps<'MCQ_MULTIPLE'>) {
  const chosen = Array.isArray(value?.choices) ? value!.choices : [];
  const parts = reveal ? (result?.parts ?? (item.key ? score(item, value).parts : undefined)) : undefined;
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    onChange({ choices: next });
  };
  return (
    <div className="ae-mcqm">
      {!reveal ? (
        <div className="ae-mcqm__bar">
          <span className="ae-tip ae-mcqm__tip">
            <span className="ae-mcqm__box" aria-hidden="true" />
            Em có thể chọn nhiều đáp án
          </span>
          {chosen.length ? <span key={chosen.length} className="ae-count">Đã chọn {chosen.length}</span> : null}
        </div>
      ) : null}
      <OptionGrid
        options={item.payload.options}
        seed={item.id}
        columns={item.payload.columns}
        selected={chosen}
        onPick={toggle}
        multi
        disabled={disabled}
        reveal={reveal}
        parts={parts}
        mode={mode}
        speakOnPick={mode === 'player' && item.grade <= 2}
        lang={item.prompt.lang}
        ariaLabel="Các đáp án, chọn một hoặc nhiều"
      />
    </div>
  );
}
