/**
 * Cửa hàng trang phục cho linh vật đồng hành — đổi xu (kiếm bằng học: 1 sao = 1 xu), không có tiền thật.
 * Bấm một món để thử ngay trên linh vật; mua (máy chủ kiểm tra số xu) rồi mặc / tháo.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { MASCOT_BY_ID, OUTFIT_SLOTS, SHOP_ITEMS, type MascotId, type Outfit, type OutfitSlot, type ShopItem } from '@openedu/contracts';
import { usePassport, useBuyItem, useEquipItem, useShop } from '@openedu/data';
import { Button, DressedMascot, Icon, OutfitItemArt, sfx } from '@openedu/ui';
import { AppTabs, ErrorState, LoadingScreen, TopBack } from '../../components/Common';
import { useUi } from '../../lib/store';
import { useMe } from '../../lib/util';
import '../../styles/rewards.css';

export function CoinChip({ value }: { value: number }) {
  return (
    <span className="ln-coin" aria-label={`${value} xu`}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ffc22e" stroke="#22304a" strokeWidth="2" /><circle cx="12" cy="12" r="6.5" fill="none" stroke="#e29a00" strokeWidth="1.6" /><path d="M10 9.5h4M12 8v8" stroke="#a86b00" strokeWidth="1.8" strokeLinecap="round" /></svg>
      {value}
    </span>
  );
}

export default function Shop() {
  const me = useMe();
  const shop = useShop(me.id);
  const pp = usePassport(me.id).data;
  const buy = useBuyItem();
  const equip = useEquipItem();
  const toast = useUi((s) => s.toast);
  const [slot, setSlot] = useState<OutfitSlot>('hat');
  const [tryOn, setTryOn] = useState<Outfit>({});
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [mascotView, setMascotView] = useState<MascotId | null>(null);

  const s = shop.data;
  const companion: MascotId = mascotView ?? s?.companion ?? me.avatarMascot;
  const preview = useMemo(() => {
    const o: Outfit = { ...(s?.outfit ?? {}) };
    for (const k of Object.keys(tryOn) as OutfitSlot[]) { const v = tryOn[k]; if (v) o[k] = v; }
    return o;
  }, [s?.outfit, tryOn]);

  if (shop.isPending) return <><LoadingScreen label="Đang mở cửa hàng" /><AppTabs active="gift" /></>;
  if (shop.isError || !s) return <div className="ln-page"><ErrorState message="Chưa mở được cửa hàng." onRetry={() => void shop.refetch()} /><AppTabs active="gift" /></div>;

  const owned = (id: string) => s.owned.includes(id);
  const pick = (it: ShopItem) => {
    sfx.tap();
    setSelected(it);
    setTryOn((t) => ({ ...t, [it.slot]: it.id }));
  };
  const doBuy = (it: ShopItem) => buy.mutate({ userId: me.id, itemId: it.id }, {
    onSuccess: () => {
      sfx.star();
      toast(`Em đã có ${it.name}!`, 'star');
      equip.mutate({ userId: me.id, slot: it.slot, itemId: it.id }, { onSuccess: () => setTryOn((t) => { const n = { ...t }; delete n[it.slot]; return n; }) });
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Chưa đổi được, em thử lại nhé!', 'try', 4000),
  });
  const doEquip = (it: ShopItem, on: boolean) => equip.mutate({ userId: me.id, slot: it.slot, itemId: on ? it.id : null }, {
    onSuccess: () => { sfx.tap(); setTryOn((t) => { const n = { ...t }; delete n[it.slot]; return n; }); },
    onError: () => toast('Chưa mặc được, em thử lại nhé!', 'try'),
  });
  const reset = () => { setTryOn({}); setSelected(null); };
  const sel = selected;
  const wearing = sel ? s.outfit[sel.slot] === sel.id : false;
  const unlocked = pp?.unlocked ?? [s.companion];

  return (
    <div className="ln-page ln-page--wide ln-shop">
      <TopBack title="Tủ đồ của bạn đồng hành" to="/qua" right={<CoinChip value={s.coins} />} />
      <div className="ln-shop__grid">
        <section className="ln-shop__stage k-card" aria-label="Xem thử">
          <div className="ln-shop__hero"><DressedMascot id={companion} outfit={preview} mood={sel && !owned(sel.id) ? 'wave' : 'happy'} size={240} animate /></div>
          <p className="ln-shop__who">{MASCOT_BY_ID[companion]?.name}{Object.keys(tryOn).length ? ' · đang thử đồ' : ''}</p>
          {unlocked.length > 1 && (
            <div className="ln-shop__friends" role="group" aria-label="Thử trên bạn khác">
              {unlocked.map((m) => (
                <button key={m} type="button" className={`ln-shop__friend${m === companion ? ' is-on' : ''}`} onClick={() => { sfx.tap(); setMascotView(m); }} aria-label={`Thử trên ${MASCOT_BY_ID[m].name}`}>
                  <DressedMascot id={m} outfit={preview} size={48} title="" />
                </button>
              ))}
            </div>
          )}
          {sel ? (
            <div className="ln-shop__action">
              <strong className="ln-shop__selname">{sel.name}</strong>
              {owned(sel.id) ? (
                wearing
                  ? <Button size="lg" variant="secondary" onClick={() => doEquip(sel, false)} disabled={equip.isPending}>Tháo ra</Button>
                  : <Button size="lg" onClick={() => doEquip(sel, true)} disabled={equip.isPending} icon={<Icon name="check" size={24} />}>Mặc vào</Button>
              ) : s.coins >= sel.price ? (
                <Button size="lg" onClick={() => doBuy(sel)} disabled={buy.isPending}>Đổi {sel.price} xu</Button>
              ) : (
                <p className="ln-shop__need"><Icon name="hint" size={20} /> Em cần thêm {sel.price - s.coins} xu. Mỗi sao em kiếm được là 1 xu!</p>
              )}
              {Object.keys(tryOn).length > 0 && <Button variant="ghost" onClick={reset}>Thôi thử</Button>}
            </div>
          ) : <p className="k-muted ln-shop__tip">Chạm vào một món để thử cho {MASCOT_BY_ID[companion]?.name} nhé!</p>}
        </section>

        <section className="ln-shop__racks">
          <div className="ln-seg" role="tablist" aria-label="Loại đồ">
            {OUTFIT_SLOTS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={slot === t.id} className={`ln-seg__btn${slot === t.id ? ' is-on' : ''}`} onClick={() => { sfx.tap(); setSlot(t.id); }}>{t.name}</button>
            ))}
          </div>
          <div className="ln-shop__items">
            {SHOP_ITEMS.filter((i) => i.slot === slot).map((it) => {
              const have = owned(it.id), on = s.outfit[it.slot] === it.id;
              return (
                <button key={it.id} type="button" className={`ln-item${sel?.id === it.id ? ' is-sel' : ''}${have ? ' is-owned' : ''}`} onClick={() => pick(it)}
                  aria-label={`${it.name}, ${have ? (on ? 'đang mặc' : 'đã có') : `${it.price} xu`}`} style={{ ['--afford' as string]: have || s.coins >= it.price ? '1' : '0.55' } as CSSProperties}>
                  <span className="ln-item__art"><OutfitItemArt itemId={it.id} size={76} /></span>
                  <span className="ln-item__name">{it.name}</span>
                  {have ? <span className={`ln-item__tag${on ? ' is-on' : ''}`}>{on ? 'Đang mặc' : 'Đã có'}</span> : <span className="ln-item__price"><CoinChip value={it.price} /></span>}
                </button>
              );
            })}
          </div>
          <p className="k-small k-muted ln-shop__rule">Xu chỉ có được khi em học: mỗi sao là 1 xu. Cửa hàng không dùng tiền thật.</p>
        </section>
      </div>
      <AppTabs active="gift" />
    </div>
  );
}
