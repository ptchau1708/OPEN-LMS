import { MASCOTS, type Lesson } from '@openedu/contracts';
import { MASCOT_COUNTRY_EN } from './items-tieng-anh';
import { STICKS_26_SVG } from './svg';
import { CLASS_2A_NAMES } from './users';

export const LESSON_IDS = {
  toan: 'l-toan2-cong-co-nho',
  tiengViet: 'l-tv1-van-ang-anh',
  tnxh: 'l-tnxh1-con-vat',
  tiengAnh: 'l-ta3-hello-world',
  phanSo4: 'l-toan4-phan-so',
  soThapPhan5: 'l-toan5-so-thap-phan',
} as const;

export const SAMPLE_PACKAGE_ID = 'pkg-dem-tao';

export function buildLessons(updatedAt: string): Lesson[] {
  const toan: Lesson = {
    id: LESSON_IDS.toan,
    title: 'Phép cộng có nhớ trong phạm vi 100',
    subject: 'toan',
    grade: 2,
    description: 'Gộp que lẻ thành bó chục, đặt tính thẳng cột và cộng có nhớ cùng Shiba Mochi.',
    mascot: 'shiba',
    ownerId: 'u-colan',
    status: 'published',
    minutes: 25,
    updatedAt,
    slides: [
      {
        id: `${LESSON_IDS.toan}-s1`,
        layout: 'title',
        title: 'Phép cộng có nhớ trong phạm vi 100',
        text: 'Cùng Shiba Mochi gộp que tính nhé!',
        mascot: 'shiba',
        teacherNotes: 'Khởi động: hỏi HS 9 + 1 bằng mấy, 10 que gộp lại gọi là gì.',
      },
      {
        id: `${LESSON_IDS.toan}-s2`,
        layout: 'image-text',
        title: 'Bó chục và que lẻ',
        image: STICKS_26_SVG,
        text: 'Số 26 gồm **2 chục** và **6 đơn vị**: 2 bó que tính và 6 que lẻ.\nKhi cộng, nếu số que lẻ **đủ 10** thì ta bó lại thành 1 chục — đó là **nhớ 1** sang hàng chục.',
        speak: 'Số hai mươi sáu gồm hai chục và sáu đơn vị. Khi cộng, nếu số que lẻ đủ mười thì ta bó lại thành một chục, đó là nhớ một sang hàng chục.',
        teacherNotes: 'Cho HS cầm que tính thật: 2 bó + 6 que, thêm 7 que, gộp 10 que lẻ thành 1 bó.',
      },
      { id: `${LESSON_IDS.toan}-s3`, layout: 'activity', title: 'Thử với que tính', itemId: 'it-toan2-que-26-7' },
      { id: `${LESSON_IDS.toan}-s4`, layout: 'activity', title: 'Bài toán hái cam', itemId: 'it-toan2-cam-36-8' },
      { id: `${LESSON_IDS.toan}-s5`, layout: 'activity', title: 'Tính nhẩm', itemId: 'it-toan2-38-5' },
      { id: `${LESSON_IDS.toan}-s6`, layout: 'activity', title: 'Đặt tính rồi tính', itemId: 'it-toan2-dat-tinh-47-25', teacherNotes: 'Viết 47 + 25 lên bảng, gọi 1 HS lên làm cùng.' },
      {
        id: `${LESSON_IDS.toan}-s7`,
        layout: 'game',
        title: 'Vòng quay may mắn: ai lên bảng?',
        text: 'Bạn được chọn tính nhẩm: 29 + 3 = ?',
        game: { kind: 'wheel', entries: CLASS_2A_NAMES },
        teacherNotes: 'Đáp án: 32. Bạn trả lời đúng được thưởng 1 sao cho tổ.',
      },
      {
        id: `${LESSON_IDS.toan}-s8`,
        layout: 'package',
        title: 'Trò chơi: Đếm táo cùng Shiba',
        text: 'Đếm số táo trên cây rồi chọn số đúng nhé!',
        packageId: SAMPLE_PACKAGE_ID,
      },
      {
        id: `${LESSON_IDS.toan}-s9`,
        layout: 'summary',
        title: 'Em đã biết cộng có nhớ!',
        text: '• Cộng hàng đơn vị trước: đủ 10 thì viết số đơn vị, **nhớ 1** sang hàng chục.\n• Đặt tính thẳng cột: chục thẳng chục, đơn vị thẳng đơn vị.',
        mascot: 'shiba',
      },
    ],
  };

  const tiengViet: Lesson = {
    id: LESSON_IDS.tiengViet,
    title: 'Vần ang, anh',
    subject: 'tieng-viet',
    grade: 1,
    description: 'Đọc, phân biệt và viết tiếng có vần ang, anh: cây bàng, quả chanh.',
    mascot: 'nghe',
    ownerId: 'u-colan',
    status: 'published',
    minutes: 20,
    updatedAt,
    slides: [
      { id: `${LESSON_IDS.tiengViet}-s1`, layout: 'title', title: 'Vần ang, anh', text: 'Học vần cùng Nghé Tí nào!', mascot: 'nghe' },
      {
        id: `${LESSON_IDS.tiengViet}-s2`,
        layout: 'image-text',
        title: 'ang – cây bàng · anh – quả chanh',
        image: 'emoji:🌳',
        text: '**ang**: a – ngờ – ang\n**bàng**: bờ – ang – bang – huyền – bàng\n\n**anh**: a – nhờ – anh\n**chanh**: chờ – anh – chanh',
        speak: 'a, ngờ, ang. bờ, ang, bang, huyền, bàng. Cây bàng. a, nhờ, anh. chờ, anh, chanh. Quả chanh.',
        teacherNotes: 'Cho HS đọc đồng thanh, rồi đọc cá nhân. Lưu ý phân biệt âm cuối ng / nh.',
      },
      { id: `${LESSON_IDS.tiengViet}-s3`, layout: 'activity', title: 'Nghe và chọn', itemId: 'it-tv1-nghe-cay-bang' },
      { id: `${LESSON_IDS.tiengViet}-s4`, layout: 'activity', title: 'Giỏ vần', itemId: 'it-tv1-phan-loai-ang-anh' },
      { id: `${LESSON_IDS.tiengViet}-s5`, layout: 'activity', title: 'Điền từ', itemId: 'it-tv1-dien-van-ang-anh' },
      { id: `${LESSON_IDS.tiengViet}-s6`, layout: 'activity', title: 'Em đọc to', itemId: 'it-tv1-doc-cay-bang', teacherNotes: 'Nghe lại bản ghi của HS trong mục Bài nộp.' },
      {
        id: `${LESSON_IDS.tiengViet}-s7`,
        layout: 'summary',
        title: 'Giỏi quá!',
        text: 'Em đã học vần **ang** (cây bàng, cá vàng) và vần **anh** (quả chanh, màu xanh).\nVề nhà, em tìm thêm 2 tiếng có vần ang, anh nhé!',
        mascot: 'nghe',
      },
    ],
  };

  const tnxh: Lesson = {
    id: LESSON_IDS.tnxh,
    title: 'Con vật sống ở đâu?',
    subject: 'tnxh',
    grade: 1,
    description: 'Nhận biết con vật sống dưới nước và trên cạn qua tranh, trò chơi kéo thả và chạm hình.',
    mascot: 'koala',
    ownerId: 'u-colan',
    status: 'published',
    minutes: 25,
    updatedAt,
    slides: [
      { id: `${LESSON_IDS.tnxh}-s1`, layout: 'title', title: 'Con vật sống ở đâu?', text: 'Koala Lá dẫn em đi thăm ao và cánh đồng!', mascot: 'koala' },
      {
        id: `${LESSON_IDS.tnxh}-s2`,
        layout: 'compare',
        title: 'Dưới nước hay trên cạn?',
        columns: [
          { title: 'Dưới nước', text: 'Cá, tôm, cá heo… bơi dưới nước.', image: 'emoji:🐟' },
          { title: 'Trên cạn', text: 'Bò, gà, mèo… đi lại trên mặt đất.', image: 'emoji:🐄' },
        ],
        teacherNotes: 'Hỏi thêm: có con vật nào vừa sống dưới nước vừa sống trên cạn không? (ếch, vịt…)',
      },
      { id: `${LESSON_IDS.tnxh}-s3`, layout: 'activity', title: 'Đưa con vật về nhà', itemId: 'it-tnxh1-keo-noi-song' },
      { id: `${LESSON_IDS.tnxh}-s4`, layout: 'activity', title: 'Ao làng', itemId: 'it-tnxh1-ao-va-dong' },
      { id: `${LESSON_IDS.tnxh}-s5`, layout: 'activity', title: 'Cả lớp cùng chọn', itemId: 'it-tnxh1-thich-con-gi' },
      { id: `${LESSON_IDS.tnxh}-s6`, layout: 'activity', title: 'Họa sĩ nhí', itemId: 'it-tnxh1-ve-con-vat' },
      {
        id: `${LESSON_IDS.tnxh}-s7`,
        layout: 'summary',
        title: 'Em đã biết!',
        text: 'Có con vật sống **dưới nước**, có con vật sống **trên cạn**.\nEm hãy yêu quý và bảo vệ các con vật nhé!',
        mascot: 'koala',
      },
    ],
  };

  const friends = MASCOTS.map((m) => `**${m.name}** (${MASCOT_COUNTRY_EN[m.id].country}): ${m.greeting}`).join('\n');
  const tiengAnh: Lesson = {
    id: LESSON_IDS.tiengAnh,
    title: 'Hello around the world',
    subject: 'tieng-anh',
    grade: 3,
    description: 'Chào hỏi bằng tiếng Anh và làm quen lời chào của 10 bạn linh vật OPEN-EDU.',
    mascot: 'kiwi',
    ownerId: 'u-thaynam',
    status: 'published',
    minutes: 30,
    updatedAt,
    slides: [
      {
        id: `${LESSON_IDS.tiengAnh}-s1`,
        layout: 'title',
        title: 'Hello around the world',
        text: 'Kiwi Lăn rủ em đi chào các bạn khắp thế giới!',
        speak: 'Hello around the world!',
        lang: 'en-US',
        mascot: 'kiwi',
      },
      {
        id: `${LESSON_IDS.tiengAnh}-s2`,
        layout: 'image-text',
        title: 'Our mascot friends say hello!',
        image: 'emoji:🌏',
        text: friends,
        teacherNotes: 'Cho HS nhắc lại từng lời chào. Hỏi: “Where is Shiba from?” – “Japan.”',
      },
      { id: `${LESSON_IDS.tiengAnh}-s3`, layout: 'activity', title: 'Match', itemId: 'it-ta3-noi-loi-chao' },
      { id: `${LESSON_IDS.tiengAnh}-s4`, layout: 'activity', title: 'Listen', itemId: 'it-ta3-nghe-how-are-you' },
      { id: `${LESSON_IDS.tiengAnh}-s5`, layout: 'activity', title: 'Make a sentence', itemId: 'it-ta3-xep-nice-to-meet' },
      { id: `${LESSON_IDS.tiengAnh}-s6`, layout: 'activity', title: 'Dialogue', itemId: 'it-ta3-hoi-dap' },
      { id: `${LESSON_IDS.tiengAnh}-s7`, layout: 'activity', title: 'Greetings', itemId: 'it-ta3-loi-chao' },
      {
        id: `${LESSON_IDS.tiengAnh}-s8`,
        layout: 'summary',
        title: 'Well done!',
        text: 'Hello! · Hi! · How are you? – I’m fine, thank you. · Nice to meet you!\nEm đã biết chào bằng tiếng Anh và lời chào của các bạn linh vật.',
        mascot: 'kiwi',
      },
    ],
  };

  const P = LESSON_IDS.phanSo4;
  const phanSo4: Lesson = {
    id: P,
    title: 'Phân số',
    subject: 'toan',
    grade: 4,
    description: 'Phân số, tử số, mẫu số; tính chất cơ bản; rút gọn và quy đồng mẫu số.',
    mascot: 'shiba',
    ownerId: 'u-cothu',
    status: 'published',
    minutes: 35,
    updatedAt,
    slides: [
      { id: `${P}-s1`, layout: 'title', title: 'Phân số', text: 'Cùng Shiba Mochi chia bánh thật đều nhé!', mascot: 'shiba', teacherNotes: 'Khởi động: chia một cái bánh cho 4 bạn, mỗi bạn được bao nhiêu phần?' },
      {
        id: `${P}-s2`,
        layout: 'image-text',
        title: 'Tử số và mẫu số',
        image: 'emoji:🍕',
        text: 'Chia cái bánh thành **8 phần bằng nhau**, lấy **3 phần**: ta có phân số **3/8**.\n• **Mẫu số** (số ở dưới) cho biết bánh được chia thành mấy phần bằng nhau.\n• **Tử số** (số ở trên) cho biết đã lấy mấy phần.',
        speak: 'Chia cái bánh thành tám phần bằng nhau, lấy ba phần, ta có phân số ba phần tám. Mẫu số ở dưới cho biết chia thành mấy phần bằng nhau. Tử số ở trên cho biết đã lấy mấy phần.',
      },
      { id: `${P}-s3`, layout: 'activity', title: 'Phân số chỉ phần tô màu', itemId: 'it-toan4-ps-khai-niem' },
      {
        id: `${P}-s4`,
        layout: 'compare',
        title: 'Tính chất cơ bản của phân số',
        columns: [
          { title: 'Nhân cả tử và mẫu', text: '2/3 = (2 × 2)/(3 × 2) = 4/6. Phân số không đổi!', image: 'emoji:✖️' },
          { title: 'Chia cả tử và mẫu', text: '6/8 = (6 : 2)/(8 : 2) = 3/4. Đó là rút gọn phân số.', image: 'emoji:➗' },
        ],
        teacherNotes: 'Nhấn mạnh: chỉ NHÂN hoặc CHIA cùng một số khác 0; cộng/trừ cùng một số thì phân số thay đổi.',
      },
      { id: `${P}-s5`, layout: 'activity', title: 'Phân số bằng nhau', itemId: 'it-toan4-ps-bang-nhau' },
      { id: `${P}-s6`, layout: 'activity', title: 'Rút gọn phân số', itemId: 'it-toan4-rut-gon-keo' },
      { id: `${P}-s7`, layout: 'activity', title: 'Quy đồng mẫu số', itemId: 'it-toan4-quy-dong', teacherNotes: 'Hỏi: 6 chia hết cho 3 không? Vậy chỉ cần nhân 2/3 với 2/2.' },
      {
        id: `${P}-s8`,
        layout: 'summary',
        title: 'Em đã biết phân số!',
        text: '• Mẫu số: số phần bằng nhau; tử số: số phần được lấy.\n• Nhân hoặc chia cả tử và mẫu với cùng một số → phân số **không đổi**.\n• Quy đồng: mẫu số nhân với số nào thì **tử số cũng nhân** với số đó.',
        mascot: 'shiba',
      },
    ],
  };

  const D = LESSON_IDS.soThapPhan5;
  const soThapPhan5: Lesson = {
    id: D,
    title: 'Số thập phân',
    subject: 'toan',
    grade: 5,
    description: 'Đọc, viết số thập phân; hàng của số thập phân; so sánh và sắp xếp số thập phân.',
    mascot: 'capybara',
    ownerId: 'u-cothu',
    status: 'published',
    minutes: 35,
    updatedAt,
    slides: [
      { id: `${D}-s1`, layout: 'title', title: 'Số thập phân', text: 'Capi đi chợ: 2,5 kg cam giá bao nhiêu?', mascot: 'capybara' },
      {
        id: `${D}-s2`,
        layout: 'image-text',
        title: 'Phần nguyên và phần thập phân',
        image: 'emoji:📏',
        text: 'Số **45,368** gồm:\n• Phần nguyên **45** (bên trái dấu phẩy).\n• Phần thập phân **368**: 3 phần mười, 6 phần trăm, 8 phần nghìn.',
        speak: 'Số bốn mươi lăm phẩy ba trăm sáu mươi tám gồm phần nguyên bốn mươi lăm và phần thập phân: ba phần mười, sáu phần trăm, tám phần nghìn.',
      },
      { id: `${D}-s3`, layout: 'activity', title: 'Viết số thập phân', itemId: 'it-toan5-doc-stp' },
      { id: `${D}-s4`, layout: 'activity', title: 'Hàng của số thập phân', itemId: 'it-toan5-hang-stp' },
      {
        id: `${D}-s5`,
        layout: 'compare',
        title: '0,3 hay 0,25 lớn hơn?',
        columns: [
          { title: '0,3 = 0,30', text: '3 phần mười = 30 phần trăm', image: 'emoji:🟦' },
          { title: '0,25', text: '2 phần mười và 5 phần trăm = 25 phần trăm', image: 'emoji:🟨' },
        ],
        teacherNotes: 'Lỗi hay gặp: nghĩ 0,25 > 0,3 vì 25 > 3. Cho HS viết thêm chữ số 0 để hai số có cùng số chữ số ở phần thập phân.',
      },
      { id: `${D}-s6`, layout: 'activity', title: 'So sánh số thập phân', itemId: 'it-toan5-so-sanh-stp' },
      { id: `${D}-s7`, layout: 'activity', title: 'Sắp xếp số thập phân', itemId: 'it-toan5-sap-xep-stp' },
      {
        id: `${D}-s8`,
        layout: 'summary',
        title: 'Em đã biết số thập phân!',
        text: '• So sánh phần nguyên trước, rồi lần lượt hàng **phần mười**, **phần trăm**, **phần nghìn**.\n• Viết thêm chữ số 0 vào cuối phần thập phân thì số **không đổi**: 0,3 = 0,30.',
        mascot: 'capybara',
      },
    ],
  };

  return [toan, tiengViet, tnxh, tiengAnh, phanSo4, soThapPhan5];
}
