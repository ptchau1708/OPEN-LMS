import type { Choice } from '@openedu/contracts';
import type { TypeEditorProps } from '../../shared/typeApi';
import { ChoiceRows, EdBtn, EdRoot, EdSection, EdWarn, newId } from '../DRAG_DROP/edkit';

const labelOf = (c: Choice, i: number) => c.text || c.image?.replace(/^emoji:/, '') || `Thẻ ${i + 1}`;

/** GV: soạn hai cột thẻ và chọn thẻ phải đúng cho mỗi thẻ trái. Thẻ phải không được nối = thẻ nhiễu. */
export function Editor({ item, onChange }: TypeEditorProps<'MATCHING'>) {
  const { left, right } = item.payload;
  const pairs = item.key?.pairs ?? {};
  const update = (l: Choice[], r: Choice[], p: Record<string, string>) => {
    const lids = new Set(l.map((c) => c.id));
    const rids = new Set(r.map((c) => c.id));
    const clean: Record<string, string> = {};
    for (const k of Object.keys(p)) if (lids.has(k) && rids.has(p[k])) clean[k] = p[k];
    onChange({ ...item, payload: { ...item.payload, left: l, right: r }, key: { pairs: clean } });
  };
  const addPair = () => {
    const a = { id: newId('l'), text: '' };
    const b = { id: newId('r'), text: '' };
    update([...left, a], [...right, b], { ...pairs, [a.id]: b.id });
  };

  const missing = left.filter((c) => !pairs[c.id]);
  const used = Object.values(pairs);
  const dup = used.filter((r, i) => used.indexOf(r) !== i);
  const empty = [...left, ...right].filter((c) => !c.text && !c.image);

  return (
    <EdRoot type="MATCHING">
      <EdSection
        title="Cột trái"
        hint="Mỗi thẻ trái chọn một thẻ phải đúng. Thẻ phải sẽ được xáo trộn khi học sinh làm."
        actions={<EdBtn kind="primary" onClick={addPair}>+ Thêm cặp</EdBtn>}
      >
        <ChoiceRows
          items={left}
          idPrefix="l"
          addLabel="Thêm thẻ trái"
          placeholder="Thẻ trái"
          withSpeak
          min={2}
          onChange={(l) => update(l, right, pairs)}
          extra={(c) => (
            <>
              <span className="ae-ed-fld__lbl">nối với</span>
              <select
                className="ae-ed-select"
                value={pairs[c.id] ?? ''}
                onChange={(e) => {
                  const next = { ...pairs };
                  if (e.target.value) next[c.id] = e.target.value;
                  else delete next[c.id];
                  update(left, right, next);
                }}
              >
                <option value="">— chọn thẻ phải —</option>
                {right.map((r, i) => (
                  <option key={r.id} value={r.id}>{labelOf(r, i)}</option>
                ))}
              </select>
            </>
          )}
        />
      </EdSection>
      <EdSection title="Cột phải" hint="Có thể thêm thẻ nhiễu (không nối với thẻ nào).">
        <ChoiceRows items={right} idPrefix="r" addLabel="Thêm thẻ phải" placeholder="Thẻ phải" withSpeak min={2} onChange={(r) => update(left, r, pairs)} />
      </EdSection>
      {missing.length ? <EdWarn>Còn {missing.length} thẻ trái chưa chọn thẻ phải đúng.</EdWarn> : null}
      {dup.length ? <EdWarn>Có thẻ phải được chọn cho nhiều thẻ trái — mỗi thẻ phải chỉ nối một lần.</EdWarn> : null}
      {right.length < left.length ? <EdWarn>Cột phải cần ít nhất {left.length} thẻ.</EdWarn> : null}
      {empty.length ? <EdWarn>Có {empty.length} thẻ chưa có chữ hoặc hình.</EdWarn> : null}
    </EdRoot>
  );
}
