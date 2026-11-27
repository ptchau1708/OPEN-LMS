import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { Icon } from '@openedu/ui';
import { useDataSource, useNotifications, usePushSync, useSignOut } from '@openedu/data';
import { Avatar } from './common';
import { NotifyBell } from './NotifyBell';
import { useFocusGrade } from '../lib/focusGrade';
import { cx } from '../lib/format';
import { NAV_GROUPS, NAV_HOME, type NavGroup, type NavItem } from '../lib/nav';
import { navBadge, TodayWorkProvider, useTodayWork } from '../lib/todayWork';

const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));

const GROUPS_KEY = 'tc-nav-groups';
function readGroups(): Record<string, boolean> {
  try { return JSON.parse(window.localStorage.getItem(GROUPS_KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
}
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function Brand() {
  return (
    <span className="tc-brand">
      <span className="tc-brand__mark" aria-hidden="true">OE</span>
      <span className="tc-brand__text"><strong>OPEN-EDU</strong><small>Bàn làm việc giáo viên</small></span>
    </span>
  );
}

export function Layout({ user }: { user: Profile }) {
  return <TodayWorkProvider user={user}><Shell user={user} /></TodayWorkProvider>;
}

function NavRow({ n, active, badge }: { n: NavItem; active: boolean; badge: number }) {
  // Tên đọc của liên kết giữ nguyên (ví dụ "Phụ huynh"); số việc đọc như phần mô tả.
  const descId = badge ? `nav-d${n.to.replace(/[^a-z0-9]/gi, '-')}` : undefined;
  return (
    <NavLink to={n.to} end={n.end} className={cx('tc-nav__link', active && 'is-active')} title={n.label} aria-describedby={descId}>
      <Icon name={n.icon} size={20} />
      <span>{n.label}</span>
      {badge ? <b className="tc-nav__badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</b> : null}
      {badge ? <span id={descId} hidden>{badge} việc cần làm</span> : null}
    </NavLink>
  );
}

function Shell({ user }: { user: Profile }) {
  const loc = useLocation();
  const nav = useNavigate();
  const ds = useDataSource();
  const signOut = useSignOut();
  const [menu, setMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [cmdk, setCmdk] = useState(false);
  const [groups, setGroups] = useState<Record<string, boolean>>(readGroups);
  const work = useTodayWork();
  const rail = /^\/bai-giang\/[^/]+/.test(loc.pathname);
  const notes = useNotifications();
  const focus = useFocusGrade().grade;
  usePushSync('gv');
  useEffect(() => { setMenu(false); setUserMenu(false); }, [loc.pathname]);
  // Ctrl+K / ⌘K: mở ô tìm nhanh ở mọi trang.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setCmdk((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isActive = (n: NavItem) => (n.match ? n.match.test(loc.pathname) : n.end ? loc.pathname === n.to : loc.pathname === n.to || loc.pathname.indexOf(n.to + '/') === 0);
  // Nhóm mặc định: mở hết, trừ "Trường & thiết lập" với giáo viên (quản trị thì mở). Nhóm có trang đang xem luôn mở.
  const isOpen = (g: NavGroup) => {
    if (g.items.some(isActive)) return true;
    if (groups[g.id] !== undefined) return groups[g.id];
    return g.id !== 'truong' || user.role === 'admin';
  };
  const toggle = (g: NavGroup) => {
    const next = { ...groups, [g.id]: !isOpen(g) };
    setGroups(next);
    try { window.localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* bỏ qua */ }
  };

  const userBox = (
    <div className="tc-user">
      <button type="button" className="tc-user__btn" aria-expanded={userMenu} onClick={() => setUserMenu((v) => !v)}>
        <Avatar mascot={user.avatarMascot} color={user.avatarColor} size={34} />
        <span className="tc-user__text"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Quản trị' : 'Giáo viên'} · ưu tiên lớp {focus}{ds.mode === 'demo' ? ' · demo' : ''}</small></span>
      </button>
      {userMenu ? (
        <div className="tc-menu tc-user__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => nav('/cai-dat')} data-testid="menu-settings">
            <Icon name="settings" size={16} /> Cài đặt cá nhân (khối ưu tiên)
          </button>
          <button type="button" role="menuitem" onClick={() => nav('/doi-mat-khau')} data-testid="menu-change-pw">
            <Icon name="lock" size={16} /> Đổi mật khẩu
          </button>
          <button type="button" role="menuitem" onClick={() => signOut.mutate(undefined, { onSuccess: () => nav('/') })}>
            <Icon name="back" size={16} /> Đăng xuất
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={cx('tc-app theme-pro', rail && 'tc-app--rail')}>
      <aside className={cx('tc-side', menu && 'is-open')}>
        <div className="tc-side__top">
          <Brand />
          <NotifyBell data={notes.data} id="bell-side" />
        </div>
        <button type="button" className="tc-search" onClick={() => setCmdk(true)} data-testid="cmdk-open" title="Tìm nhanh (Ctrl+K)">
          <Icon name="search" size={16} />
          <span className="tc-search__text">Tìm nhanh…</span>
          <kbd className="tc-search__kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <nav className="tc-nav" aria-label="Điều hướng chính">
          <NavRow n={NAV_HOME} active={isActive(NAV_HOME)} badge={0} />
          {NAV_GROUPS.map((g) => {
            const items = g.items.filter((n) => !n.admin || user.role === 'admin');
            if (!items.length) return null;
            const open = rail || isOpen(g);
            const hidden = open ? 0 : items.reduce((t, n) => t + navBadge(work, n.badge), 0);
            return (
              <div key={g.id} className={cx('tc-nav__group', open && 'is-open')}>
                <button type="button" className="tc-nav__head" aria-expanded={open} onClick={() => toggle(g)} data-testid={`nav-group-${g.id}`}>
                  <Icon name="chevron" size={14} />
                  <span>{g.label}</span>
                  {hidden ? <b className="tc-nav__badge" aria-label={`${hidden} việc cần làm trong nhóm`}>{hidden}</b> : null}
                </button>
                {open ? items.map((n) => <NavRow key={n.to} n={n} active={isActive(n)} badge={navBadge(work, n.badge)} />) : null}
              </div>
            );
          })}
        </nav>
        <div className="tc-side__bottom">{userBox}</div>
      </aside>
      <header className="tc-topbar">
        <button type="button" className="tc-btn tc-btn--ghost tc-btn--icon" aria-label="Mở menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <Icon name={menu ? 'close' : 'menu'} size={22} />
        </button>
        <Brand />
        <span className="tc-spacer" />
        <button type="button" className="tc-btn tc-btn--ghost tc-btn--icon" aria-label="Tìm nhanh" onClick={() => setCmdk(true)}><Icon name="search" size={20} /></button>
        <NotifyBell data={notes.data} id="bell-top" testId="notify-bell-m" />
      </header>
      {menu ? <div className="tc-side-scrim" onClick={() => setMenu(false)} /> : null}
      <main className="tc-main">
        <Outlet />
      </main>
      {cmdk ? <Suspense fallback={null}><CommandPalette user={user} open={cmdk} onClose={() => setCmdk(false)} /></Suspense> : null}
    </div>
  );
}
