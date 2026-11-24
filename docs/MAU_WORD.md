# Nhập câu hỏi từ Word — đủ các dạng

Ngân hàng câu hỏi → **Thêm nhanh nhiều câu** → **Từ tệp Excel / Word** → **Tải mẫu Word (đủ các dạng)**.
Tệp mẫu có phần hướng dẫn và 18 câu ví dụ (đủ 16 dạng). Xoá câu ví dụ, soạn câu của mình, lưu .docx rồi tải lên → soát → lưu.

Mỗi câu: `Câu N: <đề>` (gõ số bằng tay, không dùng đánh số tự động) rồi dòng `Dạng: <tên dạng>`, mỗi ý một dòng.

| Dạng | Cách viết |
|---|---|
| Chọn 1 đáp án / Chọn nhiều đáp án | `A. …` `B. …` + `Đáp án: B` (nhiều: `Đáp án: A, C`); hoặc tô đậm / gạch chân lựa chọn đúng |
| Đúng – Sai | `Đáp án: Đúng` hoặc `Sai` |
| Điền ngắn | `Đáp án: 24` (nhiều cách đúng: `0,5; 1/2`) + `Đơn vị: cm` |
| Nối cặp | `A. vế trái = vế phải` (hoặc `→`, `|`) |
| Sắp xếp thứ tự | `A. B. C.` ghi theo ĐÚNG thứ tự (hoặc thêm `Đáp án: B, A, C`) |
| Kéo thả vào ô | `Ô Nên làm: thẻ 1, thẻ 2` (mỗi ô một dòng) |
| Phân loại từ | `Nhóm Từ chỉ sự vật: quyển vở, cái bàn` |
| Sắp xếp câu | `Câu đúng: Em / đi học / đúng giờ / .` |
| Điền vào đoạn văn | `Đoạn văn: … cây cối [đâm] chồi …` (nhiều cách đúng `[đâm|nảy]`) + `Kho từ: rụng, khô` (tuỳ chọn, thêm từ nhiễu) |
| Chọn trong câu | `Đoạn văn: My name [am|*is|are] Mai.` (dấu `*` trước lựa chọn đúng) |
| Nghe và chọn | `Đọc cho HS nghe: con mèo` (+ `Giọng: Tiếng Anh`) + `A. B. C.` + `Đáp án: A` |
| Chạm vào hình | đề + `Vùng đúng: …` (ghi chú); ảnh và vùng chạm thêm ở bước soát (**Sửa chi tiết**) |
| Vẽ và tô | chỉ cần đề |
| Ghi âm đọc to | `Đoạn đọc: …` + `Thời gian: 30` (giây) |
| Đồ dùng toán | `Que tính: 26 + 7` (+ `Lựa chọn: 31, 33, 23`) hoặc `Đồng hồ: 3 giờ 30 phút` |
| Thăm dò ý kiến | `A. B. C.` (không có đáp án) |

Dòng chung: `Gợi ý:`, `Giải thích:`, `Mức độ: Nhận biết | Kết nối | Vận dụng`, `Môn:`, `Lớp: 1–5`, `Mã kĩ năng:`, `Ghi chú:` (bỏ qua).
Ô **Dán văn bản** hiểu cùng cách viết. Đề kiểu cũ (không có dòng `Dạng:`) vẫn đọc như trước.

Mã: `packages/data/src/import/typedBlock.ts`, `wordTemplate.ts`. Kiểm thử: `__tests__/wordTemplate.test.ts`, `e2e/mau-word.spec.ts`.

## Môn học theo lớp (CT GDPT 2018, Thông tư 32/2018 — SQL 17)
| Môn | Lớp | Kiểm tra định kì (TT27) |
|---|---|---|
| Tiếng Việt, Toán | 1–5 | có |
| Tiếng Anh (Ngoại ngữ 1) | 3–5 bắt buộc · 1–2 tự chọn | lớp 3–5 |
| Đạo đức | 1–5 | — |
| Tự nhiên và Xã hội | 1–3 | — |
| Lịch sử và Địa lí, Khoa học | 4–5 | có |
| Tin học, Công nghệ (tách từ "Tin học và Công nghệ") | 3–5 | có |
| Giáo dục thể chất, Âm nhạc, Mĩ thuật, Hoạt động trải nghiệm | 1–5 | — |
| Khác | mọi lớp | — |

**Ô chọn môn hiện theo lớp đang chọn** (hàm `subjectOptionsFor(grade, present)` trong `packages/contracts/src/subjects.ts`):
- Bộ lọc Ngân hàng, Bài giảng, hộp chọn hoạt động: chọn lớp → chỉ hiện môn của lớp; môn đang lọc không có ở lớp mới → về "Mọi môn".
- Tạo bài giảng, Thêm nhanh nhiều câu, AI tạo bài từ SGK, ma trận đề, tiêu chí chấm: đổi lớp → môn tự chuyển sang môn đầu tiên của lớp
  nếu môn cũ không có (`fitSubjectToGrade`).
- Sửa câu hỏi / bài giảng có sẵn: môn đang có được giữ, hiện nhãn "(không thuộc lớp N)" để GV tự quyết.
- Bước soát khi nhập: câu có môn không thuộc lớp được nhắc (không chặn lưu).
- Tiếng Anh lớp 1–2 hiện nhãn "(tự chọn)" và không có ô điểm KTĐK.
- **Bản đồ kiến thức của lớp — nút "Chọn môn"**: mỗi GV tự tích các môn mình dạy (trong các môn của lớp theo CT 2018).
  Lưu theo tài khoản GV + lớp, **đồng bộ giữa các máy** qua bảng `v2.user_prefs` (SQL 18, `packages/data/src/prefs`);
  chưa chạy SQL 18 / bản demo → lưu trên trình duyệt. Nhớ cả môn xem lần trước.
  Mặc định: các môn GVCN thường dạy (lớp 1–2: TV, Toán, TN&XH · lớp 3: + Tiếng Anh · lớp 4–5: TV, Toán, TA, LS&ĐL, Khoa học).
  Trên 5 môn → ô chọn dạng danh sách. Kiểm thử: `e2e/ban-do-mon.spec.ts`, `supabase/tests/database/user_prefs_skills.test.sql`.

## Danh mục kĩ năng các môn (SQL 18)
- Toán: yêu cầu cần đạt nguyên văn (`skills-toan.ts`).
- 12 môn còn lại: **386 kĩ năng theo chủ đề / mạch nội dung CT GDPT 2018** (`packages/contracts/src/skills-ct2018.ts`, mạch `CHU-DE`),
  mô tả **tóm lược** yêu cầu cần đạt — đánh dấu `provisional` ("kĩ năng tạm"). Tổ chuyên môn đối chiếu văn bản chương trình rồi sửa
  `text` / `short` (GIỮ `code`), chạy `node tools/gen-sql18.mjs` và `node tools/gen-skills-sql.mjs` để sinh lại SQL.
- Mã: `<MÔN><lớp>.<CHỦ-ĐỀ>.<SLUG>` — TV, TA, DD, TNXH, LSDL, KH, TH (Tin học), CN, GDTC, AN (Âm nhạc), MT, HDTN. Ví dụ `KH4.NL.ANH-SANG`.
- Gắn vào câu hỏi qua cột / dòng "Mã kĩ năng" khi nhập Word/Excel, hoặc ô Kĩ năng khi soạn câu.
- Bản đồ khối và ma trận đề chỉ hiện môn có KTĐK của khối.

Nhận xét TT27 liệt kê mọi môn của lớp; ô điểm kiểm tra định kì chỉ ở các môn có KTĐK của lớp đó.
Muốn ẩn một môn trường không dạy: đặt `retired: true` cho môn đó trong `subjects.ts` (dữ liệu cũ vẫn đọc được).
