import type { Choice } from '@openedu/contracts';
import type { TypeEditorProps } from '../../shared/typeApi';
import { ChoiceRows, ColorPick, COLOR_OPTIONS, EdRoot, EdSection, EdWarn, QuickAdd, newId } from '../DRAG_DROP/edkit';

type Group = { id: string; label: string; color?: string };

/** GV: soạn các nhóm (nhãn + màu) và các từ; chọn nhóm đúng cho từng từ. Có ô nhập nhanh theo nhóm. */
export function Editor({ item, onChange }: TypeEditorProps<'WORD_CLASSIFY'>) {
  const { words, groups } = item.payload;
  const placement = item.key?.placement ?? {};
  const update = (w: Choice[], g: Group[], p: Record<string, string>) => {
    const wids = new Set(w.map((x) => x.id));
    const gids = new Set(g.map((x) => x.id));
    const clean: Record<string, string> = {};
    for (const k of Object.keys(p)) if (wids.has(k) && gids.has(p[k])) clean[k] = p[k];
    onChange({ ...item, payload: { ...item.payload, words: w, groups: g }, key: { placement: clean } });
  };
  const colorById = new Map(groups.map((g) => [g.id, g.color]));
  const groupRows: Choice[] = groups.map((g) => ({ id: g.id, text: g.label }));
  const fromRows = (rows: Choice[]): Group[] =>
    rows.map((r, i) => ({ id: r.id, label: r.text ?? '', color: colorById.get(r.id) ?? COLOR_OPTIONS[i % COLOR_OPTIONS.length].value }));
  const setColor = (id: string, color: string) => update(words, groups.map((g) => (g.id === id ? { ...g, color } : g)), placement);
  const missing = words.filter((w) => !placement[w.id]);

  return (
    <EdRoot type="WORD_CLASSIFY">
      <EdSection title="Các nhóm" hint="Nhãn nhóm hiện trên đầu ô, nền theo màu đã chọn.">
        <ChoiceRows
          items={groupRows}
          idPrefix="g"
          addLabel="Thêm nhóm"
          placeholder="Tên nhóm"
          withImage={false}
          min={2}
          max={6}
          onChange={(rows) => update(words, fromRows(rows), placement)}
          extra={(c) => <ColorPick value={colorById.get(c.id)} onChange={(v) => setColor(c.id, v)} />}
        />
      </EdSection>
      <EdSection title="Thêm nhanh từ theo nhóm" hint="Gõ các từ cách nhau bởi dấu phẩy rồi bấm Thêm.">
        {groups.map((g) => (
          <QuickAdd
            key={g.id}
            label={`Nhóm "${g.label || '…'}"`}
            placeholder="cây bàng, cái thang, cá vàng"
            sep=","
            onAdd={(t) => {
              const add = t.map((x) => ({ id: newId('w'), text: x }));
              const next = { ...placement };
              add.forEach((a) => (next[a.id] = g.id));
              update([...words, ...add], groups, next);
            }}
          />
        ))}
      </EdSection>
      <EdSection title="Các từ" hint="Từ được xáo trộn khi học sinh làm.">
        <ChoiceRows
          items={words}
          idPrefix="w"
          addLabel="Thêm từ"
          placeholder="Từ"
          withImage={false}
          withSpeak
          min={1}
          max={30}
          onChange={(w) => update(w, groups, placement)}
          extra={(c) => (
            <select
              className="ae-ed-select"
              aria-label="Nhóm đúng"
              value={placement[c.id] ?? ''}
              onChange={(e) => {
                const next = { ...placement };
                if (e.target.value) next[c.id] = e.target.value;
                else delete next[c.id];
                update(words, groups, next);
              }}
            >
              <option value="">— chọn nhóm —</option>
              {groups.map((g, i) => <option key={g.id} value={g.id}>{g.label || `Nhóm ${i + 1}`}</option>)}
            </select>
          )}
        />
      </EdSection>
      {missing.length ? <EdWarn>Còn {missing.length} từ chưa chọn nhóm.</EdWarn> : null}
      {groups.some((g) => !g.label.trim()) ? <EdWarn>Có nhóm chưa đặt tên.</EdWarn> : null}
    </EdRoot>
  );
}
