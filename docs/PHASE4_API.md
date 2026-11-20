# Phase 4 — Đánh giá & gắn kết: API cho người làm giao diện

Kiểu dữ liệu: `packages/contracts/src/assess.ts` (bài làm, rubric, AI chấm) và `engagement.ts` (TT27, thi đua, điểm danh).
Mã thuần: `packages/data/src/assess/*` (luật, lời nhắc, kiểm tra JSON, chấm mẫu — chép sang `supabase/functions/_shared/assess`
bằng `node tools/sync-scoring.mjs`), `packages/data/src/engagement.ts` (bảng thi đua, tóm tắt, `suggestTt27`).
Mọi hook trong `@openedu/data` đã invalidate đúng (duyệt bài → ví, thành thạo, hồ sơ, phụ huynh; ghi thi đua → bảng, ví…).

## 1. Bài làm & AI chấm (chấm bài bằng AI)

### Luồng
```
GV: useSaveRubric → useSaveWorkTask (giao lớp / vài HS)
HS: useWorkTasks({ studentId }) → useSubmitWork({ taskId, studentId, text?, images?: (File|Blob|dataURL)[], autoGrade? })
GV nộp hộ bài giấy: useSubmitWork({ …, submittedBy: 'teacher' })      (chụp nhiều HS liên tiếp: gọi lần lượt)
Chấm: useRequestAiGrade().mutate(submissionId)  → status 'graded' | 'needs-review' | 'error'
GV:  useSubmissions({ classId | taskId, status: ['graded','needs-review'] }) → useSubmission(id) (có grade, rubric, task)
     useReviewGrade().mutate({ submissionId, teacherId, decision, final?, note? })
       'approved' (giữ bản AI) · 'edited' (gửi phần sửa trong final) · 'regrade' (chấm lại AI) · 'redo' (trả bài, note hiện cho HS)
Duyệt ('approved'/'edited') → status 'approved' → learning_events (objectType 'work', weight 2) → thành thạo kĩ năng,
     +1/2/3 sao (C/H/T, một lần), hồ sơ `profile.work`, phụ huynh `summary.work`.
```
**Quy tắc hiển thị:** HS/phụ huynh KHÔNG thấy `grade`/`final` khi chưa `approved` (demo lọc theo người đăng nhập; Supabase: RLS).
`returned` → HS thấy `review.note`. `needs-review` tự bật khi `confidence < 0.7` hoặc có `flags`.

### DataSource / hook
| Hàm | Hook | Ghi chú |
|---|---|---|
| `listRubrics(f?)`, `getRubric(id)`, `saveRubric(r)`, `deleteRubric(id)` | `useRubrics`, `useRubric`, `useSaveRubric`, `useDeleteRubric` | GV. `id: ''` = tạo mới. HS (Supabase) không đọc được rubric (có bài mẫu) |
| `listWorkTasks({ classId?, studentId?, createdBy? })`, `getWorkTask`, `saveWorkTask`, `deleteWorkTask` | `useWorkTasks`, `useWorkTask`, `useSaveWorkTask`, `useDeleteWorkTask` | `studentIds: []` = cả lớp |
| `submitWork(input)` | `useSubmitWork` | ≤ 6 ảnh; nén JPEG ≤ 1600 px (`compressWorkImage`). Demo lưu dataURL; Supabase tải lên `submissions/<task>/<student>/…jpg` |
| `requestAiGrade(id)` | `useRequestAiGrade` | trả `SubmissionDetail`; lỗi → status `error` + `error` (tiếng Việt) |
| `listSubmissions({ taskId?, studentId?, classId?, status? })` | `useSubmissions(f, { refetchInterval? })` | mới trước; có `studentName`, `taskTitle`, `grade?`, `review?`, `final?` |
| `getSubmission(id)` | `useSubmission` | + `task`, `rubric` (GV) |
| `reviewGrade(review)` | `useReviewGrade` | GV của lớp |
| `getStudentWork(studentId)` | `useStudentWork` | `StudentWorkEntry[]` đã duyệt, mới trước |

### Kiểu chính (rút gọn)
```ts
Rubric { id; title; subject; grade; maxScore /*10*/; criteria: { id; name; description; points /*tối đa*/; levels?: {label; points; descriptor}[]; skills? }[];
  modelAnswer?; skills: string[]; aiNotes? }
WorkTask { id; title; prompt: { text; image? }; subject; grade; rubricId; classId; studentIds; dueAt?; allowPhoto; allowText; createdBy }
Submission { id; taskId; studentId; kind: 'photo'|'text'|'mixed'; text?; images: { url; width; height; path? }[];
  submittedBy: 'student'|'teacher'; status: 'submitted'|'grading'|'graded'|'needs-review'|'approved'|'returned'|'error'; error?; createdAt }
AiGrade { transcript: string[] /*mỗi ảnh*/; criteria: { criterionId; points; max; comment; evidence? }[]; total; max; level: 'T'|'H'|'C';
  strengths[]; issues: { text; skill?; misconception?; location? }[]; feedbackStudent; feedbackTeacher; feedbackParent;
  skills: { code; evidence: 'dung'|'sai'|'chua-ro' }[]; confidence; flags: ('unreadable'|'off-topic'|'possible-copy'|'low-confidence')[];
  model; mock? /*true = "Chấm mẫu (demo)"*/; createdAt }
GradeReview { submissionId; teacherId; decision: 'approved'|'edited'|'regrade'|'redo'; final?: Partial<GradeFinal>; note?; at }
GradeFinal { total; max; level; criteria: { criterionId; points; comment }[]; feedbackStudent; feedbackParent; feedbackTeacher? }
SubmissionDetail = Submission & { studentName?; taskTitle?; task?; rubric?; grade?; review?; final? }
StudentWorkSummary (profile.work) { latest: StudentWorkEntry[≤6]; counts: {T,H,C}; trend: 'tien-bo'|'on-dinh'|'giam'|null; pending }
StudentWorkEntry { submissionId; title; subject; at; level; total; max; comment; parentComment; teacherComment?; thumbnail?; kind; skills; edited; mock? }
```
Nhãn: `TT27_LEVEL_LABEL`, `SUBMISSION_STATUS_LABEL`, `GRADE_FLAG_LABEL`, `MOCK_GRADER_LABEL` ("Chấm mẫu (demo)"). Điểm hiển thị: `fmtScore(6.5)` → "6,5".

### Luật (`assess/rules.ts`)
- Tổng = Σ điểm tiêu chí (kẹp `[0, points]`, làm tròn 0,5) quy về `maxScore`; **không tin tổng AI tự cộng**.
- Mức: tỉ lệ ≥ 0,8 → **T**, ≥ 0,5 → **H**, còn lại **C**. GV sửa điểm tiêu chí mà không sửa tổng → tính lại tổng & mức.
- Duyệt: kĩ năng `dung` → sự kiện đúng (score = tỉ lệ), `sai` → sự kiện chưa đúng (score ≤ 0,5, kèm quan niệm sai); AI không nêu → `rubric.skills` theo mức. Mỗi sự kiện tính như **2 câu**. Duyệt lại thay sự kiện cũ (không tính trùng); sao chỉ cộng lần đầu.
- Lời nhắn HS được lọc: bỏ câu nhắc tới AI, thay từ nặng nề (“sai” → “chưa đúng”, “kém/dở/tệ” → “chưa tốt”), tối đa 4 câu.

### Bộ chấm
- **Supabase**: Edge Function `ai-grade` (OpenRouter `google/gemini-2.5-flash` → dự phòng Gemini REST; ảnh tải từ Storage gửi dạng base64; hạn mức `ai_usage` bucket `grade`).
- **Demo**: `mockGrader.ts` tất định (từ khoá/số trên bài đánh máy, bản chép có sẵn cho 5 ảnh mẫu; ảnh người dùng tải lên → `unreadable`, GV chấm tay). `grade.mock = true` → hiện nhãn **Chấm mẫu (demo)**.
- **Demo + `VITE_DEMO_AI_KEY`** (khóa OpenRouter, tuỳ chọn `VITE_DEMO_AI_MODEL`): gọi OpenRouter thẳng từ trình duyệt với cùng lời nhắc/kiểm tra JSON.
  ⚠ **Chỉ để trình diễn**: khóa nằm trong JS gửi xuống máy, ai mở DevTools cũng đọc được — dùng khóa có hạn mức thấp, không dùng khi triển khai thật. `demoAiEnabled()` cho biết đang bật.

## 2. TT27, thi đua, điểm danh
| Hàm | Hook | Ghi chú |
|---|---|---|
| `listTt27({ classId?, studentId?, termId?, schoolYear? })` | `useTt27(f)` | HS/phụ huynh chỉ thấy `status: 'final'` |
| `saveTt27(e)` | `useSaveTt27` | khoá (studentId, termId, schoolYear) |
| `suggestTt27(studentId, termId)` | `useSuggestTt27().mutate({ studentId, termId })` | `Tt27Suggestion` = nháp + `basis[]` (căn cứ cho GV). GV luôn sửa rồi `saveTt27` |
| `listBehaviors(classId)`, `saveBehavior(b)` | `useBehaviors`, `useSaveBehavior` | lớp chưa có danh sách riêng → `DEFAULT_BEHAVIORS` (9 mục: Hăng hái phát biểu +1, Giúp đỡ bạn +2, Giữ trật tự +1, Hoàn thành bài tập +1, Vở sạch chữ đẹp +1, Trung thực +2, Quên đồ dùng −1, Nói chuyện riêng −1, Chưa làm bài tập −1) |
| `listBehaviorLogs({ classId?, studentId?, from?, to?, limit? })` | `useBehaviorLogs` | mới trước |
| `recordBehavior({ classId, behaviorId, studentIds[], note?, by })` | `useRecordBehavior` | ghi cả tổ/lớp một lần; điểm dương → +sao (1 sao/điểm, `sourceType 'behavior'`) |
| `undoBehavior(logId)` | `useUndoBehavior` | xoá lần ghi và sao đã cộng |
| `getClassLeaderboard(classId, { from?, to? })` | `useClassLeaderboard` | mặc định thứ Hai 0 giờ (giờ VN) → nay. `mode: 'team'` lớp 1–3 (hiện tổ trước), `'student'` lớp 4–5; `teams[]`, `students[]` đã sắp |
| `listAttendance(classId, { from?, to? })`, `saveAttendance(r)` | `useAttendance`, `useSaveAttendance` | `AttendanceRecord { classId; date 'YYYY-MM-DD'; entries: Record<studentId, 'co-mat'\|'vang-co-phep'\|'vang-khong-phep'\|'muon'> }` |

```ts
Tt27Evaluation { studentId; classId; termId: 'GK1'|'CK1'|'GK2'|'CN'; schoolYear '2026-2027';
  subjects: Partial<Record<SubjectId, { level: 'T'|'H'|'C'; comment; score? }>>;
  qualities: Record<'yeu-nuoc'|'nhan-ai'|'cham-chi'|'trung-thuc'|'trach-nhiem', 'T'|'Đ'|'C'>;
  competencies: Partial<Record<'tu-chu-tu-hoc'|'giao-tiep-hop-tac'|'gqvd-sang-tao'|'ngon-ngu'|'tinh-toan'|'khoa-hoc'|…, 'T'|'Đ'|'C'>>;
  generalComment; status: 'draft'|'final'; updatedBy?; updatedAt? }
```
Nhãn: `TT27_TERM_LABEL`, `TT27_RATING_LABEL`, `TT27_QUALITY_LABEL`, `TT27_COMPETENCY_LABEL`, `ATTENDANCE_LABEL`; `schoolYearOf(date)`.
`suggestTt27`: mức môn = 60% thành thạo (kĩ năng ≥ 3 lần làm) + 40% bài viết đã duyệt (T 1 · H 0,65 · C 0,3) → ≥ 0,8 T · ≥ 0,5 H;
nhận xét "điểm mạnh → bài làm tốt → cần rèn thêm"; phẩm chất từ điểm thi đua 60 ngày; năng lực từ học tập. `score` (KTĐK) để GV nhập.

## 3. Hồ sơ HS & phụ huynh (thay chỗ trống cũ)
`StudentProfile`: `work: StudentWorkSummary` · `behavior: BehaviorSummary | null` (tuần: điểm, khen, nhắc; topPositive/topNeedsWork 30 ngày; recent ≤ 10) ·
`attendance: AttendanceSummary | null` (30 ngày: days, present, late, excused, unexcused, rate, recentAbsences) · `tt27: Tt27Evaluation | null` (mới nhất; HS/PH chỉ bản final) ·
`timeline` thêm `kind: 'work'`. `pendingModules` luôn `{}` (bỏ).
`ParentSummary.work: { title; level; sentence; tip; at } | null` + `sentences` thêm câu bài làm, thi đua tuần, chuyên cần (khi có vắng/muộn).

## 4. Dữ liệu demo (mật khẩu 123456)
GV `cothu` (4A), `thaynam` (3C), `colan` (2A); phụ huynh `phuhuynh4a` → Ngọc Lan.
| Bài | Bài nộp |
|---|---|
| Toán 4 "Hai lớp trồng cây" (tổng–hiệu) | Hải ảnh ✔ duyệt T · Lan gõ ✔ T · Khoa ảnh (quên nhớ, ảnh nhòe) ⚠ cần xem · Nam ảnh (thiếu lời giải) chờ duyệt · Vy gõ (nhầm số lớn/bé) **chưa chấm** |
| Tiếng Việt 4 "Tả con vật" | Lan ảnh ✔ T · Mai gõ ✔ T · Tuấn ảnh (nhòe 1 đoạn) ⚠ cần xem · Hải gõ chờ duyệt · Thảo gõ **chưa chấm** |
| Toán 5 "Chuyển động đều" (Hải, Mai) | Hải ✔ T · Mai ✔ GV sửa lời nhắn (đổi 2,3 giờ) |
| Tiếng Việt 3 "Việc tốt" (3C) | Phương ✔ T |
Ảnh mẫu: `packages/data/src/seed/work-images/*.png` (vẽ lại: `node tools/gen-work-images.mjs`). Thi đua + điểm danh 2 tuần cho 4A, 2A
(lịch sử mẫu không kèm sao); TT27 giữa HK I (final) cho 4A, 2A soạn bằng `suggestTt27`.
