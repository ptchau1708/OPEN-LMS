# Nhận xét TT27 & thông tin bổ sung trong hồ sơ học sinh (SQL 20)

## Trang Nhận xét TT27
- **Môn hiển thị** (`Tt27ColumnsDialog`): GV tích môn mình dạy; lưu theo tài khoản + lớp (`user_prefs` khoá `tt27-mon.<lớp>`).
  Mặc định: các môn bắt buộc của lớp (môn tự chọn — Tiếng dân tộc thiểu số, Tiếng Anh lớp 1–2 — tự bật). Môn ẩn chỉ không hiện cột,
  dữ liệu đã nhập vẫn giữ.
- **Ngân hàng nhận xét** (`v2.comment_bank`, `packages/data/src/commentbank`):
  - Bấm vào ô nhận xét → gợi ý câu hay dùng (cùng môn, cùng mức trước); gõ vài chữ → lọc theo phần đang gõ dở (không cần dấu);
    chọn bằng chuột hoặc ↑ ↓ Enter. Ô đã có nhận xét → câu được nối thêm, không xoá câu cũ (`components/CommentInput.tsx`).
  - Bấm Lưu nháp / Chốt → câu mới hoặc đã sửa tự vào ngân hàng (trùng → tăng số lần dùng). Bỏ qua câu < 8 kí tự và câu có tên
    riêng của học sinh (so khớp giữ dấu: “An” ≠ “ăn”). Tắt được trong hộp Ngân hàng nhận xét.
  - Hộp **Ngân hàng nhận xét**: xem theo môn / nhận xét chung, thêm, sửa, xoá, đặt mức, **chia sẻ** cho GV khác trong trường.
  - Chưa chạy SQL 20 → ngân hàng lưu trên trình duyệt.
- **Nhập chung cho nhiều em**: nút trên thanh công cụ chọn cả lớp (hoặc tích từng em ở cột đầu) → đặt mức, nhận xét môn,
  phẩm chất & năng lực, nhận xét chung một lần (ô nhận xét có gợi ý từ ngân hàng). Bỏ tích những em khác biệt trước khi áp dụng.

## Hồ sơ học sinh — Thông tin bổ sung (`v2.student_notes`, `packages/data/src/notes`)
- Dữ liệu GV thu thập bên ngoài: quan sát, kết quả học tập bên ngoài, sức khoẻ, gia đình, năng khiếu, khen thưởng, khác.
- **Nhập tay**: tiêu đề, nhóm, ngày, nội dung + các mục dạng bảng (Chiều cao: 132 cm…).
- **Nhập từ Word** (từng em): chọn tệp .docx → nội dung điền sẵn để GV đọc lại rồi lưu.
- **Nhập Excel cả lớp** (trang Hồ sơ học sinh → “Nhập thông tin từ Excel”): tải tệp mẫu có sẵn danh sách lớp, đổi / thêm cột tuỳ ý;
  ghép học sinh theo Tên đăng nhập → Mã HS → Họ và tên; xem trước dòng chưa ghép (trùng tên / không có); mỗi em → một ghi chép.
  Cột “Ghi chú / Nội dung / Nhận xét” → nội dung; cột khác → dữ liệu.
- Quyền (RLS): chỉ GV của em + quản trị xem / sửa / xoá; **phụ huynh chỉ thấy ghi chép được tích “Cho phụ huynh xem”**
  (hiện ở trang phụ huynh, mục “Thầy/cô ghi chép”); học sinh không xem. Khi in hồ sơ, ghi chép không chia sẻ không được in.

## Kiểm thử
`e2e/tt27-ho-so.spec.ts` (3), `packages/data/src/__tests__/tt32Notes.test.ts`, `supabase/tests/database/tt32_notes_bank.test.sql` (26).
