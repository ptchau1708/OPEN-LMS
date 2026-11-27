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

## Giai đoạn tiếp theo

App giáo viên: gom thanh bên thành 5 nhóm, ô tìm nhanh Ctrl+K, Tổng quan "Việc hôm nay".
