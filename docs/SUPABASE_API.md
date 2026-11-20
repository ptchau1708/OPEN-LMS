# Hợp đồng Supabase (schema `v2`) — dùng chung giữa `supabase/` và `packages/data`

Dự án dùng lại project Supabase hiện có (gói Free), thêm schema `v2`. Schema `public` cũ giữ nguyên để app cũ chạy song song.
Client: `createClient(url, anonKey, { db: { schema: 'v2' } })`. Cần thêm `v2` vào *Exposed schemas* trong API settings.

## Bảng (đợt 1 dùng tới)
| Bảng | Ghi chú |
|---|---|
| `profiles` (id uuid = auth.users.id, role, name, username, grade, class_id, avatar_mascot, avatar_color, settings jsonb) | role ∈ student, teacher, admin, parent |
| `classes` (id text, name, grade, teacher_id) | |
| `class_members` (class_id, user_id, role, team_id) | |
| `class_teams` (id, class_id, name, color) | tổ/nhóm thi đua |
| `guardian_links` (parent_id, student_id) | |
| `items` (id text, type, grade, subject, skill, difficulty, prompt jsonb, payload jsonb, hint, explanation, stars, tags text[], owner_id, updated_at) | KHÔNG chứa đáp án |
| `item_keys` (item_id text pk, key jsonb) | HS không đọc được (RLS) |
| `lessons` (id text, title, subject, grade, description, mascot, owner_id, status, minutes, updated_at) | |
| `lesson_slides` (id text, lesson_id, position int, layout, data jsonb) | data = phần còn lại của Slide |
| `courses`, `course_nodes` | |
| `packages` (id, kind, title, base_url, entry, owner_id, created_at) | |
| `assignments` (id, target_type, target_id, title, class_id, student_ids text[], open_at, due_at, created_by) | |
| `lesson_progress` (user_id, lesson_id, slide_index, completed_slides text[], answers jsonb, stars_earned, completed_at, updated_at) | khóa (user_id, lesson_id) |
| `learning_events` (id, user_id, verb, object_type, object_id, lesson_id, assignment_id, live_session_id, result jsonb, at) | chỉ ghi qua RPC/Edge Function |
| `reward_ledger` (id, user_id, stars, coins, xp, reason, source_type, source_id, at) | chỉ ghi qua RPC/Edge Function |
| `wallets` (VIEW tổng hợp từ reward_ledger + streak) | |
| `passports` (user_id, unlocked text[], companion) | |
| `live_sessions` (id uuid, pin char(6), lesson_id, class_id, teacher_id, state jsonb, created_at, ended_at) | |
| `live_responses` (id, session_id, user_id, item_id, slide_index, response jsonb, correct, score, at) | bật Realtime |
| `skills` (code pk, subject, grade, strand, topic, text, short, prereqs text[], provisional, position) | danh mục yêu cầu cần đạt; ai cũng đọc, admin ghi. Dữ liệu: `supabase/seed/skills.sql` (sinh bởi `node tools/gen-skills-sql.mjs`) |
| `misconceptions` (code pk, text, kid_hint, skill_code, root_skill) | quan niệm sai; ai cũng đọc |
| `item_skills` (item_id, skill_code, position) | gắn thẻ câu hỏi; ai cũng đọc, chủ item/admin ghi (`saveItem` ghi khi `item.skills` có) |
| `skill_mastery` (user_id, skill_code, level, p, attempts, correct_streak, distinct_days, last_at, misconceptions jsonb, review_stage, next_review_at, was_gap, recent_wrong jsonb, updated_at) | khóa (user_id, skill_code). Đọc: HS chính mình, GV của HS, phụ huynh, admin. **Chỉ Edge Function `grade` ghi** |
| `rubrics` (id, title, subject, grade, max_score, criteria jsonb, model_answer, skills text[], ai_notes, owner_id, updated_at) | GV/admin đọc; chủ/admin ghi (Phase 4) |
| `work_tasks` (id, title, prompt jsonb, subject, grade, rubric_id, class_id, student_ids text[], due_at, allow_photo, allow_text, created_by, created_at) | GV lớp ghi; HS được giao + phụ huynh đọc |
| `submissions` (id uuid, task_id, student_id, class_id, kind, text, images jsonb `[{path,width,height}]`, submitted_by, submitter_id, status, error, created_at, updated_at) | HS nộp của mình, GV nộp hộ (insert status 'submitted'); đổi trạng thái chỉ `ai-grade`. Phụ huynh: chỉ 'approved' |
| `ai_grades` (submission_id pk, data jsonb AiGrade, total, max, level, confidence, flags, model, repairs, created_at) | chỉ `ai-grade` ghi; HS/PH đọc khi bài 'approved' |
| `grade_reviews` (submission_id pk, teacher_id, final jsonb, decision, note, at) | chỉ `ai-grade` ghi; HS thấy note khi 'returned' |
| `tt27_evaluations` (student_id, class_id, term_id, school_year, data jsonb, status, updated_by, updated_at) pk (student_id, term_id, school_year) | GV lớp ghi; HS/PH đọc bản 'final' |
| `behaviors` (class_id, id, label, points, icon, kind, position) | thành viên lớp đọc; GV ghi (trống = danh sách mặc định) |
| `behavior_logs` (id uuid, student_id, class_id, behavior_id, points, note, team_id, at, by) | ghi/hoàn tác qua RPC; GV, HS, PH đọc |
| `attendance` (class_id, date, student_id, status, updated_by, updated_at) pk (class_id, date, student_id) | GV lớp ghi; HS/PH đọc dòng của mình |

Storage: bucket riêng tư **`submissions`** (≤ 5 MB, jpeg/png/webp), đường dẫn `<task_id>/<student_id>/<file>.jpg`: HS tải lên thư mục của mình (bài được giao), GV lớp tải/đọc/xoá, phụ huynh đọc ảnh bài đã duyệt. Client đọc bằng URL có ký (1 giờ).

`learning_events.object_type` có thêm `work` (bài làm đã duyệt: `result = { correct, score, skills, misconceptions, weight: 2, response: { taskId, title, level, total, max } }`; chỉ `ai-grade` ghi). `reward_ledger.source_type` có thêm `work` (dedupe `work:<submissionId>`). `ai_usage.bucket` có thêm `grade`.
`learning_events.object_type` có thêm `remediation` (verb `completed`, chỉ Edge Function ghi; `result = { correct: đạt, score, correctCount, total, skills }`).
Sự kiện `answered` có thêm `result.skills` và `result.misconceptions` (Edge Function ghi kèm qua `v2.annotate_answer`).
`Choice.misconception` được client chuyển sang `item_keys.key.misconceptions` khi lưu (HS không thấy lựa chọn nào sai).

## RPC (Postgres function, `security definer`, kiểm tra quyền bên trong)
| Hàm | Trả về | Ai gọi |
|---|---|---|
| `v2.get_lesson(p_id text)` | jsonb Lesson (có `slides` theo position) | mọi người đã đăng nhập (HS chỉ bài `published`) |
| `v2.save_lesson(p_lesson jsonb)` | jsonb Lesson | GV chủ bài, admin |
| `v2.get_items(p_ids text[])` | jsonb mảng Item; có `key` chỉ khi người gọi là GV/admin | đã đăng nhập |
| `v2.save_item(p_item jsonb)` | jsonb Item (tách `key` sang `item_keys`) | GV, admin |
| `v2.award_bonus(p_user uuid, p_stars int, p_reason text)` | jsonb Wallet | GV của lớp HS đó (tối đa 5 sao/lần) |
| `v2.complete_lesson(p_lesson_id text)` | jsonb `{ wallet, newlyUnlocked }` | HS; thưởng hoàn thành 1 lần/bài, số sao theo `lesson_progress.answers` |
| `v2.start_live(p_lesson_id text, p_class_id text)` | jsonb `{ sessionId, pin, lessonId, lessonTitle }` | GV |
| `v2.find_live(p_pin text)` | jsonb như trên hoặc null | đã đăng nhập |
| `v2.update_live_state(p_session_id uuid, p_state jsonb)` | void | GV chủ phiên |
| `v2.set_companion(p_mascot text)` | jsonb Passport | HS (chỉ linh vật đã mở) |
| `v2.get_student_profile(p_user uuid)` | jsonb thô `{ profile, class (+teacher_name, class_members, class_teams), wallet, passport, masteries[], assignments[], lessons[{id,title,subject,slide_ids}], progress[], events[300, không có result.response], rewards[100] }` — client lắp `StudentProfile` bằng `buildStudentProfile` | HS chính mình, GV của HS, phụ huynh, admin |
| `v2.get_class_heatmap(p_class text)` | jsonb `{ class, students[], masteries[] }` — client dựng `ClassHeatmap` / `GapGroup[]` | GV của lớp, admin |
| `v2.get_parent_summary(p_child uuid)` | jsonb `{ profile, masteries[], events[15 ngày], rewards[15 ngày] }` — client viết câu bằng `buildParentSummary` | phụ huynh, GV, chính HS, admin |
| `v2.annotate_answer(p_user, p_item_id, p_extra jsonb)` | void | chỉ service role (Edge Function) |
| `v2.record_behavior(p_class text, p_behavior text, p_students uuid[], p_note text)` | jsonb `BehaviorLog[]` | GV của lớp; điểm dương cộng sao (`_award`, dedupe `behavior:<logId>`) |
| `v2.undo_behavior(p_log uuid)` | void | GV của lớp; xoá log + dòng sao |
| `v2.get_student_extras(p_user uuid)` | jsonb `{ works[{submission, task, grade, review}] (đã duyệt), workPending, behaviors[], behaviorLogs[90 ngày], attendance[45 ngày], tt27 (mới nhất; HS/PH chỉ final) }` — client ghép vào hồ sơ / phụ huynh | như `get_student_profile` |

## Edge Functions
| Hàm | Vào | Ra | Ghi chú |
|---|---|---|---|
| `grade` | `{ itemId, response, context: { lessonId?, assignmentId?, liveSessionId?, slideIndex? } }` | `{ correct, score, graded, starsAwarded, wallet, newlyUnlocked, skills, mastery: SkillMastery[] }` | Đọc item + key bằng service role, chấm bằng mã `scoring` chép từ activity-engine, ghi `learning_events`, `live_responses` (nếu có liveSessionId), cộng sao lần đúng đầu tiên; ghi kèm skills/misconceptions rồi tính lại & upsert `skill_mastery` bằng `_shared/mastery` (chép từ packages/data/src/mastery) |
| `grade` (bộ ôn tập) | `{ action: 'remediation', setId, itemIds: string[], rootSkill? }` | `{ setId, skillCode, passed, correct, total, mastery, message }` | Tự đếm đúng/sai từ câu trả lời gần nhất (≤ 3 giờ) của từng item; ghi `learning_events` (completed/remediation); cập nhật chặng ôn +1/+3/+7 ngày |
| `ai-grade` | `{ submissionId }` (HS chủ bài / GV lớp) · `{ action: 'review', review: { submissionId, decision, final?, note? } }` (GV lớp) | `SubmissionDetail` (HS: không kèm grade trước khi duyệt) | Chấm: ảnh từ Storage → base64 → OpenRouter (`OPENROUTER_GRADE_MODEL`, mặc định google/gemini-2.5-flash) → dự phòng Gemini (`GEMINI_GRADE_MODEL`); lời nhắc + kiểm tra JSON bằng `_shared/assess`; hạn mức `AI_DAILY_LIMIT_GRADE` (GV, 200) / `AI_DAILY_LIMIT_GRADE_STUDENT` (10). Duyệt: learning_events 'work' → `refreshMastery` → `_award` 1–3 sao |
| `ai-gateway` | `{ task, input }` | `{ text }` | OpenRouter → Gemini; khóa trong secrets; hạn mức theo người dùng/ngày |
| `pkg-sign` | `{ packageId, files: string[] }` | `{ uploads: { path, url }[] }` | URL tải lên có ký tới Cloudflare R2 (S3 API) |

## Realtime
- Kênh `live:{sessionId}`: broadcast `state` (LiveState, do GV gửi sau mỗi lệnh, đồng thời lưu `update_live_state`), presence (LiveParticipant).
- `live_responses`: postgres_changes INSERT lọc `session_id=eq.{id}` cho GV và TV.
- Gói Free: 200 kết nối đồng thời — chỉ mở kênh khi đang trong lớp trực tiếp.

## Hồ sơ học sinh & lỗ hổng kiến thức
Hợp đồng chi tiết cho giao diện: `docs/STUDENT_PROFILE_API.md`. Triển khai: migration `20261111000001_v2_skills.sql`, rồi chạy
`supabase/seed/skills.sql` (SQL Editor), rồi `node tools/sync-scoring.mjs` và deploy lại `grade`.

## Phase 4 — bài làm & AI chấm, TT27, thi đua, điểm danh
Hợp đồng cho giao diện: `docs/PHASE4_API.md`. Triển khai: migration `20261111000002_v2_assess.sql` (bảng, RLS, RPC, bucket `submissions`),
chạy lại `supabase/seed/skills.sql` (thêm 5 kĩ năng tạm Tiếng Việt viết, 2 quan niệm sai), `node tools/sync-scoring.mjs`
(chép `packages/data/src/assess` → `_shared/assess`), deploy `ai-grade` và deploy lại `grade` (`_shared/mastery-store.ts` nay tính cả sự kiện 'work').

## Phase 5 — phụ huynh thật, mã liên kết, báo cáo trường, quản trị
Hợp đồng cho giao diện: `docs/PHASE5_API.md`. Triển khai: migration `20261113000002_v2_school.sql`, deploy Edge Function `school-admin`
(`verify_jwt = false` trong config.toml; secret tuỳ chọn `STUDENT_EMAIL_DOMAIN`, mặc định openlms.edu — trùng `VITE_STUDENT_EMAIL_DOMAIN`).

| Bảng | Ghi chú |
|---|---|
| `school_settings` (id bool pk = true, data jsonb `{schoolName, schoolYear, termId, aiDailyQuota}`) | ai cũng đọc; ghi qua `admin_save_settings` |
| `guardian_codes` (code pk 8 kí tự, student_id, class_id, created_by, created_at, expires_at +14 ngày, used_at, used_by, revoked_at) | GV lớp/admin đọc; chỉ RPC ghi |
| `guardian_code_attempts` (user_id, day, failures) | đếm lần nhập sai (≤ 10/ngày) |
| `guardian_links` | + trigger tối đa 4 phụ huynh/HS, chỉ profile role `parent` |

| RPC | Trả về | Ai gọi |
|---|---|---|
| `v2.create_guardian_codes(p_class text, p_students uuid[] = null)` | jsonb mảng mã (+ student_name); thu hồi mã còn hạn cũ | GV lớp, admin |
| `v2.list_guardian_codes(p_class)` · `v2.revoke_guardian_code(p_code)` | jsonb / void | GV lớp, admin |
| `v2.redeem_guardian_code(p_code, p_relation = null, p_parent = null)` | `{ child, already_linked }` | phụ huynh (p_parent chỉ service role) |
| `v2.list_guardian_links(p_class)` · `v2.revoke_guardian_link(p_parent, p_student)` | jsonb (email/SĐT che) / void | GV lớp, admin |
| `v2.school_report(p_from, p_to)` | `{ settings, classes[], mastery[], teachers, attendance, ai }` | admin (cả trường), GV (lớp mình) |
| `v2.grade_skill_report(p_grade, p_subject)` | `{ classes[], cells[{class_id, skill_code, n, avg_p, counts}] }` | admin, GV (lớp mình) |
| `v2.admin_save_settings(p_data)` · `v2.admin_save_class(p_class jsonb)` · `v2.admin_list_users(p_role, p_class)` | jsonb | admin (list: GV thấy HS lớp mình) |

Edge Function `school-admin`: `register-parent` (không JWT; kiểm tra mã trước → `auth.admin.createUser` email đã xác nhận, `app_metadata.role='parent'` → redeem), `create-teacher`, `create-students` (admin; `app_metadata {role, username, grade, class_id}` + `class_members`), `reset-password` (admin / GV của HS). Mật khẩu chỉ trả về một lần.
`v2.handle_new_auth_user` được vá: qua GoTrue chỉ tin `app_metadata.role` (user_metadata chỉ `parent`); đọc `app_metadata.username/grade/class_id`; phụ huynh SĐT → username = số.
⚠ `public.parents.password` (chữ thường) không dùng lại — xem PHASE5_API.md §5.

## Đấu 1–1 (migration `20261113000001_v2_duels.sql`)
Bảng `duels` (id, code 4 số, class_id, players, item_ids, status, scores, winner, created_at, ended_at) và `duel_answers` — HS chỉ đọc, ghi qua RPC / Edge Function.
| RPC | Ghi chú |
|---|---|
| `v2.duel_seek(p_subject)` | Tìm bạn cùng lớp/khối đang chờ, không có thì tạo phòng chờ |
| `v2.duel_create(p_subject, p_invitee?)` / `v2.duel_join(p_code)` | Thách một bạn cụ thể / vào phòng bằng mã 4 số |
| `v2.duel_create_bot(p_subject)` | Đấu với bạn Robo |
| `v2.duel_get`, `v2.duel_skip`, `v2.duel_cancel`, `v2.duel_finish(p_id, p_claim_forfeit)` | Trạng thái, hết giờ một câu, hủy, kết thúc (thắng do bạn rời trận sau 20 giây) |
| `v2.duel_stats(p_user)` | Số trận, số thắng, tỉ lệ thắng (hồ sơ HS trong app GV) |
Câu trả lời chấm qua Edge Function `grade` với `context.duelId`; sao: 1 khi tham gia, +2 khi thắng, tối đa 5 sao/ngày. Kênh Realtime riêng tư `duel:{id}` (chính sách `v2.can_access_duel_topic`).

## Phase 6 — huy hiệu, cửa hàng trang phục, Vườn lớp
Hợp đồng + bảng + RPC: `docs/PHASE6_REWARDS.md`. Migration `20261113000009_v2_rewards.sql` (vá `_award`: 1 sao = 1 xu; `reward_ledger.source_type` thêm `shop`).

## Nạp nguồn dữ liệu
App gọi `initDataSource()` (tải động bản demo hoặc Supabase) trước khi render; sau đó `getDataSource()` / `getSchoolSource()` dùng đồng bộ. Nhờ vậy bản Supabase không chở dữ liệu mẫu và JS tải ban đầu của app HS còn ~118 KB gzip.
