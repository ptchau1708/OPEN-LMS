import { useEffect, useState } from 'react';
import type { ItemOf } from '@openedu/contracts';
import type { TypeEditorProps } from '../../shared/typeApi';
import { seededShuffle } from '../../shared/shuffle';
import { EdBtn, EdField, EdRoot, EdSection, EdWarn } from '../DRAG_DROP/edkit';
import { sample, sampleClock, clockPromptText } from './sample';

type Item = ItemOf<'MATH_MANIPULATIVE'>;
type SticksPayload = Extract<Item['payload'], { kind: 'sticks' }>;

function compute(operands: number[], op: '+' | '-'): number {
  if (!operands.length) return 0;
  return op === '+' ? operands.reduce((s, n) => s + n, 0) : operands.slice(1).reduce((s, n) => s - n, operands[0]);
}

export function sticksPromptText(operands: number[], op: '+' | '-'): string {
  return `Em dùng que tính để tính: ${operands.join(` ${op} `)} = ?`;
}

/** Lựa chọn nhiễu hay gặp: ±1, ±10, đảo chữ số, quên nhớ. */
export function autoChoices(result: number, seed: string): number[] {
  const cands = [result - 10, result + 1, result - 1, result + 10, Number(String(result).split('').reverse().join('')), result + 2, result - 2];
  const out: number[] = [];
  for (const c of cands) if (Number.isFinite(c) && c >= 0 && c !== result && !out.includes(c)) out.push(c);
  return seededShuffle([result, ...out.slice(0, 3)], `${seed}:${result}`);
}

const isAuto = (t: string) => !t.trim() || t.startsWith('Em dùng que tính') || t.startsWith('Em hãy quay kim');

function NumIn({ value, onChange, label, min = 0, max = 999 }: { value: number; onChange: (n: number) => void; label: string; min?: number; max?: number }) {
  return (
    <EdField label={label}>
      <input
        className="ae-ed-input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0);
        }}
      />
    </EdField>
  );
}

function ChoicesInput({ choices, onChange }: { choices: number[]; onChange: (c: number[]) => void }) {
  const [txt, setTxt] = useState(choices.join(', '));
  useEffect(() => setTxt(choices.join(', ')), [choices.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className="ae-ed-input"
      style={{ flex: '1 1 200px' }}
      value={txt}
      placeholder="31, 33, 23, 32"
      aria-label="Các lựa chọn"
      onChange={(e) => {
        setTxt(e.target.value);
        const nums = e.target.value.split(/[,;\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
        onChange(nums.slice(0, 6));
      }}
    />
  );
}

/** GV: chọn đồ dùng (que tính / đồng hồ). Que tính: số hạng, phép tính, lựa chọn. Đồng hồ: giờ cần quay. */
export function Editor({ item, onChange }: TypeEditorProps<'MATH_MANIPULATIVE'>) {
  const p = item.payload;

  const switchKind = (kind: 'sticks' | 'clock') => {
    if (kind === p.kind) return;
    const s = kind === 'clock' ? sampleClock() : sample();
    onChange({
      ...item,
      payload: s.payload,
      key: s.key,
      prompt: isAuto(item.prompt.text) ? { ...item.prompt, text: s.prompt.text } : item.prompt,
    });
  };

  const setSticks = (next: SticksPayload, autoPrompt = false) => {
    const value = compute(next.operands, next.op);
    onChange({
      ...item,
      payload: next,
      key: { value },
      prompt: autoPrompt || isAuto(item.prompt.text) ? { ...item.prompt, text: sticksPromptText(next.operands, next.op) } : item.prompt,
    });
  };

  const kindSeg = (
    <span className="ae-ed-seg" role="radiogroup" aria-label="Loại đồ dùng">
      <EdBtn kind={p.kind === 'sticks' ? 'primary' : 'default'} onClick={() => switchKind('sticks')}>Que tính</EdBtn>
      <EdBtn kind={p.kind === 'clock' ? 'primary' : 'default'} onClick={() => switchKind('clock')}>Đồng hồ kim</EdBtn>
    </span>
  );

  if (p.kind === 'clock') {
    const v = (((item.key?.value ?? 0) % 720) + 720) % 720;
    const h = Math.floor(v / 60) || 12;
    const m = v % 60;
    const setTime = (hh: number, mm: number) => {
      const value = (hh % 12) * 60 + mm;
      onChange({ ...item, key: { value }, prompt: isAuto(item.prompt.text) ? { ...item.prompt, text: clockPromptText(value) } : item.prompt });
    };
    return (
      <EdRoot type="MATH_MANIPULATIVE">
        <EdSection title="Đồ dùng" actions={kindSeg} hint="Học sinh kéo kim giờ, kim phút (bước 5 phút) để đồng hồ chỉ đúng giờ.">
          <div className="ae-ed-inline">
            <EdField label="Giờ">
              <select className="ae-ed-select" value={h} onChange={(e) => setTime(Number(e.target.value), m)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} giờ</option>)}
              </select>
            </EdField>
            <EdField label="Phút">
              <select className="ae-ed-select" value={m - (m % 5)} onChange={(e) => setTime(h, Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i * 5).map((n) => <option key={n} value={n}>{n} phút</option>)}
              </select>
            </EdField>
            <label className="ae-ed-check">
              <input type="checkbox" checked={!!p.showDigital} onChange={(e) => onChange({ ...item, payload: { kind: 'clock', showDigital: e.target.checked } })} />
              Hiện đồng hồ số (gợi ý)
            </label>
            <EdBtn onClick={() => onChange({ ...item, prompt: { ...item.prompt, text: clockPromptText(v) } })}>Điền đề bài tự động</EdBtn>
          </div>
          <div className="ae-ed-preview">Đáp án: <strong>{clockPromptText(v).replace('Em hãy quay kim để đồng hồ chỉ ', '').replace('.', '')}</strong> (= {v} phút từ 0:00)</div>
        </EdSection>
      </EdRoot>
    );
  }

  const result = compute(p.operands, p.op);
  const choices = p.choices ?? [];
  const warn: string[] = [];
  if (p.op === '-' && result < 0) warn.push('Số bị trừ phải lớn hơn hoặc bằng số trừ.');
  if (p.operands.some((n) => n > 99)) warn.push('Số lớn hơn 99 sẽ có rất nhiều que — nên dùng số trong phạm vi 100.');
  if (choices.length && !choices.includes(result)) warn.push(`Các lựa chọn chưa có đáp án đúng (${result}).`);
  if (choices.length === 1) warn.push('Cần ít nhất 2 lựa chọn, hoặc bỏ trống để học sinh bấm số.');

  return (
    <EdRoot type="MATH_MANIPULATIVE">
      <EdSection title="Đồ dùng" actions={kindSeg} hint="Học sinh gộp 10 que thành 1 bó (phép cộng) hoặc tháo bó, bớt que (phép trừ), rồi chọn kết quả.">
        <div className="ae-ed-inline">
          <NumIn label="Số thứ nhất" value={p.operands[0] ?? 0} onChange={(n) => setSticks({ ...p, operands: [n, ...p.operands.slice(1)] })} />
          <EdField label="Phép tính">
            <select className="ae-ed-select" value={p.op} onChange={(e) => setSticks({ ...p, op: e.target.value as '+' | '-', operands: p.operands.slice(0, 2) })}>
              <option value="+">+ cộng</option>
              <option value="-">− trừ</option>
            </select>
          </EdField>
          {p.operands.slice(1).map((n, i) => (
            <span key={i} className="ae-ed-inline">
              <NumIn label={`Số thứ ${i + 2}`} value={n} onChange={(v) => setSticks({ ...p, operands: p.operands.map((x, j) => (j === i + 1 ? v : x)) })} />
              {p.op === '+' && p.operands.length > 2 ? (
                <EdBtn kind="danger" title="Bỏ số này" onClick={() => setSticks({ ...p, operands: p.operands.filter((_, j) => j !== i + 1) })}>✕</EdBtn>
              ) : null}
            </span>
          ))}
          {p.op === '+' && p.operands.length < 3 ? <EdBtn onClick={() => setSticks({ ...p, operands: [...p.operands, 1] })}>+ Thêm số hạng</EdBtn> : null}
        </div>
        <div className="ae-ed-preview">
          Kết quả (đáp án): <strong>{result}</strong>
          <EdBtn onClick={() => setSticks(p, true)}>Điền đề bài tự động</EdBtn>
        </div>
      </EdSection>
      <EdSection title="Lựa chọn trả lời" hint="Để trống: học sinh bấm số trên bàn phím số.">
        <div className="ae-ed-inline">
          <ChoicesInput choices={choices} onChange={(c) => setSticks({ ...p, choices: c.length ? c : undefined })} />
          <EdBtn kind="primary" onClick={() => setSticks({ ...p, choices: autoChoices(result, item.id) })}>Tự tạo 4 lựa chọn</EdBtn>
          <EdBtn onClick={() => setSticks({ ...p, choices: undefined })} disabled={!choices.length}>Dùng bàn phím số</EdBtn>
        </div>
      </EdSection>
      {warn.map((w) => <EdWarn key={w}>{w}</EdWarn>)}
    </EdRoot>
  );
}
