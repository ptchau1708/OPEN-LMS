/**
 * "Điền vào mẫu": lấy tệp Excel thầy cô tải từ VnEdu (hoặc bất kì mẫu nào có cột họ tên), điền dữ liệu OPEN-EDU vào
 * các cột đã chọn rồi trả lại tệp. Ưu tiên sửa thẳng trong tệp gốc (giữ nguyên định dạng); tệp lạ thì ghi tệp mới sạch
 * có cùng các dòng tiêu đề và thứ tự cột. Cách ghép cột được nhớ theo "dấu vân tay" của mẫu (localStorage).
 */
import { SUBJECTS, TT27_COMPETENCY_LABEL, TT27_QUALITY_LABEL, type SubjectId } from '@openedu/contracts';
import { foldVietnamese } from '../text';
import { normLabel, type DetectedTable } from './detect';
import { fieldValue, type BridgeData, type BridgeField, type FieldValue } from './fields';
import type { RowMatch } from './match';
import { XlsxError, cellText, readXlsx, writeXlsx, type XCell, type XSheet, type XWorkbook } from './xlsx';
import { patchXlsx, type CellPatch } from './xlsxPatch';
import { patchXls, readXls } from './xls';

/** Cột (chỉ số) → id trường OPEN-EDU. */
export type ColumnMapping = Record<number, string>;

export interface FillCell { c: number; value: FieldValue; previous: string; skipped?: 'empty' | 'kept' }
export interface FillRow { row: number; studentId: string; cells: FillCell[] }
export interface FillPlan {
  rows: FillRow[];
  patches: CellPatch[];
  /** Số ô sẽ ghi. */
  filled: number;
  /** Ô không có dữ liệu trong OPEN-EDU (để nguyên). */
  noData: number;
  /** Ô đã có dữ liệu và được giữ nguyên (khi không cho ghi đè). */
  kept: number;
}

export function buildFillPlan(sheet: XSheet, table: DetectedTable, matches: RowMatch[], mapping: ColumnMapping, data: BridgeData, opts: { overwrite?: boolean } = {}): FillPlan {
  const overwrite = opts.overwrite !== false;
  const cols = Object.keys(mapping).map(Number).filter((c) => mapping[c]).sort((a, b) => a - b);
  const plan: FillPlan = { rows: [], patches: [], filled: 0, noData: 0, kept: 0 };
  for (const m of matches) {
    if (!m.studentId) continue;
    const cells: FillCell[] = [];
    for (const c of cols) {
      const value = fieldValue(data, mapping[c], m.studentId);
      const previous = cellText(sheet.rows[m.row]?.[c]).trim();
      if (value === null || value === '') { cells.push({ c, value: null, previous, skipped: 'empty' }); plan.noData++; continue; }
      if (!overwrite && previous) { cells.push({ c, value, previous, skipped: 'kept' }); plan.kept++; continue; }
      cells.push({ c, value, previous });
      plan.patches.push({ r: m.row, c, value });
      plan.filled++;
    }
    plan.rows.push({ row: m.row, studentId: m.studentId, cells });
  }
  void table;
  return plan;
}

export interface FillResult {
  bytes: Uint8Array;
  /** patched: sửa trong tệp gốc (giữ định dạng). rebuilt: ghi tệp mới sạch. */
  mode: 'patched' | 'rebuilt';
  /** Lời nhắn cho GV khi phải dùng cách dự phòng. */
  note?: string;
  formulasReplaced: number;
  /** Đuôi tệp ra: cùng định dạng tệp gốc khi sửa trực tiếp được. */
  ext: 'xlsx' | 'xls';
}

/** Ghi tệp mới sạch: cùng dòng tiêu đề, thứ tự cột, ô gộp; mất màu sắc / phông chữ của tệp gốc. */
export function rebuildSheet(sheet: XSheet, table: DetectedTable, patches: CellPatch[]): Uint8Array {
  const rows: XCell[][] = sheet.rows.map((r) => [...r]);
  for (const p of patches) {
    while (rows.length <= p.r) rows.push([]);
    rows[p.r][p.c] = p.value;
  }
  const textCols = table.col.code !== undefined ? [table.col.code] : [];
  return writeXlsx([{ name: sheet.name, rows, header: table.headerStart, headerRows: table.headerEnd - table.headerStart + 1, merges: sheet.merges, textCols }]);
}

export function fillTemplate(original: Uint8Array, wb: XWorkbook, sheetIndex: number, table: DetectedTable, plan: FillPlan): FillResult {
  const sheet = wb.sheets[sheetIndex];
  if (wb.format === 'xlsx') {
    try {
      const r = patchXlsx(original, plan.patches, { sheet: sheet.name, styleBelowRow: table.headerEnd });
      // Tự kiểm tra: đọc lại tệp vừa ghi, mọi ô phải đúng giá trị — sai thì dùng cách dự phòng.
      const back = readXlsx(r.bytes).sheets.find((s) => s.name === sheet.name);
      const ok = !!back && plan.patches.every((p) => cellText(back.rows[p.r]?.[p.c]) === cellText(p.value));
      if (ok) return { bytes: r.bytes, mode: 'patched', formulasReplaced: r.formulasReplaced, ext: 'xlsx' };
    } catch (e) {
      if (!(e instanceof XlsxError)) throw e;
    }
  }
  if (wb.format === 'xls') {
    try {
      const r = patchXls(original, [{ sheet: sheet.name, patches: plan.patches, styleBelowRow: table.headerEnd }]);
      const back = readXls(r.bytes).sheets.find((s) => s.name === sheet.name);
      const ok = !!back && plan.patches.every((p) => cellText(back.rows[p.r]?.[p.c] ?? null) === cellText(p.value === '' ? null : p.value));
      if (ok) return { bytes: r.bytes, mode: 'patched', formulasReplaced: 0, ext: 'xls' };
    } catch (e) {
      if (!(e instanceof XlsxError)) throw e;
    }
  }
  const others = wb.sheets.length - 1;
  return {
    bytes: rebuildSheet(sheet, table, plan.patches),
    mode: 'rebuilt',
    formulasReplaced: 0,
    ext: 'xlsx',
    note: wb.format === 'html'
      ? 'Tệp tải lên là bảng dạng web (đuôi .xls) nên không sửa trực tiếp được. Đã tạo tệp .xlsx mới có cùng tiêu đề và thứ tự cột.'
      : `Tệp gốc có cấu trúc ít gặp nên không sửa trực tiếp được. Đã tạo tệp mới có cùng tiêu đề và thứ tự cột (không giữ màu sắc, phông chữ${others > 0 ? `, và bỏ ${others} trang tính khác` : ''}).`,
  };
}

/* ============================ gợi ý & ghi nhớ cách ghép cột ============================ */
/** Khóa ổn định của một cột trong mẫu: nhãn chuẩn hóa + số thứ tự nếu trùng nhãn. */
export function columnKeys(table: DetectedTable): Record<number, string> {
  const seen = new Map<string, number>();
  const out: Record<number, string> = {};
  for (const c of table.columns) {
    const base = normLabel(c.label) || `cot${c.index + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out[c.index] = n > 1 ? `${base}#${n}` : base;
  }
  return out;
}

const SUBJECT_WORDS: [SubjectId, RegExp][] = [
  ['toan', /\btoan\b/],
  ['tieng-viet', /\btieng viet\b|\btv\b/],
  ['tieng-anh', /\btieng anh\b|\bngoai ngu\b|\banh van\b/],
  ['tnxh', /\btu nhien\b|\btnxh\b|\btn xh\b/],
  ['khoa-hoc', /\bkhoa hoc\b/],
  ['mi-thuat', /\bmi thuat\b|\bmy thuat\b/],
  ['am-nhac', /\bam nhac\b/],
  ['lich-su-dia-li', /\blich su\b|\bdia (li|ly)\b|\blsdl\b/],
  ['tin-hoc', /\btin hoc\b/],
  ['cong-nghe', /\bcong nghe\b/],
  ['dao-duc', /\bdao duc\b/],
  ['gdtc', /\bthe chat\b|\bthe duc\b|\bgdtc\b/],
  ['hdtn', /\btrai nghiem\b|\bhdtn\b/],
  ['tieng-dan-toc', /\bdan toc\b|\bkhmer\b|\bhmong\b|\bmong\b|\bcham\b|\bthai\b|\btay\b|\bjrai\b|\bbahnar\b|\bede\b/],
];

/** Đoán trường phù hợp với nhãn cột (GV luôn xem lại). Chỉ gợi ý trường có trong danh mục. */
export function suggestMapping(table: DetectedTable, fields: BridgeField[]): ColumnMapping {
  const has = new Set(fields.map((f) => f.id));
  const out: ColumnMapping = {};
  for (const c of table.columns) {
    if (c.kind !== 'other' || !c.label) continue;
    const n = normLabel(c.label);
    let id = '';
    if (/khong phep|\bkp\b/.test(n)) id = 'att-unexcused';
    else if (/co phep|\bcp\b/.test(n)) id = 'att-excused';
    else if (/di muon|\bmuon\b/.test(n)) id = 'att-late';
    else if (/nhan xet chung|nhan xet cua giao vien|nhan xet gvcn/.test(n)) id = 'tt27-general';
    else {
      const subj = SUBJECT_WORDS.find(([, re]) => re.test(n))?.[0];
      if (subj) {
        if (/nhan xet/.test(n)) id = `tt27-comment:${subj}`;
        else if (/muc dat|muc do|xep loai/.test(n)) id = `tt27-level:${subj}`;
        else if (/diem|ktdk|kiem tra/.test(n)) id = `tt27-score:${subj}`;
      }
      if (!id) {
        for (const [k, label] of Object.entries(TT27_QUALITY_LABEL)) if (n.includes(foldVietnamese(label))) id = `tt27-qual:${k}`;
        for (const [k, label] of Object.entries(TT27_COMPETENCY_LABEL)) if (n.includes(normLabel(label))) id = `tt27-comp:${k}`;
      }
    }
    if (id && has.has(id)) out[c.index] = id;
  }
  return out;
}
void SUBJECTS;

const STORE_KEY = 'openedu.bridge.mappings.v1';
interface SavedMapping { savedAt: string; sheetName: string; byKey: Record<string, string> }

function store(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
function readAll(): Record<string, SavedMapping> {
  try { return JSON.parse(store()?.getItem(STORE_KEY) ?? '{}') as Record<string, SavedMapping>; } catch { return {}; }
}

/** Cách ghép cột đã lưu cho mẫu này (theo dấu vân tay), đổi về chỉ số cột của tệp hiện tại. */
export function loadSavedMapping(table: DetectedTable): { mapping: ColumnMapping; savedAt: string } | null {
  const hit = readAll()[table.fingerprint];
  if (!hit) return null;
  const keys = columnKeys(table);
  const mapping: ColumnMapping = {};
  for (const [c, k] of Object.entries(keys)) if (hit.byKey[k]) mapping[Number(c)] = hit.byKey[k];
  return { mapping, savedAt: hit.savedAt };
}

export function saveMapping(table: DetectedTable, mapping: ColumnMapping): void {
  const s = store();
  if (!s) return;
  const keys = columnKeys(table);
  const byKey: Record<string, string> = {};
  for (const [c, f] of Object.entries(mapping)) if (f && keys[Number(c)]) byKey[keys[Number(c)]] = f;
  const all = readAll();
  all[table.fingerprint] = { savedAt: new Date().toISOString(), sheetName: table.sheetName, byKey };
  // Giữ tối đa 30 mẫu gần nhất.
  const trimmed = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].savedAt.localeCompare(a[1].savedAt)).slice(0, 30));
  try { s.setItem(STORE_KEY, JSON.stringify(trimmed)); } catch { /* hết chỗ: bỏ qua */ }
}

export function forgetMapping(table: DetectedTable): void {
  const all = readAll();
  delete all[table.fingerprint];
  try { store()?.setItem(STORE_KEY, JSON.stringify(all)); } catch { /* bỏ qua */ }
}
