/**
 * Hồ sơ học sinh 360° và bản tóm tắt cho phụ huynh — kiểu dữ liệu trả về của DataSource.getStudentProfile /
 * getParentSummary. Lắp ráp ở packages/data/src/profile.ts (thuần) từ dữ liệu thô của demo hoặc RPC Supabase.
 */
import type { KnowledgeGap, MasteryLevel, RemediationSet } from './mastery';
import type { Grade } from './items';
import type { Passport, Profile, Wallet } from './users';
import type { SubjectId } from './subjects';
import type { StudentWorkSummary, Tt27Level } from './assess';
import type { AttendanceSummary, BehaviorSummary, Tt27Evaluation } from './engagement';

export interface SubjectMasterySummary {
  subject: SubjectId;
  counts: Record<MasteryLevel, number>;
  /** Số kĩ năng trong danh mục của môn ở khối lớp HS (để tính "chưa học"). */
  total: number;
}

export interface LessonProgressSummary {
  assignmentId?: string;
  lessonId: string;
  title: string;
  subject: SubjectId;
  status: 'chua-bat-dau' | 'dang-hoc' | 'hoan-thanh';
  /** 0..1 */
  progress: number;
  starsEarned: number;
  dueAt?: string;
  completedAt?: string;
}

export type TimelineKind = 'lesson' | 'practice' | 'arena' | 'live' | 'reward' | 'remediation' | 'work' | 'behavior';

export interface TimelineEntry {
  at: string;
  kind: TimelineKind;
  /** Câu ngắn tiếng Việt, vd "Hoàn thành bài: Phân số". */
  title: string;
  detail?: string;
  stars?: number;
  /** id bài / item / phiên… */
  refId?: string;
  /** Em làm khi mất mạng, kết quả đồng bộ sau (GV thấy nhãn "làm khi mất mạng"). */
  offline?: boolean;
}

export interface LiveParticipation {
  sessions: number;
  answered: number;
  correct: number;
  lastAt?: string;
}

/** (Cũ) ghi chú mô-đun chưa xây — từ Phase 4 luôn rỗng. */
export interface PendingModules {
  behavior: string;
  attendance: string;
  tt27: string;
}

export interface StudentProfile {
  generatedAt: string;
  student: Profile;
  class: {
    id: string;
    name: string;
    grade: Grade;
    teacherId: string;
    teacherName?: string;
    team?: { id: string; name: string; color: string };
  } | null;
  wallet: Wallet;
  passport: Passport;
  mastery: {
    bySubject: SubjectMasterySummary[];
    /** Tổng mọi môn. */
    counts: Record<MasteryLevel, number>;
  };
  /** Tối đa 5 lỗ hổng, ưu tiên cao trước. */
  gaps: KnowledgeGap[];
  /** Tối đa 5 kĩ năng 'vung', p cao trước. */
  strengths: { skillCode: string; short: string; p: number }[];
  lessons: LessonProgressSummary[];
  /** Mới nhất trước, tối đa 30 mục. */
  timeline: TimelineEntry[];
  live: LiveParticipation;
  /** Bộ ôn tập (đến hạn trước). */
  remediation: RemediationSet[];
  /** Bài làm viết (AI chấm, GV duyệt) — chỉ bài đã duyệt. */
  work: StudentWorkSummary;
  /** Thi đua / nề nếp; null nếu lớp chưa ghi lần nào. */
  behavior: BehaviorSummary | null;
  /** Chuyên cần; null nếu chưa có điểm danh. */
  attendance: AttendanceSummary | null;
  /** Đánh giá TT27 mới nhất (HS/phụ huynh: chỉ bản 'final'; GV thấy cả nháp). null nếu chưa có. */
  tt27: Tt27Evaluation | null;
  /** @deprecated luôn {} */
  pendingModules: Partial<PendingModules>;
}

export interface ParentGapNote {
  skillCode: string;
  rootSkill: string;
  /** Câu dễ hiểu, vd "Con đang chưa chắc phần quy đồng mẫu số…". */
  sentence: string;
  /** 1–3 gợi ý ở nhà, ngắn, thực tế, không thuật ngữ. */
  suggestions: string[];
}

export interface ParentSummary {
  childId: string;
  childName: string;
  generatedAt: string;
  /** Một câu mở đầu. */
  headline: string;
  /** Các câu tóm tắt dễ hiểu (tuần này, điểm mạnh, điều cần quan tâm). */
  sentences: string[];
  week: {
    from: string;
    to: string;
    daysActive: number;
    answered: number;
    /** 0..1, null nếu chưa làm câu nào. */
    correctRate: number | null;
    stars: number;
    lessonsCompleted: number;
  };
  gaps: ParentGapNote[];
  /** Tên ngắn các kĩ năng con đã vững. */
  strengths: string[];
  /** Bài làm viết mới nhất đã duyệt: một câu + một gợi ý ở nhà. */
  work: { title: string; level: Tt27Level; sentence: string; tip: string; at: string } | null;
}
