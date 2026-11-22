# Trang học và Trang được phép nhúng

**Trang học** (app giáo viên → menu “Trang học”, cho giáo viên và quản trị): trang web hoặc bài trong ứng dụng học tập
mà học sinh mở **ngay trong OPEN-EDU** (app học sinh → Hôm nay → “Ứng dụng học”).

## Trang được phép nhúng
- Danh sách `v2.embed_sites` (origin `https://…`, không có đường dẫn). **Giáo viên và quản trị đều thêm / bớt được**;
  học sinh chỉ đọc. Có sẵn 10 trang học tập quen thuộc (YouTube, Google Tài liệu / Drive, Quizizz, Wayground,
  Wordwall, Canva, Padlet, GeoGebra, Scratch) — bớt được.
- Dùng cho: slide “Nhúng trang web” trong bài giảng và Trang học. Trang ngoài danh sách → chỉ có nút “Mở trong tab mới”.
- Trang web đó phải cho phép hiện trong khung (không chặn bằng `X-Frame-Options` / `frame-ancestors`); nếu chặn, khung
  trống — học sinh bấm “Mở thẻ mới ↗”.
- CSP của app: `frame-src 'self' https:` (danh sách là do app kiểm, vì danh sách đổi được lúc chạy).

## Trang học của lớp (`v2.class_pages`)
- **Trang web**: tên, địa chỉ, ghi chú, mở trong OPEN-EDU / thẻ mới, tạm ẩn. Địa chỉ chưa được phép → nút “Cho phép nhúng
  trang này” ngay trong hộp thêm.
- **Ứng dụng LTI**: “Thêm cả ứng dụng” hoặc “Chọn bài trong app” (Deep Linking, docs/KET_NOI_LTI.md) — mỗi bài thành
  một Trang học có cột điểm riêng.
- Quyền: GV của lớp (chủ nhiệm / dạy cùng) và quản trị thêm, sửa, xóa; học sinh của lớp thấy trang không ẩn.

## Kiểm thử
`supabase/tests/database/embed_pages.test.sql` (22), `packages/lesson-player/src/embed.test.ts`,
`e2e/bridge-lti.spec.ts` (GV thêm trang + cho phép nhúng + ẩn + bớt; HS mở trong khung / thẻ mới). ⚠ Chưa chạy với
Supabase thật.
