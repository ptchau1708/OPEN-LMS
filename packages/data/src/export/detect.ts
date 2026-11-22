/**
 * Nhận ra bảng danh sách học sinh trong một trang tính bất kì (mẫu tải từ VnEdu, sổ điểm, bảng nhận xét TT27…):
 * tìm dòng tiêu đề thật (bỏ qua các dòng tên trường / tên bảng gộp ô phía trên), nhận các cột quen thuộc theo tên
 * (có dấu hoặc không dấu), ghép nhãn tiêu đề nhiều tầng ("Toán / Mức đạt"), tìm các dòng học sinh và tạo "dấu vân tay"
 * của mẫu để nhớ cách ghép cột cho lần sau. Thuần, có kiểm thử.
 */
import { foldVietnamese } from '../text';
import { cellText, type XCell, type XMerge, type XSheet } from './xlsx';

export type ColumnKind = 'stt' | 'code' | 'name' | 'lastName' | 'firstName' | 'dob' | 'gender' | 'class' | 'other';

export const COLUMN_KIND_LABEL: Record<ColumnKind, string> = {
  stt: 'Số thứ tự',
  code: 'Mã học sinh',
  name: 'Họ và tên',
  lastName: 'Họ đệm',
  firstName: 'Tên',
  dob: 'Ngày sinh',
  gender: 'Giới tính',
  class: 'Lớp',
  other: 'Cột khác',
};

/** Tên cột quen thuộc (đã bỏ dấu, chữ thường, bỏ kí tự thừa). Khớp chính xác hoặc bắt đầu bằng. */
const ALIASES: [ColumnKind, RegExp][] = [
  ['stt', /^(stt|tt|so tt|so thu tu|thu tu|no|#)$/],
  ['code', /^(ma hoc sinh|ma hs|mahs|ma dinh danh|ma so hoc sinh|ma so hs|so dinh danh|ma moet|student id|student code)( .*)?$|^(ma|ma so|id)$/],
  ['name', /^(ho va ten|ho ten|ho va ten hoc sinh|ho ten hoc sinh|ho ten hs|ho va ten hs|ten hoc sinh|hoc sinh|full ?name|name|student name)$/],
  ['lastName', /^(ho dem|ho va ten dem|ho lot|ho va chu dem|ho va ten lot|ho|last ?name|surname)$/],
  ['firstName', /^(ten|first ?name|given ?name)$/],
  ['dob', /^(ngay sinh|ngay thang nam sinh|ngay thang nam sinh|sinh ngay|nam sinh|ns|date of birth|dob|birthday)$/],
  ['gender', /^(gioi tinh|gt|nu|nam nu|gender|sex)$/],
  ['class', /^(lop|ten lop|lop hoc|class)$/],
];

/** Chuẩn hóa nhãn tiêu đề để so khớp: bỏ dấu, chữ thường, bỏ chú thích trong ngoặc và dấu câu. */
export function normLabel(s: string): string {
  return foldVietnamese(s)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function kindOfLabel(label: string): ColumnKind {
  const n = normLabel(label);
  if (!n) return 'other';
  for (const [kind, re] of ALIASES) if (re.test(n)) return kind;
  return 'other';
}

export interface DetectedColumn {
  index: number;
  /** Nhãn đầy đủ (ghép các tầng tiêu đề): "Toán / Mức đạt". */
  label: string;
  kind: ColumnKind;
}

export interface DetectedRow {
  /** Chỉ số dòng trong trang tính (từ 0). */
  row: number;
  code: string;
  name: string;
  dob: string;
  className: string;
}

export interface DetectedTable {
  sheetName: string;
  /** Dòng tiêu đề đầu / cuối (từ 0). */
  headerStart: number;
  headerEnd: number;
  columns: DetectedColumn[];
  /** Cột theo loại (cột đầu tiên của mỗi loại). */
  col: Partial<Record<ColumnKind, number>>;
  students: DetectedRow[];
  /** Dấu vân tay của mẫu: giống nhau khi các nhãn cột giống nhau (không phụ thuộc số học sinh). */
  fingerprint: string;
}

function mergeAt(merges: XMerge[], r: number, c: number): XMerge | undefined {
  return merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
}

/** Giá trị ô, tính cả ô gộp (lấy ô góc trên trái). */
function valueAt(sheet: XSheet, r: number, c: number): XCell {
  const v = sheet.rows[r]?.[c] ?? null;
  if (v !== null) return v;
  const m = mergeAt(sheet.merges, r, c);
  return m ? sheet.rows[m.r1]?.[m.c1] ?? null : null;
}

function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = (Math.imul(h2, 33) + ch) | 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

const isBlankRow = (row: XCell[] | undefined) => !row || row.every((v) => v === null || cellText(v).trim() === '');

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && t.length <= 60 && /\p{L}/u.test(t) && !/\d{3,}/.test(t);
}

/** Tìm bảng học sinh trong một trang tính. Không thấy cột họ tên → null. */
export function detectTable(sheet: XSheet, maxScan = 60): DetectedTable | null {
  const rows = sheet.rows;
  let best: { r: number; score: number } | null = null;
  for (let r = 0; r < Math.min(rows.length, maxScan); r++) {
    const kinds = new Set<ColumnKind>();
    for (let c = 0; c < (rows[r]?.length ?? 0); c++) {
      const v = rows[r][c];
      if (typeof v !== 'string') continue;
      const k = kindOfLabel(v);
      if (k !== 'other') kinds.add(k);
    }
    const hasName = kinds.has('name') || (kinds.has('lastName') && kinds.has('firstName'));
    if (!hasName) continue;
    const score = kinds.size;
    if (!best || score > best.score) best = { r, score };
  }
  if (!best) return null;

  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const nameColProbe = rows[best.r].findIndex((v) => typeof v === 'string' && ['name', 'lastName'].includes(kindOfLabel(v)));
  // Dải tiêu đề: ô "Họ và tên" gộp dọc bao nhiêu dòng thì tiêu đề dài bấy nhiêu.
  const nm = mergeAt(sheet.merges, best.r, nameColProbe);
  let headerStart = nm ? nm.r1 : best.r;
  let headerEnd = nm ? nm.r2 : best.r;
  // Tầng tiêu đề phía trên (vd "Môn học và hoạt động giáo dục" gộp ngang phía trên dòng tên cột).
  for (const m of sheet.merges) if (m.r2 === headerStart - 1 && m.c1 > nameColProbe && m.c2 > m.c1) headerStart = Math.min(headerStart, m.r1);
  // Tầng tiêu đề phía dưới: dòng kế tiếp không có tên học sinh nhưng có chữ (vd "Mức đạt | Điểm | Nhận xét").
  const sttProbe = rows[best.r].findIndex((v) => typeof v === 'string' && kindOfLabel(v) === 'stt');
  for (let r = headerEnd + 1; r < Math.min(rows.length, headerEnd + 4); r++) {
    const row = rows[r];
    if (isBlankRow(row)) break;
    const nameCell = cellText(row[nameColProbe]).trim();
    const sttCell = sttProbe >= 0 ? row[sttProbe] : null;
    const sttIsNumber = typeof sttCell === 'number' || /^\d+$/.test(cellText(sttCell).trim());
    // Dòng đánh số cột (1) (2) (3)… hoặc A B C cũng là tiêu đề.
    const numbering = row.filter((v) => v !== null).length >= 3 && row.every((v) => v === null || /^\(?\d{1,2}\)?$/.test(cellText(v).trim()));
    if (numbering) { headerEnd = r; continue; }
    if (nameCell || sttIsNumber) break;
    if (!row.some((v) => typeof v === 'string' && v.trim())) break;
    headerEnd = r;
  }

  // Nhãn cột = ghép các tầng (trên → dưới), bỏ phần trùng.
  const columns: DetectedColumn[] = [];
  for (let c = 0; c < width; c++) {
    const parts: string[] = [];
    for (let r = headerStart; r <= headerEnd; r++) {
      const t = cellText(valueAt(sheet, r, c)).replace(/\s+/g, ' ').trim();
      if (!t || /^\(?\d{1,2}\)?$/.test(t)) continue;
      if (parts[parts.length - 1] !== t) parts.push(t);
    }
    const label = parts.join(' / ');
    let kind: ColumnKind = 'other';
    for (let i = parts.length - 1; i >= 0 && kind === 'other'; i--) kind = kindOfLabel(parts[i]);
    if (kind === 'other' && label) kind = kindOfLabel(label);
    columns.push({ index: c, label, kind });
  }
  // Mỗi loại định danh chỉ giữ cột đầu tiên; cột trùng loại phía sau coi là cột khác.
  const col: Partial<Record<ColumnKind, number>> = {};
  for (const cdef of columns) {
    if (cdef.kind === 'other') continue;
    if (col[cdef.kind] === undefined) col[cdef.kind] = cdef.index;
    else cdef.kind = 'other';
  }
  // VnEdu: ô "Họ và tên" gộp ngang 2 cột (C: họ đệm, D: tên) → ghép hai cột.
  if (col.name !== undefined && col.lastName === undefined && col.firstName === undefined) {
    const c = col.name;
    const hr = best.r;
    const m = sheet.merges.find((x) => x.c1 === c && x.c2 === c + 1 && x.r1 <= hr && x.r2 >= hr);
    if (m && columns[c + 1]?.kind === 'other') {
      col.lastName = c;
      col.firstName = c + 1;
      delete col.name;
      columns[c].kind = 'lastName';
      columns[c + 1].kind = 'firstName';
    }
  }
  // "Tên" chỉ có nghĩa khi đi cùng "Họ đệm".
  if (col.name === undefined && !(col.lastName !== undefined && col.firstName !== undefined)) return null;

  const nameOf = (row: XCell[]): string => {
    if (col.name !== undefined && !(col.lastName !== undefined && col.firstName !== undefined && !cellText(row[col.name]).trim())) return cellText(row[col.name]).replace(/\s+/g, ' ').trim();
    return `${cellText(row[col.lastName as number])} ${cellText(row[col.firstName as number])}`.replace(/\s+/g, ' ').trim();
  };
  const students: DetectedRow[] = [];
  let gap = 0;
  for (let r = headerEnd + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = nameOf(row);
    const code = col.code !== undefined ? cellText(row[col.code]).trim() : '';
    const stt = col.stt !== undefined ? cellText(row[col.stt]).trim() : '';
    const ok = looksLikeName(name) && (col.stt === undefined || /^\d+[.)]?$/.test(stt) || !!code);
    if (!ok) {
      if (students.length && ++gap >= 3) break;
      continue;
    }
    gap = 0;
    students.push({
      row: r,
      code,
      name: name.normalize('NFC'),
      dob: col.dob !== undefined ? cellText(row[col.dob]).trim() : '',
      className: col.class !== undefined ? cellText(row[col.class]).trim() : '',
    });
  }
  const fingerprint = hash(columns.map((c) => normLabel(c.label)).join('|'));
  return { sheetName: sheet.name, headerStart, headerEnd, columns, col, students, fingerprint };
}

/** Trang tính đầu tiên (không ẩn) có bảng học sinh; ưu tiên bảng nhiều học sinh nhất. */
export function detectWorkbook(sheets: XSheet[]): { sheetIndex: number; table: DetectedTable } | null {
  let best: { sheetIndex: number; table: DetectedTable } | null = null;
  sheets.forEach((s, i) => {
    if (s.hidden) return;
    const t = detectTable(s);
    if (t && (!best || t.students.length > best.table.students.length)) best = { sheetIndex: i, table: t };
  });
  return best;
}
