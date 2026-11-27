/**
 * Đọc / ghi .xlsx tối giản trên fflate (xlsx = zip các tệp XML). Tự chứa, không phụ thuộc thư viện Excel.
 *  - Ghi: chuỗi nội tuyến (inlineStr), số, dòng tiêu đề đậm + cố định, độ rộng cột, danh sách chọn (data validation).
 *  - Đọc: sharedStrings (kể cả rich text), inlineStr, số, boolean, công thức đã tính (lấy <v>); trang tính đầu tiên
 *    hoặc theo tên. Bỏ qua định dạng, ngày tháng (trả số gốc), ô gộp.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type XlsxCell = string | number | null | undefined;

export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
  /** Độ rộng cột (đơn vị kí tự). */
  widths?: number[];
  /** Số dòng tiêu đề (đậm + cố định khi cuộn). Mặc định 1. */
  headerRows?: number;
  /** Danh sách chọn cho cả cột (từ dòng 2). `col` tính từ 0. */
  lists?: { col: number; values: string[] }[];
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Tệp Excel lớn hơn mức này bị từ chối (ngân hàng câu hỏi dạng chữ không bao giờ tới mức đó). */
export const XLSX_MAX_BYTES = 8 * 1024 * 1024;
export const XLSX_MAX_ROWS = 5000;

/* ---------------- XML ---------------- */
export function xmlEscape(s: string): string {
  return s
    // kí tự điều khiển không hợp lệ trong XML 1.0
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function xmlUnescape(s: string): string {
  return s
    .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (all, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      }
      return ENT[e] ?? all;
    })
    // Excel mã hoá kí tự điều khiển dạng _x000D_
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_all, h: string) => {
      const c = parseInt(h, 16);
      return c === 13 ? '' : c === 10 || c === 9 ? String.fromCharCode(c) : '';
    });
}

export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/* ---------------- ghi ---------------- */
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '</cellXfs></styleSheet>';

function sheetXml(s: XlsxSheet): string {
  const head = s.headerRows ?? 1;
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];
  if (head > 0) out.push(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${head}" topLeftCell="A${head + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`);
  if (s.widths?.length) out.push(`<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
  out.push('<sheetData>');
  s.rows.forEach((row, r) => {
    const cells: string[] = [];
    row.forEach((v, c) => {
      if (v === null || v === undefined || v === '') return;
      const ref = `${colName(c)}${r + 1}`;
      const style = r < head ? 1 : 2;
      if (typeof v === 'number' && Number.isFinite(v)) cells.push(`<c r="${ref}"><v>${v}</v></c>`);
      else cells.push(`<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`);
    });
    out.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  });
  out.push('</sheetData>');
  const lists = (s.lists ?? []).filter((l) => l.values.length && l.values.join(',').length <= 250);
  if (lists.length) {
    out.push(`<dataValidations count="${lists.length}">`);
    for (const l of lists) {
      const col = colName(l.col);
      out.push(`<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${col}${head + 1}:${col}${XLSX_MAX_ROWS}"><formula1>${xmlEscape(`"${l.values.join(',')}"`)}</formula1></dataValidation>`);
    }
    out.push('</dataValidations>');
  }
  out.push('</worksheet>');
  return out.join('');
}

/** Tên trang tính: ≤ 31 kí tự, không có \ / ? * [ ] : */
function sheetName(n: string, i: number): string {
  return (n.replace(/[\\/?*[\]:]/g, ' ').trim() || `Sheet${i + 1}`).slice(0, 31);
}

export function writeXlsx(sheets: XlsxSheet[]): Uint8Array {
  if (!sheets.length) throw new Error('Cần ít nhất một trang tính.');
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, xml: string): void => {
    files[path] = strToU8(xml);
  };
  const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  put('[Content_Types].xml', `${H}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  put('_rels/.rels', `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  put('xl/workbook.xml', `${H}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(sheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  put('xl/_rels/workbook.xml.rels', `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  put('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => put(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zipSync(files, { level: 6 });
}

/* ---------------- đọc ---------------- */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? xmlUnescape(m[1] ?? m[2] ?? '') : null;
}

/** Ghép mọi <t> trong một <si>/<is> (bỏ phần phiên âm <rPh>). */
function richText(xml: string): string {
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of body.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += xmlUnescape(m[1] ?? '');
  return out;
}

function numText(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  // 0.1+0.2 → "0.3"; số nguyên lớn giữ nguyên
  return String(Number(n.toPrecision(15)));
}

export interface ReadXlsxResult {
  sheetNames: string[];
  /** Các dòng của trang tính được chọn; ô trống là ''. Dòng trống hoàn toàn vẫn giữ (để tính số dòng). */
  rows: string[][];
  truncated: boolean;
}

function normPath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/^\//, '').split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export function readXlsx(data: Uint8Array, opts: { sheet?: string | number } = {}): ReadXlsxResult {
  if (data.length > XLSX_MAX_BYTES) throw new Error('Tệp Excel quá lớn (tối đa 8 MB).');
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new Error('Đây không phải tệp Excel .xlsx. Nếu là tệp .xls đời cũ, thầy/cô mở bằng Excel rồi "Lưu thành" .xlsx nhé.');
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/i.test(f.name) && f.originalSize < 60 * 1024 * 1024 });
  } catch {
    throw new Error('Không mở được tệp Excel này (tệp hỏng hoặc có mật khẩu).');
  }
  const text = (name: string): string | null => {
    const key = Object.keys(files).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? strFromU8(files[key]) : null;
  };
  const wb = text('xl/workbook.xml');
  if (!wb) throw new Error('Tệp không có bảng tính nào (không phải .xlsx hợp lệ).');
  const rels: Record<string, string> = {};
  for (const m of (text('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) rels[id] = normPath(target.startsWith('/') ? target : `xl/${target}`);
  }
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m, i) => ({
    name: attr(m[0], 'name') ?? `Sheet${i + 1}`,
    path: rels[attr(m[0], 'r:id') ?? ''] ?? `xl/worksheets/sheet${i + 1}.xml`,
  }));
  const pick = typeof opts.sheet === 'number' ? sheets[opts.sheet] : typeof opts.sheet === 'string' ? sheets.find((s) => s.name === opts.sheet) : sheets[0];
  const xml = pick ? text(pick.path) ?? text('xl/worksheets/sheet1.xml') : text('xl/worksheets/sheet1.xml');
  if (!xml) throw new Error('Không đọc được trang tính trong tệp Excel.');

  const shared: string[] = [];
  const ss = text('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) shared.push(richText(m[1] ?? ''));

  const rows: string[][] = [];
  let truncated = false;
  let auto = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = attr(rm[1], 'r');
    const r = rAttr ? Number(rAttr) - 1 : auto;
    auto = r + 1;
    if (r >= XLSX_MAX_ROWS) {
      truncated = true;
      break;
    }
    const row: string[] = [];
    let c = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      const ci = ref ? colIndex(ref) : c;
      c = ci + 1;
      if (ci < 0 || ci > 255) continue;
      const t = attr(cm[1], 't');
      const body = cm[2] ?? '';
      const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
      let val = '';
      if (t === 'inlineStr') val = richText(body);
      else if (t === 's') val = shared[Number(v?.[1] ?? -1)] ?? '';
      else if (t === 'b') val = v?.[1] === '1' ? 'TRUE' : 'FALSE';
      else if (t === 'str' || t === 'e') val = xmlUnescape(v?.[1] ?? '');
      else if (v) val = numText(v[1].trim());
      else if (body.includes('<is>')) val = richText(body);
      row[ci] = val;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
    while (rows.length < r) rows.push([]);
    rows[r] = row;
  }
  return { sheetNames: sheets.map((s) => s.name), rows, truncated };
}
