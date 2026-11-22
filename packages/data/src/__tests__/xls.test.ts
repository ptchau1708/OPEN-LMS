import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ClassInfo, Profile, Tt27Evaluation } from '@openedu/contracts';
import {
  detectTable,
  isCfb,
  patchXls,
  planVnEduFill,
  readCfb,
  readXls,
  readXlsx,
  recognizeVnEdu,
  tt27Score,
  vneduSubject,
  vneduTerm,
  writeCfb,
  writeVnEduFill,
  type BridgeData,
} from '../export';

const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../export/__fixtures__/${name}`, import.meta.url))));
const SO_DIEM = fixture('vnedu-so-diem-mau.xls');
const NLPC = fixture('vnedu-nlpc-mau.xls');

describe('Compound File', () => {
  it('đọc rồi ghi lại giữ nguyên mọi luồng', () => {
    const root = readCfb(SO_DIEM);
    const again = readCfb(writeCfb(root));
    const names = (n: typeof root) => n.children.map((c) => `${c.name}:${c.data?.length ?? 0}`).sort();
    expect(names(again)).toEqual(names(root));
    for (const c of root.children) {
      const d = again.children.find((x) => x.name === c.name);
      expect(d?.data && c.data ? Buffer.from(d.data).equals(Buffer.from(c.data)) : d?.data === c.data).toBe(true);
    }
  });

  it('luồng lớn hơn 4096 byte nằm ngoài luồng mini và đọc lại đúng', () => {
    const big = new Uint8Array(70_000).map((_, i) => (i * 7) & 0xff);
    const small = new Uint8Array(100).fill(9);
    const root = { name: 'Root Entry', type: 5 as const, clsid: new Uint8Array(16), stateBits: 0, children: [
      { name: 'Workbook', type: 2 as const, clsid: new Uint8Array(16), stateBits: 0, data: big, children: [] },
      { name: '\u0005SummaryInformation', type: 2 as const, clsid: new Uint8Array(16), stateBits: 0, data: small, children: [] },
    ] };
    const back = readCfb(writeCfb(root));
    expect(Buffer.from(back.children.find((c) => c.name === 'Workbook')?.data as Uint8Array).equals(Buffer.from(big))).toBe(true);
    expect(back.children.find((c) => c.name.endsWith('SummaryInformation'))?.data).toEqual(small);
  });
});

describe('readXls (sổ điểm VnEdu)', () => {
  it('nhận ra định dạng và đọc trang tính, ô gộp, cột mã', () => {
    expect(isCfb(SO_DIEM)).toBe(true);
    const wb = readXlsx(SO_DIEM);
    expect(wb.format).toBe('xls');
    expect(wb.sheets.map((s) => s.name)).toEqual(['tieng_viet_5a1', 'dao_duc_5a1', 'am_nhac_5a1']);
    const tv = wb.sheets[0];
    expect(tv.rows[5][1]).toBe('1234567890-50-2-ck2-2026');
    expect(tv.rows[7].slice(0, 4)).toEqual([1, 9900000001, 'Nguyễn Văn', 'An']);
    expect(tv.merges).toContainEqual({ r1: 6, r2: 6, c1: 2, c2: 3 });
  });

  it('ghép "Họ và tên" gộp hai cột (họ đệm + tên)', () => {
    const t = detectTable(readXls(SO_DIEM).sheets[0]);
    expect(t?.col.lastName).toBe(2);
    expect(t?.col.firstName).toBe(3);
    expect(t?.col.code).toBe(1);
    expect(t?.students.map((s) => s.name)).toEqual(['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Minh Dũng', 'Võ Thị Ngọc Hà', 'Đặng Gia Huy']);
    expect(t?.students[0].code).toBe('9900000001');
  });
});

describe('patchXls', () => {
  it('điền chữ có dấu, số; giữ nguyên ô khác, trang khác', () => {
    const out = patchXls(SO_DIEM, [{ sheet: 'tieng_viet_5a1', patches: [{ r: 7, c: 4, value: 'Đọc to, rõ ràng; viết đúng chính tả.' }, { r: 7, c: 5, value: 9 }, { r: 7, c: 6, value: 'T' }] }]);
    expect(out.patched).toBe(3);
    const before = readXls(SO_DIEM);
    const after = readXls(out.bytes);
    expect(after.sheets[0].rows[7].slice(4, 7)).toEqual(['Đọc to, rõ ràng; viết đúng chính tả.', 9, 'T']);
    expect(after.sheets[0].rows.slice(0, 7)).toEqual(before.sheets[0].rows.slice(0, 7));
    expect(after.sheets[1]).toEqual(before.sheets[1]);
    expect(after.sheets[0].merges).toEqual(before.sheets[0].merges);
  });

  it('nhiều chuỗi dài (bảng chuỗi bị cắt qua CONTINUE) vẫn đọc lại đúng', () => {
    const long = (i: number) => `Nhận xét số ${i}: ${'Em tiến bộ rõ rệt, chăm chỉ, tích cực phát biểu xây dựng bài. '.repeat(12)}`;
    const patches = [];
    for (let r = 7; r < 13; r++) for (let c = 4; c < 9; c++) patches.push({ r, c, value: long(r * 10 + c) });
    const out = patchXls(SO_DIEM, [{ sheet: 'tieng_viet_5a1', patches }, { sheet: 'am_nhac_5a1', patches: [{ r: 7, c: 4, value: long(1) }] }]);
    const wb = readXls(out.bytes);
    for (const p of patches) expect(wb.sheets[0].rows[p.r][p.c]).toBe(p.value);
    expect(wb.sheets[2].rows[7][4]).toBe(long(1));
    // Sửa lần hai trên tệp đã sửa.
    const twice = readXls(patchXls(out.bytes, [{ sheet: 'dao_duc_5a1', patches: [{ r: 8, c: 5, value: 'H' }] }]).bytes);
    expect(twice.sheets[1].rows[8][5]).toBe('H');
    expect(twice.sheets[0].rows[12][8]).toBe(long(128));
  });

  it('thêm dòng mới vào mẫu trống (mẫu năng lực phẩm chất)', () => {
    const out = patchXls(NLPC, [{ sheet: 'Năng lực phẩm chất', styleBelowRow: 1, patches: [{ r: 2, c: 0, value: 1 }, { r: 2, c: 1, value: 9900000001 }, { r: 2, c: 2, value: 'Nguyễn Văn An' }, { r: 2, c: 5, value: 'T' }, { r: 40, c: 21, value: 'Đ' }] }]);
    const s = readXls(out.bytes).sheets[0];
    expect(s.rows[2].slice(0, 3)).toEqual([1, 9900000001, 'Nguyễn Văn An']);
    expect(s.rows[2][5]).toBe('T');
    expect(s.rows[40][21]).toBe('Đ');
    expect(readXls(out.bytes).sheets.map((x) => x.name)).toEqual(['Năng lực phẩm chất', 'Sheet2', 'Sheet3']);
  });
});

/* ============================ VnEdu tự nhận ============================ */
const cls = { id: 'c1', name: '5A1', grade: 5, studentIds: ['s1', 's2', 's3', 's4'] } as unknown as ClassInfo;
const st = (id: string, name: string, externalCode?: string): Profile => ({ id, name, role: 'student', ...(externalCode ? { externalCode } : {}) }) as unknown as Profile;
const ev = (studentId: string, level: 'T' | 'H' | 'C', score: number | undefined, comment: string): Tt27Evaluation => ({
  studentId, classId: 'c1', termId: 'CN', schoolYear: '2026-2027', generalComment: '', status: 'final',
  subjects: { 'tieng-viet': { level, comment, ...(score !== undefined ? { score } : {}) }, 'am-nhac': { level: 'H', comment: 'Hát đúng giai điệu.' } },
  qualities: { 'yeu-nuoc': 'T', 'nhan-ai': 'T', 'cham-chi': 'Đ', 'trung-thuc': 'T', 'trach-nhiem': 'Đ' },
  competencies: { 'tu-chu-tu-hoc': 'T', 'giao-tiep-hop-tac': 'Đ', 'gqvd-sang-tao': 'C', 'ngon-ngu': 'T', 'tinh-toan': 'Đ' },
});
const data: BridgeData = {
  cls, termId: 'CN', schoolYear: '2026-2027', month: '2026-05', exams: [], reports: {}, works: [], attendance: [],
  students: [st('s1', 'Nguyễn Văn An'), st('s2', 'Thị Bình', '9900000021'), st('s3', 'Lê Hoàng Cường', '9900000041'), st('s4', 'Bạn Mới')],
  tt27: [ev('s1', 'T', 8.6, 'Đọc trôi chảy.'), ev('s2', 'H', 6.4, 'Cần luyện viết.'), ev('s3', 'C', 0.2, 'Cần cố gắng thêm.')],
};

describe('recognizeVnEdu', () => {
  it('nhận ra sổ điểm các môn, kì, năm học, lớp', () => {
    const book = recognizeVnEdu(readXls(SO_DIEM));
    expect(book?.kind).toBe('so-diem');
    expect(book?.termId).toBe('CN');
    expect(book?.schoolYear).toBe('2026-2027');
    expect(book?.className).toBe('5A1');
    expect(book?.sheets.map((s) => [s.label, s.subjectId ?? null, s.skip ?? null])).toEqual([
      ['TIẾNG VIỆT', 'tieng-viet', null],
      ['ĐẠO ĐỨC', null, 'no-subject'],
      ['ÂM NHẠC', 'am-nhac', null],
    ]);
    // Nhận xét | KT CK2 | XL CK2 — bỏ 2 cột "Sau thi lại".
    expect(book?.sheets[0].mapping).toEqual({ 4: 'tt27-comment:tieng-viet', 5: 'tt27-score:tieng-viet', 6: 'tt27-level:tieng-viet' });
    expect(book?.sheets[2].mapping).toEqual({ 4: 'tt27-comment:am-nhac', 5: 'tt27-level:am-nhac' });
  });

  it('nhận ra mẫu năng lực phẩm chất', () => {
    const book = recognizeVnEdu(readXls(NLPC));
    expect(book?.kind).toBe('nlpc');
    const m = book?.sheets[0].mapping ?? {};
    expect(m[3]).toBe('nlpc-term');
    expect(m[4]).toBe('nlpc-comment:chung');
    expect(m[5]).toBe('tt27-comp:tu-chu-tu-hoc');
    expect(m[7]).toBe('tt27-comp:gqvd-sang-tao');
    expect(m[8]).toBe('nlpc-comment:dac-thu');
    expect(m[12]).toBe('tt27-comp:tham-mi');
    expect(m[16]).toBe('nlpc-comment:pham-chat');
    expect(m[21]).toBe('tt27-qual:trach-nhiem');
  });

  it('môn, kì, điểm theo TT27', () => {
    expect(vneduSubject('NGOẠI NGỮ 1')).toBe('tieng-anh');
    expect(vneduSubject('LỊCH SỬ VÀ ĐỊA LÍ')).toBeUndefined();
    expect(vneduTerm('HỌC KỲ 1 - GIỮA KỲ 1')).toBe('GK1');
    expect(vneduTerm('HỌC KỲ 2 - CUỐI KỲ 2')).toBe('CN');
    expect([tt27Score(8.5), tt27Score(6.4), tt27Score(0.2), tt27Score(10.4)]).toEqual([9, 6, 1, 10]);
  });
});

describe('điền tệp VnEdu', () => {
  it('sổ điểm: điền mọi trang khớp, ghép theo mã rồi họ tên, ra .xls', () => {
    const wb = readXls(SO_DIEM);
    const book = recognizeVnEdu(wb);
    if (!book) throw new Error('không nhận ra');
    const plan = planVnEduFill(wb, book, data);
    const tv = plan.sheets[0];
    expect(tv.matches.filter((m) => m.studentId).map((m) => [m.row, m.studentId])).toEqual([[7, 's1'], [8, 's2'], [9, 's3']]);
    expect(plan.sheets[1].patches).toEqual([]);
    const file = writeVnEduFill(SO_DIEM, wb, plan);
    expect(file.ext).toBe('xls');
    const out = readXls(file.bytes);
    expect(out.sheets[0].rows[7].slice(4, 7)).toEqual(['Đọc trôi chảy.', 9, 'T']);
    expect(out.sheets[0].rows[8].slice(4, 7)).toEqual(['Cần luyện viết.', 6, 'H']);
    expect(out.sheets[0].rows[9].slice(4, 7)).toEqual(['Cần cố gắng thêm.', 1, 'C']);
    expect(out.sheets[0].rows[10][4]).toBeNull();
    expect(out.sheets[2].rows[7].slice(4, 6)).toEqual(['Hát đúng giai điệu.', 'H']);
    expect(out.sheets[0].rows[5][1]).toBe('1234567890-50-2-ck2-2026');
  });

  it('mẫu năng lực phẩm chất trống: viết một dòng cho mỗi em có mã', () => {
    const wb = readXls(NLPC);
    const book = recognizeVnEdu(wb);
    if (!book) throw new Error('không nhận ra');
    const plan = planVnEduFill(wb, book, data);
    expect(plan.sheets[0].added).toBe(2);
    expect(plan.sheets[0].missingCode).toEqual(['Nguyễn Văn An', 'Bạn Mới']);
    const s = readXls(writeVnEduFill(NLPC, wb, plan).bytes).sheets[0];
    expect(s.rows[2].slice(0, 8)).toEqual([1, 9900000021, 'Thị Bình', 2, null, 'T', 'Đ', 'C']);
    expect(s.rows[2][21]).toBe('Đ');
    expect(s.rows[3].slice(0, 3)).toEqual([2, 9900000041, 'Lê Hoàng Cường']);
    // Học kì do GV chọn.
    const p2 = planVnEduFill(wb, book, data, { nlpcTerm: 'HK2' });
    expect(readXls(writeVnEduFill(NLPC, wb, p2).bytes).sheets[0].rows[2][3]).toBe('HK2');
  });
});
