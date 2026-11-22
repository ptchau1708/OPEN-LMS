# OPEN-EDU — Hướng dẫn cho quản trị trường

Dành cho GV tin học / cán bộ CNTT được giao quản trị. Phần kĩ thuật sâu: `supabase/README.md`,
`tools/migrate-v1/README.md`, kế hoạch chuyển: `docs/CUTOVER.md`.

## 1. Tài khoản & quyền
| Vai trò | Làm được |
|---|---|
| Học sinh | Học, làm bài, nộp bài viết, xem sao/linh vật của mình |
| Giáo viên | Quản lý **lớp mình**: bài giảng, giao bài, chấm, TT27, thi đua, điểm danh |
| Phụ huynh | Chỉ đọc dữ liệu **con được liên kết**; chỉ bài đã duyệt, TT27 đã chốt |
| Quản trị (`admin`) | Mọi lớp, mọi tài khoản, báo cáo toàn trường |

- Tài khoản dùng chung với app cũ (Supabase Auth). Tài khoản mới tạo trong app cũ (tới ngày chuyển) hoặc
  Supabase Dashboard → Authentication → **Add user** — hồ sơ OPEN-EDU tự tạo. HS: tên đăng nhập = phần trước `@` của email.
- **Xếp lớp, đổi vai trò**: đăng nhập app GV bằng tài khoản `admin` → **Lớp học**. Trong thời gian thí điểm làm trên
  app cũ để đồng bộ mang sang.
- **Liên kết phụ huynh – con**: theo quy trình nhà trường (phiếu GVCN). Kiểm tra bằng cách đăng nhập tài khoản phụ
  huynh: chỉ thấy đúng con.
- Cấp lại mật khẩu: trong app — học sinh, giáo viên ở **Tài khoản**; phụ huynh ở **Liên kết phụ huynh** (mật khẩu tạm,
  phải đổi khi đăng nhập). Người dùng email thật tự lấy lại ở *Quên mật khẩu?*. Chi tiết: `docs/MAT_KHAU.md`.

## 2. Việc định kì
| Khi nào | Việc |
|---|---|
| Hằng ngày (thí điểm) | Xem kết quả *Đồng bộ dữ liệu app cũ* (GitHub Actions); đỏ → báo Kĩ thuật |
| Hằng tuần | Dashboard → Reports: dung lượng CSDL (< 500 MB), lượt gọi Edge Functions (< 500 000/tháng), Realtime |
| Hằng tuần (nghỉ hè/Tết) | Mở app ít nhất 1 lần — project gói Free bị tạm dừng sau 7 ngày không dùng |
| Hằng tháng | `select v2.monthly_cleanup();` (nếu chưa bật `pg_cron`) |
| Đầu học kì | Tạo lớp năm học mới, chuyển HS lên lớp, gán GVCN; kiểm tra hạn mức AI (`AI_DAILY_LIMIT_*`) |
| Trước kì TT27 | Nhắc GV **Chốt chính thức** đúng hạn; in bản in TT27 |

## 3. Sao lưu & khôi phục
- Gói Free có bản sao lưu hằng ngày (Dashboard → Database → Backups, giữ vài ngày). **Tự tải thêm** mỗi tuần:
  `pg_dump "$DATABASE_URL" --schema=v2 --schema=public -Fc -f openedu-$(date +%F).dump`, cất 2 nơi (ổ trường + đám mây trường).
- Ảnh bài làm ở Storage bucket `submissions`; gói HTML5/ảnh bài giảng ở Cloudflare R2.

## 4. Chuyển dữ liệu từ app cũ
```bash
export DATABASE_URL='postgresql://postgres.<ref>:<mật-khẩu>@...pooler.supabase.com:5432/postgres'
node tools/migrate-v1/run.mjs --dry-run   # chạy thử, đọc báo cáo
node tools/migrate-v1/run.mjs             # chạy thật
```
Báo cáo đối soát (`tools/migrate-v1/reports/reconcile-*.md`) so số lượng cũ ↔ mới: người dùng, lớp, thành viên, câu hỏi,
đề thi, kết quả, sao thi đua, AI chấm, TT27. Mọi dòng phải **OK**. Báo cáo có tên HS trong nhật ký → không gửi ra ngoài.

## 5. Bảo mật & quyền riêng tư
- Không chia sẻ `service_role key`, mật khẩu CSDL; chỉ đặt trong GitHub Secrets / Supabase Secrets.
- Bộ kiểm thử bảo mật (`supabase/tests/database/*.test.sql`) chứng minh: HS không sửa được điểm, sao, đáp án,
  AI chấm, duyệt bài, TT27, không xem dữ liệu bạn khác; phụ huynh chỉ thấy con mình và bài đã duyệt. Chạy lại sau
  mỗi lần đổi migration: `tools/run-db-tests.sh`.
- AI không nhận tên HS. Khóa AI chỉ ở Supabase Secrets.
- Khi tắt app cũ: xóa cột `public.parents.password`, gỡ `public` khỏi *Exposed schemas* (`docs/CUTOVER.md`).
- Yêu cầu xóa dữ liệu của HS (chuyển trường, phụ huynh đề nghị): Dashboard → Authentication → xóa user → dữ liệu `v2` xóa theo.

## 6. App di động
App HS Android/iOS: `apps/learner/resources/README.md` (đóng gói, quyền camera, chính sách cửa hàng cho trẻ em).
App GV: chỉ cài dạng PWA.

## 7. Sự cố thường gặp
| Hiện tượng | Kiểm tra |
|---|---|
| Không ai đăng nhập được | Project bị tạm dừng? Dashboard → *Restore*. Hết băng thông/quota? |
| AI không chấm (bài kẹt "Đang chấm") | Secrets `OPENROUTER_API_KEY`/`GEMINI_API_KEY`; nhật ký Edge Function `ai-grade` |
| Lớp trực tiếp chập chờn | > 200 kết nối Realtime đồng thời? Dùng máy chủ LAN `pnpm relay` |
| Phụ huynh không thấy con | Thiếu liên kết phụ huynh – con |
| HS thấy sao "nhảy" khi thí điểm | GV còn ghi thi đua ở app cũ (xem `docs/CUTOVER.md` mục 3) |
