# Giao diện mới — app học sinh (giai đoạn 0 + 1)

Hướng: kết hợp hoạt hình tươi vui, phiêu lưu kiểu game và hiện đại tối giản. Ưu tiên điện thoại (Android, iPhone).

## Bảng màu "Trời quê" (`packages/ui/src/tokens.css`)

Tươi sáng, nhẹ nhàng, chắc khỏe. Ít hồng/tím; màu đậm chỉ dùng cho hành động và phần thưởng.

| Tên | Mã | Dùng cho |
|---|---|---|
| Trời `--k-sky` | `#2d7ff9` | hành động chính, liên kết, tab Nhà |
| Sông `--k-sea` | `#0b9494` | tiến độ, tab Học, "Tưới cây" |
| Nắng `--k-sun` | `#ffb31a` | sao, phần thưởng, nhãn "Mới" |
| Lúa `--k-ok` | `#1ea566` | đúng, nút "Bắt đầu" |
| Mực `--k-navy` | `#15294a` | chữ, thẻ "Vào lớp trực tiếp" |
| Mây `--k-bg` | `#edf5ff` | nền trang |

Chữ trắng trên nút màu đạt tối thiểu 3:1 (chữ lớn, đậm); chữ thường trên nền sáng đạt 4.5:1.

## Trang Nhà: "Bầu trời hôm nay" (`apps/learner/src/components/KiteSky.tsx`)

- Con diều bay cao dần theo số nhiệm vụ em đã làm xong (0/3 → diều sát đồng lúa; xong hết → diều lên đỉnh, linh vật reo).
- Trời đổi theo buổi: sáng (mặt trời mọc), trưa, chiều (nắng cam), tối (trăng, sao).
- Ô sao và chuỗi ngày học nằm góc phải bầu trời; dải trắng bên dưới là lời linh vật + nút nghe đọc.
- Thẻ nhiệm vụ gọn hơn (tiêu đề tối đa 2 dòng), "Vào lớp trực tiếp" thành thẻ ngang màu mực, các lối tắt (Vườn lớp, Thảo luận, Ứng dụng học) thành ô vuông.

## Tương tác

- **Sao về túi** (`StarFly.tsx`): sao kiếm được ở bài học, tháp, đấu… bay vào ô đếm sao khi em về trang có ô đếm (Nhà, Học, Chơi, Quà), kèm "+N", tiếng "ting" và rung nhẹ. Mỗi phần thưởng chỉ bay một lần.
- **Rung nhẹ** (`haptic()` trong `sfx.ts`): khi trả lời đúng, chưa đúng, nhận sao, hoàn thành bài. Chỉ có trên Android (iPhone không cho trang web rung). Đi theo cài đặt "Âm thanh và rung" ở trang Tôi.
- **Thanh tab** nổi cách mép, kính mờ nhẹ, chừa vùng an toàn của tai thỏ / thanh vuốt.
- **Giảm chuyển động**: diều, mây, sao đều dừng khi bật cài đặt này hoặc khi máy đặt "giảm chuyển động".

## Trang khác

- **Đấu trường** trên điện thoại: hình nhỏ nổi bên phải, chữ chảy quanh, không bị dồn vào cột hẹp.
- **Tôi → Kỹ năng của em**: mỗi môn là một dòng gọn (số cây nở hoa / đang lớn / cần tưới / hạt giống + thanh màu). Chỉ mở sẵn môn có cây cần tưới; bấm để mở môn khác.
- **Kệ huy hiệu**: mỗi kệ có "đã có/tổng", huy hiệu đã có xếp trước; trên điện thoại mỗi kệ là một hàng vuốt ngang.

## Linh vật mới (SQL 25)

| Bạn | Nước | Lời chào | Mở khóa |
|---|---|---|---|
| Sư tử Leo | Kenya | Jambo! | 650 sao |
| Gấu Tuyết | Canada | Hello! Bonjour! | 780 sao |
| Cánh Cụt Pip | Ác-hen-ti-na | ¡Hola! | 920 sao |
| Lạc đà Sa Sa | Ai Cập | Ahlan! | 1080 sao |

Triển khai: chạy `25_linh-vat-moi.sql` trong SQL Editor (thêm 4 dòng vào `v2.mascots`). Chưa chạy thì app vẫn chạy, chỉ chưa mở khóa được 4 bạn mới.

# App giáo viên (giai đoạn 3)

## Thanh bên theo nhóm (`apps/teacher/src/lib/nav.ts`, `components/Layout.tsx`)

"Tổng quan" ở trên cùng, rồi 5 nhóm bấm để thu gọn / mở:

| Nhóm | Mục |
|---|---|
| Dạy học | Bài giảng, Ngân hàng câu hỏi, Danh mục kĩ năng, Trang học, Trực tiếp, Đấu trường |
| Giao & chấm | Giao bài, Báo cáo bài giao, Chấm bài, Bài viết, Đề kiểm tra, Tiêu chí chấm, Nhận xét TT27 |
| Lớp & học sinh | Lớp học, Hồ sơ học sinh, Kiến thức, Điểm danh, Thi đua, Vườn lớp & huy hiệu |
| Kết nối | Phụ huynh, Thảo luận |
| Trường & thiết lập | Báo cáo, Xuất / nhập dữ liệu, (quản trị) Quản lí lớp, Tài khoản, Năm học & kì, Ứng dụng kết nối |

- Máy nhớ nhóm nào thầy/cô thu gọn. Nhóm chứa trang đang xem luôn mở. "Trường & thiết lập" thu gọn sẵn với giáo viên, mở sẵn với quản trị.
- Số việc hiện cạnh mục: **Chấm bài** (bài viết chờ chấm/duyệt), **Phụ huynh** (tin chưa đọc + mục chờ duyệt gửi), **Điểm danh** (lớp chưa điểm danh hôm nay). Nhóm đang thu gọn hiện tổng số việc bên trong.
- Màu nhấn đổi sang xanh trời đậm `#1f63cf`, cùng họ màu với app học sinh.

## Tìm nhanh — Ctrl+K (⌘K trên Mac)

- Mở bằng Ctrl+K ở mọi trang, nút "Tìm nhanh…" trên thanh bên, hoặc biểu tượng kính lúp trên điện thoại.
- Gõ không dấu cũng được ("diem danh", "ngoc lan", "phan so").
- Tìm được: việc cần làm, thao tác nhanh (soạn bài, mở lớp trực tiếp, giao bài, gửi phụ huynh, điểm danh, ghi thi đua, ra đề…), mọi trang, lớp, học sinh, bài giảng.
- ↑ ↓ chọn, Enter mở, Esc đóng.

## Tổng quan: "Việc hôm nay" (`lib/todayWork.tsx`)

Ngay dưới lời chào, gộp cho mọi lớp của thầy/cô:

- bài viết chờ chấm hoặc duyệt → Chấm bài;
- lớp chưa điểm danh hôm nay (thứ Hai – thứ Sáu) → Điểm danh;
- tin nhắn phụ huynh chưa đọc → Phụ huynh / Tin nhắn;
- mục chờ duyệt để gửi phụ huynh → Phụ huynh / Chờ duyệt;
- bài giao hết hạn trong 2 ngày → Báo cáo bài giao.

Mỗi việc là một ô bấm tới đúng chỗ cần làm; việc đã ổn gom thành một dòng "Đã ổn: …". Dạy nhiều lớp thì ô ghi số theo từng lớp.
Chưa chạy SQL 23 thì phần tin nhắn / chờ duyệt phụ huynh tính là 0, các phần khác vẫn chạy.
