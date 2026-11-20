import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, zlibSync } from 'fflate';
import type { Item } from '@openedu/contracts';
import {
  buildTemplateXlsx, checkItem, colIndex, colName, contentKey, demoExtract, demoGenerate, difficultyMix, docxToText, draftStatus, exportItemsXlsx,
  findDuplicate, buildDupIndex, importXlsx, isTrueFalse, itemToRow, makeMcq, makeShort, markDuplicates, parseDifficulty, parseGrade, parseKind,
  parseQuestionText, parseSkills, parseSubject, pdfLooksTextual, promptKey, readXlsx, rowsToDrafts, TEMPLATE_COLUMNS, writeXlsx, xmlEscape, xmlUnescape,
} from '../import';

const D = { grade: 3 as const, subject: 'toan' as const };

describe('xlsx đọc / ghi', () => {
  it('ghi rồi đọc lại: tiếng Việt, kí tự đặc biệt, số, ô trống, xuống dòng', () => {
    const rows = [
      ['Câu hỏi', 'A', 'Số'],
      ['5 < 7 & 7 > 5 "đúng" \'nhé\'', '=SUM(A1)', 12.5],
      ['', null, 0],
      ['Dòng 1\nDòng 2', '  có khoảng trắng  ', -3],
      [],
      ['Tiếng Việt: ặ ễ ữ ợ Đ 😀', undefined, 1e6],
    ];
    const bytes = writeXlsx([{ name: 'Trang 1', rows }, { name: 'Hai', rows: [['x']] }]);
    expect(bytes[0]).toBe(0x50);
    const r = readXlsx(bytes);
    expect(r.sheetNames).toEqual(['Trang 1', 'Hai']);
    expect(r.rows[0]).toEqual(['Câu hỏi', 'A', 'Số']);
    expect(r.rows[1]).toEqual(['5 < 7 & 7 > 5 "đúng" \'nhé\'', '=SUM(A1)', '12.5']);
    expect(r.rows[2]).toEqual(['', '', '0']);
    expect(r.rows[3]).toEqual(['Dòng 1\nDòng 2', '  có khoảng trắng  ', '-3']);
    expect(r.rows[4]).toEqual([]);
    expect(r.rows[5]).toEqual(['Tiếng Việt: ặ ễ ữ ợ Đ 😀', '', '1000000']);
    expect(readXlsx(bytes, { sheet: 'Hai' }).rows).toEqual([['x']]);
    expect(readXlsx(bytes, { sheet: 1 }).rows).toEqual([['x']]);
  });

  it('đọc tệp do Excel lưu: sharedStrings, rich text, ô thiếu r, boolean, công thức', () => {
    const H = '<?xml version="1.0" encoding="UTF-8"?>';
    const files = {
      'xl/workbook.xml': `${H}<workbook xmlns:r="x"><sheets><sheet name="Đề" sheetId="5" r:id="rId7"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `${H}<Relationships><Relationship Id="rId7" Target="worksheets/sheet5.xml"/></Relationships>`,
      'xl/sharedStrings.xml': `${H}<sst><si><t>Câu hỏi</t></si><si><r><rPr><b/></rPr><t>Đậm </t></r><r><t xml:space="preserve">&amp; thường</t></r><rPh><t>phiên âm</t></rPh></si><si><t/></si><si><t>dòng 1_x000D_\ndòng 2</t></si></sst>`,
      'xl/worksheets/sheet5.xml': `${H}<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
        <row r="3"><c t="s"><v>3</v></c><c t="b"><v>1</v></c><c><f>1+2</f><v>3</v></c><c t="str"><f>"a"&amp;"b"</f><v>ab</v></c><c t="s"><v>2</v></c><c r="H3"><v>0.30000000000000004</v></c></row>
      </sheetData></worksheet>`,
    };
    const bytes = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
    const r = readXlsx(bytes);
    expect(r.sheetNames).toEqual(['Đề']);
    expect(r.rows[0]).toEqual(['Câu hỏi', '', 'Đậm & thường']);
    expect(r.rows[1]).toEqual([]);
    expect(r.rows[2]).toEqual(['dòng 1\ndòng 2', 'TRUE', '3', 'ab', '', '', '', '0.3']);
  });

  it('tệp không phải xlsx → lỗi tiếng Việt dễ hiểu', () => {
    expect(() => readXlsx(strToU8('không phải zip'))).toThrow(/\.xlsx/);
    expect(() => readXlsx(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/bảng tính/);
    expect(() => readXlsx(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).toThrow();
  });

  it('tiện ích cột và XML', () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(['A1', 'Z9', 'AA10', 'AB2'].map(colIndex)).toEqual([0, 25, 26, 27]);
    expect(xmlUnescape(xmlEscape('a<b>&"c"\u0001'))).toBe('a<b>&"c"');
    expect(xmlUnescape('&#273;&#x1EA1;&apos;')).toBe("đạ'");
  });
});

describe('mẫu Excel ngân hàng câu hỏi', () => {
  it('tải mẫu → đọc lại: 6 câu ví dụ đủ 6 loại, đều sẵn sàng', () => {
    const res = importXlsx(buildTemplateXlsx(), D);
    expect(res.headerRow).toBe(1);
    expect(res.warnings).toEqual([]);
    expect(res.drafts).toHaveLength(6);
    expect(res.drafts.map((d) => d.item.type)).toEqual(['MCQ', 'MCQ_MULTIPLE', 'SHORT_ANSWER', 'MCQ', 'ORDERING', 'MATCHING']);
    expect(res.drafts.map(draftStatus)).toEqual(Array(6).fill('ready'));
    const [mcq, multi, short, tf, ord, match] = res.drafts.map((d) => d.item);
    expect(mcq.type === 'MCQ' && mcq.key?.correct).toBe('b');
    expect(mcq.grade).toBe(2);
    expect(mcq.difficulty).toBe('nhan-biet');
    expect(mcq.hint).toContain('liền sau');
    expect(multi.type === 'MCQ_MULTIPLE' && multi.key?.correct).toEqual(['a', 'c']);
    expect(short.type === 'SHORT_ANSWER' && [short.key?.accepted, short.payload.unit]).toEqual([['24'], 'cm']);
    expect(isTrueFalse(tf)).toBe(true);
    expect(tf.subject).toBe('tieng-viet');
    expect(ord.type === 'ORDERING' && ord.payload.items.map((c) => c.text)).toEqual(['0,25', '1/2', '0,75', '1']);
    expect(ord.type === 'ORDERING' && ord.key?.order).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(match.type === 'MATCHING' && match.payload.left.map((c) => c.text)).toEqual(['7 × 8', '9 × 6', '8 × 8']);
    expect(match.type === 'MATCHING' && match.payload.right.map((c) => c.text)).toEqual(['56', '54', '64']);
    expect(match.type === 'MATCHING' && match.key?.pairs).toEqual({ l1: 'r1', l2: 'r2', l3: 'r3' });
  });

  it('xuất → nhập lại giữ nguyên nội dung (round-trip), bỏ qua dạng không chứa được', () => {
    const src = importXlsx(buildTemplateXlsx(), D).drafts.map((d) => ({ ...d.item, skills: ['T3.PT.NHAN-CHIA-BANG'].filter(() => false) }) as Item);
    const extra: Item = { id: 'x1', type: 'DRAW', grade: 1, subject: 'mi-thuat', prompt: { text: 'Vẽ con mèo' }, payload: {}, key: null };
    const withImg = makeMcq('Chọn hình', ['a', 'b'], [0], D);
    if (withImg.type === 'MCQ') withImg.payload.options[0].image = 'emoji:🐱';
    const out = exportItemsXlsx([...src, extra, withImg]);
    expect(out.exported).toBe(6);
    expect(out.skipped).toBe(2);
    const back = importXlsx(out.bytes, { grade: 1, subject: 'khac' }, src);
    expect(back.drafts).toHaveLength(6);
    expect(back.drafts.every((d) => d.updatesExisting)).toBe(true);
    back.drafts.forEach((d, i) => {
      const a = src[i];
      const b = d.item;
      expect(b.id).toBe(a.id);
      expect(b.type).toBe(a.type);
      expect(b.prompt.text).toBe(a.prompt.text);
      expect(b.grade).toBe(a.grade);
      expect(b.subject).toBe(a.subject);
      expect(b.difficulty).toBe(a.difficulty);
      expect(b.hint).toBe(a.hint);
      expect(b.explanation).toBe(a.explanation);
      expect(contentKey(b)).toBe(contentKey(a));
      expect(JSON.stringify(b.key)).toBe(JSON.stringify(a.key));
      expect(draftStatus(d)).toBe('ready');
    });
    // không có ngân hàng để đối chiếu → câu mới + ghi chú
    const fresh = importXlsx(out.bytes, D);
    expect(fresh.drafts.every((d) => !d.updatesExisting && d.item.id !== src[0].id)).toBe(true);
  });

  it('sắp xếp có thứ tự riêng và nối cặp có dấu "=" trong vế', () => {
    const ord: Item = { id: 'o1', type: 'ORDERING', grade: 2, subject: 'toan', prompt: { text: 'Xếp từ bé đến lớn' }, payload: { items: [{ id: 'p', text: '9' }, { id: 'q', text: '2' }, { id: 'r', text: '5' }] }, key: { order: ['q', 'r', 'p'] } };
    const row = itemToRow(ord) ?? [];
    expect(row.slice(2, 5)).toEqual(['2', '5', '9']);
    const m: Item = { id: 'm1', type: 'MATCHING', grade: 2, subject: 'toan', prompt: { text: 'Nối' }, payload: { left: [{ id: 'l1', text: 'x = 2' }, { id: 'l2', text: 'mèo' }], right: [{ id: 'r1', text: 'cat' }, { id: 'r2', text: 'hai' }] }, key: { pairs: { l1: 'r2', l2: 'r1' } } };
    const back = importXlsx(exportItemsXlsx([ord, m]).bytes, D).drafts.map((d) => d.item);
    expect(back[0].type === 'ORDERING' && back[0].payload.items.map((c) => c.text)).toEqual(['2', '5', '9']);
    expect(back[1].type === 'MATCHING' && back[1].payload.left.map((c) => c.text)).toEqual(['x = 2', 'mèo']);
    expect(back[1].type === 'MATCHING' && back[1].payload.right.map((c) => c.text)).toEqual(['hai', 'cat']);
    const ord2 = rowsToDrafts([['Loại', 'Câu hỏi', 'A', 'B', 'C', 'Đáp án đúng'], ['Sắp xếp', 'Xếp', 'ba', 'một', 'hai', 'B, C, A']], D).drafts[0].item;
    expect(ord2.type === 'ORDERING' && ord2.key?.order).toEqual(['i2', 'i3', 'i1']);
  });

  it('tiêu đề viết khác, cột đảo thứ tự, dòng trống, dòng chú thích phía trên', () => {
    const rows = [
      ['NGÂN HÀNG CÂU HỎI LỚP 4'],
      [],
      ['STT', 'Nội dung câu hỏi', 'Phương án A', 'Phương án B', 'Phương án C', 'ĐÁP ÁN', 'Khối', 'Môn học', 'Độ khó'],
      [1, 'Số nào lớn nhất?', '12', '21', '20', 'b', 'Lớp 4', 'TOÁN', 'Dễ'],
      [],
      [2, '  9 × 9 = ?  ', '', '', '', 81, 4, 'toan', 3],
      [3, 'Chọn các số lẻ', 1, 2, 3, 'A,C', '', 'Tiếng việt', ''],
      [4, 'Thủ đô nước ta?', 'Huế', 'Hà Nội', '', 'Hà Nội', '', '', ''],
      [5, 'Thiếu đáp án?', 'x', 'y', '', '', '', '', ''],
      [6, 'Đáp án lạ', 'x', 'y', '', 'Q', 'lớp 9', 'Võ', 'siêu khó'],
      [7, 'Mặt trời mọc ở hướng Đông', '', '', '', 'Đ', '', '', ''],
      [8, 'Lỗ hổng', 'x', '', 'z', 'A', '', '', ''],
    ];
    const res = rowsToDrafts(rows, D);
    expect(res.headerRow).toBe(3);
    expect(res.skippedBlank).toBe(1);
    const it = res.drafts.map((d) => d.item);
    expect(it.map((i) => i.type)).toEqual(['MCQ', 'SHORT_ANSWER', 'MCQ_MULTIPLE', 'MCQ', 'MCQ', 'MCQ', 'MCQ', 'MCQ']);
    expect(it[0].type === 'MCQ' && it[0].key?.correct).toBe('b');
    expect([it[0].grade, it[0].subject, it[0].difficulty]).toEqual([4, 'toan', 'nhan-biet']);
    expect(it[1].prompt.text).toBe('9 × 9 = ?');
    expect(it[1].type === 'SHORT_ANSWER' && it[1].key?.accepted).toEqual(['81']);
    expect(it[1].difficulty).toBe('van-dung');
    expect(it[2].type === 'MCQ_MULTIPLE' && it[2].key?.correct).toEqual(['a', 'c']);
    expect(it[2].subject).toBe('tieng-viet');
    expect(it[3].type === 'MCQ' && it[3].key?.correct).toBe('b');
    expect([it[3].grade, it[3].subject]).toEqual([3, 'toan']); // mặc định
    expect(res.drafts.map(draftStatus)).toEqual(['ready', 'ready', 'ready', 'ready', 'missing-answer', 'missing-answer', 'ready', 'review']);
    expect(res.drafts[5].notes.join(' ')).toMatch(/đáp án «Q».*lớp «lớp 9»|lớp «lớp 9»/);
    expect(res.drafts[5].notes).toHaveLength(4);
    expect(isTrueFalse(it[6])).toBe(true);
    expect(res.drafts[0].given).toEqual({ subject: true, grade: true, difficulty: true });
  });

  it('không có dòng tiêu đề → đọc theo thứ tự cột của mẫu và cảnh báo', () => {
    const res = rowsToDrafts([['Trắc nghiệm', '1 + 1 = ?', '1', '2', '', '', '', '', 'B']], D);
    expect(res.headerRow).toBe(0);
    expect(res.warnings).toHaveLength(1);
    expect(draftStatus(res.drafts[0])).toBe('ready');
    expect(rowsToDrafts([], D).drafts).toEqual([]);
  });

  it('đọc giá trị ô: loại, mức độ, môn, lớp, mã kĩ năng', () => {
    expect(['Trắc nghiệm', 'TRAC NGHIEM', 'Nhiều đáp án', 'điền đáp án', 'Sắp xếp', 'nối cặp', 'Đúng – Sai', 'Đúng/Sai', 'Đúng-Sai', 'gì đó'].map(parseKind))
      .toEqual(['MCQ', 'MCQ', 'MCQ_MULTIPLE', 'SHORT_ANSWER', 'ORDERING', 'MATCHING', 'TRUE_FALSE', 'TRUE_FALSE', 'TRUE_FALSE', null]);
    expect(['Nhận biết', 'thông hiểu', 'VẬN DỤNG', '2', 'M1', ''].map(parseDifficulty)).toEqual(['nhan-biet', 'ket-noi', 'van-dung', 'ket-noi', 'nhan-biet', undefined]);
    expect(['Toán', 'tieng-viet', 'Tiếng Anh', 'TNXH', 'Tự nhiên và Xã hội', 'x'].map(parseSubject)).toEqual(['toan', 'tieng-viet', 'tieng-anh', 'tnxh', 'tnxh', undefined]);
    expect(['3', 'Lớp 5', 'khối 1', '6', '', '2.0'].map(parseGrade)).toEqual([3, 5, 1, undefined, undefined, 2]);
    expect(parseSkills('T4.PS.RUT-GON; t1.stn.so-sanh, KHONG.CO')).toEqual({ codes: ['T4.PS.RUT-GON', 'T1.STN.SO-SANH'], unknown: ['KHONG.CO'] });
    expect(TEMPLATE_COLUMNS.map((c) => c.header).slice(0, 9)).toEqual(['Loại', 'Câu hỏi', 'A', 'B', 'C', 'D', 'E', 'F', 'Đáp án đúng']);
  });
});

/* ---------- docx ---------- */
function docx(bodyXml: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document xmlns:w="w" xmlns:m="m"><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`),
  });
}
const p = (...runs: string[]): string => `<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr>${runs.join('')}</w:p>`;
const r = (text: string, rPr = ''): string => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;

describe('docx → văn bản', () => {
  it('đoạn, xuống dòng, tab, kí tự XML, bỏ chữ đã xoá', () => {
    const t = docxToText(docx(
      p(r('Câu 1: 5 &lt; 7 &amp; 7 &gt; 5 đúng hay sai?')) +
      p('<w:r><w:t>Dòng trên</w:t><w:br/><w:t>dòng dưới</w:t><w:tab/><w:t>sau tab</w:t></w:r>') +
      '<w:p/>' +
      p(r('Giữ'), '<w:del><w:r><w:delText>xoá</w:delText></w:r></w:del>', r(' lại')),
    ));
    expect(t.text).toBe('Câu 1: 5 < 7 & 7 > 5 đúng hay sai?\nDòng trên\ndòng dưới    sau tab\n\nGiữ lại');
    expect(t.marked).toBe(0);
    expect(t.autoNumbered).toBe(0);
    expect(t.hasImages).toBe(false);
  });

  it('lựa chọn tô đậm / gạch chân / tô nền / chữ đỏ → đáp án đúng; tiêu đề đậm không bị tính', () => {
    const body =
      p(r('Câu 1:', '<w:b/>'), r(' Thủ đô của Việt Nam là')) +
      p(r('A. Huế')) + p(r('B. Hà Nội', '<w:b/><w:bCs/>')) + p(r('C. Đà Nẵng', '<w:b w:val="0"/>')) +
      p(r('Câu 2:', '<w:b/>'), r(' 2 + 3 = ?')) +
      p(r('A. 4    '), r('B. 5', '<w:u w:val="single"/>'), r('    C. 6', '<w:u w:val="none"/>')) +
      p(r('Câu 3:', '<w:b/>'), r(' Màu lá cây?')) +
      p(r('A. '), r('Xanh', '<w:highlight w:val="yellow"/>')) + p(r('B. Đỏ')) +
      p(r('Câu 4:', '<w:b/>'), r(' Con nào biết bay?')) +
      p(r('A. Chó', '<w:color w:val="000000"/>')) + p(r('B. Chim', '<w:color w:val="FF0000"/>'));
    const t = docxToText(docx(body));
    expect(t.marked).toBe(4);
    expect(t.text.startsWith('Câu 1: Thủ đô')).toBe(true);
    const ds = parseQuestionText(t.text, D, 'docx').drafts;
    expect(ds).toHaveLength(4);
    expect(ds.map(draftStatus)).toEqual(['ready', 'ready', 'ready', 'ready']);
    const ans = ds.map((d) => (d.item.type === 'MCQ' ? d.item.payload.options.find((o) => o.id === (d.item.type === 'MCQ' ? d.item.key?.correct : ''))?.text : ''));
    expect(ans).toEqual(['Hà Nội', '5', 'Xanh', 'Chim']);
    expect(ds[0].source).toBe('docx');
  });

  it('mọi lựa chọn đều đậm → không coi là đáp án', () => {
    const body = p(r('Câu 1: Chọn?')) + p(r('A. x', '<w:b/>')) + p(r('B. y', '<w:b/>'));
    const ds = parseQuestionText(docxToText(docx(body)).text, D).drafts;
    expect(draftStatus(ds[0])).toBe('missing-answer');
  });

  it('bảng: lựa chọn xếp 2×2 và bảng đáp án; phân số trong công thức; đếm đánh số tự động', () => {
    const tc = (t: string): string => `<w:tc>${p(r(t))}</w:tc>`;
    const body =
      p(r('Câu 1: Phân số nào bằng '), '<m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath>', r('?')) +
      `<w:tbl><w:tr>${tc('A. 2/4')}${tc('B. 1/3')}</w:tr><w:tr>${tc('C. 3/5')}${tc('D. 2/3')}</w:tr></w:tbl>` +
      p(r('Câu 2: 1 + 1 = ?')) + p(r('A. 2')) + p(r('B. 3')) +
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Mục đánh số tự động</w:t></w:r></w:p>' +
      `<w:tbl><w:tr>${tc('Câu')}${tc('1')}${tc('2')}</w:tr><w:tr>${tc('Đáp án')}${tc('A')}${tc('A')}</w:tr></w:tbl>` +
      '<w:p><w:r><w:drawing/></w:r></w:p>';
    const t = docxToText(docx(body));
    expect(t.text).toContain('Phân số nào bằng 1/2?');
    expect(t.text).toContain('A. 2/4    B. 1/3');
    expect(t.autoNumbered).toBe(1);
    expect(t.hasImages).toBe(true);
    const res = parseQuestionText(t.text, D);
    expect(res.answerTableCount).toBe(2);
    expect(res.drafts).toHaveLength(2);
    expect(res.drafts[0].item.type === 'MCQ' && res.drafts[0].item.payload.options.map((o) => o.text)).toEqual(['2/4', '1/3', '3/5', '2/3']);
    expect(res.drafts.map(draftStatus)).toEqual(['ready', 'ready']);
  });

  it('tệp không phải docx → lỗi dễ hiểu', () => {
    expect(() => docxToText(strToU8('{\\rtf1 abc}'))).toThrow(/\.docx/);
    expect(() => docxToText(zipSync({ 'x.txt': strToU8('a') }))).toThrow(/Không mở được/);
  });
});

/* ---------- trùng lặp ---------- */
describe('phát hiện câu trùng', () => {
  const bank: Item[] = [
    { ...makeMcq('Số liền sau của 99 là:', ['98', '100', '101'], [1], D), id: 'b1' },
    { ...makeShort('Tính:', ['12'], D), id: 'b2' },
    { ...makeMcq('Chọn đáp án đúng', ['mèo', 'chó'], [0], D), id: 'b3' },
  ];
  it('chuẩn hoá đề: số câu, hoa thường, khoảng trắng, dấu câu cuối — nhưng giữ dấu tiếng Việt', () => {
    expect(promptKey('Câu 12:  Số liền sau   của 99 LÀ :')).toBe(promptKey('số liền sau của 99 là'));
    expect(promptKey('Bài 3. Tính nhẩm …')).toBe('tính nhẩm');
    expect(promptKey('Con ma')).not.toBe(promptKey('Con má'));
    expect(promptKey('')).toBe('');
  });
  it('đề dài trùng → trùng dù lựa chọn khác; đề ngắn phải trùng cả nội dung', () => {
    const idx = buildDupIndex(bank);
    expect(findDuplicate(makeMcq('câu 1. SỐ LIỀN SAU CỦA 99 LÀ', ['1', '2'], [0], D), idx)?.id).toBe('b1');
    expect(findDuplicate(makeShort('Tính:', ['12'], D), idx)?.id).toBe('b2');
    expect(findDuplicate(makeShort('Tính:', ['15'], D), idx)).toBeNull();
    expect(findDuplicate(makeMcq('Chọn đáp án đúng', ['chó', 'mèo'], [1], D), idx)?.id).toBe('b3');
    expect(findDuplicate(makeMcq('Chọn đáp án đúng', ['gà', 'vịt'], [1], D), idx)).toBeNull();
    expect(findDuplicate(makeMcq('Số liền trước của 99 là:', ['98', '100'], [0], D), idx)).toBeNull();
    // chính nó (cùng id) không phải trùng — trường hợp cập nhật câu đã có
    expect(findDuplicate(bank[0], idx)).toBeNull();
  });
  it('markDuplicates: trùng ngân hàng và trùng trong cùng lô', () => {
    const a = makeMcq('Thủ đô của nước Việt Nam là gì?', ['Huế', 'Hà Nội'], [1], D);
    const b = makeMcq('thủ đô của nước việt nam là gì', ['Hà Nội', 'Huế'], [0], D);
    const c = makeMcq('Số liền sau của 99 là', ['100', '98'], [0], D);
    expect(markDuplicates([a, b, c], bank)).toEqual([null, 'batch:0', 'bank:b1']);
    expect(markDuplicates([], bank)).toEqual([]);
  });
});

describe('kiểm tra câu & bản mẫu demo', () => {
  it('checkItem: thiếu đề, thiếu lựa chọn, đáp án không khớp', () => {
    expect(checkItem(makeMcq('', ['a', 'b'], [0], D)).problems).toContain('Chưa có câu hỏi');
    expect(checkItem(makeMcq('x', ['a'], [0], D)).problems).toHaveLength(1);
    expect(checkItem(makeMcq('x', ['a', ''], [0], D)).problems).toHaveLength(1);
    const bad = makeMcq('x', ['a', 'b'], [0], D);
    if (bad.type === 'MCQ') bad.key = { correct: 'z' };
    expect(checkItem(bad).missingAnswer).toBe(true);
    expect(checkItem(makeMcq('x', ['a', 'b'], [0, 1], D))).toEqual({ problems: [], missingAnswer: false });
    expect(checkItem(makeShort('x', ['  '], D)).missingAnswer).toBe(true);
  });
  it('demoGenerate (Toán): đủ số câu, đáp án tính đúng, phối mức độ', () => {
    const items = demoGenerate({ grade: 3, subject: 'toan', count: 9, topic: 'Cộng trừ', types: ['MCQ', 'SHORT_ANSWER'], difficultyMix: difficultyMix(9, 'even') });
    expect(items).toHaveLength(9);
    expect(items.every((it) => !checkItem(it).missingAnswer && checkItem(it).problems.length === 0)).toBe(true);
    for (const it of items) {
      const m = (it.explanation ?? '').match(/^(\d+) ([+−×]) (\d+) = (\d+)$/);
      expect(m).not.toBeNull();
      if (!m) continue;
      const v = m[2] === '+' ? Number(m[1]) + Number(m[3]) : m[2] === '−' ? Number(m[1]) - Number(m[3]) : Number(m[1]) * Number(m[3]);
      expect(v).toBe(Number(m[4]));
      const right = it.type === 'MCQ' ? it.payload.options.find((o) => o.id === it.key?.correct)?.text : it.type === 'SHORT_ANSWER' ? it.key?.accepted[0] : '';
      expect(right).toBe(m[4]);
      if (it.type === 'MCQ') expect(new Set(it.payload.options.map((o) => o.text)).size).toBe(it.payload.options.length);
    }
    expect(items.filter((i) => i.difficulty === 'nhan-biet')).toHaveLength(3);
    expect(difficultyMix(10, 'easy')).toEqual({ 'nhan-biet': 5, 'ket-noi': 3, 'van-dung': 2 });
    expect(difficultyMix(4, 'van-dung')).toEqual({ 'van-dung': 4 });
    expect(demoExtract(D)).toHaveLength(3);
  });
  it('pdfLooksTextual: PDF có lệnh vẽ chữ → true; ảnh quét / không phải PDF → false', () => {
    const content = Array.from({ length: 20 }, (_x, i) => `BT /F1 12 Tf 72 ${700 - i * 14} Td (Cau ${i}) Tj ET`).join('\n');
    const z = zlibSync(strToU8(content));
    const head = strToU8(`%PDF-1.4\n1 0 obj << /Type /Font /Subtype /Type1 >> endobj\n2 0 obj << /Length ${z.length} /Filter /FlateDecode >>\nstream\n`);
    const tail = strToU8('\nendstream endobj\n%%EOF');
    const pdf = new Uint8Array(head.length + z.length + tail.length);
    pdf.set(head);
    pdf.set(z, head.length);
    pdf.set(tail, head.length + z.length);
    expect(pdfLooksTextual(pdf)).toBe(true);
    expect(pdfLooksTextual(strToU8('%PDF-1.4\n1 0 obj << /Subtype /Image /Filter /DCTDecode >>\nstream\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nendstream'))).toBe(false);
    expect(pdfLooksTextual(strToU8('hello'))).toBe(false);
  });
});
