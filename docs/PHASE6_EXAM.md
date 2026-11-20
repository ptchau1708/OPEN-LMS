# Phase 6 — Đề kiểm tra theo ma trận + chống gian lận nhẹ

Kiểu: `packages/contracts/src/exam.ts`. Mã: `packages/data/src/exam/*` — thuần: `matrix` (mức, TN/TL, sinh đề A/B, câu thay thế),
`shuffle` (xáo theo seed), `scoring` (điểm, thang 10), `integrity` (tóm tắt trung tính), `report` (báo cáo, CSV, thẻ HS);
nguồn: `demo.ts`, `supabase.ts`; `service.ts` (`getExamService(ds)`, tải động — app HS chỉ tải khi gọi); `hooks.ts`; `seed.ts`.
Tách khỏi `DataSource` (không đổi interface). Supabase: migration `20261115000001_v2_exam.sql`, Edge Function `grade` action `exam-finalize`
(`supabase/functions/grade/exam.ts`). Kiểm thử: `src/__tests__/exam.test.ts`, `supabase/tests/database/rls_exam.test.sql` (34 test).

## 1. Ma trận (kiểu TT27)
- Hàng = mạch kiến thức (`MatrixRow { id, label, skills[] }`; mặc định `defaultRows(subject, grade)` gom kĩ năng theo nội dung; môn có kĩ năng tạm → mỗi kĩ năng 1 hàng).
- Cột = Mức 1 (nhận biết) · Mức 2 (kết nối) · Mức 3 (vận dụng). Ô `cells["<rowId>:<mức>"] = { tn, tl, points }` (points = điểm mỗi câu, bội 0,25).
- **Mức của câu** (`itemLevel`): thẻ `muc:1|2|3` (GV gắn trong Ngân hàng, ưu tiên) → `difficulty` (`nhan-biet`→1, `ket-noi`→2, `van-dung`→3) → không có thì Mức 1 (`inferred`).
- **Dạng** (`itemQType`): TL = `SHORT_ANSWER`, `FILL_IN_PASSAGE` không có kho từ; TN = các dạng chấm được còn lại; `DRAW`/`RECORD_READ`/`POLL` không vào đề.
- Câu khớp ô: cùng môn + lớp, cùng mức, cùng dạng, có ≥ 1 kĩ năng thuộc hàng.
- `generatePaper(matrix, bank, { seed, recent })`: đề A lấy câu chưa dùng trong đề (xếp: ít dùng trong 60 ngày trước → khớp kĩ năng chính → ngẫu nhiên theo seed);
  đề B ưu tiên câu không có trong đề A, thiếu thì dùng lại câu A. Thiếu → slot `itemId: null` + `ExamShortfall.message` "Thiếu 2 câu Mức 3 – Phân số (tự luận)";
  "Đề B dùng lại 1 câu của đề A ở …". Thứ tự đề: TN trước, TL sau. GV đổi tay từng câu (`candidates`, `swapSlot`); không giao được khi còn ô trống.
- Mẫu: `MATRIX_TOAN4_CK1` (14 câu, 10 điểm) và `MATRIX_TOAN5_GK1` (13 câu, 10 điểm); thêm 26 câu (`EXAM_EXTRA_ITEMS`, chủ yếu Mức 3) — demo tự lưu vào ngân hàng; Supabase: GV nhập qua Ngân hàng hoặc script nạp mẫu.

## 2. Đề & làm bài trực tuyến
`Exam`: lớp (+ `studentIds` tuỳ chọn), `openAt`/`closeAt`, `durationMin`, `resultsPolicy` (`immediate` | `after-release` + `releasedAt`),
`maxAttempts` (1), `onlineVariants` (`A` | `AB` — máy chia ngẫu nhiên), `fullscreenPrompt`, `status` (`draft` | `published`), `paper {A,B}`.
- Hạn nộp mỗi lần làm = min(bắt đầu + thời gian, giờ đóng). Nhận câu trả lời tới hạn + 30 giây. Bài quá hạn được nộp hộ khi HS/GV mở lại (demo) hoặc khi GV mở Kết quả (Supabase, qua `grade`).
- Câu gửi xuống máy HS **không có đáp án** (`item_to_json(…, false)`); thứ tự câu (xáo trong phần TN và TL) + thứ tự lựa chọn MCQ xáo theo `seed` của lần làm (`arrangeForStudent`; giữ nguyên nếu thẻ `giu-thu-tu` hoặc có lựa chọn kiểu "Tất cả…").
- Tự lưu từng câu (0,7 giây sau khi đổi, khi chuyển câu, trước khi nộp): `{ response, ms (thời gian ở câu), flagged }`.
- Chấm: điểm từng phần × điểm ô; `score10` = làm tròn (0,5 lên) điểm/thang × 10, tối thiểu 1 (TT27: không điểm 0, không điểm thập phân).
  Mỗi câu ghi `learning_events` (`verb 'answered'`, `object_type 'exam'`, `object_id` = id câu, `assignment_id 'exam:<id>'`, kĩ năng + quan niệm sai) → tính vào thành thạo. Không cộng sao.
- Kết quả cho HS chỉ khi `immediate` hoặc GV đã công bố; trước đó chỉ biết "đã nộp".
- Gợi ý TT27: `suggestTt27` nhận `examScores` (lớp 4–5, bài mới nhất cùng `termId`, đã công bố) → `subjects[môn].score` (Điểm KTĐK) + dòng căn cứ.

## 3. Chống gian lận nhẹ (không trừ điểm)
Máy HS ghi (`logIntegrity`, gửi theo lô mỗi 20 giây + khi nộp): `hidden` (visibilitychange), `blur` (rời cửa sổ > 300 ms, không trùng `hidden`) kèm `awayMs`,
`fullscreen-exit`, `paste-blocked` (dán / kéo thả chữ vào ô gõ bị chặn; sao chép/cắt cũng bị chặn trong bài). Server ghi `duplicate-session`
(phiên khác có nhịp < 45 giây — HS thấy lời nhắc "Bài này đang mở ở máy hoặc tab khác") và `resume` (mở lại sau khi phiên cũ đã im).
Tóm tắt `summarizeIntegrity`: "Rời màn hình 3 lần (tổng 1 phút 20 giây)", "Thoát toàn màn hình 1 lần", "Thử dán chữ 2 lần (máy đã chặn)",
"Bài được mở cùng lúc ở máy hoặc tab khác (1 lần)", "Mở lại bài 1 lần", "Trả lời rất nhanh N câu (dưới 3 giây)" (khi N ≥ 3),
"Nộp bài sau … — nhanh hơn nhiều" (< 25% thời gian và đúng ≥ 90%). Tối đa 300 sự kiện/lần làm.

## 4. Giao diện
GV (`/de-kiem-tra`, menu Đánh giá → Đề kiểm tra): danh sách ma trận + đề; `/de-kiem-tra/ma-tran/:id|moi` (bảng ô TN/TL/điểm, "có N" câu trong ngân hàng, ô thiếu tô cam,
tổng theo mức/hàng); `/de-kiem-tra/ra-de?maTran=` và `/:id/sua` (thiếu câu, đề A/B, đổi câu, cài đặt, Giao cho lớp); `/:id/in?xem=A|B|key|all`
(A4, Times, khung điểm/nhận xét, Phần I TN / Phần II TL, đáp án + hướng dẫn chấm, CSS in); `/:id/ket-qua` (phổ điểm, % theo ô ma trận, độ khó p từng câu,
danh sách HS + gợi ý mức T ≥ 9 / H ≥ 5 / C + ghi chú, Chi tiết mốc thời gian, Cho làm lại, Công bố kết quả, Xuất CSV).
HS: thẻ "Bài kiểm tra" trên Hôm nay (tải lười), `/kiem-tra/:examId`: nội quy (+ nghe đọc) → Bắt đầu (toàn màn hình nếu máy hỗ trợ) → đồng hồ cả bài, bảng câu,
"Xem lại sau", tự lưu, nhắc còn 5/1 phút, hết giờ tự nộp → xác nhận nộp (số câu chưa làm / đánh dấu) → điểm + từng câu (cam = cần ôn) hoặc "Cô sẽ báo điểm sau".

## 5. Supabase
| Bảng | Quyền |
|---|---|
| `exam_matrices` | GV/admin đọc; chủ/admin ghi |
| `exams` | GV của lớp đọc/ghi (HS **không** đọc — dùng RPC) |
| `exam_attempts`, `exam_answers`, `integrity_events` | GV của lớp chỉ đọc; không ai ghi trực tiếp (HS qua RPC, điểm chỉ service role) |

RPC HS: `exam_my_list()`, `exam_start(exam, session)`, `exam_save_answer(attempt, item, response, ms, flagged)`, `exam_log_integrity(attempt, events)`,
`exam_heartbeat(attempt, session)`, `exam_my_result(exam)`, `exam_scores(student)` (chính em, GV, phụ huynh, admin). RPC GV: `exam_allow_retake(exam, student)`;
công bố = `update exams set released_at`. Service role: `exam_record_results(...)` (một giao dịch: điểm + `learning_events`; chỉ khi bài đang làm).
Edge Function `grade` `{ action: 'exam-finalize', attemptId }`: HS nộp bài của mình; GV/admin của lớp nộp hộ bài đã quá giờ. `learning_events.object_type` thêm `'exam'`;
`_shared/mastery-store.ts` đọc cả `'exam'`.
Chạy kiểm thử CSDL: `tools/run-db-tests.sh --plain`.

## 6. Demo
GV `cothu`/123456: ma trận mẫu, đề "Kiểm tra cuối học kì I – Toán 4" (4A, mở 7 ngày, A/B, điểm hiện ngay) với 6 bài làm mẫu (có ghi chú rời màn hình / trả lời nhanh / mở trùng).
HS `lan4a2` (Ngọc Lan) hoặc `vy4a6` chưa làm → thấy thẻ trên Hôm nay. Kho localStorage riêng theo origin: đề GV tạo ở app GV không sang app HS (Supabase thì có).
