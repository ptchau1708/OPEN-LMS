import { EdField, EdSection, Seg } from '../../shared/CommonFieldsEditor';
import { parseNumberCandidates } from '../../shared/text';
import type { TypeEditorProps } from '../../shared/typeApi';

function splitAccepted(s: string): string[] {
  return s.split(/[;\n|]/).map((x) => x.trim()).filter(Boolean);
}

export function Editor({ item, onChange }: TypeEditorProps<'SHORT_ANSWER'>) {
  const p = item.payload;
  const key = item.key ?? { accepted: [] };
  const accepted = key.accepted ?? [];
  const numeric = p.inputMode === 'numeric';
  const setPayload = (patch: Partial<typeof p>) => {
    const next = { ...p, ...patch };
    (Object.keys(next) as (keyof typeof next)[]).forEach((k) => { if (next[k] === undefined || next[k] === '') delete next[k]; });
    onChange({ ...item, payload: next });
  };
  const setKey = (patch: Partial<typeof key>) => onChange({ ...item, key: { ...key, ...patch } });
  const badNumber = numeric && accepted.some((a) => a.trim() !== '' && parseNumberCandidates(a).length === 0);

  return (
    <EdSection title="Đáp án điền ngắn">
      <div className="ae-ed-grid">
        <div className="ae-ed-field">
          <span className="ae-ed-label">Kiểu trả lời</span>
          <Seg<'text' | 'numeric'>
            label="Kiểu trả lời"
            value={numeric ? 'numeric' : 'text'}
            onChange={(v) => setPayload({ inputMode: v })}
            options={[{ value: 'numeric', label: 'Số (bàn phím số)' }, { value: 'text', label: 'Chữ' }]}
          />
        </div>
        <EdField label="Đơn vị (tuỳ chọn)" help="Hiện sau ô trả lời, vd cm, kg, quả.">
          <input className="ae-ed-input" value={p.unit ?? ''} placeholder="cm" onChange={(e) => setPayload({ unit: e.target.value })} />
        </EdField>
        <EdField label="Chữ gợi ý trong ô (tuỳ chọn)">
          <input className="ae-ed-input" value={p.placeholder ?? ''} placeholder={numeric ? '?' : 'Em gõ câu trả lời ở đây'} onChange={(e) => setPayload({ placeholder: e.target.value })} />
        </EdField>
      </div>
      <EdField
        label="Các đáp án được chấp nhận"
        span
        help={
          <>
            Mỗi dòng (hoặc ngăn bằng dấu <code>;</code>) là một đáp án. Máy bỏ qua khoảng trắng thừa, chữ hoa/thường,
            kiểu bỏ dấu “hòa/hoà”; số so theo giá trị nên <code>2,5</code> = <code>2.5</code>. Em gõ kèm đơn vị vẫn được tính.
          </>
        }
      >
        <textarea
          className="ae-ed-textarea"
          rows={3}
          value={accepted.join('\n')}
          placeholder={numeric ? '52' : 'con mèo\nmèo'}
          onChange={(e) => setKey({ accepted: e.target.value.split('\n').map((x) => x.trimStart()) })}
          onBlur={(e) => setKey({ accepted: splitAccepted(e.target.value) })}
        />
      </EdField>
      {!numeric ? (
        <label className="ae-ed-check">
          <input type="checkbox" checked={!!key.caseSensitive} onChange={(e) => setKey({ caseSensitive: e.target.checked || undefined })} />
          Phân biệt chữ hoa / chữ thường
        </label>
      ) : null}
      {accepted.filter((a) => a.trim()).length === 0 ? <p className="ae-ed-warn">Chưa có đáp án.</p> : null}
      {badNumber ? <p className="ae-ed-warn">Kiểu “Số” nhưng có đáp án không phải số.</p> : null}
    </EdSection>
  );
}
