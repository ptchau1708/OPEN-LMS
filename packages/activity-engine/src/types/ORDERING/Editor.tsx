import type { Choice } from '@openedu/contracts';
import type { TypeEditorProps } from '../../shared/typeApi';
import { seededShuffle } from '../../shared/shuffle';
import { ChoiceRows, EdBtn, EdRoot, EdSection, EdWarn, QuickAdd, newId } from '../DRAG_DROP/edkit';

/** GV: thứ tự trong danh sách = thứ tự đúng. Học sinh thấy các thẻ đã xáo. */
export function Editor({ item, onChange }: TypeEditorProps<'ORDERING'>) {
  const { items } = item.payload;
  const dir = item.payload.direction ?? 'horizontal';
  const set = (list: Choice[], direction = dir) =>
    onChange({ ...item, payload: { ...item.payload, items: list, direction }, key: { order: list.map((c) => c.id) } });
  const preview = seededShuffle(items, item.id);
  return (
    <EdRoot type="ORDERING">
      <EdSection
        title="Các thẻ — theo thứ tự ĐÚNG"
        hint="Xếp danh sách đúng thứ tự cần đạt (vd từ bé đến lớn). Khi học sinh làm, thẻ được xáo trộn."
        actions={
          <span className="ae-ed-seg" role="radiogroup" aria-label="Hướng xếp">
            <EdBtn kind={dir === 'horizontal' ? 'primary' : 'default'} onClick={() => set(items, 'horizontal')}>Hàng ngang</EdBtn>
            <EdBtn kind={dir === 'vertical' ? 'primary' : 'default'} onClick={() => set(items, 'vertical')}>Cột dọc</EdBtn>
          </span>
        }
      >
        <ChoiceRows items={items} idPrefix="o" addLabel="Thêm thẻ" placeholder="Nội dung thẻ" numbered min={2} onChange={(l) => set(l)} />
        <QuickAdd
          label="Nhập nhanh (thay cả danh sách, theo thứ tự đúng)"
          placeholder="2, 4, 5, 7, 9"
          sep=","
          buttonLabel="Tạo danh sách"
          onAdd={(t) => set(t.map((x) => ({ id: newId('o'), text: x })))}
        />
      </EdSection>
      <div className="ae-ed-preview">
        <span>Học sinh thấy:</span>
        {preview.map((c) => <span className="ae-ed-pill" key={c.id}>{c.text || c.image?.replace(/^emoji:/, '') || '…'}</span>)}
      </div>
      {items.length < 2 ? <EdWarn>Cần ít nhất 2 thẻ.</EdWarn> : null}
      {items.some((c) => !c.text && !c.image) ? <EdWarn>Có thẻ chưa có chữ hoặc hình.</EdWarn> : null}
    </EdRoot>
  );
}
