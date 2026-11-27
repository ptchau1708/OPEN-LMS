import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { MascotId } from '@openedu/contracts';
import { Button, Icon, Mascot, TabBar, sfx } from '@openedu/ui';
import type { IconName } from '@openedu/ui';
import { useUi } from '../lib/store';

export function Avatar({ mascot, color, size = 64, className }: { mascot: MascotId; color?: string; size?: number; className?: string }) {
  return (
    <span className={`ln-avatar${className ? ' ' + className : ''}`} style={{ width: size, height: size, ['--av' as string]: color ?? 'var(--k-math)' } as CSSProperties}>
      <span className="ln-avatar__bg" />
      <Mascot id={mascot} size={Math.round(size * 1.05)} title="" className="ln-avatar__m" />
    </span>
  );
}

export function LoadingScreen({ label = 'Đang tải', mascot = 'nghe' }: { label?: string; mascot?: MascotId }) {
  return (
    <div className="ln-state ln-state--loading" role="status" aria-live="polite">
      <span className="ln-bounce"><Mascot id={mascot} mood="happy" size={120} title="" /></span>
      <span className="ln-bounce__shadow" />
      <p className="ln-state__title">{label}<span className="ln-dots"><i /><i /><i /></span></p>
    </div>
  );
}

export function ErrorState({ title = 'Ôi, có trục trặc rồi!', message, onRetry, mascot = 'nghe', extra }: { title?: string; message?: string; onRetry?: () => void; mascot?: MascotId; extra?: ReactNode }) {
  return (
    <div className="ln-state" role="alert">
      <Mascot id={mascot} mood="sad" size={130} title="" />
      <h2 className="ln-state__title">{title}</h2>
      <p className="ln-state__text">{message ?? 'Có thể mạng đang chập chờn. Em thử lại nhé!'}</p>
      <div className="ln-row ln-row--center">
        {onRetry && <Button size="lg" onClick={onRetry} icon={<Icon name="retry" size={24} />}>Thử lại</Button>}
        {extra}
      </div>
    </div>
  );
}

export function EmptyState({ title, text, mascot = 'nghe', action }: { title: string; text?: string; mascot?: MascotId; action?: ReactNode }) {
  return (
    <div className="ln-state ln-state--empty">
      <Mascot id={mascot} mood="think" size={120} title="" />
      <h2 className="ln-state__title">{title}</h2>
      {text && <p className="ln-state__text">{text}</p>}
      {action}
    </div>
  );
}

const TABS: { id: string; path: string; label: string; icon: IconName; color: string }[] = [
  { id: 'home', path: '/', label: 'Nhà', icon: 'home', color: 'var(--k-sky)' },
  { id: 'learn', path: '/hoc', label: 'Học', icon: 'map', color: 'var(--k-sea)' },
  { id: 'play', path: '/choi', label: 'Chơi', icon: 'trophy', color: '#e0601a' },
  { id: 'gift', path: '/qua', label: 'Quà', icon: 'gift', color: '#6b5cf0' },
  { id: 'me', path: '/toi', label: 'Tôi', icon: 'user', color: 'var(--k-navy)' },
];

export function AppTabs({ active }: { active: string }) {
  const nav = useNavigate();
  return (
    <TabBar
      active={active}
      items={TABS.map((t) => ({ id: t.id, label: t.label, color: t.color, icon: <Icon name={t.icon} /> }))}
      onSelect={(id) => { sfx.tap(); const t = TABS.find((x) => x.id === id); if (t) nav(t.path); }}
    />
  );
}

export function TopBack({ title, to = '/', right }: { title: string; to?: string; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="ln-topback">
      <Button variant="secondary" icon={<Icon name="back" size={26} />} aria-label="Quay lại" onClick={() => nav(to)} />
      <h1 className="ln-topback__title">{title}</h1>
      <span className="ln-topback__right">{right}</span>
    </header>
  );
}

export function NumberPad({ onDigit, onBack, onOk, okLabel = 'Xong', okDisabled }: { onDigit: (d: string) => void; onBack: () => void; onOk?: () => void; okLabel?: string; okDisabled?: boolean }) {
  const key = (d: string) => (
    <button key={d} type="button" className="ln-pad__key" onClick={() => { sfx.tap(); onDigit(d); }}>{d}</button>
  );
  return (
    <div className="ln-pad" role="group" aria-label="Bàn phím số">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key)}
      <button type="button" className="ln-pad__key ln-pad__key--soft" onClick={onBack} aria-label="Xóa một số"><Icon name="back" size={28} /></button>
      {key('0')}
      {onOk ? (
        <button type="button" className="ln-pad__key ln-pad__key--ok" onClick={onOk} disabled={okDisabled}>{okLabel}</button>
      ) : <span />}
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="ln-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`ln-toast ln-toast--${t.tone}`}>
          <Icon name={t.tone === 'try' ? 'hint' : t.tone === 'star' ? 'star' : 'check'} size={22} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Heart({ full = true, size = 30 }: { full?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`ln-heart${full ? '' : ' is-empty'}`} aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6.5 8.3c.4-.9 1.1-1.4 2-1.5" fill="none" stroke="var(--k-shine)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
