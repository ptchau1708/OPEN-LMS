# Đăng nhập chung

Mọi người đăng nhập ở **một địa chỉ**: địa chỉ app học sinh (ví dụ `https://openedu.vercel.app` hoặc `https://hoc.truong.edu.vn`).

| Ai đăng nhập | Đi đâu |
|---|---|
| Học sinh | Ở lại Góc học tập (trang Hôm nay) |
| Phụ huynh | Ở lại, vào trang Phụ huynh |
| Giáo viên, quản trị | **Tự chuyển** sang Bàn làm việc giáo viên, đã đăng nhập sẵn (không gõ lại mật khẩu) |

Ngược lại, học sinh / phụ huynh lỡ đăng nhập ở địa chỉ app giáo viên cũng được tự chuyển về Góc học tập.
Địa chỉ app giáo viên vẫn đăng nhập trực tiếp được như cũ.

## Cần cài
- Dự án Vercel **học sinh**: biến `VITE_TEACHER_URL` = địa chỉ app giáo viên.
- Dự án Vercel **giáo viên**: biến `VITE_LEARNER_URL` = địa chỉ app học sinh.
Đổi biến xong phải Redeploy.

## Cách hoạt động (an toàn)
- Phiên được chuyển trong phần `#oe_s=…` của địa chỉ. Trình duyệt **không gửi** phần sau dấu `#` lên máy chủ nào
  (kể cả Vercel). App nhận đọc xong **xóa ngay** khỏi thanh địa chỉ và lịch sử trình duyệt.
- Chỉ chuyển tới địa chỉ cố định trong biến môi trường, không chuyển tới địa chỉ lấy từ đường link.
- App chuyển đi **bỏ phiên của mình** (không thu hồi trên máy chủ) để hai app không dùng chung một refresh token
  (Supabase sẽ coi việc dùng lại token cũ là bị đánh cắp và thu hồi cả phiên).
- Mã: `packages/data/src/handoff.ts`, `sessionPack.ts`; `exportSession` / `importSession` trong hai nguồn dữ liệu.
- Kiểm thử: `packages/data/src/__tests__/handoff.test.ts`, `e2e/login-chung.spec.ts` (hai app thật, chế độ demo).
  ⚠ Chưa chạy với project Supabase thật.

## Lưu ý
- Giáo viên đã sang app giáo viên thì app học sinh trên máy đó không còn đăng nhập (muốn xem thử góc học sinh thì
  dùng tài khoản học sinh).
- Muốn địa chỉ dễ nhớ: đặt tên dự án học sinh là `openedu` (→ `openedu.vercel.app`) hoặc gắn tên miền riêng ở
  Vercel → Settings → Domains.
