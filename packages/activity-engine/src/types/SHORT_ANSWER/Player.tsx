import { Button, Icon, sfx } from '@openedu/ui';
import { subjectColorVar } from '../../shared/PromptView';
import type { TypePlayerProps } from '../../shared/typeApi';
import { score } from './score';
import './style.css';

const MAX_LEN = 12;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'] as const;

/** Chỉ giữ chữ số, dấu phẩy/chấm và dấu trừ ở đầu (bàn phím thật trên máy tính). */
function cleanNumeric(s: string): string {
  return s.replace(/[^0-9.,\-−]/g, '').replace(/(?!^)[-−]/g, '').slice(0, MAX_LEN);
}

/** Bàn phím số cho trẻ: phím to, không bật bàn phím hệ thống trên máy tính bảng. */
function NumberPad({ onKey, mode }: { onKey: (k: (typeof KEYS)[number]) => void; mode: 'player' | 'bigscreen' }) {
  return (
    <div className={`ae-pad ae-pad--${mode}`} role="group" aria-label="Bàn phím số">
      {KEYS.map((k) => (
        <Button
          key={k}
          type="button"
          variant="secondary"
          size="lg"
          className={`ae-pad__key${k === 'del' ? ' ae-pad__key--del' : ''}${k === ',' ? ' ae-pad__key--sym' : ''}`}
          aria-label={k === 'del' ? 'Xoá một số' : k === ',' ? 'Dấu phẩy' : k}
          onClick={() => onKey(k)}
        >
          {k === 'del' ? <><Icon name="back" size={22} /><span>Xoá</span></> : k}
        </Button>
      ))}
    </div>
  );
}

export function Player({ item, value, onChange, disabled, reveal, result, mode }: TypePlayerProps<'SHORT_ANSWER'>) {
  const p = item.payload;
  const numeric = p.inputMode === 'numeric';
  const text = typeof value?.text === 'string' ? value.text : '';
  const locked = disabled || reveal;
  const parts = reveal ? (result?.parts ?? (item.key ? score(item, value).parts : undefined)) : undefined;
  const ok = reveal ? (parts ? parts.answer : result?.correct) : undefined;
  const state = ok === true ? ' ae-ok is-ok' : ok === false ? ' ae-try is-try' : '';
  const accepted = item.key?.accepted?.[0];

  const press = (k: (typeof KEYS)[number]) => {
    if (locked) return;
    sfx.tap();
    if (k === 'del') onChange({ text: text.slice(0, -1) });
    else if (k === ',' && (text.includes(',') || text.includes('.'))) return;
    else if (text.length < MAX_LEN) onChange({ text: text + k });
  };

  return (
    <div className={`ae-sa ae-sa--${mode}${numeric ? ' ae-sa--numeric' : ''}`} style={{ ['--ae-accent' as string]: subjectColorVar(item) }}>
      <div className="ae-sa__main">
        <div className={`ae-sa__field${state}${text ? ' has-value' : ''}`}>
          <input
            className="ae-sa__input"
            value={text}
            placeholder={p.placeholder ?? (numeric ? '?' : 'Em gõ câu trả lời ở đây')}
            inputMode={numeric ? 'none' : 'text'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            readOnly={locked}
            aria-label="Câu trả lời của em"
            lang={item.prompt.lang === 'en-US' ? 'en' : 'vi'}
            maxLength={numeric ? MAX_LEN : 200}
            size={numeric ? 6 : undefined}
            onChange={(e) => onChange({ text: numeric ? cleanNumeric(e.target.value) : e.target.value })}
          />
          {p.unit ? <span className="ae-sa__unit">{p.unit}</span> : null}
          {ok !== undefined ? (
            <span className="ae-sa__mark" aria-hidden="true"><Icon name={ok ? 'check' : 'retry'} size={26} /></span>
          ) : null}
        </div>
        {ok === false && accepted ? (
          <p className="ae-sa__fix">
            Đáp án: <span className="ae-fix">{accepted}{p.unit ? ` ${p.unit}` : ''}</span>
          </p>
        ) : null}
      </div>
      {numeric && !locked ? <NumberPad onKey={press} mode={mode} /> : null}
    </div>
  );
}
