import type { Item, ItemType } from '@openedu/contracts';
import { REGISTRY } from './registry';
import type { TypeModule } from './shared/typeApi';
import { CommonFieldsEditor } from './shared/CommonFieldsEditor';

/** Trình soạn item cho GV: phần chung (đề, lớp, môn, gợi ý) + phần riêng theo dạng. */
export function ItemEditor({ item, onChange }: { item: Item; onChange: (item: Item) => void }) {
  const E = (REGISTRY[item.type] as unknown as TypeModule<ItemType>).Editor;
  return (
    <div className="ae-editor">
      <CommonFieldsEditor item={item} onChange={onChange} />
      <E item={item as never} onChange={onChange as never} />
    </div>
  );
}
