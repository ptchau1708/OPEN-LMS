/**
 * Dữ liệu mẫu Phase 6: câu bổ sung cho ngân hàng (để ma trận mẫu đủ câu Mức 3 và có đề B khác đề A),
 * 2 ma trận (Toán 4 cuối HK1, Toán 5 giữa HK1). Chỉ `import type` để Node / Deno nạp được.
 */
import type { ExamMatrix, Item, MatrixCell } from '@openedu/contracts';

type Opt = [id: string, text: string];
function mcq(id: string, grade: 4 | 5, skills: string[], difficulty: Item['difficulty'], text: string, options: Opt[], correct: string, explanation: string): Item {
  return {
    id, type: 'MCQ', grade, subject: 'toan', skills, difficulty,
    prompt: { text },
    payload: { options: options.map(([i, t]) => ({ id: i, text: t })), columns: 2 },
    key: { correct }, explanation, stars: 1, tags: ['đề kiểm tra'],
  };
}
function sa(id: string, grade: 4 | 5, skills: string[], difficulty: Item['difficulty'], text: string, accepted: string[], explanation: string, unit?: string): Item {
  return {
    id, type: 'SHORT_ANSWER', grade, subject: 'toan', skills, difficulty,
    prompt: { text },
    payload: { inputMode: 'numeric', placeholder: 'Em viết số', ...(unit ? { unit } : {}) },
    key: { accepted }, explanation, stars: 1, tags: ['đề kiểm tra'],
  };
}

export const EXAM_EXTRA_ITEMS: Item[] = [
  /* ---------- Lớp 4 (cuối học kì I) ---------- */
  mcq('it-exam4-chan-le', 4, ['T4.STN.CHAN-LE'], 'nhan-biet', 'Số nào dưới đây là số chẵn?', [['a', '4 517'], ['b', '3 208'], ['c', '1 093'], ['d', '6 461']], 'b', 'Số chẵn có chữ số tận cùng là 0, 2, 4, 6, 8. Số 3 208 tận cùng là 8.'),
  mcq('it-exam4-nhieu-buoc', 4, ['T4.STN.SO-SANH'], 'van-dung', 'Bốn bạn đếm số bước chân trong một ngày: An 12 350, Bình 12 503, Chi 12 305, Dũng 12 530. Bạn nào đi nhiều bước nhất?', [['a', 'An'], ['b', 'Bình'], ['c', 'Chi'], ['d', 'Dũng']], 'd', 'So sánh từng hàng từ trái sang: 12 530 lớn nhất nên Dũng đi nhiều bước nhất.'),
  sa('it-exam4-lam-tron-chuc-nghin', 4, ['T4.STN.LAM-TRON'], 'ket-noi', 'Làm tròn số 386 520 đến hàng chục nghìn.', ['390000', '390 000'], 'Chữ số hàng nghìn là 6 ≥ 5 nên làm tròn lên: 390 000.'),
  sa('it-exam4-tru-5cs', 4, ['T4.PT.CONG-TRU'], 'nhan-biet', 'Tính: 52 418 − 7 305 = ?', ['45113', '45 113'], 'Đặt tính thẳng hàng rồi trừ từ phải sang trái: 45 113.'),
  mcq('it-exam4-tinh-chat-cong', 4, ['T4.PT.TINH-CHAT-CONG'], 'ket-noi', '245 + 2 019 = 2 019 + …. Số thích hợp điền vào chỗ chấm là:', [['a', '245'], ['b', '2 019'], ['c', '2 264'], ['d', '0']], 'a', 'Tính chất giao hoán: đổi chỗ các số hạng thì tổng không đổi.'),
  sa('it-exam4-loi-van-gao', 4, ['T4.PT.CONG-TRU', 'T4.GQ.BA-BUOC'], 'van-dung', 'Ngày thứ nhất cửa hàng bán 1 245 kg gạo, ngày thứ hai bán nhiều hơn ngày thứ nhất 380 kg. Cả hai ngày cửa hàng bán được bao nhiêu ki-lô-gam gạo?', ['2870', '2 870'], 'Ngày thứ hai: 1 245 + 380 = 1 625 (kg). Cả hai ngày: 1 245 + 1 625 = 2 870 (kg).', 'kg'),
  sa('it-exam4-loi-van-but', 4, ['T4.PT.NHAN-2-CS', 'T4.GQ.BA-BUOC'], 'van-dung', 'Mỗi hộp có 24 cái bút. Cô mua 35 hộp và đã phát cho học sinh 600 cái. Cô còn lại bao nhiêu cái bút?', ['240'], '24 × 35 = 840 (cái). Còn lại: 840 − 600 = 240 (cái).', 'cái'),
  mcq('it-exam4-the-ki-ly', 4, ['T4.DL.GIAY-THE-KI'], 'van-dung', 'Năm 1010, vua Lý Thái Tổ dời đô về Thăng Long. Năm đó thuộc thế kỉ nào?', [['a', 'Thế kỉ X'], ['b', 'Thế kỉ XI'], ['c', 'Thế kỉ XII'], ['d', 'Thế kỉ IX']], 'b', 'Từ năm 1001 đến năm 1100 là thế kỉ XI.'),
  mcq('it-exam4-tan-ta', 4, ['T4.DL.YEN-TA-TAN', 'T4.DL.CHUYEN-DOI'], 'van-dung', 'Một xe chở 3 tấn 5 tạ gạo. Xe chở bao nhiêu ki-lô-gam gạo?', [['a', '350 kg'], ['b', '3 050 kg'], ['c', '3 500 kg'], ['d', '35 000 kg']], 'c', '3 tấn = 3 000 kg, 5 tạ = 500 kg. Cộng lại: 3 500 kg.'),
  mcq('it-exam4-goc-bet', 4, ['T4.HH.GOC'], 'nhan-biet', 'Góc bẹt bằng bao nhiêu độ?', [['a', '90°'], ['b', '60°'], ['c', '180°'], ['d', '120°']], 'c', 'Góc bẹt bằng hai góc vuông: 180°.'),
  sa('it-exam4-m2-dm2', 4, ['T4.DL.DIEN-TICH'], 'ket-noi', '5 m² = … dm²', ['500'], '1 m² = 100 dm² nên 5 m² = 500 dm².', 'dm²'),
  mcq('it-exam4-bieu-do-sach', 4, ['T4.TK.DOC-BIEU-DO-COT'], 'nhan-biet', 'Biểu đồ cột cho biết số sách mỗi lớp quyên góp: 4A có 45 quyển, 4B có 52 quyển, 4C có 38 quyển. Lớp nào quyên góp nhiều sách nhất?', [['a', '4A'], ['b', '4B'], ['c', '4C'], ['d', 'Bằng nhau']], 'b', 'Cột cao nhất là của lớp 4B (52 quyển).'),

  /* ---------- Lớp 5 (giữa học kì I) ---------- */
  mcq('it-exam5-ps-thap-phan', 5, ['T5.PS.THAP-PHAN-HON-SO'], 'nhan-biet', 'Phân số nào dưới đây là phân số thập phân?', [['a', '3/7'], ['b', '7/100'], ['c', '5/12'], ['d', '9/25']], 'b', 'Phân số thập phân có mẫu số là 10, 100, 1 000…'),
  mcq('it-exam5-hon-so', 5, ['T5.PS.THAP-PHAN-HON-SO'], 'nhan-biet', 'Hỗn số 2 3/4 đọc là:', [['a', 'Hai và ba phần tư'], ['b', 'Hai ba phần tư'], ['c', 'Ba phần tư hai'], ['d', 'Hai phần ba tư']], 'a', 'Đọc phần nguyên, chữ “và”, rồi đọc phân số: hai và ba phần tư.'),
  mcq('it-exam5-so-sanh-ps', 5, ['T5.PS.QUY-DONG-SO-SANH'], 'ket-noi', 'Phân số nào lớn hơn 3/4?', [['a', '2/3'], ['b', '5/8'], ['c', '5/6'], ['d', '3/5']], 'c', 'Quy đồng: 3/4 = 9/12, 5/6 = 10/12 nên 5/6 > 3/4.'),
  sa('it-exam5-ps-giai-toan', 5, ['T5.PS.GIAI-TOAN'], 'van-dung', 'Lớp 5A có 36 bạn, trong đó 2/3 số bạn thích bóng đá. Hỏi có bao nhiêu bạn thích bóng đá?', ['24'], '36 × 2/3 = 24 (bạn).', 'bạn'),
  sa('it-exam5-ps-giai-toan-2', 5, ['T5.PS.GIAI-TOAN'], 'van-dung', 'Một tấm vải dài 24 m. Lần đầu cắt 1/4 tấm vải, lần sau cắt 1/3 tấm vải. Còn lại bao nhiêu mét vải?', ['10'], 'Lần đầu: 24 : 4 = 6 (m). Lần sau: 24 : 3 = 8 (m). Còn: 24 − 6 − 8 = 10 (m).', 'm'),
  mcq('it-exam5-viet-stp', 5, ['T5.STP.DOC-VIET'], 'nhan-biet', 'Số thập phân gồm 5 đơn vị, 7 phần trăm viết là:', [['a', '5,7'], ['b', '5,07'], ['c', '5,007'], ['d', '57,0']], 'b', '7 phần trăm ở hàng phần trăm: 5,07.'),
  mcq('it-exam5-dau-stp', 5, ['T5.STP.SO-SANH'], 'ket-noi', 'Dấu thích hợp điền vào chỗ chấm: 8,7 … 8,70', [['a', '>'], ['b', '<'], ['c', '=']], 'c', 'Thêm chữ số 0 vào tận cùng bên phải phần thập phân thì số không đổi: 8,7 = 8,70.'),
  sa('it-exam5-stp-lon-nhat', 5, ['T5.STP.SO-SANH'], 'ket-noi', 'Viết số lớn nhất trong các số: 4,56; 4,65; 4,506.', ['4,65', '4.65'], 'So sánh hàng phần mười: 6 > 5 nên 4,65 lớn nhất.'),
  mcq('it-exam5-stp-giua', 5, ['T5.STP.SO-SANH', 'T5.STP.CAU-TAO'], 'van-dung', 'Số thập phân x có một chữ số ở phần thập phân và 7,3 < x < 7,5. Vậy x là:', [['a', '7,35'], ['b', '7,4'], ['c', '7,5'], ['d', '7,25']], 'b', 'Số có một chữ số phần thập phân nằm giữa 7,3 và 7,5 là 7,4.'),
  mcq('it-exam5-chay-nhanh', 5, ['T5.STP.SAP-XEP'], 'van-dung', 'Thời gian chạy 60 m: An 12,5 giây, Bình 12,45 giây, Chi 12,54 giây, Dũng 12,6 giây. Bạn nào chạy nhanh nhất?', [['a', 'An'], ['b', 'Bình'], ['c', 'Chi'], ['d', 'Dũng']], 'b', 'Chạy nhanh nhất là người dùng ít thời gian nhất: 12,45 giây (Bình).'),
  mcq('it-exam5-so-do-m', 5, ['T5.STP.SO-DO'], 'nhan-biet', '3 m 5 cm = … m', [['a', '3,5'], ['b', '3,05'], ['c', '3,005'], ['d', '35']], 'b', '5 cm = 5/100 m = 0,05 m nên 3 m 5 cm = 3,05 m.'),
  mcq('it-exam5-so-do-kg', 5, ['T5.STP.SO-DO'], 'nhan-biet', '2 kg 300 g = … kg', [['a', '2,3'], ['b', '2,03'], ['c', '23'], ['d', '2,003']], 'a', '300 g = 0,3 kg nên 2 kg 300 g = 2,3 kg.'),
  sa('it-exam5-day-con-lai', 5, ['T5.STP.SO-DO', 'T5.STPPT.CONG-TRU'], 'van-dung', 'Một sợi dây dài 4 m 25 cm. Bạn Nam cắt đi 1,5 m. Sợi dây còn lại dài bao nhiêu mét?', ['2,75', '2.75'], '4 m 25 cm = 4,25 m. Còn lại: 4,25 − 1,5 = 2,75 (m).', 'm'),
  sa('it-exam5-gao-con-lai', 5, ['T5.STP.SO-DO', 'T5.STPPT.CONG-TRU'], 'van-dung', 'Bao gạo nặng 25 kg. Mẹ đã dùng 7 kg 500 g. Bao gạo còn lại bao nhiêu ki-lô-gam?', ['17,5', '17.5'], '7 kg 500 g = 7,5 kg. Còn lại: 25 − 7,5 = 17,5 (kg).', 'kg'),
  sa('it-exam5-so-do-tan', 5, ['T5.STP.SO-DO'], 'ket-noi', '4 tấn 250 kg = … tấn', ['4,25', '4.25'], '250 kg = 0,25 tấn nên 4 tấn 250 kg = 4,25 tấn.', 'tấn'),
];

const c = (tn: number, tl: number, points: number): MatrixCell => ({ tn, tl, points });

/** Toán 4 — cuối học kì I: 14 câu, 10 điểm, 40 phút. */
export const MATRIX_TOAN4_CK1: ExamMatrix = {
  id: 'mt-toan4-ck1',
  title: 'Toán 4 – Cuối học kì I',
  subject: 'toan',
  grade: 4,
  termId: 'CK1',
  durationMin: 40,
  rows: [
    { id: 'STN', label: 'Số tự nhiên', skills: ['T4.STN.DOC-VIET', 'T4.STN.GIA-TRI-CHU-SO', 'T4.STN.CHAN-LE', 'T4.STN.SO-SANH', 'T4.STN.SAP-XEP', 'T4.STN.LAM-TRON'] },
    { id: 'PT', label: 'Các phép tính với số tự nhiên', skills: ['T4.PT.CONG-TRU', 'T4.PT.TINH-CHAT-CONG', 'T4.PT.TRUNG-BINH-CONG', 'T4.PT.NHAN-2-CS', 'T4.PT.CHIA-2-CS', 'T4.GQ.BA-BUOC'] },
    { id: 'HHDL', label: 'Hình học và đo lường', skills: ['T4.HH.GOC', 'T4.DL.YEN-TA-TAN', 'T4.DL.DIEN-TICH', 'T4.DL.GIAY-THE-KI', 'T4.DL.CHUYEN-DOI'] },
    { id: 'TK', label: 'Thống kê', skills: ['T4.TK.DOC-BIEU-DO-COT', 'T4.TK.TRUNG-BINH'] },
  ],
  cells: {
    'STN:1': c(2, 0, 0.5), 'STN:2': c(0, 1, 1), 'STN:3': c(1, 0, 1),
    'PT:1': c(0, 1, 1), 'PT:2': c(1, 1, 0.5), 'PT:3': c(0, 1, 1),
    'HHDL:1': c(2, 0, 0.5), 'HHDL:2': c(0, 1, 1), 'HHDL:3': c(1, 0, 0.5),
    'TK:1': c(1, 0, 0.5), 'TK:3': c(0, 1, 1),
  },
};

/** Toán 5 — giữa học kì I: 13 câu, 10 điểm, 40 phút. */
export const MATRIX_TOAN5_GK1: ExamMatrix = {
  id: 'mt-toan5-gk1',
  title: 'Toán 5 – Giữa học kì I',
  subject: 'toan',
  grade: 5,
  termId: 'GK1',
  durationMin: 40,
  rows: [
    { id: 'PS', label: 'Phân số, hỗn số', skills: ['T5.PS.RUT-GON', 'T5.PS.QUY-DONG-SO-SANH', 'T5.PS.BON-PHEP-TINH', 'T5.PS.CONG-KHAC-MAU', 'T5.PS.THAP-PHAN-HON-SO', 'T5.PS.GIAI-TOAN'] },
    { id: 'STP', label: 'Số thập phân', skills: ['T5.STP.DOC-VIET', 'T5.STP.CAU-TAO', 'T5.STP.SO-SANH', 'T5.STP.SAP-XEP', 'T5.STP.LAM-TRON'] },
    { id: 'SODO', label: 'Số đo đại lượng dạng số thập phân', skills: ['T5.STP.SO-DO'] },
  ],
  cells: {
    'PS:1': c(1, 0, 0.5), 'PS:2': c(1, 0, 0.5), 'PS:3': c(0, 1, 2),
    'STP:1': c(2, 1, 0.5), 'STP:2': c(2, 1, 0.5), 'STP:3': c(1, 0, 1),
    'SODO:1': c(1, 0, 0.5), 'SODO:2': c(0, 1, 1), 'SODO:3': c(0, 1, 1.5),
  },
};

export const SEED_MATRICES: ExamMatrix[] = [MATRIX_TOAN4_CK1, MATRIX_TOAN5_GK1];
