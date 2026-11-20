# OPEN-EDU · Backend Supabase (schema `v2`)

Dùng lại **project Supabase hiện có của trường (gói Free)**. App mới dùng schema `v2`; app cũ (OpenLMS) tiếp tục dùng
`public` tới ngày chuyển hẳn. Tài khoản `auth.users` dùng chung → mọi người đăng nhập bằng tài khoản cũ.
Hợp đồng cho client: `docs/SUPABASE_API.md`.

```
supabase/
  config.toml                 cấu hình Supabase CLI (schemas: public, v2)
  migrations/                 16 file SQL, chạy theo thứ tự tên (chạy lại được)
    20261106000001…06         schema, RLS, RPC, realtime, hạn mức AI, dọn hằng tháng
    20261111000001_v2_skills  kĩ năng, mức thành thạo, hồ sơ, bản đồ lớp, phụ huynh
    20261111000002_v2_assess  bài viết, AI chấm, TT27, thi đua, điểm danh
    20261113000001_v2_duels   Đấu 1–1
    20261113000002_v2_school  phụ huynh liên kết bằng mã, báo cáo trường, quản trị
    20261113000009_v2_rewards huy hiệu, cửa hàng, vườn lớp
    20261115000001_v2_exam    kiểm tra theo ma trận, chống gian lận nhẹ
    20261115000020_v2_offline học offline (chống ghi trùng khi đồng bộ)
    20261116000001_v2_hardening   đóng hàm với người chưa đăng nhập, chỉ mục, nhật ký lỗi app
    20261116000002_v2_auth_sync   vai trò tài khoản tạo qua Edge Function
    20261116000003_v2_schedule    ping giữ dự án, bảo trì định kì (pg_cron nếu có)
  seed/skills.sql             SINH bởi tools/gen-skills-sql.mjs (danh mục kĩ năng + gắn thẻ câu hỏi mẫu) — chạy sau migration 7
  functions/
    grade/                    chấm bài ở server, cộng sao lần đúng đầu
    ai-gateway/               OpenRouter → Gemini; soạn câu hỏi, dàn ý bài, lời khích lệ
    pkg-sign/                 URL tải lên có ký tới Cloudflare R2 cho gói HTML5
    _shared/scoring/          SINH TỰ ĐỘNG bởi tools/sync-scoring.mjs (không sửa tay)
    _shared/mastery/          SINH TỰ ĐỘNG bởi tools/sync-scoring.mjs từ packages/data/src/mastery
  tests/database/rls.test.sql         pgTAP: RLS/RPC bài giảng, sao, lớp trực tiếp
  tests/database/rls_assess.test.sql  pgTAP: điểm, sao, đáp án, AI chấm, duyệt, TT27, thi đua, điểm danh, phụ huynh
  tests/shim/supabase-shim.sql        giả lập auth/storage/realtime cho Postgres thường (tools/run-db-tests.sh --plain)
```

## 1. Cài đặt trên project có sẵn

1. **Mở schema v2 cho API**: Dashboard → Project Settings → API (Data API) → *Exposed schemas* → thêm `v2` → Save.
   (Giữ `public` cho app cũ.)
2. **Chạy migration** — chọn một cách:
   - CLI: `supabase link --project-ref <ref>` rồi `supabase db push`.
     Nếu báo lịch sử migration trên server không khớp (project cũ từng chạy migration khác), dùng
     `supabase migration repair --status reverted <phiên_bản>` cho các bản không có trong thư mục này, rồi push lại.
   - Không dùng CLI: mở SQL Editor, dán **lần lượt** các file trong `migrations/` theo thứ tự tên, bấm Run.
     Các file chạy lại được (idempotent) nếu lỡ chạy hai lần.
   - Cần Postgres ≥ 15 (Settings → Infrastructure). Project Supabase hiện nay đều ≥ 15.
3. **Chuyển dữ liệu cũ**: xem `tools/migrate-v1/README.md`.
4. **Đồng bộ mã chấm điểm** (mỗi khi activity-engine đổi `score.ts`): `node tools/sync-scoring.mjs`
   (`--check` trong CI để báo khi bản chép đã cũ).
5. **Secrets cho Edge Functions** (Dashboard → Edge Functions → Secrets, hoặc CLI):
   ```bash
   supabase secrets set OPENROUTER_API_KEY=... GEMINI_API_KEY=...          # ai-gateway (có một trong hai là chạy)
   supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
                        R2_BUCKET=openedu-content CONTENT_ORIGIN=https://content.truong.edu.vn   # pkg-sign
   # BẮT BUỘC khi chạy thật: địa chỉ 3 app. Không đặt → Edge Functions chỉ nhận máy cá nhân / mạng nội bộ.
   supabase secrets set CORS_ORIGINS=https://hoc.truong.edu.vn,https://gv.truong.edu.vn,https://tv.truong.edu.vn
   # tùy chọn
   supabase secrets set OPENROUTER_MODEL=google/gemini-2.5-flash GEMINI_MODEL=gemini-2.5-flash \
                        AI_DAILY_LIMIT_GENERATE=60 AI_DAILY_LIMIT_ENCOURAGE=30 APP_URL=https://hoc.truong.edu.vn \
                        PKG_MAX_FILES=2000 PKG_MAX_FILE_MB=100 PKG_MAX_TOTAL_MB=500 PKG_URL_TTL_SEC=900
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` được Supabase tự cấp.
6. **Triển khai hàm**: `npx supabase@latest functions deploy grade ai-grade ai-gateway pkg-sign school-admin --project-ref <ref> --use-api`
   (`--use-api`: không cần Docker). `school-admin` tắt `verify_jwt` vì phụ huynh đăng ký khi chưa có tài khoản; các việc khác trong hàm tự kiểm tra quyền.
7. **R2**: tạo bucket, bật CORS cho phép `PUT` từ origin app GV (header `Content-Type`, `Content-Length`);
   gắn domain riêng `CONTENT_ORIGIN` (origin khác app để cô lập gói HTML5). Gói nằm ở `pkg/<packageId>/…`.
8. **Việc định kì** (xem `docs/VAN_HANH.md`): migration `…03_v2_schedule` tự đặt lịch `v2.run_maintenance()` hằng tháng nếu project có `pg_cron`.
   Giữ dự án không bị tạm dừng và sao lưu hằng tuần chạy bằng GitHub Actions (`keepalive.yml`, `backup.yml`).
9. **Tài khoản quản trị đầu tiên**: Authentication → Users → Add user (bật Auto Confirm), rồi
   `update v2.profiles set role = 'admin', username = 'admin' where id = (select id from auth.users where email = '<email>');`
   Giáo viên, học sinh tạo trong app (Quản trị → Tài khoản; giáo viên chủ nhiệm: Lớp học → Thêm học sinh).

Chạy thử ở máy (cần Docker): `supabase start`, `supabase db reset`, `supabase test db`, `supabase functions serve`.

**Kiểm thử bảo mật CSDL**: `tools/run-db-tests.sh` (Supabase CLI + Docker: start → db reset → test db) hoặc
`tools/run-db-tests.sh --plain [--migrate]` (Postgres 15+ có pgTAP, không cần Docker — CI dùng cách này; `--migrate`
chạy thêm kiểm thử ETL `tools/migrate-v1`). 107 kiểm tra pgTAP: HS không sửa được điểm/trạng thái bài nộp, sao
(`reward_ledger`), đáp án (`item_keys`), `ai_grades`, `grade_reviews`, TT27, thi đua, điểm danh, không đọc dữ liệu bạn khác;
phụ huynh chỉ thấy con được liên kết và chỉ bài đã duyệt / TT27 đã chốt; GV lớp khác không ghi được.

## 2. Giới hạn gói Free cần nhớ
Số liệu tại thời điểm viết — kiểm tra lại trang *Pricing* / *Usage* của Supabase trước khi dùng thật.

| Giới hạn | Ảnh hưởng | Cách xử lý trong thiết kế |
|---|---|---|
| **200 kết nối Realtime đồng thời** | Mỗi máy HS/GV/TV đang trong lớp trực tiếp = 1 kết nối | Chỉ mở kênh khi vào lớp trực tiếp, đóng khi rời. ~6 lớp × 30 HS cùng lúc là sát mức. |
| **Realtime 2 triệu tin/tháng**, 100 tin/giây | Broadcast `state` sau mỗi lệnh GV | GV chỉ gửi state khi đổi trạng thái; câu trả lời đi qua postgres_changes chỉ tới GV/TV (RLS). |
| **CSDL 500 MB** | `learning_events` lớn nhanh nhất; hình vẽ DRAW (dataUrl) trong `live_responses` | `result` chỉ giữ câu trả lời < 2 KB; `monthly_cleanup` xóa sự kiện > 12 tháng, câu trả lời trực tiếp > 6 tháng. Theo dõi Dashboard → Reports. |
| **Edge Functions 500 000 lượt/tháng** | Mỗi câu trả lời = 1 lượt `grade` | 300 HS × 40 câu/ngày × 22 ngày ≈ 264 000/tháng. Lời khích lệ AI có hạn mức/người/ngày, hết thì dùng câu soạn sẵn (không gọi AI). |
| Project tạm dừng sau 7 ngày không hoạt động | Nghỉ hè/Tết | Mở app hoặc gọi API ít nhất mỗi tuần; vào Dashboard bấm *Restore* nếu bị dừng. |
| Băng thông 5 GB | Ảnh/video trong bài | Để ảnh, video, gói HTML5 trên R2 (CONTENT_ORIGIN), không để trong Supabase Storage. |

## 3. Mô hình bảo mật
- **RLS bật cho mọi bảng `v2`.** Hàm kiểm tra quyền (`v2.current_role()`, `v2.is_teacher_of_student(uuid)`,
  `v2.is_teacher_of_class(text)`, `v2.is_guardian_of(uuid)`, `v2.can_view_user(uuid)`, `v2.lesson_visible(…)`…) là
  `security definer`, chỉ xét `auth.uid()` của người gọi.
- **Học sinh** đọc: bài đã xuất bản cùng khối, bài được giao cho lớp/em, bài của lớp trực tiếp đang tham gia;
  câu hỏi cùng khối (KHÔNG có đáp án); dữ liệu học tập của chính mình; tên và linh vật của bạn cùng lớp.
- **Đáp án** (`item_keys`) chỉ GV/admin đọc. Máy HS không bao giờ nhận đáp án: `get_items`/`get_lesson` bỏ `key`,
  `save_lesson` tách đáp án của item nhúng ra khỏi slide, chấm bài ở Edge Function `grade` bằng service role.
- **Không ghi trực tiếp được**: `learning_events`, `reward_ledger`, `live_responses`, `passports`, `streaks`,
  `lesson_slides` — chỉ qua RPC `security definer` hoặc service role. Trong `lesson_progress`, HS chỉ ghi được
  `slide_index`, `completed_slides`; `answers`, `stars_earned`, `completed_at` do server ghi (trigger bảo vệ).
  HS không tự đổi `role`, `grade`, `class_id`, `username` của mình.
- **Sao do server quyết định**: đúng lần đầu mỗi (HS, câu, ngữ cảnh bài/lớp trực tiếp) — khóa `dedupe_key` duy nhất
  nên gọi lại không cộng trùng; hoàn thành bài 1 lần/bài (tối đa 10 sao); GV thưởng 1–5 sao/lần cho HS lớp mình.
  Câu không thuộc bài/phiên được khai báo chỉ tính ở ngữ cảnh chung (không "cày" sao bằng cách đổi `lessonId`).
- **Giáo viên** quản lý lớp mình (`classes.teacher_id` hoặc `class_members.role='teacher'`), bài giảng/câu hỏi của mình;
  đọc ngân hàng câu hỏi chung; xem tiến độ HS lớp mình. **Phụ huynh** đọc dữ liệu của con (`guardian_links`). **Admin** toàn quyền.
- **Lớp trực tiếp**: PIN 6 số, hết hạn sau 12 giờ. HS nhập PIN (`find_live`) mới đọc được trạng thái phiên.
  `live_responses` chỉ GV chủ phiên (và chính HS) thấy — Realtime `postgres_changes` cũng tuân theo RLS này.
  Nếu client dùng kênh private (`{ config: { private: true } }`), policy trên `realtime.messages` chỉ cho GV chủ phiên
  broadcast `state`; người tham gia gửi presence.
- **Hàm nội bộ** (`_award`, `_sync_passport`, `record_grade`, `ai_quota_take`, `monthly_cleanup`) chỉ `service_role` gọi được.
- **AI**: khóa API chỉ ở secrets; không gửi tên/thông tin cá nhân HS cho nhà cung cấp AI; chỉ GV/admin dùng tác vụ soạn bài.
- **Gói HTML5**: chỉ GV/admin xin URL ký; whitelist đuôi tệp, chặn `..`; URL hết hạn sau 15 phút; gói phục vụ từ
  origin riêng (`CONTENT_ORIGIN`).
- Trigger trên `auth.users` tạo hồ sơ v2 cho tài khoản mới (vai trò lấy từ `public.profiles`/`public.parents` nếu có) —
  mọi lỗi trong trigger bị nuốt để không làm hỏng việc tạo tài khoản của app cũ.

## 4. Ngoài hợp đồng (bổ sung, tương thích ngược)
- RPC `v2.record_event(p_event jsonb)` — ghi sự kiện `started|viewed|completed|joined` cho `DataSource.recordEvent`.
- RPC `v2.award(p_entry jsonb)` — cổng cho `DataSource.award()`: `lesson` → `complete_lesson`, `bonus|live|behavior` → `award_bonus`.
- `award_bonus` có thêm tham số tùy chọn `p_live_session_id uuid` (thưởng trong lớp trực tiếp).
- `complete_lesson` trả thêm `starsAwarded`; `grade` trả thêm `parts` (đúng/sai từng phần).
- `ai-gateway` trả thêm `provider`, và `items` (generate_items) / `outline` (lesson_outline).
- `pkg-sign` nhận `files` dạng chuỗi hoặc `{ path, size }`, trả thêm `baseUrl`, `expiresIn`.
- Bảng phụ: `v2.mascots`, `v2.lesson_items`, `v2.streaks`, `v2.arena_profiles`, `v2.ai_usage`.
- Lỗi Edge Function: `{ "error": "<tiếng Việt>", "code": "<mã>" }`. Lỗi RPC: thông báo tiếng Việt, mã 42501 (quyền),
  P0002 (không tìm thấy), 22023 (dữ liệu không hợp lệ).
