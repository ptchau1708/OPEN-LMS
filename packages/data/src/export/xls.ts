/**
 * Tệp Excel kiểu cũ (.xls = BIFF8 bọc trong "Compound File") — định dạng VnEdu cho tải về (sổ điểm các môn, mẫu nhận
 * xét năng lực phẩm chất…). Tự viết, không cần thư viện Excel lớn.
 *
 * - `readXls`: đọc chữ (bảng chuỗi dùng chung SST, cả khi bị cắt qua bản ghi CONTINUE), số, RK/MULRK, công thức (giá trị
 *   đã tính), ô gộp, trang tính ẩn, ngày tháng theo định dạng ô.
 * - `patchXls`: điền giá trị vào ô của tệp CÓ SẴN, mọi bản ghi khác giữ nguyên từng byte (kiểu ô, độ rộng cột, cột ẩn,
 *   ô gộp, tiêu đề, khóa định danh của VnEdu ở ô B6…). Chỉ "bảng ô" của trang tính được sửa là được viết lại; bảng chuỗi
 *   SST được nối thêm chuỗi mới; các con trỏ vị trí (BOUNDSHEET, INDEX, DBCELL, EXTSST) được tính lại; vỏ Compound File
 *   được ghi mới với đủ các luồng cũ (thông tin tóm tắt…).
 *
 * Không hỗ trợ: tệp đặt mật khẩu (FILEPASS), Excel 95 trở về trước (BIFF5) — báo lỗi dễ hiểu.
 */
import { XlsxError, type XCell, type XMerge, type XSheet, type XWorkbook } from './xlsx';
import type { CellPatch } from './xlsxPatch';

/* ================================== Compound File ================================== */
const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;
const NOSTREAM = 0xffffffff;

export function isCfb(b: Uint8Array): boolean {
  return b.length >= 512 && SIG.every((x, i) => b[i] === x);
}

export interface CfbNode {
  name: string;
  /** 1 thư mục (storage) · 2 luồng (stream) · 5 gốc. */
  type: 1 | 2 | 5;
  clsid: Uint8Array;
  stateBits: number;
  data?: Uint8Array;
  children: CfbNode[];
}

const broken = () => new XlsxError('Không mở được tệp Excel (tệp hỏng hoặc tải chưa xong).', 'broken');

export function readCfb(b: Uint8Array): CfbNode {
  if (!isCfb(b)) throw new XlsxError('Tệp này không phải tệp Excel .xls.', 'not-xlsx');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ssz = 1 << dv.getUint16(0x1e, true);
  const msz = 1 << dv.getUint16(0x20, true);
  if (ssz !== 512 && ssz !== 4096) throw broken();
  const nFat = dv.getUint32(0x2c, true);
  const dirStart = dv.getUint32(0x30, true);
  const cutoff = dv.getUint32(0x38, true) || 4096;
  const miniFatStart = dv.getUint32(0x3c, true);
  let difat = dv.getUint32(0x44, true);
  const off = (s: number) => (s + 1) * ssz;
  const u32 = (o: number) => (o + 4 <= b.length ? dv.getUint32(o, true) : FREESECT);

  const fatSecs: number[] = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(u32(0x4c + i * 4));
  for (let guard = 0; difat < ENDOFCHAIN && fatSecs.length < nFat && guard < 10000; guard++) {
    const o = off(difat);
    for (let i = 0; i < ssz / 4 - 1 && fatSecs.length < nFat; i++) fatSecs.push(u32(o + i * 4));
    difat = u32(o + ssz - 4);
  }
  const per = ssz / 4;
  const fat = new Uint32Array(fatSecs.length * per);
  fatSecs.forEach((s, k) => { for (let i = 0; i < per; i++) fat[k * per + i] = u32(off(s) + i * 4); });

  const chain = (start: number, table: Uint32Array): number[] => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s < table.length && s < ENDOFCHAIN - 3; s = table[s]) {
      if (seen.has(s)) throw broken();
      seen.add(s);
      out.push(s);
    }
    return out;
  };
  const readBig = (start: number, size?: number): Uint8Array => {
    const secs = chain(start, fat);
    const out = new Uint8Array(secs.length * ssz);
    secs.forEach((s, i) => out.set(b.subarray(off(s), Math.min(b.length, off(s) + ssz)), i * ssz));
    return size === undefined ? out : out.subarray(0, Math.min(size, out.length));
  };

  const dir = readBig(dirStart);
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  interface Raw { name: string; type: number; left: number; right: number; child: number; clsid: Uint8Array; stateBits: number; start: number; size: number }
  const raws: Raw[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = Math.min(64, ddv.getUint16(o + 0x40, true));
    let name = '';
    for (let i = 0; i < nameLen - 2 && i < 62; i += 2) { const ch = ddv.getUint16(o + i, true); if (!ch) break; name += String.fromCharCode(ch); }
    raws.push({
      name,
      type: dir[o + 0x42],
      left: ddv.getUint32(o + 0x44, true),
      right: ddv.getUint32(o + 0x48, true),
      child: ddv.getUint32(o + 0x4c, true),
      clsid: dir.slice(o + 0x50, o + 0x60),
      stateBits: ddv.getUint32(o + 0x60, true),
      start: ddv.getUint32(o + 0x74, true),
      size: ddv.getUint32(o + 0x78, true),
    });
  }
  const root = raws[0];
  if (!root || root.type !== 5) throw broken();
  const miniStream = root.start < ENDOFCHAIN ? readBig(root.start, root.size) : new Uint8Array(0);
  const miniFatBytes = miniFatStart < ENDOFCHAIN ? readBig(miniFatStart) : new Uint8Array(0);
  const miniFat = new Uint32Array(miniFatBytes.length / 4);
  const mdv = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  for (let i = 0; i < miniFat.length; i++) miniFat[i] = mdv.getUint32(i * 4, true);
  const readMini = (start: number, size: number): Uint8Array => {
    const secs = chain(start, miniFat);
    const out = new Uint8Array(secs.length * msz);
    secs.forEach((s, i) => out.set(miniStream.subarray(s * msz, s * msz + msz), i * msz));
    return out.subarray(0, Math.min(size, out.length));
  };

  const build = (idx: number, depth: number): CfbNode => {
    const r = raws[idx];
    const node: CfbNode = { name: r.name, type: r.type as 1 | 2 | 5, clsid: r.clsid, stateBits: r.stateBits, children: [] };
    if (r.type === 2) node.data = r.size === 0 ? new Uint8Array(0) : r.size < cutoff ? readMini(r.start, r.size) : readBig(r.start, r.size);
    if ((r.type === 1 || r.type === 5) && depth < 32) {
      const visit = (i: number, guard: number) => {
        if (i >= raws.length || guard > raws.length) return;
        const e = raws[i];
        visit(e.left, guard + 1);
        if (e.type === 1 || e.type === 2) node.children.push(build(i, depth + 1));
        visit(e.right, guard + 1);
      };
      visit(r.child, 0);
    }
    return node;
  };
  return build(0, 0);
}

function cfbCompare(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  return A < B ? -1 : A > B ? 1 : 0;
}

/** Ghi Compound File phiên bản 3 (sector 512 byte), luồng nhỏ hơn 4096 byte vào "luồng mini". */
export function writeCfb(root: CfbNode): Uint8Array {
  const SS = 512;
  const MS = 64;
  const CUTOFF = 4096;
  const nodes: CfbNode[] = [];
  const idOf = new Map<CfbNode, number>();
  const walk = (n: CfbNode) => { idOf.set(n, nodes.length); nodes.push(n); n.children.forEach(walk); };
  walk(root);

  // Luồng mini.
  const miniChunks: { node: CfbNode; start: number }[] = [];
  let miniSecs = 0;
  for (const n of nodes) {
    if (n.type !== 2 || !n.data || n.data.length === 0 || n.data.length >= CUTOFF) continue;
    miniChunks.push({ node: n, start: miniSecs });
    miniSecs += Math.ceil(n.data.length / MS);
  }
  const miniStreamLen = miniSecs * MS;
  const miniStreamSecs = Math.ceil(miniStreamLen / SS);
  const miniFatSecs = Math.ceil((miniSecs * 4) / SS);
  const dirSecs = Math.ceil((nodes.length * 128) / SS);
  const big = nodes.filter((n) => n.type === 2 && n.data && n.data.length >= CUTOFF);
  const bigSecs = big.reduce((a, n) => a + Math.ceil((n.data as Uint8Array).length / SS), 0);
  const nonFat = dirSecs + miniFatSecs + miniStreamSecs + bigSecs;
  let nFat = 1;
  while (nFat * (SS / 4) < nonFat + nFat) nFat++;
  if (nFat > 109) throw new XlsxError('Tệp quá lớn để ghi lại (hơn 6 MB).', 'exotic');
  const total = nFat + nonFat;

  const fat = new Uint32Array(nFat * (SS / 4)).fill(FREESECT);
  for (let i = 0; i < nFat; i++) fat[i] = FATSECT;
  let next = nFat;
  const alloc = (count: number): number => {
    if (count === 0) return ENDOFCHAIN;
    const start = next;
    for (let i = 0; i < count; i++) fat[start + i] = i === count - 1 ? ENDOFCHAIN : start + i + 1;
    next += count;
    return start;
  };
  const dirStart = alloc(dirSecs);
  const miniFatStart = alloc(miniFatSecs);
  const miniStreamStart = alloc(miniStreamSecs);
  const bigStart = new Map<CfbNode, number>();
  for (const n of big) bigStart.set(n, alloc(Math.ceil((n.data as Uint8Array).length / SS)));

  const out = new Uint8Array((total + 1) * SS);
  const dv = new DataView(out.buffer);
  const sec = (s: number) => (s + 1) * SS;
  // Đầu tệp.
  SIG.forEach((x, i) => { out[i] = x; });
  dv.setUint16(0x18, 0x003e, true);
  dv.setUint16(0x1a, 0x0003, true);
  dv.setUint16(0x1c, 0xfffe, true);
  dv.setUint16(0x1e, 9, true);
  dv.setUint16(0x20, 6, true);
  dv.setUint32(0x2c, nFat, true);
  dv.setUint32(0x30, dirStart, true);
  dv.setUint32(0x38, CUTOFF, true);
  dv.setUint32(0x3c, miniFatSecs ? miniFatStart : ENDOFCHAIN, true);
  dv.setUint32(0x40, miniFatSecs, true);
  dv.setUint32(0x44, ENDOFCHAIN, true);
  dv.setUint32(0x48, 0, true);
  for (let i = 0; i < 109; i++) dv.setUint32(0x4c + i * 4, i < nFat ? i : FREESECT, true);
  // FAT.
  for (let i = 0; i < fat.length; i++) dv.setUint32(sec(Math.floor(i / (SS / 4))) + (i % (SS / 4)) * 4, fat[i], true);
  // Mini FAT + luồng mini.
  const miniFat = new Uint32Array(miniFatSecs * (SS / 4)).fill(FREESECT);
  for (const ch of miniChunks) {
    const n = Math.ceil((ch.node.data as Uint8Array).length / MS);
    for (let i = 0; i < n; i++) miniFat[ch.start + i] = i === n - 1 ? ENDOFCHAIN : ch.start + i + 1;
    out.set(ch.node.data as Uint8Array, sec(miniStreamStart) + ch.start * MS);
  }
  for (let i = 0; i < miniFat.length; i++) dv.setUint32(sec(miniFatStart) + i * 4, miniFat[i], true);
  for (const n of big) out.set(n.data as Uint8Array, sec(bigStart.get(n) as number));

  // Thư mục: anh em xếp thành cây nhị phân tìm kiếm cân bằng (tất cả đen — trình đọc không kiểm màu).
  const left = new Uint32Array(nodes.length).fill(NOSTREAM);
  const right = new Uint32Array(nodes.length).fill(NOSTREAM);
  const child = new Uint32Array(nodes.length).fill(NOSTREAM);
  const tree = (list: CfbNode[]): number => {
    if (!list.length) return NOSTREAM;
    const mid = Math.floor(list.length / 2);
    const id = idOf.get(list[mid]) as number;
    left[id] = tree(list.slice(0, mid));
    right[id] = tree(list.slice(mid + 1));
    return id;
  };
  for (const n of nodes) if (n.type !== 2) child[idOf.get(n) as number] = tree([...n.children].sort((a, b) => cfbCompare(a.name, b.name)));
  const miniStart = new Map(miniChunks.map((c) => [c.node, c.start]));
  const dirBase = sec(dirStart);
  for (let i = 0; i < dirSecs * 4; i++) {
    const o = dirBase + i * 128;
    const n = nodes[i];
    if (!n) { dv.setUint32(o + 0x44, NOSTREAM, true); dv.setUint32(o + 0x48, NOSTREAM, true); dv.setUint32(o + 0x4c, NOSTREAM, true); continue; }
    const name = n.name.slice(0, 31);
    for (let k = 0; k < name.length; k++) dv.setUint16(o + k * 2, name.charCodeAt(k), true);
    dv.setUint16(o + 0x40, (name.length + 1) * 2, true);
    out[o + 0x42] = n.type;
    out[o + 0x43] = 1;
    dv.setUint32(o + 0x44, left[i], true);
    dv.setUint32(o + 0x48, right[i], true);
    dv.setUint32(o + 0x4c, child[i], true);
    out.set(n.clsid.subarray(0, 16), o + 0x50);
    dv.setUint32(o + 0x60, n.stateBits, true);
    let start = ENDOFCHAIN;
    let size = 0;
    if (n.type === 5) { start = miniStreamSecs ? miniStreamStart : ENDOFCHAIN; size = miniStreamLen; }
    else if (n.type === 2 && n.data) {
      size = n.data.length;
      if (size >= CUTOFF) start = bigStart.get(n) as number;
      else if (size > 0) start = miniStart.get(n) as number;
    } else if (n.type === 1) start = 0;
    dv.setUint32(o + 0x74, start, true);
    dv.setUint32(o + 0x78, size, true);
  }
  return out;
}

function findStream(root: CfbNode, names: string[]): CfbNode | undefined {
  const want = names.map((n) => n.toLowerCase());
  return root.children.find((c) => c.type === 2 && want.includes(c.name.toLowerCase()));
}

/* ================================== BIFF8: bản ghi ================================== */
const R = {
  EOF: 0x000a, BOF: 0x0809, FILEPASS: 0x002f, BOUNDSHEET: 0x0085, SST: 0x00fc, EXTSST: 0x00ff, CONTINUE: 0x003c,
  FORMAT: 0x041e, XF: 0x00e0, DATEMODE: 0x0022, INDEX: 0x020b, DIMENSIONS: 0x0200, ROW: 0x0208, DBCELL: 0x00d7,
  BLANK: 0x0201, MULBLANK: 0x00be, NUMBER: 0x0203, RK: 0x027e, MULRK: 0x00bd, LABELSST: 0x00fd, LABEL: 0x0204,
  RSTRING: 0x00d6, BOOLERR: 0x0205, FORMULA: 0x0006, STRING: 0x0207, ARRAY: 0x0221, SHRFMLA: 0x04bc, TABLE: 0x0236,
  MERGECELLS: 0x00e5, DEFCOLWIDTH: 0x0055,
} as const;

interface Rec { id: number; data: Uint8Array; pos: number }

function records(s: Uint8Array, from: number, to: number): Rec[] {
  const out: Rec[] = [];
  let p = from;
  while (p + 4 <= to) {
    const id = s[p] | (s[p + 1] << 8);
    const len = s[p + 2] | (s[p + 3] << 8);
    out.push({ id, data: s.subarray(p + 4, Math.min(to, p + 4 + len)), pos: p });
    p += 4 + len;
  }
  return out;
}

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const f64 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset + o, 8).getFloat64(0, true);

function rk(v: number): number {
  let n: number;
  if (v & 2) n = v >> 2;
  else {
    const b = new DataView(new ArrayBuffer(8));
    b.setUint32(4, v & 0xfffffffc, true);
    n = b.getFloat64(0, true);
  }
  return v & 1 ? n / 100 : n;
}

function chars(d: Uint8Array, o: number, n: number, high: boolean): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(high ? u16(d, o + i * 2) : d[o + i]);
  return s;
}

/** Chuỗi trong SST, giữ phần định dạng chữ / ngữ âm để ghi lại nguyên vẹn. */
interface SstString { text: string; runs?: Uint8Array; ext?: Uint8Array }

/** Đọc SST: dữ liệu được cắt qua nhiều bản ghi CONTINUE, mỗi đoạn kí tự tiếp nối mở đầu bằng 1 byte cờ. */
function readSst(parts: Uint8Array[]): { strings: SstString[]; total: number } {
  let pi = 0;
  let p = 0;
  const cur = () => parts[pi];
  /** Chuỗi mới bắt đầu ở đầu bản ghi CONTINUE thì không có byte cờ mở đầu. */
  const atNext = () => { while (pi < parts.length && p >= cur().length) { pi++; p = 0; } };
  const take = (n: number): Uint8Array => {
    const out = new Uint8Array(n);
    let k = 0;
    while (k < n) {
      if (pi >= parts.length) throw broken();
      if (p >= cur().length) { pi++; p = 0; continue; }
      const m = Math.min(n - k, cur().length - p);
      out.set(cur().subarray(p, p + m), k);
      k += m;
      p += m;
    }
    return out;
  };
  const first = parts[0];
  if (!first || first.length < 8) return { strings: [], total: 0 };
  const total = u32(first, 0);
  const unique = u32(first, 4);
  p = 8;
  const strings: SstString[] = [];
  for (let i = 0; i < unique; i++) {
    atNext();
    if (pi >= parts.length) break;
    const h = take(3);
    const cch = u16(h, 0);
    let flags = h[2];
    const rich = (flags & 8) !== 0;
    const ext = (flags & 4) !== 0;
    const cRun = rich ? u16(take(2), 0) : 0;
    const cbExt = ext ? u32(take(4), 0) : 0;
    let text = '';
    let left = cch;
    while (left > 0) {
      if (p >= cur().length) { pi++; p = 0; if (pi >= parts.length) throw broken(); flags = cur()[0]; p = 1; }
      const high = (flags & 1) !== 0;
      const avail = Math.floor((cur().length - p) / (high ? 2 : 1));
      const n = Math.min(left, avail);
      if (n <= 0) { p = cur().length; continue; }
      text += chars(cur(), p, n, high);
      p += n * (high ? 2 : 1);
      left -= n;
    }
    const s: SstString = { text };
    if (cRun) s.runs = take(cRun * 4);
    if (cbExt) s.ext = take(cbExt);
    strings.push(s);
  }
  return { strings, total };
}

/** XLUnicodeString (cch 2 byte) hoặc ShortXLUnicodeString (cch 1 byte). */
function xlString(d: Uint8Array, o: number, short = false): string {
  const cch = short ? d[o] : u16(d, o);
  const at = o + (short ? 1 : 2);
  const flags = d[at];
  let q = at + 1;
  if (flags & 8) q += 2;
  if (flags & 4) q += 4;
  return chars(d, q, Math.min(cch, Math.floor((d.length - q) / (flags & 1 ? 2 : 1))), (flags & 1) !== 0);
}

function isDateFmt(id: number, code: string | undefined): boolean {
  if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
  if (!code) return false;
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(bare) && !/[0#?]/.test(bare.replace(/s+\.0+/gi, ''));
}

interface SheetInfo { name: string; pos: number; hidden: boolean; type: number; recIndex: number }

interface Globals {
  recs: Rec[];
  sheets: SheetInfo[];
  sst: { strings: SstString[]; total: number };
  sstRange: [number, number] | null;
  dateXf: Set<number>;
  date1904: boolean;
  end: number;
}

function readGlobals(s: Uint8Array): Globals {
  const recs: Rec[] = [];
  let p = 0;
  while (p + 4 <= s.length) {
    const id = u16(s, p);
    const len = u16(s, p + 2);
    recs.push({ id, data: s.subarray(p + 4, Math.min(s.length, p + 4 + len)), pos: p });
    p += 4 + len;
    if (id === R.EOF) break;
  }
  const bof = recs[0];
  if (!bof || bof.id !== R.BOF) {
    if (bof && (bof.id === 0x0009 || bof.id === 0x0209 || bof.id === 0x0409)) throw new XlsxError('Đây là tệp Excel rất cũ (trước 1997). Thầy cô mở tệp bằng Excel, chọn Lưu thành → "Excel Workbook (.xlsx)" rồi tải lên lại nhé.', 'old-xls');
    throw broken();
  }
  if (u16(bof.data, 0) !== 0x0600) throw new XlsxError('Đây là tệp Excel 95 (định dạng cũ). Thầy cô mở tệp bằng Excel, chọn Lưu thành → "Excel Workbook (.xlsx)" rồi tải lên lại nhé.', 'old-xls');
  const sheets: SheetInfo[] = [];
  const formats = new Map<number, string>();
  const xfFmt: number[] = [];
  let date1904 = false;
  let sstRange: [number, number] | null = null;
  const sstParts: Uint8Array[] = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    switch (r.id) {
      case R.FILEPASS: throw new XlsxError('Tệp Excel đang đặt mật khẩu. Thầy cô bỏ mật khẩu rồi tải lên lại nhé.', 'encrypted');
      case R.BOUNDSHEET: sheets.push({ pos: u32(r.data, 0), hidden: (r.data[4] & 3) !== 0, type: r.data[5], name: xlString(r.data, 6, true), recIndex: i }); break;
      case R.FORMAT: formats.set(u16(r.data, 0), xlString(r.data, 2)); break;
      case R.XF: xfFmt.push(u16(r.data, 2)); break;
      case R.DATEMODE: date1904 = u16(r.data, 0) === 1; break;
      case R.SST: {
        sstParts.push(r.data);
        let j = i + 1;
        while (j < recs.length && recs[j].id === R.CONTINUE) sstParts.push(recs[j++].data);
        const k = j < recs.length && recs[j].id === R.EXTSST ? j : j - 1;
        sstRange = [i, k];
        i = j - 1;
        break;
      }
    }
  }
  const dateXf = new Set<number>();
  xfFmt.forEach((f, i) => { if (isDateFmt(f, formats.get(f))) dateXf.add(i); });
  return { recs, sheets, sst: readSst(sstParts), sstRange, dateXf, date1904, end: p };
}

/** Phạm vi luồng của từng trang tính: từ BOF của nó tới BOF trang kế tiếp (hoặc hết luồng). */
function sheetSpans(g: Globals, len: number): [number, number][] {
  const starts = g.sheets.map((s) => s.pos);
  const sorted = [...starts].sort((a, b) => a - b);
  return starts.map((st) => {
    const nx = sorted.find((x) => x > st);
    return [st, nx ?? len] as [number, number];
  });
}

/** Bản ghi của trang tính, dừng ở EOF cùng cấp (bỏ qua các luồng con lồng bên trong như biểu đồ). */
function sheetRecords(s: Uint8Array, span: [number, number]): Rec[] {
  const all = records(s, span[0], span[1]);
  let depth = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i].id === R.BOF) depth++;
    else if (all[i].id === R.EOF && --depth === 0) return all.slice(0, i + 1);
  }
  return all;
}

const CELL_IDS = new Set<number>([R.BLANK, R.MULBLANK, R.NUMBER, R.RK, R.MULRK, R.LABELSST, R.LABEL, R.RSTRING, R.BOOLERR, R.FORMULA]);

function epochDate(serial: number, date1904: boolean): Date {
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(base + Math.round(serial * 86400000));
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

function parseSheet(recs: Rec[], g: Globals, name: string, hidden: boolean): XSheet {
  const rows: XCell[][] = [];
  const merges: XMerge[] = [];
  const set = (r: number, c: number, v: XCell) => {
    while (rows.length <= r) rows.push([]);
    const row = rows[r];
    while (row.length < c) row.push(null);
    row[c] = v;
  };
  const num = (r: number, c: number, xf: number, v: number) => set(r, c, g.dateXf.has(xf) ? epochDate(v, g.date1904) : v);
  let depth = 0;
  let pendingFormula: { r: number; c: number } | null = null;
  for (const rec of recs) {
    const d = rec.data;
    if (rec.id === R.BOF) { depth++; continue; }
    if (rec.id === R.EOF) { depth--; continue; }
    if (depth !== 1) continue;
    switch (rec.id) {
      case R.NUMBER: num(u16(d, 0), u16(d, 2), u16(d, 4), f64(d, 6)); break;
      case R.RK: num(u16(d, 0), u16(d, 2), u16(d, 4), rk(u32(d, 6))); break;
      case R.MULRK: {
        const r = u16(d, 0);
        const c0 = u16(d, 2);
        const n = (d.length - 6) / 6;
        for (let i = 0; i < n; i++) num(r, c0 + i, u16(d, 4 + i * 6), rk(u32(d, 6 + i * 6)));
        break;
      }
      case R.LABELSST: set(u16(d, 0), u16(d, 2), g.sst.strings[u32(d, 6)]?.text ?? ''); break;
      case R.LABEL: case R.RSTRING: set(u16(d, 0), u16(d, 2), xlString(d, 6)); break;
      case R.BOOLERR: set(u16(d, 0), u16(d, 2), d[7] ? null : d[6] !== 0); break;
      case R.FORMULA: {
        const r = u16(d, 0);
        const c = u16(d, 2);
        if (d[12] === 0xff && d[13] === 0xff) {
          const t = d[6];
          if (t === 0) pendingFormula = { r, c };
          else if (t === 1) set(r, c, d[8] !== 0);
          else set(r, c, t === 3 ? '' : null);
        } else num(r, c, u16(d, 4), f64(d, 6));
        break;
      }
      case R.STRING: if (pendingFormula) { set(pendingFormula.r, pendingFormula.c, xlString(d, 0)); pendingFormula = null; } break;
      case R.MERGECELLS: {
        const n = u16(d, 0);
        for (let i = 0; i < n && 2 + i * 8 + 8 <= d.length; i++) {
          const o = 2 + i * 8;
          merges.push({ r1: u16(d, o), r2: u16(d, o + 2), c1: u16(d, o + 4), c2: u16(d, o + 6) });
        }
        break;
      }
    }
  }
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  for (const r of rows) while (r.length < width) r.push(null);
  return { name, rows, merges, ...(hidden ? { hidden: true } : {}) };
}

function workbookStream(bytes: Uint8Array): { root: CfbNode; node: CfbNode; s: Uint8Array } {
  const root = readCfb(bytes);
  if (root.children.some((c) => c.name === 'EncryptedPackage' || c.name === 'EncryptionInfo')) throw new XlsxError('Tệp Excel đang đặt mật khẩu. Thầy cô bỏ mật khẩu rồi tải lên lại nhé.', 'encrypted');
  const node = findStream(root, ['Workbook']);
  if (!node) {
    if (findStream(root, ['Book'])) throw new XlsxError('Đây là tệp Excel 95 (định dạng cũ). Thầy cô mở tệp bằng Excel, chọn Lưu thành → "Excel Workbook (.xlsx)" rồi tải lên lại nhé.', 'old-xls');
    throw new XlsxError('Tệp này không phải tệp Excel.', 'not-xlsx');
  }
  return { root, node, s: node.data as Uint8Array };
}

/** Đọc tệp .xls (BIFF8). Chỉ lấy trang tính thường (bỏ trang biểu đồ / macro). */
export function readXls(bytes: Uint8Array): XWorkbook {
  const { s } = workbookStream(bytes);
  const g = readGlobals(s);
  const spans = sheetSpans(g, s.length);
  const sheets: XSheet[] = [];
  g.sheets.forEach((info, i) => {
    if (info.type !== 0) return;
    sheets.push(parseSheet(sheetRecords(s, spans[i]), g, info.name, info.hidden));
  });
  if (!sheets.length) throw new XlsxError('Tệp Excel không có trang tính nào.', 'broken');
  return { sheets, format: 'xls' };
}

/* ================================== BIFF8: ghi ================================== */
function rec(id: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + data.length);
  out[0] = id & 0xff; out[1] = id >> 8; out[2] = data.length & 0xff; out[3] = data.length >> 8;
  out.set(data, 4);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

class Buf {
  private a: number[] = [];
  u8(v: number) { this.a.push(v & 0xff); return this; }
  u16(v: number) { this.a.push(v & 0xff, (v >> 8) & 0xff); return this; }
  u32(v: number) { this.a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); return this; }
  f64(v: number) { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v, true); for (let i = 0; i < 8; i++) this.a.push(b.getUint8(i)); return this; }
  bytes(b: Uint8Array) { for (const x of b) this.a.push(x); return this; }
  get length() { return this.a.length; }
  done() { return Uint8Array.from(this.a); }
}

const MAX_REC = 8224;

/** Ghi lại SST (+CONTINUE) và EXTSST. Trả về các bản ghi và hàm điền vị trí tuyệt đối khi đã biết chỗ đặt SST. */
function writeSst(strings: SstString[], total: number): (base: number) => Uint8Array {
  const recsData: number[][] = [[]];
  const cur = () => recsData[recsData.length - 1];
  const room = () => MAX_REC - cur().length;
  const push = (...b: number[]) => { cur().push(...b); };
  const newRec = () => { recsData.push([]); };
  push(total & 0xff, (total >>> 8) & 0xff, (total >>> 16) & 0xff, (total >>> 24) & 0xff);
  push(strings.length & 0xff, (strings.length >>> 8) & 0xff, (strings.length >>> 16) & 0xff, (strings.length >>> 24) & 0xff);
  const starts: { rec: number; off: number }[] = [];
  for (const s of strings) {
    const high = /[^\u0000-\u00ff]/.test(s.text);
    const cw = high ? 2 : 1;
    const flags = (high ? 1 : 0) | (s.ext ? 4 : 0) | (s.runs ? 8 : 0);
    const head = 3 + (s.runs ? 2 : 0) + (s.ext ? 4 : 0);
    if (room() < head + (s.text.length ? cw : 0)) newRec();
    starts.push({ rec: recsData.length - 1, off: cur().length });
    const n = s.text.length;
    push(n & 0xff, n >> 8, flags);
    if (s.runs) { const k = s.runs.length / 4; push(k & 0xff, k >> 8); }
    if (s.ext) { const k = s.ext.length; push(k & 0xff, (k >>> 8) & 0xff, (k >>> 16) & 0xff, (k >>> 24) & 0xff); }
    for (let i = 0; i < n; i++) {
      if (room() < cw) { newRec(); push(high ? 1 : 0); }
      const ch = s.text.charCodeAt(i);
      if (high) push(ch & 0xff, ch >> 8); else push(ch);
    }
    if (s.runs) for (let i = 0; i < s.runs.length; i += 4) { if (room() < 4) newRec(); push(...s.runs.subarray(i, i + 4)); }
    if (s.ext) for (const b of s.ext) { if (room() < 1) newRec(); push(b); }
  }
  const bodies = recsData.map((d) => Uint8Array.from(d));
  const sstBytes = concat(bodies.map((b, i) => rec(i === 0 ? R.SST : R.CONTINUE, b)));
  const recStart: number[] = [];
  let acc = 0;
  for (const b of bodies) { recStart.push(acc); acc += 4 + b.length; }
  const dsst = Math.max(8, Math.ceil(strings.length / 128));
  return (base: number) => {
    const e = new Buf().u16(dsst);
    for (let i = 0; i < strings.length; i += dsst) {
      const st = starts[i];
      e.u32(base + recStart[st.rec] + 4 + st.off).u16(4 + st.off).u16(0);
    }
    return concat([sstBytes, rec(R.EXTSST, e.done())]);
  };
}

type CellValue = { kind: 'num'; v: number } | { kind: 'sst'; i: number } | { kind: 'blank' };

interface CellUnit { r: number; c: number; recs: Uint8Array[] }

function cellRec(r: number, c: number, xf: number, v: CellValue): Uint8Array {
  const b = new Buf().u16(r).u16(c).u16(xf);
  if (v.kind === 'num') return rec(R.NUMBER, b.f64(v.v).done());
  if (v.kind === 'sst') return rec(R.LABELSST, b.u32(v.i).done());
  return rec(R.BLANK, b.done());
}

/** Tách một bản ghi ô thành các đơn vị ô (MULBLANK / MULRK tách theo cột), giữ byte gốc khi không phải tách. */
function cellUnits(r: Rec, split: (row: number, c: number) => boolean): CellUnit[] {
  const d = r.data;
  const row = u16(d, 0);
  const c0 = u16(d, 2);
  if (r.id === R.MULBLANK || r.id === R.MULRK) {
    const step = r.id === R.MULBLANK ? 2 : 6;
    const n = (d.length - 6) / step;
    let any = false;
    for (let i = 0; i < n; i++) if (split(row, c0 + i)) any = true;
    if (!any) return [{ r: row, c: c0, recs: [rec(r.id, d)] }];
    const out: CellUnit[] = [];
    for (let i = 0; i < n; i++) {
      const xf = u16(d, 4 + i * step);
      const one = r.id === R.MULBLANK ? rec(R.BLANK, new Buf().u16(row).u16(c0 + i).u16(xf).done()) : rec(R.RK, new Buf().u16(row).u16(c0 + i).u16(xf).u32(u32(d, 6 + i * 6)).done());
      out.push({ r: row, c: c0 + i, recs: [one] });
    }
    return out;
  }
  return [{ r: row, c: c0, recs: [rec(r.id, d)] }];
}

const unitXf = (u: CellUnit): number => u16(u.recs[0], 8);
const unitLastCol = (u: CellUnit): number => {
  const id = u16(u.recs[0], 0);
  const len = u16(u.recs[0], 2);
  if (id === R.MULBLANK || id === R.MULRK) return u16(u.recs[0], 4 + len - 2);
  return u.c;
};

export interface SheetPatches {
  /** Tên trang tính (đúng như trong tệp). */
  sheet: string;
  patches: CellPatch[];
  /** Ô mới chưa có trong tệp mượn kiểu của ô gần nhất phía trên cùng cột, nhưng chỉ từ dòng sau dòng này. */
  styleBelowRow?: number;
}

export interface XlsPatchResult { bytes: Uint8Array; patched: number }

/** Điền giá trị vào tệp .xls có sẵn, giữ nguyên mọi thứ khác. */
export function patchXls(original: Uint8Array, sheetPatches: SheetPatches[]): XlsPatchResult {
  const { root, node, s } = workbookStream(original);
  const g = readGlobals(s);
  const spans = sheetSpans(g, s.length);
  const strings = [...g.sst.strings];
  const index = new Map<string, number>();
  strings.forEach((x, i) => { if (!x.runs && !x.ext && !index.has(x.text)) index.set(x.text, i); });
  let total = g.sst.total;
  const sstOf = (t: string): number => {
    let i = index.get(t);
    if (i === undefined) { i = strings.length; strings.push({ text: t }); index.set(t, i); }
    total++;
    return i;
  };
  let patched = 0;

  // Mỗi trang tính: các bản ghi mới (trước khi điền vị trí), và hàm sửa INDEX khi đã biết vị trí bắt đầu.
  interface Built { parts: Uint8Array[]; fix: (start: number, parts: Uint8Array[]) => void }
  const built: Built[] = g.sheets.map((info, si) => {
    const span = spans[si];
    const raw = s.subarray(span[0], span[1]);
    const want = sheetPatches.find((p) => p.sheet === info.name);
    if (!want || !want.patches.length || info.type !== 0) {
      // Giữ nguyên byte; chỉ dời các con trỏ tuyệt đối trong INDEX theo độ lệch vị trí.
      const parts = [raw.slice()];
      return {
        parts,
        fix: (start) => {
          const delta = start - span[0];
          if (!delta) return;
          const buf = parts[0];
          for (const r of sheetRecords(buf, [0, buf.length])) {
            if (r.id !== R.INDEX) continue;
            const o = r.pos + 4;
            const len = u16(buf, r.pos + 2);
            const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
            const ibXf = dv.getUint32(o + 12, true);
            if (ibXf) dv.setUint32(o + 12, ibXf + delta, true);
            for (let k = o + 16; k + 4 <= o + len; k += 4) dv.setUint32(k, dv.getUint32(k, true) + delta, true);
          }
        },
      };
    }
    return buildPatchedSheet(raw, want, g, sstOf, (n) => { patched += n; });
  });

  // Toàn cục: thay SST bằng bản mới, các bản ghi khác giữ nguyên.
  const sstWriter = writeSst(strings, total);
  const before: Uint8Array[] = [];
  const after: Uint8Array[] = [];
  let sstAt = -1;
  g.recs.forEach((r, i) => {
    if (g.sstRange && i >= g.sstRange[0] && i <= g.sstRange[1]) { if (i === g.sstRange[0]) sstAt = 0; return; }
    const bytes = s.subarray(r.pos, r.pos + 4 + r.data.length).slice();
    (sstAt === -1 ? before : after).push(bytes);
  });
  if (!g.sstRange) {
    // Tệp chưa có SST (hiếm): đặt ngay trước EOF của phần toàn cục.
    const eof = before.pop() as Uint8Array;
    after.push(eof);
  }
  const beforeLen = before.reduce((a, b) => a + b.length, 0);
  const sstBytes = sstWriter(beforeLen);
  const afterLen = after.reduce((a, b) => a + b.length, 0);
  const globalsLen = beforeLen + sstBytes.length + afterLen;
  // Phần đệm sau EOF toàn cục (nếu có) giữ nguyên.
  const firstSheet = Math.min(...g.sheets.map((x) => x.pos), s.length);
  const gap = s.subarray(g.end, firstSheet).slice();

  // Vị trí từng trang tính theo thứ tự xuất hiện trong luồng gốc.
  const order = g.sheets.map((x, i) => i).sort((a, b) => g.sheets[a].pos - g.sheets[b].pos);
  const starts = new Array<number>(g.sheets.length);
  let pos = globalsLen + gap.length;
  for (const i of order) { starts[i] = pos; pos += built[i].parts.reduce((a, b) => a + b.length, 0); }
  for (const i of order) built[i].fix(starts[i], built[i].parts);
  // BOUNDSHEET.lbPlyPos.
  let bi = 0;
  const fixedBefore = before.map((b) => b);
  const fixedAfter = after.map((b) => b);
  for (const list of [fixedBefore, fixedAfter]) {
    for (const b of list) {
      if (u16(b, 0) !== R.BOUNDSHEET) continue;
      new DataView(b.buffer, b.byteOffset, b.byteLength).setUint32(4, starts[bi++], true);
    }
  }
  const stream = concat([...fixedBefore, sstBytes, ...fixedAfter, gap, ...order.flatMap((i) => built[i].parts)]);
  node.data = stream;
  return { bytes: writeCfb(root), patched };
}

function buildPatchedSheet(raw: Uint8Array, want: SheetPatches, g: Globals, sstOf: (t: string) => number, count: (n: number) => void): { parts: Uint8Array[]; fix: (start: number, parts: Uint8Array[]) => void } {
  const recs = sheetRecords(raw, [0, raw.length]);
  const tail = raw.subarray(recs.length ? recs[recs.length - 1].pos + 4 + recs[recs.length - 1].data.length : 0);
  const patchAt = new Map<string, CellPatch>();
  for (const p of want.patches) patchAt.set(`${p.r}:${p.c}`, p);
  const isTarget = (r: number, c: number) => patchAt.has(`${r}:${c}`);

  // Tìm bảng ô: sau DIMENSIONS, các bản ghi ROW / ô / công thức / DBCELL liền nhau ở cấp 1.
  const dimIdx = recs.findIndex((r) => r.id === R.DIMENSIONS);
  if (dimIdx < 0) throw new XlsxError('Trang tính không có bảng ô.', 'exotic');
  const TABLE_IDS = new Set<number>([R.ROW, R.DBCELL, R.STRING, R.ARRAY, R.SHRFMLA, R.TABLE, R.CONTINUE, ...CELL_IDS]);
  let end = dimIdx + 1;
  while (end < recs.length && TABLE_IDS.has(recs[end].id)) end++;
  const rowsRec = new Map<number, Uint8Array>();
  const units: CellUnit[] = [];
  for (let i = dimIdx + 1; i < end; i++) {
    const r = recs[i];
    if (r.id === R.ROW) { rowsRec.set(u16(r.data, 0), r.data.slice()); continue; }
    if (r.id === R.DBCELL) continue;
    if (CELL_IDS.has(r.id)) { units.push(...cellUnits(r, isTarget)); continue; }
    // STRING / ARRAY / SHRFMLA / TABLE / CONTINUE đi kèm ô công thức ngay trước.
    const last = units[units.length - 1];
    if (last) last.recs.push(rec(r.id, r.data));
  }

  // Áp giá trị.
  const byKey = new Map<string, CellUnit>();
  for (const u of units) byKey.set(`${u.r}:${u.c}`, u);
  let n = 0;
  for (const p of want.patches) {
    const key = `${p.r}:${p.c}`;
    const old = byKey.get(key);
    let xf = old ? unitXf(old) : -1;
    if (xf < 0) {
      // Mượn kiểu của ô gần nhất phía trên cùng cột (chỉ từ dòng dữ liệu).
      let best: CellUnit | undefined;
      for (const u of units) if (u.c === p.c && u.r < p.r && u.r > (want.styleBelowRow ?? -1) && (!best || u.r > best.r)) best = u;
      xf = best ? unitXf(best) : 15;
    }
    const v: CellValue = p.value === null || p.value === '' ? { kind: 'blank' } : typeof p.value === 'number' ? { kind: 'num', v: p.value } : { kind: 'sst', i: sstOf(p.value) };
    const unit: CellUnit = { r: p.r, c: p.c, recs: [cellRec(p.r, p.c, xf, v)] };
    if (old) units[units.indexOf(old)] = unit; else units.push(unit);
    byKey.set(key, unit);
    n++;
  }
  count(n);

  // Dòng mới cần bản ghi ROW; dòng cũ mở rộng colMic/colMac.
  const span = new Map<number, [number, number]>();
  for (const u of units) {
    const sp = span.get(u.r);
    const last = unitLastCol(u);
    span.set(u.r, sp ? [Math.min(sp[0], u.c), Math.max(sp[1], last + 1)] : [u.c, last + 1]);
  }
  for (const [r, [c1, c2]] of span) {
    const old = rowsRec.get(r);
    if (old) {
      const dv = new DataView(old.buffer, old.byteOffset, old.byteLength);
      const mic = dv.getUint16(2, true);
      const mac = dv.getUint16(4, true);
      const empty = mic >= mac;
      dv.setUint16(2, empty ? c1 : Math.min(mic, c1), true);
      dv.setUint16(4, empty ? c2 : Math.max(mac, c2), true);
    } else {
      rowsRec.set(r, new Buf().u16(r).u16(c1).u16(c2).u16(0x00ff).u16(0).u16(0).u32(0x000f0100).done());
    }
  }
  units.sort((a, b) => a.r - b.r || a.c - b.c);
  const allRows = [...rowsRec.keys()].sort((a, b) => a - b);

  // Khối 32 dòng: ROW…, các ô, DBCELL.
  interface Block { rows: number[]; parts: Uint8Array[] }
  const blocks: Block[] = [];
  for (let i = 0; i < allRows.length; i += 32) blocks.push({ rows: allRows.slice(i, i + 32), parts: [] });
  const blockBytes: Uint8Array[] = [];
  const dbcellOffsetInBlock: number[] = [];
  for (const b of blocks) {
    const rowParts = b.rows.map((r) => rec(R.ROW, rowsRec.get(r) as Uint8Array));
    const rowLen = rowParts.reduce((a, x) => a + x.length, 0);
    const cellParts: Uint8Array[] = [];
    const firstCellPos: number[] = [];
    let off = rowLen;
    for (const r of b.rows) {
      const mine = units.filter((u) => u.r === r);
      if (mine.length) firstCellPos.push(off);
      for (const u of mine) for (const x of u.recs) { cellParts.push(x); off += x.length; }
    }
    const db = new Buf().u32(off);
    let prev = rowParts.length ? rowParts[0].length : 0;
    firstCellPos.forEach((p) => { db.u16(p - prev); prev = p; });
    const bytes = concat([...rowParts, ...cellParts, rec(R.DBCELL, db.done())]);
    dbcellOffsetInBlock.push(off);
    blockBytes.push(bytes);
  }

  // DIMENSIONS mới.
  const usedRows = units.map((u) => u.r);
  const usedCols = units.flatMap((u) => [u.c, unitLastCol(u)]);
  const dim = new Buf()
    .u32(usedRows.length ? Math.min(...usedRows) : 0).u32(usedRows.length ? Math.max(...usedRows) + 1 : 0)
    .u16(usedCols.length ? Math.min(...usedCols) : 0).u16(usedCols.length ? Math.max(...usedCols) + 1 : 0).u16(0).done();

  // Ghép: [bản ghi trước bảng ô (INDEX viết lại)] DIMENSIONS [khối…] [phần sau] [đuôi].
  const head: Uint8Array[] = [];
  let indexPart = -1;
  let defColPart = -1;
  for (let i = 0; i < dimIdx; i++) {
    const r = recs[i];
    if (r.id === R.INDEX) {
      indexPart = head.length;
      head.push(rec(R.INDEX, new Uint8Array(16 + blocks.length * 4)));
      continue;
    }
    if (r.id === R.DEFCOLWIDTH) defColPart = head.length;
    head.push(rec(r.id, r.data));
  }
  const rest = recs.slice(end).map((r) => rec(r.id, r.data));
  const parts = [...head, rec(R.DIMENSIONS, dim), ...blockBytes, ...rest, tail.slice()];
  const fix = (start: number, ps: Uint8Array[]) => {
    if (indexPart < 0) return;
    let p = start;
    const posOf: number[] = [];
    for (const x of ps) { posOf.push(p); p += x.length; }
    const firstBlock = head.length + 1;
    const ib = new Buf().u32(0).u32(allRows.length ? allRows[0] : 0).u32(allRows.length ? allRows[allRows.length - 1] + 1 : 0).u32(defColPart >= 0 ? posOf[defColPart] : 0);
    blocks.forEach((_b, i) => ib.u32(posOf[firstBlock + i] + dbcellOffsetInBlock[i]));
    ps[indexPart] = rec(R.INDEX, ib.done());
  };
  return { parts, fix };
}
