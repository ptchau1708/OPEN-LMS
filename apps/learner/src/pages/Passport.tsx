import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { MASCOTS, type MascotMeta, type RewardEntry } from '@openedu/contracts';
import { nextUnlock, usePassport, useRewards, useSetCompanion, useWallet } from '@openedu/data';
import { BadgeArt, Button, Icon, Mascot, OutfitItemArt, Plant, ProgressBar, Sheet, SpeakButton, StarCount, sfx } from '@openedu/ui';
import type { IconName } from '@openedu/ui';
import { AppTabs, ErrorState, LoadingScreen } from '../components/Common';
import { useUi } from '../lib/store';
import { dayLabel, timeLabel, useMe } from '../lib/util';
import '../styles/passport.css';
import '../styles/rewards.css';

const SRC_ICON: Record<RewardEntry['sourceType'], IconName> = { item: 'check', lesson: 'book', live: 'tv', arena: 'tower', behavior: 'star', bonus: 'gift', work: 'pencil', shop: 'gift' };

export default function Passport() {
  const me = useMe();
  const pp = usePassport(me.id);
  const wallet = useWallet(me.id);
  const rewards = useRewards(me.id, 15);
  const setCompanion = useSetCompanion();
  const toast = useUi((s) => s.toast);
  const [open, setOpen] = useState<MascotMeta | null>(null);
  const nav = useNavigate();

  if (pp.isPending || wallet.isPending) return <><LoadingScreen label="Đang mở hộ chiếu" /><AppTabs active="gift" /></>;
  if (pp.isError || wallet.isError || !pp.data || !wallet.data) return <div className="ln-page"><ErrorState message="Chưa mở được hộ chiếu." onRetry={() => { void pp.refetch(); void wallet.refetch(); }} /><AppTabs active="gift" /></div>;

  const stars = wallet.data.stars;
  const unlocked = pp.data.unlocked;
  const companion = pp.data.companion;
  const nxt = nextUnlock(stars);
  const nextMeta = nxt ? MASCOTS.find((m) => m.id === nxt.mascot) : undefined;
  const prevStars = nextMeta ? Math.max(0, ...MASCOTS.filter((m) => m.unlockStars < nextMeta.unlockStars).map((m) => m.unlockStars)) : 0;
  const ratio = nextMeta ? (stars - prevStars) / Math.max(1, nextMeta.unlockStars - prevStars) : 1;

  const choose = (m: MascotMeta) => setCompanion.mutate({ userId: me.id, mascot: m.id }, {
    onSuccess: () => { sfx.star(); toast(`${m.name} là bạn đồng hành mới của em!`, 'star'); setOpen(null); },
    onError: () => toast('Chưa chọn được, em thử lại nhé!', 'try'),
  });

  return (
    <div className="ln-page ln-passport">
      <div className="ln-book">
        <header className="ln-book__cover">
          <Icon name="passport" size={40} />
          <div>
            <h1 className="ln-book__title">Hộ chiếu khám phá</h1>
            <p className="ln-book__owner">của {me.name} · đã gặp {unlocked.length}/{MASCOTS.length} bạn</p>
          </div>
          <StarCount value={stars} />
        </header>

        <div className="ln-book__page">
          {nextMeta ? (
            <div className="ln-next">
              <span className="ln-next__ghost"><Mascot id={nextMeta.id} size={56} title="" /></span>
              <div className="ln-next__text">
                <strong>Còn {nxt?.starsNeeded} sao nữa để gặp bạn mới từ {nextMeta.country}!</strong>
                <ProgressBar value={ratio} color="var(--k-star)" label="Tiến tới bạn mới" />
              </div>
            </div>
          ) : (
            <p className="ln-next ln-next--all"><Icon name="trophy" size={26} /> Em đã gặp tất cả các bạn rồi. Tuyệt vời!</p>
          )}

          <div className="ln-stamps">
            {MASCOTS.map((m, i) => {
              const on = unlocked.indexOf(m.id) >= 0;
              return (
                <button key={m.id} type="button" className={`ln-stamp${on ? ' is-on' : ''}`} style={{ ['--mc' as string]: m.color, ['--tilt' as string]: `${((i % 3) - 1) * 1.5}deg` } as CSSProperties}
                  onClick={() => { sfx.tap(); setOpen(m); }} aria-label={on ? `${m.name}, ${m.country}` : `Bạn chưa mở, còn ${m.unlockStars - stars} sao`}>
                  {m.id === companion && <span className="ln-stamp__ribbon">Bạn đồng hành</span>}
                  <span className="ln-stamp__art"><Mascot id={m.id} size={84} title="" /></span>
                  {on ? (
                    <>
                      <span className="ln-stamp__name">{m.name}</span>
                      <span className="ln-stamp__country">{m.country}</span>
                    </>
                  ) : (
                    <span className="ln-stamp__lock"><Icon name="lock" size={16} /> {m.unlockStars - stars} sao nữa</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <nav className="ln-reward-links" aria-label="Phần thưởng khác">
        <button type="button" className="ln-reward-link" onClick={() => { sfx.tap(); nav('/cua-hang'); }}><span className="ln-reward-link__art"><OutfitItemArt itemId="hat-party" size={52} /></span>Tủ đồ · {wallet.data.coins} xu</button>
        <button type="button" className="ln-reward-link" onClick={() => { sfx.tap(); nav('/toi'); }}><span className="ln-reward-link__art"><BadgeArt glyph="star" color="#f5b400" tier={3} size={52} /></span>Kệ huy hiệu</button>
        {me.classId && <button type="button" className="ln-reward-link" onClick={() => { sfx.tap(); nav('/vuon-lop'); }}><span className="ln-reward-link__art"><Plant kind="huong-duong" stage={4} size={40} /></span>Vườn lớp</button>}
      </nav>

      <section className="ln-rewards">
        <h2 className="ln-h2">Phần thưởng gần đây</h2>
        {rewards.isError ? <ErrorState message="Chưa tải được phần thưởng." onRetry={() => void rewards.refetch()} /> :
          (rewards.data ?? []).length === 0 ? <p className="k-muted">Em học bài và trả lời đúng để nhận sao đầu tiên nhé!</p> : (
            <ol className="ln-timeline">
              {(rewards.data ?? []).map((r, i, arr) => (
                <li key={r.id} className="ln-tl">
                  {(i === 0 || dayLabel(arr[i - 1].at) !== dayLabel(r.at)) && <span className="ln-tl__day">{dayLabel(r.at)}</span>}
                  <div className="ln-tl__row">
                    <span className={`ln-tl__icon ln-tl__icon--${r.sourceType}`}><Icon name={SRC_ICON[r.sourceType] ?? 'star'} size={22} /></span>
                    <span className="ln-tl__text">{r.reason}<span className="ln-tl__time">{timeLabel(r.at)}</span></span>
                    {r.stars > 0 && <span className="ln-tl__stars">+{r.stars}</span>}
                    {r.sourceType === 'shop' && <span className="ln-tl__stars ln-tl__coins">{r.coins} xu</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
      </section>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open && unlocked.indexOf(open.id) >= 0 ? open.name : 'Bạn bí mật'}>
        {open && (unlocked.indexOf(open.id) >= 0 ? (
          <div className="ln-friend">
            <div className="ln-friend__hero" style={{ ['--mc' as string]: open.color } as CSSProperties}><Mascot id={open.id} mood="wave" size={150} animate /></div>
            <p className="ln-friend__from">{open.animal} đến từ <strong>{open.country}</strong></p>
            <div className="ln-friend__greet">
              <span><strong>{open.greeting}</strong> <span className="k-muted">nghĩa là “{open.greetingMeaning}”</span></span>
              <SpeakButton text={`${open.greeting} Nghĩa là ${open.greetingMeaning}`} label="Nghe lời chào" />
            </div>
            <p className="ln-friend__fact"><Icon name="hint" size={22} /> {open.funFact}</p>
            {open.id === companion ? (
              <p className="ln-friend__now"><Icon name="check" size={22} /> Đang là bạn đồng hành của em</p>
            ) : (
              <Button size="lg" block onClick={() => choose(open)} disabled={setCompanion.isPending} icon={<Icon name="check" size={24} />}>Chọn làm bạn đồng hành</Button>
            )}
          </div>
        ) : (
          <div className="ln-friend">
            <div className="ln-friend__hero is-locked"><Mascot id={open.id} size={150} title="" /></div>
            <p className="ln-friend__from">Một người bạn từ <strong>{open.country}</strong> đang chờ em.</p>
            <p className="ln-friend__fact"><Icon name="star" size={22} /> Còn {open.unlockStars - stars} sao nữa là gặp được bạn ấy. Cố lên nhé!</p>
          </div>
        ))}
      </Sheet>
      <AppTabs active="gift" />
    </div>
  );
}
