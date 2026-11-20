import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { HotspotRegion } from '@openedu/contracts';
import { EdField, EdSection, nextId } from '../../shared/CommonFieldsEditor';
import type { TypeEditorProps } from '../../shared/typeApi';
import { hitTest, pointFromEvent, regionCenter, viewHeight } from './geometry';
import { HOTSPOT_SAMPLE_IMAGE } from './sample';
import './style.css';

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function normRegion(r: HotspotRegion): HotspotRegion {
  const out: HotspotRegion = { ...r };
  if (out.shape === 'rect') {
    delete out.r;
    out.w = out.w ?? 16;
    out.h = out.h ?? 16;
  } else {
    delete out.w;
    delete out.h;
    out.r = out.r ?? 8;
  }
  if (!out.label) delete out.label;
  return out;
}

function NumIn({ label, value, onChange, max = 100 }: { label: string; value: number | undefined; onChange: (n: number) => void; max?: number }) {
  return (
    <label className="ae-ed-hs__num" title={label}>
      <span>{label}</span>
      <input
        className="ae-ed-input ae-ed-input--num"
        type="number"
        step={0.5}
        min={0}
        max={max}
        value={value ?? 0}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? clamp(n, 0, max) : 0);
        }}
      />
    </label>
  );
}

export function Editor({ item, onChange }: TypeEditorProps<'HOTSPOT'>) {
  const p = item.payload;
  const regions = p.regions ?? [];
  const correct = item.key?.correct ?? [];
  const aspect = p.aspect > 0 ? p.aspect : 4 / 3;
  const H = viewHeight(aspect);
  const [sel, setSel] = useState<string | null>(null);
  const [natural, setNatural] = useState<number | null>(null);
  const [imgError, setImgError] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const setPayload = (patch: Partial<typeof p>) => onChange({ ...item, payload: { ...p, ...patch } });
  const commit = (rs: HotspotRegion[], corr: string[] = correct) =>
    onChange({ ...item, payload: { ...p, regions: rs }, key: { correct: corr.filter((id) => rs.some((r) => r.id === id)) } });
  const upRegion = (i: number, patch: Partial<HotspotRegion>) => {
    const rs = regions.slice();
    rs[i] = normRegion({ ...rs[i], ...patch });
    commit(rs);
  };
  const toggleCorrect = (id: string) => commit(regions, correct.includes(id) ? correct.filter((x) => x !== id) : [...correct, id]);
  const remove = (id: string) => {
    commit(regions.filter((r) => r.id !== id));
    if (sel === id) setSel(null);
  };

  const onPreview = (e: MouseEvent<HTMLDivElement>) => {
    if (!boxRef.current) return;
    const pt = pointFromEvent(boxRef.current, e.clientX, e.clientY, H);
    const hit = hitTest(regions, pt.x, pt.y, H, 0);
    if (hit) { setSel(hit.id); return; }
    const id = nextId(regions.map((r) => r.id), 'r');
    const region: HotspotRegion = { id, shape: 'circle', x: r1(clamp(pt.x)), y: r1(clamp((pt.y * 100) / H)), r: 8, label: `Vùng ${regions.length + 1}` };
    commit([...regions, region]);
    setSel(id);
  };

  const aspectOff = natural !== null && Math.abs(natural - aspect) > 0.01;

  return (
    <>
      <EdSection title="Tranh">
        <div className="ae-ed-grid ae-ed-grid--2">
          <EdField label="URL ảnh" help="Ảnh PNG/JPG/SVG. Toạ độ vùng tính theo % nên ảnh to hay nhỏ đều đúng.">
            <input
              className="ae-ed-input"
              value={p.image ?? ''}
              placeholder="https://…/tranh.png"
              spellCheck={false}
              onChange={(e) => { setImgError(false); setNatural(null); setPayload({ image: e.target.value.trim() }); }}
            />
          </EdField>
          <div className="ae-ed-grid">
            <EdField label="Tỉ lệ rộng / cao">
              <input
                className="ae-ed-input"
                type="number"
                step={0.01}
                min={0.2}
                max={5}
                value={p.aspect || ''}
                onChange={(e) => { const n = parseFloat(e.target.value); setPayload({ aspect: Number.isFinite(n) && n > 0 ? n : 0 }); }}
              />
            </EdField>
            <div className="ae-ed-field">
              <span className="ae-ed-label">Cách chọn</span>
              <label className="ae-ed-check">
                <input type="checkbox" checked={!!p.multiple} onChange={(e) => setPayload({ multiple: e.target.checked || undefined })} />
                Cho chọn nhiều vùng
              </label>
            </div>
          </div>
        </div>
        <div className="ae-ed-chips">
          {aspectOff ? (
            <button type="button" className="ae-ed-btn ae-ed-btn--primary" onClick={() => setPayload({ aspect: r1(natural! * 100) / 100 })}>
              Dùng đúng tỉ lệ ảnh ({natural!.toFixed(2).replace('.', ',')})
            </button>
          ) : null}
          <button type="button" className="ae-ed-btn" onClick={() => setPayload({ image: HOTSPOT_SAMPLE_IMAGE, aspect: 1.6 })}>Dùng tranh mẫu</button>
        </div>
        {imgError ? <p className="ae-ed-warn">Không tải được ảnh. Kiểm tra lại đường dẫn.</p> : null}
      </EdSection>

      <EdSection title="Vùng chạm">
        <p className="ae-ed-help">
          Bấm lên tranh để thêm vùng tròn tại chỗ đó; bấm vào vùng có sẵn để chọn nó. Nên thêm cả vùng <b>chưa đúng</b> (vd các con vật khác)
          để học sinh không đoán được chỗ nào bấm được. {p.multiple ? 'Học sinh phải chạm đủ mọi vùng đúng.' : 'Chế độ chọn một: chạm vào bất kỳ vùng đúng nào cũng được tính đúng.'}
        </p>
        <div className="ae-ed-hs">
          <div className="ae-ed-hs__preview">
            {p.image ? (
              <div ref={boxRef} className="ae-ed-hs__box" style={{ paddingTop: `${100 / aspect}%` }} onClick={onPreview}>
                <img
                  className="ae-ed-hs__img"
                  src={p.image}
                  alt=""
                  draggable={false}
                  onLoad={(e) => {
                    const im = e.currentTarget;
                    if (im.naturalWidth && im.naturalHeight) {
                      const nat = im.naturalWidth / im.naturalHeight;
                      setNatural(nat);
                      if (!(p.aspect > 0)) setPayload({ aspect: r1(nat * 100) / 100 });
                    }
                  }}
                  onError={() => setImgError(true)}
                />
                <svg className="ae-ed-hs__svg" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
                  {regions.map((r, i) => {
                    const cls = `ae-ed-hs__region${correct.includes(r.id) ? ' is-correct' : ''}${sel === r.id ? ' is-sel' : ''}`;
                    const c = regionCenter(r, H);
                    return (
                      <g key={r.id}>
                        {r.shape === 'rect' ? (
                          <rect className={cls} x={r.x} y={(r.y * H) / 100} width={r.w ?? 0} height={((r.h ?? 0) * H) / 100} rx={1} vectorEffect="non-scaling-stroke" />
                        ) : (
                          <circle className={cls} cx={r.x} cy={(r.y * H) / 100} r={r.r ?? 5} vectorEffect="non-scaling-stroke" />
                        )}
                        <text className="ae-ed-hs__num-label" x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central">{i + 1}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : (
              <div className="ae-ed-hs__placeholder">Nhập URL ảnh hoặc bấm “Dùng tranh mẫu”.</div>
            )}
          </div>

          <ul className="ae-ed-list ae-ed-hs__list">
            {regions.length === 0 ? <li className="ae-ed-help">Chưa có vùng nào.</li> : null}
            {regions.map((r, i) => {
              const isC = correct.includes(r.id);
              return (
                <li
                  key={r.id}
                  className={`ae-ed-rowitem ae-ed-rowitem--block${isC ? ' is-correct' : ''}${sel === r.id ? ' is-active' : ''}`}
                  onFocus={() => setSel(r.id)}
                  onMouseEnter={() => setSel(r.id)}
                >
                  <div className="ae-ed-rowitem__head">
                    <span className="ae-ed-badge" title={`id: ${r.id}`}>{i + 1}</span>
                    <label className={`ae-ed-correct${isC ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={isC} onChange={() => toggleCorrect(r.id)} />
                      Đúng
                    </label>
                    <input
                      className="ae-ed-input ae-ed-rowitem__grow"
                      value={r.label ?? ''}
                      placeholder="Tên vùng (GV xem)"
                      onChange={(e) => upRegion(i, { label: e.target.value })}
                    />
                    <select className="ae-ed-select ae-ed-hs__shape" value={r.shape} onChange={(e) => upRegion(i, { shape: e.target.value as HotspotRegion['shape'] })}>
                      <option value="circle">Tròn</option>
                      <option value="rect">Chữ nhật</option>
                    </select>
                    <button type="button" className="ae-ed-icon ae-ed-icon--danger" aria-label="Xoá vùng" title="Xoá vùng" onClick={() => remove(r.id)}>✕</button>
                  </div>
                  <div className="ae-ed-hs__nums">
                    <NumIn label="x %" value={r.x} onChange={(n) => upRegion(i, { x: n })} />
                    <NumIn label="y %" value={r.y} onChange={(n) => upRegion(i, { y: n })} />
                    {r.shape === 'rect' ? (
                      <>
                        <NumIn label="rộng %" value={r.w} onChange={(n) => upRegion(i, { w: n })} />
                        <NumIn label="cao %" value={r.h} onChange={(n) => upRegion(i, { h: n })} />
                      </>
                    ) : (
                      <NumIn label="bán kính %" value={r.r} max={50} onChange={(n) => upRegion(i, { r: n })} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {regions.length > 0 && correct.length === 0 ? <p className="ae-ed-warn">Chưa đánh dấu vùng đúng.</p> : null}
      </EdSection>
    </>
  );
}
