import type { Choice } from '@openedu/contracts';
import type { TypeEditorProps } from '../../shared/typeApi';
import { ChoiceRows, EdRoot, EdSection, EdWarn } from './edkit';

type Zone = { id: string; label: string; image?: string };

/** GV: soạn các ô (nhãn + hình) và các thẻ; chọn ô đúng cho từng thẻ. */
export function Editor({ item, onChange }: TypeEditorProps<'DRAG_DROP'>) {
  const { tokens, zones } = item.payload;
  const placement = item.key?.placement ?? {};
  const update = (t: Choice[], z: Zone[], p: Record<string, string>) => {
    const tids = new Set(t.map((x) => x.id));
    const zids = new Set(z.map((x) => x.id));
    const clean: Record<string, string> = {};
    for (const k of Object.keys(p)) if (tids.has(k) && zids.has(p[k])) clean[k] = p[k];
    onChange({ ...item, payload: { ...item.payload, tokens: t, zones: z }, key: { placement: clean } });
  };
  const zoneRows: Choice[] = zones.map((z) => ({ id: z.id, text: z.label, image: z.image }));
  const fromRows = (rows: Choice[]): Zone[] => rows.map((r) => (r.image ? { id: r.id, label: r.text ?? '', image: r.image } : { id: r.id, label: r.text ?? '' }));
  const missing = tokens.filter((t) => !placement[t.id]);

  return (
    <EdRoot type="DRAG_DROP">
      <EdSection title="Các ô" hint="Nhãn ô hiện to trên đầu ô; có thể thêm hình emoji (vd emoji:🌊).">
        <ChoiceRows items={zoneRows} idPrefix="z" addLabel="Thêm ô" placeholder="Tên ô" min={2} max={6} onChange={(rows) => update(tokens, fromRows(rows), placement)} />
      </EdSection>
      <EdSection title="Các thẻ" hint="Mỗi thẻ chọn một ô đúng. Thẻ được xáo trộn khi học sinh làm.">
        <ChoiceRows
          items={tokens}
          idPrefix="t"
          addLabel="Thêm thẻ"
          placeholder="Tên thẻ"
          withSpeak
          min={1}
          max={24}
          onChange={(t) => update(t, zones, placement)}
          extra={(c) => (
            <>
              <span className="ae-ed-fld__lbl">vào ô</span>
              <select
                className="ae-ed-select"
                value={placement[c.id] ?? ''}
                onChange={(e) => {
                  const next = { ...placement };
                  if (e.target.value) next[c.id] = e.target.value;
                  else delete next[c.id];
                  update(tokens, zones, next);
                }}
              >
                <option value="">— chọn ô —</option>
                {zones.map((z, i) => <option key={z.id} value={z.id}>{z.label || `Ô ${i + 1}`}</option>)}
              </select>
            </>
          )}
        />
      </EdSection>
      {missing.length ? <EdWarn>Còn {missing.length} thẻ chưa chọn ô đúng.</EdWarn> : null}
      {zones.some((z) => !z.label.trim()) ? <EdWarn>Có ô chưa đặt tên.</EdWarn> : null}
      {zones.length < 2 ? <EdWarn>Cần ít nhất 2 ô.</EdWarn> : null}
    </EdRoot>
  );
}
