import { useEffect, useRef, useState } from 'react';
import { Button, sfx, unlockAudio } from '@openedu/ui';
import { prefersReducedMotion } from '../../shared/drag';
import { NumberAnswer } from './NumberAnswer';

interface Group {
  bundles: number;
  loose: number;
}

type Busy = { kind: 'bundle'; take: number[] } | { kind: 'unbundle' } | null;
type Fresh = { kind: 'bundle'; group: number } | { kind: 'loose'; count: number } | null;

export interface SticksProps {
  operands: number[];
  op: '+' | '-';
  choices?: number[];
  value: number | undefined;
  onChange: (v: number) => void;
  locked: boolean;
  reveal: boolean;
  correct?: number;
}

function initGroups(operands: number[], op: '+' | '-'): Group[] {
  const ops = op === '-' ? operands.slice(0, 1) : operands;
  return ops.map((o) => {
    const n = Math.max(0, Math.floor(o));
    return { bundles: Math.floor(n / 10), loose: n % 10 };
  });
}

const range = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);

function Bundle({ cls = '', onClick, label }: { cls?: string; onClick?: () => void; label?: string }) {
  const inner = (
    <>
      {range(10).map((i) => <span key={i} className="ae-mm-stick ae-mm-stick--tight" />)}
      <span className="ae-mm-band" />
    </>
  );
  if (onClick) {
    return <button type="button" className={`ae-mm-bundle ${cls}`} onClick={onClick} aria-label={label}>{inner}</button>;
  }
  return <span className={`ae-mm-bundle ${cls}`} aria-hidden="true">{inner}</span>;
}

/** Que tính: bó 1 chục buộc dây đỏ + que rời. Gộp 10 que thành bó (phép cộng), tháo bó / bớt que (phép trừ). */
export function Sticks({ operands, op, choices, value, onChange, locked, reveal, correct }: SticksProps) {
  const sig = `${operands.join(',')}${op}`;
  const [groups, setGroups] = useState<Group[]>(() => initGroups(operands, op));
  const [removed, setRemoved] = useState(0);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [fresh, setFresh] = useState<Fresh>(null);
  const [hint, setHint] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGroups(initGroups(operands, op));
    setRemoved(0);
    setTouched(false);
    setBusy(null);
    setFresh(null);
    setHint('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const wait = (ms: number, fn: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, prefersReducedMotion(rootRef.current) ? 0 : ms);
  };

  const totalB = groups.reduce((s, g) => s + g.bundles, 0);
  const totalL = groups.reduce((s, g) => s + g.loose, 0);
  const sub = op === '-' ? Math.max(0, Math.floor(operands[1] ?? 0)) : 0;
  const remain = sub - removed;
  const can = !locked && !busy;

  const doBundle = () => {
    if (!can || totalL < 10) return;
    unlockAudio();
    let need = 10;
    const take = groups.map((g) => {
      const t = Math.min(g.loose, need);
      need -= t;
      return t;
    });
    setTouched(true);
    setHint('');
    setBusy({ kind: 'bundle', take });
    sfx.tap();
    wait(480, () => {
      setGroups((gs) => {
        const next = gs.map((g, i) => ({ bundles: g.bundles, loose: g.loose - take[i] }));
        next[0].bundles += 1;
        return next;
      });
      setFresh({ kind: 'bundle', group: 0 });
      setBusy(null);
      sfx.drop();
    });
  };

  const doUnbundle = () => {
    if (!can || groups[0].bundles < 1) return;
    unlockAudio();
    setTouched(true);
    setHint('');
    setBusy({ kind: 'unbundle' });
    sfx.tap();
    wait(340, () => {
      setGroups((gs) => [{ bundles: gs[0].bundles - 1, loose: gs[0].loose + 10 }, ...gs.slice(1)]);
      setFresh({ kind: 'loose', count: 10 });
      setBusy(null);
      sfx.drop();
    });
  };

  const removeOne = () => {
    if (!can || remain <= 0) return;
    if (groups[0].loose < 1) {
      setHint('Hết que rời rồi. Em tháo 1 bó ra nhé!');
      sfx.tryAgain();
      return;
    }
    setTouched(true);
    setHint('');
    setFresh(null);
    setGroups((gs) => [{ bundles: gs[0].bundles, loose: gs[0].loose - 1 }, ...gs.slice(1)]);
    setRemoved((r) => r + 1);
    sfx.tap();
  };

  const removeBundle = () => {
    if (!can || remain < 10 || groups[0].bundles < 1) return;
    setTouched(true);
    setHint('');
    setFresh(null);
    setGroups((gs) => [{ bundles: gs[0].bundles - 1, loose: gs[0].loose }, ...gs.slice(1)]);
    setRemoved((r) => r + 10);
    sfx.drop();
  };

  const reset = () => {
    if (locked) return;
    window.clearTimeout(timer.current);
    setGroups(initGroups(operands, op));
    setRemoved(0);
    setTouched(false);
    setBusy(null);
    setFresh(null);
    setHint('');
    sfx.tap();
  };

  const has = typeof value === 'number' && Number.isFinite(value);
  const ansState = reveal && correct !== undefined && has ? (value === correct ? 'ok' : 'try') : '';

  let caption = `${totalB} chục ${totalL} que`;
  if (op === '-') caption = `Còn ${totalB} chục ${totalL} que`;
  let tip = hint;
  if (!tip && !locked) {
    if (op === '+' && totalL >= 10) tip = 'Có đủ 10 que rời rồi — gộp thành 1 bó nhé!';
    else if (op === '-' && remain > 0 && groups[0].loose < Math.min(remain, 10) && groups[0].bundles > 0 && remain < 10) tip = 'Que rời không đủ để bớt. Tháo 1 bó ra nhé!';
  }

  return (
    <div className={`ae-mm-sticks${touched ? ' is-merged' : ''}`} ref={rootRef}>
      <div className="ae-mm-eq" aria-label={`${operands.join(` ${op} `)} bằng ${has ? value : 'mấy'}`}>
        {operands.map((o, i) => (
          <span key={i} className="ae-mm-eq__part">
            {i > 0 ? <span className="ae-mm-eq__op">{op === '-' ? '−' : '+'}</span> : null}
            <span className="ae-mm-eq__n">{o}</span>
          </span>
        ))}
        <span className="ae-mm-eq__op">=</span>
        <span className={`ae-mm-eq__ans${has ? ' is-set' : ''}${ansState ? ` is-${ansState}` : ''}`}>{has ? value : '?'}</span>
      </div>

      <div className="ae-mm-board">
        {groups.map((g, gi) => (
          <div key={gi} className="ae-mm-group-wrap">
            {gi > 0 ? <span className="ae-mm-plus" aria-hidden="true">+</span> : null}
            <div className="ae-mm-group">
              {!touched ? <div className="ae-mm-group__num">{op === '-' ? operands[0] : operands[gi]} que</div> : null}
              <div className="ae-mm-group__sticks">
                {g.bundles > 0 ? (
                  <div className="ae-mm-bundles">
                    {range(g.bundles).map((b) => {
                      const isLast = b === g.bundles - 1;
                      const cls = [
                        busy?.kind === 'unbundle' && gi === 0 && isLast ? 'is-burst' : '',
                        fresh?.kind === 'bundle' && fresh.group === gi && isLast ? 'is-fresh' : '',
                      ].join(' ');
                      const clickable = op === '-' && gi === 0 && can;
                      return (
                        <Bundle
                          key={b}
                          cls={cls}
                          onClick={clickable ? () => (remain >= 10 ? removeBundle() : doUnbundle()) : undefined}
                          label={remain >= 10 ? 'Bớt 1 bó' : 'Tháo bó này'}
                        />
                      );
                    })}
                  </div>
                ) : null}
                {g.loose > 0 ? (
                  <div className={`ae-mm-loose${g.loose > 10 ? ' is-rows' : ''}`} onClick={op === '-' && gi === 0 ? removeOne : undefined}>
                    {range(g.loose).map((i) => {
                      const gathering = busy?.kind === 'bundle' && i < busy.take[gi];
                      const isFresh = fresh?.kind === 'loose' && gi === 0 && i >= g.loose - fresh.count;
                      return (
                        <span
                          key={i}
                          className={`ae-mm-stick${gathering ? ' is-gather' : ''}${isFresh ? ' is-fresh' : ''}`}
                          style={{ ['--i' as string]: String(i), ['--j' as string]: String(isFresh ? i - (g.loose - 10) : 0) }}
                        />
                      );
                    })}
                  </div>
                ) : null}
                {g.bundles === 0 && g.loose === 0 ? <span className="ae-mm-none">0 que</span> : null}
              </div>
            </div>
          </div>
        ))}
        {op === '-' ? (
          <div className="ae-mm-group ae-mm-group--removed" aria-label={`Đã bớt ${removed} que`}>
            <div className="ae-mm-group__num">Bớt đi {sub} que</div>
            <div className="ae-mm-group__sticks">
              {range(Math.floor(removed / 10)).map((b) => <Bundle key={`rb${b}`} cls="is-gone" />)}
              {removed % 10 > 0 ? (
                <div className="ae-mm-loose">{range(removed % 10).map((i) => <span key={i} className="ae-mm-stick is-gone" />)}</div>
              ) : null}
              <span className="ae-mm-count">{removed}/{sub}</span>
            </div>
          </div>
        ) : null}
      </div>

      <p className="ae-mm-caption" aria-live="polite">
        <strong>{caption}</strong>
        {tip ? <span className="ae-mm-tip">{tip}</span> : null}
      </p>

      {!locked ? (
        <div className="ae-mm-tools">
          {op === '+' ? (
            <Button variant="subject" color="var(--k-viet)" size="lg" disabled={!can || totalL < 10} onClick={doBundle}>Gộp 10 que</Button>
          ) : (
            <>
              <Button variant="subject" color="var(--k-viet)" size="lg" disabled={!can || groups[0].bundles < 1} onClick={doUnbundle}>Tháo bó</Button>
              <Button variant="secondary" size="lg" disabled={!can || remain <= 0} onClick={removeOne}>Bớt 1 que</Button>
              {remain >= 10 && groups[0].bundles > 0 ? <Button variant="secondary" size="lg" disabled={!can} onClick={removeBundle}>Bớt 1 bó</Button> : null}
            </>
          )}
          <Button variant="ghost" size="lg" onClick={reset} disabled={!touched}>↺ Xếp lại</Button>
        </div>
      ) : null}

      <NumberAnswer value={value} onChange={onChange} choices={choices} locked={locked} correct={correct} reveal={reveal} />
    </div>
  );
}
