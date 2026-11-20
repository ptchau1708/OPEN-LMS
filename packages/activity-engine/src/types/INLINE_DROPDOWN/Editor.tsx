import type { Choice } from '@openedu/contracts';
import { ChoiceListEditor, EdSection, PassageField } from '../../shared/CommonFieldsEditor';
import { blankIds } from '../../shared/text';
import type { TypeEditorProps } from '../../shared/typeApi';

const fresh = (): Choice[] => [{ id: 'a', text: '' }, { id: 'b', text: '' }];

export function Editor({ item, onChange }: TypeEditorProps<'INLINE_DROPDOWN'>) {
  const p = item.payload;
  const dropdowns = p.dropdowns ?? {};
  const keyBlanks = item.key?.blanks ?? {};
  const ids = blankIds(p.passage ?? '');

  const setPassage = (passage: string) => {
    const nextIds = blankIds(passage);
    const dd: Record<string, Choice[]> = {};
    const kb: Record<string, string> = {};
    nextIds.forEach((id) => {
      dd[id] = dropdowns[id] ?? fresh();
      if (keyBlanks[id]) kb[id] = keyBlanks[id];
    });
    onChange({ ...item, payload: { ...p, passage, dropdowns: dd }, key: { blanks: kb } });
  };

  const setDropdown = (id: string, choices: Choice[], correct: string[]) => {
    const kb = { ...keyBlanks };
    if (correct[0]) kb[id] = correct[0];
    else delete kb[id];
    onChange({ ...item, payload: { ...p, dropdowns: { ...dropdowns, [id]: choices } }, key: { blanks: kb } });
  };

  /** Chép các lựa chọn của ô này sang mọi ô khác (giữ đáp án nếu id còn tồn tại). */
  const copyToAll = (from: string) => {
    const src = dropdowns[from] ?? [];
    const dd: Record<string, Choice[]> = { ...dropdowns };
    const kb: Record<string, string> = { ...keyBlanks };
    ids.forEach((id) => {
      if (id === from) return;
      dd[id] = src.map((c) => ({ ...c }));
      if (kb[id] && !src.some((c) => c.id === kb[id])) delete kb[id];
    });
    onChange({ ...item, payload: { ...p, dropdowns: dd }, key: { blanks: kb } });
  };

  return (
    <>
      <EdSection title="Đoạn văn">
        <PassageField
          value={p.passage ?? ''}
          onChange={setPassage}
          prefix="d"
          insertLabel="Chèn ô chọn"
          help={<>Gõ <code>{'{{d1}}'}</code>, <code>{'{{d2}}'}</code>… vào chỗ em cần chọn từ. Mỗi ô tự có danh sách lựa chọn bên dưới.</>}
        />
        {ids.length === 0 ? <p className="ae-ed-warn">Đoạn văn chưa có ô chọn nào.</p> : null}
      </EdSection>

      {ids.length ? (
        <EdSection title="Lựa chọn cho từng ô">
          <ul className="ae-ed-list">
            {ids.map((id, i) => {
              const choices = dropdowns[id] ?? [];
              const correct = keyBlanks[id] ? [keyBlanks[id]] : [];
              const correctText = choices.find((c) => c.id === keyBlanks[id])?.text;
              return (
                <li key={id} className="ae-ed-rowitem ae-ed-rowitem--block">
                  <div className="ae-ed-rowitem__head">
                    <span className="ae-ed-badge">{i + 1}</span>
                    <span className="ae-ed-code">{`{{${id}}}`}</span>
                    <span className="ae-ed-help ae-ed-rowitem__grow">
                      {correctText ? <>Đáp án: <b>{correctText}</b></> : <span className="ae-ed-warn">Chưa chọn đáp án đúng</span>}
                    </span>
                    {ids.length > 1 ? (
                      <button type="button" className="ae-ed-btn" onClick={() => copyToAll(id)} title="Dùng cùng danh sách cho mọi ô">
                        Chép sang các ô khác
                      </button>
                    ) : null}
                  </div>
                  <ChoiceListEditor
                    choices={choices}
                    correct={correct}
                    onChange={(c, k) => setDropdown(id, c, k)}
                    withImage={false}
                    min={2}
                    max={6}
                    addLabel="Thêm lựa chọn"
                    textPlaceholder="Từ để chọn"
                  />
                </li>
              );
            })}
          </ul>
        </EdSection>
      ) : null}
    </>
  );
}
