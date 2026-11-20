import type { TypeEditorProps } from '../../shared/typeApi';
import { EdBtn, EdField, EdRoot, EdSection, EdWarn } from '../DRAG_DROP/edkit';

/** Tốc độ đọc tham khảo (tiếng/phút) theo lớp — CT GDPT 2018 môn Tiếng Việt. */
const SPEED: Record<number, number> = { 1: 50, 2: 65, 3: 75, 4: 85, 5: 95 };

export function suggestSeconds(text: string, grade: number): number {
  const syl = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const sec = (syl / (SPEED[grade] ?? 60)) * 60 * 1.6 + 5;
  return Math.min(120, Math.max(10, Math.ceil(sec / 5) * 5));
}

/** GV: soạn đoạn đọc và thời gian ghi âm tối đa. Không chấm điểm. */
export function Editor({ item, onChange }: TypeEditorProps<'RECORD_READ'>) {
  const p = item.payload;
  const syl = p.text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const sug = suggestSeconds(p.text, item.grade);
  const set = (patch: Partial<typeof p>) => onChange({ ...item, payload: { ...p, ...patch }, key: null });
  return (
    <EdRoot type="RECORD_READ">
      <EdSection title="Đoạn đọc" hint="Xuống dòng để ngắt câu cho dễ đọc. Học sinh thấy chữ rất to.">
        <textarea className="ae-ed-textarea" rows={6} value={p.text} onChange={(e) => set({ text: e.target.value })} placeholder="Nhà bà có cây bưởi…" />
        <div className="ae-ed-preview">{syl} tiếng · gợi ý cho lớp {item.grade}: khoảng {sug} giây</div>
      </EdSection>
      <EdSection title="Thời gian ghi âm tối đa">
        <div className="ae-ed-inline">
          <input type="range" min={10} max={120} step={5} value={p.maxSeconds} aria-label="Số giây tối đa" onChange={(e) => set({ maxSeconds: Number(e.target.value) })} />
          <EdField label="Giây">
            <input className="ae-ed-input" type="number" min={5} max={300} value={p.maxSeconds} onChange={(e) => set({ maxSeconds: Math.max(5, Math.min(300, Math.round(Number(e.target.value)) || 30)) })} />
          </EdField>
          <EdBtn onClick={() => set({ maxSeconds: sug })} disabled={p.maxSeconds === sug}>Dùng gợi ý ({sug} giây)</EdBtn>
        </div>
      </EdSection>
      {!p.text.trim() ? <EdWarn>Chưa có đoạn đọc.</EdWarn> : null}
      {p.maxSeconds < sug - 10 ? <EdWarn>Thời gian có thể quá ngắn để học sinh đọc hết đoạn.</EdWarn> : null}
    </EdRoot>
  );
}
