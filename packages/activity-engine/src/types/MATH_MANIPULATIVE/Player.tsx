import type { TypePlayerProps } from '../../shared/typeApi';
import { Sticks } from './Sticks';
import { Clock } from './Clock';
import './style.css';

/** Đồ dùng toán: que tính (sticks) hoặc đồng hồ kim (clock). */
export function Player({ item, value, onChange, disabled, reveal, mode }: TypePlayerProps<'MATH_MANIPULATIVE'>) {
  const p = item.payload;
  const locked = disabled || reveal;
  const correct = reveal ? item.key?.value : undefined;
  const v = value?.value;
  const set = (n: number) => onChange({ value: n });
  return (
    <div className={`ae-mm ae-mm--${p.kind} ae-mm--${mode}`}>
      {p.kind === 'sticks' ? (
        <Sticks operands={p.operands} op={p.op} choices={p.choices} value={v} onChange={set} locked={locked} reveal={reveal} correct={correct} />
      ) : (
        <Clock value={v} onChange={set} locked={locked} showDigital={!!p.showDigital} reveal={reveal} correct={correct} />
      )}
    </div>
  );
}
