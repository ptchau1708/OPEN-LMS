/**
 * Mức thành thạo kĩ năng, lỗ hổng kiến thức, bộ ôn tập — kiểu dữ liệu dùng chung (demo, Supabase, Edge Function).
 * Cách tính: packages/data/src/mastery (thuần, có kiểm thử; chép sang supabase/functions/_shared/mastery).
 */
import type { Grade } from './items';
import type { Strand } from './skills';
import type { SubjectId } from './subjects';

/** chua-hoc: chưa làm câu nào · dang-hoc: đang học/đang ôn · can-on: lỗ hổng · vung: đã vững. */
export type MasteryLevel = 'chua-hoc' | 'dang-hoc' | 'can-on' | 'vung';

export const MASTERY_LEVELS: MasteryLevel[] = ['chua-hoc', 'dang-hoc', 'can-on', 'vung'];

export const MASTERY_LEVEL_LABEL: Record<MasteryLevel, string> = {
  'chua-hoc': 'Chưa học',
  'dang-hoc': 'Đang học',
  'can-on': 'Cần ôn',
  vung: 'Vững',
};

/** Một lần làm sai gần đây (bằng chứng cho GV). */
export interface WrongEvidence {
  itemId: string;
  at: string;
  misconception?: string;
}

export type ReviewStage = 0 | 1 | 2 | 3;

export interface SkillMastery {
  userId: string;
  skillCode: string;
  level: MasteryLevel;
  /** 0..1 — tỉ lệ đúng có trọng số theo độ mới (chu kì bán rã ~10 ngày). 0 khi chưa làm. */
  p: number;
  attempts: number;
  /** Số câu đúng liên tiếp gần nhất. */
  correctStreak: number;
  /** Số ngày khác nhau có làm bài kĩ năng này. */
  distinctDays: number;
  lastAt?: string;
  /** Mã quan niệm sai → số lần mắc. */
  misconceptions: Record<string, number>;
  /** Hạn ôn lại tiếp theo (lặp lại ngắt quãng +1, +3, +7 ngày). */
  nextReviewAt?: string;
  /** 0: chưa qua bộ ôn nào · 1..3: đã qua bộ ôn / lần ôn lại thứ n. */
  reviewStage: ReviewStage;
  /** Đã từng là lỗ hổng (p < 0.6 sau ≥ 3 lần) hoặc đã vào luồng ôn tập. Khi reviewStage ≥ 1, muốn "vững" phải tới chặng 3. */
  wasGap: boolean;
  /** Tối đa 3 lần sai gần nhất. */
  recentWrong: WrongEvidence[];
}

export interface MisconceptionCount {
  code: string;
  count: number;
  /** Cho GV. */
  text: string;
  /** Cho HS. */
  kidHint: string;
}

/** Lỗ hổng kiến thức (kĩ năng ở mức can-on) kèm gốc rễ. */
export interface KnowledgeGap {
  userId: string;
  skillCode: string;
  /** Kĩ năng nền yếu nhất tìm được khi lần theo prereqs (có thể chính là skillCode). */
  rootSkill: string;
  /** Đường đi từ skillCode tới rootSkill (gồm cả hai đầu). */
  rootChain: string[];
  level: MasteryLevel;
  p: number;
  attempts: number;
  /** Càng lớn càng cần xử lí trước. */
  priority: number;
  topMisconceptions: MisconceptionCount[];
  evidence: WrongEvidence[];
}

/** Bộ ôn tập ngắn (3–5 câu) cho một lỗ hổng, hoặc lần ôn lại theo lịch. */
export interface RemediationSet {
  /** Ổn định: rem:<userId>:<skillCode>:<reviewStage>. */
  id: string;
  userId: string;
  kind: 'remediation' | 'review';
  skillCode: string;
  rootSkill: string;
  subject: SubjectId;
  /** Cho HS, vd "Ôn lại: Quy đồng mẫu số". */
  title: string;
  /** Cho phụ huynh/GV: vì sao có bộ này. */
  reason: string;
  /** 3–5 id câu hỏi: rootSkill trước, rồi kĩ năng lỗ hổng; dễ trước khó sau. */
  itemIds: string[];
  reviewStage: ReviewStage;
  /** ISO; ≤ bây giờ = đến hạn. */
  dueAt: string;
  /** Ước lượng số phút. */
  minutes: number;
}

export interface RemediationAnswer {
  itemId: string;
  correct: boolean;
}

export interface RemediationOutcome {
  setId: string;
  skillCode: string;
  passed: boolean;
  correct: number;
  total: number;
  /** Mức thành thạo sau khi ghi nhận. */
  mastery: SkillMastery;
  /** Lời nhắn cho HS. */
  message: string;
  /** true: làm khi mất mạng — kết quả sẽ được ghi nhận khi đồng bộ (passed / mastery chưa phải số liệu cuối). */
  pending?: boolean;
}

/* ---------------- lớp học ---------------- */
export interface HeatmapCell {
  level: MasteryLevel;
  p: number;
  attempts: number;
  /** Quan niệm sai hay gặp nhất (nếu có). */
  topMisconception?: string;
}

export interface HeatmapSkill {
  code: string;
  short: string;
  topic: string;
  strand: Strand;
  grade: Grade;
  provisional?: boolean;
}

export interface ClassHeatmap {
  classId: string;
  subject: SubjectId;
  grade: Grade;
  generatedAt: string;
  students: { id: string; name: string; avatarMascot: string; avatarColor: string }[];
  /** Kĩ năng của khối lớp + kĩ năng nền trực tiếp + kĩ năng lớp khác đã có HS làm. */
  skills: HeatmapSkill[];
  /** cells[studentId][skillCode]; ô vắng = chua-hoc. */
  cells: Record<string, Record<string, HeatmapCell>>;
  /** Tổng hợp theo kĩ năng: số HS ở mỗi mức, p trung bình (null nếu chưa ai làm). */
  skillSummary: Record<string, { counts: Record<MasteryLevel, number>; avgP: number | null }>;
}

/** Nhóm nhỏ HS có chung gốc lỗ hổng — gợi ý GV dạy lại theo nhóm. */
export interface GapGroup {
  id: string;
  rootSkill: string;
  rootShort: string;
  /** Các kĩ năng lỗ hổng (biểu hiện) của nhóm. */
  gapSkills: string[];
  students: { id: string; name: string; p: number }[];
  topMisconceptions: MisconceptionCount[];
  /** Gợi ý cho GV. */
  suggestion: string;
  /** Câu hỏi gợi ý cho nhóm (rootSkill trước). */
  itemIds: string[];
}
