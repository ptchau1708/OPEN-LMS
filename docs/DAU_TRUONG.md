# Đấu trường: giải đấu loại trực tiếp, cài đặt lớp, bảng xếp hạng theo mùa (SQL 22)

Migration `20261126000002_v2_arena_cup.sql`. Tệp dán vào Supabase SQL Editor: `22_dau-truong-giai-dau.sql`.
- Chạy sau SQL 21.
- Không cần triển khai lại hàm Edge: câu trả lời trong trận giải được chấm bằng hàm `grade` có sẵn, giống Đấu 1–1.

## 1. Giải đấu loại trực tiếp (GV mở)

**Mở giải:** GV vào **Đấu trường → Mở giải đấu**, hoặc **Ngân hàng câu hỏi → tích câu → Đưa vào Đấu trường → Mở giải đấu với các câu này**.

**Tuỳ chọn khi mở giải:**

| Tuỳ chọn | Giá trị |
|---|---|
| Phạm vi | Trong lớp · Cả khối (mọi lớp cùng khối, tối đa 256 HS) |
| Câu hỏi | Tự động theo môn / khối · Các câu vừa chọn · Bộ câu Đấu trường của lớp |
| Số câu mỗi trận | 3 · 5 · 7 · 10 (20 giây / câu) |
| Người tham gia | Tất cả HS · HS tự đăng kí (trên app, trước giờ bắt đầu) |
| Bắt đầu | Ngay · Hẹn giờ |
| Nhịp | Vòng sau mở ngay khi vòng trước xong (đấu trên lớp) · Mỗi ngày một vòng (đấu ở nhà) |
| Thời gian mỗi vòng | 5 phút … cả ngày |
| Hạt giống | Bốc thăm · Theo mức thành thạo môn |

**Nhánh đấu:**
- Số chỗ trong nhánh làm tròn lên luỹ thừa của 2.
- Thiếu người thì các hạt giống cao được **miễn đấu** vòng 1.
- Hạt giống 1 và 2 ở hai nửa nhánh nên chỉ có thể gặp nhau ở chung kết.

**Một trận:**
- Hai bạn làm **cùng bộ câu**, không cần vào cùng lúc. Lỡ thoát ra thì vào lại làm tiếp từ câu chưa làm.
- Ai đúng nhiều hơn thì thắng. Bằng nhau thì xét điểm tốc độ, rồi tổng thời gian ít hơn, rồi hạt giống cao hơn.
- Các vòng sau ưu tiên câu mà hai bạn chưa gặp.

**Hết giờ vòng:**
- Bạn đã đấu thắng bạn chưa đấu.
- Cả hai chưa đấu thì hạt giống cao hơn đi tiếp.
- GV có thể **Kết thúc vòng ngay** hoặc **Chọn người thắng** cho từng trận.

**Thưởng:**
- Mỗi trận: thắng 2 sao, thua nhưng đã đấu 1 sao.
- Cuối giải: Vô địch 10 sao, Á quân 6 sao, mỗi bạn đồng Hạng ba 4 sao (hai bạn thua bán kết).
- Ba hạng đầu nhận **cúp** (huy hiệu hình cúp, có tên giải) và có giấy khen in được.

**Màn hình:**
- GV: nhánh đấu từng vòng, ai đã đấu xong, kết quả số câu đúng, danh sách HS, nút "Chiếu lên TV" (toàn màn hình, tự cập nhật 5 giây).
- HS: tab **Đấu trường** có mục "Giải đấu" với trạng thái của em (Đấu ngay / Chờ bạn / Em vào bán kết…) và nhánh đấu từng vòng.

**Bản demo:** mô phỏng kết quả của các bạn khác, để thầy cô và học sinh xem được trọn một giải.

## 2. Cài đặt Đấu trường của lớp (chơi tự do)

Vào **Đấu trường → Cài đặt**:
- **Bật / tắt** Đấu trường của lớp.
- **Kiểu chơi:** Đấu 1–1, Leo tháp.
- **Đấu 1–1 ghép với ai:** trong lớp, hoặc cả khối (lớp bạn kia cũng phải chọn cả khối).
- **Câu hỏi:** tự động theo môn / khối, hoặc chỉ câu GV đã "Đưa vào Đấu trường". Bộ câu xem và bớt được ngay ở trang Cài đặt.
- **Giờ mở cửa** (giờ Việt Nam):
  - nhiều khung giờ theo thứ trong tuần;
  - có mẫu sẵn "Trong giờ học", "Buổi tối", "Cuối tuần";
  - không có khung nào nghĩa là luôn mở.
  - Ngoài giờ, HS thấy "Đấu trường đang nghỉ, mở lại lúc …" nhưng vẫn xem được giải đấu và bảng xếp hạng.

**Máy chủ kiểm tra lại khi tạo, ghép hoặc vào trận Đấu 1–1.** Leo tháp chỉ kiểm tra trên app, vì đây là phần tự luyện.

## 3. Bảng xếp hạng theo mùa

**Điểm:**
- Đấu 1–1 với bạn: thắng 3, hoà 1. Mỗi ngày chỉ tính 5 trận đầu.
- Thắng Robo: 1.
- Giải đấu: mỗi trận thắng 3; Vô địch +10, Á quân +6, Hạng ba +4.

**Ai thấy gì:**
- HS chỉ thấy **top 10** (những bạn có điểm) và **vị trí của mình**.
- GV thấy cả lớp.

**Kết thúc mùa** (thẻ Bảng xếp hạng):
- Đặt tên mùa.
- 3 hạng đầu nhận sao (10 / 6 / 4) và cúp.
- Top 10 được lưu để in giấy khen.
- Mùa mới tính lại từ 0.

## 4. Giấy khen

Trang `/dau-truong/giay-khen`, in A4 ngang, mỗi em một trang.

| Nguồn | Đường dẫn | Người được khen |
|---|---|---|
| Một giải | `?giai=<id>` | Vô địch, Á quân, Hạng ba |
| Mùa đang diễn ra | `?lop=<lớp>&mua=hien-tai` | Top 10 |
| Mùa đã kết thúc | `?lop=<lớp>&mua=<id mùa>` | Top 10 |

- Sửa được: tên trường, địa danh và ngày, chức danh và họ tên người kí.
- Bỏ tích những em không in.

## 5. Kĩ thuật

**Bảng mới:**
- `v2.arena_settings`
- `v2.arena_seasons`
- `v2.cups`, `v2.cup_players`, `v2.cup_matches`

Các bảng giải đấu bật RLS nhưng không có policy; đọc và ghi đều qua hàm.

**Mỗi trận giải là một dòng `v2.duels`** với `mode = 'cup'`:
- câu trả lời ghi qua Edge Function `grade` (có `duelId`, `duelQ`);
- `duel_finish` từ chối trận giải (hàm gốc đổi tên thành `_duel_finish_core`, hàm mới bọc thêm bước kiểm tra);
- kết quả tính trong `_cup_decide`.

**Tiến trình giải** (`_cup_tick`) không cần lịch chạy nền: hàm chạy mỗi khi có người xem giải, đấu xong, hoặc GV thao tác. Mỗi lần chạy, hàm:
- bắt đầu giải đúng giờ;
- quyết định các trận đã xong hoặc đã hết giờ;
- mở vòng sau;
- kết thúc giải và trao thưởng.

**Đấu 1–1 tự do theo cài đặt lớp:** `_duel_new`, `duel_seek`, `duel_join`, `_duel_pick_items`.

**Logic nhánh đấu bên app:** `packages/data/src/arena/bracket.ts`, giống SQL; bản demo dùng trực tiếp.

**Kiểm thử:**
- pgTAP `arena_cup.test.sql` (44 phép thử).
- Vitest `arena.test.ts`.
- e2e `dau-truong.spec.ts`.
