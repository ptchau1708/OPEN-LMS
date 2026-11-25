import { describe, expect, it } from 'vitest';
import { isPeriodicAt, subjectGroupsFor, subjectLabelFor, subjectsForGrade, type Profile } from '@openedu/contracts';
import { bankable, suggestComments, type BankComment } from '../commentbank';
import { buildNotesTemplate, parseNotesSheet, readXlsx } from '../import';
import { cleanNote } from '../notes';

describe('Môn học theo Thông tư 32/2018', () => {
  it('có Tiếng dân tộc thiểu số (tự chọn lớp 1–5, không kiểm tra định kì)', () => {
    for (const g of [1, 2, 3, 4, 5]) expect(subjectsForGrade(g)).toContain('tieng-dan-toc');
    expect(subjectsForGrade(3, { compulsory: true })).not.toContain('tieng-dan-toc');
    expect(subjectsForGrade(1, { compulsory: true })).not.toContain('tieng-anh');
    expect(subjectsForGrade(3, { compulsory: true })).toContain('tieng-anh');
    expect(isPeriodicAt('tieng-dan-toc', 4)).toBe(false);
  });
  it('ô chọn môn chia nhóm: bắt buộc · hoạt động giáo dục · tự chọn', () => {
    const g1 = subjectGroupsFor(1);
    expect(g1.map((g) => g.label)).toEqual(['Môn học bắt buộc', 'Hoạt động giáo dục bắt buộc', 'Môn học tự chọn', 'Khác']);
    expect(g1[1]!.subjects.map((s) => s.id)).toEqual(['hdtn']);
    expect(g1[2]!.subjects.map((s) => s.id)).toEqual(['tieng-anh', 'tieng-dan-toc']);
    expect(subjectGroupsFor(4)[2]!.subjects.map((s) => s.id)).toEqual(['tieng-dan-toc']);
    expect(subjectLabelFor('am-nhac', 3)).toBe('Âm nhạc (Nghệ thuật)');
    expect(subjectLabelFor('tin-hoc', 4)).toBe('Tin học (Tin học và Công nghệ)');
    expect(subjectLabelFor('tieng-dan-toc', 2)).toBe('Tiếng dân tộc thiểu số');
  });
});

const C = (p: Partial<BankComment>): BankComment => ({ id: Math.random().toString(36), scope: 'tt27:toan', text: '', uses: 1, shared: false, ownerId: 'u', mine: true, updatedAt: '', ...p });

describe('Ngân hàng nhận xét', () => {
  const bank = [
    C({ text: 'Em tính nhanh, chính xác.', level: 'T', uses: 5 }),
    C({ text: 'Em cần luyện thêm bảng nhân.', level: 'C', uses: 9 }),
    C({ text: 'Em làm bài cẩn thận.', level: 'H', uses: 2 }),
    C({ text: 'Em đọc to, rõ ràng.', scope: 'tt27:tieng-viet' }),
  ];
  it('gợi ý cùng môn, cùng mức xếp trước, lọc theo chữ đang gõ (không dấu)', () => {
    expect(suggestComments(bank, 'tt27:toan', { level: 'T' })[0]!.text).toBe('Em tính nhanh, chính xác.');
    expect(suggestComments(bank, 'tt27:toan', { level: 'C' })[0]!.text).toBe('Em cần luyện thêm bảng nhân.');
    expect(suggestComments(bank, 'tt27:toan', { typed: 'bang nhan' }).map((c) => c.text)).toEqual(['Em cần luyện thêm bảng nhân.']);
    expect(suggestComments(bank, 'tt27:toan').some((c) => c.scope !== 'tt27:toan')).toBe(false);
  });
  it('không tự lưu câu quá ngắn hoặc có tên riêng của học sinh', () => {
    expect(bankable('Tốt', 'Nguyễn Văn An')).toBe(false);
    expect(bankable('An đọc to, rõ ràng.', 'Nguyễn Văn An')).toBe(false);
    expect(bankable('Em đọc to, rõ ràng.', 'Nguyễn Văn An')).toBe(true);
    expect(bankable('Em ăn uống đủ bữa, khoẻ mạnh.', 'Lê An')).toBe(true);
  });
});

const st = (id: string, name: string, extra: Partial<Profile> = {}): Profile => ({ id, name, role: 'student', ...extra }) as Profile;

describe('Thông tin bổ sung — nhập Excel cả lớp', () => {
  const students = [st('s1', 'Nguyễn Minh Hải', { username: 'hai4a' }), st('s2', 'Trần Ngọc Lan', { externalCode: 'HS002' }), st('s3', 'Lê An'), st('s4', 'Lê An')];
  it('tệp mẫu có danh sách lớp; đọc lại ghép đúng học sinh', () => {
    const bytes = buildNotesTemplate(students.slice(0, 2), '4A');
    const rows = readXlsx(bytes).rows;
    expect(rows[0]).toEqual(['STT', 'Họ và tên', 'Tên đăng nhập', 'Mã HS', 'Chiều cao (cm)', 'Cân nặng (kg)', 'Ghi chú']);
    expect(rows.slice(1).map((r) => r[1])).toEqual(['Nguyễn Minh Hải', 'Trần Ngọc Lan']);
  });
  it('ghép theo tên đăng nhập → mã HS → họ tên; báo trùng tên / không có; bỏ dòng trống', () => {
    const rows = [
      ['DANH SÁCH LỚP 4A'],
      ['STT', 'Họ và tên', 'Tên đăng nhập', 'Mã HS', 'Thị lực', 'Ghi chú'],
      ['1', 'Hải', 'HAI4A', '', '10/10', 'Mắt tốt'],
      ['2', 'Ngọc Lan', '', 'hs002', '8/10', ''],
      ['3', 'Lê An', '', '', '9/10', ''],
      ['4', 'Phạm Bình', '', '', '7/10', ''],
      ['5', 'trần ngọc lan', '', '', '', ''],
    ];
    const s = parseNotesSheet(rows, students);
    expect(s.dataColumns).toEqual(['Thị lực']);
    expect(s.bodyColumn).toBe('Ghi chú');
    expect(s.rows.map((r) => r.student?.id ?? r.problem)).toEqual(['s1', 's2', 'Trùng tên — thêm cột Tên đăng nhập hoặc Mã HS', 'Không tìm thấy học sinh này trong lớp']);
    expect(s.rows[0]!.fields).toEqual({ 'Thị lực': '10/10' });
    expect(s.rows[0]!.body).toBe('Mắt tốt');
    expect(s.rows[0]!.rowNo).toBe(3);
  });
  it('thiếu cột Họ và tên → báo lỗi dễ hiểu; ghi chép trống bị chặn', () => {
    expect(() => parseNotesSheet([['A', 'B']], students)).toThrow(/Họ và tên/);
    expect(() => cleanNote({ studentId: 's1', category: 'khac', title: 'x', body: ' ', fields: {}, date: '2026-11-25', source: 'tay', shareParent: false })).toThrow(/chưa có nội dung/);
    expect(cleanNote({ studentId: 's1', category: 'khac', title: '  Khám  mắt ', body: '', fields: { ' Thị lực ': ' 10/10 ', Trống: '' }, date: 'sai', source: 'excel', shareParent: false }))
      .toMatchObject({ title: 'Khám mắt', fields: { 'Thị lực': '10/10' } });
  });
});
