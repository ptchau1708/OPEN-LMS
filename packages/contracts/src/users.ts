import type { Grade } from './items';
import type { MascotId } from './mascots';
import type { SubjectId } from './subjects';

export type Role = 'student' | 'teacher' | 'admin' | 'parent';

export interface Profile {
  id: string;
  role: Role;
  /** Tên hiển thị, vd "Minh An". */
  name: string;
  /** Tên đăng nhập ngắn của HS (an2a1). */
  username?: string;
  grade?: Grade;
  classId?: string;
  avatarMascot: MascotId;
  avatarColor: string;
  /** Cài đặt hiển thị của HS. */
  settings?: StudentSettings;
  /** Mã học sinh ở phần mềm quản lí trường (VnEdu / mã định danh) — để ghép khi xuất, nhập Excel. */
  externalCode?: string;
  /** Đang dùng mật khẩu tạm do thầy/cô / quản trị cấp → phải đổi trước khi dùng tiếp (docs/MAT_KHAU.md). */
  mustChangePassword?: boolean;
}

export interface StudentSettings {
  /** Chữ to (mặc định bật với lớp 1–2). */
  bigText: boolean;
  /** Tự đọc to đề bài khi mở. */
  autoRead: boolean;
  sound: boolean;
  reducedMotion: boolean;
}

export interface ClassInfo {
  id: string;
  name: string;
  grade: Grade;
  teacherId: string;
  studentIds: string[];
  /** Tổ/nhóm để thi đua. */
  teams: { id: string; name: string; color: string; studentIds: string[] }[];
}

/** Nhiệm vụ trên trang "Hôm nay". */
export interface Task {
  id: string;
  kind: 'lesson' | 'practice' | 'arena' | 'package';
  title: string;
  subject: SubjectId;
  /** Mô tả ngắn: "bài giảng 8 slide", "còn 3 lượt". */
  subtitle: string;
  /** 0..1 */
  progress: number;
  isNew: boolean;
  /** lessonId / practice set id / ... */
  targetId: string;
  dueAt?: string;
  /** Lần giao tạo ra việc này (mở bài kèm ?giao=<id> để ghi kết quả theo lần giao). */
  assignmentId?: string;
  /** Quá hạn và lần giao không cho nộp muộn. */
  locked?: boolean;
}

/** Quá hạn nộp: 'allow' — vẫn làm được (ghi nhận muộn); 'lock' — khóa bài. */
export type LatePolicy = 'allow' | 'lock';

export interface Assignment {
  id: string;
  targetType: 'lesson' | 'practice' | 'package';
  targetId: string;
  title: string;
  classId: string;
  /** Rỗng = cả lớp. */
  studentIds: string[];
  openAt: string;
  dueAt?: string;
  createdBy: string;
  /** Mặc định 'allow'. */
  latePolicy?: LatePolicy;
  /** Giao lại: id lần giao ĐẦU TIÊN của chuỗi (các lượt cùng một bài). */
  parentId?: string;
  /** Lượt thứ mấy (1 = lần đầu). */
  round?: number;
}

export interface Wallet {
  userId: string;
  stars: number;
  coins: number;
  xp: number;
  level: number;
  /** Số ngày học liên tiếp. */
  streakDays: number;
}

export interface RewardEntry {
  id: string;
  userId: string;
  stars: number;
  coins: number;
  xp: number;
  reason: string;
  /** 'shop' = mua đồ trong cửa hàng trang phục (xu âm, không sao). */
  sourceType: 'item' | 'lesson' | 'live' | 'arena' | 'behavior' | 'bonus' | 'work' | 'shop';
  sourceId?: string;
  at: string;
}

export interface Passport {
  userId: string;
  unlocked: MascotId[];
  /** Linh vật đang đồng hành (hiện trên trang Hôm nay). */
  companion: MascotId;
}

export type LearningVerb = 'started' | 'viewed' | 'answered' | 'completed' | 'joined' | 'awarded';

export interface LearningEvent {
  id: string;
  userId: string;
  verb: LearningVerb;
  objectType: 'slide' | 'item' | 'lesson' | 'package' | 'live' | 'arena' | 'remediation' | 'work' | 'exam' | 'external';
  objectId: string;
  lessonId?: string;
  assignmentId?: string;
  liveSessionId?: string;
  /** Khóa chống ghi trùng (hàng đợi offline). */
  clientEventId?: string;
  /** true: HS làm khi mất mạng, đồng bộ sau (GV thấy dấu "nộp khi offline"). */
  offline?: boolean;
  /**
   * skills / misconceptions: ghi kèm lúc trả lời (verb 'answered') để tính mức thành thạo không cần đọc lại item.
   * Với objectType 'remediation' (verb 'completed'): correct = đạt (≥ 80%), score = tỉ lệ đúng, skills = [kĩ năng, gốc].
   * Với objectType 'work' (verb 'answered', ghi khi GV duyệt bài làm): objectId = 'work:<submissionId>[:sai]',
   * score = điểm/thang, weight = số "câu" tương đương (mặc định 2).
   */
  result?: {
    correct?: boolean;
    score?: number;
    durationMs?: number;
    response?: unknown;
    skills?: string[];
    misconceptions?: string[];
    /** Số câu đúng / tổng (bộ ôn tập). */
    correctCount?: number;
    total?: number;
    /** Bộ máy thành thạo tính sự kiện này như `weight` câu (bài làm viết: 2). */
    weight?: number;
    /** Mức gợi ý cao nhất HS đã xin cho lần trả lời này (1–3, docs/PHASE7_AI_HINT.md). Vắng = không dùng gợi ý. */
    hintsUsed?: number;
  };
  at: string;
}
