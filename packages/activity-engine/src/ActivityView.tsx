import type { ActivityViewProps, ItemType } from '@openedu/contracts';
import { REGISTRY } from './registry';
import type { TypeModule } from './shared/typeApi';
import { PromptView } from './shared/PromptView';

/** Hiển thị đề bài + phần tương tác theo dạng. */
export function ActivityView({ item, value, onChange, disabled = false, reveal = false, result, mode = 'player', bigText = false }: ActivityViewProps) {
  const mod = REGISTRY[item.type] as unknown as TypeModule<ItemType>;
  const P = mod.Player;
  return (
    <div className={`ae-activity ae-activity--${mode} ae-type-${item.type.toLowerCase()}${bigText ? ' k-big' : ''}`}>
      <PromptView item={item} mode={mode} />
      <div className="ae-body">
        <P item={item as never} value={value as never} onChange={onChange as never} disabled={disabled} reveal={reveal} result={result} mode={mode} bigText={bigText} />
      </div>
    </div>
  );
}
