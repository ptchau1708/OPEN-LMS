# Phụ huynh + Thông báo (SQL 23)

Migration `20261127000001_v2_parent_hub_notify.sql`. Tệp dán vào Supabase SQL Editor: `23_phu-huynh-thong-bao.sql`.
- Chạy sau SQL 22.
- Thông báo đẩy lên điện thoại cần thêm hàm Edge `push` (mục 6).

## 1. Trang Phụ huynh (app giáo viên → menu **Phụ huynh**)

| Thẻ | Làm gì |
|---|---|
| **Gửi phụ huynh** | Gửi cho cả lớp hoặc chọn từng em. Có mẫu soạn sẵn: họp phụ huynh, lịch nghỉ, chuẩn bị đồ dùng, tình hình tuần, khen ngợi, mời trao đổi. Có thể đánh dấu **Cần phụ huynh bấm "Đã nhận"**. Gửi ngay hoặc **hẹn giờ** (trong 60 ngày). Em nào chưa có phụ huynh liên kết được đánh dấu ⚠. |
| **Tin nhắn** | Nhắn hai chiều với phụ huynh, mỗi em một cuộc trò chuyện. Mọi phụ huynh đã liên kết của em đều thấy tin cô gửi. Em có tin chưa đọc lên đầu danh sách. Ai gửi tin thì gỡ được tin của mình. |
| **Chờ duyệt** | Mục để ở chế độ "Cô duyệt rồi mới gửi" (mặc định là nhắc nhở nề nếp), trong 30 ngày. Cô chọn rồi **Gửi** (có thể kèm lời nhắn) hoặc **Bỏ qua**. |
| **Đã gửi** | Bao nhiêu phụ huynh đã xem hoặc xác nhận. Bấm vào thông báo để xem từng em, từng phụ huynh. **Nhắc người chưa xem/xác nhận** (mỗi 12 giờ một lần). **Thu hồi** để phụ huynh không còn thấy. |
| **Phụ huynh thấy gì** | Mỗi mục chọn **Tự động** / **Cô duyệt rồi mới gửi** / **Không gửi**. Cài giờ nhận tin nhắn. **Xem như phụ huynh**: chọn một em để thấy phụ huynh em đang xem được những gì. |
| **Liên kết tài khoản** | Mã liên kết, in phiếu, cấp lại mật khẩu (như trước). |

**Các mục và mặc định**

| Mục | Mặc định | Chế độ có thể chọn |
|---|---|---|
| Kết quả tự học | Tự động | Tự động / Không gửi |
| Con đã vững / cần luyện | Tự động | Tự động / Không gửi |
| Bài được giao | Tự động | Tự động / Không gửi |
| Thầy cô ghi chép (chỉ ghi chép đã tích "chia sẻ") | Tự động | Tự động / Không gửi |
| Bài con thảo luận | Tự động | Tự động / Không gửi |
| Đấu trường | Tự động | Tự động / Không gửi |
| Bài viết đã chấm | Tự động | thêm "Cô duyệt" |
| Kết quả TT27 | Tự động | thêm "Cô duyệt" |
| Lời khen | Tự động | thêm "Cô duyệt" |
| **Nhắc nhở nề nếp** | **Cô duyệt** | thêm "Cô duyệt" |
| Chuyên cần (vắng học báo ngay) | Tự động | thêm "Cô duyệt" |

**Chặn ở máy chủ:** mục để "Không gửi", hoặc chưa được duyệt, thì phụ huynh không đọc được qua bất kì đường nào. Máy chủ chặn ở quyền đọc bảng và ở các hàm hồ sơ, không chỉ ẩn trên màn hình.

"Chế độ phụ huynh" mở bằng phép tính trên tài khoản của con không phải tài khoản phụ huynh, nên:
- không có thông báo của cô, không nhắn tin được;
- em vẫn xem được dữ liệu của chính mình.

## 2. Phía phụ huynh (app học sinh, tài khoản phụ huynh)

**Trên trang Phụ huynh:**
- Mục **Thông báo của cô** ở đầu trang: tin cả lớp và tin riêng, nút **Đã nhận**, **Trả lời cô**.
- Các mục cô gửi kèm lời nhắn.
- Ô **Nhắn tin với cô**.
- Phần nào lớp tắt thì không hiện.

**Trang Nhắn cô** (`/phu-huynh/nhan-tin?con=<id>`):
- Ngoài giờ nhận tin, phụ huynh vẫn gửi được. Trang ghi giờ nhận tin của cô.
- Mỗi ngày tối đa 30 tin.

**Chuông** đầu trang dẫn tới trang **Thông báo**.

## 3. Thông báo (chuông) cho cả ba vai trò

| Ai | Khi nào |
|---|---|
| Phụ huynh | Thông báo của cô, tin nhắn của cô, con vắng hoặc đi muộn, bài viết đã chấm, kết quả TT27, con được khen, nhắc nhở (khi cô gửi), ghi chép được chia sẻ, con sắp hết hạn bài (19:00 hôm trước), bản tin tuần (thứ Bảy 17:00), con nhận cúp |
| Học sinh | Bài mới được giao, sắp hết hạn bài, bài được chấm hoặc trả lại, được khen, nhận huy hiệu, đến lượt đấu trong giải, có bình luận bài thảo luận |
| Giáo viên | Tin nhắn của phụ huynh (theo giờ nhận tin), bài mới cần chấm (gộp theo đề), thảo luận chờ duyệt hoặc bị báo, đủ phụ huynh đã xác nhận, phụ huynh mới liên kết, giải đấu sang vòng hoặc kết thúc |

- **Gộp tin:** tin cùng loại chưa đọc được gộp lại (ví dụ "5 bài mới cần chấm: Tả cây bàng"). Mở cuộc trò chuyện là tin nhắn được đánh dấu đã đọc.
- **Giờ yên lặng:** mặc định 21:00–06:30, mỗi người tự đổi được ở trang Thông báo. Tin đến trong giờ yên lặng vẫn vào chuông, nhưng máy chỉ reo khi hết giờ.
- **Tin nhạy cảm** (nhắc nhở, vắng học, ghi chép): màn hình khoá chỉ hiện "OPEN-EDU: có thông tin mới", trừ khi người dùng cho phép hiện nội dung.
- Mỗi người tự chọn loại thông báo nào được đẩy lên máy.

## 4. Cài app lên điện thoại (web app, không qua cửa hàng)

- **App học sinh và phụ huynh** (chung một app):
  - Android: Chrome → menu ⋮ → *Thêm vào màn hình chính* (hoặc *Cài đặt ứng dụng*).
  - iPhone/iPad (iOS 16.4 trở lên): Safari → nút Chia sẻ → *Thêm vào MH chính*.
- **App giáo viên:** cài giống hệt. Tên app là "OE Giáo viên", biểu tượng màu tím.
- Mở app từ biểu tượng → trang **Thông báo** → **Bật thông báo** → **Cho phép**.
  - Trên iPhone bắt buộc phải mở từ biểu tượng trên Màn hình chính thì mới bật được.
- Mỗi máy nhận thông báo của tài khoản đang đăng nhập. Đăng xuất thì máy thôi nhận thông báo của tài khoản đó.
  - Máy dùng chung trong nhà: tin ghi kèm tên người nhận.

## 5. Kĩ thuật

**Bảng mới:**
- `v2.parent_share_settings`: chế độ từng mục, giờ nhận tin.
- `v2.parent_releases`: mục đã gửi hoặc bỏ qua.
- `v2.parent_posts`, `v2.parent_post_reads`, `v2.parent_messages`.
- `v2.notifications`, `v2.notify_prefs`, `v2.push_subscriptions`, `v2.push_config`, `v2.notify_sent`.

**Quyền đọc của phụ huynh:**
- `v2.ps_guardian_ok(em, mục, mã bản ghi)` thay nhánh phụ huynh trong RLS của các bảng: `attendance`, `behavior_logs`, `submissions`, `tt27_evaluations`, `student_notes`, `learning_events`, `reward_ledger`, `streaks`, `lesson_progress`, `skill_mastery`, `arena_profiles`.
- Hàm `can_see_grade`, `can_see_review`, `can_read_discussion_post` cũng xét cài đặt này.
- Các hàm security definer `get_student_extras`, `get_student_profile`, `get_parent_summary` tự lọc khi người xem là phụ huynh.

**Thông báo do trigger sinh ra:**
- Trigger trên các bảng: `parent_posts`, `parent_messages`, `parent_releases`, `parent_post_reads`, `attendance`, `submissions`, `tt27_evaluations`, `behavior_logs`, `student_notes`, `assignments`, `user_badges`, `cup_matches`, `cups`, `discussion_posts`, `discussion_reports`, `guardian_links`.
- Mọi trigger đều có `exception when others`: lỗi thông báo không làm hỏng thao tác chính.

**Gửi thông báo đẩy:**
1. Tin mới → `v2._push_kick()` gọi hàm push qua `pg_net`, kèm header `x-openedu-push`.
2. Hàm push lấy hàng đợi (`push_claim`), mã hoá rồi gửi tới dịch vụ đẩy của trình duyệt, sau đó ghi kết quả (`push_done`).
   - Máy đã gỡ app (HTTP 404/410) thì xoá đăng kí.
   - Lỗi tạm thì thử lại tối đa 4 lần.
   - Tin quá 2 ngày thì thôi đẩy.

**Lịch `pg_cron` mỗi phút** (`v2.notify_tick()`):
- tin hẹn giờ, bài mở theo hẹn;
- nhắc hạn bài lúc 19:00, bản tin tuần thứ Bảy 17:00;
- gửi lại tin bị kẹt;
- dọn tin cũ: đã đọc quá 60 ngày, hoặc mọi tin quá 120 ngày.

**Web push không dùng thư viện ngoài:** `packages/data/src/webpush/`, chép sang `supabase/functions/_shared/webpush/` bằng `tools/sync-scoring.mjs`.
- VAPID (RFC 8292) và mã hoá aes128gcm (RFC 8291), chỉ dùng WebCrypto.
- Kiểm thử khớp vector mẫu của RFC 8291 và giải mã đối chiếu bằng `node:crypto`.

**Khoá VAPID:** hàm push tự sinh lần đầu và lưu trong `v2.push_config`. Chỉ service role đọc được bảng này.

**Service worker:** `public/oe-sw-push.js` của cả hai app.
- Hiện thông báo, ghi số trên biểu tượng app.
- Bấm thông báo thì mở đúng trang.

**Kiểm thử:**
- pgTAP `parent_hub_notify.test.sql`: 81 phép thử.
- Vitest `webpush.test.ts`, `parenthub.test.ts`.
- e2e `phu-huynh-thong-bao.spec.ts`.

## 6. Triển khai

1. SQL Editor: dán và chạy `23_phu-huynh-thong-bao.sql`.
   - Tệp tự bật `pg_net` và `pg_cron`, rồi đặt lịch chạy mỗi phút.
   - Dòng cuối ghi sẵn địa chỉ hàm push của dự án.
2. Triển khai hàm (máy có Node), không cần đặt khoá bí mật nào:
   ```
   npx supabase@latest functions deploy push --project-ref <ref> --no-verify-jwt --use-api
   ```
3. Đẩy mã lên GitHub để Vercel dựng lại hai app.
   - Mở app, nhấn Ctrl+Shift+R.
   - Vào **Thông báo** → **Bật thông báo** → **Gửi thử**.
