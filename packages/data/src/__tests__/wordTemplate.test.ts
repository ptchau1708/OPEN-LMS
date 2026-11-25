import { describe, expect, it } from 'vitest';
import { SUBJECT_LIST, fitSubjectToGrade, isPeriodicAt, subjectGradeNote, subjectLabelFor, subjectOptions, subjectOptionsFor, subjectsForGrade } from '@openedu/contracts';
import { buildWordTemplateDocx, checkItem, docxToText, draftStatus, parseQuestionText, subjectGradeWarning, WORD_TEMPLATE_EXAMPLES } from '../import';
import { parseSubject } from '../import/template';

const D = { grade: 3 as const, subject: 'toan' as const };

describe('Mẫu Word đủ các dạng', () => {
  const docx = buildWordTemplateDocx();
  const text = docxToText(docx);
  const res = parseQuestionText(text.text, D, 'docx');

  it('đọc lại tệp mẫu: đủ 18 câu ví dụ, đúng dạng, không coi phần hướng dẫn là bài đọc', () => {
    expect(res.preamble).toBeUndefined();
    expect(res.drafts.length).toBe(WORD_TEMPLATE_EXAMPLES.length);
    const types = res.drafts.map((d) => d.item.type);
    expect(types).toEqual([
      'MCQ', 'MCQ_MULTIPLE', 'MCQ', 'SHORT_ANSWER', 'MATCHING', 'ORDERING', 'DRAG_DROP', 'SENTENCE_SCRAMBLE', 'WORD_CLASSIFY',
      'FILL_IN_PASSAGE', 'INLINE_DROPDOWN', 'LISTEN_CHOOSE', 'HOTSPOT', 'DRAW', 'RECORD_READ', 'MATH_MANIPULATIVE', 'MATH_MANIPULATIVE', 'POLL',
    ]);
    // đủ 16 dạng của ngân hàng
    expect(new Set(types).size).toBe(16);
  });

  it('mọi câu (trừ Chạm vào hình) sẵn sàng lưu, có đáp án đúng', () => {
    for (const d of res.drafts) {
      if (d.item.type === 'HOTSPOT') {
        expect(draftStatus(d)).toBe('review');
        continue;
      }
      expect({ t: d.item.type, s: draftStatus(d), p: checkItem(d.item).problems, n: d.notes }).toEqual({ t: d.item.type, s: 'ready', p: [], n: [] });
    }
  });

  it('nội dung từng dạng', () => {
    const by = (i: number) => res.drafts[i].item as never as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(by(0).key.correct).toBe('b');
    expect(by(1).key.correct).toEqual(['a', 'c']);
    expect(by(2).payload.options.map((o: { text: string }) => o.text)).toEqual(['Đúng', 'Sai']);
    expect([by(3).key.accepted, by(3).payload.unit]).toEqual([['24'], 'cm']);
    expect(by(4).payload.left.map((c: { text: string }) => c.text)).toEqual(['Bàn phím', 'Chuột', 'Màn hình']);
    expect(by(5).payload.items.length).toBe(4);
    expect(by(6).payload.zones.map((z: { label: string }) => z.label)).toEqual(['Nên làm', 'Không nên làm']);
    expect(by(7).payload.words.map((w: { text: string }) => w.text)).toEqual(['Em', 'đi học', 'đúng giờ', '.']);
    expect(by(8).payload.groups.length).toBe(2);
    expect(by(9).payload.passage).toContain('{{b1}}');
    expect(by(9).payload.bank.map((w: { text: string }) => w.text)).toEqual(['đâm', 'chao', 'rụng', 'khô']);
    expect(by(10).key.blanks).toEqual({ d1: 'o2', d2: 'o1' });
    expect(by(11).prompt.speak).toBe('con mèo');
    expect(by(14).payload.maxSeconds).toBe(30);
    expect([by(15).payload.operands, by(15).key.value, by(15).payload.choices]).toEqual([[26, 7], 33, [31, 33, 23]]);
    expect([by(16).payload.kind, by(16).key.value]).toEqual(['clock', 210]);
    // môn, lớp theo dòng "Môn:", "Lớp:"
    expect([res.drafts[2].item.subject, res.drafts[2].item.grade]).toEqual(['lich-su-dia-li', 4]);
    expect(res.drafts[4].item.subject).toBe('tin-hoc');
    expect(res.drafts[5].item.subject).toBe('cong-nghe');
    expect(res.drafts[6].item.subject).toBe('dao-duc');
    expect(res.drafts[17].item.subject).toBe('hdtn');
  });

  it('dán văn bản cũng hiểu "Dạng:"; đề kiểu cũ (không có Dạng:) vẫn đọc như trước', () => {
    const r = parseQuestionText('Câu 1: Xếp nhóm\nDạng: Phân loại từ\nNhóm Con vật: mèo, chó\nNhóm Đồ vật: bàn, ghế\n\nCâu 2: 2 + 3 = ?\nA. 4\nB. 5\nĐáp án: B', D);
    expect(r.drafts.map((d) => d.item.type)).toEqual(['WORD_CLASSIFY', 'MCQ']);
  });
});

describe('Môn học CT GDPT 2018', () => {
  it('đủ môn theo thứ tự Thông tư 32, có Tự nhiên và Xã hội', () => {
    expect(SUBJECT_LIST.map((s) => s.name)).toEqual(['Tiếng Việt', 'Toán', 'Tiếng Anh', 'Đạo đức', 'Tự nhiên và Xã hội', 'Lịch sử và Địa lí', 'Khoa học', 'Tin học', 'Công nghệ', 'Giáo dục thể chất', 'Âm nhạc', 'Mĩ thuật', 'Hoạt động trải nghiệm', 'Tiếng dân tộc thiểu số', 'Khác']);
    expect(subjectOptions().some((s) => s.id === 'tnxh')).toBe(true);
    expect(['Lịch sử và Địa lí', 'LS&ĐL', 'Tin học', 'Công nghệ', 'GDTC', 'Hoạt động trải nghiệm', 'Đạo đức', 'TNXH'].map(parseSubject)).toEqual(['lich-su-dia-li', 'lich-su-dia-li', 'tin-hoc', 'cong-nghe', 'gdtc', 'hdtn', 'dao-duc', 'tnxh']);
  });

  it('môn hiện theo lớp được chọn', () => {
    const ids = (g: number) => subjectOptionsFor(g).map((s) => s.id);
    expect(ids(1)).toEqual(['tieng-viet', 'toan', 'tieng-anh', 'dao-duc', 'tnxh', 'gdtc', 'am-nhac', 'mi-thuat', 'hdtn', 'tieng-dan-toc', 'khac']);
    expect(ids(2)).toEqual(ids(1));
    expect(ids(3)).toEqual(['tieng-viet', 'toan', 'tieng-anh', 'dao-duc', 'tnxh', 'tin-hoc', 'cong-nghe', 'gdtc', 'am-nhac', 'mi-thuat', 'hdtn', 'tieng-dan-toc', 'khac']);
    expect(ids(4)).toEqual(['tieng-viet', 'toan', 'tieng-anh', 'dao-duc', 'lich-su-dia-li', 'khoa-hoc', 'tin-hoc', 'cong-nghe', 'gdtc', 'am-nhac', 'mi-thuat', 'hdtn', 'tieng-dan-toc', 'khac']);
    expect(ids(5)).toEqual(ids(4));
    // chưa chọn lớp → mọi môn; môn đang chọn luôn được giữ lại
    expect(subjectOptionsFor(0).length).toBe(15);
    expect(subjectOptionsFor(4, ['tnxh']).some((s) => s.id === 'tnxh')).toBe(true);
    expect(subjectLabelFor('tnxh', 4)).toBe('Tự nhiên và Xã hội (không thuộc lớp 4)');
    expect(subjectLabelFor('tieng-anh', 1)).toBe('Tiếng Anh (tự chọn)');
    expect(subjectLabelFor('tieng-anh', 3)).toBe('Tiếng Anh');
  });

  it('đổi lớp → môn tự chuyển cho hợp; kiểm tra định kì theo lớp', () => {
    expect(fitSubjectToGrade('khoa-hoc', 2)).toBe('tieng-viet');
    expect(fitSubjectToGrade('tnxh', 3)).toBe('tnxh');
    expect(fitSubjectToGrade('tnxh', 4)).toBe('tieng-viet');
    expect(fitSubjectToGrade('dao-duc', 4, { periodic: true })).toBe('tieng-viet');
    expect(subjectsForGrade(1, { periodic: true })).toEqual(['tieng-viet', 'toan']);
    expect(subjectsForGrade(3, { periodic: true })).toEqual(['tieng-viet', 'toan', 'tieng-anh', 'tin-hoc', 'cong-nghe']);
    expect(subjectsForGrade(4, { periodic: true })).toEqual(['tieng-viet', 'toan', 'tieng-anh', 'lich-su-dia-li', 'khoa-hoc', 'tin-hoc', 'cong-nghe']);
    expect(isPeriodicAt('tieng-anh', 2)).toBe(false);
    expect(isPeriodicAt('tnxh', 2)).toBe(false);
    expect(subjectGradeNote('tnxh')).toBe('lớp 1–3');
    expect(subjectGradeNote('tieng-anh')).toBe('lớp 1–5 (lớp 1–2 tự chọn)');
  });

  it('bước soát nhắc khi môn không thuộc lớp', () => {
    expect(subjectGradeWarning({ subject: 'khoa-hoc', grade: 2 })).toMatch(/Khoa học không có ở lớp 2/);
    expect(subjectGradeWarning({ subject: 'tnxh', grade: 1 })).toBeNull();
    expect(subjectGradeWarning({ subject: 'khac', grade: 5 })).toBeNull();
  });
});
