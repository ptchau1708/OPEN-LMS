/**
 * Nội dung mẫu cho chế độ demo: tài khoản, lớp, bài giảng, ngân hàng câu hỏi, khóa học, gói HTML5, bài giao,
 * lịch sử phần thưởng. Tạo theo thời điểm `now` để chuỗi ngày học và hạn nộp luôn "mới".
 */
import { schoolYearOf, type AiGrade, type Assignment, type AttendanceRecord, type Behavior, type BehaviorLog, type ContentPackage, type Course, type GradeReview, type Item, type LearningEvent, type Lesson, type LessonProgress, type Passport, type RewardEntry, type Rubric, type Submission, type Tt27Evaluation, type WorkTask } from '@openedu/contracts';
import { mergeFinal } from '../assess';
import { suggestTt27, workEntryOf, attendanceSummary } from '../engagement';
import { computeMastery } from '../mastery';
import { buildEngagementSeed, buildWorkSeed } from './work';
import { addDays } from '../rewards';
import { TIENG_ANH_ITEMS } from './items-tieng-anh';
import { TIENG_VIET_ITEMS } from './items-tieng-viet';
import { TNXH_ITEMS } from './items-tnxh';
import { TOAN_ITEMS } from './items-toan';
import { TOAN45_ITEMS } from './items-toan45';
import { ONTHI_ITEMS } from './items-onthi';
import { LEGACY_MISCONCEPTIONS, LEGACY_SKILL_TAGS } from './skill-tags';
import { buildSynthetic4A } from './synthetic-4a';
import { buildLessons, LESSON_IDS, SAMPLE_PACKAGE_ID } from './lessons';
import { DEMO_CLASSES, DEMO_GUARDIANS, DEMO_USERS } from './users';

export { DEMO_CLASSES, DEMO_GUARDIANS, DEMO_PASSWORD, DEMO_USERS, defaultSettings } from './users';
export { LESSON_IDS, SAMPLE_PACKAGE_ID } from './lessons';
export { MASCOT_COUNTRY_EN } from './items-tieng-anh';
export { TOAN45_ITEMS } from './items-toan45';
export { ONTHI_ITEMS, ONTHI_TOAN5_ITEMS, ONTHI_TV5_ITEMS } from './items-onthi';
export { LEGACY_SKILL_TAGS } from './skill-tags';
export { PLANS_4A, correctResponse as syntheticCorrectResponse } from './synthetic-4a';
export { SEED_RUBRICS, WORK_TASK_IDS } from './work';

/** Tăng khi đổi nội dung mẫu: máy đã lưu bản cũ sẽ được tạo lại. */
export const SEED_VERSION = 4;

/** Đặt trong baseUrl; DemoDataSource thay bằng VITE_CONTENT_ORIGIN lúc đọc. */
export const CONTENT_ORIGIN_TOKEN = '{{CONTENT_ORIGIN}}';

/** Gắn `skills` (và vài quan niệm sai) cho câu hỏi cũ; câu mới đã có sẵn. */
function tagLegacy(it: Item): Item {
  const skills = it.skills ?? LEGACY_SKILL_TAGS[it.id];
  const extra = LEGACY_MISCONCEPTIONS[it.id];
  const key = extra && it.key ? { ...it.key, misconceptions: { ...((it.key as { misconceptions?: Record<string, string> }).misconceptions ?? {}), ...extra } } : it.key;
  return { ...it, ...(skills ? { skills } : {}), ...(key !== undefined ? { key } : {}) } as Item;
}

export const SEED_ITEMS: Item[] = [...TOAN_ITEMS, ...TIENG_VIET_ITEMS, ...TNXH_ITEMS, ...TIENG_ANH_ITEMS].map(tagLegacy).concat(TOAN45_ITEMS, ONTHI_ITEMS);

export interface SeedData {
  users: typeof DEMO_USERS;
  guardians: typeof DEMO_GUARDIANS;
  classes: typeof DEMO_CLASSES;
  lessons: Lesson[];
  items: Item[];
  courses: Course[];
  packages: ContentPackage[];
  assignments: Assignment[];
  progress: LessonProgress[];
  events: LearningEvent[];
  rewards: RewardEntry[];
  passports: Passport[];
  /* ---- Phase 4 ---- */
  rubrics: Rubric[];
  workTasks: WorkTask[];
  submissions: Submission[];
  aiGrades: Record<string, AiGrade>;
  gradeReviews: Record<string, GradeReview>;
  behaviors: Behavior[];
  behaviorLogs: BehaviorLog[];
  attendance: AttendanceRecord[];
  tt27: Tt27Evaluation[];
}

function at(now: Date, daysAgo: number, hour: number, minute = 0): string {
  const d = addDays(now, -daysAgo);
  d.setHours(hour, minute, 0, 0);
  // Không để thời điểm mẫu nằm sau "bây giờ".
  return (d.getTime() > now.getTime() ? new Date(now.getTime() - 60_000) : d).toISOString();
}

export function buildSeed(now: Date = new Date()): SeedData {
  const iso = now.toISOString();
  const items = SEED_ITEMS.map((it) => ({ ...it, updatedAt: iso }) as Item);
  const lessons = buildLessons(iso);

  const courses: Course[] = [
    { id: 'c-toan-2', title: 'Toán 2 — Phiêu lưu cùng Shiba', subject: 'toan', grade: 2, lessonIds: [LESSON_IDS.toan] },
    { id: 'c-tv-1', title: 'Tiếng Việt 1 — Vui học vần', subject: 'tieng-viet', grade: 1, lessonIds: [LESSON_IDS.tiengViet] },
    { id: 'c-tnxh-1', title: 'Tự nhiên và Xã hội 1 — Thế giới quanh em', subject: 'tnxh', grade: 1, lessonIds: [LESSON_IDS.tnxh] },
    { id: 'c-ta-3', title: 'Tiếng Anh 3 — Hello, friends!', subject: 'tieng-anh', grade: 3, lessonIds: [LESSON_IDS.tiengAnh] },
    { id: 'c-toan-4', title: 'Toán 4 — Phân số cùng Shiba', subject: 'toan', grade: 4, lessonIds: [LESSON_IDS.phanSo4] },
    { id: 'c-toan-5', title: 'Toán 5 — Số thập phân cùng Capi', subject: 'toan', grade: 5, lessonIds: [LESSON_IDS.soThapPhan5] },
  ];

  const packages: ContentPackage[] = [
    {
      id: SAMPLE_PACKAGE_ID,
      kind: 'html',
      title: 'Đếm táo cùng Shiba',
      baseUrl: CONTENT_ORIGIN_TOKEN,
      entry: 'samples/dem-tao/index.html',
      ownerId: 'u-colan',
      createdAt: iso,
    },
  ];

  const open = at(now, 1, 7, 30);
  const due = (days: number) => {
    const d = addDays(now, days);
    d.setHours(20, 0, 0, 0);
    return d.toISOString();
  };
  const assignments: Assignment[] = [
    { id: 'as-2a-toan', targetType: 'lesson', targetId: LESSON_IDS.toan, title: 'Phép cộng có nhớ trong phạm vi 100', classId: 'c-2a', studentIds: [], openAt: open, dueAt: due(2), createdBy: 'u-colan' },
    { id: 'as-2a-tv', targetType: 'lesson', targetId: LESSON_IDS.tiengViet, title: 'Ôn tập: Vần ang, anh', classId: 'c-2a', studentIds: [], openAt: open, dueAt: due(4), createdBy: 'u-colan' },
    { id: 'as-2a-tnxh', targetType: 'lesson', targetId: LESSON_IDS.tnxh, title: 'Con vật sống ở đâu?', classId: 'c-2a', studentIds: [], openAt: open, dueAt: due(5), createdBy: 'u-colan' },
    { id: 'as-3c-ta', targetType: 'lesson', targetId: LESSON_IDS.tiengAnh, title: 'Hello around the world', classId: 'c-3c', studentIds: [], openAt: open, dueAt: due(3), createdBy: 'u-thaynam' },
    { id: 'as-1b-tv', targetType: 'lesson', targetId: LESSON_IDS.tiengViet, title: 'Vần ang, anh', classId: 'c-1b', studentIds: [], openAt: open, dueAt: due(2), createdBy: 'u-cohoa' },
    { id: 'as-1b-tnxh', targetType: 'lesson', targetId: LESSON_IDS.tnxh, title: 'Con vật sống ở đâu?', classId: 'c-1b', studentIds: [], openAt: open, dueAt: due(4), createdBy: 'u-cohoa' },
    { id: 'as-4a-phan-so', targetType: 'lesson', targetId: LESSON_IDS.phanSo4, title: 'Phân số', classId: 'c-4a', studentIds: [], openAt: at(now, 5, 7, 30), dueAt: due(3), createdBy: 'u-cothu' },
  ];

  /* ---- lịch sử phần thưởng ---- */
  let n = 0;
  const r = (userId: string, daysAgo: number, hour: number, stars: number, reason: string, sourceType: RewardEntry['sourceType'], sourceId?: string): RewardEntry => ({
    id: `rw-seed-${++n}`,
    userId,
    stars,
    coins: stars,
    xp: stars * 10,
    reason,
    sourceType,
    ...(sourceId ? { sourceId } : {}),
    at: at(now, daysAgo, hour),
  });
  const an = 'u-an2a1';
  const toanS3 = `${LESSON_IDS.toan}-s3`;
  const rewards: RewardEntry[] = [
    // Minh An: 36 sao, 4 ngày liên tiếp → mở Nghé Tí + Shiba Mochi.
    r(an, 3, 16, 8, 'Hoàn thành bài: Ôn tập phép cộng trong phạm vi 20', 'lesson', 'l-cu-cong-20'),
    r(an, 2, 17, 6, 'Leo tháp: lên tới tầng 6', 'arena', 'leo-thap'),
    r(an, 2, 10, 3, 'Cô Lan khen: Em giúp bạn nhặt rác ở sân trường', 'behavior'),
    r(an, 1, 9, 5, 'Trả lời đúng trong lớp học trực tiếp', 'live', 'live-cu'),
    r(an, 1, 16, 7, 'Hoàn thành bài: Số có hai chữ số', 'lesson', 'l-cu-so-hai-chu-so'),
    r(an, 0, 7, 1, 'Trả lời đúng: 26 + 7 = 33', 'item', `it-toan2-que-26-7@${LESSON_IDS.toan}`),
    r(an, 0, 7, 6, 'Leo tháp: lên tới tầng 7', 'arena', 'leo-thap'),
    // Các bạn khác.
    r('u-binh2a2', 2, 16, 5, 'Hoàn thành bài: Ôn tập phép cộng trong phạm vi 20', 'lesson', 'l-cu-cong-20'),
    r('u-binh2a2', 1, 16, 7, 'Leo tháp: lên tới tầng 5', 'arena', 'leo-thap'),
    r('u-chi2a3', 3, 16, 9, 'Hoàn thành bài: Ôn tập phép cộng trong phạm vi 20', 'lesson', 'l-cu-cong-20'),
    r('u-chi2a3', 2, 16, 8, 'Hoàn thành bài: Số có hai chữ số', 'lesson', 'l-cu-so-hai-chu-so'),
    r('u-chi2a3', 1, 10, 8, 'Trả lời đúng trong lớp học trực tiếp', 'live', 'live-cu'),
    r('u-dung2a4', 1, 16, 6, 'Hoàn thành bài: Số có hai chữ số', 'lesson', 'l-cu-so-hai-chu-so'),
    r('u-dung2a4', 1, 10, 2, 'Thầy/cô khen: Em hăng hái phát biểu', 'behavior'),
    r('u-em1b1', 1, 15, 4, 'Hoàn thành bài: Làm quen với chữ cái', 'lesson', 'l-cu-chu-cai'),
    r('u-phuong3c1', 4, 16, 18, 'Hoàn thành bài: Bảng nhân 3', 'lesson', 'l-cu-nhan-3'),
    r('u-phuong3c1', 2, 16, 20, 'Hoàn thành bài: Bảng nhân 4', 'lesson', 'l-cu-nhan-4'),
    r('u-phuong3c1', 1, 16, 20, 'Leo tháp: lên tới tầng 12', 'arena', 'leo-thap'),
  ];

  const progress: LessonProgress[] = [
    {
      userId: an,
      lessonId: LESSON_IDS.toan,
      slideIndex: 3,
      completedSlides: [`${LESSON_IDS.toan}-s1`, `${LESSON_IDS.toan}-s2`, toanS3],
      answers: { [toanS3]: { correct: true, score: 1 } },
      starsEarned: 1,
      updatedAt: at(now, 0, 7, 5),
    },
  ];

  const events: LearningEvent[] = [
    { id: 'ev-seed-1', userId: an, verb: 'started', objectType: 'lesson', objectId: LESSON_IDS.toan, lessonId: LESSON_IDS.toan, assignmentId: 'as-2a-toan', at: at(now, 0, 7, 0) },
    {
      id: 'ev-seed-2',
      userId: an,
      verb: 'answered',
      objectType: 'item',
      objectId: 'it-toan2-que-26-7',
      lessonId: LESSON_IDS.toan,
      assignmentId: 'as-2a-toan',
      result: { correct: true, score: 1, durationMs: 41_000, response: { value: 33 } },
      at: at(now, 0, 7, 4),
    },
  ];

  // Lớp 4A: ~2 tuần lịch sử tổng hợp (tất định) cho hồ sơ HS, bản đồ nhiệt, lỗ hổng.
  const syn = buildSynthetic4A(items, (d, h, m = 0) => at(now, d, h, m), LESSON_IDS.phanSo4);
  events.push(...syn.events);
  rewards.push(...syn.rewards);
  progress.push(...syn.progress);

  // Phase 4: bài làm (AI chấm mẫu), thi đua, điểm danh.
  const atNow = (d: number, h: number, m = 0) => at(now, d, h, m);
  const work = buildWorkSeed(atNow);
  events.push(...work.events);
  rewards.push(...work.rewards);
  const eng = buildEngagementSeed(now, atNow, DEMO_CLASSES);
  rewards.push(...eng.rewards);
  events.sort((a, b) => a.at.localeCompare(b.at));

  // TT27 giữa học kì I (đã chốt) cho 4A và 2A, soạn bằng suggestTt27 từ dữ liệu mẫu.
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));
  const taskById = Object.fromEntries(work.tasks.map((t) => [t.id, t]));
  const tt27: Tt27Evaluation[] = [];
  for (const cls of DEMO_CLASSES.filter((c) => c.id === 'c-4a' || c.id === 'c-2a')) {
    for (const sid of cls.studentIds) {
      const student = DEMO_USERS.find((u) => u.id === sid);
      if (!student) continue;
      const works = work.submissions
        .filter((x) => x.studentId === sid && x.status === 'approved' && work.grades[x.id])
        .map((x) => workEntryOf({ ...x, task: taskById[x.taskId], taskTitle: taskById[x.taskId]?.title, grade: work.grades[x.id], review: work.reviews[x.id], final: mergeFinal(work.grades[x.id], work.reviews[x.id]) }))
        .filter((x): x is NonNullable<typeof x> => !!x);
      const sug = suggestTt27({
        student,
        classId: cls.id,
        termId: 'GK1',
        schoolYear: schoolYearOf(now),
        now,
        masteries: computeMastery(sid, events, itemMap),
        works,
        behaviorLogs: eng.logs.filter((l) => l.studentId === sid),
        attendance: attendanceSummary(eng.attendance, sid, now),
      });
      const { basis: _basis, ...evaluation } = sug;
      tt27.push({ ...evaluation, status: 'final', updatedBy: cls.teacherId, updatedAt: at(now, 2, 21) });
    }
  }

  const passports: Passport[] = [];
  return {
    users: DEMO_USERS,
    guardians: DEMO_GUARDIANS,
    classes: DEMO_CLASSES,
    lessons,
    items,
    courses,
    packages,
    assignments,
    progress,
    events,
    rewards,
    passports,
    rubrics: work.rubrics,
    workTasks: work.tasks,
    submissions: work.submissions,
    aiGrades: work.grades,
    gradeReviews: work.reviews,
    behaviors: eng.behaviors,
    behaviorLogs: eng.logs,
    attendance: eng.attendance,
    tt27,
  };
}
