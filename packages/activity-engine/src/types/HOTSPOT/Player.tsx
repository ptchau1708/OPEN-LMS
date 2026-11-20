import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { HotspotRegion } from '@openedu/contracts';
import { sfx } from '@openedu/ui';
import { subjectColorVar } from '../../shared/PromptView';
import type { TypePlayerProps } from '../../shared/typeApi';
import { hitTest, pointFromEvent, regionCenter, viewHeight } from './geometry';
import { score } from './score';
import './style.css';

const RING = 5.5;

function Shape({ r, H, className }: { r: HotspotRegion; H: number; className: string }) {
  if (r.shape === 'rect') {
    return <rect className={className} x={r.x} y={(r.y * H) / 100} width={r.w ?? 0} height={((r.h ?? 0) * H) / 100} rx={1.6} vectorEffect="non-scaling-stroke" />;
  }
  return <circle className={className} cx={r.x} cy={(r.y * H) / 100} r={r.r ?? 5} vectorEffect="non-scaling-stroke" />;
}

export function Player({ item, value, onChange, disabled, reveal, result, mode }: TypePlayerProps<'HOTSPOT'>) {
  const { image, aspect: rawAspect, regions = [], multiple = false } = item.payload;
  const aspect = rawAspect > 0 ? rawAspect : 4 / 3;
  const H = viewHeight(aspect);
  const chosen = Array.isArray(value?.regions) ? value!.regions : [];
  const locked = disabled || reveal;
  const parts = reveal ? (result?.parts ?? (item.key ? score(item, value).parts : undefined)) : undefined;

  const boxRef = useRef<HTMLDivElement>(null);
  const [taps, setTaps] = useState<Record<string, { x: number; y: number }>>({});
  const [misses, setMisses] = useState<{ k: number; x: number; y: number }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const missKey = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  const onTap = (e: MouseEvent<HTMLDivElement>) => {
    if (locked || !boxRef.current) return;
    const pt = pointFromEvent(boxRef.current, e.clientX, e.clientY, H);
    const hit = hitTest(regions, pt.x, pt.y, H);
    if (!hit) {
      const k = ++missKey.current;
      setMisses((m) => [...m.slice(-3), { k, ...pt }]);
      timers.current.push(window.setTimeout(() => setMisses((m) => m.filter((x) => x.k !== k)), 650));
      return;
    }
    sfx.tap();
    if (chosen.includes(hit.id)) {
      onChange({ regions: chosen.filter((id) => id !== hit.id) });
      return;
    }
    setTaps((t) => ({ ...t, [hit.id]: pt }));
    onChange({ regions: multiple ? [...chosen, hit.id] : [hit.id] });
  };

  const byId = new Map(regions.map((r) => [r.id, r]));
  const outlined = parts ? regions.filter((r) => r.id in parts) : [];

  return (
    <div className={`ae-hs ae-hs--${mode}`} style={{ ['--ae-accent' as string]: subjectColorVar(item) }}>
      {!locked ? (
        <div className="ae-hs__bar">
          <span className="ae-tip">
            {multiple ? 'Chạm vào tất cả chỗ đúng trên tranh. Chạm lại để bỏ chọn.' : 'Chạm vào một chỗ đúng trên tranh.'}
          </span>
          {multiple && chosen.length ? <span key={chosen.length} className="ae-count">Đã chọn {chosen.length}</span> : null}
        </div>
      ) : null}
      <div className="ae-hs__frame" style={{ maxWidth: `calc(var(--ae-hs-maxh) * ${aspect})` }}>
        <div
          ref={boxRef}
          className={`ae-hs__box${locked ? ' is-locked' : ''}${loaded ? ' is-loaded' : ''}`}
          style={{ paddingTop: `${100 / aspect}%` }}
          onClick={onTap}
          role="application"
          aria-label={`Tranh. ${multiple ? 'Chạm vào các chỗ đúng.' : 'Chạm vào chỗ đúng.'} Đã chọn ${chosen.length}.`}
        >
          <img className="ae-hs__img" src={image} alt="" draggable={false} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
          <svg className="ae-hs__svg" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {outlined.map((r) => {
              const ok = parts![r.id];
              const on = chosen.includes(r.id);
              return (
                <Shape
                  key={`o-${r.id}`}
                  r={r}
                  H={H}
                  className={`ae-hs__region ${ok ? (on ? 'is-ok' : 'is-missed') : 'is-try'}`}
                />
              );
            })}
            {chosen.map((id) => {
              const r = byId.get(id);
              if (!r) return null;
              const p = taps[id] ?? regionCenter(r, H);
              const st = parts ? (parts[id] ? ' is-ok' : ' is-try') : '';
              return (
                <g key={`p-${id}`} className={`ae-hs__pick${st}`} transform={`translate(${p.x} ${p.y})`}>
                  {!parts ? <circle className="ae-hs__pulse" r={RING} vectorEffect="non-scaling-stroke" /> : null}
                  <circle className="ae-hs__halo" r={RING} vectorEffect="non-scaling-stroke" />
                  <circle className="ae-hs__ring" r={RING} vectorEffect="non-scaling-stroke" />
                  <circle className="ae-hs__dot" r={RING * 0.3} />
                </g>
              );
            })}
            {misses.map((m) => (
              <g key={`m-${m.k}`} transform={`translate(${m.x} ${m.y})`}>
                <circle className="ae-hs__miss" r={RING * 0.8} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
