import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { schoolYearOf } from '@openedu/contracts';
import { DemoDataSource } from '../demo/DemoDataSource';
import { MemoryStorage } from '../storage';
import { DEMO_EXAM_ID } from '../exam';
import { DemoSchoolSource, setSchoolSource } from '../school';
import {
  ExcelVnEduConnector,
  attendanceSheet,
  bridgeFields,
  buildFillPlan,
  classListSheet,
  classroomGradeRows,
  columnKeys,
  detectTable,
  detectWorkbook,
  examScoreSheet,
  fieldValue,
  fillTemplate,
  gc,
  getBridgeSource,
  kindOfLabel,
  loadBridgeData,
  matchRows,
  openTemplate,
  patchXlsx,
  readHtmlTables,
  readXlsx,
  suggestMapping,
  toMatchStudents,
  tt27Sheet,
  writeXlsx,
  XlsxError,
  type XCell,
} from '../export';

const NAMES = ['Nguyễn Minh Hải', 'Trần Ngọc Lan', 'Lê Đăng Khoa', 'Phạm Thanh Mai', 'Hoàng Anh Tuấn', 'Vũ Tường Vy', 'Đỗ Hoài Nam', 'Bùi Phương Thảo'];

/** Sổ điểm kiểu VnEdu: 5 dòng tên trường / tên bảng gộp ô, tiêu đề ở dòng 6 (2 tầng), mã HS có số 0 đầu. */
function vneduLike(): Uint8Array {
  const rows: XCell[][] = [
    ['SỞ GIÁO DỤC VÀ ĐÀO TẠO'],
    ['TRƯỜNG TIỂU HỌC HOA SEN'],
    ['BẢNG TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ GIÁO DỤC'],
    ['Lớp 4A — Học kì I — Năm học 2026-2027'],
    [],
    ['STT', 'Mã học sinh', 'Họ và tên', 'Ngày sinh', 'Toán', null, null, 'Vắng có phép', 'Vắng không phép'],
    [null, null, null, null, 'Mức đạt được', 'Điểm KTĐK', 'Nhận xét', null, null],
    ...NAMES.map((n, i): XCell[] => [i + 1, `00791${String(i + 1).padStart(5, '0')}`, n, new Date(Date.UTC(2017, i, 10 + i)), null, null, null, null, null]),
    [],
    [null, null, 'Giáo viên chủ nhiệm'],
  ];
  return writeXlsx([
    { name: 'Tong hop', rows, header: 5, headerRows: 2, textCols: [1], merges: [
      { r1: 0, c1: 0, r2: 0, c2: 8 }, { r1: 2, c1: 0, r2: 2, c2: 8 },
      { r1: 5, c1: 0, r2: 6, c2: 0 }, { r1: 5, c1: 1, r2: 6, c2: 1 }, { r1: 5, c1: 2, r2: 6, c2: 2 }, { r1: 5, c1: 3, r2: 6, c2: 3 },
      { r1: 5, c1: 4, r2: 5, c2: 6 }, { r1: 5, c1: 7, r2: 6, c2: 7 }, { r1: 5, c1: 8, r2: 6, c2: 8 },
    ] },
    { name: 'Ghi chú', rows: [['Không sửa trang này'], ['x', 1]] },
  ]);
}

describe('đọc / ghi xlsx', () => {
  it('khứ hồi: tiếng Việt, số, mã có số 0 đầu, ngày, nhiều trang, ô gộp', () => {
    const wb = readXlsx(vneduLike());
    expect(wb.sheets.map((s) => s.name)).toEqual(['Tong hop', 'Ghi chú']);
    const s = wb.sheets[0];
    expect(s.rows[1][0]).toBe('TRƯỜNG TIỂU HỌC HOA SEN');
    expect(s.rows[7][0]).toBe(1);
    expect(s.rows[7][1]).toBe('0079100001');
    expect(s.rows[7][2]).toBe('Nguyễn Minh Hải');
    expect(s.rows[7][3]).toBeInstanceOf(Date);
    expect((s.rows[9][3] as Date).toISOString().slice(0, 10)).toBe('2017-03-12');
    expect(s.merges).toContainEqual({ r1: 5, c1: 4, r2: 5, c2: 6 });
    expect(wb.sheets[1].rows[1]).toEqual(['x', 1]);
  });
  it('kí tự đặc biệt & < > " và xuống dòng giữ nguyên; số thập phân', () => {
    const wb = readXlsx(writeXlsx([{ name: 'A/B:C*?', rows: [['a'], ['Em <giỏi> & "chăm"\nDòng 2', 7.5, true, -3]] }]));
    expect(wb.sheets[0].name).toBe('A B C');
    expect(wb.sheets[0].rows[1]).toEqual(['Em <giỏi> & "chăm"\nDòng 2', 7.5, true, -3]);
  });
  it('báo lỗi dễ hiểu với tệp .xls cũ và tệp không phải Excel', () => {
    expect(() => readXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).toThrow(/Lưu thành/);
    expect(() => readXlsx(strToU8('xin chào'))).toThrow(XlsxError);
  });
  it('đọc bảng HTML giả .xls (colspan/rowspan)', () => {
    const [t] = readHtmlTables('<table><tr><th rowspan="2">STT</th><th rowspan="2">Họ và tên</th><th colspan="2">Toán</th></tr><tr><th>Mức</th><th>Điểm</th></tr><tr><td>1</td><td>Lê Văn &amp; A</td><td></td><td>0123</td></tr></table>');
    expect(t.rows[2]).toEqual([1, 'Lê Văn & A', null, '0123']);
    expect(t.merges).toHaveLength(3);
    expect(detectTable(t)?.columns.map((c) => c.label)).toEqual(['STT', 'Họ và tên', 'Toán / Mức', 'Toán / Điểm']);
  });
});

describe('nhận ra bảng', () => {
  it('tên cột có dấu / không dấu', () => {
    expect(kindOfLabel('Mã học sinh')).toBe('code');
    expect(kindOfLabel('MA HS')).toBe('code');
    expect(kindOfLabel('Mã định danh Bộ GD&ĐT')).toBe('code');
    expect(kindOfLabel('Mã lớp')).toBe('other');
    expect(kindOfLabel('Ho va ten')).toBe('name');
    expect(kindOfLabel('Họ tên học sinh')).toBe('name');
    expect(kindOfLabel('Ngày sinh')).toBe('dob');
    expect(kindOfLabel('Lớp')).toBe('class');
    expect(kindOfLabel('STT')).toBe('stt');
    expect(kindOfLabel('Toán')).toBe('other');
  });
  it('tìm dòng tiêu đề thật sau các dòng gộp, ghép nhãn 2 tầng, bỏ dòng chữ kí', () => {
    const hit = detectWorkbook(readXlsx(vneduLike()).sheets);
    expect(hit?.sheetIndex).toBe(0);
    const t = hit!.table;
    expect([t.headerStart, t.headerEnd]).toEqual([5, 6]);
    expect(t.columns.map((c) => c.label)).toEqual(['STT', 'Mã học sinh', 'Họ và tên', 'Ngày sinh', 'Toán / Mức đạt được', 'Toán / Điểm KTĐK', 'Toán / Nhận xét', 'Vắng có phép', 'Vắng không phép']);
    expect(t.students).toHaveLength(8);
    expect(t.students[0]).toMatchObject({ row: 7, code: '0079100001', name: 'Nguyễn Minh Hải', dob: '10/01/2017' });
    expect(t.fingerprint).toBe(detectWorkbook(readXlsx(vneduLike()).sheets)!.table.fingerprint);
    expect(Object.values(columnKeys(t))).toContain('toan nhan xet');
  });
  it('cột "Họ đệm" + "Tên" tách riêng', () => {
    const t = detectTable({ name: 's', merges: [], rows: [['Danh sách'], ['TT', 'Mã HS', 'Họ đệm', 'Tên', 'Lớp'], [1, 'A1', 'Nguyễn Văn', 'An', '4A'], [2, 'A2', 'Trần Thị', 'Bình', '4A']] });
    expect(t?.students.map((s) => s.name)).toEqual(['Nguyễn Văn An', 'Trần Thị Bình']);
    expect(t?.students[0].className).toBe('4A');
  });
  it('không có cột họ tên → null', () => {
    expect(detectTable({ name: 's', merges: [], rows: [['a', 'b'], [1, 2]] })).toBeNull();
  });
});

describe('ghép học sinh', () => {
  const students = [
    { id: 's1', name: 'Minh Hải', externalCode: 'HS01' },
    { id: 's2', name: 'Ngọc Lan' },
    { id: 's3', name: 'Trần Ngọc Lan' },
    { id: 's4', name: 'Đăng Khoa', username: 'khoa4a3' },
    { id: 's5', name: 'Bùi An' },
  ];
  it('theo mã trước, rồi họ tên; đánh dấu chỗ không chắc', () => {
    const m = matchRows([
      { row: 1, code: 'hs01', name: 'Tên Khác Hẳn' },
      { row: 2, code: '', name: 'Trần Ngọc Lan' },
      { row: 3, code: '', name: 'Lê Đăng Khoa' },
      { row: 4, code: '', name: 'Phạm Ngọc Lan' },
      { row: 5, code: '', name: 'Không Có Ai' },
      { row: 6, code: 'KHOA4A3', name: '' },
      { row: 7, code: '', name: 'An' },
    ], students);
    expect(m[0]).toMatchObject({ status: 'code', studentId: 's1' });
    expect(m[1]).toMatchObject({ status: 'name', studentId: 's3' });
    // Dòng 3 và dòng 6 cùng nhận Đăng Khoa → giữ dòng khớp mã, dòng kia để GV chọn.
    expect(m[2].status).toBe('ambiguous');
    expect(m[5]).toMatchObject({ status: 'code', studentId: 's4' });
    expect(m[3]).toMatchObject({ status: 'loose', studentId: 's2' });
    expect(m[4].status).toBe('missing');
    expect(m[6].status).toBe('ambiguous');
  });
});

describe('điền thẳng vào tệp gốc', () => {
  it('giữ kiểu ô, trang khác, ô gộp; chữ và số đúng loại', () => {
    const src = vneduLike();
    const r = patchXlsx(src, [{ r: 7, c: 4, value: 'T' }, { r: 7, c: 5, value: 9 }, { r: 8, c: 6, value: 'Em học <tốt> & chăm' }, { r: 20, c: 2, value: 'dòng mới' }], { sheet: 'Tong hop', styleBelowRow: 6 });
    expect(r.patched).toBe(4);
    const wb = readXlsx(r.bytes);
    const s = wb.sheets[0];
    expect(s.rows[7].slice(4, 6)).toEqual(['T', 9]);
    expect(s.rows[8][6]).toBe('Em học <tốt> & chăm');
    expect(s.rows[20][2]).toBe('dòng mới');
    expect(s.rows[7][1]).toBe('0079100001');
    expect(s.merges).toHaveLength(9);
    expect(wb.sheets[1].rows[1]).toEqual(['x', 1]);
    const before = unzipSync(src);
    const after = unzipSync(r.bytes);
    expect(strFromU8(after['xl/styles.xml'])).toBe(strFromU8(before['xl/styles.xml']));
    expect(strFromU8(after['xl/worksheets/sheet2.xml'])).toBe(strFromU8(before['xl/worksheets/sheet2.xml']));
    // Ô đã có kiểu (kẻ viền) vẫn giữ s="…"
    expect(strFromU8(after['xl/worksheets/sheet1.xml'])).toMatch(/<c r="E8" s="4" t="s">/);
  });
  it('tệp không có sharedStrings → dùng inlineStr; ô công thức bị thay thì bỏ calcChain', () => {
    const X = '<?xml version="1.0" encoding="UTF-8"?>';
    const files = {
      '[Content_Types].xml': strToU8(`${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>`),
      '_rels/.rels': strToU8(`${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      'xl/workbook.xml': strToU8(`${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8(`${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>`),
      'xl/calcChain.xml': strToU8(`${X}<calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="C2" i="1"/></calcChain>`),
      'xl/worksheets/sheet1.xml': strToU8(`${X}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C2"/><sheetData><row r="1" spans="1:3"><c r="A1" t="inlineStr"><is><t>Họ và tên</t></is></c><c r="B1" t="inlineStr"><is><r><t>Điể</t></r><r><t>m</t></r></is></c></row><row r="2" spans="1:3"><c r="A2" t="inlineStr"><is><t>Lê An</t></is></c><c r="C2"><f>1+1</f><v>2</v></c></row></sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`),
    };
    const src = zipSync(files);
    expect(readXlsx(src).sheets[0].rows).toEqual([['Họ và tên', 'Điểm', null], ['Lê An', null, 2]]);
    const r = patchXlsx(src, [{ r: 1, c: 1, value: 'Tốt' }, { r: 1, c: 2, value: 8.5 }]);
    expect(r.formulasReplaced).toBe(1);
    const out = unzipSync(r.bytes);
    expect(out['xl/calcChain.xml']).toBeUndefined();
    expect(strFromU8(out['[Content_Types].xml'])).not.toMatch(/calcChain/);
    expect(strFromU8(out['xl/worksheets/sheet1.xml'])).toMatch(/<pageMargins /);
    expect(readXlsx(r.bytes).sheets[0].rows[1]).toEqual(['Lê An', 'Tốt', 8.5]);
  });
  it('XML có tiền tố không gian tên → báo "exotic" để chuyển cách dự phòng', () => {
    const files = unzipSync(vneduLike());
    files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace(/<(\/?)(worksheet|sheetData|row|c|v)\b/g, '<$1x:$2').replace('xmlns=', 'xmlns:x='));
    const exotic = zipSync(files);
    let code = '';
    try { patchXlsx(exotic, [{ r: 7, c: 4, value: 'T' }]); } catch (e) { code = (e as XlsxError).code; }
    expect(code).toBe('exotic');
    // Vẫn đọc được (để ghép dòng) và điền bằng cách dự phòng.
    const wb = readXlsx(exotic);
    const hit = detectWorkbook(wb.sheets)!;
    expect(hit.table.students).toHaveLength(8);
  });
});

function demo() {
  const storage = new MemoryStorage();
  const ds = new DemoDataSource({ storage, now: () => new Date('2026-11-17T10:00:00+07:00'), relayUrl: 'ws://127.0.0.1:1' });
  return ds;
}

describe('điền vào mẫu với dữ liệu lớp 4A (demo)', () => {
  it('ghép 8 em theo tên, điền điểm đề + TT27 + chuyên cần, tệp trả về đọc lại đúng', async () => {
    const ds = demo();
    await ds.signIn('cothu', '123456');
    const cls = (await ds.getClass('c-4a'))!;
    const data = await loadBridgeData(ds, cls, { termId: 'CK1', schoolYear: schoolYearOf(new Date('2026-11-17')), month: '2026-11' });
    expect(data.students).toHaveLength(8);
    const fields = bridgeFields(data);
    expect(fields.some((f) => f.id === `exam:${DEMO_EXAM_ID}`)).toBe(true);
    const file = vneduLike();
    const t = openTemplate(file);
    const matches = matchRows(t.table.students, toMatchStudents(data));
    expect(matches.every((m) => m.status === 'loose' && m.studentId)).toBe(true);
    expect(suggestMapping(t.table, fields)).toMatchObject({ 4: 'tt27-level:toan', 5: 'tt27-score:toan', 6: 'tt27-comment:toan', 7: 'att-excused', 8: 'att-unexcused' });
    const mapping = { 5: `exam:${DEMO_EXAM_ID}`, 4: `exam-level:${DEMO_EXAM_ID}`, 6: 'name', 7: 'att-excused' };
    const plan = buildFillPlan(t.wb.sheets[0], t.table, matches, mapping, data);
    const withScore = data.students.filter((s) => fieldValue(data, `exam:${DEMO_EXAM_ID}`, s.id) !== null);
    expect(withScore.length).toBeGreaterThan(0);
    const res = fillTemplate(file, t.wb, 0, t.table, plan);
    expect(res.mode).toBe('patched');
    const back = readXlsx(res.bytes).sheets[0];
    for (const m of matches) {
      const st = data.students.find((s) => s.id === m.studentId)!;
      expect(back.rows[m.row][6]).toBe(st.name);
      expect(back.rows[m.row][5]).toBe(fieldValue(data, `exam:${DEMO_EXAM_ID}`, st.id));
    }
    // Không ghi đè ô đã có khi overwrite = false
    const kept = buildFillPlan(back, t.table, matches, { 6: 'username' }, data, { overwrite: false });
    expect(kept.filled).toBe(0);
    expect(kept.kept).toBe(8);
    // Bộ nối Excel (đường nối VnEdu)
    const c = new ExcelVnEduConnector();
    expect((await c.pullRoster({ file })).map((r) => r.code)[0]).toBe('0079100001');
    expect((await c.pushMarks({ file }, data, mapping)).unmatched).toBe(0);
  });
  it('tệp lạ → ghi tệp mới sạch cùng tiêu đề, có lời nhắn', async () => {
    const ds = demo();
    const cls = (await ds.getClass('c-4a'))!;
    const data = await loadBridgeData(ds, cls, { termId: 'CK1', schoolYear: '2026-2027', month: '2026-11' });
    const files = unzipSync(vneduLike());
    files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace(/<(\/?)(worksheet|sheetData|row|c|v|mergeCells|mergeCell)\b/g, '<$1x:$2').replace('xmlns=', 'xmlns:x='));
    const file = zipSync(files);
    const t = openTemplate(file);
    const matches = matchRows(t.table.students, toMatchStudents(data));
    const res = fillTemplate(file, t.wb, t.sheetIndex, t.table, buildFillPlan(t.wb.sheets[0], t.table, matches, { 6: 'name' }, data));
    expect(res.mode).toBe('rebuilt');
    expect(res.note).toMatch(/tệp mới/);
    const back = readXlsx(res.bytes).sheets[0];
    expect(back.rows[5].slice(0, 5)).toEqual(['STT', 'Mã học sinh', 'Họ và tên', 'Ngày sinh', 'Toán']);
    expect(back.rows[7][1]).toBe('0079100001');
    expect(back.rows[7][6]).toBe('Minh Hải');
    expect(back.merges).toHaveLength(9);
  });
  it('xuất nhanh: mỗi bảng bắt đầu bằng STT, mã, họ tên và đọc lại được', async () => {
    const ds = demo();
    await ds.signIn('cothu', '123456');
    const cls = (await ds.getClass('c-4a'))!;
    await getBridgeSource(ds).setExternalIds('c-4a', [{ studentId: 'u-hai4a1', externalCode: '0001234' }]);
    const data = await loadBridgeData(ds, cls, { termId: 'CK1', schoolYear: '2026-2027', month: '2026-11' });
    const specs = [classListSheet(data), examScoreSheet(data, data.reports[DEMO_EXAM_ID]), tt27Sheet(data), attendanceSheet(data)];
    const wb = readXlsx(writeXlsx(specs));
    expect(wb.sheets).toHaveLength(4);
    for (const s of wb.sheets) {
      expect(s.rows[3].slice(0, 3)).toEqual(['STT', 'Mã học sinh', 'Họ và tên']);
      const t = detectTable(s)!;
      expect(t.students).toHaveLength(8);
      expect(t.students[0].code).toBe('0001234');
    }
    expect(classroomGradeRows(data, [DEMO_EXAM_ID])[0].slice(0, 4)).toEqual(['Mã học sinh', 'Họ và tên', 'Email Google', data.reports[DEMO_EXAM_ID].exam.title]);
  });
});

describe('mã bên ngoài (demo)', () => {
  it('GV chủ nhiệm ghi mã, tạo HS kèm mã; GV lớp khác bị chặn', async () => {
    const ds = demo();
    await ds.signIn('cothu', '123456');
    setSchoolSource(ds, new DemoSchoolSource(ds));
    const b = getBridgeSource(ds);
    expect(await b.setExternalIds('c-4a', [{ studentId: 'u-hai4a1', externalCode: ' 007 ' }, { studentId: 'u-an2a1', externalCode: 'X' }, { studentId: 'u-lan4a2', googleId: 'g-1', googleEmail: 'lan@truong.edu.vn' }])).toBe(2);
    const st = await ds.listStudents('c-4a');
    expect(st.find((s) => s.id === 'u-hai4a1')?.externalCode).toBe('007');
    expect((await ds.listStudents('c-2a')).find((s) => s.id === 'u-an2a1')?.externalCode).toBeUndefined();
    expect(await b.listGoogleIds('c-4a')).toEqual({ 'u-lan4a2': { googleId: 'g-1', email: 'lan@truong.edu.vn' } });
    const slips = await b.createStudents('c-4a', [{ name: 'Đinh Gia Bảo', externalCode: '0099' }, { name: ' ' }, { name: 'Lý Thu Hà' }]);
    expect(slips.map((s) => s.username)).toEqual(['bao4a9', 'ha4a10']);
    expect((await ds.listStudents('c-4a')).find((s) => s.name === 'Đinh Gia Bảo')?.externalCode).toBe('0099');
    await expect(b.setExternalIds('c-2a', [{ studentId: 'u-an2a1', externalCode: 'X' }])).rejects.toThrow(/lớp mình/);
    await expect(b.createStudents('c-2a', [{ name: 'A B' }])).rejects.toThrow(/chủ nhiệm/);
    await b.setExternalIds('c-4a', [{ studentId: 'u-hai4a1', externalCode: '' }]);
    expect((await ds.listStudents('c-4a')).find((s) => s.id === 'u-hai4a1')?.externalCode).toBeUndefined();
  });
});

/* ============================ Google Classroom (phản hồi giả) ============================ */
type Call = { url: string; method: string; body?: unknown; auth?: string };
function mockFetch(handler: (c: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetch: gc.FetchLike = async (url, init) => {
    const c: Call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined, auth: init?.headers?.Authorization };
    calls.push(c);
    const r = handler(c);
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { api: { fetch, token: 'tok' } as gc.ClassroomApi, calls };
}

describe('Google Classroom API (giả lập)', () => {
  it('đọc hết các trang lớp học và học sinh, gửi kèm token', async () => {
    const { api, calls } = mockFetch((c) => {
      if (c.url.includes('/students')) return { body: c.url.includes('pageToken=p2') ? { students: [{ userId: 'g2', profile: { name: { fullName: 'Trần B' } } }] } : { students: [{ userId: 'g1', profile: { name: { fullName: 'Lê A' }, emailAddress: 'a@x.vn' } }], nextPageToken: 'p2' } };
      return { body: c.url.includes('pageToken=') ? { courses: [{ id: '2', name: '4B' }] } : { courses: [{ id: '1', name: '4A' }], nextPageToken: 'n/1' } };
    });
    expect((await gc.listCourses(api)).map((c) => c.name)).toEqual(['4A', '4B']);
    expect(calls[0].url).toContain('teacherId=me');
    expect(calls[1].url).toContain('pageToken=n%2F1');
    expect(calls[0].auth).toBe('Bearer tok');
    expect(await gc.listCourseStudents(api, '1')).toEqual([{ userId: 'g1', fullName: 'Lê A', email: 'a@x.vn' }, { userId: 'g2', fullName: 'Trần B' }]);
  });
  it('tạo bài tập có link và điểm tối đa; chỉ liệt kê bài do ứng dụng tạo', async () => {
    const { api, calls } = mockFetch((c) => (c.method === 'POST' ? { body: { id: 'cw9', title: 'Đề 1', associatedWithDeveloper: true } } : { body: { courseWork: [{ id: 'a', title: 'tay', associatedWithDeveloper: false }, { id: 'b', title: 'app', associatedWithDeveloper: true }] } }));
    const w = await gc.createCourseWork(api, 'c 1', { title: 'Đề 1', maxPoints: 10, linkUrl: 'https://hoc.truong.vn/kiem-tra/e1' });
    expect(w.id).toBe('cw9');
    expect(calls[0].url).toBe('https://classroom.googleapis.com/v1/courses/c%201/courseWork');
    expect(calls[0].body).toEqual({ title: 'Đề 1', maxPoints: 10, workType: 'ASSIGNMENT', state: 'PUBLISHED', materials: [{ link: { url: 'https://hoc.truong.vn/kiem-tra/e1' } }] });
    expect((await gc.listCourseWork(api, 'c1', true)).map((x) => x.id)).toEqual(['b']);
  });
  it('đẩy điểm: lỗi từng phần không dừng cả lớp', async () => {
    const { api, calls } = mockFetch((c) => {
      if (c.method === 'GET') return { body: { studentSubmissions: [{ id: 's1', userId: 'g1' }, { id: 's2', userId: 'g2' }, { id: 's3', userId: 'g3' }] } };
      if (c.url.includes('/s2?')) return { status: 500, body: { error: { message: 'backend' } } };
      return { body: { id: 'x' } };
    });
    const r = await gc.pushGrades(api, 'c', 'w', [{ googleUserId: 'g1', grade: 9 }, { googleUserId: 'g2', grade: 7 }, { googleUserId: 'gX', grade: 5 }, { googleUserId: 'g3', grade: 10 }]);
    expect(r.map((x) => x.ok)).toEqual([true, false, false, true]);
    expect(r[1].error).toMatch(/Máy chủ Google/);
    expect(r[2].error).toMatch(/không có trong bài tập/);
    const patch = calls.filter((c) => c.method === 'PATCH');
    expect(patch).toHaveLength(3);
    expect(patch[0].url).toContain('updateMask=assignedGrade,draftGrade');
    expect(patch[0].body).toEqual({ assignedGrade: 9, draftGrade: 9 });
  });
  it('403 bài không do ứng dụng tạo: dừng sớm, báo cách xử lí', async () => {
    const { api, calls } = mockFetch((c) => (c.method === 'GET'
      ? { body: { studentSubmissions: [{ id: 's1', userId: 'g1' }, { id: 's2', userId: 'g2' }] } }
      : { status: 403, body: { error: { code: 403, status: 'PERMISSION_DENIED', message: '@ProjectPermissionDenied The Developer Console project is not permitted to make this request.' } } }));
    const r = await gc.pushGrades(api, 'c', 'w', [{ googleUserId: 'g1', grade: 9 }, { googleUserId: 'g2', grade: 7 }], 'draft');
    expect(r.every((x) => !x.ok && /không do OPEN-EDU tạo/.test(x.error ?? ''))).toBe(true);
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(calls[1].body).toEqual({ draftGrade: 9 });
  });
  it('401 và mất mạng có lời nhắn riêng; link chia sẻ', async () => {
    await expect(gc.listCourses(mockFetch(() => ({ status: 401, body: {} })).api)).rejects.toThrow(/hết hạn/);
    await expect(gc.listCourses({ token: 't', fetch: async () => { throw new Error('net'); } })).rejects.toThrow(/Không kết nối/);
    expect(gc.classroomShareUrl('https://hoc.vn/bai/l 1?a=b', 'Phân số & số')).toBe('https://classroom.google.com/share?url=https%3A%2F%2Fhoc.vn%2Fbai%2Fl%201%3Fa%3Db&title=Ph%C3%A2n%20s%E1%BB%91%20%26%20s%E1%BB%91');
  });
});
