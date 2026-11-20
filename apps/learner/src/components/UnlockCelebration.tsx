import { useEffect, type CSSProperties } from 'react';
import { MASCOT_BY_ID } from '@openedu/contracts';
import { useCurrentUser, useSetCompanion } from '@openedu/data';
import { Button, Confetti, Icon, Mascot, SpeakButton, sfx } from '@openedu/ui';
import { useUi } from '../lib/store';

/** Màn chúc mừng toàn màn hình khi mở khóa linh vật mới. */
export function UnlockCelebration() {
  const queue = useUi((s) => s.unlockQueue);
  const hold = useUi((s) => s.holdUnlocks);
  const shift = useUi((s) => s.shiftUnlock);
  const toast = useUi((s) => s.toast);
  const me = useCurrentUser().data;
  const setCompanion = useSetCompanion();
  const id = !hold && me ? queue[0] : undefined;
  const m = id ? MASCOT_BY_ID[id] : undefined;

  useEffect(() => { if (m) sfx.fanfare(); }, [m]);
  if (!m || !me) return null;

  const choose = () => {
    setCompanion.mutate({ userId: me.id, mascot: m.id }, {
      onSuccess: () => { toast(`${m.name} là bạn đồng hành mới của em!`, 'star'); shift(); },
      onError: () => { toast('Chưa chọn được, em thử lại nhé!', 'try'); },
    });
  };

  return (
    <div className="ln-unlock" role="dialog" aria-modal="true" aria-label={`Mở khóa ${m.name}`} style={{ ['--mc' as string]: m.color } as CSSProperties}>
      <div className="ln-unlock__rays" aria-hidden="true" />
      <Confetti show durationMs={3200} count={56} />
      <div className="ln-unlock__card">
        <p className="ln-unlock__kicker">Bạn mới đến từ {m.country}!</p>
        <div className="ln-unlock__hero"><Mascot id={m.id} mood="cheer" size={200} animate /></div>
        <h2 className="ln-unlock__name">{m.name}</h2>
        <div className="ln-unlock__greet">
          <span><strong>{m.greeting}</strong> <span className="k-muted">nghĩa là “{m.greetingMeaning}”</span></span>
          <SpeakButton text={`${m.greeting} Nghĩa là ${m.greetingMeaning}`} size="sm" label="Nghe lời chào" />
        </div>
        <p className="ln-unlock__fact"><Icon name="hint" size={22} /> {m.funFact}</p>
        <div className="ln-unlock__actions">
          <Button size="lg" block onClick={choose} disabled={setCompanion.isPending} icon={<Icon name="check" size={24} />}>Chọn làm bạn đồng hành</Button>
          <Button size="lg" block variant="secondary" onClick={shift}>Để sau</Button>
        </div>
      </div>
    </div>
  );
}
