/**
 * Nội dung mẫu Phase 4: 4 rubric + 4 bài làm (WorkTask), bài nộp của lớp 4A (đánh máy + ảnh viết tay mẫu) ở
 * nhiều trạng thái, thi đua (4A, 2A), điểm danh 2 tuần (4A, 2A).
 * Điểm của bài mẫu do bộ chấm mẫu (assess/mockGrader) tính lúc nạp — cùng mã với lúc GV bấm "Chấm" trong demo.
 */
import type {
  AiGrade,
  AttendanceRecord,
  AttendanceStatus,
  Behavior,
  BehaviorLog,
  ClassInfo,
  GradeReview,
  LearningEvent,
  RewardEntry,
  Rubric,
  Submission,
  WorkImage,
  WorkTask,
} from '@openedu/contracts';
import { approvalEvents, approvalReward, mergeFinal, SAMPLE_RUBRIC_IDS, mockGrade, statusAfterGrade } from '../assess';
import { defaultBehaviors } from '../engagement';
import { vnDayKey } from '../mastery';
import imgToan4Hai from './work-images/toan4-hai.png';
import imgToan4Khoa from './work-images/toan4-khoa.png';
import imgToan4Nam from './work-images/toan4-nam.png';
import imgTv4Lan from './work-images/tv4-lan.png';
import imgTv4Tuan from './work-images/tv4-tuan.png';
import sizes from './work-images/sizes.json';

type At = (daysAgo: number, hour: number, minute?: number) => string;

export const WORK_TASK_IDS = {
  toan4: 'wt-4a-tong-hieu',
  toan5: 'wt-4a-chuyen-dong',
  tv4: 'wt-4a-ta-con-vat',
  tv3: 'wt-3c-viec-tot',
} as const;

function img(url: string, key: keyof typeof sizes): WorkImage {
  return { url, width: sizes[key].width, height: sizes[key].height };
}

export const SEED_RUBRICS: Rubric[] = [
  {
    id: SAMPLE_RUBRIC_IDS.toan4TongHieu,
    title: 'Giải bài toán có lời văn (tổng – hiệu)',
    subject: 'toan',
    grade: 4,
    maxScore: 10,
    skills: ['T4.GQ.BA-BUOC', 'T4.PT.CONG-TRU'],
    criteria: [
      { id: 'phuong-phap', name: 'Nhận ra dạng toán, cách giải', description: 'Nhận ra bài toán tìm hai số khi biết tổng và hiệu; dùng (tổng + hiệu) : 2 hoặc (tổng − hiệu) : 2, hoặc vẽ sơ đồ đoạn thẳng.', points: 3, skills: ['T4.GQ.BA-BUOC'] },
      { id: 'tinh-toan', name: 'Tính đúng', description: 'Tính đúng số lớn (57) và số bé (39).', points: 4, skills: ['T4.PT.CONG-TRU'] },
      { id: 'loi-giai', name: 'Câu lời giải, đơn vị', description: 'Mỗi phép tính có câu lời giải phù hợp; ghi đơn vị "cây".', points: 2 },
      { id: 'dap-so', name: 'Đáp số, thử lại', description: 'Ghi đáp số đầy đủ cho hai lớp; khuyến khích thử lại (57 + 39 = 96).', points: 1 },
    ],
    modelAnswer: 'Số cây lớp 4A trồng được là: (96 + 18) : 2 = 57 (cây)\nSố cây lớp 4B trồng được là: 57 − 18 = 39 (cây)\nĐáp số: Lớp 4A: 57 cây; Lớp 4B: 39 cây.',
    aiNotes: 'Chấp nhận cách tìm số bé trước: (96 − 18) : 2 = 39, rồi 39 + 18 = 57. Chấp nhận sơ đồ đoạn thẳng thay câu lời giải đầu.',
    ownerId: 'u-cothu',
  },
  {
    id: SAMPLE_RUBRIC_IDS.toan5ChuyenDong,
    title: 'Bài toán chuyển động đều (tìm vận tốc)',
    subject: 'toan',
    grade: 5,
    maxScore: 10,
    skills: ['T5.DL.CHUYEN-DONG', 'T5.DL.VAN-TOC', 'T5.STPPT.CHIA'],
    criteria: [
      { id: 'thoi-gian', name: 'Tính thời gian đi', description: '10 giờ − 7 giờ 30 phút = 2 giờ 30 phút = 2,5 giờ.', points: 3 },
      { id: 'cong-thuc', name: 'Công thức vận tốc', description: 'Vận tốc = quãng đường : thời gian.', points: 3 },
      { id: 'ket-qua', name: 'Kết quả, đơn vị', description: '120 : 2,5 = 48 (km/giờ).', points: 2 },
      { id: 'trinh-bay', name: 'Trình bày', description: 'Có câu lời giải và đáp số.', points: 2 },
    ],
    modelAnswer: 'Thời gian ô tô đi là: 10 giờ − 7 giờ 30 phút = 2 giờ 30 phút = 2,5 giờ\nVận tốc của ô tô là: 120 : 2,5 = 48 (km/giờ)\nĐáp số: 48 km/giờ.',
    aiNotes: 'Chấp nhận đổi ra phút: 120 : 150 = 0,8 km/phút = 48 km/giờ.',
    ownerId: 'u-cothu',
  },
  {
    id: SAMPLE_RUBRIC_IDS.tv4TaConVat,
    title: 'Viết đoạn văn tả con vật em yêu thích',
    subject: 'tieng-viet',
    grade: 4,
    maxScore: 10,
    skills: ['TV4.TAM.VIET-DOAN-TA', 'TV4.TAM.TU-GOI-TA-SO-SANH', 'TV4.TAM.CHINH-TA-DOAN'],
    criteria: [
      { id: 'bo-cuc', name: 'Bố cục đoạn văn', description: 'Có câu mở đoạn giới thiệu con vật và câu kết nêu tình cảm.', points: 2 },
      {
        id: 'ngoai-hinh',
        name: 'Tả ngoại hình',
        description: 'Tả được các đặc điểm nổi bật (bộ lông, đôi mắt, tai, đuôi…).',
        points: 3,
        levels: [
          { label: 'Tốt', points: 3, descriptor: 'Từ 4 chi tiết trở lên, có chọn lọc.' },
          { label: 'Đạt', points: 2, descriptor: '2–3 chi tiết.' },
          { label: 'Cần cố gắng', points: 1, descriptor: '1 chi tiết hoặc kể chung chung.' },
        ],
      },
      { id: 'hoat-dong', name: 'Tả hoạt động, thói quen', description: 'Tả được hoạt động, thói quen của con vật.', points: 2 },
      { id: 'tu-ngu', name: 'Từ ngữ gợi tả, so sánh, cảm xúc', description: 'Dùng từ ngữ gợi tả, hình ảnh so sánh; bộc lộ tình cảm.', points: 2, skills: ['TV4.TAM.TU-GOI-TA-SO-SANH'] },
      { id: 'chinh-ta', name: 'Chính tả, câu', description: 'Viết hoa đầu câu, dùng dấu câu đúng, ít lỗi chính tả.', points: 1, skills: ['TV4.TAM.CHINH-TA-DOAN'] },
    ],
    modelAnswer: 'Nhà bà em có nuôi một chú gà trống. Chú có bộ lông óng ánh như được thoa dầu, cái mào đỏ chót như bông hoa mào gà. Sáng nào chú cũng gáy “ò ó o” đánh thức cả xóm. Em rất yêu chú gà trống của bà.',
    aiNotes: 'Lớp 4: đoạn văn khoảng 6–10 câu. Không trừ điểm vì chọn con vật khác; khen ý riêng, chân thật.',
    ownerId: 'u-cothu',
  },
  {
    id: SAMPLE_RUBRIC_IDS.tv3ViecTot,
    title: 'Viết 3–4 câu kể về một việc tốt em đã làm',
    subject: 'tieng-viet',
    grade: 3,
    maxScore: 10,
    skills: ['TV3.TAM.VIET-CAU-KE', 'TV3.TAM.VIET-HOA-DAU-CAU'],
    criteria: [
      { id: 'so-cau', name: 'Đủ 3–4 câu', description: 'Viết 3–4 câu liền mạch.', points: 2 },
      { id: 'noi-dung', name: 'Kể rõ việc tốt', description: 'Kể được: việc gì, khi nào / ở đâu, giúp ai.', points: 4 },
      { id: 'cam-nghi', name: 'Cảm nghĩ', description: 'Nêu cảm nghĩ của em.', points: 2 },
      { id: 'chinh-ta', name: 'Viết hoa, dấu câu', description: 'Viết hoa đầu câu, có dấu chấm cuối câu.', points: 2, skills: ['TV3.TAM.VIET-HOA-DAU-CAU'] },
    ],
    aiNotes: 'Lớp 3: chấp nhận câu đơn giản. Khen mọi việc tốt dù nhỏ.',
    ownerId: 'u-thaynam',
  },
];

export function buildWorkSeed(at: At) {
  const tasks: WorkTask[] = [
    {
      id: WORK_TASK_IDS.toan4,
      title: 'Giải bài toán: Hai lớp trồng cây',
      prompt: { text: 'Hai lớp 4A và 4B trồng được tất cả 96 cây. Lớp 4A trồng được nhiều hơn lớp 4B 18 cây. Hỏi mỗi lớp trồng được bao nhiêu cây?' },
      subject: 'toan',
      grade: 4,
      rubricId: SAMPLE_RUBRIC_IDS.toan4TongHieu,
      classId: 'c-4a',
      studentIds: [],
      dueAt: at(-2, 20),
      allowPhoto: true,
      allowText: true,
      createdBy: 'u-cothu',
      createdAt: at(4, 7, 30),
    },
    {
      id: WORK_TASK_IDS.tv4,
      title: 'Viết đoạn văn tả con vật em yêu thích',
      prompt: { text: 'Em hãy viết một đoạn văn (6–10 câu) tả một con vật nuôi trong nhà mà em yêu thích.' },
      subject: 'tieng-viet',
      grade: 4,
      rubricId: SAMPLE_RUBRIC_IDS.tv4TaConVat,
      classId: 'c-4a',
      studentIds: [],
      dueAt: at(-3, 20),
      allowPhoto: true,
      allowText: true,
      createdBy: 'u-cothu',
      createdAt: at(5, 7, 30),
    },
    {
      id: WORK_TASK_IDS.toan5,
      title: 'Thử sức lớp 5: Bài toán chuyển động đều',
      prompt: { text: 'Một ô tô đi từ A lúc 7 giờ 30 phút và đến B lúc 10 giờ. Quãng đường AB dài 120 km. Tính vận tốc của ô tô.' },
      subject: 'toan',
      grade: 5,
      rubricId: SAMPLE_RUBRIC_IDS.toan5ChuyenDong,
      classId: 'c-4a',
      studentIds: ['u-hai4a1', 'u-mai4a4'],
      dueAt: at(-5, 20),
      allowPhoto: true,
      allowText: true,
      createdBy: 'u-cothu',
      createdAt: at(6, 7, 30),
    },
    {
      id: WORK_TASK_IDS.tv3,
      title: 'Kể về một việc tốt em đã làm',
      prompt: { text: 'Em hãy viết 3–4 câu kể về một việc tốt em đã làm ở nhà hoặc ở trường.' },
      subject: 'tieng-viet',
      grade: 3,
      rubricId: SAMPLE_RUBRIC_IDS.tv3ViecTot,
      classId: 'c-3c',
      studentIds: [],
      dueAt: at(-2, 20),
      allowPhoto: true,
      allowText: true,
      createdBy: 'u-thaynam',
      createdAt: at(4, 7, 30),
    },
  ];

  type Plan = {
    id: string;
    task: string;
    student: string;
    text?: string;
    images?: WorkImage[];
    by?: 'teacher';
    /** Trạng thái đích. */
    state: 'submitted' | 'graded' | 'approved' | 'edited';
    day: number;
    edit?: GradeReview['final'];
    note?: string;
  };
  const plans: Plan[] = [
    { id: 'sub-toan4-hai', task: WORK_TASK_IDS.toan4, student: 'u-hai4a1', images: [img(imgToan4Hai, 'toan4-hai')], by: 'teacher', state: 'approved', day: 3 },
    {
      id: 'sub-toan4-lan',
      task: WORK_TASK_IDS.toan4,
      student: 'u-lan4a2',
      text: 'Bài giải\nSố cây lớp 4A trồng được là:\n(96 + 18) : 2 = 57 (cây)\nSố cây lớp 4B trồng được là:\n96 - 57 = 39 (cây)\nĐáp số: Lớp 4A: 57 cây; lớp 4B: 39 cây.',
      state: 'approved',
      day: 3,
    },
    { id: 'sub-toan4-khoa', task: WORK_TASK_IDS.toan4, student: 'u-khoa4a3', images: [img(imgToan4Khoa, 'toan4-khoa')], by: 'teacher', state: 'graded', day: 2 },
    { id: 'sub-toan4-nam', task: WORK_TASK_IDS.toan4, student: 'u-nam4a7', images: [img(imgToan4Nam, 'toan4-nam')], state: 'graded', day: 1 },
    {
      id: 'sub-toan4-vy',
      task: WORK_TASK_IDS.toan4,
      student: 'u-vy4a6',
      text: 'Lớp 4A trồng được là: (96 - 18) : 2 = 39 (cây)\nLớp 4B trồng được là: 39 - 18 = 21 (cây)\nĐáp số: 39 cây và 21 cây',
      state: 'submitted',
      day: 0,
    },
    { id: 'sub-tv4-lan', task: WORK_TASK_IDS.tv4, student: 'u-lan4a2', images: [img(imgTv4Lan, 'tv4-lan')], state: 'approved', day: 2 },
    {
      id: 'sub-tv4-mai',
      task: WORK_TASK_IDS.tv4,
      student: 'u-mai4a4',
      text: 'Em có một chú thỏ trắng tên là Bông. Bộ lông của Bông trắng muốt, mềm như bông gòn. Đôi mắt đỏ hồng long lanh như hai viên ngọc. Hai cái tai dài luôn vểnh lên nghe ngóng. Mỗi sáng, Bông nhảy tung tăng quanh vườn rồi gặm cà rốt rất ngon lành. Khi em đi học về, Bông chạy ra đón em. Em rất yêu quý Bông vì nó là người bạn nhỏ đáng yêu của em.',
      state: 'approved',
      day: 2,
    },
    { id: 'sub-tv4-tuan', task: WORK_TASK_IDS.tv4, student: 'u-tuan4a5', images: [img(imgTv4Tuan, 'tv4-tuan')], by: 'teacher', state: 'graded', day: 1 },
    {
      id: 'sub-tv4-hai',
      task: WORK_TASK_IDS.tv4,
      student: 'u-hai4a1',
      text: 'Nhà em nuôi một chú chó tên là Mực. Mực có bộ lông đen nhánh, mượt như nhung. Đôi tai nhỏ luôn dựng đứng, cái mũi ướt lúc nào cũng hít hít. Cái đuôi dài vẫy rối rít mỗi khi em về. Mực canh nhà rất giỏi, hễ có người lạ là sủa vang. Em rất quý Mực.',
      state: 'graded',
      day: 1,
    },
    { id: 'sub-tv4-thao', task: WORK_TASK_IDS.tv4, student: 'u-thao4a8', text: 'Nhà em có con mèo. Con mèo màu vàng. Nó hay nằm ngủ. em thích con mèo', state: 'submitted', day: 0 },
    {
      id: 'sub-toan5-hai',
      task: WORK_TASK_IDS.toan5,
      student: 'u-hai4a1',
      text: 'Bài giải\nThời gian ô tô đi là:\n10 giờ - 7 giờ 30 phút = 2 giờ 30 phút = 2,5 giờ\nVận tốc của ô tô là:\n120 : 2,5 = 48 (km/giờ)\nĐáp số: 48 km/giờ.',
      state: 'approved',
      day: 4,
    },
    {
      id: 'sub-toan5-mai',
      task: WORK_TASK_IDS.toan5,
      student: 'u-mai4a4',
      text: 'Bài giải\nThời gian ô tô đi là:\n10 giờ - 7 giờ 30 phút = 2 giờ 30 phút = 2,3 giờ\nVận tốc của ô tô là:\n120 : 2,3 = 52,17 (km/giờ)\nĐáp số: 52,17 km/giờ',
      state: 'edited',
      day: 4,
      edit: {
        feedbackStudent: 'Em nhớ đúng công thức vận tốc và trình bày rất gọn gàng. Em nhớ 30 phút là nửa giờ, tức 0,5 giờ, rồi tính lại nhé!',
      },
      note: 'Thầy/cô sửa lời nhắn cho em ngắn gọn hơn.',
    },
    {
      id: 'sub-tv3-phuong',
      task: WORK_TASK_IDS.tv3,
      student: 'u-phuong3c1',
      text: 'Chiều chủ nhật, em giúp bà tưới rau ở vườn. Em xách từng bình nước nhỏ và tưới thật đều. Bà khen em ngoan và chăm chỉ. Em thấy rất vui vì đã giúp được bà.',
      state: 'approved',
      day: 3,
    },
  ];

  const submissions: Submission[] = [];
  const grades: Record<string, AiGrade> = {};
  const reviews: Record<string, GradeReview> = {};
  const events: LearningEvent[] = [];
  const rewards: RewardEntry[] = [];
  const rubricById = Object.fromEntries(SEED_RUBRICS.map((r) => [r.id, r]));
  const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  for (const p of plans) {
    const task = taskById[p.task];
    const rubric = rubricById[task.rubricId];
    const createdAt = at(p.day, 19, 10);
    const images = p.images ?? [];
    const sub: Submission = {
      id: p.id,
      taskId: task.id,
      studentId: p.student,
      classId: task.classId,
      kind: images.length && p.text ? 'mixed' : images.length ? 'photo' : 'text',
      ...(p.text ? { text: p.text } : {}),
      images,
      submittedBy: p.by ?? 'student',
      ...(p.by ? { submitterId: task.createdBy } : {}),
      status: 'submitted',
      createdAt,
      updatedAt: createdAt,
    };
    if (p.state !== 'submitted') {
      const gradedAt = at(p.day, 19, 12);
      const g = mockGrade({ task, rubric, submission: sub, now: gradedAt });
      grades[sub.id] = g;
      sub.status = statusAfterGrade(g);
      sub.updatedAt = gradedAt;
      if (p.state === 'approved' || p.state === 'edited') {
        const reviewAt = at(Math.max(0, p.day - 1), 20, 30);
        const review: GradeReview = {
          submissionId: sub.id,
          teacherId: task.createdBy,
          decision: p.state === 'edited' ? 'edited' : 'approved',
          ...(p.edit ? { final: p.edit } : {}),
          ...(p.note ? { note: p.note } : {}),
          at: reviewAt,
        };
        reviews[sub.id] = review;
        sub.status = 'approved';
        sub.updatedAt = reviewAt;
        const final = mergeFinal(g, review, rubric);
        approvalEvents({ submissionId: sub.id, studentId: sub.studentId, taskId: task.id, taskTitle: task.title, rubric, grade: g, final }).forEach((e, i) =>
          events.push({ ...e, id: `ev-work-${sub.id}-${i}`, at: reviewAt }),
        );
        rewards.push({ ...approvalReward({ submissionId: sub.id, studentId: sub.studentId, taskTitle: task.title, level: final.level }), id: `rw-work-${sub.id}`, at: reviewAt });
      }
    }
    submissions.push(sub);
  }
  return { rubrics: SEED_RUBRICS, tasks, submissions, grades, reviews, events, rewards };
}

/* ======================= thi đua & điểm danh ======================= */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Hồ sơ nề nếp mỗi HS: tỉ lệ khen / nhắc (tất định). */
const BEHAVIOR_PROFILE: Record<string, { pos: number; neg: number; favorite: string[]; weak?: string[] }> = {
  'u-hai4a1': { pos: 0.7, neg: 0.03, favorite: ['bh-phat-bieu', 'bh-giup-ban', 'bh-hoan-thanh'] },
  'u-lan4a2': { pos: 0.5, neg: 0.05, favorite: ['bh-vo-sach', 'bh-trat-tu'] },
  'u-khoa4a3': { pos: 0.35, neg: 0.2, favorite: ['bh-phat-bieu'], weak: ['bh-quen-do', 'bh-noi-chuyen'] },
  'u-mai4a4': { pos: 0.55, neg: 0.03, favorite: ['bh-giup-ban', 'bh-hoan-thanh'] },
  'u-tuan4a5': { pos: 0.4, neg: 0.12, favorite: ['bh-hoan-thanh'], weak: ['bh-chua-lam-bai'] },
  'u-vy4a6': { pos: 0.45, neg: 0.05, favorite: ['bh-trat-tu', 'bh-vo-sach'] },
  'u-nam4a7': { pos: 0.25, neg: 0.18, favorite: ['bh-trung-thuc'], weak: ['bh-noi-chuyen', 'bh-quen-do'] },
  'u-thao4a8': { pos: 0.3, neg: 0.08, favorite: ['bh-trat-tu'], weak: ['bh-quen-do'] },
  'u-an2a1': { pos: 0.6, neg: 0.05, favorite: ['bh-giup-ban', 'bh-phat-bieu'] },
  'u-binh2a2': { pos: 0.4, neg: 0.1, favorite: ['bh-phat-bieu'], weak: ['bh-noi-chuyen'] },
  'u-chi2a3': { pos: 0.65, neg: 0.02, favorite: ['bh-vo-sach', 'bh-hoan-thanh'] },
  'u-dung2a4': { pos: 0.45, neg: 0.12, favorite: ['bh-phat-bieu'], weak: ['bh-quen-do'] },
};

/** Ngày học (thứ Hai–thứ Sáu) trong `days` ngày gần nhất, giờ Việt Nam, cũ trước. */
function schoolDays(now: Date, days: number): { key: string; daysAgo: number }[] {
  const out: { key: string; daysAgo: number }[] = [];
  for (let d = days; d >= 0; d--) {
    const key = vnDayKey(new Date(now.getTime() - d * 86_400_000).toISOString());
    const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
    if (dow >= 1 && dow <= 5) out.push({ key, daysAgo: d });
  }
  return out;
}

export function buildEngagementSeed(now: Date, at: At, classes: ClassInfo[]) {
  const behaviors: Behavior[] = [];
  const logs: BehaviorLog[] = [];
  // Lịch sử thi đua mẫu không kèm sao (ví mẫu giữ nguyên); ghi mới qua recordBehavior thì cộng sao.
  const rewards: RewardEntry[] = [];
  const attendance: AttendanceRecord[] = [];
  const days = schoolDays(now, 14);
  for (const cls of classes.filter((c) => c.id === 'c-4a' || c.id === 'c-2a')) {
    const list = defaultBehaviors(cls.id);
    behaviors.push(...list);
    const label = Object.fromEntries(list.map((b) => [b.id, b]));
    const teamOf = new Map<string, string>();
    for (const t of cls.teams) for (const s of t.studentIds) teamOf.set(s, t.id);
    for (const sid of cls.studentIds) {
      const prof = BEHAVIOR_PROFILE[sid];
      if (!prof) continue;
      const r = lcg(sid.length * 7919 + sid.charCodeAt(2) * 31 + sid.charCodeAt(4));
      for (const d of days) {
        const add = (bid: string, minute: number) => {
          const b = label[bid];
          const id = `bl-${sid}-${d.key}-${bid}`;
          const atIso = at(d.daysAgo, 9 + (minute % 3), (minute * 7) % 60);
          logs.push({ id, studentId: sid, classId: cls.id, behaviorId: bid, points: b.points, ...(teamOf.get(sid) ? { teamId: teamOf.get(sid) } : {}), at: atIso, by: cls.teacherId });
        };
        if (r() < prof.pos) add(prof.favorite[Math.floor(r() * prof.favorite.length)], 1);
        if (prof.weak && r() < prof.neg) add(prof.weak[Math.floor(r() * prof.weak.length)], 2);
      }
    }
    // Điểm danh: hôm nay chưa điểm danh nếu chưa tới 8 giờ sáng.
    for (const d of days) {
      if (d.daysAgo === 0 && now.getHours() < 8) continue;
      const entries: Record<string, AttendanceStatus> = {};
      for (const sid of cls.studentIds) {
        const r = lcg(sid.charCodeAt(2) * 131 + Number(d.key.slice(-2)) * 17 + sid.length)();
        const lateProne = sid === 'u-nam4a7' || sid === 'u-dung2a4';
        entries[sid] = r < 0.03 ? 'vang-co-phep' : lateProne && r < 0.16 ? 'muon' : sid === 'u-nam4a7' && r > 0.95 ? 'vang-khong-phep' : 'co-mat';
      }
      attendance.push({ classId: cls.id, date: d.key, entries });
    }
  }
  return { behaviors, logs, rewards, attendance };
}
