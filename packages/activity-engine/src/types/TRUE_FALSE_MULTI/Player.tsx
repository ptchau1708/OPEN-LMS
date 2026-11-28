import type { TypePlayerProps } from '../../shared/typeApi';
import { Media, sfx } from '@openedu/ui';
import { score } from './score';
import './style.css';

const LETTERS = 'abcdefgh';

/** Mỗi nhận định một hàng, hai nút Đúng / Sai. Hiện đáp án: tô xanh/cam từng hàng, ghi đáp án đúng ở hàng sai. */
export function Player({ item, value, onChange, disabled, reveal, result, mode }: TypePlayerProps<'TRUE_FALSE_MULTI'>) {
  const list = item.payload.statements ?? [];
  const picks = value?.picks ?? {};
  const parts = reveal ? (result?.parts ?? (item.key ? score(item, value).parts : undefined)) : undefined;
  const truth = reveal ? item.key?.truth : undefined;
  const locked = disabled || reveal;
  const done = list.filter((s) => typeof picks[s.id] === 'boolean').length;
  const pick = (id: string, v: boolean) => {
    if (locked) return;
    const next = { ...picks };
    if (next[id] === v) delete next[id];
    else next[id] = v;
    onChange({ picks: next });
    sfx.tap();
  };
  return (
    <div className={`ae-tfm${mode === 'bigscreen' ? ' ae-tfm--big' : ''}`}>
      {!reveal ? (
        <div className="ae-tfm__bar">
          <span className="ae-tip">Mỗi ý, em chọn Đúng hoặc Sai</span>
          {done ? <span key={done} className="ae-count">{done}/{list.length} ý</span> : null}
        </div>
      ) : null}
      <ol className="ae-tfm__list">
        {list.map((s, i) => {
          const got = picks[s.id];
          const state = parts ? (parts[s.id] ? 'ae-ok is-ok' : 'ae-try is-try') : '';
          const want = truth ? truth[s.id] : undefined;
          const label = `Ý ${LETTERS[i] ?? i + 1}`;
          return (
            <li key={s.id} className={`ae-tfm__row ${state}`}>
              <span className="ae-tfm__lbl" aria-hidden="true">{LETTERS[i] ?? i + 1})</span>
              <span className="ae-tfm__text">
                {s.image ? <Media src={s.image} alt="" className="ae-tfm__img" /> : null}
                {s.text}
                {parts && !parts[s.id] && typeof want === 'boolean' ? <span className="ae-fix">Đáp án: {want ? 'Đúng' : 'Sai'}</span> : null}
              </span>
              <span className="ae-tfm__pick" role="group" aria-label={`${label}: ${s.text ?? ''}`}>
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    className={`ae-tfm__btn ae-tfm__btn--${v ? 'd' : 's'}${got === v ? ' is-on' : ''}`}
                    aria-pressed={got === v}
                    aria-disabled={locked || undefined}
                    onClick={() => pick(s.id, v)}
                  >
                    {v ? 'Đúng' : 'Sai'}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
