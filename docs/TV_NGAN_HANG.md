# Màn hình lớp (TV), mã QR, ngân hàng câu hỏi, danh mục kĩ năng (26/11/2026)

## 1. Màn hình lớp (TV) không cần đăng nhập — SQL 21

**Lỗi cũ:**
- App màn hình lớp chạy ở địa chỉ riêng nên không có phiên đăng nhập.
- Nhập mã báo `permission denied for function find_live`.
- Bấm "Mở trên TV" thì treo ở "Đang mở lớp học…".

**Sửa** (migration `20261126000001_v2_live_screen.sql`, tệp cho SQL Editor: `21_man-hinh-lop-tv.sql`):

| Hàm | Ai gọi | Làm gì |
|---|---|---|
| `v2.find_live_screen(pin)` | khách (TV), người đã đăng nhập | Tìm phiên đang mở theo mã 6 số. Không ghi "đã vào lớp". |
| `v2.live_screen(phiên, pin, since, full)` | khách (TV), người đã đăng nhập | Trả trạng thái, bài giảng, câu hỏi (lần đầu) và câu trả lời mới. |

**Bảo vệ đáp án:**
- Câu hỏi trả về **không** kèm đáp án.
- Chỉ khi giáo viên bấm "Hiện đáp án" (`phase = reveal`), máy chủ mới gửi đáp án của câu đang chiếu.
- Đúng / sai của câu trả lời chỉ gửi lúc hiện đáp án hoặc khi đã kết thúc.

**Phạm vi:** phiên quá 12 giờ coi như đã đóng. Sai mã lớp thì không xem được.

**Phía app:**
- Link "Mở trên TV" là `…/?s=<phiên>&p=<mã lớp>`.
- TV nhập mã 6 số thì tự vào lớp, không phải bấm "Vào".
- `SupabaseScreenChannel` hỏi `live_screen` mỗi 2 giây. Nếu Realtime cho khách vào, kênh còn nghe broadcast `state` trên `live:<id>` để đổi câu ngay.
- Máy chủ chưa chạy SQL 21 thì TV báo "Quản trị trường chạy SQL 21".

**Kiểm thử:**
- pgTAP `live_screen.test.sql` (18 phép thử).
- Vitest `screenChannel.test.ts`.
- e2e `tv-ngan-hang.spec.ts`.

## 2. Mã QR to hơn

**Máy giáo viên:**
- Thẻ "QR vào lớp" to hơn (240 px).
- Nút **Phóng to QR** (hoặc bấm vào mã QR) phủ kín màn hình với mã QR khoảng 90% chiều cao màn hình và mã lớp chữ rất to.
- Bấm Esc hoặc bấm vào màn hình để thu nhỏ.
- Hợp với cách nối máy giáo viên lên TV / máy chiếu.

**TV:**
- Mã QR ở phòng chờ to hơn (44% cạnh ngắn màn hình).
- Bấm vào mã QR, hoặc phím **Q**, để phóng to toàn màn hình. Cách này dùng được cả mã QR nhỏ ở góc khi đang chơi.

## 3. Thẻ giấy (chế độ quét mã giấy)

Trang in: **Lớp học trực tiếp → In thẻ giấy cho HS** (`/truc-tiep/the-giay`).
- Chọn lớp, rồi bấm **In** (A4 dọc, tỉ lệ 100%).
- Mỗi em một thẻ theo số thứ tự trong danh sách lớp. In một lần, dùng mãi.

Lối vào khác:
- Hộp "Chơi trực tiếp" → kiểu "Thẻ giấy" → **In thẻ giấy cho lớp này**.
- Khi đang chơi thẻ giấy: nút **In thẻ giấy** trên đầu trang.

## 4. Ngân hàng câu hỏi

- Mỗi dòng có nút **Sửa** (mở thẳng trình sửa) và **Xoá** (hỏi lại trước khi xoá).
- Tích chọn nhiều câu rồi bấm **Xoá N câu**.
- Câu của thầy cô khác hoặc của bộ câu mẫu chung thì không xoá được. Máy báo rõ lí do và gợi ý dùng "Nhân bản" để có bản riêng.
- Nút **Danh mục kĩ năng** ở đầu trang.

## 5. Dán đề / tệp Word: tự nhận môn, lớp, kĩ năng

**Đầu đề** (trước Câu 1) — áp cho cả đề:
- Tiêu đề kiểu `ĐỀ … MÔN TIẾNG VIỆT – LỚP 4`, `Đố vui Lịch sử và Địa lí lớp 5`, `Toán 3`.
- Hoặc các dòng `Môn: …`, `Lớp: 5`, `Lớp: 5A2`, `Mã kĩ năng: …`.

**Dưới từng câu** — chỉ áp cho câu đó:
- Các dòng `Môn: …`, `Lớp: …`, `Kĩ năng: …`, `Mức độ: …`.

**Ghi kĩ năng:**
- Ghi mã (`LSDL5.XDBV.LY-TRAN`), dạng "mã – nội dung", hoặc **đúng tên ngắn / nội dung** của kĩ năng.
- Nhiều kĩ năng ngăn bằng dấu `;`.

**Tránh nhận nhầm:**
- Tên môn chỉ nhận ở dòng giống tiêu đề: chữ in hoa, có chữ "môn", có "lớp N", hoặc là dòng ngắn trong 3 dòng đầu.
- Bài đọc dài và chữ "bài toán" trong đề không bị nhận nhầm thành tên môn.

**Môn không dạy ở lớp đang chọn** (ví dụ chọn sẵn lớp 2 mà đề là Khoa học): máy chọn lớp gần nhất có môn đó (lớp 4).

**Màn hình soát:**
- Có dòng "Nhận ra từ đề: …".
- Hàng **Đặt cho N câu đã chọn** hiện sẵn môn, lớp chung của các câu.
- Ô gắn kĩ năng hàng loạt dùng được cho mọi môn.

## 6. Mẫu Excel / Word và danh mục kĩ năng

- Mẫu Excel câu hỏi có thêm trang **Danh mục kĩ năng** (mọi kĩ năng đang dùng) để tra mã. Cột "Mã kĩ năng" nhận mã hoặc tên kĩ năng. Ba dòng ví dụ đã điền mã.
- Mẫu Word: thêm ví dụ `Mã kĩ năng:` và hướng dẫn ghi môn, lớp, kĩ năng một lần ở đầu tệp.
- Trang **Danh mục kĩ năng** (`/ki-nang`):
  - **Xuất Excel**: toàn bộ danh mục, kể cả kĩ năng đã ẩn, kèm trang hướng dẫn.
  - **Nhập từ Excel**: thêm nhiều kĩ năng (để trống mã), sửa chữ, ẩn / hiện. Máy cho xem trước các việc (thêm mới, sửa chữ, ẩn, hiện, lỗi) rồi mới lưu.
  - Xoá dòng trong tệp **không** xoá kĩ năng; xoá ở nút thùng rác trên trang.
