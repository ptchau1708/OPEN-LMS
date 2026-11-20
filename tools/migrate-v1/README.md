# Chuyển dữ liệu OpenLMS (schema `public`) → OPEN-EDU (schema `v2`)

Các file SQL chạy trong **Supabase Dashboard → SQL Editor** (vai trò `postgres`) của project hiện có.
Chỉ **đọc** từ `public` và ghi vào `v2` — app cũ vẫn chạy bình thường trong lúc chuyển và sau khi chuyển.

## Điều kiện
1. Đã chạy xong các migration trong `supabase/migrations/` (schema `v2` đã có).
2. Nên sao lưu trước: Dashboard → Database → Backups (gói Free có bản sao lưu hằng ngày), hoặc `pg_dump`.

## Thứ tự chạy
| Bước | File | Việc làm |
|---|---|---|
| 0 | `00_prepare.sql` | Tạo schema tạm `v1etl`, hàm chuyển đổi an toàn, VIEW chuẩn hóa từng bảng cũ (tự dò cột camelCase/snake_case). **Xem kết quả**: danh sách bảng/cột tìm thấy. |
| 1 | `01_people.sql` | `profiles` → `v2.profiles` (ADMIN/TEACHER/STUDENT → admin/teacher/student; username = phần trước @ của email `@openlms.edu`; màu avatar ngẫu nhiên ổn định, linh vật Nghé Tí). `parents` → hồ sơ `parent`; `parent_student_links` → `v2.guardian_links`. |
| 2 | `02_classes.sql` | `classes` → `v2.classes` (khối lấy từ tên lớp, vd 3A1 → 3); `student_ids` → `v2.class_members`; HS chưa có lớp được ghép theo `class_name` (ưu tiên năm học mới nhất); `class_groups` → tổ thi đua. Lớp 1–2 bật chữ to. |
| 3 | `03_items.sql` | `question_bank` + `arena_questions` + `exams.questions` → `v2.items` + `v2.item_keys` (đáp án tách riêng). Gộp câu trùng theo md5 nội dung chuẩn hóa. |
| 4 | `04_lessons.sql` | `el_courses/el_chapters/el_lessons` → khóa học, bài giảng 2–4 slide (video → slide `fullscreen`), thứ tự bài; `el_student_progress` → đánh dấu bài đã học xong. |
| 5 | `05_rewards.sql` | `behavior_logs` → số dư sao đầu kỳ (tổng điểm dương, lý do "Chuyển từ thi đua cũ"); `arena_profiles` → `v2.arena_profiles` + XP; mở khóa linh vật theo số sao. |
| 6 | `06_history.sql` | Lịch sử: kết quả bài kiểm tra (`exam_results`/`results`/`attempts`…) → bài nộp đã duyệt kèm điểm (`v2.submissions` + `ai_grades` + `grade_reviews`, bài giao `v1ex_<đề>` chỉ hiện với HS đã làm); AI chấm cũ (`ai_gradings`…) → lời nhận xét + model, bản chưa duyệt → *chờ GV duyệt*; nhận xét TT27 (`tt27_comments`…) → `v2.tt27_evaluations` **bản nháp** (GV rà rồi chốt). Tên bảng/cột được dò tự động. |
| ✓ | `90_verify.sql` | Bảng so sánh số dòng cũ ↔ mới, câu hỏi không chuyển được theo dạng. |
| ✓ | `91_reconcile.sql` | **Đối soát** cũ ↔ mới cho 10 hạng mục (người dùng, lớp, thành viên, câu hỏi, đề thi, kết quả, sao thi đua ×2, AI chấm, TT27): cột *cũ / bỏ qua / mới / lệch / trạng thái* + bảng Markdown. |
| 9 | `99_cleanup.sql` | Xóa schema tạm `v1etl`. Chạy sau khi đã xem kết quả kiểm tra. |

### Cách 1 (khuyên dùng): trình chạy `run.mjs`
Cần Node 20+ và `psql` ≥ 15. Chuỗi kết nối: Dashboard → Project Settings → Database → *Connection string* (Session pooler, vai trò `postgres`).

```bash
export DATABASE_URL='postgresql://postgres.<ref>:<mật-khẩu>@aws-0-<vùng>.pooler.supabase.com:5432/postgres'
node tools/migrate-v1/run.mjs --dry-run      # 1) CHẠY THỬ: mọi bước trong 1 giao dịch rồi ROLLBACK — xem báo cáo, không ghi gì
node tools/migrate-v1/run.mjs                # 2) chạy thật: 00 → 06 rồi 91 (mỗi bước 1 giao dịch)
node tools/migrate-v1/run.mjs --only 05,06   #    chỉ vài bước (luôn kèm 00 và 91)
node tools/migrate-v1/run.mjs --cleanup      # 3) lần cuối (ngày chuyển hẳn): chạy thật rồi xóa schema tạm v1etl
```
- **Nhật ký từng bước**: màn hình in thời gian + số dòng ghi/sửa/xóa mỗi bước; chi tiết từng lệnh (command tag) ở
  `tools/migrate-v1/reports/migrate-<thời điểm>.jsonl`.
- **Báo cáo đối soát**: `tools/migrate-v1/reports/reconcile-<thời điểm>.md` và `.csv`. Mã thoát `3` nếu có hạng mục *LỆCH*
  (`--allow-diff` để bỏ qua), `1` nếu lỗi SQL — bước lỗi tự hoàn tác, các bước trước đã ghi; sửa rồi chạy lại.
- Thư mục `reports/` (đã gitignore) chứa tên HS — **không commit**, không gửi ra ngoài trường.

### Cách 2: SQL Editor
Mỗi file chạy riêng (dán cả file, bấm Run), theo đúng thứ tự bảng trên. Bước nào báo lỗi thì sửa rồi chạy lại **từ bước đó** — các bước đều chạy lại được (idempotent).

## Chạy lại trong thời gian hai app song song
Kế hoạch thí điểm, đồng bộ hằng đêm (`.github/workflows/nightly-migrate.yml`) và ngày chuyển hẳn: `docs/CUTOVER.md`.
Có thể chạy lại 00 → 05 bất cứ lúc nào để lấy dữ liệu mới từ app cũ:
- **Cập nhật lại** theo app cũ: vai trò, tên, username, lớp/khối của HS, thành viên lớp, tổ, số dư sao đầu kỳ, XP Đấu trường.
- **Không ghi đè** chỉnh sửa trên app mới: câu hỏi, bài giảng, khóa học đã chuyển trước đó; linh vật/màu/cài đặt HS tự chọn; sao HS kiếm trên app mới.
- Câu hỏi/bài mới thêm bên app cũ sẽ được thêm vào. Bài mới thêm vào một khóa học đã chuyển có thể không có nút trên bản đồ khóa học (trùng vị trí) — thêm tay trên app GV.

## Kiểm thử
- Hàm thuần của trình chạy: `node --test tools/migrate-v1/test/lib.test.mjs` (không cần CSDL, chạy trong CI).
- Tích hợp trên dữ liệu mẫu `test/fixture.sql` (Postgres + pgTAP ở máy, không cần Docker):
  `tools/run-db-tests.sh --plain --migrate` — kiểm tra chạy thử không ghi gì, đối soát khớp, chạy lại không đổi số dòng,
  dữ liệu mới bên app cũ được lấy thêm, không ghi đè phiếu TT27 GV đã sửa, `--cleanup`.

## Lịch sử học tập (bước 6) — quy tắc
| Cũ | Mới |
|---|---|
| điểm + thang (`score`, `total_score`/`max_score`; thiếu thang → 10) | bài nộp `text` "Điểm bài kiểm tra trên app cũ: 8/10", mức T (≥ 80%) / H (≥ 50%) / C |
| lời phê của GV (`teacher_comment`) | lời nhắn cho HS và phụ huynh |
| AI chấm cũ khớp `result_id`, trạng thái duyệt (`approved`/`published`/`true`) | `ai_grades.model = 'v1:<model>'`; chưa duyệt → bài *chờ duyệt* (GV duyệt trên app mới) |
| TT27: môn + mức (HTT/HT/CHT, T/H/C) + điểm + nhận xét; dòng không có môn = nhận xét chung | gộp 1 phiếu / HS × kì (GK1, CK1, GK2, CN) × năm học; phẩm chất mặc định *Đạt*; **bản nháp** |
| kì: "Giữa kì 1", "HK1", "Cuối năm"…; năm học: cột năm học / `academic_years` / suy từ ngày tạo | `term_id`, `school_year` dạng `2025-2026` |

Không chuyển được (HS không có tài khoản, đề không có lớp, kì không nhận ra…): `select * from v1etl.history_rejects;`.

## Quy tắc chuyển câu hỏi
| Cũ | Mới |
|---|---|
| có `options` + chỉ số đúng (`correct_option_index` / `correctOptionIndex` / `correct_index`, tính từ 0) | `MCQ`, lựa chọn id `a`,`b`,`c`,`d`…, `key.correct` = chữ tương ứng |
| nhiều chỉ số đúng (`correct_indices`) hoặc dạng `MULTI…` | `MCQ_MULTIPLE`, `key.correct` = mảng chữ |
| dạng `SHORT…/FILL…/TEXT…` hoặc chỉ có đáp án chữ (`correct_answer_string`, `answers`) | `SHORT_ANSWER`, `key.accepted` (tách theo `|` hoặc `;`) |
| `TRUE_FALSE` | `MCQ` hai lựa chọn Đúng / Sai |
| `MATCHING`, `ORDERING`, `DRAG…`… hoặc thiếu đáp án hợp lệ | **không chuyển** — liệt kê ở `90_verify.sql`, GV soạn lại bằng trình soạn mới |

- Nội dung HTML được bỏ thẻ; ảnh `<img>` đầu tiên thành `prompt.image`.
- Chống trùng: md5(dạng | nội dung chuẩn hóa | các lựa chọn). Ưu tiên giữ bản trong `question_bank`, rồi `arena_questions`, rồi `exams`.
- Khối lớp: cột grade › lớp của đề thi › `allowed_grades` của GV › lớp 1 kèm tag `can-kiem-tra-lop` (lọc theo tag này để sửa).
- Mã câu: `qb_<id>`, `ar_<id>`, `ex_<md5>`; `v2.items.legacy_ref` giữ mã gốc (`qb:12`, `ex:<examId>:<qid>`).
- Lượt giao bài cũ (`assignments`) không chuyển — app mới dùng giao bài mới. Đề thi có kết quả và điểm: xem bước 6.

## Quy đổi sao
Mặc định 1 điểm thi đua dương = 1 sao, không giới hạn. Đổi tỉ lệ / mức trần trong CTE `params` ở đầu `05_rewards.sql`
rồi chạy lại file (số dư đầu kỳ được cập nhật, không cộng hai lần). Mốc mở linh vật: 20, 50, 90, 140, 200, 270, 350, 440, 540 sao.

## Hoàn tác
- `rollback.sql`: xóa phần **đã chuyển** (lịch sử bước 6 — trừ phiếu TT27 GV đã sửa, câu hỏi, bài, khóa học, lớp, tổ, sổ thưởng đầu kỳ, XP Đấu trường) và tính lại hộ chiếu.
  Giữ hồ sơ và dữ liệu tạo mới trên v2. Phần C (xóa hồ sơ) để comment sẵn, chỉ bỏ comment khi thật cần.
- Hoàn tác toàn bộ: `drop schema v2 cascade;` rồi chạy lại `supabase/migrations/`. Schema `public` và `auth.users` không bị ảnh hưởng
  (trigger tạo hồ sơ v2 trên `auth.users` tự mất theo schema).

## Bảo mật cần làm sau khi chuyển hẳn
- Bảng cũ `public.parents` có cột `password` (mật khẩu thô). Mật khẩu thật đã nằm trong `auth.users` — **xóa cột này** khi tắt app cũ.
- Gỡ `public` khỏi *Exposed schemas* (hoặc bật RLS cho các bảng cũ) khi app cũ ngừng hoạt động.
