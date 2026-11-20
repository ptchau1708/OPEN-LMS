import { describe, expect, it } from 'vitest';
import type { Item } from '@openedu/contracts';
import { draftStatus, parseQuestionText, resolveChoiceAnswer, type DraftItem } from '../import';

const D = { grade: 4 as const, subject: 'toan' as const };
const parse = (t: string): DraftItem[] => parseQuestionText(t, D).drafts;
const opts = (it: Item): string[] => (it.type === 'MCQ' || it.type === 'MCQ_MULTIPLE' ? it.payload.options.map((o) => o.text ?? '') : []);
/** Chữ của (các) đáp án đúng. */
function answer(it: Item): string[] {
  if (it.type === 'MCQ') return it.payload.options.filter((o) => o.id === it.key?.correct).map((o) => o.text ?? '');
  if (it.type === 'MCQ_MULTIPLE') return it.payload.options.filter((o) => it.key?.correct.includes(o.id)).map((o) => o.text ?? '');
  if (it.type === 'SHORT_ANSWER') return it.key?.accepted ?? [];
  return [];
}
const statuses = (ds: DraftItem[]): string[] => ds.map(draftStatus);

describe('parseQuestionText — trắc nghiệm', () => {
  it('1. "Câu 1:" + lựa chọn mỗi dòng + "Đáp án: B"', () => {
    const [d] = parse('Câu 1: Số liền sau của 99 là:\nA. 98\nB. 100\nC. 101\nD. 109\nĐáp án: B');
    expect(d.item.type).toBe('MCQ');
    expect(d.item.prompt.text).toBe('Số liền sau của 99 là:');
    expect(opts(d.item)).toEqual(['98', '100', '101', '109']);
    expect(answer(d.item)).toEqual(['100']);
    expect(draftStatus(d)).toBe('ready');
    expect(d.item.grade).toBe(4);
    expect(d.item.subject).toBe('toan');
  });

  it('2. "Câu 1." và lựa chọn trên một dòng', () => {
    const [d] = parse('Câu 1. Kết quả của phép tính 25 + 17 là\nA. 32   B. 42   C. 41   D. 52\nĐA: B');
    expect(opts(d.item)).toEqual(['32', '42', '41', '52']);
    expect(answer(d.item)).toEqual(['42']);
  });

  it('3. "1)" + "a)" chữ thường + "Chọn c"', () => {
    const ds = parse('1) Con vật nào sống dưới nước?\na) Con gà\nb) Con mèo\nc) Con cá\nChọn c\n2) Con vật nào biết bay?\na) Con chim\nb) Con chó\nChọn a');
    expect(ds).toHaveLength(2);
    expect(answer(ds[0].item)).toEqual(['Con cá']);
    expect(answer(ds[1].item)).toEqual(['Con chim']);
  });

  it('4. "a/" và hai lựa chọn mỗi dòng', () => {
    const [d] = parse('Bài 1: Từ nào viết đúng chính tả?\na/ xắp xếp     b/ sắp xếp\nc/ sắp sếp     d/ xắp sếp\nĐáp án: b');
    expect(opts(d.item)).toEqual(['xắp xếp', 'sắp xếp', 'sắp sếp', 'xắp sếp']);
    expect(answer(d.item)).toEqual(['sắp xếp']);
  });

  it('5. đề và lựa chọn dính trên một dòng (chép từ PDF)', () => {
    const [d] = parse('Câu 3: 7 × 8 = ? A. 54 B. 56 C. 58 D. 64\nĐáp án: B');
    expect(d.item.prompt.text).toBe('7 × 8 = ?');
    expect(opts(d.item)).toEqual(['54', '56', '58', '64']);
    expect(answer(d.item)).toEqual(['56']);
  });

  it('6. dấu * trước lựa chọn đúng', () => {
    const [d] = parse('Câu 1: Thủ đô của Việt Nam là\nA. Huế\n*B. Hà Nội\nC. Đà Nẵng');
    expect(opts(d.item)).toEqual(['Huế', 'Hà Nội', 'Đà Nẵng']);
    expect(answer(d.item)).toEqual(['Hà Nội']);
  });

  it('7. "(đúng)" sau lựa chọn, kể cả trên một dòng', () => {
    const [d] = parse('Câu 2: 1/2 của 10 là\nA. 2   B. 5 (đúng)   C. 20');
    expect(opts(d.item)).toEqual(['2', '5', '20']);
    expect(answer(d.item)).toEqual(['5']);
  });

  it('8. bảng đáp án cuối đề "1.B 2.C 3.A"', () => {
    const ds = parse(['Câu 1: 2 + 3 = ?', 'A. 4', 'B. 5', 'C. 6', 'Câu 2: 9 - 4 = ?', 'A. 3', 'B. 4', 'C. 5', 'Câu 3: 3 × 3 = ?', 'A. 9', 'B. 6', 'C. 12', '', 'ĐÁP ÁN', '1.B 2.C 3.A'].join('\n'));
    expect(ds).toHaveLength(3);
    expect(ds.map((d) => answer(d.item)[0])).toEqual(['5', '5', '9']);
    expect(statuses(ds)).toEqual(['ready', 'ready', 'ready']);
  });

  it('9. bảng đáp án "1-B, 2-C" không có tiêu đề', () => {
    const r = parseQuestionText('1. Số chẵn là\nA. 3\nB. 4\nC. 7\n2. Số lẻ là\nA. 2\nB. 6\nC. 9\n1-B, 2-C', D);
    expect(r.answerTableCount).toBe(2);
    expect(r.drafts.map((d) => answer(d.item)[0])).toEqual(['4', '9']);
  });

  it('10. bảng đáp án hai dòng "Câu 1 2 3" / "Đáp án B C A"', () => {
    const ds = parse('Câu 1: a?\nA. x\nB. y\nCâu 2: b?\nA. x\nB. y\nC. z\nCâu 3: c?\nA. x\nB. y\n\nCâu 1 2 3\nĐáp án B C A');
    expect(ds.map((d) => answer(d.item)[0])).toEqual(['y', 'z', 'x']);
  });

  it('11. đáp án ghi bằng số thứ tự hoặc bằng nội dung', () => {
    const ds = parse('Câu 1: Màu của lá cây?\nA. Đỏ\nB. Xanh\nC. Tím\nĐáp án: 2\nCâu 2: Mùa nào nóng nhất?\nA. Mùa xuân\nB. Mùa hè\nĐáp án: Mùa hè');
    expect(ds.map((d) => answer(d.item)[0])).toEqual(['Xanh', 'Mùa hè']);
  });

  it('12. nhiều đáp án "A, C" → Nhiều đáp án', () => {
    const [d] = parse('Câu 1: Những số nào chia hết cho 2?\nA. 12\nB. 15\nC. 20\nD. 31\nĐáp án: A, C');
    expect(d.item.type).toBe('MCQ_MULTIPLE');
    expect(answer(d.item)).toEqual(['12', '20']);
  });

  it('13. thiếu đáp án → "Thiếu đáp án", không được lưu', () => {
    const [d] = parse('Câu 1: 5 + 5 = ?\nA. 9\nB. 10\nC. 11');
    expect(d.item.type).toBe('MCQ');
    expect(draftStatus(d)).toBe('missing-answer');
  });

  it('14. phân số 3/4 và số thập phân dấu phẩy trong lựa chọn', () => {
    const ds = parse('Câu 1: Phân số nào lớn nhất?\nA. 1/2   B. 3/4   C. 2/3   D. 5/8\nĐáp án: B\nCâu 2: Số thập phân 2,05 đọc là:\nA. Hai phẩy năm\nB. Hai phẩy không năm\nC. Hai mươi phẩy năm\nĐáp án: B\nCâu 3: 3,5 + 1,25 = ?\nA. 4,75 B. 4,30 C. 3,75 D. 47,5\nĐáp án: A');
    expect(opts(ds[0].item)).toEqual(['1/2', '3/4', '2/3', '5/8']);
    expect(answer(ds[0].item)).toEqual(['3/4']);
    expect(ds[1].item.prompt.text).toBe('Số thập phân 2,05 đọc là:');
    expect(opts(ds[2].item)).toEqual(['4,75', '4,30', '3,75', '47,5']);
    expect(answer(ds[2].item)).toEqual(['4,75']);
  });

  it('15. đơn vị đo trong lựa chọn, có "(1 điểm)" và mức "(M2)"', () => {
    const [d] = parse('Câu 4 (1 điểm) (M2): 3 km 25 m = … m. Số thích hợp điền vào chỗ chấm là:\nA. 325 m\nB. 3025 m\nC. 3250 m\nD. 30025 m\nĐáp án: B');
    expect(d.item.prompt.text).toBe('3 km 25 m = … m. Số thích hợp điền vào chỗ chấm là:');
    expect(d.item.difficulty).toBe('ket-noi');
    expect(answer(d.item)).toEqual(['3025 m']);
  });

  it('16. lựa chọn dài xuống dòng được nối lại', () => {
    const [d] = parse('Câu 1: Vì sao chim sơn ca hót?\nA. Vì nó muốn gọi bạn\nvà tìm thức ăn\nB. Vì trời đẹp\nĐáp án: A');
    expect(opts(d.item)).toEqual(['Vì nó muốn gọi bạn và tìm thức ăn', 'Vì trời đẹp']);
  });

  it('17. gợi ý và giải thích', () => {
    const [d] = parse('Câu 1: 12 × 3 = ?\nA. 36\nB. 33\nĐáp án: A\nGợi ý: Nhân lần lượt từ hàng đơn vị.\nGiải thích: 12 × 3 = 36 vì 10 × 3 = 30 và 2 × 3 = 6.');
    expect(d.item.hint).toBe('Nhân lần lượt từ hàng đơn vị.');
    expect(d.item.explanation).toContain('12 × 3 = 36');
  });

  it('18. kí hiệu ✓ từ tệp Word (chữ đậm) là đáp án đúng', () => {
    const [d] = parse('Câu 1: Từ nào là danh từ?\nA. chạy\n✓B. bàn\nC. đẹp');
    expect(opts(d.item)).toEqual(['chạy', 'bàn', 'đẹp']);
    expect(answer(d.item)).toEqual(['bàn']);
  });
});

describe('parseQuestionText — điền đáp án, đúng sai, tự luận', () => {
  it('19. câu không có lựa chọn + "Đáp số: 24 cm" → Điền đáp án có đơn vị', () => {
    const [d] = parse('Câu 5: Một hình vuông có cạnh 6 cm. Tính chu vi hình vuông đó.\nĐáp số: 24 cm');
    expect(d.item.type).toBe('SHORT_ANSWER');
    expect(answer(d.item)).toEqual(['24']);
    expect(d.item.type === 'SHORT_ANSWER' && d.item.payload.unit).toBe('cm');
    expect(d.item.type === 'SHORT_ANSWER' && d.item.payload.inputMode).toBe('numeric');
    expect(draftStatus(d)).toBe('ready');
  });

  it('20. câu tự luận không ghi đáp án → thiếu đáp án; dòng chấm bị bỏ', () => {
    const [d] = parse('Bài 2. Một cửa hàng có 125 kg gạo, đã bán 3/5 số gạo đó. Hỏi cửa hàng còn lại bao nhiêu ki-lô-gam gạo?\nBài giải\n.............................................\n.............................................');
    expect(d.item.type).toBe('SHORT_ANSWER');
    expect(draftStatus(d)).toBe('missing-answer');
    expect(d.item.prompt.text).toContain('3/5 số gạo');
    expect(d.item.prompt.text).not.toContain('.....');
  });

  it('21. nhiều cách viết đáp án đúng "0,5 hoặc 1/2"', () => {
    const [d] = parse('Câu 1: Viết 50% dưới dạng số thập phân hoặc phân số.\nĐáp án: 0,5 hoặc 1/2');
    expect(answer(d.item)).toEqual(['0,5', '1/2']);
  });

  it('22. Đúng ghi Đ, sai ghi S → mỗi ý một câu Đúng/Sai', () => {
    const ds = parse('Câu 6: Đúng ghi Đ, sai ghi S:\na) 15 + 5 = 20 ..... Đ\nb) 30 - 12 = 28 ..... S\nc) Số 100 là số có ba chữ số (Đ)\nd) 9 × 9 = 80 [S]');
    expect(ds).toHaveLength(4);
    expect(ds.every((d) => d.item.type === 'MCQ')).toBe(true);
    expect(opts(ds[0].item)).toEqual(['Đúng', 'Sai']);
    expect(ds.map((d) => answer(d.item)[0])).toEqual(['Đúng', 'Sai', 'Đúng', 'Sai']);
    expect(ds[1].item.prompt.text).toContain('30 - 12 = 28');
    expect(ds[1].item.prompt.text).not.toMatch(/\.\.\.|S$/);
  });

  it('23. Đúng–Sai chưa ghi đáp án → thiếu đáp án; đáp án ghi ở dòng riêng', () => {
    const a = parse('Câu 1: Đúng ghi Đ, sai ghi S\na) Hình vuông có 4 góc vuông\nb) Hình tam giác có 4 cạnh');
    expect(statuses(a)).toEqual(['missing-answer', 'missing-answer']);
    const b = parse('Câu 1: Đúng ghi Đ, sai ghi S\na) Hình vuông có 4 góc vuông\nb) Hình tam giác có 4 cạnh\nĐáp án: a - Đ, b - S');
    expect(b.map((d) => answer(d.item)[0])).toEqual(['Đúng', 'Sai']);
  });

  it('24. một câu Đúng hay sai', () => {
    const [d] = parse('Câu 2: Đúng hay sai? Trái Đất quay quanh Mặt Trời.\nĐáp án: Đúng');
    expect(opts(d.item)).toEqual(['Đúng', 'Sai']);
    expect(answer(d.item)).toEqual(['Đúng']);
  });

  it('25. "Tính:" với các ý a) b) → mỗi ý một câu điền, có đáp án nếu ghi', () => {
    const ds = parse('Bài 1: Tính:\na) 25 + 17 = .....\nb) 40 - 12 = .....\nĐáp án: a) 42 b) 28');
    expect(ds).toHaveLength(2);
    expect(ds.map((d) => d.item.type)).toEqual(['SHORT_ANSWER', 'SHORT_ANSWER']);
    expect(ds[0].item.prompt.text).toBe('Tính: 25 + 17 = …');
    expect(ds.map((d) => answer(d.item)[0])).toEqual(['42', '28']);
  });

  it('26. "Số liền trước … là: a) b) c)" vẫn là trắc nghiệm, không tách ý', () => {
    const [d] = parse('Câu 1: Số liền trước của 100 là:\na) 99\nb) 101\nc) 90');
    expect(d.item.type).toBe('MCQ');
    expect(opts(d.item)).toEqual(['99', '101', '90']);
  });
});

describe('parseQuestionText — đề thật, lộn xộn', () => {
  const TIENG_VIET = [
    'TRƯỜNG TIỂU HỌC HOA SEN',
    'Họ và tên: ................................ Lớp: 3A',
    'BÀI KIỂM TRA CUỐI HỌC KÌ I - MÔN TIẾNG VIỆT',
    '',
    'A. ĐỌC HIỂU',
    'Đọc thầm bài văn sau:',
    'Mùa thu, bầu trời trong xanh và cao vời vợi. Những đám mây trắng bồng bềnh trôi. Trên cánh đồng, lúa đã chín vàng. Các bác nông dân vui vẻ ra đồng gặt lúa. Bạn Lan theo mẹ ra đồng, bạn giúp mẹ mang nước cho mọi người.',
    '',
    'Khoanh vào chữ cái trước câu trả lời đúng:',
    'Câu 1. Bài văn tả cảnh mùa nào?',
    'A. Mùa xuân',
    'B. Mùa hạ',
    'C. Mùa thu',
    'Câu 2. Bạn Lan đã giúp mẹ làm gì?',
    'A. Gặt lúa      B. Mang nước cho mọi người      C. Nấu cơm',
    'Câu 3. Tìm trong bài một từ chỉ màu sắc.',
    '......................................................',
    'Câu 4. Câu "Các bác nông dân vui vẻ ra đồng gặt lúa." thuộc kiểu câu nào?',
    'A. Ai là gì?',
    'B. Ai làm gì?',
    'C. Ai thế nào?',
    '',
    'ĐÁP ÁN',
    'Câu 1: C',
    'Câu 2: B',
    'Câu 3: xanh; trắng; vàng',
    'Câu 4: B',
  ].join('\n');

  it('27. đề Tiếng Việt đọc hiểu: bài đọc thành preamble, đáp án lấy từ phần ĐÁP ÁN', () => {
    const r = parseQuestionText(TIENG_VIET, { grade: 3, subject: 'tieng-viet' });
    expect(r.drafts).toHaveLength(4);
    expect(r.preamble).toContain('Mùa thu, bầu trời trong xanh');
    expect(r.preamble).not.toContain('Họ và tên');
    expect(answer(r.drafts[0].item)).toEqual(['Mùa thu']);
    expect(answer(r.drafts[1].item)).toEqual(['Mang nước cho mọi người']);
    expect(r.drafts[2].item.type).toBe('SHORT_ANSWER');
    expect(answer(r.drafts[2].item)).toEqual(['xanh', 'trắng', 'vàng']);
    expect(r.drafts[3].item.prompt.text).toContain('thuộc kiểu câu nào?');
    expect(opts(r.drafts[3].item)).toEqual(['Ai là gì?', 'Ai làm gì?', 'Ai thế nào?']);
    expect(statuses(r.drafts)).toEqual(['ready', 'ready', 'ready', 'ready']);
    expect(r.drafts.every((d) => d.item.subject === 'tieng-viet' && d.item.grade === 3)).toBe(true);
  });

  const TOAN = [
    'PHẦN I. TRẮC NGHIỆM (4 điểm)',
    'Câu 1 (0,5 điểm): Phân số "ba phần tư" viết là:',
    'A. 4/3\tB. 3/4\tC. 34\tD. 43',
    'Câu 2 (0,5 điểm): Số thập phân gồm 3 đơn vị, 5 phần mười viết là',
    'A. 3,5',
    'B. 35',
    'C. 0,35',
    'D. 3,05',
    'Câu 3: 2 giờ 30 phút = ... phút',
    'A. 230 phút  B. 150 phút  C. 130 phút  D. 90 phút',
    'PHẦN II. TỰ LUẬN (6 điểm)',
    'Câu 4: Đặt tính rồi tính:',
    'a) 345 + 278          b) 1000 - 456',
    'Câu 5: Một mảnh vườn hình chữ nhật có chiều dài 12,5 m, chiều rộng 8 m. Tính diện tích mảnh vườn.',
    'Bài giải:',
    '................................................',
    '',
    'Đáp án trắc nghiệm: 1B 2A 3B',
  ].join('\n');

  it('28. đề Toán: tab giữa lựa chọn, tiêu đề PHẦN, bảng "1B 2A 3B", tự luận', () => {
    const ds = parse(TOAN);
    expect(ds.map((d) => d.item.type)).toEqual(['MCQ', 'MCQ', 'MCQ', 'SHORT_ANSWER', 'SHORT_ANSWER', 'SHORT_ANSWER']);
    expect(opts(ds[0].item)).toEqual(['4/3', '3/4', '34', '43']);
    expect(ds.slice(0, 3).map((d) => answer(d.item)[0])).toEqual(['3/4', '3,5', '150 phút']);
    expect(ds[0].item.prompt.text).toBe('Phân số "ba phần tư" viết là:');
    expect(ds[3].item.prompt.text).toBe('Đặt tính rồi tính: 345 + 278');
    expect(ds[4].item.prompt.text).toBe('Đặt tính rồi tính: 1000 - 456');
    expect(ds[5].item.prompt.text).toContain('12,5 m');
    expect(ds[5].item.prompt.text).not.toContain('Bài giải');
    expect(statuses(ds)).toEqual(['ready', 'ready', 'ready', 'missing-answer', 'missing-answer', 'missing-answer']);
  });

  it('29. chép từ Zalo: không đánh số, cách nhau dòng trống', () => {
    const ds = parse('Con gì kêu meo meo?\nA. Con chó\nB. Con mèo\nĐáp án: B\n\nCon gì có vòi dài?\nA. Con voi\nB. Con hổ\nChọn A');
    expect(ds).toHaveLength(2);
    expect(ds.map((d) => answer(d.item)[0])).toEqual(['Con mèo', 'Con voi']);
  });

  it('30. chữ không phải câu hỏi → giữ lại, đánh dấu "cần xem lại"', () => {
    const ds = parse('Các con nhớ làm bài tập trang 15 nhé.\n\nThứ hai nộp cho cô.');
    expect(ds).toHaveLength(2);
    expect(statuses(ds)).toEqual(['review', 'review']);
    expect(ds[0].item.prompt.text).toContain('trang 15');
    expect(ds[0].raw).toContain('trang 15');
  });

  it('31. chỉ đọc được một lựa chọn / lựa chọn không theo thứ tự → cần xem lại hoặc thiếu đáp án, không vỡ', () => {
    const a = parse('Câu 1: Chọn ý đúng\nA. Chỉ có một ý');
    expect(statuses(a)).toEqual(['review']);
    const b = parse('Câu 1: Chọn ý đúng\nC. ý ba\nD. ý bốn');
    expect(b).toHaveLength(1);
    expect(draftStatus(b[0])).toBe('missing-answer');
  });

  it('32. đáp án ghi chữ cái nhưng không có lựa chọn → cần xem lại', () => {
    const [d] = parse('Câu 1: Quan sát hình và chọn đáp án đúng.\nĐáp án: C');
    expect(draftStatus(d)).toBe('review');
  });

  it('33. kí tự lạ: NBSP, CRLF, zero-width, tab — vẫn đọc đúng', () => {
    const [d] = parse('Câu\u00a01:\u00a05 + 3 = ?\r\nA.\u00a07\r\n\u200bB.\t8\r\nC. 9\r\nĐáp án:\u00a0B\r\n');
    expect(opts(d.item)).toEqual(['7', '8', '9']);
    expect(answer(d.item)).toEqual(['8']);
  });

  it('34. không bao giờ ném lỗi với đầu vào rác', () => {
    const junk = ['', '   \n\n  ', 'A.', 'Câu', 'Câu 1:', '1.', '***', 'A. B. C. D.', 'Đáp án:', 'ĐÁP ÁN\n1.B', 'Câu 1: \nA. \nB. \nĐáp án: Z', '(((((', 'Câu 1: x\n'.repeat(300), 'a) b) c) d)', '1.B 2.C', '\u0000\u0001\uffff', 'Câu 9999999: gì?'];
    for (const j of junk) {
      expect(() => parseQuestionText(j, D)).not.toThrow();
      expect(() => parseQuestionText(j, D).drafts.map(draftStatus)).not.toThrow();
    }
    expect(parseQuestionText('', D).drafts).toEqual([]);
    expect(parseQuestionText(undefined as unknown as string, D).drafts).toEqual([]);
    expect(parse('Câu 1: x\n'.repeat(300))).toHaveLength(300);
  });

  it('35. số thập phân / phép chia ở đầu dòng không bị coi là câu mới', () => {
    const ds = parse('1. Tính giá trị của biểu thức sau rồi chọn kết quả:\n3,5 + 2,5 × 2\nA. 8,5\nB. 12\nĐáp án: A\n2. Kết quả của\n12 : 4 là\nA. 3\nB. 4\nĐáp án: A');
    expect(ds).toHaveLength(2);
    expect(ds[0].item.prompt.text).toContain('3,5 + 2,5 × 2');
    expect(ds[1].item.prompt.text).toContain('12 : 4');
  });

  it('36. "(A)" trong ngoặc và đáp án "Đáp án đúng là C"', () => {
    const [d] = parse('Câu 1: Hình nào có 3 cạnh?\n(A) Hình vuông\n(B) Hình tròn\n(C) Hình tam giác\nĐáp án đúng là C');
    expect(opts(d.item)).toEqual(['Hình vuông', 'Hình tròn', 'Hình tam giác']);
    expect(answer(d.item)).toEqual(['Hình tam giác']);
  });
});

describe('resolveChoiceAnswer', () => {
  const o = ['5', '6', '7', '8'];
  it('chữ cái, số thứ tự, nội dung, nhiều đáp án', () => {
    expect(resolveChoiceAnswer('B', o)).toEqual([1]);
    expect(resolveChoiceAnswer('b', o)).toEqual([1]);
    expect(resolveChoiceAnswer(' (C). ', o)).toEqual([2]);
    expect(resolveChoiceAnswer('B. 6', o)).toEqual([1]);
    expect(resolveChoiceAnswer('2', ['x', 'y', 'z'])).toEqual([1]);
    expect(resolveChoiceAnswer('7', o)).toEqual([2]); // nội dung thắng số thứ tự
    expect(resolveChoiceAnswer('A,C', o)).toEqual([0, 2]);
    expect(resolveChoiceAnswer('a và d', o)).toEqual([0, 3]);
    expect(resolveChoiceAnswer('AC', o)).toEqual([0, 2]);
    expect(resolveChoiceAnswer('Hà Nội', ['Huế', 'hà nội.'])).toEqual([1]);
  });
  it('không hiểu → null', () => {
    expect(resolveChoiceAnswer('', o)).toBeNull();
    expect(resolveChoiceAnswer('E', o)).toBeNull();
    expect(resolveChoiceAnswer('9', o)).toBeNull();
    expect(resolveChoiceAnswer('không biết', o)).toBeNull();
  });
});
