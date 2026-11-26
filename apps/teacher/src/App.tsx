import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { CatalogGate, useCurrentUser, useEmbedOriginsSync } from '@openedu/data';
import { setEmbedOrigins } from '@openedu/lesson-player';
import { Layout } from './components/Layout';
import { Loading } from './components/common';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Lessons } from './pages/Lessons';

const LessonEditor = lazy(() => import('./pages/editor/LessonEditor'));
const ItemBank = lazy(() => import('./pages/ItemBank'));
const Assign = lazy(() => import('./pages/Assign'));
const Classes = lazy(() => import('./pages/Classes'));
const LiveStart = lazy(() => import('./pages/LiveStart'));
const LiveControl = lazy(() => import('./pages/LiveControl'));
const PaperCards = lazy(() => import('./pages/live/PaperCards'));
const DiscussList = lazy(() => import('./pages/discuss/DiscussList'));
const DiscussBoard = lazy(() => import('./pages/discuss/DiscussBoard'));
const DiscussTv = lazy(() => import('./pages/discuss/DiscussTv'));
const Heatmap = lazy(() => import('./pages/Heatmap'));
const SkillCatalog = lazy(() => import('./pages/SkillCatalog'));
const KnowledgeRedirect = lazy(() => import('./pages/Heatmap').then((m) => ({ default: m.KnowledgeRedirect })));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const Students = lazy(() => import('./pages/Students'));
const WorkTasks = lazy(() => import('./pages/assess/WorkTasks'));
const BatchUpload = lazy(() => import('./pages/assess/BatchUpload'));
const ReviewQueue = lazy(() => import('./pages/assess/Review'));
const ReviewScreen = lazy(() => import('./pages/assess/Review').then((m) => ({ default: m.ReviewScreen })));
const Rubrics = lazy(() => import('./pages/assess/Rubrics'));
const Tt27 = lazy(() => import('./pages/assess/Tt27'));
const BehaviorPage = lazy(() => import('./pages/assess/Behavior'));
const ClassGardenTeacher = lazy(() => import('./pages/rewards/ClassGarden'));
const Attendance = lazy(() => import('./pages/assess/Attendance'));
const ExamHome = lazy(() => import('./pages/exam/ExamHome'));
const MatrixEditor = lazy(() => import('./pages/exam/MatrixEditor'));
const ExamBuilder = lazy(() => import('./pages/exam/ExamBuilder'));
const ExamPrint = lazy(() => import('./pages/exam/ExamPrint'));
const ExamResults = lazy(() => import('./pages/exam/ExamResults'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const GradeMap = lazy(() => import('./pages/admin/GradeMap'));
const ParentLinks = lazy(() => import('./pages/admin/ParentLinks'));
const AdminClasses = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminClasses })));
const AdminUsers = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminUsers })));
const AdminSettings = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminSettings })));
const ConnectApps = lazy(() => import('./pages/admin/ConnectApps'));
const BridgePage = lazy(() => import('./pages/bridge/BridgePage'));
const ClassPages = lazy(() => import('./pages/pages/ClassPages'));
const TeacherLtiAuth = lazy(() => import('./pages/pages/LtiAuth'));
const BehaviorStats = lazy(() => import('./pages/assess/BehaviorStats'));
const AssignReport = lazy(() => import('./pages/assign/report'));
const ChangePassword = lazy(() => import('./pages/Password'));
const ArenaHome = lazy(() => import('./pages/arena/ArenaHome'));
const CupDetail = lazy(() => import('./pages/arena/CupDetail'));
const CupTv = lazy(() => import('./pages/arena/CupTv'));
const Certificates = lazy(() => import('./pages/arena/Certificates'));
const ForcedChange = lazy(() => import('./pages/Password').then((m) => ({ default: m.ForcedChange })));

export function App() {
  const me = useCurrentUser();
  const staff = me.data?.role === 'teacher' || me.data?.role === 'admin';
  useEmbedOriginsSync(setEmbedOrigins, staff);
  if (me.isLoading) return <div className="tc-app theme-pro tc-center"><Loading /></div>;
  const user = me.data;
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) return <Login wrongRole={user ?? null} />;
  // Mật khẩu tạm do quản trị cấp → đổi trước khi vào (docs/MAT_KHAU.md).
  if (user.mustChangePassword) return <Suspense fallback={<Loading />}><ForcedChange user={user} /></Suspense>;
  return (
    <CatalogGate>
    <Routes>
      <Route path="lti/auth" element={<Suspense fallback={<Loading />}><TeacherLtiAuth /></Suspense>} />
      <Route path="thao-luan/:id/tv" element={<Suspense fallback={<Loading />}><DiscussTv /></Suspense>} />
      <Route path="dau-truong/giai/:id/tv" element={<Suspense fallback={<Loading />}><CupTv /></Suspense>} />
      <Route element={<Layout user={user} />}>
        <Route index element={<Dashboard user={user} />} />
        <Route path="bai-giang" element={<Lessons user={user} />} />
        <Route path="bai-giang/:id" element={<Suspense fallback={<Loading label="Đang mở trình soạn…" />}><LessonEditor user={user} /></Suspense>} />
        <Route path="ngan-hang" element={<Suspense fallback={<Loading />}><ItemBank /></Suspense>} />
        <Route path="giao-bai" element={<Suspense fallback={<Loading />}><Assign user={user} /></Suspense>} />
        <Route path="lop" element={<Suspense fallback={<Loading />}><Classes user={user} /></Suspense>} />
        <Route path="kien-thuc" element={<Suspense fallback={<Loading />}><KnowledgeRedirect user={user} /></Suspense>} />
        <Route path="ki-nang" element={<Suspense fallback={<Loading />}><SkillCatalog user={user} /></Suspense>} />
        <Route path="lop/:classId/ban-do-kien-thuc" element={<Suspense fallback={<Loading />}><Heatmap user={user} /></Suspense>} />
        <Route path="hoc-sinh" element={<Suspense fallback={<Loading />}><Students user={user} /></Suspense>} />
        <Route path="hoc-sinh/:studentId" element={<Suspense fallback={<Loading />}><StudentProfile user={user} /></Suspense>} />
        <Route path="truc-tiep" element={<Suspense fallback={<Loading />}><LiveStart user={user} /></Suspense>} />
        <Route path="dau-truong" element={<Suspense fallback={<Loading />}><ArenaHome user={user} /></Suspense>} />
        <Route path="dau-truong/giai/:id" element={<Suspense fallback={<Loading />}><CupDetail user={user} /></Suspense>} />
        <Route path="dau-truong/giay-khen" element={<Suspense fallback={<Loading />}><Certificates user={user} /></Suspense>} />
        <Route path="thao-luan" element={<Suspense fallback={<Loading />}><DiscussList user={user} /></Suspense>} />
        <Route path="thao-luan/:id" element={<Suspense fallback={<Loading />}><DiscussBoard user={user} /></Suspense>} />
        <Route path="truc-tiep/the-giay" element={<Suspense fallback={<Loading />}><PaperCards user={user} /></Suspense>} />
        <Route path="truc-tiep/:sessionId" element={<Suspense fallback={<Loading />}><LiveControl user={user} /></Suspense>} />
        <Route path="bai-viet" element={<Suspense fallback={<Loading />}><WorkTasks user={user} /></Suspense>} />
        <Route path="bai-viet/:taskId/chup" element={<Suspense fallback={<Loading />}><BatchUpload /></Suspense>} />
        <Route path="cham-bai" element={<Suspense fallback={<Loading />}><ReviewQueue user={user} /></Suspense>} />
        <Route path="cham-bai/:submissionId" element={<Suspense fallback={<Loading />}><ReviewScreen user={user} /></Suspense>} />
        <Route path="rubric" element={<Suspense fallback={<Loading />}><Rubrics user={user} /></Suspense>} />
        <Route path="tt27" element={<Suspense fallback={<Loading />}><Tt27 user={user} /></Suspense>} />
        <Route path="thi-dua" element={<Suspense fallback={<Loading />}><BehaviorPage user={user} /></Suspense>} />
        <Route path="vuon-lop" element={<Suspense fallback={<Loading />}><ClassGardenTeacher user={user} /></Suspense>} />
        <Route path="diem-danh" element={<Suspense fallback={<Loading />}><Attendance user={user} /></Suspense>} />
        <Route path="de-kiem-tra" element={<Suspense fallback={<Loading />}><ExamHome user={user} /></Suspense>} />
        <Route path="de-kiem-tra/ma-tran/:id" element={<Suspense fallback={<Loading />}><MatrixEditor /></Suspense>} />
        <Route path="de-kiem-tra/ra-de" element={<Suspense fallback={<Loading />}><ExamBuilder user={user} /></Suspense>} />
        <Route path="de-kiem-tra/:examId/sua" element={<Suspense fallback={<Loading />}><ExamBuilder user={user} /></Suspense>} />
        <Route path="de-kiem-tra/:examId/in" element={<Suspense fallback={<Loading />}><ExamPrint /></Suspense>} />
        <Route path="de-kiem-tra/:examId/ket-qua" element={<Suspense fallback={<Loading />}><ExamResults /></Suspense>} />
        <Route path="bao-cao" element={<Suspense fallback={<Loading />}><Reports user={user} /></Suspense>} />
        <Route path="bao-cao/ban-do-khoi" element={<Suspense fallback={<Loading />}><GradeMap user={user} /></Suspense>} />
        <Route path="phu-huynh" element={<Suspense fallback={<Loading />}><ParentLinks user={user} /></Suspense>} />
        <Route path="thi-dua/thong-ke" element={<Suspense fallback={<Loading />}><BehaviorStats user={user} /></Suspense>} />
        <Route path="bao-cao-bai-giao" element={<Suspense fallback={<Loading />}><AssignReport user={user} /></Suspense>} />
        <Route path="doi-mat-khau" element={<Suspense fallback={<Loading />}><ChangePassword /></Suspense>} />
        <Route path="trang-hoc" element={<Suspense fallback={<Loading />}><ClassPages user={user} /></Suspense>} />
        <Route path="xuat-nhap" element={<Suspense fallback={<Loading />}><BridgePage user={user} /></Suspense>} />
        <Route path="quan-tri/lop" element={user.role === 'admin' ? <Suspense fallback={<Loading />}><AdminClasses /></Suspense> : <Navigate to="/" replace />} />
        <Route path="quan-tri/tai-khoan" element={user.role === 'admin' ? <Suspense fallback={<Loading />}><AdminUsers /></Suspense> : <Navigate to="/" replace />} />
        <Route path="quan-tri/cai-dat" element={user.role === 'admin' ? <Suspense fallback={<Loading />}><AdminSettings /></Suspense> : <Navigate to="/" replace />} />
        <Route path="quan-tri/ung-dung" element={user.role === 'admin' ? <Suspense fallback={<Loading />}><ConnectApps /></Suspense> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </CatalogGate>
  );
}
