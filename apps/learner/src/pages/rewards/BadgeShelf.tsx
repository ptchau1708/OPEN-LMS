/** Kệ huy hiệu (trang Tôi): huy hiệu đã có sáng màu; chưa có hiện xám + gợi ý cách đạt. */
import { useState } from 'react';
import { BADGES, BADGE_CATEGORIES, type BadgeDef, type UserBadge } from '@openedu/contracts';
import { useBadgeShelf } from '@openedu/data';
import { BadgeArt, Icon, ProgressBar, Sheet, SpeakButton, sfx } from '@openedu/ui';
import { badgeView } from './BadgeWatcher';
import { dayLabel } from '../../lib/util';
import '@openedu/ui/rewards.css';
import '../../styles/rewards.css';

type Open = { kind: 'earned'; b: UserBadge } | { kind: 'locked'; d: BadgeDef; value: number };

export default function BadgeShelf({ userId }: { userId: string }) {
  const q = useBadgeShelf(userId);
  const [open, setOpen] = useState<Open | null>(null);
  if (q.isPending) return <div className="ln-skeleton-list"><i /><i /></div>;
  if (q.isError || !q.data) return <p className="k-muted">Chưa tải được huy hiệu. Em thử lại sau nhé.</p>;
  const earned = q.data.earned;
  const byId = new Map(earned.map((b) => [b.badgeId, b]));
  const prog = new Map(q.data.progress.map((p) => [p.badgeId, p]));
  const teacher = earned.filter((b) => b.badgeId === 'cua-co');
  const count = BADGES.filter((d) => byId.has(d.id)).length;

  return (
    <div className="ln-shelf">
      <p className="ln-shelf__count"><Icon name="trophy" size={22} /> Em có <strong>{count + teacher.length}</strong> huy hiệu · còn {BADGES.length - count} huy hiệu đang chờ em</p>
      {teacher.length > 0 && (
        <div className="ln-shelf__row">
          <h3 className="ln-shelf__cat" style={{ color: BADGE_CATEGORIES[7].color }}>Huy hiệu của thầy/cô</h3>
          <div className="ln-shelf__grid">
            {teacher.map((b) => {
              const v = badgeView(b);
              return (
                <button key={b.id} type="button" className="ln-shelf__item is-on" onClick={() => { sfx.tap(); setOpen({ kind: 'earned', b }); }}>
                  <BadgeArt glyph={v.glyph} color={v.color} tier={v.tier} size={76} />
                  <span className="ln-shelf__name">{v.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {BADGE_CATEGORIES.filter((c) => c.id !== 'cua-co').map((c) => (
        <div key={c.id} className="ln-shelf__row">
          <h3 className="ln-shelf__cat" style={{ color: c.color }}>{c.name}</h3>
          <div className="ln-shelf__grid">
            {BADGES.filter((d) => d.category === c.id).map((d) => {
              const b = byId.get(d.id);
              const p = prog.get(d.id);
              return (
                <button key={d.id} type="button" className={`ln-shelf__item${b ? ' is-on' : ''}`}
                  aria-label={b ? d.title : `Chưa có: ${d.title}. ${d.hint}`}
                  onClick={() => { sfx.tap(); setOpen(b ? { kind: 'earned', b } : { kind: 'locked', d, value: p?.value ?? 0 }); }}>
                  <BadgeArt glyph={d.glyph} color={c.color} tier={d.tier} locked={!b} size={76} />
                  <span className="ln-shelf__name">{b ? d.title : d.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.kind === 'earned' ? badgeView(open.b).title : open ? 'Huy hiệu đang chờ em' : ''}>
        {open?.kind === 'earned' && (() => {
          const v = badgeView(open.b);
          return (
            <div className="ln-badge-detail">
              <BadgeArt glyph={v.glyph} color={v.color} tier={v.tier} size={150} />
              {open.b.badgeId === 'cua-co'
                ? <p><strong>{open.b.grantedByName ?? 'Thầy/cô'}</strong> tặng em{open.b.note ? `: “${open.b.note}”` : '.'}</p>
                : <p>Em đã làm được: {v.hint?.toLowerCase()}.</p>}
              <p className="k-muted">Nhận ngày {dayLabel(open.b.earnedAt)}</p>
            </div>
          );
        })()}
        {open?.kind === 'locked' && (
          <div className="ln-badge-detail">
            <BadgeArt glyph={open.d.glyph} color={BADGE_CATEGORIES.find((c) => c.id === open.d.category)?.color ?? '#999'} tier={open.d.tier} locked size={150} />
            <p className="ln-badge-detail__how"><strong>{open.d.title}</strong> — {open.d.hint}. <SpeakButton text={`${open.d.title}. Cách nhận: ${open.d.hint}`} size="sm" label="Nghe cách nhận" /></p>
            <ProgressBar value={Math.min(1, open.value / open.d.rule.min)} color="var(--k-star)" label="Tiến độ" />
            <p className="k-muted">Em đã được {Math.min(open.value, open.d.rule.min)}/{open.d.rule.min}. Cố lên nhé!</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}
