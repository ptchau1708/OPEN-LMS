import type { Choice } from '@openedu/contracts';
import { ChoiceListEditor, EdSection, ListInput, PassageField, nextId } from '../../shared/CommonFieldsEditor';
import { blankIds, normalizeText } from '../../shared/text';
import type { TypeEditorProps } from '../../shared/typeApi';

export function Editor({ item, onChange }: TypeEditorProps<'FILL_IN_PASSAGE'>) {
  const p = item.payload;
  const keyBlanks = item.key?.blanks ?? {};
  const ids = blankIds(p.passage ?? '');
  const useBank = Array.isArray(p.bank);
  const bank = p.bank ?? [];

  const setPassage = (passage: string) => {
    const blanks: Record<string, string[]> = {};
    blankIds(passage).forEach((id) => { blanks[id] = keyBlanks[id] ?? []; });
    onChange({ ...item, payload: { ...p, passage }, key: { blanks } });
  };
  const setAccepted = (id: string, list: string[]) => onChange({ ...item, key: { blanks: { ...keyBlanks, [id]: list } } });
  const setBank = (next: Choice[] | undefined) => {
    const payload = { ...p, bank: next };
    if (!next) delete payload.bank;
    onChange({ ...item, payload });
  };

  /** Kho từ = đáp án đầu tiên của mỗi chỗ trống + các từ thừa GV đã thêm. */
  const bankFromAnswers = (): Choice[] => {
    const out: Choice[] = [];
    const texts = new Set<string>();
    ids.forEach((id) => {
      const t = (keyBlanks[id] ?? [])[0]?.trim();
      if (t && !texts.has(normalizeText(t))) {
        texts.add(normalizeText(t));
        out.push({ id: nextId([...bank, ...out].map((c) => c.id), 'w'), text: t });
      }
    });
    bank.forEach((c) => {
      const t = normalizeText(c.text ?? '');
      if (t && !texts.has(t)) { texts.add(t); out.push(c); }
    });
    return out;
  };

  const bankTexts = new Set(bank.map((c) => normalizeText(c.text ?? '')));
  const missingInBank = useBank
    ? ids.filter((id) => {
        const acc = keyBlanks[id] ?? [];
        return acc.length > 0 && !acc.some((a) => bankTexts.has(normalizeText(a)) || bank.some((c) => c.id === a));
      })
    : [];

  return (
    <>
      <EdSection title="Đoạn văn và chỗ trống">
        <PassageField
          value={p.passage ?? ''}
          onChange={setPassage}
          prefix="b"
          insertLabel="Chèn chỗ trống"
          help={<>Gõ <code>{'{{b1}}'}</code>, <code>{'{{b2}}'}</code>… vào chỗ cần điền (hoặc bấm “Chèn chỗ trống”). Mỗi chỗ trống tự hiện bên dưới để nhập đáp án.</>}
        />
        {ids.length === 0 ? <p className="ae-ed-warn">Đoạn văn chưa có chỗ trống nào.</p> : null}
        <ul className="ae-ed-list">
          {ids.map((id, i) => {
            const acc = keyBlanks[id] ?? [];
            return (
              <li key={id} className={`ae-ed-rowitem${acc.length ? ' is-correct' : ''}`}>
                <span className="ae-ed-badge">{i + 1}</span>
                <span className="ae-ed-code">{`{{${id}}}`}</span>
                <span className="ae-ed-rowitem__grow">
                  <ListInput value={acc} onChange={(list) => setAccepted(id, list)} placeholder="Đáp án; cách viết khác…" ariaLabel={`Đáp án chỗ trống ${i + 1}`} />
                </span>
              </li>
            );
          })}
        </ul>
        {ids.length ? <p className="ae-ed-help">Nhiều đáp án đúng ngăn bằng dấu <code>;</code>. Máy bỏ qua chữ hoa/thường và khoảng trắng thừa.</p> : null}
      </EdSection>

      <EdSection
        title="Kho từ"
        actions={
          <label className="ae-ed-check">
            <input type="checkbox" checked={useBank} onChange={(e) => setBank(e.target.checked ? bankFromAnswers() : undefined)} />
            Dùng kho từ (em chạm để đặt từ)
          </label>
        }
      >
        {useBank ? (
          <>
            <p className="ae-ed-help">Em chạm vào một từ rồi chạm vào chỗ trống. Thêm 1–2 từ thừa để em phải suy nghĩ. Thứ tự từ được xáo cố định.</p>
            <ChoiceListEditor
              choices={bank}
              onChange={(c) => setBank(c)}
              withImage={false}
              letters={false}
              min={1}
              max={16}
              idPrefix="w"
              addLabel="Thêm từ"
              textPlaceholder="Từ trong kho"
            />
            <button type="button" className="ae-ed-btn" onClick={() => setBank(bankFromAnswers())}>Lấy từ các đáp án</button>
            {missingInBank.length ? (
              <p className="ae-ed-warn">Đáp án của chỗ trống {missingInBank.map((id) => ids.indexOf(id) + 1).join(', ')} chưa có trong kho từ.</p>
            ) : null}
          </>
        ) : (
          <p className="ae-ed-help">Không dùng kho từ: em tự gõ chữ vào từng chỗ trống.</p>
        )}
      </EdSection>
    </>
  );
}
