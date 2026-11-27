/**
 * Nhận ra và điền TỰ ĐỘNG hai loại tệp VnEdu cho tải về (đã đối chiếu tệp thật của trường, 11/2026):
 *
 * 1. Sổ điểm các môn (.xls, mỗi môn một trang tính "tieng_viet_5a2", "toan_5a2"…):
 *    dòng 4 "BẢNG ĐIỂM CHI TIẾT - MÔN TOÁN - HỌC KỲ 2 - CUỐI KỲ 2 - NĂM HỌC 2026 - 2027", dòng 5 "Khối 5 - Lớp 5A2",
 *    ô B6 là khóa của VnEdu "5004627967-51-2-ck2-2026" (giữ nguyên), dòng 7 tiêu đề: STT | Mã học sinh (cột B, ẩn) |
 *    Họ và tên (gộp C:D = họ đệm + tên) | Nhận xét | KT CK2 | XL CK2 | KT CK2 (Sau thi lại) | XL CK2 (Sau thi lại).
 *    Môn chỉ đánh giá bằng nhận xét (Đạo đức, Âm nhạc…) không có cột KT. Điền: Nhận xét, KT (điểm nguyên 1–10),
 *    XL (T/H/C) từ đánh giá TT27 trong OPEN-EDU. Cột "Sau thi lại" để nguyên.
 * 2. Mẫu nhận xét năng lực, phẩm chất (2 dòng tiêu đề): STT | Mã học sinh | Họ và tên | Học kì | Năng lực chung
 *    (Nhận xét, Tự chủ và tự học, Giao tiếp và hợp tác, GQVĐ và sáng tạo) | Năng lực đặc thù (Nhận xét, Ngôn ngữ,
 *    Tính toán, Khoa học, Thẩm mĩ, Thể chất, Công nghệ, Tin học) | Phẩm chất (Nhận xét, Yêu nước, Nhân ái, Chăm chỉ,
 *    Trung thực, Trách nhiệm). Mẫu trống → OPEN-EDU viết thêm một dòng cho mỗi em có mã học sinh; mẫu đã có dòng → ghép
 *    và điền. Mức: T / Đ / C.
 *
 * Ghi ra cùng định dạng với tệp tải lên (.xls → .xls qua `patchXls`, .xlsx → .xlsx qua `patchXlsx`).
 * ⚠ Chưa thử nhập ngược vào VnEdu thật: GV nên thử với một lớp trước. Giá trị cột "Học kì" (1 / 2) là phỏng đoán.
 */
import { TT27_COMPETENCY_LABEL, TT27_QUALITY_LABEL, type SubjectId, type Tt27Competency, type Tt27Quality, type Tt27TermId } from '@openedu/contracts';
import { foldVietnamese } from '../text';
import { detectTable, type DetectedTable } from './detect';
import { fieldValue, type BridgeData, type FieldValue } from './fields';
import { matchRows, type RowMatch } from './match';
import { buildFillPlan, type ColumnMapping } from './template';
import { patchXls, type SheetPatches } from './xls';
import { cellText, type XSheet, type XWorkbook } from './xlsx';
import { patchXlsx, type CellPatch } from './xlsxPatch';
import { toMatchStudents } from './vnedu';

export type VnEduBookKind = 'so-diem' | 'nlpc';

export interface VnEduSheetPlan {
  sheetIndex: number;
  sheetName: string;
  /** Tên môn như trong tệp ("TIẾNG VIỆT"), hoặc "Năng lực, phẩm chất". */
  label: string;
  subjectId?: SubjectId;
  table: DetectedTable | null;
  /** Cột → trường OPEN-EDU (đã tự chọn). */
  mapping: ColumnMapping;
  /** Lí do trang không điền được. */
  skip?: 'no-subject' | 'no-students' | 'no-columns';
}

export interface VnEduBook {
  kind: VnEduBookKind;
  sheets: VnEduSheetPlan[];
  termId?: Tt27TermId;
  /** "HỌC KỲ 2 - CUỐI KỲ 2". */
  termText?: string;
  schoolYear?: string;
  className?: string;
  /** Khóa VnEdu ở ô B6 của trang đầu (để hiện, không sửa). */
  key?: string;
}

const SUBJECT_OF: [RegExp, SubjectId][] = [
  [/^tieng viet$/, 'tieng-viet'],
  [/^toan$/, 'toan'],
  [/^khoa hoc$/, 'khoa-hoc'],
  [/^(ngoai ngu( 1)?|tieng anh)$/, 'tieng-anh'],
  [/^(mi thuat|my thuat)$/, 'mi-thuat'],
  [/^am nhac$/, 'am-nhac'],
  [/^tu nhien va xa hoi$/, 'tnxh'],
  [/^(lich su va dia (li|ly)|lich su dia (li|ly))$/, 'lich-su-dia-li'],
  [/^(tin hoc|tin hoc va cong nghe( tin hoc)?)$/, 'tin-hoc'],
  [/^(cong nghe|tin hoc va cong nghe cong nghe)$/, 'cong-nghe'],
  [/^dao duc$/, 'dao-duc'],
  [/^(giao duc the chat|the duc)$/, 'gdtc'],
  [/^hoat dong trai nghiem$/, 'hdtn'],
  [/^tieng dan toc( thieu so)?\b/, 'tieng-dan-toc'],
  [/^nghe thuat am nhac$/, 'am-nhac'],
  [/^nghe thuat mi thuat$|^nghe thuat my thuat$/, 'mi-thuat'],
];

export function vneduSubject(label: string): SubjectId | undefined {
  const n = foldVietnamese(label).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return SUBJECT_OF.find(([re]) => re.test(n))?.[1];
}

/** "GIỮA KỲ 1" → GK1 · "CUỐI KỲ 1" → CK1 · "GIỮA KỲ 2" → GK2 · "CUỐI KỲ 2" / "CẢ NĂM" → CN. */
export function vneduTerm(text: string): Tt27TermId | undefined {
  const n = foldVietnamese(text);
  if (/giua ky 1|giua ki 1|\bgk1\b/.test(n)) return 'GK1';
  if (/cuoi ky 1|cuoi ki 1|\bck1\b/.test(n)) return 'CK1';
  if (/giua ky 2|giua ki 2|\bgk2\b/.test(n)) return 'GK2';
  if (/cuoi ky 2|cuoi ki 2|\bck2\b|ca nam|cuoi nam/.test(n)) return 'CN';
  return undefined;
}

const KEY_RE = /^\d+-\d+-[12]-(gk|ck)[12]-\d{4}$/i;
const TITLE_RE = /bang diem chi tiet\s*-\s*mon\s+(.+?)\s*-\s*(hoc ky \d\s*-\s*(?:giua|cuoi) ky \d)\s*-\s*nam hoc\s*(\d{4})\s*-\s*(\d{4})/;

function topText(sheet: XSheet, rows = 8): string[] {
  const out: string[] = [];
  for (let r = 0; r < Math.min(rows, sheet.rows.length); r++) for (const v of sheet.rows[r] ?? []) { const t = cellText(v).trim(); if (t) out.push(t); }
  return out;
}

const fold = (s: string) => foldVietnamese(s).replace(/\s+/g, ' ').trim();

function scoreSheetMapping(table: DetectedTable, subject: SubjectId): ColumnMapping {
  const out: ColumnMapping = {};
  for (const c of table.columns) {
    if (c.kind !== 'other') continue;
    const n = fold(c.label);
    if (/sau thi lai/.test(n)) continue;
    if (/^nhan xet$/.test(n)) out[c.index] = `tt27-comment:${subject}`;
    else if (/^kt (gk|ck)\s?\d$/.test(n)) out[c.index] = `tt27-score:${subject}`;
    else if (/^xl (gk|ck)\s?\d$/.test(n)) out[c.index] = `tt27-level:${subject}`;
  }
  return out;
}

const COMP_WORDS: [RegExp, Tt27Competency][] = [
  [/tu chu va tu hoc/, 'tu-chu-tu-hoc'],
  [/giao tiep va hop tac/, 'giao-tiep-hop-tac'],
  [/gqvd|giai quyet van de/, 'gqvd-sang-tao'],
  [/^ngon ngu$/, 'ngon-ngu'],
  [/^tinh toan$/, 'tinh-toan'],
  [/^khoa hoc$/, 'khoa-hoc'],
  [/^tham mi$|^tham my$/, 'tham-mi'],
  [/^the chat$/, 'the-chat'],
  [/^cong nghe$/, 'cong-nghe'],
  [/^tin hoc$/, 'tin-hoc'],
];
const QUAL_WORDS: [RegExp, Tt27Quality][] = [
  [/^yeu nuoc$/, 'yeu-nuoc'],
  [/^nhan ai$/, 'nhan-ai'],
  [/^cham chi$/, 'cham-chi'],
  [/^trung thuc$/, 'trung-thuc'],
  [/^trach nhiem$/, 'trach-nhiem'],
];

/** Cột của mẫu năng lực phẩm chất. Nhận theo tầng tiêu đề dưới ("Năng lực chung / Tự chủ và tự học"). */
function nlpcMapping(table: DetectedTable): ColumnMapping {
  const out: ColumnMapping = {};
  for (const c of table.columns) {
    const parts = c.label.split(' / ');
    const leaf = fold(parts[parts.length - 1] ?? '');
    if (/^hoc ki$|^hoc ky$/.test(leaf)) { out[c.index] = 'nlpc-term'; continue; }
    if (c.kind !== 'other') continue;
    if (/^nhan xet ve nang luc dac thu/.test(leaf)) { out[c.index] = 'nlpc-comment:dac-thu'; continue; }
    if (/^nhan xet ve nang luc/.test(leaf)) { out[c.index] = 'nlpc-comment:chung'; continue; }
    if (/^nhan xet ve pham chat/.test(leaf)) { out[c.index] = 'nlpc-comment:pham-chat'; continue; }
    const comp = COMP_WORDS.find(([re]) => re.test(leaf))?.[1];
    if (comp) { out[c.index] = `tt27-comp:${comp}`; continue; }
    const q = QUAL_WORDS.find(([re]) => re.test(leaf))?.[1];
    if (q) out[c.index] = `tt27-qual:${q}`;
  }
  return out;
}

/** Nhận ra tệp VnEdu. Không phải → null (dùng cách "Điền vào mẫu" thông thường). */
export function recognizeVnEdu(wb: XWorkbook): VnEduBook | null {
  // 1. Sổ điểm các môn.
  const scoreSheets: VnEduSheetPlan[] = [];
  let termText: string | undefined;
  let schoolYear: string | undefined;
  let className: string | undefined;
  let key: string | undefined;
  wb.sheets.forEach((sheet, sheetIndex) => {
    if (sheet.hidden) return;
    const texts = topText(sheet);
    const title = texts.map(fold).map((t) => TITLE_RE.exec(t)).find((m) => m);
    const k = texts.find((t) => KEY_RE.test(t));
    if (!title || !k) return;
    const rawTitle = texts.find((t) => TITLE_RE.test(fold(t))) ?? '';
    const label = /MÔN\s+(.+?)\s+-\s+HỌC K/i.exec(rawTitle)?.[1]?.trim() ?? title[1].toUpperCase();
    termText ??= /HỌC K[ỲÌ]\s*\d\s*-\s*(?:GIỮA|CUỐI)\s*K[ỲÌ]\s*\d/i.exec(rawTitle)?.[0] ?? title[2];
    schoolYear ??= `${title[3]}-${title[4]}`;
    key ??= k;
    className ??= texts.map((t) => /lớp\s+([0-9A-Za-zÀ-ỹ.\-/]+)/i.exec(t)?.[1]).find((x) => x);
    const subjectId = vneduSubject(label);
    const table = detectTable(sheet);
    const plan: VnEduSheetPlan = { sheetIndex, sheetName: sheet.name, label, ...(subjectId ? { subjectId } : {}), table, mapping: {} };
    if (!subjectId) plan.skip = 'no-subject';
    else if (!table || !table.students.length) plan.skip = 'no-students';
    else {
      plan.mapping = scoreSheetMapping(table, subjectId);
      if (!Object.keys(plan.mapping).length) plan.skip = 'no-columns';
    }
    scoreSheets.push(plan);
  });
  if (scoreSheets.length) {
    return { kind: 'so-diem', sheets: scoreSheets, ...(termText ? { termText, termId: vneduTerm(termText) } : {}), ...(schoolYear ? { schoolYear } : {}), ...(className ? { className } : {}), ...(key ? { key } : {}) };
  }

  // 2. Mẫu nhận xét năng lực, phẩm chất.
  for (let i = 0; i < wb.sheets.length; i++) {
    const sheet = wb.sheets[i];
    if (sheet.hidden) continue;
    const texts = topText(sheet, 4).map(fold);
    if (!texts.includes('nang luc chung') || !texts.includes('pham chat')) continue;
    const table = detectTable(sheet);
    if (!table) continue;
    const mapping = nlpcMapping(table);
    if (Object.values(mapping).filter((f) => f.startsWith('tt27-')).length < 5) continue;
    return { kind: 'nlpc', sheets: [{ sheetIndex: i, sheetName: sheet.name, label: 'Năng lực, phẩm chất', table, mapping }] };
  }
  return null;
}

/* ============================ giá trị ============================ */
/** TT27: điểm bài kiểm tra định kì là số nguyên 1–10 (không cho điểm 0, không cho điểm thập phân). */
export function tt27Score(v: number): number {
  return Math.min(10, Math.max(1, Math.round(v)));
}

export interface VnEduFillOptions {
  /** Ghi đè ô đã có dữ liệu (mặc định có). */
  overwrite?: boolean;
  /** Giá trị cột "Học kì" của mẫu năng lực phẩm chất. Mặc định: 1 cho GK1/CK1, 2 cho GK2/CN. */
  nlpcTerm?: string | number;
  /** Ghép tay của GV theo trang tính: sheetName → (dòng → studentId, '' = bỏ qua). */
  picks?: Record<string, Record<number, string>>;
}

export function defaultNlpcTerm(termId: Tt27TermId): number {
  return termId === 'GK1' || termId === 'CK1' ? 1 : 2;
}

function valueFor(d: BridgeData, fieldId: string, studentId: string, opts: VnEduFillOptions): FieldValue {
  if (fieldId === 'nlpc-term') return opts.nlpcTerm ?? defaultNlpcTerm(d.termId);
  if (fieldId.startsWith('nlpc-comment:')) return null;
  const v = fieldValue(d, fieldId, studentId);
  if (typeof v === 'number' && fieldId.startsWith('tt27-score:')) return tt27Score(v);
  return v;
}

/** Mã học sinh VnEdu là dãy số → ghi số (như tệp gốc); có chữ / số 0 đứng đầu → ghi chữ. */
function codeCell(code: string): string | number {
  return /^[1-9]\d{0,14}$/.test(code) ? Number(code) : code;
}

export interface VnEduSheetResult {
  sheetName: string;
  label: string;
  skip?: VnEduSheetPlan['skip'];
  matches: RowMatch[];
  /** Ô sẽ ghi. */
  filled: number;
  /** Ô OPEN-EDU chưa có dữ liệu (để nguyên). */
  noData: number;
  kept: number;
  /** Mẫu năng lực phẩm chất trống: số dòng học sinh viết thêm, và các em bị bỏ vì chưa có mã. */
  added?: number;
  missingCode?: string[];
  patches: CellPatch[];
  /** Dòng đã điền (để xem trước): dòng → (cột → giá trị). */
  preview: { row: number; studentId: string; values: Record<number, FieldValue> }[];
}

export interface VnEduFillPlan { book: VnEduBook; sheets: VnEduSheetResult[]; filled: number }

function applyPicks(auto: RowMatch[], picks: Record<number, string> | undefined): RowMatch[] {
  if (!picks) return auto;
  return auto.map((m) => {
    if (!(m.row in picks)) return m;
    const id = picks[m.row];
    return id ? { ...m, status: 'manual' as const, studentId: id } : { row: m.row, status: m.status === 'missing' ? 'missing' as const : 'ambiguous' as const, candidates: m.candidates };
  });
}

/** Tính trước mọi ô sẽ điền (không ghi tệp). */
export function planVnEduFill(wb: XWorkbook, book: VnEduBook, d: BridgeData, opts: VnEduFillOptions = {}): VnEduFillPlan {
  const students = toMatchStudents(d);
  const sheets: VnEduSheetResult[] = book.sheets.map((sp) => {
    const sheet = wb.sheets[sp.sheetIndex];
    const base: VnEduSheetResult = { sheetName: sp.sheetName, label: sp.label, ...(sp.skip ? { skip: sp.skip } : {}), matches: [], filled: 0, noData: 0, kept: 0, patches: [], preview: [] };
    const table = sp.table;
    if (sp.skip && sp.skip !== 'no-students') return base;
    if (!table) return { ...base, skip: 'no-students' as const };

    // Mẫu năng lực phẩm chất còn trống: viết dòng mới cho từng em.
    if (book.kind === 'nlpc' && !table.students.length) {
      const first = table.headerEnd + 1;
      const missingCode: string[] = [];
      let r = first;
      let stt = 1;
      const patches: CellPatch[] = [];
      const preview: VnEduSheetResult['preview'] = [];
      let noData = 0;
      for (const st of d.students) {
        const code = (st.externalCode ?? '').trim();
        if (!code) { missingCode.push(st.name); continue; }
        const values: Record<number, FieldValue> = {};
        if (table.col.stt !== undefined) values[table.col.stt] = stt;
        if (table.col.code !== undefined) values[table.col.code] = codeCell(code);
        if (table.col.name !== undefined) values[table.col.name] = st.name;
        else if (table.col.lastName !== undefined && table.col.firstName !== undefined) {
          const parts = st.name.trim().split(/\s+/);
          values[table.col.lastName] = parts.slice(0, -1).join(' ');
          values[table.col.firstName] = parts[parts.length - 1] ?? '';
        }
        for (const [c, f] of Object.entries(sp.mapping)) {
          const v = valueFor(d, f, st.id, opts);
          if (v === null || v === '') { if (!f.startsWith('nlpc-comment:')) noData++; continue; }
          values[Number(c)] = v;
        }
        for (const [c, v] of Object.entries(values)) patches.push({ r, c: Number(c), value: v as string | number });
        preview.push({ row: r, studentId: st.id, values });
        r++;
        stt++;
      }
      const filled = patches.length;
      return { ...base, filled, noData, added: preview.length, missingCode, patches, preview };
    }

    if (!table.students.length) return { ...base, skip: 'no-students' as const };
    const matches = applyPicks(matchRows(table.students, students), opts.picks?.[sp.sheetName]);
    // Bỏ các cột đặc biệt của mẫu NLPC khỏi buildFillPlan (tự tính bên dưới).
    const normal: ColumnMapping = Object.fromEntries(Object.entries(sp.mapping).filter(([, f]) => !f.startsWith('nlpc-')));
    const plan = buildFillPlan(sheet, table, matches, normal, d, { overwrite: opts.overwrite });
    const patches = plan.patches.map((p) => {
      const f = normal[p.c];
      return f?.startsWith('tt27-score:') && typeof p.value === 'number' ? { ...p, value: tt27Score(p.value) } : p;
    });
    let filled = plan.filled;
    const overwrite = opts.overwrite !== false;
    for (const [c, f] of Object.entries(sp.mapping)) {
      if (f !== 'nlpc-term') continue;
      for (const m of matches) {
        if (!m.studentId) continue;
        const prev = cellText(sheet.rows[m.row]?.[Number(c)]).trim();
        if (prev && !overwrite) continue;
        patches.push({ r: m.row, c: Number(c), value: valueFor(d, f, m.studentId, opts) as string | number });
        filled++;
      }
    }
    const preview = plan.rows.map((row) => ({
      row: row.row,
      studentId: row.studentId,
      values: Object.fromEntries(patches.filter((p) => p.r === row.row).map((p) => [p.c, p.value])) as Record<number, FieldValue>,
    }));
    return { ...base, matches, filled, noData: plan.noData, kept: plan.kept, patches, preview };
  });
  return { book, sheets, filled: sheets.reduce((a, s) => a + s.filled, 0) };
}

export interface VnEduFillFile { bytes: Uint8Array; ext: 'xls' | 'xlsx'; filled: number }

/** Ghi tệp đã điền, cùng định dạng tệp gốc. */
export function writeVnEduFill(original: Uint8Array, wb: XWorkbook, plan: VnEduFillPlan): VnEduFillFile {
  const work = plan.sheets.filter((s) => s.patches.length);
  if (wb.format === 'xls') {
    const sheetPatches: SheetPatches[] = work.map((s) => {
      const sp = plan.book.sheets.find((x) => x.sheetName === s.sheetName);
      return { sheet: s.sheetName, patches: s.patches, styleBelowRow: sp?.table?.headerEnd };
    });
    return { bytes: patchXls(original, sheetPatches).bytes, ext: 'xls', filled: plan.filled };
  }
  if (wb.format === 'xlsx') {
    let bytes = original;
    for (const s of work) {
      const sp = plan.book.sheets.find((x) => x.sheetName === s.sheetName);
      bytes = patchXlsx(bytes, s.patches, { sheet: s.sheetName, styleBelowRow: sp?.table?.headerEnd }).bytes;
    }
    return { bytes, ext: 'xlsx', filled: plan.filled };
  }
  throw new Error('Tệp này là bảng dạng web nên không điền tự động được. Thầy/cô dùng cách "ghép cột thủ công" bên dưới nhé.');
}

/** Mô tả ngắn cho GV. */
export function describeBook(book: VnEduBook): string {
  if (book.kind === 'nlpc') return 'Mẫu nhận xét năng lực, phẩm chất (VnEdu)';
  const parts = [`Sổ điểm ${book.sheets.length} môn (VnEdu)`];
  if (book.termText) parts.push(book.termText.replace(/\s+/g, ' '));
  if (book.schoolYear) parts.push(`năm học ${book.schoolYear.replace('-', '–')}`);
  if (book.className) parts.push(`lớp ${book.className}`);
  return parts.join(' · ');
}

export const VNEDU_SKIP_LABEL: Record<NonNullable<VnEduSheetPlan['skip']>, string> = {
  'no-subject': 'OPEN-EDU chưa có môn này',
  'no-students': 'Trang chưa có danh sách học sinh',
  'no-columns': 'Không thấy cột để điền',
};

export function nlpcFieldLabel(fieldId: string): string {
  if (fieldId === 'nlpc-term') return 'Học kì';
  if (fieldId.startsWith('nlpc-comment:')) return 'Nhận xét (để trống)';
  const [k, a] = fieldId.split(':');
  if (k === 'tt27-comp') return TT27_COMPETENCY_LABEL[a as Tt27Competency] ?? a;
  if (k === 'tt27-qual') return TT27_QUALITY_LABEL[a as Tt27Quality] ?? a;
  return fieldId;
}

