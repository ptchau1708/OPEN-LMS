/**
 * Danh mục kĩ năng (yêu cầu cần đạt) — nguồn sự thật cho gắn thẻ câu hỏi, tính mức thành thạo, tìm lỗ hổng kiến thức.
 *
 * - Toán lớp 1–5: CT GDPT 2018, mỗi gạch đầu dòng "Yêu cầu cần đạt" là một kĩ năng (skills-toan.ts).
 * - Môn khác: kĩ năng TẠM (provisional) sinh từ ngân hàng câu hỏi mẫu (skills-provisional.ts)
 *   + kĩ năng theo chủ đề CT GDPT 2018, tóm lược yêu cầu cần đạt (skills-ct2018.ts, mạch 'CHU-DE').
 * - Quan niệm sai: skills-misconceptions.ts.
 *
 * Mã: <Môn><lớp>.<chủ đề>.<slug>, vd 'T4.PS.RUT-GON' (T = Toán), 'TV1.TAM.XEP-CAU' (tạm).
 */
import type { Grade } from './items';
import { MISCONCEPTION_LIST } from './skills-misconceptions';
import { CT2018_SKILLS } from './skills-ct2018';
import { PROVISIONAL_SKILLS } from './skills-provisional';
import { TOAN_SKILLS } from './skills-toan';
import type { SubjectId } from './subjects';

/** Mạch kiến thức. TAM-THOI: kĩ năng tạm sinh từ câu hỏi mẫu. CHU-DE: theo chủ đề CT GDPT 2018 (môn ngoài Toán). */
export type Strand = 'SO-PHEP-TINH' | 'HINH-DO-LUONG' | 'THONG-KE-XAC-SUAT' | 'TAM-THOI' | 'CHU-DE';

export const STRAND_LABEL: Record<Strand, string> = {
  'SO-PHEP-TINH': 'Số và phép tính',
  'HINH-DO-LUONG': 'Hình học và đo lường',
  'THONG-KE-XAC-SUAT': 'Một số yếu tố thống kê và xác suất',
  'TAM-THOI': 'Tạm thời',
  'CHU-DE': 'Theo chủ đề CT 2018',
};

export interface Skill {
  /** 'T4.PS.RUT-GON' */
  code: string;
  subject: SubjectId;
  grade: Grade;
  strand: Strand;
  /** Nội dung, vd 'Phân số'. */
  topic: string;
  /** Yêu cầu cần đạt (nguyên văn CT GDPT 2018; với kĩ năng tạm là mô tả gốc). */
  text: string;
  /** Tên ngắn ≤ 6 từ cho HS / phụ huynh, vd 'Rút gọn phân số'. */
  short: string;
  /** Mã kĩ năng nền (phải học trước). Không có chu trình (có kiểm thử). */
  prereqs: string[];
  /** true = kĩ năng tạm, chờ danh mục chính thức. */
  provisional?: boolean;
}

export interface Misconception {
  code: string;
  /** Mô tả cho GV. */
  text: string;
  /** Lời nhắc cho HS. */
  kidHint: string;
  /** Kĩ năng nơi lỗi lộ ra. */
  skill: string;
  /** Kĩ năng nền thường là nguyên nhân (nếu có). */
  rootSkill?: string;
}

export const SKILLS: Skill[] = [...TOAN_SKILLS, ...PROVISIONAL_SKILLS, ...CT2018_SKILLS];

export const SKILL_BY_CODE: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.code, s]));

export const MISCONCEPTIONS: Record<string, Misconception> = Object.fromEntries(MISCONCEPTION_LIST.map((m) => [m.code, m]));

/** Kĩ năng của một môn, một lớp (theo thứ tự chương trình). */
export function skillsFor(subject: SubjectId, grade: Grade): Skill[] {
  return SKILLS.filter((s) => s.subject === subject && s.grade === grade);
}

/**
 * Mọi kĩ năng nền (trực tiếp và gián tiếp) của `code`, gần nhất trước (duyệt theo chiều rộng).
 * Không gồm chính `code`. Mã lạ → [].
 */
export function prereqClosure(code: string, catalog: Record<string, Skill> = SKILL_BY_CODE): string[] {
  const out: string[] = [];
  const seen = new Set<string>([code]);
  let frontier = catalog[code]?.prereqs ?? [];
  while (frontier.length) {
    const next: string[] = [];
    for (const c of frontier) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      next.push(...(catalog[c]?.prereqs ?? []));
    }
    frontier = next;
  }
  return out;
}

/** Tên ngắn của kĩ năng (mã lạ → chính mã). */
export function skillShort(code: string): string {
  return SKILL_BY_CODE[code]?.short ?? code;
}
