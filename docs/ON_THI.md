# Ôn thi — luyện các dạng câu kiểu Trạng Nguyên và Đấu trường VioEdu

Hai trang luyện trong app học sinh, dành cho **cả khối**:

- **Ôn thi Trạng Nguyên** (mặc định Tiếng Việt): mỗi câu 10 điểm, câu nhiều ý phải **đúng hết** mới được điểm, bảng câu để nhảy qua lại, mức đạt mặc định 80% (30 câu → 240/300).
- **Ôn thi Đấu trường VIOEDU** (mặc định Toán): mỗi câu 1 điểm, sai không trừ, **mỗi lần một câu** có nút *Bỏ qua* (hết lượt đầu máy đưa em quay lại câu đã bỏ), thanh nhịp thời gian, nhãn "(Có thể chọn nhiều đáp án)", câu Đúng – Sai nhiều ý tính điểm lũy tiến.

Chỉ mô phỏng **dạng câu và cách chấm**. Không chép đề, cấu trúc vòng thi, tên trò chơi, hình ảnh hay logo của các sân chơi. Các câu mẫu trong chế độ demo do OPEN-EDU tự soạn.

## Học sinh

| Đường dẫn | Nội dung |
|---|---|
| `/on-thi` | Cổng: hai thẻ Trạng Nguyên / VIOEDU (lối vào ở ô "Ôn thi" trang Nhà và dải trên trang Chơi) |
| `/on-thi/trang-nguyen`, `/on-thi/vioedu` | Danh sách bài luyện của khối em (khóa theo thứ tự nếu thầy/cô bật), Luyện theo dạng, bảng xếp hạng |
| `/on-thi/:kieu/bai/:setId` | Màn quy định (kiểu Trạng Nguyên có ô gõ thử chữ có dấu, báo Caps Lock) → phòng làm bài (tự lưu, hết giờ tự nộp) |
| `/on-thi/:kieu/ket-qua/:attemptId` | Điểm, Đạt/Chưa đạt, thời gian, đúng/sai/bỏ qua, theo dạng câu, bảng xếp hạng, xem lại từng câu (đáp án + giải thích nếu thầy/cô cho xem) |
| `/on-thi/:kieu/dang/:type` | Luyện theo dạng: tối đa 10 câu cùng dạng (lấy từ các bài luyện đã mở cho khối), biết đúng sai ngay, không tính hạng |

Bảng xếp hạng: lần làm tốt nhất của mỗi em, xếp theo **điểm → thời gian → số câu sai**. Học sinh thấy 10 bạn đầu và vị trí của mình; thầy/cô tắt được.

## Thầy/cô (app giáo viên → Ôn thi)

1. **Tải tệp Word mẫu** (theo kiểu đang chọn): `mau-on-thi-trang-nguyen.docx` hoặc `mau-on-thi-vioedu.docx`. Mỗi tệp là **một bài luyện**.
2. Soạn câu theo đúng cách viết trong mẫu (mỗi câu "Câu N:" + "Dạng: …"), ghi "Môn:", "Lớp:" một lần ở đầu tệp.
3. **Tạo bài từ tệp Word** → chọn tệp → soát từng câu (Sẵn sàng / Thiếu đáp án / Cần sửa) → đặt tên, thời gian, điểm mỗi câu, mức đạt, khóa thứ tự, bảng xếp hạng, cho xem đáp án → *Tạo bài luyện*. Câu được lưu vào Ngân hàng câu hỏi (nhãn `onthi:tn` / `onthi:vio`) theo đúng thứ tự trong tệp.
4. **Kết quả**: học sinh cả khối (người tạo bài / quản trị) hoặc lớp mình dạy; tỉ lệ đúng theo câu (tô cam 3 câu nhiều em sai nhất). *Sửa bài luyện*: đổi cài đặt, sắp xếp / bỏ câu, thêm câu từ ngân hàng, lưu nháp.

### Cách viết các dạng mới trong tệp Word

```
Câu 7: Cho số thập phân 4,25. Mỗi nhận định sau đúng hay sai?
Dạng: Đúng – Sai nhiều ý
a) Chữ số 2 ở hàng phần mười.
b) 4,25 lớn hơn 4,3.
c) 4,25 = 4 + 0,25.
d) Làm tròn 4,25 đến hàng đơn vị được 5.
Đáp án: Đ, S, Đ, S
```
(hoặc ghi `(Đ)` / `(S)` ở cuối từng nhận định thay cho dòng Đáp án)

```
Câu 8: Xếp các từ vào đúng nhóm từ loại. Có từ không thuộc nhóm nào.
Dạng: Phân loại từ
Nhóm Danh từ: dòng sông, quyển sách
Nhóm Động từ: suy nghĩ, chạy nhảy
Thẻ nhiễu: và, nhưng
```
"Điền vào đoạn văn" có dòng `Kho từ:` thì học sinh **kéo từ vào chỗ trống**; không có thì học sinh **gõ** vào chỗ trống.

## Dạng câu mới / thay đổi

| Dạng | Thay đổi |
|---|---|
| `TRUE_FALSE_MULTI` (Đúng – Sai nhiều ý) | 2–6 nhận định, mỗi nhận định chọn Đúng/Sai. `correct` khi đúng hết; `score` lũy tiến với 4 ý: 0,2 / 0,4 / 0,65 / 1 (số ý khác 4: chia đều). Có trình soạn, in đề, đáp án dạng chữ, đọc từ Word. |
| `WORD_CLASSIFY` + `payload.distractors` | Thẻ nhiễu = thẻ không có trong `key.placement`; đúng khi để lại khay. Không bắt buộc xếp hết thẻ mới được nộp. Trình soạn có ô "Có thẻ nhiễu". |

## Chấm điểm (`packages/data/src/onthi/scoring.ts`, Edge Function `grade/onthi.ts`)

- Câu chưa làm xong (`isComplete` = false) tính là **bỏ qua**, không tính là sai.
- Mỗi câu: cả-hoặc-không (`correct ? points : 0`). Riêng kiểu VioEdu + Đúng – Sai nhiều ý: `score × points`.
- Thời gian làm bài = lúc nộp (tối đa hạn giờ) − lúc bắt đầu, theo giờ máy chủ.

## Dữ liệu (SQL 26 — `supabase/migrations/20261129000001_v2_on_thi.sql`)

- Thêm `TRUE_FALSE_MULTI` vào ràng buộc `v2.items.type` và hàm `v2._upsert_item`.
- Bảng `v2.onthi_sets`, `v2.onthi_attempts`, `v2.onthi_answers` (RLS bật, không cấp quyền bảng cho `authenticated` — chỉ qua RPC).
- RPC thầy/cô: `onthi_sets_list`, `onthi_set_save`, `onthi_set_delete`, `onthi_report`.
- RPC học sinh: `onthi_my_cards`, `onthi_start` (lần đang làm đã quá giờ → trả `overdueAttemptId` để nộp hộ rồi mở lại), `onthi_save_answer`, `onthi_result`, `onthi_board`, `onthi_practice_types`, `onthi_practice_items`.
- Chỉ service role: `onthi_record_results` (Edge Function `grade`, action `onthi-finalize`).
- Khối của học sinh: `profiles.grade`, không có thì lấy khối của lớp.

## Triển khai

1. Chạy `supabase-sql/26_on-thi.sql` trong SQL Editor của Supabase.
2. Chạy `trien-khai-ham.bat` (hàm `grade` có action mới và mã chấm dạng mới; các hàm khác dùng chung `_shared/scoring`).
3. Chạy `day-len-github.bat`, rồi Ctrl+Shift+R trên app.

## Kiểm thử

- `packages/activity-engine`: `TRUE_FALSE_MULTI/score.test.ts`, thẻ nhiễu trong `WORD_CLASSIFY/score.test.ts`.
- `packages/data`: `onthi.test.ts` (chấm, xếp hạng, khóa thứ tự, dịch vụ demo), `wordTemplate.test.ts` (mẫu Word Ôn thi đọc lại đủ câu).
- pgTAP: `supabase/tests/database/on_thi.test.sql`.
- e2e: `e2e/on-thi.spec.ts` (học sinh hai kiểu, luyện theo dạng, điện thoại; giáo viên tạo bài từ tệp Word mẫu, kết quả, sửa mức đạt).
