/**
 * Đọc / ghi tệp Excel .xlsx (OOXML) — bản nhỏ tự viết trên `fflate`, không cần thư viện Excel lớn.
 *
 * Đọc: chữ tiếng Việt, số / chữ (mã học sinh có số 0 đứng đầu vẫn là chữ nếu ô là chữ), ngày tháng (theo định dạng ô),
 *      nhiều trang tính, ô gộp. Ghi: nhiều trang tính, độ rộng cột, dòng tiêu đề đậm, ô gộp, cố định dòng tiêu đề.
 * Tệp .xls kiểu cũ (BIFF8, VnEdu cho tải về) đọc qua `./xls`. Tệp "xls" thực chất là bảng HTML cũng đọc được
 * (readHtmlTable). Không hỗ trợ: tệp có mật khẩu.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { isCfb, readXls } from './xls';

export type XCell = string | number | boolean | Date | null;

export interface XMerge { r1: number; c1: number; r2: number; c2: number }

export interface XSheet {
  name: string;
  /** Mảng dày: rows[r][c], ô trống = null. Chỉ số bắt đầu từ 0. */
  rows: XCell[][];
  merges: XMerge[];
  hidden?: boolean;
}

export interface XWorkbook {
  sheets: XSheet[];
  /** 'xlsx', 'xls' (BIFF8 kiểu cũ) hoặc 'html' (tệp .xls thực chất là bảng HTML). */
  format: 'xlsx' | 'xls' | 'html';
}

export class XlsxError extends Error {
  constructor(message: string, readonly code: 'not-xlsx' | 'old-xls' | 'encrypted' | 'broken' | 'exotic') {
    super(message);
    this.name = 'XlsxError';
  }
}

/* ============================ tiện ích XML ============================ */
export function xmlEscape(s: string): string {
  return s
    .replace(/[^\x09\x0A\x0D\x20-퟿-�\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function xmlUnescape(s: string): string {
  if (!s.includes('&') && !s.includes('_x')) return s;
  return s
    .replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (_m, e: string) => {
      if (e === 'lt') return '<';
      if (e === 'gt') return '>';
      if (e === 'quot') return '"';
      if (e === 'apos') return "'";
      if (e === 'amp') return '&';
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
}

export function attr(tagAttrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tagAttrs);
  return m ? xmlUnescape(m[2] ?? m[3] ?? '') : undefined;
}

/** "A" → 0, "AB" → 27. */
export function colIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) & 31);
  return n - 1;
}
export function colLetters(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/** "C7" → { r: 6, c: 2 } */
export function parseRef(ref: string): { r: number; c: number } {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(ref.trim());
  if (!m) return { r: 0, c: 0 };
  return { r: parseInt(m[2], 10) - 1, c: colIndex(m[1].toUpperCase()) };
}
export function cellRef(r: number, c: number): string {
  return `${colLetters(c)}${r + 1}`;
}

/* ============================ ngày tháng ============================ */
const DAY_MS = 86_400_000;
export function serialToDate(serial: number, date1904 = false): Date {
  return new Date(Math.round((serial - (date1904 ? 24107 : 25569)) * DAY_MS));
}
export function dateToSerial(d: Date): number {
  return d.getTime() / DAY_MS + 25569;
}
/** dd/mm/yyyy (theo giờ UTC — ngày trong Excel không có múi giờ). */
export function formatVnDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
/** Chữ hiển thị của một ô (xem trước, so khớp). */
export function cellText(v: XCell | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatVnDate(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

function isDateFormat(id: number, code: string | undefined): boolean {
  if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
  if (!code) return false;
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(bare) && !/[0#?]/.test(bare.replace(/s+\.0+/gi, ''));
}

/* ============================ đọc ============================ */
export interface ZipFiles { [path: string]: Uint8Array }

export function openZip(bytes: Uint8Array): ZipFiles {
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new XlsxError('Đây là tệp Excel kiểu cũ (.xls) hoặc tệp có mật khẩu. Thầy cô mở tệp bằng Excel, chọn Lưu thành → "Excel Workbook (.xlsx)" rồi tải lên lại nhé.', 'old-xls');
  }
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new XlsxError('Tệp này không phải tệp Excel .xlsx.', 'not-xlsx');
  try {
    return unzipSync(bytes);
  } catch {
    throw new XlsxError('Không mở được tệp Excel (tệp hỏng hoặc tải chưa xong).', 'broken');
  }
}

export function zipText(files: ZipFiles, path: string): string | undefined {
  const f = files[path] ?? files[path.replace(/^\//, '')];
  if (!f) return undefined;
  const s = strFromU8(f);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export interface SheetEntry { name: string; path: string; hidden: boolean }

export function listSheetEntries(files: ZipFiles): { sheets: SheetEntry[]; date1904: boolean } {
  const wb = zipText(files, 'xl/workbook.xml');
  if (!wb) throw new XlsxError('Tệp Excel thiếu phần "workbook" — không đọc được.', 'broken');
  const rels = zipText(files, 'xl/_rels/workbook.xml.rels') ?? '';
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id');
    const t = attr(m[1], 'Target');
    if (id && t) targets.set(id, resolvePath('xl/workbook.xml', t));
  }
  const sheets: SheetEntry[] = [];
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], 'name') ?? `Sheet${sheets.length + 1}`;
    const rid = attr(m[1], 'r:id') ?? attr(m[1], '\\w+:id');
    const path = (rid && targets.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const state = attr(m[1], 'state');
    if (files[path]) sheets.push({ name, path, hidden: !!state && state !== 'visible' });
  }
  return { sheets, date1904: /<(?:\w+:)?workbookPr\b[^>]*date1904\s*=\s*"(1|true)"/.test(wb) };
}

/** Chữ trong một phần tử <si> hoặc <is>: gộp các <t>, bỏ phiên âm <rPh>. */
function richText(inner: string): string {
  const noPh = inner.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  let out = '';
  for (const m of noPh.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) out += xmlUnescape(m[1] ?? '');
  return out;
}

export function readSharedStrings(files: ZipFiles): string[] {
  const xml = zipText(files, 'xl/sharedStrings.xml');
  if (!xml) return [];
  const out: string[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)) out.push(richText(m[1] ?? ''));
  return out;
}

/** Với mỗi chỉ số kiểu ô (s="…"): có phải định dạng ngày không. */
function readDateStyles(files: ZipFiles): boolean[] {
  const xml = zipText(files, 'xl/styles.xml');
  if (!xml) return [];
  const custom = new Map<number, string>();
  for (const m of xml.matchAll(/<(?:\w+:)?numFmt\b([^>]*)\/?>/g)) {
    const id = Number(attr(m[1], 'numFmtId'));
    if (Number.isFinite(id)) custom.set(id, attr(m[1], 'formatCode') ?? '');
  }
  const xfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(xml)?.[1] ?? '';
  const out: boolean[] = [];
  for (const m of xfs.matchAll(/<(?:\w+:)?xf\b([^>]*?)\/?>/g)) {
    const id = Number(attr(m[1], 'numFmtId') ?? 0);
    out.push(isDateFormat(id, custom.get(id)));
  }
  return out;
}

const ROW_RE = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
const CELL_RE = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;

function parseSheet(xml: string, shared: string[], dateStyles: boolean[], date1904: boolean): { rows: XCell[][]; merges: XMerge[] } {
  const rows: XCell[][] = [];
  let width = 0;
  let nextRow = 0;
  for (const rm of xml.matchAll(ROW_RE)) {
    const rAttr = attr(rm[1], 'r');
    const r = rAttr ? parseInt(rAttr, 10) - 1 : nextRow;
    nextRow = r + 1;
    if (!rm[2] || r > 200_000) continue;
    const row: XCell[] = rows[r] ?? (rows[r] = []);
    let nextCol = 0;
    for (const cm of rm[2].matchAll(CELL_RE)) {
      const ref = attr(cm[1], 'r');
      const c = ref ? parseRef(ref).c : nextCol;
      nextCol = c + 1;
      const inner = cm[2];
      if (inner === undefined) continue;
      const t = attr(cm[1], 't') ?? 'n';
      const vm = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
      const raw = vm ? xmlUnescape(vm[1]) : undefined;
      let v: XCell = null;
      if (t === 's') v = raw !== undefined ? shared[parseInt(raw, 10)] ?? '' : null;
      else if (t === 'inlineStr') v = richText(inner);
      else if (t === 'str') v = raw ?? '';
      else if (t === 'b') v = raw === '1';
      else if (t === 'e') v = null;
      else if (t === 'd') v = raw ? new Date(raw) : null;
      else if (raw !== undefined && raw !== '') {
        const n = Number(raw);
        if (Number.isFinite(n)) v = dateStyles[Number(attr(cm[1], 's') ?? 0)] ? serialToDate(n, date1904) : n;
        else v = raw;
      }
      if (v === '') v = null;
      if (v !== null) {
        row[c] = v;
        if (c + 1 > width) width = c + 1;
      }
    }
  }
  const dense: XCell[][] = [];
  for (let r = 0; r < rows.length; r++) {
    const src = rows[r] ?? [];
    const row: XCell[] = new Array<XCell>(width).fill(null);
    for (let c = 0; c < width; c++) if (src[c] !== undefined) row[c] = src[c];
    dense.push(row);
  }
  const merges: XMerge[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?mergeCell\b([^>]*)\/?>/g)) {
    const ref = attr(m[1], 'ref');
    if (!ref) continue;
    const [a, b] = ref.split(':');
    const p1 = parseRef(a);
    const p2 = parseRef(b ?? a);
    merges.push({ r1: Math.min(p1.r, p2.r), c1: Math.min(p1.c, p2.c), r2: Math.max(p1.r, p2.r), c2: Math.max(p1.c, p2.c) });
  }
  return { rows: dense, merges };
}

function toBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Đọc .xlsx, .xls kiểu cũ (BIFF8), và tệp .xls thực chất là HTML (một số phần mềm trường xuất như vậy). */
export function readXlsx(data: Uint8Array | ArrayBuffer): XWorkbook {
  const bytes = toBytes(data);
  if (isCfb(bytes)) return readXls(bytes);
  const head = strFromU8(bytes.subarray(0, 512)).replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('<') && /<(html|table|\?xml|!doctype|meta|style)/.test(head) && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const sheets = readHtmlTables(strFromU8(bytes));
    if (!sheets.length) throw new XlsxError('Tệp này không có bảng nào để đọc.', 'not-xlsx');
    return { sheets, format: 'html' };
  }
  const files = openZip(bytes);
  if (files['EncryptedPackage']) throw new XlsxError('Tệp Excel đang đặt mật khẩu. Thầy cô bỏ mật khẩu rồi tải lên lại nhé.', 'encrypted');
  const { sheets: entries, date1904 } = listSheetEntries(files);
  if (!entries.length) throw new XlsxError('Tệp Excel không có trang tính nào.', 'broken');
  const shared = readSharedStrings(files);
  const dateStyles = readDateStyles(files);
  const sheets: XSheet[] = entries.map((e) => {
    const parsed = parseSheet(zipText(files, e.path) ?? '', shared, dateStyles, date1904);
    return { name: e.name, rows: parsed.rows, merges: parsed.merges, ...(e.hidden ? { hidden: true } : {}) };
  });
  return { sheets, format: 'xlsx' };
}

/** Bảng HTML (tệp ".xls" giả): mỗi <table> là một trang tính; colspan/rowspan thành ô gộp. */
export function readHtmlTables(html: string): XSheet[] {
  const out: XSheet[] = [];
  const strip = (s: string) => xmlUnescape(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')).replace(/[ \t]+/g, ' ').trim();
  let i = 0;
  for (const tm of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows: XCell[][] = [];
    const merges: XMerge[] = [];
    const taken = new Set<string>();
    let r = 0;
    for (const rm of tm[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const row: XCell[] = (rows[r] = rows[r] ?? []);
      let c = 0;
      for (const cm of rm[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
        while (taken.has(`${r}:${c}`)) c++;
        const cs = Math.max(1, parseInt(attr(cm[1], 'colspan') ?? '1', 10) || 1);
        const rs = Math.max(1, parseInt(attr(cm[1], 'rowspan') ?? '1', 10) || 1);
        const text = strip(cm[2]);
        row[c] = text === '' ? null : /^-?\d+([.,]\d+)?$/.test(text) && !/^0\d/.test(text) && text.length < 12 ? Number(text.replace(',', '.')) : text;
        if (cs > 1 || rs > 1) {
          merges.push({ r1: r, c1: c, r2: r + rs - 1, c2: c + cs - 1 });
          for (let a = 0; a < rs; a++) for (let b = 0; b < cs; b++) if (a || b) taken.add(`${r + a}:${c + b}`);
        }
        c += cs;
      }
      r++;
    }
    const width = rows.reduce((w, row) => Math.max(w, row.length), 0);
    if (!width) continue;
    out.push({ name: `Bảng ${++i}`, merges, rows: rows.map((row) => Array.from({ length: width }, (_x, c) => row[c] ?? null)) });
  }
  return out;
}

/* ============================ ghi ============================ */
export interface XSheetSpec {
  name: string;
  rows: XCell[][];
  /** Chỉ số dòng tiêu đề cột (mặc định 0). Các dòng phía trên là tên bảng (chữ đậm, không kẻ ô). */
  header?: number;
  /** Số dòng tiêu đề (mặc định 1). */
  headerRows?: number;
  /** Độ rộng cột (kí tự). Thiếu thì tự tính theo nội dung. */
  widths?: (number | undefined)[];
  merges?: XMerge[];
  /** Cột luôn là chữ (định dạng "Text"), vd mã học sinh. */
  textCols?: number[];
  /** Cố định dòng tiêu đề khi cuộn (mặc định có). */
  freeze?: boolean;
}

const STYLE = { plain: 0, header: 1, text: 2, date: 3, body: 4, title: 5 } as const;

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
  '<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="13"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** Tên trang tính hợp lệ: ≤ 31 kí tự, không có []:*?/\ và không trùng. */
export function safeSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Sheet').slice(0, 31);
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

function autoWidth(rows: XCell[][], c: number, from: number): number {
  let w = 6;
  for (let r = from; r < rows.length; r++) {
    const t = cellText(rows[r]?.[c]);
    const longest = t.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
    if (longest > w) w = longest;
  }
  return Math.min(60, w + 2);
}

export function writeXlsx(specs: XSheetSpec[]): Uint8Array {
  if (!specs.length) throw new Error('Cần ít nhất một trang tính.');
  const strings: string[] = [];
  const index = new Map<string, number>();
  let total = 0;
  const si = (s: string): number => {
    total++;
    let i = index.get(s);
    if (i === undefined) {
      i = strings.length;
      strings.push(s);
      index.set(s, i);
    }
    return i;
  };
  const used = new Set<string>();
  const names = specs.map((s) => safeSheetName(s.name, used));
  const files: Record<string, Uint8Array> = {};
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  specs.forEach((spec, i) => {
    const header = spec.header ?? 0;
    const headerEnd = header + (spec.headerRows ?? 1) - 1;
    const width = spec.rows.reduce((w, r) => Math.max(w, r.length), 0);
    const textCols = new Set(spec.textCols ?? []);
    let data = '';
    spec.rows.forEach((row, r) => {
      let cells = '';
      const isHead = r >= header && r <= headerEnd;
      const isTitle = r < header;
      for (let c = 0; c < (isTitle ? row.length : width); c++) {
        const v = row[c] ?? null;
        const ref = cellRef(r, c);
        const base = isHead ? STYLE.header : isTitle ? STYLE.title : textCols.has(c) ? STYLE.text : STYLE.body;
        if (v === null || v === '') {
          if (!isTitle) cells += `<c r="${ref}" s="${base}"/>`;
        } else if (typeof v === 'number') {
          cells += Number.isFinite(v) ? `<c r="${ref}" s="${base}"><v>${v}</v></c>` : `<c r="${ref}" s="${base}"/>`;
        } else if (typeof v === 'boolean') {
          cells += `<c r="${ref}" s="${base}" t="b"><v>${v ? 1 : 0}</v></c>`;
        } else if (v instanceof Date) {
          cells += Number.isNaN(v.getTime()) ? `<c r="${ref}" s="${base}"/>` : `<c r="${ref}" s="${isHead ? STYLE.header : STYLE.date}"><v>${dateToSerial(v)}</v></c>`;
        } else {
          cells += `<c r="${ref}" s="${base}" t="s"><v>${si(v)}</v></c>`;
        }
      }
      data += cells ? `<row r="${r + 1}">${cells}</row>` : '';
    });
    let cols = '';
    for (let c = 0; c < width; c++) {
      const w = spec.widths?.[c] ?? autoWidth(spec.rows, c, header);
      cols += `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`;
    }
    const freeze = spec.freeze !== false && spec.rows.length > headerEnd + 1
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerEnd + 1}" topLeftCell="A${headerEnd + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '';
    const merges = spec.merges?.length
      ? `<mergeCells count="${spec.merges.length}">${spec.merges.map((m) => `<mergeCell ref="${cellRef(m.r1, m.c1)}:${cellRef(m.r2, m.c2)}"/>`).join('')}</mergeCells>`
      : '';
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `${X}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${data}</sheetData>${merges}</worksheet>`,
    );
  });

  const out: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      specs.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(`${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(
      `${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      specs.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${specs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${specs.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(STYLES_XML),
    'xl/sharedStrings.xml': strToU8(
      `${X}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${total}" uniqueCount="${strings.length}">` +
      strings.map((s) => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`).join('') + '</sst>',
    ),
    ...files,
  };
  return zipSync(out, { level: 6 });
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Trình duyệt: tải tệp nhị phân về máy. */
export function downloadBytes(fileName: string, bytes: Uint8Array, type = XLSX_MIME): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
