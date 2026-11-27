import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import type { StudentSettings } from '@openedu/contracts';
import { useClass, usePassport, useShop, useSignOut, useStudentWork, useSubmissions, useUpdateSettings, useWallet } from '@openedu/data';
import { Button, DressedMascot, Icon, ProgressBar, StarCount, setSoundEnabled, sfx } from '@openedu/ui';
import type { IconName } from '@openedu/ui';
import { AppTabs, Avatar } from '../components/Common';
import { WorkGallery } from '../components/WorkCards';
import { workPath, workState } from '../lib/work';
import { useUi } from '../lib/store';
import { resolveSettings, useMe } from '../lib/util';
import '../styles/rewards.css';

const SkillGarden = lazy(() => import('../components/SkillGarden'));
const BadgeShelf = lazy(() => import('./rewards/BadgeShelf'));

const TOGGLES: { key: keyof StudentSettings; label: string; desc: string; icon: IconName }[] = [
  { key: 'bigText', label: 'Chữ to', desc: 'Chữ và nút to hơn, dễ đọc hơn', icon: 'eye' },
  { key: 'autoRead', label: 'Tự đọc đề bài', desc: 'Máy đọc to đề bài khi mở câu hỏi', icon: 'speaker' },
  { key: 'sound', label: 'Âm thanh', desc: 'Tiếng “ting” khi đúng, nhạc khi nhận sao', icon: 'star' },
  { key: 'reducedMotion', label: 'Giảm chuyển động', desc: 'Ít hình động hơn cho dịu mắt', icon: 'settings' },
];

export default function Me() {
  const me = useMe();
  const nav = useNavigate();
  const wallet = useWallet(me.id).data;
  const pp = usePassport(me.id).data;
  const cls = useClass(me.classId).data;
  const outfit = useShop(me.id).data?.outfit;
  const update = useUpdateSettings();
  const out = useSignOut();
  const toast = useUi((s) => s.toast);
  const s = resolveSettings(me);
  const works = useStudentWork(me.id);
  const pendingWork = (useSubmissions({ studentId: me.id }).data ?? []).filter((x, i, a) => workState(x) === 'waiting' && a.findIndex((y) => y.taskId === x.taskId) === i).length;
  const xp = wallet?.xp ?? 0;
  const level = wallet?.level ?? 1;
  const inLevel = xp % 100;

  const flip = (k: keyof StudentSettings) => {
    const v = !s[k];
    if (k === 'sound') { setSoundEnabled(v); if (v) sfx.correct(); } else sfx.tap();
    update.mutate({ userId: me.id, settings: { [k]: v } }, { onError: () => toast('Chưa lưu được, em thử lại nhé!', 'try') });
  };

  return (
    <div className="ln-page ln-me">
      <section className="ln-profile k-card">
        {outfit && Object.keys(outfit).length
          ? <button type="button" className="ln-me__dressed" onClick={() => nav('/cua-hang')} aria-label="Mở tủ đồ"><DressedMascot id={pp?.companion ?? me.avatarMascot} outfit={outfit} size={110} title="" /></button>
          : <Avatar mascot={pp?.companion ?? me.avatarMascot} color={me.avatarColor} size={104} />}
        <div className="ln-profile__info">
          <h1 className="ln-h1">{me.name}</h1>
          <p className="k-muted ln-profile__sub">{cls ? `Lớp ${cls.name}` : me.grade ? `Lớp ${me.grade}` : ''}{me.username ? ` · tên đăng nhập: ${me.username}` : ''}</p>
          <div className="ln-profile__chips">
            <StarCount value={wallet?.stars ?? 0} size="sm" />
            <span className="ln-streak"><Icon name="flame" size={20} /> {wallet?.streakDays ?? 0} ngày</span>
            <span className="ln-mini-chip"><Icon name="passport" size={18} /> {pp?.unlocked.length ?? 1} bạn</span>
          </div>
        </div>
        <div className="ln-level">
          <span className="ln-level__badge">Cấp {level}</span>
          <ProgressBar value={inLevel / 100} color="var(--k-eng)" label="Điểm kinh nghiệm" />
          <span className="k-small k-muted">Còn {100 - inLevel} điểm kinh nghiệm nữa lên cấp {level + 1}</span>
        </div>
      </section>

      <section className="ln-me__garden" aria-labelledby="ln-garden-h">
        <h2 id="ln-garden-h" className="ln-h2">Kỹ năng của em</h2>
        <p className="k-muted ln-me__garden-sub">Mỗi kỹ năng là một cái cây. Em học đều, cây sẽ nở hoa!</p>
        <Suspense fallback={<div className="ln-skeleton-list"><i /><i /></div>}><SkillGarden /></Suspense>
      </section>

      <section className="ln-me__badges" aria-labelledby="ln-badges-h">
        <h2 id="ln-badges-h" className="ln-h2">Kệ huy hiệu</h2>
        <Suspense fallback={<div className="ln-skeleton-list"><i /><i /></div>}><BadgeShelf userId={me.id} /></Suspense>
        <Button variant="secondary" onClick={() => nav('/cua-hang')} icon={<Icon name="gift" size={24} />}>Tủ đồ của bạn đồng hành</Button>
      </section>

      <section className="ln-me__work" aria-labelledby="ln-work-h">
        <h2 id="ln-work-h" className="ln-h2">Bài viết của em</h2>
        {works.isPending ? <div className="ln-skeleton-list"><i /></div>
          : (works.data ?? []).length === 0 && !pendingWork ? <p className="k-muted">Khi thầy/cô nhận xét bài viết của em, bài sẽ được cất vào đây.</p>
          : <WorkGallery entries={works.data ?? []} pending={pendingWork} onOpen={(id) => { sfx.tap(); nav(workPath(id)); }} />}
      </section>

      <section className="ln-settings">
        <h2 className="ln-h2">Cài đặt của em</h2>
        <div className="ln-toggle-list k-card">
          {TOGGLES.map((t) => (
            <button key={t.key} type="button" role="switch" aria-checked={s[t.key]} className={`ln-toggle${s[t.key] ? ' is-on' : ''}`} onClick={() => flip(t.key)} disabled={update.isPending}>
              <span className="ln-toggle__icon"><Icon name={t.icon} size={26} /></span>
              <span className="ln-toggle__text"><strong>{t.label}</strong><span>{t.desc}</span></span>
              <span className="ln-switch" aria-hidden="true"><i /></span>
            </button>
          ))}
        </div>
      </section>

      <div className="ln-me__actions">
        <Button size="lg" block variant="secondary" onClick={() => nav('/toi/tai-ve')} icon={<Icon name="upload" size={26} style={{ transform: 'rotate(180deg)' }} />}>Bài đã tải về (học không cần mạng)</Button>
        <Button size="lg" block variant="secondary" onClick={() => nav('/phu-huynh')} icon={<Icon name="parent" size={26} />}>Chế độ phụ huynh</Button>
        <Button size="lg" block variant="ghost" onClick={() => out.mutate(undefined, { onSuccess: () => nav('/dang-nhap', { replace: true }) })} icon={<Icon name="back" size={24} />}>Đăng xuất</Button>
      </div>
      <AppTabs active="me" />
    </div>
  );
}
