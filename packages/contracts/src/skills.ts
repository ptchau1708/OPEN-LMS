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
  /** Danh mục mở (SQL 19): kĩ năng do thầy/cô thêm. */
  custom?: boolean;
  /** Đã ẩn khỏi danh mục (vẫn đọc được lịch sử). */
  hidden?: boolean;
  /** Kĩ năng gốc đã được thầy/cô sửa chữ (khôi phục được). */
  edited?: boolean;
  /** Người thêm (kĩ năng tự thêm). */
  ownerId?: string;
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

/** Danh mục gốc trong mã (không đổi) — để khôi phục khi thầy/cô sửa. */
const BUILTIN_SKILLS: readonly Skill[] = [...TOAN_SKILLS, ...PROVISIONAL_SKILLS, ...CT2018_SKILLS];
const BUILTIN_BY_CODE: Readonly<Record<string, Skill>> = Object.fromEntries(BUILTIN_SKILLS.map((s) => [s.code, s]));

/**
 * Danh mục kĩ năng ĐANG DÙNG (không gồm kĩ năng đã ẩn). Mảng được cập nhật tại chỗ bởi `applySkillOverrides`
 * khi tải phần thầy/cô đã sửa / thêm / ẩn (danh mục mở, SQL 19) — mọi nơi import SKILLS đều thấy bản mới.
 */
export const SKILLS: Skill[] = [...BUILTIN_SKILLS];

/** Tra cứu theo mã — gồm cả kĩ năng đã ẩn (để đọc lịch sử). */
export const SKILL_BY_CODE: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.code, s]));

/** Phần thầy/cô sửa / thêm / ẩn của một kĩ năng (hàng v2.skills có custom / hidden / edit_*). */
export interface SkillOverride {
  code: string;
  /** Kĩ năng tự thêm: đủ các trường. Kĩ năng gốc: chỉ các trường đã sửa. */
  subject?: SubjectId;
  grade?: Grade;
  topic?: string;
  text?: string;
  short?: string;
  custom?: boolean;
  hidden?: boolean;
  ownerId?: string;
  /** Chữ đã sửa của kĩ năng gốc. */
  editTopic?: string;
  editText?: string;
  editShort?: string;
}

/** Bản gốc trong mã của một kĩ năng (undefined = kĩ năng tự thêm hoặc mã lạ). */
export function builtinSkill(code: string): Skill | undefined {
  return BUILTIN_BY_CODE[code];
}

/** Mọi kĩ năng kể cả đã ẩn (cho trang quản lí danh mục). */
export function allSkills(): Skill[] {
  return Object.values(SKILL_BY_CODE);
}

/**
 * Áp phần thầy/cô đã sửa lên danh mục gốc, cập nhật TẠI CHỖ `SKILLS` (đang dùng) và `SKILL_BY_CODE` (tất cả).
 * Gọi lại với danh sách mới thì tính lại từ bản gốc (không cộng dồn).
 */
export function applySkillOverrides(rows: readonly SkillOverride[]): void {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const out: Skill[] = [];
  for (const b of BUILTIN_SKILLS) {
    const o = byCode.get(b.code);
    if (!o) { out.push(b); continue; }
    const edited = !!(o.editTopic || o.editText || o.editShort);
    out.push({
      ...b,
      ...(o.editTopic ? { topic: o.editTopic } : {}),
      ...(o.editText ? { text: o.editText } : {}),
      ...(o.editShort ? { short: o.editShort } : {}),
      ...(edited ? { edited: true } : {}),
      ...(o.hidden ? { hidden: true } : {}),
    });
    byCode.delete(b.code);
  }
  for (const o of byCode.values()) {
    if (!o.custom || !o.subject || !o.grade || !o.text || !o.short) continue;
    out.push({
      code: o.code, subject: o.subject, grade: o.grade, strand: 'CHU-DE', topic: o.topic || 'Do thầy/cô thêm',
      text: o.text, short: o.short, prereqs: [], provisional: true, custom: true,
      ...(o.hidden ? { hidden: true } : {}), ...(o.ownerId ? { ownerId: o.ownerId } : {}),
    });
  }
  for (const k of Object.keys(SKILL_BY_CODE)) delete SKILL_BY_CODE[k];
  for (const s of out) SKILL_BY_CODE[s.code] = s;
  SKILLS.length = 0;
  SKILLS.push(...out.filter((s) => !s.hidden));
}

/** Mã cho kĩ năng tự thêm: <MÔN><lớp>.GV.<SLUG>, vd 'KH4.GV.TIET-KIEM-NUOC'; trùng thì thêm -2, -3… */
export function customSkillCode(subject: SubjectId, grade: Grade, short: string, taken: (code: string) => boolean = (c) => !!SKILL_BY_CODE[c]): string {
  const PFX: Partial<Record<SubjectId, string>> = {
    toan: 'T', 'tieng-viet': 'TV', 'tieng-anh': 'TA', 'dao-duc': 'DD', tnxh: 'TNXH', 'lich-su-dia-li': 'LSDL', 'khoa-hoc': 'KH',
    'tin-hoc': 'TH', 'cong-nghe': 'CN', gdtc: 'GDTC', 'am-nhac': 'AN', 'mi-thuat': 'MT', hdtn: 'HDTN', 'tieng-dan-toc': 'TDT', khac: 'K',
  };
  const slug = short.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'KI-NANG';
  const base = `${PFX[subject] ?? 'K'}${grade}.GV.${slug}`;
  if (!taken(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

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
