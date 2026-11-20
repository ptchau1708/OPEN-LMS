import { useState } from 'react';
import type { TypeEditorProps } from '../../shared/typeApi';
import { EdBtn, EdRoot, EdSection, ImageInput } from '../DRAG_DROP/edkit';
import { COLOR_NAMES, DRAW_COLORS } from './palette';

/** GV: chọn màu bút (mặc định 8 màu) và hình nền để tô (tuỳ chọn). Không chấm điểm. */
export function Editor({ item, onChange }: TypeEditorProps<'DRAW'>) {
  const p = item.payload;
  const colors = p.colors && p.colors.length ? p.colors : DRAW_COLORS;
  const custom = !!(p.colors && p.colors.length);
  const [pick, setPick] = useState('#ff5d8f');
  const setColors = (list: string[]) => {
    const same = list.length === DRAW_COLORS.length && list.every((c, i) => c.toLowerCase() === DRAW_COLORS[i]);
    const next = { ...p };
    if (!list.length || same) delete next.colors;
    else next.colors = list;
    onChange({ ...item, payload: next, key: null });
  };
  const toggle = (c: string) => setColors(colors.includes(c) ? colors.filter((x) => x !== c) : [...colors, c]);
  const setBg = (bg: string | undefined) => {
    const next = { ...p };
    if (bg) next.background = bg;
    else delete next.background;
    onChange({ ...item, payload: next, key: null });
  };
  return (
    <EdRoot type="DRAW">
      <EdSection title="Màu bút" hint={custom ? 'Bảng màu riêng cho bài này.' : 'Đang dùng 8 màu mặc định.'} actions={custom ? <EdBtn onClick={() => setColors([])}>Về mặc định</EdBtn> : undefined}>
        <div className="ae-ed-inline">
          {[...DRAW_COLORS, ...colors.filter((c) => !DRAW_COLORS.includes(c.toLowerCase()))].map((c) => (
            <button
              key={c}
              type="button"
              role="checkbox"
              aria-checked={colors.includes(c)}
              aria-label={COLOR_NAMES[c.toLowerCase()] ?? c}
              title={COLOR_NAMES[c.toLowerCase()] ?? c}
              className={`ae-ed-swatch${colors.includes(c) ? ' is-on' : ''}`}
              style={{ background: c, width: 30, height: 30, opacity: colors.includes(c) ? 1 : 0.3 }}
              onClick={() => toggle(c)}
            />
          ))}
          <input type="color" value={pick} aria-label="Chọn màu thêm" onChange={(e) => setPick(e.target.value)} />
          <EdBtn onClick={() => !colors.includes(pick) && setColors([...colors, pick])} disabled={colors.length >= 12}>+ Thêm màu</EdBtn>
        </div>
      </EdSection>
      <EdSection title="Hình nền (tuỳ chọn)" hint="Tranh để tô màu: URL ảnh hoặc emoji (vd emoji:🍎). Ảnh ở máy chủ khác cần bật CORS thì mới gửi kèm trong bài vẽ.">
        <div className="ae-ed-inline">
          <ImageInput value={p.background} onChange={setBg} placeholder="https://…/tranh-to-mau.png" />
          <EdBtn onClick={() => setBg(undefined)} disabled={!p.background}>Bỏ nền</EdBtn>
        </div>
      </EdSection>
    </EdRoot>
  );
}
