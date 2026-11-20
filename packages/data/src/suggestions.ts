/**
 * Gợi ý cho phụ huynh làm cùng con ở nhà — ngắn, thực tế, không thuật ngữ. Tra theo mã kĩ năng, rồi chủ đề
 * (đoạn giữa của mã), rồi môn. Mỗi mục 1–3 câu.
 */
import { SKILL_BY_CODE } from '@openedu/contracts';

const BY_SKILL: Record<string, string[]> = {
  'T4.PS.QUY-DONG': [
    'Cắt 2 cái bánh (hoặc tờ giấy) bằng nhau: một cái chia 2 phần, một cái chia 4 phần. Hỏi con: nửa cái bằng mấy phần tư?',
    'Khi con quy đồng, nhắc con: mẫu số nhân với số nào thì tử số cũng nhân với số đó.',
  ],
  'T4.PS.TINH-CHAT': ['Gấp đôi một tờ giấy đã tô một nửa: 1/2 thành 2/4 — cho con thấy phần tô không đổi.', 'Đố con tìm 3 phân số bằng 1/2 bằng cách nhân cả tử và mẫu với cùng một số.'],
  'T4.PS.RUT-GON': ['Cho con chia 6 cái kẹo trong 8 cái thành các nhóm bằng nhau để thấy 6/8 = 3/4.', 'Nhắc con rút gọn tới khi tử và mẫu không còn cùng chia hết cho số nào (trừ 1).'],
  'T4.PSPT.CONG-TRU': ['Dùng thanh sô-cô-la chia 8 miếng: ăn 2 miếng rồi 3 miếng là 5/8 thanh — mẫu số giữ nguyên.', 'Khi cộng hai phân số khác mẫu, nhắc con đưa về cùng mẫu số trước.'],
  'T4.PT.CONG-TRU': ['Mỗi tối cho con làm 2 phép cộng có nhớ và tự kiểm tra lại bằng phép trừ.', 'Nhắc con viết số nhớ nhỏ phía trên hàng bên trái để không quên.'],
  'T4.STN.LAM-TRON': ['Khi đi chợ, đố con làm tròn giá tiền (vd 37 500 đồng → khoảng 38 000 đồng).'],
  'T4.STN.GIA-TRI-CHU-SO': ['Viết một số có 7 chữ số lên giấy, đố con chữ số 5 đứng ở hàng nào và có giá trị bao nhiêu.'],
  'T5.STP.SO-SANH': ['So giá tiền hoặc cân nặng có dấu phẩy (2,5 kg và 2,45 kg): nhắc con so hàng phần mười trước.', 'Đổi ra tiền cho dễ hiểu: 0,3 nghìn đồng = 300 đồng, 0,25 nghìn đồng = 250 đồng.'],
  'T5.STP.CAU-TAO': ['Dùng thước dây: 1,25 m là 1 mét, 2 phần mười mét và 5 phần trăm mét — cho con chỉ trên thước.'],
};

const BY_TOPIC: Record<string, string[]> = {
  STN: ['Đọc to cùng con các số lớn trên báo, hoá đơn tiền điện, dân số…'],
  PT: ['Mỗi ngày cho con làm 3–5 phép tính ngắn và tự kiểm tra lại kết quả.'],
  TN: ['Đố nhanh con tính nhẩm khi đi chợ, đi đường (vd 25 × 4).'],
  BT: ['Cho con nói thành lời thứ tự làm phép tính trước khi tính.'],
  GQ: ['Đọc đề bài cùng con, hỏi: “Đề cho biết gì? Hỏi gì?” trước khi làm.'],
  PS: ['Dùng bánh, trái cây chia phần bằng nhau để con nói phân số tương ứng.'],
  PSPT: ['Cho con giải thích bằng hình vẽ (thanh, hình tròn) trước khi tính.'],
  STP: ['Cho con đọc giá tiền, cân nặng có dấu phẩy trên bao bì.'],
  STPPT: ['Khi con đặt tính, nhắc con viết các dấu phẩy thẳng cột.'],
  TSPT: ['Tìm cùng con các con số phần trăm trên nhãn hàng, hỏi “50% của 40 nghìn là bao nhiêu?”.'],
  HH: ['Tìm cùng con các hình (góc vuông, hình thoi, song song) trong nhà.'],
  DL: ['Cho con cân, đo, đổi đơn vị với đồ vật thật trong nhà (gạo, nước, chiều dài bàn).'],
  TK: ['Cùng con ghi số liệu nhỏ trong tuần (số giờ ngủ, số trang đọc) rồi vẽ cột đơn giản.'],
  XS: ['Chơi tung đồng xu 10 lần cùng con, đếm số lần mặt sấp.'],
  TAM: ['Đọc cùng con 10 phút mỗi ngày và hỏi con kể lại.'],
};

const GENERIC = ['Khen con khi con cố gắng, và cùng con làm bộ ôn tập ngắn trong mục “Hôm nay”.'];

/** 1–3 gợi ý cho một kĩ năng (ưu tiên gợi ý riêng của gốc, rồi theo chủ đề). */
export function homeSuggestions(skillCode: string, rootSkill?: string): string[] {
  const out: string[] = [];
  const push = (list?: string[]) => {
    for (const s of list ?? []) if (out.length < 3 && !out.includes(s)) out.push(s);
  };
  if (rootSkill) push(BY_SKILL[rootSkill]);
  push(BY_SKILL[skillCode]);
  const topic = (rootSkill ?? skillCode).split('.')[1];
  if (out.length < 2) push(BY_TOPIC[topic]);
  if (!out.length) push(BY_TOPIC[skillCode.split('.')[1]]);
  if (!out.length) push(GENERIC);
  return out;
}

export function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function shortOf(code: string): string {
  return SKILL_BY_CODE[code]?.short ?? code;
}
