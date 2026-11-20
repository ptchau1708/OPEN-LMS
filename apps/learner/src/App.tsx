import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { Profile, Role } from '@openedu/contracts';
import { useCurrentUser, useSignOut } from '@openedu/data';
import { Button, Icon, KidShell, Mascot, setSoundEnabled } from '@openedu/ui';
import { ErrorState, LoadingScreen, Toasts } from './components/Common';
import { UnlockCelebration } from './components/UnlockCelebration';
import { MeContext, resolveSettings, teacherUrl } from './lib/util';
import Home from './pages/Home';

const Login = lazy(() => import('./pages/Login'));
const Learn = lazy(() => import('./pages/Learn'));
const Play = lazy(() => import('./pages/Play'));
const Me = lazy(() => import('./pages/Me'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const PackagePage = lazy(() => import('./pages/PackagePage'));
const LiveJoin = lazy(() => import('./pages/LiveJoin'));
const LiveRoom = lazy(() => import('./pages/LiveRoom'));
const Tower = lazy(() => import('./pages/Tower'));
const Duel = lazy(() => import('./pages/duel/DuelPage'));
const Passport = lazy(() => import('./pages/Passport'));
const Parent = lazy(() => import('./pages/Parent'));
const ParentLink = lazy(() => import('./pages/parent/ParentLink'));
const Remediation = lazy(() => import('./pages/Remediation'));
const WorkPage = lazy(() => import('./pages/WorkPage'));
const ExamPage = lazy(() => import('./pages/exam/ExamPage'));
const Downloads = lazy(() => import('./pages/Downloads'));
const OfflineHost = lazy(() => import('./offline/OfflineHost'));
const Shop = lazy(() => import('./pages/rewards/Shop'));
const ClassGardenPage = lazy(() => import('./pages/garden/ClassGardenPage'));
const BadgeWatcher = lazy(() => import('./pages/rewards/BadgeWatcher'));
const KetNoi = lazy(() => import('./pages/connect/KetNoi'));

export function App() {
  const me = useCurrentUser().data ?? null;
  const s = resolveSettings(me);
  useEffect(() => { setSoundEnabled(s.sound); }, [s.sound]);
  // Cửa sổ /ket-noi (app ngoài mở): không hiện màn chúc mừng che mất màn xin phép.
  const quiet = useLocation().pathname === '/ket-noi';
  return (
    <KidShell bigText={s.bigText} reducedMotion={s.reducedMotion}>
      <Suspense fallback={null}><OfflineHost /></Suspense>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/dang-nhap" element={<Login />} />
          <Route path="/phu-huynh/lien-ket" element={<ParentLink />} />
          <Route path="/ket-noi" element={<KetNoi />} />
          <Route element={<Guard allow={['student']} />}>
            <Route index element={<Home />} />
            <Route path="hoc" element={<Learn />} />
            <Route path="bai/:lessonId" element={<LessonPage />} />
            <Route path="goi/:packageId" element={<PackagePage />} />
            <Route path="choi" element={<Play />} />
            <Route path="choi/thap" element={<Tower />} />
            <Route path="choi/doi-dau" element={<Duel />} />
            <Route path="qua" element={<Passport />} />
            <Route path="toi" element={<Me />} />
            <Route path="toi/tai-ve" element={<Downloads />} />
            <Route path="cua-hang" element={<Shop />} />
            <Route path="vuon-lop" element={<ClassGardenPage />} />
            <Route path="on-tap/:setId" element={<Remediation />} />
            <Route path="bai-viet/:taskId" element={<WorkPage />} />
            <Route path="kiem-tra/:examId" element={<ExamPage />} />
            <Route path="lop" element={<LiveJoin />} />
            <Route path="lop/:sessionId" element={<LiveRoom />} />
          </Route>
          <Route element={<Guard allow={['student', 'parent']} />}>
            <Route path="phu-huynh" element={<Parent />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {!quiet && <UnlockCelebration />}
      {!quiet && me?.role === 'student' && <Suspense fallback={null}><BadgeWatcher /></Suspense>}
      <Toasts />
    </KidShell>
  );
}

function Guard({ allow }: { allow: Role[] }) {
  const q = useCurrentUser();
  const loc = useLocation();
  if (q.isPending) return <LoadingScreen />;
  if (q.isError) return <ErrorState message="Chưa tải được tài khoản của em." onRetry={() => void q.refetch()} />;
  const me = q.data;
  if (!me) return <Navigate to="/dang-nhap" replace state={{ from: loc.pathname + loc.search }} />;
  if (me.role === 'teacher' || me.role === 'admin') return <TeacherHint me={me} />;
  if (allow.indexOf(me.role) < 0) return <Navigate to={me.role === 'parent' ? '/phu-huynh' : '/'} replace />;
  return <MeContext.Provider value={me}><Outlet /></MeContext.Provider>;
}

export function TeacherHint({ me }: { me: Profile }) {
  const out = useSignOut();
  const nav = useNavigate();
  return (
    <div className="ln-state">
      <Mascot id={me.avatarMascot} mood="wave" size={130} title="" />
      <h2 className="ln-state__title">Chào {me.name}!</h2>
      <p className="ln-state__text">Đây là Góc học tập của học sinh. Thầy cô dùng Bàn làm việc giáo viên nhé.</p>
      <div className="ln-row ln-row--center">
        <a className="k-btn k-btn--primary k-btn--lg" href={teacherUrl()}><span className="k-btn__label">Mở Bàn làm việc giáo viên</span></a>
        <Button size="lg" variant="secondary" onClick={() => out.mutate(undefined, { onSuccess: () => nav('/dang-nhap') })}>Đăng xuất</Button>
      </div>
    </div>
  );
}

function NotFound() {
  const nav = useNavigate();
  return (
    <div className="ln-state">
      <Mascot id="kiwi" mood="think" size={130} title="" />
      <h2 className="ln-state__title">Ơ, trang này đi lạc rồi!</h2>
      <p className="ln-state__text">Mình cùng về trang Hôm nay nhé.</p>
      <Button size="lg" onClick={() => nav('/')} icon={<Icon name="home" size={24} />}>Về trang Hôm nay</Button>
    </div>
  );
}
