/**
 * Điền giá trị vào các ô của một tệp .xlsx CÓ SẴN mà không làm mất định dạng: chỉ sửa XML của trang tính cần điền
 * (và thêm chuỗi vào sharedStrings), mọi phần khác trong tệp zip giữ nguyên từng byte (kiểu ô, ô gộp, trang tính khác,
 * hình, in ấn…). Tệp "lạ" (XML có tiền tố không gian tên, thiếu sheetData…) → ném XlsxError('exotic') để nơi gọi
 * chuyển sang cách dự phòng (ghi tệp mới sạch).
 */
import { strToU8, zipSync } from 'fflate';
import { XlsxError, attr, cellRef, listSheetEntries, openZip, parseRef, xmlEscape, zipText, type ZipFiles } from './xlsx';

export interface CellPatch {
  /** Chỉ số dòng / cột bắt đầu từ 0. */
  r: number;
  c: number;
  /** null / '' = xóa giá trị ô (giữ kiểu ô). */
  value: string | number | null;
}

export interface PatchOptions {
  /** Tên hoặc chỉ số trang tính (mặc định trang đầu). */
  sheet?: string | number;
  /**
   * Ô mới (chưa có trong tệp) mượn kiểu ô của ô gần nhất phía trên cùng cột — nhưng chỉ từ các dòng SAU dòng này
   * (thường là dòng tiêu đề cuối) để không lấy kiểu chữ đậm của tiêu đề.
   */
  styleBelowRow?: number;
}

export interface PatchResult {
  bytes: Uint8Array;
  patched: number;
  /** Số ô có công thức đã bị thay bằng giá trị. */
  formulasReplaced: number;
}

interface SharedStrings {
  add(s: string): number | null;
  finish(files: ZipFiles): void;
}

function openSharedStrings(files: ZipFiles): SharedStrings {
  const path = 'xl/sharedStrings.xml';
  const xml = zipText(files, path);
  if (!xml || !/<sst\b/.test(xml)) return { add: () => null, finish: () => undefined };
  let count = (xml.match(/<si\b/g) ?? []).length;
  const added: string[] = [];
  const seen = new Map<string, number>();
  return {
    add(s) {
      const hit = seen.get(s);
      if (hit !== undefined) return hit;
      const i = count++;
      seen.set(s, i);
      added.push(`<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`);
      return i;
    },
    finish(f) {
      if (!added.length) return;
      let out: string;
      if (/<sst\b[^>]*\/>/.test(xml)) out = xml.replace(/<sst\b([^>]*)\/>/, (_m, a: string) => `<sst${a}>${added.join('')}</sst>`);
      else out = xml.replace(/<\/sst>\s*$/, `${added.join('')}</sst>`);
      out = out.replace(/<sst\b[^>]*>/, (tag) => tag.replace(/\s(count|uniqueCount)="\d+"/g, ''));
      f[path] = strToU8(out);
    },
  };
}

function dropCalcChain(files: ZipFiles): void {
  if (!files['xl/calcChain.xml']) return;
  delete files['xl/calcChain.xml'];
  const ct = zipText(files, '[Content_Types].xml');
  if (ct) files['[Content_Types].xml'] = strToU8(ct.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
  const rels = zipText(files, 'xl/_rels/workbook.xml.rels');
  if (rels) files['xl/_rels/workbook.xml.rels'] = strToU8(rels.replace(/<Relationship\b[^>]*Target="calcChain\.xml"[^>]*\/>/, ''));
}

const ROW_RE = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

/** Điền các ô vào tệp .xlsx gốc; trả về tệp mới. */
export function patchXlsx(data: Uint8Array | ArrayBuffer, patches: CellPatch[], opts: PatchOptions = {}): PatchResult {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const files = openZip(bytes);
  if (files['EncryptedPackage']) throw new XlsxError('Tệp Excel đang đặt mật khẩu.', 'encrypted');
  const { sheets } = listSheetEntries(files);
  const entry = typeof opts.sheet === 'string' ? sheets.find((s) => s.name === opts.sheet) : sheets[opts.sheet ?? 0];
  if (!entry) throw new XlsxError('Không tìm thấy trang tính cần điền.', 'exotic');
  const xml = zipText(files, entry.path) ?? '';
  if (/<\w+:(sheetData|row|c)\b/.test(xml)) throw new XlsxError('Tệp dùng kiểu XML ít gặp nên không điền trực tiếp được.', 'exotic');
  const sdOpen = /<sheetData\b[^>]*?(\/?)>/.exec(xml);
  if (!sdOpen) throw new XlsxError('Trang tính không có vùng dữ liệu.', 'exotic');
  const start = sdOpen.index;
  let innerStart = start + sdOpen[0].length;
  let innerEnd = innerStart;
  let end = innerStart;
  if (sdOpen[1] !== '/') {
    innerEnd = xml.indexOf('</sheetData>', innerStart);
    if (innerEnd < 0) throw new XlsxError('Trang tính hỏng (thiếu thẻ đóng).', 'exotic');
    end = innerEnd + '</sheetData>'.length;
  } else {
    innerStart = innerEnd = end;
  }
  const inner = xml.slice(innerStart, innerEnd);

  // Gom bản vá theo dòng; bản vá sau ghi đè bản vá trước cùng ô.
  const byRow = new Map<number, Map<number, string | number | null>>();
  for (const p of patches) {
    if (!(p.r >= 0 && p.c >= 0)) continue;
    let m = byRow.get(p.r);
    if (!m) byRow.set(p.r, (m = new Map()));
    m.set(p.c, p.value === '' ? null : p.value);
  }
  const shared = openSharedStrings(files);
  const styleFrom = opts.styleBelowRow ?? -1;
  const lastStyle = new Map<number, string>();
  let patched = 0;
  let formulasReplaced = 0;

  const makeCell = (r: number, c: number, value: string | number | null, keepAttrs: string | null): string => {
    const ref = cellRef(r, c);
    let s = keepAttrs !== null ? attr(keepAttrs, 's') : lastStyle.get(c);
    if (s === '0') s = undefined;
    const sAttr = s !== undefined ? ` s="${s}"` : '';
    patched++;
    if (value === null) return sAttr ? `<c r="${ref}"${sAttr}/>` : '';
    if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${sAttr}><v>${value}</v></c>` : `<c r="${ref}"${sAttr}/>`;
    const i = shared.add(value);
    if (i !== null) return `<c r="${ref}"${sAttr} t="s"><v>${i}</v></c>`;
    return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  };

  const buildRow = (r: number, attrs: string, body: string | undefined, rowPatches: Map<number, string | number | null> | undefined): string => {
    if (!rowPatches) {
      if (r > styleFrom && body) for (const cm of body.matchAll(CELL_RE)) { const ref = attr(cm[1], 'r'); const s = attr(cm[1], 's'); if (ref && s) lastStyle.set(parseRef(ref).c, s); }
      return body === undefined ? `<row${attrs}/>` : `<row${attrs}>${body}</row>`;
    }
    const pending = new Map(rowPatches);
    const cols = [...pending.keys()].sort((a, b) => a - b);
    let out = '';
    let pi = 0;
    let next = 0;
    const flushBefore = (limit: number) => {
      while (pi < cols.length && cols[pi] < limit) {
        const c = cols[pi++];
        if (pending.has(c)) { out += makeCell(r, c, pending.get(c) ?? null, null); pending.delete(c); }
      }
    };
    for (const cm of (body ?? '').matchAll(CELL_RE)) {
      const ref = attr(cm[1], 'r');
      const c = ref ? parseRef(ref).c : next;
      next = c + 1;
      flushBefore(c);
      if (pending.has(c)) {
        if (cm[2] && /<f\b/.test(cm[2])) formulasReplaced++;
        out += makeCell(r, c, pending.get(c) ?? null, cm[1]);
        pending.delete(c);
        while (pi < cols.length && cols[pi] <= c) pi++;
      } else {
        out += ref ? cm[0] : cm[0].replace(/^<c\b/, `<c r="${cellRef(r, c)}"`);
      }
      const s = attr(cm[1], 's');
      if (r > styleFrom && s) lastStyle.set(c, s);
    }
    flushBefore(Number.MAX_SAFE_INTEGER);
    const cleanAttrs = attrs.replace(/\sspans="[^"]*"/, '');
    return `<row${cleanAttrs}>${out}</row>`;
  };

  const rowNums = [...byRow.keys()].sort((a, b) => a - b);
  let ri = 0;
  let rebuilt = '';
  let nextRow = 0;
  let last = 0;
  for (const rm of inner.matchAll(ROW_RE)) {
    rebuilt += inner.slice(last, rm.index);
    last = (rm.index ?? 0) + rm[0].length;
    const rAttr = attr(rm[1], 'r');
    const r = rAttr ? parseInt(rAttr, 10) - 1 : nextRow;
    nextRow = r + 1;
    while (ri < rowNums.length && rowNums[ri] < r) {
      const nr = rowNums[ri++];
      rebuilt += buildRow(nr, ` r="${nr + 1}"`, '', byRow.get(nr));
    }
    const mine = ri < rowNums.length && rowNums[ri] === r ? byRow.get(rowNums[ri++]) : undefined;
    rebuilt += buildRow(r, rAttr ? rm[1] : ` r="${r + 1}"${rm[1]}`, rm[2], mine);
  }
  rebuilt += inner.slice(last);
  while (ri < rowNums.length) {
    const nr = rowNums[ri++];
    rebuilt += buildRow(nr, ` r="${nr + 1}"`, '', byRow.get(nr));
  }

  let outXml = `${xml.slice(0, start)}<sheetData>${rebuilt}</sheetData>${xml.slice(end)}`;
  // Vùng dữ liệu khai báo (dimension) có thể nhỏ hơn sau khi điền — bỏ đi, Excel tự tính lại.
  outXml = outXml.replace(/<dimension\b[^>]*\/>/, '');
  files[entry.path] = strToU8(outXml);
  shared.finish(files);
  if (formulasReplaced) dropCalcChain(files);
  return { bytes: zipSync(files, { level: 6 }), patched, formulasReplaced };
}
