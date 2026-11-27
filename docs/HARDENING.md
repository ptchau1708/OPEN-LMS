# Gia cố — đợt 1 (16/11/2026)

Không đổi chức năng, không đổi dữ liệu. Bảy việc:

| # | Việc | Ở đâu |
|---|---|---|
| 1 | Nâng thư viện có lỗ hổng: react-router 7.18.5, supabase-js 2.117.3, fflate 0.8.3, ws 8.21.0, vite 6.4.6, vitest 4.1.12. `pnpm audit --prod` sạch. | `package.json` các app/gói |
| 2 | Hàm CSDL `v2.*` không còn gọi được khi chưa đăng nhập (trước: ~50 hàm mở cho `anon` do quyền mặc định của PUBLIC). | `supabase/migrations/20261116000001_v2_hardening.sql`, kiểm thử `hardening.test.sql` |
| 3 | Edge Functions: không đặt `CORS_ORIGINS` → chỉ nhận máy cá nhân / mạng nội bộ / app Capacitor. | `supabase/functions/_shared/http.ts` |
| 4 | Màn hình lỗi thay cho trang trắng ở cả 3 app; ghi lỗi về bảng `v2.client_errors` (chỉ quản trị đọc, 20 lỗi/người/ngày, giữ 90 ngày). | `packages/ui/src/components/ErrorBoundary.tsx`, `packages/data/src/clientErrors.ts` |
| 5 | Phông chữ đóng gói sẵn (Nunito, Baloo 2, Be Vietnam Pro — Latin + tiếng Việt, 212 KB), không tải từ Google. | `packages/ui/src/fonts.css`, `packages/ui/src/fonts/` |
| 6 | Cấu hình bảo mật trình duyệt (CSP…) sinh tự động sau mỗi lần build. | `tools/make-headers.mjs` → `dist/_headers`, `_redirects`, `vercel.json` |
| 7 | Chỉ mục cho 12 khóa ngoại hay truy vấn. | cùng migration ở mục 2 |

## Việc PHẢI làm khi triển khai thật

1. **Khai báo địa chỉ 3 app cho Edge Functions** (nếu quên, app báo lỗi khi chấm bài / gọi AI):
   ```
   supabase secrets set CORS_ORIGINS=https://hoc.truong.edu.vn,https://gv.truong.edu.vn,https://tv.truong.edu.vn
   ```
2. **Build với đủ biến `VITE_*`** (`VITE_SUPABASE_URL`, `VITE_CONTENT_ORIGIN`, `VITE_RELAY_URL` nếu dùng): CSP được tính từ các biến này.
   Đổi địa chỉ Supabase / origin nội dung thì phải build lại.
3. **Nơi đặt web**: Cloudflare Pages và Netlify tự đọc `dist/_headers` + `dist/_redirects`. Vercel: chép `dist/vercel.json` ra thư mục gốc dự án Vercel.
   Máy chủ khác (nginx…): chép các dòng trong `dist/_headers` vào cấu hình.
4. Cần cho app gọi thêm địa chỉ khác (CDN ảnh riêng, máy chủ thống kê…): đặt `CSP_EXTRA_CONNECT`, `CSP_EXTRA_FRAME`, `CSP_EXTRA_IMG` khi build.
5. Dọn nhật ký lỗi hằng tháng: `select v2.purge_client_errors();` (chạy cùng `v2.monthly_cleanup()`).

## Xem lỗi máy học sinh gặp (quản trị)

```sql
select at, app, message, url, user_agent from v2.client_errors order by at desc limit 50;
```
Trên máy đang lỗi, thầy/cô bấm **Chép chi tiết lỗi** (app giáo viên) để gửi cho quản trị.

## Viết migration mới

Hàm mới trong `v2` phải kèm `revoke execute on function … from public, anon;` — nếu quên, `hardening.test.sql` sẽ báo đỏ.

## Còn lại (không chặn chạy thật)

`pnpm audit` còn 3 cảnh báo thấp/vừa nằm trong công cụ build của PWA (workbox-build) — không có trong mã gửi tới người dùng.

## Bản vá 16/11 (chạy thật trên Supabase)

- **Tài khoản tạo qua Edge Function bị ghi thành `student`**: GoTrue Admin API chèn người dùng trước rồi mới gắn `app_metadata`, nên trigger AFTER INSERT không thấy vai trò. Vá bằng `20261116000002_v2_auth_sync.sql` (trigger AFTER UPDATE đồng bộ role / username / grade / class_id từ `app_metadata`; `user_metadata` vẫn không được nâng quyền). Kiểm thử: `auth_sync.test.sql`.
