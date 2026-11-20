# Chuyển từ OpenLMS (app cũ) sang OPEN-EDU — kế hoạch chạy song song & chuyển hẳn

**Tóm tắt**: thí điểm **Học kì 2 năm học 2026–2027** với 3–5 GV (từ 01/2027), chạy song song app cũ; dữ liệu cũ
đồng bộ sang hằng đêm. **Chuyển hẳn đầu năm học 2027–2028** (ngày chuyển dự kiến **Thứ Hai 16/08/2027**, trước tựu
trường). App cũ chuyển **chỉ đọc** từ ngày đó, tắt hẳn sau 31/12/2027.

## 1. Cái gì chạy ở đâu
Cả hai app dùng **chung một project Supabase** (gói Free) và chung tài khoản `auth.users` → mọi người đăng nhập bằng
tài khoản cũ.

| Thành phần | App cũ (OpenLMS) | App mới (OPEN-EDU) |
|---|---|---|
| Dữ liệu | schema `public` | schema `v2` (`supabase/migrations`) |
| Web HS | như hiện nay | `apps/learner` (PWA; app Android/iOS — `apps/learner/resources/README.md`) |
| Web GV | như hiện nay | `apps/teacher` (PWA) |
| Màn hình TV | — | `apps/present` |
| Chấm bài, AI | — | Edge Functions `grade`, `ai-grade`, `ai-gateway`, `pkg-sign` |
| Lớp trực tiếp | — | Supabase Realtime (hoặc `tools/live-relay` trong mạng LAN) |
| Đồng bộ dữ liệu | — | `tools/migrate-v1` (một chiều: `public` → `v2`) + `.github/workflows/nightly-migrate.yml` |

**Một chiều**: dữ liệu chỉ chảy cũ → mới. Những gì GV/HS làm trên app mới **không** chảy ngược về app cũ.

## 2. Mốc thời gian
| Thời gian | Việc | Ai |
|---|---|---|
| T11–T12/2026 | Chạy migrations `v2` trên project thật; chạy thử ETL (`run.mjs --dry-run`), đọc báo cáo đối soát; sửa dữ liệu cũ lỗi (HS chưa có lớp, câu hỏi `can-kiem-tra-lop`) | Quản trị + Kĩ thuật |
| 12/2026 | Chọn GV thí điểm (gợi ý: 1 lớp 1–2, 2 lớp 3, 1–2 lớp 4–5; có TV trong lớp); tập huấn 90 phút (`docs/huong-dan/tap-huan.md`) | BGH + Quản trị |
| 04/01/2027 | **Bắt đầu thí điểm HK2.** Bật đồng bộ hằng đêm. Lớp thí điểm: GV giao bài, chấm, TT27 GK2 trên app mới | GV thí điểm |
| Hằng tuần | Đọc báo cáo đối soát đêm qua (artifact `reconcile-*`); gom góp ý GV trong nhóm Zalo; sửa lỗi theo đợt | Kĩ thuật |
| 03/2027 | Đánh giá giữa kì thí điểm: số buổi học, tỉ lệ HS đăng nhập, thời gian chấm, lỗi còn mở → **quyết định đi tiếp / lùi** | BGH |
| 04–05/2027 | TT27 CN của lớp thí điểm làm trên app mới; GV các lớp khác vẫn dùng app cũ | GV |
| 06–07/2027 | Tập huấn toàn trường (2 đợt); cấp tài khoản phụ huynh; phát hành app Android/iOS (duyệt cửa hàng mất 1–3 tuần) | Quản trị |
| 09–13/08/2027 | **Diễn tập chuyển** trên bản sao (tạo project tạm, restore backup, chạy toàn bộ checklist mục 5) | Kĩ thuật |
| **16/08/2027** | **Ngày chuyển**: đóng băng app cũ (chỉ đọc), đồng bộ lần cuối, đối soát, mở app mới cho toàn trường | Tất cả |
| 16/08 → 30/09/2027 | Hỗ trợ tăng cường: trực Zalo giờ hành chính; giữ khả năng hoàn tác | Kĩ thuật |
| 31/12/2027 | Tắt app cũ; gỡ `public` khỏi Exposed schemas; xóa cột `public.parents.password` | Quản trị |

## 3. Đồng bộ dữ liệu trong thời gian thí điểm
- **Hằng đêm 02:07** (giờ VN) workflow `nightly-migrate.yml` chạy `node tools/migrate-v1/run.mjs` (đầy đủ 00 → 06 + đối soát).
  ETL **idempotent**: khóa theo id cũ, upsert; chạy lại không cộng trùng sao, không nhân đôi câu hỏi. Mỗi bước 1 giao dịch.
  Dữ liệu trường tiểu học nhỏ (vài nghìn dòng) nên chạy lại toàn bộ mỗi đêm vẫn chỉ mất vài giây — không cần
  đồng bộ "từng phần" theo thời gian.
- **Không ghi đè** chỉnh sửa trên app mới: câu hỏi/bài giảng đã chuyển, phiếu TT27 GV đã sửa, bài GV đã duyệt lại,
  linh vật/cài đặt HS tự chọn, sao HS kiếm trên app mới (chi tiết: `tools/migrate-v1/README.md`).
- **Được cập nhật theo app cũ**: tên, vai trò, lớp/khối HS, thành viên lớp, tổ, số dư sao đầu kỳ (thi đua cũ), XP Đấu
  trường, kết quả bài kiểm tra mới, nhận xét TT27 chưa được GV sửa.
- **Quy ước cho GV thí điểm**: mỗi việc chỉ làm ở **một** app. Lớp thí điểm: điểm danh, thi đua, chấm bài, TT27 trên
  app mới. Việc chung toàn trường (tài khoản, xếp lớp) vẫn làm trên app cũ tới ngày chuyển — đồng bộ sẽ mang sang.
  Thi đua: lớp thí điểm **ngừng** ghi điểm thi đua ở app cũ (nếu không, số dư đầu kỳ thay đổi theo đêm, HS thấy sao "nhảy").
- Báo cáo đối soát có hạng mục **LỆCH** → workflow báo đỏ → Kĩ thuật xem `select * from v1etl.history_rejects;` và
  `90_verify.sql`, sửa dữ liệu cũ hoặc ETL, chạy lại tay (`workflow_dispatch`).

## 4. Ngày chuyển (16/08/2027) — đóng băng & chuyển
1. **T-7 ngày**: thông báo GV/phụ huynh: "Từ 16/08 app cũ chỉ để xem". Tắt `nightly-migrate` tự động, chạy tay từ đây.
2. **T-1, 17:00**: tải bản sao lưu (Dashboard → Database → Backups; hoặc `pg_dump --schema=public --schema=v2`), lưu 2 nơi.
3. **T0, 06:00 — đóng băng app cũ (chỉ đọc)**: chạy trong SQL Editor:
   ```sql
   -- thu hồi quyền ghi bảng cũ từ client; giữ quyền đọc
   revoke insert, update, delete on all tables in schema public from anon, authenticated;
   ```
   Kiểm tra: đăng nhập app cũ bằng tài khoản GV, thử lưu → phải báo lỗi; xem điểm cũ → vẫn được.
   (Hoàn tác: `grant insert, update, delete on all tables in schema public to authenticated;`)
4. **06:15**: `node tools/migrate-v1/run.mjs --dry-run` → đọc báo cáo → `node tools/migrate-v1/run.mjs` → mọi hạng mục **OK**.
   Lưu `reports/reconcile-*.md` vào hồ sơ chuyển đổi. Chưa chạy `--cleanup` (giữ `v1etl` để tra cứu tới hết tháng 9).
5. **07:00**: đổi DNS / đường dẫn: `hoc.truong.edu.vn` → app HS mới, `gv.truong.edu.vn` → app GV mới; app cũ sang
   `cu.truong.edu.vn`. Đặt biến build `VITE_LEGACY_URL=https://cu.truong.edu.vn` → nút **"Mở app cũ"** (chỉ xem lịch sử).
6. **07:30**: kiểm thử khói (mục 6, checklist). Báo BGH "đã mở".

## 5. Kế hoạch hoàn tác (rollback)
| Tình huống | Làm gì | Mất gì |
|---|---|---|
| Lỗi nhỏ trên app mới (một màn hình) | Sửa nóng; GV tạm dùng chức năng tương ứng ở app cũ **chỉ đọc** | — |
| ETL sai một phần (vd sao quy đổi sai) | Sửa `05_rewards.sql`/CTE `params` → chạy lại bước đó (`--only 05`) — upsert tự cập nhật | — |
| App mới không dùng được (trong 2 tuần đầu) | (1) Mở lại quyền ghi app cũ (lệnh hoàn tác mục 4.3); (2) trỏ DNS về app cũ; (3) thông báo GV. Dữ liệu tạo trên app mới **vẫn nằm trong `v2`** để chuyển lại sau | Việc làm trên app mới không có trên app cũ (nhập tay lại nếu cần: điểm danh, TT27) |
| Dữ liệu chuyển hỏng nặng | `tools/migrate-v1/rollback.sql` (xóa phần đã chuyển, giữ dữ liệu mới), sửa ETL, chạy lại | — |
| Hỏng toàn bộ `v2` | `drop schema v2 cascade;` → chạy lại `supabase/migrations` → ETL. `public`, `auth.users` không bị ảnh hưởng | Mọi dữ liệu tạo mới trên v2 (trừ khi restore từ backup) |

Ngưỡng quyết định hoàn tác (BGH + Kĩ thuật, trong 2 giờ): > 20 % lớp không đăng nhập được, mất dữ liệu đã chuyển,
lộ dữ liệu giữa các lớp/phụ huynh (→ hoàn tác **ngay**, không chờ).

## 6. Checklist ngày chuyển
- [ ] Backup đã tải và mở thử được
- [ ] `supabase test db` (hoặc `tools/run-db-tests.sh`) xanh trên bản migrations đang chạy
- [ ] Đối soát: mọi hạng mục OK; số HS chưa có lớp = 0; câu hỏi `can-kiem-tra-lop` đã xử lý
- [ ] Edge Functions đã deploy, secrets đủ (`supabase/README.md` mục 1.5); hạn mức AI đặt đúng
- [ ] Bucket `submissions` có policy; R2 CORS cho app GV
- [ ] App cũ: ghi bị chặn, đọc vẫn được
- [ ] Đăng nhập thử: 1 HS lớp 1 (chữ to), 1 HS lớp 5, 1 GV, 1 phụ huynh, 1 admin
- [ ] HS thấy đúng số sao đầu kỳ + linh vật đã mở; phụ huynh chỉ thấy con mình, chỉ bài đã duyệt
- [ ] Lớp trực tiếp: TV + 3 máy HS vào bằng mã 6 số / QR
- [ ] GV chấm 1 bài ảnh bằng AI → duyệt → HS/phụ huynh thấy
- [ ] Nút "Mở app cũ" mở đúng địa chỉ
- [ ] `pg_cron` dọn hằng tháng đã đặt lịch
- [ ] Thông báo phụ huynh (tin nhắn + giấy) kèm `docs/huong-dan/phu-huynh.md`

## 7. Ai làm gì
| Vai trò | Người | Trách nhiệm |
|---|---|---|
| Chủ trì (BGH) | Phó hiệu trưởng chuyên môn | Chọn lớp thí điểm, quyết định đi tiếp/lùi/hoàn tác, ký biên bản chuyển |
| Quản trị hệ thống | GV tin học / cán bộ CNTT | Tài khoản, lớp, backup, chạy ETL, đối soát, DNS, nút app cũ |
| Kĩ thuật (nhóm phát triển) | đơn vị phát triển | Sửa lỗi, CI, Edge Functions, xử lý LỆCH, diễn tập, phát hành app di động |
| GV thí điểm (3–5) | theo danh sách BGH | Dùng app mới hằng tuần, góp ý, làm "GV cốt cán" hỗ trợ đồng nghiệp ở đợt toàn trường |
| GVCN các lớp | toàn trường | Phát giấy hướng dẫn phụ huynh, nhắc HS đổi mật khẩu nếu cần |
| Hỗ trợ phụ huynh | văn thư / GVCN | Liên kết tài khoản phụ huynh–con, cấp lại mật khẩu |

## 8. TODO cho nhóm app (ngoài phạm vi tài liệu này)
- **`VITE_LEGACY_URL`** — nếu có giá trị: hiện liên kết **"Mở app cũ"** (chỉ xem lịch sử) ở trang Tôi (HS), menu tài
  khoản (GV) và trang phụ huynh; không có giá trị → ẩn. Thêm vào `.env.example`. Trong app iOS/Android liên kết ra
  ngoài phải đi qua cổng phụ huynh (yêu cầu Kids Category / Families).
- Bài nộp chuyển từ app cũ (`work_tasks.id` bắt đầu `v1ex_`, `ai_grades.model` bắt đầu `v1:`) nên hiện nhãn
  "Từ app cũ" và ẩn nút nộp lại/chấm lại AI.
- Chunk JS chính app HS đang vượt ngân sách 170 KB gzip (đo 13/11/2026: ~174,6 KB) — tách lazy thêm (CI đang chặn).
