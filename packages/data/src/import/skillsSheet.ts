/**
 * Danh mục kĩ năng ↔ Excel.
 *  - skillsSheet(): trang "Danh mục kĩ năng" (mọi kĩ năng: mã, môn, lớp, mạch, chủ đề, tên ngắn, yêu cầu cần đạt…)
 *    — dùng cho nút "Xuất Excel" của trang Danh mục kĩ năng và gắn kèm mẫu nhập câu hỏi (để tra mã).
 *  - planSkillsImport(): đọc lại tệp đã sửa → danh sách việc cần làm (thêm, sửa chữ, ẩn / hiện), chưa ghi gì.
 * Thuần (không DOM).
 */
import {
  allSkills, customSkillCode, SKILL_BY_CODE, STRAND_LABEL, SUBJECT_LIST, SUBJECTS, subjectInGrade,
  type Grade, type Skill, type SubjectId,
} from '@openedu/contracts';
import { foldVietnamese } from '../text';
import { parseGrade, parseSubject } from './meta';
import { readXlsx, writeXlsx, type XlsxCell, type XlsxSheet } from './xlsx';

export const SKILL_SHEET_NAME = 'Danh mục kĩ năng';
const HEAD = ['Mã kĩ năng', 'Môn', 'Lớp', 'Mạch nội dung', 'Chủ đề', 'Tên ngắn', 'Yêu cầu cần đạt', 'Nguồn', 'Trạng thái'] as const;
const WIDTHS = [26, 20, 6, 22, 26, 30, 70, 16, 12];
const SHOWN = 'Đang dùng';
const HIDDEN = 'Đã ẩn';

function source(s: Skill): string {
  if (s.custom) return 'Thầy cô thêm';
  if (s.edited) return 'Gốc – đã sửa';
  return s.provisional ? 'Gốc (tạm)' : 'Gốc';
}

const subjectOrder = new Map(SUBJECT_LIST.map((s, i) => [s.id, i]));
function sortSkills(list: Skill[]): Skill[] {
  return [...list].sort((a, b) => (subjectOrder.get(a.subject) ?? 99) - (subjectOrder.get(b.subject) ?? 99) || a.grade - b.grade);
}

/** Trang "Danh mục kĩ năng". withHidden: kèm kĩ năng đã ẩn (xuất từ trang quản lí). */
export function skillsSheet(opts: { withHidden?: boolean; skills?: Skill[] } = {}): XlsxSheet {
  const list = sortSkills((opts.skills ?? allSkills()).filter((s) => opts.withHidden || !s.hidden));
  const rows: XlsxCell[][] = [
    [...HEAD],
    ...list.map((s) => [s.code, SUBJECTS[s.subject]?.name ?? s.subject, s.grade, STRAND_LABEL[s.strand] ?? '', s.topic, s.short, s.text, source(s), s.hidden ? HIDDEN : SHOWN]),
  ];
  return { name: SKILL_SHEET_NAME, rows, widths: WIDTHS, lists: [{ col: 8, values: [SHOWN, HIDDEN] }] };
}

const GUIDE: XlsxCell[][] = [
  ['DANH MỤC KĨ NĂNG (YÊU CẦU CẦN ĐẠT) — OPEN-EDU'],
  [''],
  ['Dùng để: tra mã kĩ năng khi soạn câu hỏi (cột "Mã kĩ năng" của mẫu Excel, dòng "Mã kĩ năng:" trong Word / văn bản dán); tổ chuyên môn rà soát, sửa nội dung rồi nhập lại.'],
  [''],
  ['Cột', 'Cách dùng khi nhập lại (Danh mục kĩ năng → Nhập từ Excel)'],
  ['Mã kĩ năng', 'Giữ nguyên để SỬA kĩ năng đã có. Để TRỐNG để THÊM kĩ năng mới (máy tự đặt mã).'],
  ['Môn, Lớp', 'Bắt buộc với kĩ năng mới. Kĩ năng đã có không đổi được môn, lớp.'],
  ['Chủ đề, Tên ngắn, Yêu cầu cần đạt', 'Sửa chữ tuỳ ý. Tên ngắn nên ≤ 6 từ (hiện cho học sinh, phụ huynh).'],
  ['Trạng thái', `"${SHOWN}" hoặc "${HIDDEN}" (ẩn khỏi danh sách chọn, giữ lịch sử).`],
  ['Mạch nội dung, Nguồn', 'Chỉ để xem, không cần sửa.'],
  ['Xoá kĩ năng', 'Không xoá bằng Excel — xoá dòng trong tệp KHÔNG xoá kĩ năng. Xoá ở trang Danh mục kĩ năng (nút thùng rác).'],
];

/** Tệp "danh-muc-ki-nang.xlsx": trang danh mục + hướng dẫn. */
export function buildSkillsXlsx(opts: { withHidden?: boolean; skills?: Skill[] } = {}): Uint8Array {
  return writeXlsx([skillsSheet({ withHidden: opts.withHidden ?? true, skills: opts.skills }), { name: 'Hướng dẫn', rows: GUIDE, widths: [30, 110], headerRows: 0 }]);
}

/* ---------------- nhập lại ---------------- */
export type SkillPlanKind = 'add' | 'edit' | 'hide' | 'show' | 'same' | 'error';
export interface SkillPlanRow {
  /** Dòng trong tệp (từ 1). */
  row: number;
  kind: SkillPlanKind;
  code: string;
  subject?: SubjectId;
  grade?: Grade;
  topic: string;
  short: string;
  text: string;
  /** edit + đổi trạng thái cùng lúc. */
  hidden?: boolean;
  message?: string;
}
export interface SkillsImportPlan {
  rows: SkillPlanRow[];
  counts: Record<SkillPlanKind, number>;
  warnings: string[];
}

const f = (v: unknown): string => foldVietnamese(String(v ?? '')).replace(/\s+/g, ' ').trim();
const t = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const COLS: Record<string, string[]> = {
  code: ['ma ki nang', 'ma ky nang', 'ma', 'code'],
  subject: ['mon', 'mon hoc'],
  grade: ['lop', 'khoi'],
  topic: ['chu de', 'noi dung', 'chu de / mach noi dung'],
  short: ['ten ngan', 'ten', 'ten ki nang', 'ten ky nang'],
  text: ['yeu cau can dat', 'mo ta', 'yccd'],
  status: ['trang thai'],
};

/** Đọc tệp danh mục đã sửa → kế hoạch (chưa ghi). Trang "Danh mục kĩ năng" nếu có, không thì trang đầu. */
export function planSkillsImport(data: Uint8Array): SkillsImportPlan {
  const first = readXlsx(data);
  const named = first.sheetNames.find((n) => f(n) === f(SKILL_SHEET_NAME));
  const sheet = named && named !== first.sheetNames[0] ? readXlsx(data, { sheet: named }) : first;
  return planSkillsRows(sheet.rows);
}

export function planSkillsRows(rows: XlsxCell[][]): SkillsImportPlan {
  const warnings: string[] = [];
  const out: SkillPlanRow[] = [];
  const hi = rows.findIndex((r) => r.some((c) => f(c) === 'ma ki nang' || f(c) === 'ma ky nang'));
  if (hi < 0) {
    return { rows: [], counts: { add: 0, edit: 0, hide: 0, show: 0, same: 0, error: 0 }, warnings: ['Không thấy dòng tiêu đề "Mã kĩ năng". Thầy cô dùng tệp xuất từ trang Danh mục kĩ năng nhé.'] };
  }
  const head = rows[hi].map(f);
  const col = (k: keyof typeof COLS): number => head.findIndex((h) => COLS[k].includes(h));
  const C = { code: col('code'), subject: col('subject'), grade: col('grade'), topic: col('topic'), short: col('short'), text: col('text'), status: col('status') };
  if (C.short < 0 || C.text < 0) warnings.push('Thiếu cột "Tên ngắn" hoặc "Yêu cầu cần đạt".');
  const newCodes = new Set<string>();
  const taken = (c: string): boolean => !!SKILL_BY_CODE[c] || newCodes.has(c);
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const get = (c: number): string => (c >= 0 ? t(r[c]) : '');
    const code = get(C.code).toUpperCase();
    const topic = get(C.topic);
    const short = get(C.short);
    const text = get(C.text);
    const statusRaw = f(get(C.status));
    const wantHidden = statusRaw ? statusRaw === f(HIDDEN) || statusRaw === 'an' : undefined;
    if (!code && !topic && !short && !text) continue;
    const base = { row: i + 1, topic, short, text };
    const cur = code ? SKILL_BY_CODE[code] : undefined;
    if (cur) {
      if (!short || !text || !topic) {
        out.push({ ...base, code, kind: 'error', message: 'Thiếu chủ đề, tên ngắn hoặc yêu cầu cần đạt' });
        continue;
      }
      const changed = cur.topic !== topic || cur.short !== short || cur.text !== text;
      const flip = wantHidden !== undefined && wantHidden !== !!cur.hidden;
      if (changed) out.push({ ...base, code, subject: cur.subject, grade: cur.grade, kind: 'edit', ...(flip ? { hidden: wantHidden } : {}) });
      else if (flip) out.push({ ...base, code, subject: cur.subject, grade: cur.grade, kind: wantHidden ? 'hide' : 'show' });
      else out.push({ ...base, code, kind: 'same' });
      continue;
    }
    // Kĩ năng mới
    const subject = parseSubject(get(C.subject));
    const grade = parseGrade(get(C.grade));
    const miss = [!subject && 'môn', !grade && 'lớp', !topic && 'chủ đề', !short && 'tên ngắn', !text && 'yêu cầu cần đạt'].filter(Boolean);
    if (miss.length) {
      out.push({ ...base, code, kind: 'error', message: `${code ? `Mã ${code} chưa có trong danh mục — ` : ''}kĩ năng mới cần ${miss.join(', ')}` });
      continue;
    }
    if (!subjectInGrade(subject!, grade!) && subject !== 'khac') {
      out.push({ ...base, code, kind: 'error', message: `Môn ${SUBJECTS[subject!]?.name ?? subject} không học ở lớp ${grade}` });
      continue;
    }
    const ok = /^[A-Z]+[1-5]\.[A-Z0-9-]+\.[A-Z0-9-]+$/.test(code) && !taken(code);
    const newCode = ok ? code : customSkillCode(subject!, grade!, short, taken);
    newCodes.add(newCode);
    out.push({ ...base, code: newCode, subject, grade, kind: 'add', ...(wantHidden ? { hidden: true } : {}) });
  }
  const counts = { add: 0, edit: 0, hide: 0, show: 0, same: 0, error: 0 } as Record<SkillPlanKind, number>;
  out.forEach((x) => { counts[x.kind]++; });
  return { rows: out, counts, warnings };
}
