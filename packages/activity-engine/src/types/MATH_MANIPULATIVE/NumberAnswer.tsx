import { useEffect, useState } from 'react';
import { sfx, unlockAudio } from '@openedu/ui';

export interface NumberAnswerProps {
  value: number | undefined;
  onChange: (v: number) => void;
  choices?: number[];
  locked: boolean;
  /** Khi hiện đáp án: số đúng (nếu có key). */
  correct?: number;
  reveal: boolean;
}

/** Trả lời bằng ô số to (nếu có lựa chọn) hoặc bàn phím số trên màn hình. Ô trống → gửi NaN. */
export function NumberAnswer({ value, onChange, choices, locked, correct, reveal }: NumberAnswerProps) {
  const has = typeof value === 'number' && Number.isFinite(value);
  if (choices && choices.length) {
    return (
      <div className="ae-mm-choices" role="radiogroup" aria-label="Chọn kết quả">
        {choices.map((n, i) => {
          const sel = has && value === n;
          const st = reveal && correct !== undefined ? (n === correct ? (sel ? 'ok' : 'answer') : sel ? 'try' : '') : '';
          return (
            <button
              key={`${n}-${i}`}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-disabled={locked || undefined}
              className={`ae-mm-tile${sel ? ' is-selected' : ''}${st ? ` is-${st}` : ''}`}
              onClick={() => {
                if (locked) return;
                unlockAudio();
                sfx.tap();
                onChange(n);
              }}
            >
              {n}
              {st === 'ok' ? <span className="ae-tok__mark" aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
    );
  }
  return <NumberPad value={value} onChange={onChange} locked={locked} correct={correct} reveal={reveal} />;
}

function NumberPad({ value, onChange, locked, correct, reveal }: Omit<NumberAnswerProps, 'choices'>) {
  const [txt, setTxt] = useState(typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
  useEffect(() => {
    const v = typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
    setTxt((cur) => (cur === v || (cur === '' && v === '') ? cur : v));
  }, [value]);
  const push = (next: string) => {
    if (locked) return;
    unlockAudio();
    sfx.tap();
    const clean = next.replace(/^0+(?=\d)/, '').slice(0, 4);
    setTxt(clean);
    onChange(clean ? Number(clean) : Number.NaN);
  };
  const st = reveal && correct !== undefined ? (Number(txt) === correct && txt !== '' ? 'ok' : 'try') : '';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'clr'];
  return (
    <div className="ae-mm-pad">
      <output className={`ae-mm-pad__screen${st ? ` is-${st}` : ''}`} aria-live="polite">
        {txt || <span className="ae-mm-pad__q">?</span>}
      </output>
      {st === 'try' ? <p className="ae-mm-fix">Đáp án: {correct}</p> : null}
      <div className="ae-mm-pad__keys">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className={`ae-mm-key${k === 'del' || k === 'clr' ? ' ae-mm-key--fn' : ''}`}
            aria-disabled={locked || undefined}
            aria-label={k === 'del' ? 'Xoá một số' : k === 'clr' ? 'Xoá hết' : k}
            onClick={() => push(k === 'del' ? txt.slice(0, -1) : k === 'clr' ? '' : txt + k)}
          >
            {k === 'del' ? '⌫' : k === 'clr' ? 'Xoá' : k}
          </button>
        ))}
      </div>
    </div>
  );
}
