import type { AnyResponse, Grade, Item, ItemType, ScoreResult } from './items';
import type { ContentPackage, Course, Lesson, LessonProgress } from './lessons';
import type { LiveChannel, LiveRole, LiveSessionInfo } from './live';
import type { MascotId } from './mascots';
import type { SubjectId } from './subjects';
import type { ClassHeatmap, GapGroup, RemediationAnswer, RemediationOutcome, RemediationSet, SkillMastery } from './mastery';
import type { ParentSummary, StudentProfile } from './profile';
import type { GradeReview, Rubric, RubricFilter, StudentWorkEntry, SubmissionDetail, SubmissionFilter, SubmitWorkInput, WorkTask, WorkTaskFilter } from './assess';
import type { AttendanceRecord, Behavior, BehaviorLog, ClassLeaderboard, RecordBehaviorInput, Tt27Evaluation, Tt27Suggestion, Tt27TermId } from './engagement';
import type { Assignment, ClassInfo, LearningEvent, Passport, Profile, RewardEntry, StudentSettings, Task, Wallet } from './users';

export interface LessonFilter {
  subject?: SubjectId;
  grade?: Grade;
  ownerId?: string;
  status?: 'draft' | 'published';
  search?: string;
}

export interface ItemFilter {
  subject?: SubjectId;
  grade?: Grade;
  type?: ItemType;
  search?: string;
}

/** Kết quả cộng thưởng sau khi trả lời / hoàn thành. */
export interface AwardResult {
  wallet: Wallet;
  /** Linh vật vừa mở khóa nhờ lần cộng sao này (để app chúc mừng). */
  newlyUnlocked: MascotId[];
}

/** Kết quả nộp một câu trả lời (tự học, luyện tập, Đấu trường). */
export interface SubmitAnswerResult {
  result: ScoreResult;
  /** Sao cộng thêm (chỉ lần đúng đầu tiên với cùng item trong cùng bài). */
  starsAwarded: number;
  award?: AwardResult;
  /** true: chưa có mạng — câu trả lời đã vào hàng đợi, sẽ chấm khi đồng bộ (docs/PHASE6_OFFLINE.md). */
  pending?: boolean;
}

export interface SubmitAnswerInput {
  userId: string;
  item: Item;
  response: AnyResponse;
  context: { lessonId?: string; slideId?: string; assignmentId?: string; source?: 'lesson' | 'practice' | 'arena' };
  /** Số lần thử của HS với câu này (để thống kê). */
  attempt?: number;
  /** Khóa chống ghi trùng khi gửi lại từ hàng đợi offline (server bỏ qua lần thứ hai). */
  clientEventId?: string;
  /** Thời điểm HS trả lời thật (ISO) — giữ nguyên khi đồng bộ muộn; server kiểm tra hợp lý (≤ 14 ngày, không ở tương lai). */
  answeredAt?: string;
}

/** Xin gợi ý sau khi làm sai một câu (docs/PHASE7_AI_HINT.md). */
export interface HintInput {
  /** HS đang làm (để ghi `hintsUsed` vào sự kiện trả lời gần nhất). */
  userId?: string;
  item: Item;
  /** Câu trả lời CHƯA ĐÚNG của HS. */
  response: AnyResponse;
  /** Mức gợi ý muốn xin: 1 (đọc lại / để ý điều gì) → 2 (bước đầu / chỗ hay nhầm) → 3 (cách làm với ví dụ nhỏ hơn). */
  attempt: number;
}

/** Gợi ý không bao giờ chứa đáp án. provider 'fallback' = gợi ý theo quy tắc (không có AI, hết lượt, lỗi, hoặc bị lọc). */
export interface HintResult {
  text: string;
  provider: 'ai' | 'fallback';
  level: 1 | 2 | 3;
}

/** Tùy chọn khi hoàn thành bài từ hàng đợi offline. */
export interface CompleteLessonOptions {
  clientEventId?: string;
  completedAt?: string;
}

/**
 * Nguồn dữ liệu duy nhất mà các app dùng. Hai bản cài đặt:
 * - DemoDataSource: localStorage + nội dung mẫu, chạy không cần server.
 * - SupabaseDataSource: schema v2 trên Supabase (gói Free dùng được).
 * App lấy instance qua getDataSource() trong @openedu/data và dùng các hook React Query ở đó.
 */
export interface DataSource {
  readonly mode: 'demo' | 'supabase';

  /* ---- đăng nhập ---- */
  getCurrentUser(): Promise<Profile | null>;
  /** HS dùng tên ngắn (an2a1) hoặc email; GV dùng email. */
  signIn(username: string, password: string): Promise<Profile>;
  signOut(): Promise<void>;
  /**
   * Đăng nhập chung (docs/DANG_NHAP_CHUNG.md): chuyển phiên sang app khác (origin khác) mà không bắt gõ lại mật khẩu.
   * Trả chuỗi phiên đóng gói và BỎ phiên ở app này (không thu hồi trên máy chủ — app nhận dùng tiếp). null = chưa đăng nhập.
   */
  exportSession?(): Promise<string | null>;
  /** Nhận phiên do exportSession của app khác chuyển sang. Trả người dùng, hoặc null nếu phiên không hợp lệ. */
  importSession?(packed: string): Promise<Profile | null>;
  /** Chỉ chế độ demo: danh sách tài khoản mẫu để chọn nhanh. */
  listDemoUsers(): Promise<Profile[]>;
  updateSettings(userId: string, settings: Partial<StudentSettings>): Promise<Profile>;

  /* ---- lớp ---- */
  listClasses(teacherId?: string): Promise<ClassInfo[]>;
  getClass(classId: string): Promise<ClassInfo | null>;
  listStudents(classId: string): Promise<Profile[]>;

  /* ---- nội dung ---- */
  listLessons(filter?: LessonFilter): Promise<Lesson[]>;
  getLesson(id: string): Promise<Lesson | null>;
  saveLesson(lesson: Lesson): Promise<Lesson>;
  deleteLesson(id: string): Promise<void>;
  listItems(filter?: ItemFilter): Promise<Item[]>;
  getItem(id: string): Promise<Item | null>;
  /** Lấy nhiều item một lần (slide activity tham chiếu itemId). */
  getItems(ids: string[]): Promise<Item[]>;
  saveItem(item: Item): Promise<Item>;
  deleteItem(id: string): Promise<void>;
  listCourses(filter?: { subject?: SubjectId; grade?: Grade }): Promise<Course[]>;
  listPackages(): Promise<ContentPackage[]>;
  getPackage(id: string): Promise<ContentPackage | null>;
  savePackage(pkg: ContentPackage): Promise<ContentPackage>;

  /* ---- giao bài & học ---- */
  listAssignments(filter: { classId?: string; studentId?: string }): Promise<Assignment[]>;
  createAssignment(a: Omit<Assignment, 'id'>): Promise<Assignment>;
  getTodayTasks(userId: string): Promise<Task[]>;
  getProgress(userId: string, lessonId: string): Promise<LessonProgress | null>;
  saveProgress(p: LessonProgress): Promise<void>;
  recordEvent(e: Omit<LearningEvent, 'id' | 'at'>): Promise<void>;
  /**
   * Nộp câu trả lời. Demo: chấm bằng scoreItem trên máy, ghi sự kiện, cộng sao lần đúng đầu.
   * Supabase: gọi Edge Function `grade` — server chấm và cộng sao; máy HS không tự cộng.
   */
  submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult>;
  /**
   * Gợi ý từng bước khi HS làm sai, KHÔNG lộ đáp án. Demo: gợi ý theo quy tắc tại máy. Supabase: Edge Function
   * `ai-gateway` (task 'hint'); lỗi / mất mạng → gợi ý chung tại máy. Không bao giờ ném lỗi.
   */
  getHint(input: HintInput): Promise<HintResult>;
  /** Hoàn thành bài giảng: thưởng một lần mỗi bài (Supabase: RPC complete_lesson). */
  completeLesson(userId: string, lessonId: string, opts?: CompleteLessonOptions): Promise<AwardResult & { starsAwarded: number; pending?: boolean }>;
  listEvents(filter: { userId?: string; lessonId?: string; limit?: number }): Promise<LearningEvent[]>;

  /* ---- phần thưởng ---- */
  getWallet(userId: string): Promise<Wallet>;
  /**
   * Cộng thưởng trực tiếp. Demo: dùng tự do. Supabase: chỉ GV thưởng cho HS (RPC award_bonus);
   * app HS KHÔNG dùng hàm này cho câu trả lời — dùng submitAnswer / completeLesson.
   */
  award(entry: Omit<RewardEntry, 'id' | 'at'>): Promise<AwardResult>;
  listRewards(userId: string, limit?: number): Promise<RewardEntry[]>;
  getPassport(userId: string): Promise<Passport>;
  setCompanion(userId: string, mascot: MascotId): Promise<Passport>;

  /* ---- trực tiếp ---- */
  createLiveSession(lessonId: string, classId?: string): Promise<LiveSessionInfo>;
  findLiveSession(pin: string): Promise<LiveSessionInfo | null>;
  openLiveChannel(sessionId: string, role: LiveRole): Promise<LiveChannel>;

  /* ---- hồ sơ học sinh, thành thạo kĩ năng, lỗ hổng & ôn tập (docs/STUDENT_PROFILE_API.md) ---- */
  /** Mức thành thạo mọi kĩ năng HS đã làm ít nhất 1 câu (kĩ năng vắng = chua-hoc). */
  getSkillMastery(userId: string): Promise<SkillMastery[]>;
  /** Bản đồ nhiệt lớp × kĩ năng (mặc định môn Toán). */
  getClassHeatmap(classId: string, subject?: SubjectId): Promise<ClassHeatmap>;
  /** Nhóm HS có chung gốc lỗ hổng (≥ 2 HS), đông trước. */
  getGapGroups(classId: string, subject?: SubjectId): Promise<GapGroup[]>;
  /** Bộ ôn tập của HS: ôn lại đến hạn trước, rồi lỗ hổng mới; gồm cả lần ôn lại chưa đến hạn (dueAt tương lai). */
  getRemediationSets(userId: string): Promise<RemediationSet[]>;
  /**
   * Ghi nhận kết quả một bộ ôn tập (sau khi HS đã nộp từng câu bằng submitAnswer). Đạt (≥ 80%) → lên chặng ôn,
   * hẹn ôn lại +1/+3/+7 ngày; chưa đạt → quay lại 'can-on'. Supabase: server tự đếm đúng/sai từ learning_events.
   */
  submitRemediationResult(userId: string, setId: string, results: RemediationAnswer[]): Promise<RemediationOutcome>;
  /** Hồ sơ 360°: danh tính, lớp, ví, hộ chiếu, thành thạo, lỗ hổng, tiến độ bài, dòng thời gian, lớp trực tiếp. */
  getStudentProfile(userId: string): Promise<StudentProfile>;
  /** Tóm tắt lời lẽ đơn giản cho phụ huynh: tuần này, điểm mạnh, lỗ hổng + gợi ý ở nhà. */
  getParentSummary(childId: string): Promise<ParentSummary>;

  /* ---- Phase 4: bài làm & AI chấm (docs/PHASE4_API.md) ---- */
  listRubrics(filter?: RubricFilter): Promise<Rubric[]>;
  getRubric(id: string): Promise<Rubric | null>;
  saveRubric(r: Rubric): Promise<Rubric>;
  deleteRubric(id: string): Promise<void>;
  listWorkTasks(filter?: WorkTaskFilter): Promise<WorkTask[]>;
  getWorkTask(id: string): Promise<WorkTask | null>;
  saveWorkTask(t: WorkTask): Promise<WorkTask>;
  deleteWorkTask(id: string): Promise<void>;
  /** HS nộp hoặc GV nộp hộ. Ảnh: demo nén JPEG ≤ 1600 px (dataURL); Supabase tải lên bucket `submissions`. */
  submitWork(input: SubmitWorkInput): Promise<SubmissionDetail>;
  /** Chấm bằng AI (Supabase: Edge Function `ai-grade`; demo: chấm mẫu, hoặc OpenRouter nếu có VITE_DEMO_AI_KEY). */
  requestAiGrade(submissionId: string): Promise<SubmissionDetail>;
  listSubmissions(filter?: SubmissionFilter): Promise<SubmissionDetail[]>;
  getSubmission(id: string): Promise<SubmissionDetail | null>;
  /** GV duyệt / sửa / chấm lại / trả bài. Duyệt → ghi learning_events (kĩ năng), cộng sao 1–3. */
  reviewGrade(review: Omit<GradeReview, 'at'> & { at?: string }): Promise<SubmissionDetail>;
  /** Bài đã duyệt của HS (mới trước) — cho hồ sơ, phụ huynh. */
  getStudentWork(studentId: string): Promise<StudentWorkEntry[]>;

  /* ---- Phase 4: TT27, thi đua, điểm danh ---- */
  listTt27(filter: { classId?: string; studentId?: string; termId?: Tt27TermId; schoolYear?: string }): Promise<Tt27Evaluation[]>;
  saveTt27(e: Tt27Evaluation): Promise<Tt27Evaluation>;
  /** Bản nháp từ thành thạo, bài làm đã duyệt, thi đua (thuần; GV luôn sửa). */
  suggestTt27(studentId: string, termId: Tt27TermId): Promise<Tt27Suggestion>;
  /** Hành vi của lớp (mặc định nếu lớp chưa có danh sách riêng). */
  listBehaviors(classId: string): Promise<Behavior[]>;
  saveBehavior(b: Behavior): Promise<Behavior>;
  listBehaviorLogs(filter: { classId?: string; studentId?: string; from?: string; to?: string; limit?: number }): Promise<BehaviorLog[]>;
  /** Ghi cho 1 hoặc nhiều HS; điểm dương cộng sao (1 sao / điểm). */
  recordBehavior(input: RecordBehaviorInput): Promise<BehaviorLog[]>;
  /** Hoàn tác một lần ghi (và sao đã cộng). */
  undoBehavior(logId: string): Promise<void>;
  /** Bảng thi đua tuần (mặc định tuần hiện tại, thứ Hai → nay). */
  getClassLeaderboard(classId: string, range?: { from?: string; to?: string }): Promise<ClassLeaderboard>;
  listAttendance(classId: string, range?: { from?: string; to?: string }): Promise<AttendanceRecord[]>;
  saveAttendance(r: AttendanceRecord): Promise<AttendanceRecord>;
}
