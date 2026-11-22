# Mật khẩu: cấp lại, tự đổi, quên mật khẩu

Nhiều tài khoản không có email thật (học sinh `an2a1`, giáo viên tạo bằng tên đăng nhập, phụ huynh đăng kí bằng số
điện thoại — hệ thống tự ghép thành `…@openlms.edu`, `…@parent.openlms.edu`). Các địa chỉ này **không nhận được thư**,
nên khôi phục chủ yếu nhờ người khác cấp lại.

| Ai quên | Cách lấy lại |
|---|---|
| Học sinh | GVCN (Lớp học) hoặc quản trị (Tài khoản) bấm **Đặt lại mật khẩu** → in phiếu. Không bắt đổi — mật khẩu trên phiếu là mật khẩu của em. |
| Phụ huynh | GVCN của con hoặc quản trị: **Liên kết phụ huynh** → **Cấp lại mật khẩu** → in phiếu **mật khẩu tạm**. Phụ huynh có email thật cũng tự lấy lại qua thư được. |
| Giáo viên | Quản trị: **Tài khoản → Giáo viên → Đặt lại mật khẩu** → mật khẩu tạm. GV dùng email thật tự lấy lại qua thư được. |
| Quản trị | Tự lấy lại qua thư (tài khoản quản trị dùng email thật), hoặc Supabase Dashboard → Authentication → Users. |

- **Mật khẩu tạm** (phụ huynh, giáo viên, quản trị): đăng nhập xong bị chặn ở màn **Đặt mật khẩu mới** cho tới khi đổi.
  Cờ nằm ở `app_metadata.must_change_password` (chỉ máy chủ ghi được).
- **Tự đổi**: phụ huynh — nút *Đổi mật khẩu* trên trang phụ huynh; giáo viên — menu tên mình → *Đổi mật khẩu*.
  Phải nhập đúng mật khẩu đang dùng. Học sinh không có nút này (tránh các em tự đổi rồi quên); địa chỉ `/doi-mat-khau` vẫn dùng được nếu cần.
- **Quên mật khẩu** (`/quen-mat-khau`, link ở trang đăng nhập chung và app giáo viên): chỉ nhận **email thật**. Nhập tên
  đăng nhập / số điện thoại / địa chỉ hệ thống tự ghép → trang hướng dẫn nhờ thầy cô, **không gửi thư**.
- GVCN chỉ cấp lại được cho học sinh lớp mình chủ nhiệm và phụ huynh của các em; quản trị cấp cho mọi người. Không tự
  cấp cho chính mình.

## Cài trên Supabase (bắt buộc để gửi thư được)
1. Triển khai lại hàm: `npx supabase@latest functions deploy school-admin --project-ref <ref> --no-verify-jwt --use-api`
2. **Authentication → URL Configuration → Redirect URLs**: thêm `https://<app học sinh>/dat-lai-mat-khau`.
3. **Gửi thư thật**: máy chủ thư mặc định của Supabase chỉ gửi tới email thành viên dự án và rất ít thư mỗi giờ. Muốn
   phụ huynh / giáo viên nhận được thư: **Authentication → Emails → SMTP Settings** → bật *Custom SMTP* (Gmail của trường
   với mật khẩu ứng dụng, Brevo, Resend…).
4. *(Nên làm)* **Authentication → Emails → Templates → Reset Password**: đổi tiêu đề và nội dung sang tiếng Việt, giữ
   nguyên `{{ .ConfirmationURL }}`.

## Mã
`packages/data/src/password.ts` (quy tắc, nhận biết địa chỉ tự ghép) · `changePassword` / `requestPasswordReset` /
`completePasswordReset` trong hai nguồn dữ liệu · Edge Function `school-admin` (`reset-password`, `password-changed`) ·
`apps/learner/src/pages/account/Password.tsx`, `lib/authLink.ts` · `apps/teacher/src/pages/Password.tsx`.
Kiểm thử: `packages/data/src/__tests__/password.test.ts`, `e2e/mat-khau.spec.ts`. ⚠ Chưa chạy với project Supabase thật
(gửi thư, link trong thư, cờ mật khẩu tạm).
