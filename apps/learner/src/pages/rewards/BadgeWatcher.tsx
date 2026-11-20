/**
 * Xét huy hiệu khi số sao thay đổi (và khi mở app) rồi hiện màn chúc mừng từng huy hiệu chưa xem.
 * Tải lười từ App.tsx. Chờ màn mở khóa linh vật / bài học xong mới hiện.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BADGE_BY_ID, BADGE_CATEGORIES, type UserBadge } from '@openedu/contracts';
import { useCurrentUser, useEvaluateBadges, useMarkBadgesSeen, useWallet } from '@openedu/data';
import { BadgeArt, Button, Confetti, Icon, SpeakButton, sfx } from '@openedu/ui';
import { useUi } from '../../lib/store';
import { resolveSettings } from '../../lib/util';
import '@openedu/ui/rewards.css';
import '../../styles/rewards.css';

export function badgeView(b: UserBadge) {
  const def = BADGE_BY_ID[b.badgeId];
  const cat = BADGE_CATEGORIES.find((c) => c.id === (def?.category ?? 'cua-co'));
  return {
    title: b.title ?? def?.title ?? 'Huy hiệu',
    glyph: b.glyph ?? def?.glyph ?? 'star',
    tier: def?.tier ?? 2,
    color: cat?.color ?? '#ff5d8f',
    catName: cat?.name ?? '',
    hint: def?.hint,
  };
}

export default function BadgeWatcher() {
  const me = useCurrentUser().data;
  const isStudent = me?.role === 'student';
  const stars = useWallet(isStudent ? me?.id : undefined).data?.stars;
  const evaluate = useEvaluateBadges();
  const seen = useMarkBadgesSeen();
  const hold = useUi((s) => s.holdUnlocks);
  const mascotQueue = useUi((s) => s.unlockQueue.length);
  const [queue, setQueue] = useState<UserBadge[]>([]);
  const last = useRef<string>('');

  useEffect(() => {
    if (!isStudent || !me || stars === undefined) return;
    const key = `${me.id}:${stars}`;
    if (key === last.current) return;
    last.current = key;
    evaluate.mutate(me.id, { onSuccess: (list) => setQueue((q) => [...q, ...list.filter((b) => !q.some((x) => x.id === b.id))]) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, me?.id, stars]);

  const cur = !hold && !mascotQueue ? queue[0] : undefined;
  useEffect(() => { if (cur) sfx.fanfare(); }, [cur?.id]);
  if (!cur || !me) return null;
  const v = badgeView(cur);
  const reduced = resolveSettings(me).reducedMotion;
  const close = () => { seen.mutate({ userId: me.id, ids: [cur.id] }); setQueue((q) => q.slice(1)); };
  const teacher = cur.badgeId === 'cua-co';
  const say = teacher ? `${cur.grantedByName ?? 'Thầy cô'} tặng em huy hiệu ${v.title}. ${cur.note ?? ''}` : `Em nhận được huy hiệu ${v.title}!`;

  return (
    <div className={`ln-unlock ln-badge-pop${reduced ? ' is-still' : ''}`} role="dialog" aria-modal="true" aria-label={`Huy hiệu mới: ${v.title}`} style={{ ['--mc' as string]: v.color } as CSSProperties}>
      {!reduced && <div className="ln-unlock__rays" aria-hidden="true" />}
      {!reduced && <Confetti show durationMs={2800} count={44} />}
      <div className="ln-unlock__card">
        <p className="ln-unlock__kicker">{teacher ? `${cur.grantedByName ?? 'Thầy cô'} tặng em` : 'Huy hiệu mới!'}</p>
        <div className="ln-badge-pop__hero"><BadgeArt glyph={v.glyph} color={v.color} tier={v.tier} size={180} title={v.title} /></div>
        <h2 className="ln-unlock__name">{v.title}</h2>
        <div className="ln-unlock__greet">
          <span>{teacher ? (cur.note || 'Cô rất vui vì em!') : `Nhóm “${v.catName}” · ${v.hint ?? ''}`}</span>
          <SpeakButton text={say} size="sm" label="Nghe đọc" />
        </div>
        <div className="ln-unlock__actions">
          <Button size="lg" block onClick={close} icon={<Icon name="check" size={24} />}>{queue.length > 1 ? 'Xem huy hiệu tiếp' : 'Cất vào kệ huy hiệu'}</Button>
        </div>
      </div>
    </div>
  );
}
