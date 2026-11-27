/**
 * Tệp mẫu Word (.docx) để soạn câu hỏi ĐỦ CÁC DẠNG rồi tải lên Ngân hàng câu hỏi (Thêm nhanh → Từ tệp Excel / Word).
 * Mỗi câu: "Câu N: <đề>" + "Dạng: <tên dạng>" + các dòng theo dạng — bộ đọc: typedBlock.ts. Thuần (fflate, không DOM).
 */
import { strToU8, zipSync } from 'fflate';
import { SUBJECT_LIST, subjectGradeNote } from '@openedu/contracts';
import { xmlEscape } from './xlsx';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Para = { text: string; kind?: 'title' | 'h' | 'q' | 'note' | 'body' };

/** Ví dụ mỗi dạng một câu (đề tiểu học, CT GDPT 2018). Dùng cả cho kiểm thử: đọc lại phải ra đúng dạng. */
export const WORD_TEMPLATE_EXAMPLES: { label: string; lines: string[] }[] = [
  { label: 'Chọn 1 đáp án', lines: ['Câu 1: Số liền sau của 99 là:', 'Dạng: Chọn 1 đáp án', 'A. 98', 'B. 100', 'C. 101', 'D. 109', 'Đáp án: B', 'Giải thích: 99 + 1 = 100', 'Mức độ: Nhận biết', 'Môn: Toán', 'Lớp: 2', 'Mã kĩ năng: T2.STN.LIEN-TRUOC-SAU'] },
  { label: 'Chọn nhiều đáp án', lines: ['Câu 2: Những việc nào giúp tiết kiệm nước?', 'Dạng: Chọn nhiều đáp án', 'A. Khóa vòi khi đánh răng', 'B. Để vòi chảy khi rửa tay', 'C. Dùng nước vo gạo tưới cây', 'D. Xả nước liên tục khi rửa rau', 'Đáp án: A, C', 'Môn: Khoa học', 'Lớp: 4'] },
  { label: 'Đúng – Sai', lines: ['Câu 3: Thủ đô của nước Việt Nam là Hà Nội.', 'Dạng: Đúng – Sai', 'Đáp án: Đúng', 'Môn: Lịch sử và Địa lí', 'Lớp: 4'] },
  { label: 'Điền ngắn', lines: ['Câu 4: Một hình vuông có cạnh 6 cm. Chu vi hình vuông đó là bao nhiêu?', 'Dạng: Điền ngắn', 'Đáp án: 24', 'Đơn vị: cm', 'Gợi ý: Chu vi hình vuông = cạnh × 4', 'Môn: Toán', 'Lớp: 3', 'Mã kĩ năng: T3.DL.CHU-VI'] },
  { label: 'Nối cặp', lines: ['Câu 5: Nối thiết bị với bộ phận máy tính tương ứng.', 'Dạng: Nối cặp', 'A. Bàn phím = Gõ chữ', 'B. Chuột = Di chuyển con trỏ', 'C. Màn hình = Hiện hình ảnh', 'Môn: Tin học', 'Lớp: 3'] },
  { label: 'Sắp xếp thứ tự', lines: ['Câu 6: Sắp xếp các bước trồng cây theo đúng thứ tự.', 'Dạng: Sắp xếp thứ tự', 'A. Đào hố', 'B. Đặt cây con vào hố', 'C. Lấp đất', 'D. Tưới nước', 'Ghi chú: ghi các thẻ theo ĐÚNG thứ tự, máy tự xáo trộn khi học sinh làm.', 'Môn: Công nghệ', 'Lớp: 3'] },
  { label: 'Kéo thả vào ô', lines: ['Câu 7: Kéo mỗi việc làm vào đúng ô.', 'Dạng: Kéo thả vào ô', 'Ô Nên làm: chào hỏi lễ phép, giúp đỡ bạn', 'Ô Không nên làm: nói tục, chen lấn xô đẩy', 'Môn: Đạo đức', 'Lớp: 2'] },
  { label: 'Sắp xếp câu', lines: ['Câu 8: Sắp xếp các từ thành câu đúng.', 'Dạng: Sắp xếp câu', 'Câu đúng: Em / đi học / đúng giờ / .', 'Môn: Tiếng Việt', 'Lớp: 1'] },
  { label: 'Phân loại từ', lines: ['Câu 9: Xếp các từ vào đúng nhóm.', 'Dạng: Phân loại từ', 'Nhóm Từ chỉ sự vật: quyển vở, cái bàn, con mèo', 'Nhóm Từ chỉ hoạt động: chạy, đọc, viết', 'Môn: Tiếng Việt', 'Lớp: 2'] },
  { label: 'Điền vào đoạn văn', lines: ['Câu 10: Chọn từ thích hợp điền vào chỗ trống.', 'Dạng: Điền vào đoạn văn', 'Đoạn văn: Mùa xuân đến, cây cối [đâm] chồi nảy lộc. Những chú chim én [chao] lượn trên bầu trời.', 'Kho từ: rụng, khô', 'Môn: Tiếng Việt', 'Lớp: 3'] },
  { label: 'Chọn trong câu', lines: ['Câu 11: Read and choose the correct word.', 'Dạng: Chọn trong câu', 'Đoạn văn: My name [am|*is|are] Mai. I [*am|is|are] eight years old.', 'Môn: Tiếng Anh', 'Lớp: 3'] },
  { label: 'Nghe và chọn', lines: ['Câu 12: Em nghe rồi chọn hình đúng.', 'Dạng: Nghe và chọn', 'Đọc cho HS nghe: con mèo', 'A. Con mèo', 'B. Con chó', 'C. Con gà', 'Đáp án: A', 'Môn: Tiếng Việt', 'Lớp: 1'] },
  { label: 'Chạm vào hình', lines: ['Câu 13: Chạm vào dãy núi Hoàng Liên Sơn trên lược đồ.', 'Dạng: Chạm vào hình', 'Vùng đúng: dãy Hoàng Liên Sơn', 'Ghi chú: ảnh lược đồ và vùng chạm thêm ở bước soát (nút "Sửa chi tiết").', 'Môn: Lịch sử và Địa lí', 'Lớp: 4'] },
  { label: 'Vẽ và tô', lines: ['Câu 14: Em hãy vẽ và tô màu ngôi nhà của em.', 'Dạng: Vẽ và tô', 'Môn: Mĩ thuật', 'Lớp: 1'] },
  { label: 'Ghi âm đọc to', lines: ['Câu 15: Em hãy đọc to đoạn văn rồi ghi âm gửi thầy/cô.', 'Dạng: Ghi âm đọc to', 'Đoạn đọc: Nhà bà có cây bưởi. Hè về, quả bưởi chín vàng. Bé hái quả to nhất biếu bà.', 'Thời gian: 30', 'Môn: Tiếng Việt', 'Lớp: 1'] },
  { label: 'Đồ dùng toán (que tính)', lines: ['Câu 16: Em dùng que tính để tính: 26 + 7 = ?', 'Dạng: Đồ dùng toán', 'Que tính: 26 + 7', 'Lựa chọn: 31, 33, 23', 'Môn: Toán', 'Lớp: 2'] },
  { label: 'Đồ dùng toán (đồng hồ)', lines: ['Câu 17: Quay kim đồng hồ chỉ 3 giờ 30 phút.', 'Dạng: Đồ dùng toán', 'Đồng hồ: 3 giờ 30 phút', 'Môn: Toán', 'Lớp: 2'] },
  { label: 'Thăm dò ý kiến', lines: ['Câu 18: Em thích hoạt động trải nghiệm nào nhất?', 'Dạng: Thăm dò ý kiến', 'A. Trồng cây', 'B. Tham quan bảo tàng', 'C. Làm đồ thủ công', 'Môn: Hoạt động trải nghiệm', 'Lớp: 3'] },
];

const GUIDE: Para[] = [
  { kind: 'title', text: 'MẪU NHẬP CÂU HỎI TỪ WORD — OPEN-EDU' },
  { kind: 'note', text: 'Cách dùng: giữ cách viết như ví dụ, xoá các câu ví dụ, soạn câu của thầy/cô rồi lưu .docx. Vào Ngân hàng câu hỏi → Thêm nhanh nhiều câu → Từ tệp Excel / Word → chọn tệp. Máy đọc xong sẽ cho soát từng câu trước khi lưu.' },
  { kind: 'note', text: 'Mỗi câu bắt đầu bằng "Câu 1:", "Câu 2:"… (gõ số bằng tay, KHÔNG dùng đánh số tự động của Word). Dòng ngay sau là "Dạng: <tên dạng>". Viết mỗi ý trên một dòng.' },
  { kind: 'note', text: 'Các dạng: Chọn 1 đáp án · Chọn nhiều đáp án · Đúng – Sai · Điền ngắn · Nối cặp · Sắp xếp thứ tự · Kéo thả vào ô · Sắp xếp câu · Phân loại từ · Điền vào đoạn văn · Chọn trong câu · Nghe và chọn · Chạm vào hình · Vẽ và tô · Ghi âm đọc to · Đồ dùng toán · Thăm dò ý kiến.' },
  { kind: 'note', text: 'Dòng dùng chung (không bắt buộc): Gợi ý: … · Giải thích: … · Mức độ: Nhận biết | Kết nối | Vận dụng · Môn: … · Lớp: 1–5 · Mã kĩ năng: … Bỏ trống Môn, Lớp thì dùng môn, lớp chọn lúc tải lên.' },
  { kind: 'note', text: 'Cả đề cùng môn, lớp, kĩ năng: ghi một lần ở ĐẦU tệp (trước Câu 1), ví dụ "Môn: Lịch sử và Địa lí", "Lớp: 5", "Mã kĩ năng: LSDL5.XDBV.LY-TRAN" — hoặc tiêu đề kiểu "ĐỀ ÔN TẬP MÔN TOÁN – LỚP 3". Mã kĩ năng tra ở trang Danh mục kĩ năng (nút "Xuất Excel"); ghi đúng tên ngắn của kĩ năng cũng được.' },
  { kind: 'note', text: `Môn học theo lớp (CT GDPT 2018): ${SUBJECT_LIST.filter((s) => s.id !== 'khac').map((s) => `${s.name} (${subjectGradeNote(s.id)})`).join(' · ')} · Khác.` },
  { kind: 'note', text: 'Ghi nhớ: Nối cặp viết "vế trái = vế phải". Điền vào đoạn văn đặt từ đúng trong [ngoặc vuông], nhiều cách đúng ngăn bằng | . Chọn trong câu viết [lựa chọn 1|*lựa chọn đúng|lựa chọn 3] (dấu * trước lựa chọn đúng). Phân loại từ viết "Nhóm <tên>: từ 1, từ 2"; Kéo thả viết "Ô <tên>: thẻ 1, thẻ 2".' },
];

function paragraphs(): Para[] {
  const out: Para[] = [...GUIDE, { kind: 'h', text: 'CÂU HỎI (ví dụ mỗi dạng một câu — xoá đi rồi soạn câu của thầy/cô)' }];
  for (const ex of WORD_TEMPLATE_EXAMPLES) {
    ex.lines.forEach((t, i) => out.push({ kind: i === 0 ? 'q' : 'body', text: t }));
    out.push({ kind: 'body', text: '' });
  }
  return out;
}

function pXml(p: Para): string {
  const t = xmlEscape(p.text);
  const rPr =
    p.kind === 'title' ? '<w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="1F2A44"/></w:rPr>'
      : p.kind === 'h' ? '<w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2F6FD1"/></w:rPr>'
        : p.kind === 'q' ? '<w:rPr><w:b/></w:rPr>'
          : p.kind === 'note' ? '<w:rPr><w:i/><w:sz w:val="21"/><w:color w:val="5B6472"/></w:rPr>' : '';
  const pPr = p.kind === 'title' || p.kind === 'h' ? '<w:pPr><w:spacing w:before="200" w:after="120"/></w:pPr>' : '<w:pPr><w:spacing w:after="40"/></w:pPr>';
  return `<w:p>${pPr}${t ? `<w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r>` : ''}</w:p>`;
}

/** Tệp mẫu Word để GV tải về. */
export function buildWordTemplateDocx(): Uint8Array {
  const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const body = paragraphs().map(pXml).join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`${H}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'word/styles.xml': strToU8(`${H}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`),
    'word/document.xml': strToU8(`${H}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`),
  };
  return zipSync(files, { level: 6 });
}
