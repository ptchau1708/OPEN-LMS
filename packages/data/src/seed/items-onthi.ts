/**
 * Câu hỏi mẫu cho trang Ôn thi (chế độ demo): Tiếng Việt lớp 5 theo các dạng thường gặp ở sân chơi Trạng Nguyên,
 * Toán lớp 5 theo các dạng thường gặp ở Đấu trường VioEdu. Câu do OPEN-EDU tự soạn, không chép đề của sân chơi nào.
 * Nhãn: 'onthi:tn' / 'onthi:vio'. File chỉ có `import type`.
 */
import type { Item } from '@openedu/contracts';

const tv = { grade: 5 as const, subject: 'tieng-viet' as const, stars: 1, tags: ['onthi:tn'] };
const toan = { grade: 5 as const, subject: 'toan' as const, stars: 1, tags: ['onthi:vio'] };

export const ONTHI_TV5_ITEMS: Item[] = [
  {
    ...tv, id: 'ot-tv5-dong-nghia', type: 'MCQ', difficulty: 'nhan-biet',
    prompt: { text: 'Từ nào đồng nghĩa với từ "siêng năng"?' },
    payload: { columns: 2, options: [{ id: 'a', text: 'chăm chỉ' }, { id: 'b', text: 'lười biếng' }, { id: 'c', text: 'thông minh' }, { id: 'd', text: 'nhanh nhẹn' }] },
    key: { correct: 'a' },
    explanation: '"Siêng năng" và "chăm chỉ" cùng chỉ người chịu khó làm việc, học tập.',
  },
  {
    ...tv, id: 'ot-tv5-so-sanh', type: 'MCQ', difficulty: 'ket-noi',
    prompt: { text: 'Câu "Mặt trời đỏ ửng như quả cầu lửa treo trên đỉnh núi." dùng biện pháp nghệ thuật nào?' },
    payload: { columns: 2, options: [{ id: 'a', text: 'Nhân hóa' }, { id: 'b', text: 'So sánh' }, { id: 'c', text: 'Điệp từ' }, { id: 'd', text: 'Đảo ngữ' }] },
    key: { correct: 'b' },
    explanation: 'Có từ so sánh "như": mặt trời được so sánh với quả cầu lửa.',
  },
  {
    ...tv, id: 'ot-tv5-cap-ket-tu', type: 'MCQ', difficulty: 'ket-noi',
    prompt: { text: 'Cặp kết từ trong câu "Vì trời mưa to nên chúng em nghỉ tập thể dục." là:' },
    payload: { columns: 2, options: [{ id: 'a', text: 'Vì … nên' }, { id: 'b', text: 'trời … mưa' }, { id: 'c', text: 'chúng em … nghỉ' }, { id: 'd', text: 'mưa to … nên' }] },
    key: { correct: 'a' },
    explanation: '"Vì … nên" là cặp kết từ chỉ nguyên nhân – kết quả.',
  },
  {
    ...tv, id: 'ot-tv5-l-n', type: 'SHORT_ANSWER', difficulty: 'nhan-biet',
    prompt: { text: 'Điền chữ l hoặc n vào chỗ trống: …ũy tre làng' },
    payload: { placeholder: 'l hoặc n' },
    key: { accepted: ['l'] },
    explanation: 'Viết đúng là "lũy tre làng".',
  },
  {
    ...tv, id: 'ot-tv5-s-x', type: 'FILL_IN_PASSAGE', difficulty: 'ket-noi',
    prompt: { text: 'Điền s hoặc x vào mỗi chỗ trống.' },
    payload: { passage: 'Mùa thu, lá vàng {{b1}}ào {{b2}}ạc rơi trên {{b3}}ân trường.' },
    key: { blanks: { b1: ['x'], b2: ['x'], b3: ['s'] } },
    explanation: 'Viết đúng: "xào xạc", "sân trường".',
  },
  {
    ...tv, id: 'ot-tv5-tuc-ngu', type: 'FILL_IN_PASSAGE', difficulty: 'nhan-biet',
    prompt: { text: 'Điền từ còn thiếu để hoàn thành câu tục ngữ.' },
    payload: { passage: 'Uống nước nhớ {{b1}}.' },
    key: { blanks: { b1: ['nguồn'] } },
    explanation: '"Uống nước nhớ nguồn": nhắc ta biết ơn những người đã làm nên điều tốt đẹp cho mình.',
  },
  {
    ...tv, id: 'ot-tv5-noi-nghia', type: 'MATCHING', difficulty: 'ket-noi',
    prompt: { text: 'Nối mỗi từ với nghĩa phù hợp.' },
    payload: {
      left: [{ id: 'l1', text: 'nhân hậu' }, { id: 'l2', text: 'trung thực' }, { id: 'l3', text: 'dũng cảm' }, { id: 'l4', text: 'cần cù' }],
      right: [{ id: 'r1', text: 'thương người, sống có tình nghĩa' }, { id: 'r2', text: 'ngay thẳng, thật thà' }, { id: 'r3', text: 'không sợ nguy hiểm, gian khổ' }, { id: 'r4', text: 'chăm chỉ làm việc, không ngại khó' }],
    },
    key: { pairs: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' } },
    explanation: 'Nhân hậu – thương người; trung thực – thật thà; dũng cảm – không sợ nguy hiểm; cần cù – chăm chỉ.',
  },
  {
    ...tv, id: 'ot-tv5-noi-ve-cau', type: 'MATCHING', difficulty: 'van-dung',
    prompt: { text: 'Nối hai vế để tạo thành câu ghép hoàn chỉnh.' },
    payload: {
      left: [{ id: 'l1', text: 'Tuy nhà xa trường' }, { id: 'l2', text: 'Nếu em chăm luyện viết' }, { id: 'l3', text: 'Trời càng về khuya' }],
      right: [{ id: 'r1', text: 'nhưng Hà chưa bao giờ đi học muộn.' }, { id: 'r2', text: 'thì chữ của em sẽ đẹp hơn.' }, { id: 'r3', text: 'trăng càng sáng.' }],
    },
    key: { pairs: { l1: 'r1', l2: 'r2', l3: 'r3' } },
    explanation: 'Các cặp từ nối: tuy … nhưng; nếu … thì; càng … càng.',
  },
  {
    ...tv, id: 'ot-tv5-xep-cau', type: 'SENTENCE_SCRAMBLE', difficulty: 'nhan-biet',
    prompt: { text: 'Sắp xếp các từ thành câu hoàn chỉnh.' },
    payload: { words: [{ id: 'w3', text: 'giữ gìn' }, { id: 'w1', text: 'Em' }, { id: 'w5', text: 'sạch đẹp' }, { id: 'w2', text: 'luôn' }, { id: 'w4', text: 'sách vở' }, { id: 'w6', text: '.' }] },
    key: { order: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] },
    explanation: 'Câu đúng: "Em luôn giữ gìn sách vở sạch đẹp."',
  },
  {
    ...tv, id: 'ot-tv5-xep-chu', type: 'ORDERING', difficulty: 'nhan-biet',
    prompt: { text: 'Sắp xếp các chữ cái thành một từ có nghĩa.' },
    payload: { direction: 'horizontal', items: [{ id: 'c4', text: 'ờ' }, { id: 'c1', text: 't' }, { id: 'c6', text: 'g' }, { id: 'c3', text: 'ư' }, { id: 'c5', text: 'n' }, { id: 'c2', text: 'r' }] },
    key: { order: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] },
    explanation: 'Các chữ cái ghép thành từ "trường".',
  },
  {
    ...tv, id: 'ot-tv5-xep-doan', type: 'ORDERING', difficulty: 'van-dung',
    prompt: { text: 'Sắp xếp các câu thành đoạn văn hợp lí.' },
    payload: {
      direction: 'vertical',
      items: [
        { id: 's3', text: 'Chim chóc bắt đầu hót líu lo.' },
        { id: 's1', text: 'Sáng sớm, mặt trời vừa nhô lên sau rặng tre.' },
        { id: 's4', text: 'Cả khu vườn như bừng tỉnh sau một đêm dài.' },
        { id: 's2', text: 'Những giọt sương còn long lanh trên lá.' },
      ],
    },
    key: { order: ['s1', 's2', 's3', 's4'] },
    explanation: 'Đoạn văn tả theo trình tự: mặt trời lên → sương trên lá → chim hót → cả khu vườn bừng tỉnh.',
  },
  {
    ...tv, id: 'ot-tv5-tu-loai', type: 'WORD_CLASSIFY', difficulty: 'van-dung',
    prompt: { text: 'Xếp các từ vào đúng nhóm từ loại. Có từ không thuộc nhóm nào.' },
    payload: {
      distractors: true,
      groups: [{ id: 'g1', label: 'Danh từ' }, { id: 'g2', label: 'Động từ' }, { id: 'g3', label: 'Tính từ' }],
      words: [
        { id: 'w1', text: 'dòng sông' }, { id: 'w2', text: 'quyển sách' }, { id: 'w3', text: 'suy nghĩ' }, { id: 'w4', text: 'chạy nhảy' },
        { id: 'w5', text: 'xanh biếc' }, { id: 'w6', text: 'thật thà' }, { id: 'w7', text: 'và' }, { id: 'w8', text: 'nhưng' },
      ],
    },
    key: { placement: { w1: 'g1', w2: 'g1', w3: 'g2', w4: 'g2', w5: 'g3', w6: 'g3' } },
    explanation: '"Và", "nhưng" là kết từ nên không thuộc nhóm danh từ, động từ hay tính từ.',
  },
  {
    ...tv, id: 'ot-tv5-nghia-chuyen', type: 'WORD_CLASSIFY', difficulty: 'van-dung',
    prompt: { text: 'Từ "chân" trong mỗi cụm từ sau mang nghĩa gốc hay nghĩa chuyển?' },
    payload: {
      groups: [{ id: 'g1', label: 'Nghĩa gốc' }, { id: 'g2', label: 'Nghĩa chuyển' }],
      words: [{ id: 'w1', text: 'bàn chân em bé' }, { id: 'w2', text: 'đau chân' }, { id: 'w3', text: 'chân bàn' }, { id: 'w4', text: 'chân núi' }, { id: 'w5', text: 'chân trời' }],
    },
    key: { placement: { w1: 'g1', w2: 'g1', w3: 'g2', w4: 'g2', w5: 'g2' } },
    explanation: 'Nghĩa gốc: bộ phận cơ thể người. Nghĩa chuyển: phần dưới cùng của đồ vật, sự vật (chân bàn, chân núi, chân trời).',
  },
  {
    ...tv, id: 'ot-tv5-keo-ket-tu', type: 'FILL_IN_PASSAGE', difficulty: 'ket-noi',
    prompt: { text: 'Kéo kết từ thích hợp vào mỗi chỗ trống.' },
    payload: {
      passage: 'Trời đã tối {{b1}} bố vẫn chưa về. Em làm bài tập xong {{b2}} mới đi ngủ.',
      bank: [{ id: 'k1', text: 'nhưng' }, { id: 'k2', text: 'rồi' }, { id: 'k3', text: 'hoặc' }, { id: 'k4', text: 'vì' }],
    },
    key: { blanks: { b1: ['nhưng'], b2: ['rồi'] } },
    explanation: '"Nhưng" nối hai ý trái ngược; "rồi" nối hai việc nối tiếp nhau.',
  },
  {
    ...tv, id: 'ot-tv5-dau-cau', type: 'INLINE_DROPDOWN', difficulty: 'ket-noi',
    prompt: { text: 'Chọn dấu câu thích hợp cho mỗi ô.' },
    payload: {
      passage: 'Mẹ hỏi{{d1}} "Con đã làm xong bài tập chưa{{d2}}"',
      dropdowns: {
        d1: [{ id: 'o1', text: ':' }, { id: 'o2', text: '.' }, { id: 'o3', text: ',' }],
        d2: [{ id: 'o1', text: '?' }, { id: 'o2', text: '.' }, { id: 'o3', text: '!' }],
      },
    },
    key: { blanks: { d1: 'o1', d2: 'o1' } },
    explanation: 'Dấu hai chấm báo hiệu lời nói trực tiếp; câu hỏi kết thúc bằng dấu chấm hỏi.',
  },
  {
    ...tv, id: 'ot-tv5-chinh-ta', type: 'INLINE_DROPDOWN', difficulty: 'nhan-biet',
    prompt: { text: 'Chọn từ viết đúng chính tả.' },
    payload: {
      passage: 'Hôm nay trời {{d1}} chang chang, em đội {{d2}} khi đi học.',
      dropdowns: {
        d1: [{ id: 'o1', text: 'nắng' }, { id: 'o2', text: 'nắn' }, { id: 'o3', text: 'lắng' }],
        d2: [{ id: 'o1', text: 'mủ' }, { id: 'o2', text: 'mũ' }],
      },
    },
    key: { blanks: { d1: 'o1', d2: 'o2' } },
    explanation: 'Viết đúng: "nắng chang chang", "đội mũ".',
  },
];

export const ONTHI_TOAN5_ITEMS: Item[] = [
  {
    ...toan, id: 'ot-t5-cong-tp', type: 'MCQ', difficulty: 'nhan-biet',
    prompt: { text: '3,75 + 2,5 = ?' },
    payload: { columns: 2, options: [{ id: 'a', text: '6,25' }, { id: 'b', text: '5,25' }, { id: 'c', text: '6,00' }, { id: 'd', text: '4,00' }] },
    key: { correct: 'a' },
    explanation: 'Đặt thẳng hàng dấu phẩy: 3,75 + 2,50 = 6,25.',
  },
  {
    ...toan, id: 'ot-t5-viet-so', type: 'MCQ', difficulty: 'nhan-biet',
    prompt: { text: 'Số thập phân gồm 5 đơn vị và 7 phần trăm viết là:' },
    payload: { columns: 2, options: [{ id: 'a', text: '5,7' }, { id: 'b', text: '5,07' }, { id: 'c', text: '5,007' }, { id: 'd', text: '57' }] },
    key: { correct: 'b' },
    explanation: '7 phần trăm là chữ số 7 ở hàng phần trăm: 5,07.',
  },
  {
    ...toan, id: 'ot-t5-phan-tram', type: 'MCQ', difficulty: 'ket-noi',
    prompt: { text: '25% của 80 là:' },
    payload: { columns: 2, options: [{ id: 'a', text: '20' }, { id: 'b', text: '25' }, { id: 'c', text: '40' }, { id: 'd', text: '2' }] },
    key: { correct: 'a' },
    explanation: '80 × 25 : 100 = 20.',
  },
  {
    ...toan, id: 'ot-t5-lon-hon', type: 'MCQ_MULTIPLE', difficulty: 'ket-noi',
    prompt: { text: 'Chọn tất cả các số lớn hơn 2,5.' },
    payload: { columns: 2, options: [{ id: 'a', text: '2,49' }, { id: 'b', text: '2,6' }, { id: 'c', text: '2,51' }, { id: 'd', text: '2,05' }, { id: 'e', text: '3' }] },
    key: { correct: ['b', 'c', 'e'] },
    explanation: 'So sánh với 2,50: 2,60 > 2,50; 2,51 > 2,50; 3 > 2,5. Còn 2,49 và 2,05 bé hơn 2,5.',
  },
  {
    ...toan, id: 'ot-t5-phan-so-bang', type: 'MCQ_MULTIPLE', difficulty: 'ket-noi',
    prompt: { text: 'Những phân số nào bằng 1/2?' },
    payload: { columns: 2, options: [{ id: 'a', text: '2/4' }, { id: 'b', text: '3/5' }, { id: 'c', text: '5/10' }, { id: 'd', text: '4/6' }, { id: 'e', text: '6/12' }] },
    key: { correct: ['a', 'c', 'e'] },
    explanation: 'Rút gọn: 2/4 = 5/10 = 6/12 = 1/2. Còn 3/5 và 4/6 = 2/3 không bằng 1/2.',
  },
  {
    ...toan, id: 'ot-t5-dien-tich', type: 'SHORT_ANSWER', difficulty: 'nhan-biet',
    prompt: { text: 'Hình chữ nhật có chiều dài 8 cm, chiều rộng 5 cm. Diện tích hình chữ nhật là bao nhiêu?' },
    payload: { inputMode: 'numeric', unit: 'cm²' },
    key: { accepted: ['40'] },
    explanation: 'Diện tích = chiều dài × chiều rộng = 8 × 5 = 40 (cm²).',
  },
  {
    ...toan, id: 'ot-t5-nhan-10', type: 'SHORT_ANSWER', difficulty: 'nhan-biet',
    prompt: { text: '4,5 × 10 = ?' },
    payload: { inputMode: 'numeric' },
    key: { accepted: ['45'] },
    explanation: 'Nhân với 10: chuyển dấu phẩy sang phải một chữ số. 4,5 × 10 = 45.',
  },
  {
    ...toan, id: 'ot-t5-van-toc', type: 'SHORT_ANSWER', difficulty: 'ket-noi',
    prompt: { text: 'Một ô tô đi được 120 km trong 2 giờ. Vận tốc của ô tô là bao nhiêu?' },
    payload: { inputMode: 'numeric', unit: 'km/giờ' },
    key: { accepted: ['60'] },
    explanation: 'Vận tốc = quãng đường : thời gian = 120 : 2 = 60 (km/giờ).',
  },
  {
    ...toan, id: 'ot-t5-so-sanh', type: 'INLINE_DROPDOWN', difficulty: 'ket-noi',
    prompt: { text: 'Chọn dấu >, <, = thích hợp.' },
    payload: {
      passage: '4,07 {{d1}} 4,007     0,5 {{d2}} 0,50     12,3 {{d3}} 12,31',
      dropdowns: {
        d1: [{ id: 'o1', text: '<' }, { id: 'o2', text: '>' }, { id: 'o3', text: '=' }],
        d2: [{ id: 'o1', text: '<' }, { id: 'o2', text: '>' }, { id: 'o3', text: '=' }],
        d3: [{ id: 'o1', text: '<' }, { id: 'o2', text: '>' }, { id: 'o3', text: '=' }],
      },
    },
    key: { blanks: { d1: 'o2', d2: 'o3', d3: 'o1' } },
    explanation: '4,070 > 4,007; 0,5 = 0,50; 12,30 < 12,31.',
  },
  {
    ...toan, id: 'ot-t5-noi-ket-qua', type: 'MATCHING', difficulty: 'ket-noi',
    prompt: { text: 'Nối mỗi phép tính với kết quả đúng.' },
    payload: {
      left: [{ id: 'l1', text: '0,25 × 4' }, { id: 'l2', text: '3 : 4' }, { id: 'l3', text: '1,5 + 2,5' }, { id: 'l4', text: '10 − 6,5' }],
      right: [{ id: 'r1', text: '1' }, { id: 'r2', text: '0,75' }, { id: 'r3', text: '4' }, { id: 'r4', text: '3,5' }],
    },
    key: { pairs: { l1: 'r1', l2: 'r2', l3: 'r3', l4: 'r4' } },
    explanation: '0,25 × 4 = 1; 3 : 4 = 0,75; 1,5 + 2,5 = 4; 10 − 6,5 = 3,5.',
  },
  {
    ...toan, id: 'ot-t5-doi-gio', type: 'FILL_IN_PASSAGE', difficulty: 'ket-noi',
    prompt: { text: 'Kéo số thích hợp vào chỗ trống.' },
    payload: {
      passage: '1 giờ = {{b1}} phút.   2 giờ 15 phút = {{b2}} phút.   1/4 giờ = {{b3}} phút.',
      bank: [{ id: 'k1', text: '60' }, { id: 'k2', text: '135' }, { id: 'k3', text: '15' }, { id: 'k4', text: '45' }, { id: 'k5', text: '120' }],
    },
    key: { blanks: { b1: ['60'], b2: ['135'], b3: ['15'] } },
    explanation: '1 giờ = 60 phút; 2 giờ 15 phút = 120 + 15 = 135 phút; 1/4 giờ = 60 : 4 = 15 phút.',
  },
  {
    ...toan, id: 'ot-t5-doi-do-dai', type: 'FILL_IN_PASSAGE', difficulty: 'ket-noi',
    prompt: { text: 'Điền số thập phân thích hợp vào chỗ trống.' },
    payload: { passage: '3 m 5 cm = {{b1}} m' },
    key: { blanks: { b1: ['3,05'] } },
    explanation: '5 cm = 0,05 m nên 3 m 5 cm = 3,05 m.',
  },
  {
    ...toan, id: 'ot-t5-sap-xep', type: 'ORDERING', difficulty: 'ket-noi',
    prompt: { text: 'Sắp xếp các số theo thứ tự từ bé đến lớn.' },
    payload: { direction: 'horizontal', items: [{ id: 'n3', text: '0,9' }, { id: 'n2', text: '0,19' }, { id: 'n4', text: '0,91' }, { id: 'n1', text: '0,099' }] },
    key: { order: ['n1', 'n2', 'n3', 'n4'] },
    explanation: 'Viết cùng số chữ số phần thập phân: 0,099 < 0,190 < 0,900 < 0,910.',
  },
  {
    ...toan, id: 'ot-t5-ds-thap-phan', type: 'TRUE_FALSE_MULTI', difficulty: 'ket-noi',
    prompt: { text: 'Cho số thập phân 4,25. Mỗi nhận định sau đúng hay sai?' },
    payload: {
      statements: [
        { id: 'a', text: 'Chữ số 2 ở hàng phần mười.' },
        { id: 'b', text: '4,25 lớn hơn 4,3.' },
        { id: 'c', text: '4,25 = 4 + 0,25.' },
        { id: 'd', text: 'Làm tròn 4,25 đến hàng đơn vị được 5.' },
      ],
    },
    key: { truth: { a: true, b: false, c: true, d: false } },
    explanation: '4,25 có 2 ở hàng phần mười; 4,25 < 4,3; làm tròn đến hàng đơn vị được 4.',
  },
  {
    ...toan, id: 'ot-t5-ds-hinh-hop', type: 'TRUE_FALSE_MULTI', difficulty: 'van-dung',
    prompt: { text: 'Một hình hộp chữ nhật có chiều dài 5 cm, chiều rộng 3 cm, chiều cao 2 cm. Mỗi nhận định sau đúng hay sai?' },
    payload: {
      statements: [
        { id: 'a', text: 'Thể tích hình hộp là 30 cm³.' },
        { id: 'b', text: 'Diện tích mặt đáy là 15 cm².' },
        { id: 'c', text: 'Hình hộp chữ nhật có 8 mặt.' },
        { id: 'd', text: 'Chu vi mặt đáy là 16 cm.' },
      ],
    },
    key: { truth: { a: true, b: true, c: false, d: true } },
    explanation: 'Thể tích 5 × 3 × 2 = 30 cm³; mặt đáy 5 × 3 = 15 cm²; hình hộp có 6 mặt; chu vi đáy (5 + 3) × 2 = 16 cm.',
  },
];

/** Mã yêu cầu cần đạt (danh mục SKILLS) của từng câu mẫu. */
const SKILLS_OF: Record<string, string[]> = {
  'ot-tv5-dong-nghia': ['TV5.KT.TU-DA-NGHIA'], 'ot-tv5-so-sanh': ['TV3.KT.SO-SANH'], 'ot-tv5-cap-ket-tu': ['TV5.KT.CAU-GHEP'],
  'ot-tv5-l-n': ['TV1.VIET.CHINH-TA'], 'ot-tv5-s-x': ['TV1.VIET.CHINH-TA'], 'ot-tv5-tuc-ngu': ['TV5.DOC.DOC-HIEU-SAU'],
  'ot-tv5-noi-nghia': ['TV5.KT.TU-DA-NGHIA'], 'ot-tv5-noi-ve-cau': ['TV5.KT.CAU-GHEP'], 'ot-tv5-xep-cau': ['TV4.KT.CHU-VI-NGU'],
  'ot-tv5-xep-chu': ['TV1.VIET.CHINH-TA'], 'ot-tv5-xep-doan': ['TV5.DOC.DOC-HIEU-SAU'], 'ot-tv5-tu-loai': ['TV4.KT.DT-DT-TT', 'TV5.KT.DAI-TU-KET-TU'],
  'ot-tv5-nghia-chuyen': ['TV5.KT.TU-DA-NGHIA'], 'ot-tv5-keo-ket-tu': ['TV5.KT.DAI-TU-KET-TU'], 'ot-tv5-dau-cau': ['TV3.KT.DAU-HAI-CHAM'],
  'ot-tv5-chinh-ta': ['TV1.VIET.CHINH-TA'],
  'ot-t5-cong-tp': ['T5.STPPT.CONG-TRU'], 'ot-t5-viet-so': ['T5.STP.DOC-VIET'], 'ot-t5-phan-tram': ['T5.TSPT.GIA-TRI-PT'],
  'ot-t5-lon-hon': ['T5.STP.SO-SANH'], 'ot-t5-phan-so-bang': ['T5.PS.RUT-GON'], 'ot-t5-dien-tich': ['T3.DL.DIEN-TICH-HCN'],
  'ot-t5-nhan-10': ['T5.STPPT.NHAM-10'], 'ot-t5-van-toc': ['T5.DL.VAN-TOC'], 'ot-t5-so-sanh': ['T5.STP.SO-SANH'],
  'ot-t5-noi-ket-qua': ['T5.STPPT.CONG-TRU', 'T5.STPPT.NHAN'], 'ot-t5-doi-gio': ['T5.DL.THUC-TIEN'], 'ot-t5-doi-do-dai': ['T5.STP.SO-DO'],
  'ot-t5-sap-xep': ['T5.STP.SAP-XEP'], 'ot-t5-ds-thap-phan': ['T5.STP.CAU-TAO', 'T5.STP.LAM-TRON'], 'ot-t5-ds-hinh-hop': ['T5.DL.HOP-CHU-NHAT'],
};
for (const it of [...ONTHI_TV5_ITEMS, ...ONTHI_TOAN5_ITEMS]) it.skills = SKILLS_OF[it.id];

export const ONTHI_ITEMS: Item[] = [...ONTHI_TV5_ITEMS, ...ONTHI_TOAN5_ITEMS];
