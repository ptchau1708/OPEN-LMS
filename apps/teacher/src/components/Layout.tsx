import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { Profile } from '@openedu/contracts';
import { Icon, type IconName } from '@openedu/ui';
import { useDataSource, useSignOut } from '@openedu/data';
import { Avatar } from './common';
import { cx } from '../lib/format';

const NAV: { to: string; label: string; icon: IconName; end?: boolean; match?: RegExp; section?: string; admin?: boolean }[] = [
  { to: '/', label: 'Tổng quan', icon: 'home', end: true },
  { to: '/bai-giang', label: 'Bài giảng', icon: 'book' },
  { to: '/ngan-hang', label: 'Ngân hàng câu hỏi', icon: 'puzzle' },
  { to: '/giao-bai', label: 'Giao bài', icon: 'check' },
  { to: '/bao-cao-bai-giao', label: 'Báo cáo bài giao', icon: 'map' },
  { to: '/lop', label: 'Lớp học', icon: 'team', match: /^\/lop(?!\/[^/]+\/ban-do)/ },
  { to: '/hoc-sinh', label: 'Hồ sơ học sinh', icon: 'user', match: /^\/hoc-sinh/ },
  { to: '/kien-thuc', label: 'Kiến thức', icon: 'map', match: /^\/(kien-thuc|lop\/[^/]+\/ban-do-kien-thuc)/ },
  { to: '/ki-nang', label: 'Danh mục kĩ năng', icon: 'puzzle' },
  { to: '/truc-tiep', label: 'Trực tiếp', icon: 'tv' },
  { to: '/dau-truong', label: 'Đấu trường', icon: 'trophy', match: /^\/dau-truong/ },
  { to: '/trang-hoc', label: 'Trang học', icon: 'puzzle' },
  { to: '/thao-luan', label: 'Thảo luận', icon: 'team', match: /^\/thao-luan/ },
  { to: '/bai-viet', label: 'Bài viết', icon: 'pencil', section: 'Đánh giá', match: /^\/bai-viet/ },
  { to: '/cham-bai', label: 'Chấm bài', icon: 'eye', match: /^\/cham-bai/ },
  { to: '/de-kiem-tra', label: 'Đề kiểm tra', icon: 'check', match: /^\/de-kiem-tra/ },
  { to: '/rubric', label: 'Tiêu chí chấm', icon: 'settings' },
  { to: '/tt27', label: 'Nhận xét TT27', icon: 'passport' },
  { to: '/thi-dua', label: 'Thi đua', icon: 'trophy', match: /^\/thi-dua/ },
  { to: '/vuon-lop', label: 'Vườn lớp & huy hiệu', icon: 'star' },
  { to: '/diem-danh', label: 'Điểm danh', icon: 'clock' },
  { to: '/bao-cao', label: 'Báo cáo', icon: 'map', section: 'Trường', match: /^\/bao-cao/ },
  { to: '/phu-huynh', label: 'Liên kết phụ huynh', icon: 'parent' },
  { to: '/xuat-nhap', label: 'Xuất / nhập dữ liệu', icon: 'upload' },
  { to: '/quan-tri/lop', label: 'Quản lí lớp', icon: 'team', admin: true, section: 'Quản trị' },
  { to: '/quan-tri/tai-khoan', label: 'Tài khoản', icon: 'user', admin: true },
  { to: '/quan-tri/cai-dat', label: 'Năm học & kì', icon: 'settings', admin: true },
  { to: '/quan-tri/ung-dung', label: 'Ứng dụng kết nối', icon: 'puzzle', admin: true },
];

export function Brand() {
  return (
    <span className="tc-brand">
      <span className="tc-brand__mark" aria-hidden="true">OE</span>
      <span className="tc-brand__text"><strong>OPEN-EDU</strong><small>Bàn làm việc giáo viên</small></span>
    </span>
  );
}

export function Layout({ user }: { user: Profile }) {
  const loc = useLocation();
  const nav = useNavigate();
  const ds = useDataSource();
  const signOut = useSignOut();
  const [menu, setMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const rail = /^\/bai-giang\/[^/]+/.test(loc.pathname);
  useEffect(() => { setMenu(false); setUserMenu(false); }, [loc.pathname]);

  const userBox = (
    <div className="tc-user">
      <button type="button" className="tc-user__btn" aria-expanded={userMenu} onClick={() => setUserMenu((v) => !v)}>
        <Avatar mascot={user.avatarMascot} color={user.avatarColor} size={34} />
        <span className="tc-user__text"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Quản trị' : 'Giáo viên'}{ds.mode === 'demo' ? ' · demo' : ''}</small></span>
      </button>
      {userMenu ? (
        <div className="tc-menu tc-user__menu" role="menu">
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
        </div>
        <nav className="tc-nav" aria-label="Điều hướng chính">
          {NAV.filter((n) => !n.admin || user.role === 'admin').map((n) => [
            n.section ? <span key={`s-${n.section}`} className="tc-nav__section">{n.section}</span> : null,
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('tc-nav__link', (n.match ? n.match.test(loc.pathname) : isActive) && 'is-active')} title={n.label}>
              <Icon name={n.icon} size={20} />
              <span>{n.label}</span>
            </NavLink>,
          ])}
        </nav>
        <div className="tc-side__bottom">{userBox}</div>
      </aside>
      <header className="tc-topbar">
        <button type="button" className="tc-btn tc-btn--ghost tc-btn--icon" aria-label="Mở menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <Icon name={menu ? 'close' : 'menu'} size={22} />
        </button>
        <Brand />
      </header>
      {menu ? <div className="tc-side-scrim" onClick={() => setMenu(false)} /> : null}
      <main className="tc-main">
        <Outlet />
      </main>
    </div>
  );
}
