/**
 * Lấy chữ từ tệp Word .docx (zip chứa word/document.xml) — đủ cho đề kiểm tra dạng chữ.
 *  - Mỗi đoạn (w:p) là một dòng; w:br / w:cr xuống dòng; w:tab thành khoảng trắng rộng.
 *  - Bảng: các ô trong một hàng ghép trên một dòng (đề hay xếp A/B/C/D trong bảng; bảng đáp án "Câu 1 2 3 / Đáp án B C A").
 *  - Đoạn chữ ĐẬM / GẠCH CHÂN / TÔ NỀN / CHỮ ĐỎ trong một lựa chọn (đoạn bắt đầu bằng "A.", "B)"…) được đánh dấu ✓
 *    để bộ đọc văn bản hiểu là đáp án đúng. Không dùng cho đoạn mà mọi chữ đều đậm.
 *  - KHÔNG đọc được: số thứ tự tự động của Word (danh sách đánh số), hình ảnh, công thức phức tạp, hộp văn bản.
 */
import { strFromU8, unzipSync } from 'fflate';
import { MARK } from './textParser';
import { xmlUnescape } from './xlsx';

export interface DocxTextResult {
  text: string;
  /** Số đoạn dùng đánh số tự động (số câu / chữ A, B, C có thể không nằm trong chữ đọc ra). */
  autoNumbered: number;
  /** Số đoạn chữ được đánh dấu là đáp án đúng. */
  marked: number;
  hasImages: boolean;
}

export const DOCX_MAX_BYTES = 15 * 1024 * 1024;

const OPTION_START = /^\s*\(?[A-Ha-h]\s*[.)/]/;
const INLINE_OPTION = /(?:^|\s)\(?[A-Ha-h]\s*[.)]\s*\S/;

interface Run { text: string; marked: boolean }

function on(rPr: string, tag: string): boolean {
  const m = rPr.match(new RegExp(`<w:${tag}\\b([^>]*)/?>`));
  if (!m) return false;
  const v = m[1].match(/w:val="([^"]*)"/)?.[1];
  return v === undefined || !['0', 'false', 'none', 'off'].includes(v);
}

function isRed(hex: string): boolean {
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r >= 150 && g <= 90 && b <= 90;
}

function runMarked(rPr: string): boolean {
  if (!rPr) return false;
  if (on(rPr, 'b') || on(rPr, 'u') || /<w:highlight\b[^>]*w:val="(?!none)[^"]+"/.test(rPr)) return true;
  const color = rPr.match(/<w:color\b[^>]*w:val="([^"]+)"/)?.[1];
  if (color && isRed(color)) return true;
  const fill = rPr.match(/<w:shd\b[^>]*w:fill="([^"]+)"/)?.[1];
  return !!fill && !/^(auto|ffffff)$/i.test(fill);
}

function runText(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<w:t\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:t>)|<w:(tab|br|cr|noBreakHyphen|sym)\b[^>]*\/?>|<m:t\b[^>]*>([\s\S]*?)<\/m:t>|<\/m:(num)>/g)) {
    if (m[1] !== undefined) out += xmlUnescape(m[1]);
    else if (m[2] === 'tab') out += '    ';
    else if (m[2] === 'br' || m[2] === 'cr') out += '\n';
    else if (m[2] === 'noBreakHyphen') out += '-';
    else if (m[3] !== undefined) out += xmlUnescape(m[3]);
    else if (m[4]) out += '/';
  }
  return out;
}

function paragraph(xml: string, stats: { autoNumbered: number; marked: number }): string {
  const pPr = xml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  if (/<w:numPr\b/.test(pPr)) stats.autoNumbered++;
  const body = xml.replace(/<w:pPr\b[\s\S]*?<\/w:pPr>/, '').replace(/<w:del\b[\s\S]*?<\/w:del>/g, '').replace(/<mc:Fallback\b[\s\S]*?<\/mc:Fallback>/g, '');
  const runs: Run[] = [];
  // w:r (chữ thường) và m:oMath (công thức) theo đúng thứ tự xuất hiện
  for (const m of body.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>|<m:oMath\b[^>]*>([\s\S]*?)<\/m:oMath>/g)) {
    if (m[2] !== undefined) {
      const t = runText(m[2]);
      if (t) runs.push({ text: t, marked: false });
      continue;
    }
    const rPr = m[1].match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
    const t = runText(m[1].replace(/<w:rPr\b[\s\S]*?<\/w:rPr>/, ''));
    if (t) runs.push({ text: t, marked: runMarked(rPr) });
  }
  const plain = runs.map((r) => r.text).join('');
  if (!plain.trim()) return '';
  const visible = runs.filter((r) => r.text.trim());
  const allMarked = visible.every((r) => r.marked);
  const isOptionLine = OPTION_START.test(plain);
  const hasInline = INLINE_OPTION.test(plain);
  if ((!isOptionLine && !hasInline) || !visible.some((r) => r.marked)) return plain;
  // Cả đoạn là MỘT lựa chọn được tô hết → đánh dấu; nhiều lựa chọn trên một dòng mà tô hết → không rõ, bỏ qua.
  if (allMarked) {
    const single = isOptionLine && !/\s\(?[B-Hb-h]\s*[.)]\s*\S/.test(plain.replace(OPTION_START, ''));
    if (!single) return plain;
    stats.marked++;
    return `${MARK}${plain}`;
  }
  let out = '';
  let prev = false;
  for (const r of runs) {
    const mark = r.marked && r.text.trim() !== '';
    if (mark && !prev) {
      // đặt dấu ngay trước chữ (sau khoảng trắng đầu) để không phá "A." ở đầu dòng
      const lead = r.text.match(/^\s*/)?.[0] ?? '';
      out += `${lead}${MARK}${r.text.slice(lead.length)}`;
      stats.marked++;
    } else out += r.text;
    if (r.text.trim() !== '') prev = mark;
  }
  return out;
}

export function docxToText(data: Uint8Array): DocxTextResult {
  if (data.length > DOCX_MAX_BYTES) throw new Error('Tệp Word quá lớn (tối đa 15 MB). Thầy cô chép phần câu hỏi rồi dán vào ô văn bản nhé.');
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new Error('Đây không phải tệp Word .docx. Nếu là tệp .doc đời cũ, thầy cô mở bằng Word rồi "Lưu thành" .docx, hoặc chép chữ rồi dán vào ô văn bản.');
  }
  let xml: string;
  try {
    const files = unzipSync(data, { filter: (f) => f.name === 'word/document.xml' && f.originalSize < 80 * 1024 * 1024 });
    const doc = files['word/document.xml'];
    if (!doc) throw new Error('no document');
    xml = strFromU8(doc);
  } catch {
    throw new Error('Không mở được tệp Word này (tệp hỏng hoặc có mật khẩu).');
  }
  const stats = { autoNumbered: 0, marked: 0 };
  const body = xml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/)?.[1] ?? xml;
  const lines: string[] = [];
  // Duyệt theo thứ tự: bảng (ghép ô theo hàng) và đoạn ngoài bảng.
  const re = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g;
  for (const m of body.matchAll(re)) {
    const chunk = m[0];
    if (chunk.startsWith('<w:tbl')) {
      for (const tr of chunk.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)) {
        const cells: string[] = [];
        for (const tc of tr[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)) {
          const paras = [...tc[1].matchAll(/<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g)].map((p) => paragraph(p[0], stats)).filter((t) => t.trim());
          cells.push(paras.join(' '));
        }
        const row = cells.filter((c) => c.trim());
        if (!row.length) continue;
        // ô dài (đoạn văn) → mỗi ô một dòng; ô ngắn → ghép một dòng
        if (row.some((c) => c.length > 120 || c.includes('\n'))) lines.push(...row);
        else lines.push(row.join('    '));
      }
      lines.push('');
    } else lines.push(paragraph(chunk, stats));
  }
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, autoNumbered: stats.autoNumbered, marked: stats.marked, hasImages: /<w:drawing\b|<w:pict\b/.test(xml) };
}
