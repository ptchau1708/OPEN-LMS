import type { Item, ItemOf, ItemType } from '@openedu/contracts';
import { REGISTRY } from './registry';
import type { TypeModule } from './shared/typeApi';

export { ActivityView } from './ActivityView';
export { ItemEditor } from './ItemEditor';
export { REGISTRY } from './registry';
export type { TypePlayerProps, TypeEditorProps, TypeModule } from './shared/typeApi';
export { ACTIVITY_TYPES } from '@openedu/contracts';

function mod(t: ItemType) {
  return REGISTRY[t] as unknown as TypeModule<ItemType>;
}

export { scoreItem, isComplete, SCORERS } from './scoring';

export function sampleItem<T extends ItemType>(type: T): ItemOf<T> {
  return mod(type).sample() as unknown as ItemOf<T>;
}

/** Bỏ đáp án trước khi gửi item xuống máy HS / TV. */
export function stripKey<T extends Item>(item: T): T {
  const { key: _k, explanation: _e, ...rest } = item as T & { key?: unknown; explanation?: unknown };
  return rest as T;
}

export { badgeColor, badgeLetter } from './types/MCQ/OptionGrid';
import { seededShuffle } from './shared/shuffle';
import type { Choice } from '@openedu/contracts';
/** Thứ tự lựa chọn đúng như học sinh thấy (dùng cho bảng kết quả TV). POLL không xáo. */
export function displayOptions(item: Item): Choice[] | null {
  if (item.type === 'POLL') return item.payload.options.slice();
  if (item.type === 'MCQ' || item.type === 'MCQ_MULTIPLE' || item.type === 'LISTEN_CHOOSE') return seededShuffle(item.payload.options, item.id);
  return null;
}
