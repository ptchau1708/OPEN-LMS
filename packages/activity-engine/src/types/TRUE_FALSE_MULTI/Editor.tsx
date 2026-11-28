import type { Choice } from '@openedu/contracts';
import type { TypeEditorProps } from '../../shared/typeApi';
import { ChoiceRows, EdRoot, EdSection, EdWarn } from '../DRAG_DROP/edkit';

/** GV: soạn 2–6 nhận định, chọn Đúng hoặc Sai cho từng nhận định. */
export function Editor({ item, onChange }: TypeEditorProps<'TRUE_FALSE_MULTI'>) {
  const list = item.payload.statements ?? [];
  const truth = item.key?.truth ?? {};
  const update = (rows: Choice[], t: Record<string, boolean>) => {
    const ids = new Set(rows.map((r) => r.id));
    const clean: Record<string, boolean> = {};
    for (const k of Object.keys(t)) if (ids.has(k)) clean[k] = t[k];
    onChange({ ...item, payload: { ...item.payload, statements: rows }, key: { truth: clean } });
  };
  const missing = list.filter((s) => typeof truth[s.id] !== 'boolean').length;
  return (
    <EdRoot type="TRUE_FALSE_MULTI">
      <EdSection
        title="Các nhận định"
        hint="Mỗi nhận định học sinh chọn Đúng hoặc Sai. Câu có 4 nhận định được chấm lũy tiến: đúng 1 ý 20%, 2 ý 40%, 3 ý 65%, cả 4 ý 100%."
      >
        <ChoiceRows
          items={list}
          idPrefix="s"
          addLabel="Thêm nhận định"
          placeholder="Nhận định"
          withImage={false}
          numbered
          min={2}
          max={6}
          onChange={(rows) => update(rows, truth)}
          extra={(c) => (
            <select
              className="ae-ed-select"
              aria-label="Nhận định này"
              value={typeof truth[c.id] === 'boolean' ? (truth[c.id] ? 'd' : 's') : ''}
              onChange={(e) => {
                const next = { ...truth };
                if (e.target.value === 'd') next[c.id] = true;
                else if (e.target.value === 's') next[c.id] = false;
                else delete next[c.id];
                update(list, next);
              }}
            >
              <option value="">— chọn —</option>
              <option value="d">Đúng</option>
              <option value="s">Sai</option>
            </select>
          )}
        />
      </EdSection>
      {missing ? <EdWarn>Còn {missing} nhận định chưa chọn Đúng hoặc Sai.</EdWarn> : null}
    </EdRoot>
  );
}
