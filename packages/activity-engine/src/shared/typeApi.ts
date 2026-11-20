import type { ItemOf, ItemType, ResponseOf, ScoreResult, ActivityMode } from '@openedu/contracts';

/** Props mỗi Player theo dạng nhận được từ ActivityView. */
export interface TypePlayerProps<T extends ItemType> {
  item: ItemOf<T>;
  value: ResponseOf<T> | undefined;
  onChange: (v: ResponseOf<T>) => void;
  disabled: boolean;
  reveal: boolean;
  result?: ScoreResult;
  mode: ActivityMode;
  bigText: boolean;
}

/** Props trình soạn cho GV (giao diện pro). Sửa cả payload và key, gọi onChange với item mới. */
export interface TypeEditorProps<T extends ItemType> {
  item: ItemOf<T>;
  onChange: (item: ItemOf<T>) => void;
}

export interface TypeModule<T extends ItemType> {
  Player: (p: TypePlayerProps<T>) => JSX.Element;
  Editor: (p: TypeEditorProps<T>) => JSX.Element;
  score: (item: ItemOf<T>, r: ResponseOf<T> | undefined) => ScoreResult;
  isComplete: (item: ItemOf<T>, r: ResponseOf<T> | undefined) => boolean;
  /** Item mẫu hợp lệ (có key) để GV bắt đầu soạn và để kiểm thử. */
  sample: () => ItemOf<T>;
}
