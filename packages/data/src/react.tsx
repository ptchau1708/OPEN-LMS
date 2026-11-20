/**
 * Lớp React: DataProvider (QueryClient + nguồn dữ liệu) và các hook React Query dùng chung cho mọi app.
 * Khóa truy vấn gom ở `qk` để invalidate nhất quán.
 */
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  Assignment,
  ContentPackage,
  DataSource,
  Grade,
  HintInput,
  Item,
  ItemFilter,
  LearningEvent,
  Lesson,
  LessonFilter,
  LessonProgress,
  LiveChannel,
  LiveParticipant,
  LiveResponse,
  LiveRole,
  LiveState,
  MascotId,
  Profile,
  RemediationAnswer,
  RewardEntry,
  StudentSettings,
  SubjectId,
  SubmitAnswerInput,
  AttendanceRecord,
  Behavior,
  GradeReview,
  RecordBehaviorInput,
  Rubric,
  RubricFilter,
  SubmissionFilter,
  SubmitWorkInput,
  Tt27Evaluation,
  Tt27TermId,
  WorkTask,
  WorkTaskFilter,
} from '@openedu/contracts';
import { getDataSource, listChildren } from './getDataSource';
import { isStatusful, type ChannelStatus } from './live/types';

/* ================= Provider ================= */
const DataContext = createContext<DataSource | null>(null);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // networkMode 'always': React Query không tự "tạm dừng" khi navigator.onLine = false —
      // DataSource (OfflineAwareDataSource) tự trả bản lưu / xếp hàng ghi (docs/PHASE6_OFFLINE.md).
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false, networkMode: 'always' },
      mutations: { retry: 0, networkMode: 'always' },
    },
  });
}

export interface DataProviderProps {
  children: ReactNode;
  /** Mặc định getDataSource(). */
  dataSource?: DataSource;
  queryClient?: QueryClient;
}

export function DataProvider({ children, dataSource, queryClient }: DataProviderProps) {
  const ds = useMemo(() => dataSource ?? getDataSource(), [dataSource]);
  const [qc] = useState(() => queryClient ?? createQueryClient());
  return (
    <DataContext.Provider value={ds}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </DataContext.Provider>
  );
}

/** Nguồn dữ liệu hiện tại (ngoài DataProvider thì dùng getDataSource()). */
export function useDataSource(): DataSource {
  return useContext(DataContext) ?? getDataSource();
}

/* ================= khóa truy vấn ================= */
export const qk = {
  me: ['me'] as const,
  demoUsers: ['demoUsers'] as const,
  children: (parentId?: string) => ['children', parentId] as const,
  classes: (teacherId?: string) => ['classes', teacherId ?? null] as const,
  class: (id?: string) => ['class', id] as const,
  students: (classId?: string) => ['students', classId] as const,
  lessons: (f?: LessonFilter) => ['lessons', f ?? {}] as const,
  lesson: (id?: string) => ['lesson', id] as const,
  items: (f?: ItemFilter) => ['items', f ?? {}] as const,
  itemsByIds: (ids: string[]) => ['itemsByIds', [...ids].sort()] as const,
  courses: (f?: { subject?: SubjectId; grade?: Grade }) => ['courses', f ?? {}] as const,
  packages: ['packages'] as const,
  package: (id?: string) => ['package', id] as const,
  assignments: (f: { classId?: string; studentId?: string }) => ['assignments', f] as const,
  todayTasks: (userId?: string) => ['todayTasks', userId] as const,
  progress: (userId?: string, lessonId?: string) => ['progress', userId, lessonId] as const,
  events: (f: { userId?: string; lessonId?: string; limit?: number }) => ['events', f] as const,
  wallet: (userId?: string) => ['wallet', userId] as const,
  rewards: (userId?: string, limit?: number) => ['rewards', userId, limit ?? null] as const,
  passport: (userId?: string) => ['passport', userId] as const,
  skillMastery: (userId?: string) => ['skillMastery', userId] as const,
  classHeatmap: (classId?: string, subject?: SubjectId) => ['classHeatmap', classId, subject ?? 'toan'] as const,
  gapGroups: (classId?: string, subject?: SubjectId) => ['gapGroups', classId, subject ?? 'toan'] as const,
  remediationSets: (userId?: string) => ['remediationSets', userId] as const,
  studentProfile: (userId?: string) => ['studentProfile', userId] as const,
  parentSummary: (childId?: string) => ['parentSummary', childId] as const,
  /* Phase 4 */
  rubrics: (f?: RubricFilter) => ['rubrics', f ?? {}] as const,
  rubric: (id?: string) => ['rubric', id] as const,
  workTasks: (f?: WorkTaskFilter) => ['workTasks', f ?? {}] as const,
  workTask: (id?: string) => ['workTask', id] as const,
  submissions: (f?: SubmissionFilter) => ['submissions', f ?? {}] as const,
  submission: (id?: string) => ['submission', id] as const,
  studentWork: (studentId?: string) => ['studentWork', studentId] as const,
  tt27: (f: { classId?: string; studentId?: string; termId?: Tt27TermId; schoolYear?: string }) => ['tt27', f] as const,
  behaviors: (classId?: string) => ['behaviors', classId] as const,
  behaviorLogs: (f: { classId?: string; studentId?: string; from?: string; to?: string; limit?: number }) => ['behaviorLogs', f] as const,
  leaderboard: (classId?: string, range?: { from?: string; to?: string }) => ['leaderboard', classId, range ?? {}] as const,
  attendance: (classId?: string, range?: { from?: string; to?: string }) => ['attendance', classId, range ?? {}] as const,
};

/* ================= đăng nhập ================= */
export function useCurrentUser() {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.me, queryFn: () => ds.getCurrentUser() });
}

export function useSignIn() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { username: string; password: string }) => ds.signIn(v.username, v.password),
    onSuccess: (p) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      qc.setQueryData(qk.me, p);
    },
  });
}

export function useSignOut() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ds.signOut(),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(qk.me, null);
    },
  });
}

export function useDemoUsers() {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.demoUsers, queryFn: () => ds.listDemoUsers(), staleTime: Infinity });
}

export function useUpdateSettings() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; settings: Partial<StudentSettings> }) => ds.updateSettings(v.userId, v.settings),
    onSuccess: (p) => {
      const me = qc.getQueryData<Profile | null>(qk.me);
      if (me && me.id === p.id) qc.setQueryData(qk.me, p);
      void qc.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

/** Ngoài hợp đồng: các con của phụ huynh (chế độ phụ huynh). */
export function useChildren(parentId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.children(parentId), queryFn: () => listChildren(ds, parentId as string), enabled: !!parentId });
}

/* ================= lớp ================= */
export function useClasses(teacherId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.classes(teacherId), queryFn: () => ds.listClasses(teacherId) });
}

export function useClass(classId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.class(classId), queryFn: () => ds.getClass(classId as string), enabled: !!classId });
}

export function useStudents(classId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.students(classId), queryFn: () => ds.listStudents(classId as string), enabled: !!classId });
}

/* ================= nội dung ================= */
export function useLessons(filter?: LessonFilter) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.lessons(filter), queryFn: () => ds.listLessons(filter) });
}

export function useLesson(id?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.lesson(id), queryFn: () => ds.getLesson(id as string), enabled: !!id });
}

export function useSaveLesson() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (l: Lesson) => ds.saveLesson(l),
    onSuccess: (l) => {
      qc.setQueryData(qk.lesson(l.id), l);
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      void qc.invalidateQueries({ queryKey: ['todayTasks'] });
    },
  });
}

export function useDeleteLesson() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ds.deleteLesson(id),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: qk.lesson(id) });
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      void qc.invalidateQueries({ queryKey: ['courses'] });
      void qc.invalidateQueries({ queryKey: ['todayTasks'] });
    },
  });
}

export function useItems(filter?: ItemFilter) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.items(filter), queryFn: () => ds.listItems(filter) });
}

/** Nhiều item theo id, trả về dạng { [id]: Item } — đúng kiểu `items` mà lesson-player cần. */
export function useItemsByIds(ids: string[] | undefined) {
  const ds = useDataSource();
  const list = (ids ?? []).filter(Boolean);
  return useQuery({
    queryKey: qk.itemsByIds(list),
    queryFn: async () => {
      const items = await ds.getItems(list);
      const map: Record<string, Item> = {};
      for (const it of items) map[it.id] = it;
      return map;
    },
    enabled: list.length > 0,
  });
}

/** id item của các slide hoạt động trong bài (kể cả câu hỏi chen trong video). */
export function lessonItemIds(lesson: Lesson | null | undefined): string[] {
  if (!lesson) return [];
  const ids = new Set<string>();
  for (const s of lesson.slides) {
    if (s.itemId) ids.add(s.itemId);
    for (const q of s.video?.questions ?? []) ids.add(q.itemId);
  }
  return [...ids];
}

export function useSaveItem() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (it: Item) => ds.saveItem(it),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items'] });
      void qc.invalidateQueries({ queryKey: ['itemsByIds'] });
    },
  });
}

export function useDeleteItem() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ds.deleteItem(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items'] });
      void qc.invalidateQueries({ queryKey: ['itemsByIds'] });
    },
  });
}

export function useCourses(filter?: { subject?: SubjectId; grade?: Grade }) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.courses(filter), queryFn: () => ds.listCourses(filter) });
}

export function usePackages() {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.packages, queryFn: () => ds.listPackages() });
}

export function usePackage(id?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.package(id), queryFn: () => ds.getPackage(id as string), enabled: !!id });
}

export function useSavePackage() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: ContentPackage) => ds.savePackage(p),
    onSuccess: (p) => {
      qc.setQueryData(qk.package(p.id), p);
      void qc.invalidateQueries({ queryKey: qk.packages });
    },
  });
}

/* ================= giao bài & học ================= */
export function useAssignments(filter: { classId?: string; studentId?: string }) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.assignments(filter), queryFn: () => ds.listAssignments(filter), enabled: !!(filter.classId || filter.studentId) });
}

export function useCreateAssignment() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Omit<Assignment, 'id'>) => ds.createAssignment(a),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments'] });
      void qc.invalidateQueries({ queryKey: ['todayTasks'] });
    },
  });
}

export function useTodayTasks(userId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.todayTasks(userId), queryFn: () => ds.getTodayTasks(userId as string), enabled: !!userId });
}

export function useProgress(userId?: string, lessonId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.progress(userId, lessonId), queryFn: () => ds.getProgress(userId as string, lessonId as string), enabled: !!userId && !!lessonId });
}

export function useSaveProgress() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: LessonProgress) => ds.saveProgress(p),
    onSuccess: (_v, p) => {
      void qc.invalidateQueries({ queryKey: qk.progress(p.userId, p.lessonId) });
      void qc.invalidateQueries({ queryKey: qk.todayTasks(p.userId) });
    },
  });
}

export function useRecordEvent() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (e: Omit<LearningEvent, 'id' | 'at'>) => ds.recordEvent(e),
    onSuccess: (_v, e) => {
      if (e.verb === 'started' || e.verb === 'viewed' || e.verb === 'completed') void qc.invalidateQueries({ queryKey: qk.todayTasks(e.userId) });
      void qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useEvents(filter: { userId?: string; lessonId?: string; limit?: number }) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.events(filter), queryFn: () => ds.listEvents(filter) });
}

function invalidateLearner(qc: ReturnType<typeof useQueryClient>, userId: string, lessonId?: string) {
  void qc.invalidateQueries({ queryKey: qk.wallet(userId) });
  void qc.invalidateQueries({ queryKey: qk.passport(userId) });
  void qc.invalidateQueries({ queryKey: ['rewards', userId] });
  void qc.invalidateQueries({ queryKey: qk.todayTasks(userId) });
  void qc.invalidateQueries({ queryKey: lessonId ? qk.progress(userId, lessonId) : ['progress', userId] });
  invalidateMastery(qc, userId);
}

/** Mức thành thạo / ôn tập / hồ sơ của HS và tổng hợp lớp tính lại sau mỗi câu trả lời. */
function invalidateMastery(qc: ReturnType<typeof useQueryClient>, userId: string) {
  void qc.invalidateQueries({ queryKey: qk.skillMastery(userId) });
  void qc.invalidateQueries({ queryKey: qk.remediationSets(userId) });
  void qc.invalidateQueries({ queryKey: qk.studentProfile(userId) });
  void qc.invalidateQueries({ queryKey: qk.parentSummary(userId) });
  void qc.invalidateQueries({ queryKey: ['classHeatmap'] });
  void qc.invalidateQueries({ queryKey: ['gapGroups'] });
}

/** Nộp câu trả lời (tự học / luyện tập / Leo tháp). Kết quả: { result, starsAwarded, award? }. */
export function useSubmitAnswer() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitAnswerInput) => ds.submitAnswer(input),
    onSuccess: (_r, input) => invalidateLearner(qc, input.userId, input.context.lessonId),
  });
}

/** Xin gợi ý khi làm sai (không lộ đáp án; không bao giờ lỗi — luôn có gợi ý dự phòng). */
export function useHint() {
  const ds = useDataSource();
  return useMutation({ mutationFn: (input: HintInput) => ds.getHint(input) });
}

export function useCompleteLesson() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; lessonId: string }) => ds.completeLesson(v.userId, v.lessonId),
    onSuccess: (_r, v) => invalidateLearner(qc, v.userId, v.lessonId),
  });
}

/* ================= phần thưởng ================= */
export function useWallet(userId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.wallet(userId), queryFn: () => ds.getWallet(userId as string), enabled: !!userId });
}

/** Cộng thưởng trực tiếp (GV thưởng sao). Ở chế độ Supabase chỉ GV dùng được. */
export function useAward() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (e: Omit<RewardEntry, 'id' | 'at'>) => ds.award(e),
    onSuccess: (r, e) => {
      qc.setQueryData(qk.wallet(e.userId), r.wallet);
      invalidateLearner(qc, e.userId);
    },
  });
}

export function useRewards(userId?: string, limit?: number) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.rewards(userId, limit), queryFn: () => ds.listRewards(userId as string, limit), enabled: !!userId });
}

export function usePassport(userId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.passport(userId), queryFn: () => ds.getPassport(userId as string), enabled: !!userId });
}

export function useSetCompanion() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; mascot: MascotId }) => ds.setCompanion(v.userId, v.mascot),
    onSuccess: (p) => qc.setQueryData(qk.passport(p.userId), p),
  });
}

/* ================= hồ sơ học sinh, thành thạo, lỗ hổng, ôn tập ================= */
/** Mức thành thạo các kĩ năng HS đã làm (SkillMastery[]). Xem docs/STUDENT_PROFILE_API.md. */
export function useSkillMastery(userId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.skillMastery(userId), queryFn: () => ds.getSkillMastery(userId as string), enabled: !!userId });
}

/** Bản đồ nhiệt HS × kĩ năng của lớp (GV). */
export function useClassHeatmap(classId?: string, subject?: SubjectId) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.classHeatmap(classId, subject), queryFn: () => ds.getClassHeatmap(classId as string, subject), enabled: !!classId });
}

/** Nhóm nhỏ HS chung gốc lỗ hổng (GV). */
export function useGapGroups(classId?: string, subject?: SubjectId) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.gapGroups(classId, subject), queryFn: () => ds.getGapGroups(classId as string, subject), enabled: !!classId });
}

/** Bộ ôn tập của HS (đến hạn trước). */
export function useRemediationSets(userId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.remediationSets(userId), queryFn: () => ds.getRemediationSets(userId as string), enabled: !!userId });
}

/** Nộp kết quả bộ ôn tập (sau khi đã nộp từng câu bằng useSubmitAnswer). Kết quả: RemediationOutcome. */
export function useSubmitRemediation() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; setId: string; results: RemediationAnswer[] }) => ds.submitRemediationResult(v.userId, v.setId, v.results),
    onSuccess: (_r, v) => {
      invalidateMastery(qc, v.userId);
      void qc.invalidateQueries({ queryKey: qk.todayTasks(v.userId) });
    },
  });
}

/** Hồ sơ 360° của HS (GV, phụ huynh, chính HS). */
export function useStudentProfile(userId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.studentProfile(userId), queryFn: () => ds.getStudentProfile(userId as string), enabled: !!userId });
}

/** Tóm tắt dễ hiểu cho phụ huynh. */
export function useParentSummary(childId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.parentSummary(childId), queryFn: () => ds.getParentSummary(childId as string), enabled: !!childId });
}

/* ================= Phase 4: bài làm & AI chấm (docs/PHASE4_API.md) ================= */
type QC = ReturnType<typeof useQueryClient>;

/** Hồ sơ / phụ huynh / ví của nhiều HS (sau thi đua, điểm danh, duyệt bài). */
function invalidateStudents(qc: QC, studentIds?: string[]) {
  if (!studentIds) {
    for (const k of ['wallet', 'rewards', 'passport', 'studentProfile', 'parentSummary']) void qc.invalidateQueries({ queryKey: [k] });
    return;
  }
  for (const id of studentIds) {
    void qc.invalidateQueries({ queryKey: qk.wallet(id) });
    void qc.invalidateQueries({ queryKey: ['rewards', id] });
    void qc.invalidateQueries({ queryKey: qk.passport(id) });
    void qc.invalidateQueries({ queryKey: qk.studentProfile(id) });
    void qc.invalidateQueries({ queryKey: qk.parentSummary(id) });
  }
}

export function useRubrics(filter?: RubricFilter) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.rubrics(filter), queryFn: () => ds.listRubrics(filter) });
}

export function useRubric(id?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.rubric(id), queryFn: () => ds.getRubric(id as string), enabled: !!id });
}

export function useSaveRubric() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: Rubric) => ds.saveRubric(r),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['rubrics'] });
      qc.setQueryData(qk.rubric(r.id), r);
    },
  });
}

export function useDeleteRubric() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => ds.deleteRubric(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['rubrics'] }) });
}

export function useWorkTasks(filter?: WorkTaskFilter) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.workTasks(filter), queryFn: () => ds.listWorkTasks(filter) });
}

export function useWorkTask(id?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.workTask(id), queryFn: () => ds.getWorkTask(id as string), enabled: !!id });
}

export function useSaveWorkTask() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: WorkTask) => ds.saveWorkTask(t),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: ['workTasks'] });
      qc.setQueryData(qk.workTask(t.id), t);
    },
  });
}

export function useDeleteWorkTask() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ds.deleteWorkTask(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workTasks'] });
      void qc.invalidateQueries({ queryKey: ['submissions'] });
    },
  });
}

/** Danh sách bài nộp (kèm điểm AI / duyệt nếu người xem được phép thấy). */
export function useSubmissions(filter?: SubmissionFilter, opts: { refetchInterval?: number } = {}) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.submissions(filter), queryFn: () => ds.listSubmissions(filter), ...(opts.refetchInterval ? { refetchInterval: opts.refetchInterval } : {}) });
}

export function useSubmission(id?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.submission(id), queryFn: () => ds.getSubmission(id as string), enabled: !!id });
}

export function useSubmitWork() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitWorkInput) => ds.submitWork(input),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['submissions'] });
      qc.setQueryData(qk.submission(d.id), d);
      void qc.invalidateQueries({ queryKey: qk.studentProfile(d.studentId) });
    },
  });
}

export function useRequestAiGrade() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (submissionId: string) => ds.requestAiGrade(submissionId),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['submissions'] });
      qc.setQueryData(qk.submission(d.id), d);
    },
    onError: (_e, id) => {
      void qc.invalidateQueries({ queryKey: ['submissions'] });
      void qc.invalidateQueries({ queryKey: qk.submission(id) });
    },
  });
}

/** GV duyệt / sửa / chấm lại / trả bài. Duyệt → thành thạo, sao, hồ sơ, phụ huynh được làm mới. */
export function useReviewGrade() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (review: Omit<GradeReview, 'at'> & { at?: string }) => ds.reviewGrade(review),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['submissions'] });
      qc.setQueryData(qk.submission(d.id), d);
      void qc.invalidateQueries({ queryKey: qk.studentWork(d.studentId) });
      invalidateLearner(qc, d.studentId);
    },
  });
}

export function useStudentWork(studentId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.studentWork(studentId), queryFn: () => ds.getStudentWork(studentId as string), enabled: !!studentId });
}

/* ================= Phase 4: TT27, thi đua, điểm danh ================= */
export function useTt27(filter: { classId?: string; studentId?: string; termId?: Tt27TermId; schoolYear?: string }, enabled = true) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.tt27(filter), queryFn: () => ds.listTt27(filter), enabled: enabled && !!(filter.classId || filter.studentId) });
}

export function useSaveTt27() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (e: Tt27Evaluation) => ds.saveTt27(e),
    onSuccess: (e) => {
      void qc.invalidateQueries({ queryKey: ['tt27'] });
      void qc.invalidateQueries({ queryKey: qk.studentProfile(e.studentId) });
    },
  });
}

/** Soạn nháp TT27 (mutation: GV bấm "Gợi ý nhận xét"). */
export function useSuggestTt27() {
  const ds = useDataSource();
  return useMutation({ mutationFn: (v: { studentId: string; termId: Tt27TermId }) => ds.suggestTt27(v.studentId, v.termId) });
}

export function useBehaviors(classId?: string) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.behaviors(classId), queryFn: () => ds.listBehaviors(classId as string), enabled: !!classId });
}

export function useSaveBehavior() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Behavior) => ds.saveBehavior(b), onSuccess: (b) => void qc.invalidateQueries({ queryKey: qk.behaviors(b.classId) }) });
}

export function useBehaviorLogs(filter: { classId?: string; studentId?: string; from?: string; to?: string; limit?: number }) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.behaviorLogs(filter), queryFn: () => ds.listBehaviorLogs(filter), enabled: !!(filter.classId || filter.studentId) });
}

function invalidateBehavior(qc: QC, studentIds?: string[]) {
  void qc.invalidateQueries({ queryKey: ['behaviorLogs'] });
  void qc.invalidateQueries({ queryKey: ['leaderboard'] });
  invalidateStudents(qc, studentIds);
}

export function useRecordBehavior() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: RecordBehaviorInput) => ds.recordBehavior(input), onSuccess: (_l, input) => invalidateBehavior(qc, input.studentIds) });
}

export function useUndoBehavior() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (logId: string) => ds.undoBehavior(logId), onSuccess: () => invalidateBehavior(qc) });
}

/** Bảng thi đua (mặc định tuần này). Lớp 1–3: `mode: 'team'`. */
export function useClassLeaderboard(classId?: string, range?: { from?: string; to?: string }) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.leaderboard(classId, range), queryFn: () => ds.getClassLeaderboard(classId as string, range), enabled: !!classId });
}

export function useAttendance(classId?: string, range?: { from?: string; to?: string }) {
  const ds = useDataSource();
  return useQuery({ queryKey: qk.attendance(classId, range), queryFn: () => ds.listAttendance(classId as string, range), enabled: !!classId });
}

export function useSaveAttendance() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: AttendanceRecord) => ds.saveAttendance(r),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['attendance', r.classId] });
      invalidateStudents(qc, Object.keys(r.entries));
    },
  });
}

/* ================= trực tiếp ================= */
export function useCreateLiveSession() {
  const ds = useDataSource();
  return useMutation({ mutationFn: (v: { lessonId: string; classId?: string }) => ds.createLiveSession(v.lessonId, v.classId) });
}

/** Tìm lớp theo mã 6 số (bấm "Vào lớp"). Kết quả null = không có lớp với mã này. */
export function useFindLiveSession() {
  const ds = useDataSource();
  return useMutation({ mutationFn: (pin: string) => ds.findLiveSession(pin) });
}

export interface LiveChannelView {
  channel: LiveChannel | null;
  state: LiveState | null;
  /** Câu trả lời của slide hiện tại. */
  responses: LiveResponse[];
  /** HS đang kết nối. */
  participants: LiveParticipant[];
  status: ChannelStatus;
  error: string | null;
}

/** Mở kênh trực tiếp khi có sessionId; tự đóng khi đổi phiên / rời màn hình. */
export function useLiveChannel(sessionId: string | null | undefined, role: LiveRole): LiveChannelView {
  const ds = useDataSource();
  const [view, setView] = useState<LiveChannelView>({ channel: null, state: null, responses: [], participants: [], status: sessionId ? 'connecting' : 'closed', error: null });

  useEffect(() => {
    if (!sessionId) {
      setView({ channel: null, state: null, responses: [], participants: [], status: 'closed', error: null });
      return;
    }
    let cancelled = false;
    let ch: LiveChannel | null = null;
    const offs: (() => void)[] = [];
    setView((v) => ({ ...v, channel: null, state: null, responses: [], status: 'connecting', error: null }));

    ds.openLiveChannel(sessionId, role)
      .then((c) => {
        if (cancelled) {
          c.close();
          return;
        }
        ch = c;
        const snapshot = (): Partial<LiveChannelView> => {
          const s = c.getState();
          return { state: s, responses: s ? c.responses(s.slideIndex) : [] };
        };
        const statusful = isStatusful(c);
        const first = c.getState();
        setView({
          channel: c,
          state: first,
          responses: first ? c.responses(first.slideIndex) : [],
          participants: statusful ? c.online() : c.getState()?.participants ?? [],
          status: statusful ? c.status : 'open',
          error: statusful ? c.error : null,
        });
        if (statusful) offs.push(c.onStatus((status, error) => setView((v) => ({ ...v, status, error }))));
        offs.push(
          c.subscribe((m) => {
            if (m.kind === 'presence') setView((v) => ({ ...v, participants: m.participants }));
            else
              setView((v) => ({
                ...v,
                ...snapshot(),
                ...(!statusful && m.kind === 'state' ? { participants: m.state.participants } : {}),
              }));
          }),
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setView((v) => ({ ...v, status: 'error', error: e instanceof Error ? e.message : 'Không kết nối được lớp học trực tiếp.' }));
      });

    return () => {
      cancelled = true;
      for (const off of offs) off();
      ch?.close();
    };
  }, [ds, sessionId, role]);

  return view;
}
