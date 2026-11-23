# Nộp bài và chấm bài (Bài viết)

1. GV giao **Bài viết** (đề, tiêu chí chấm, lớp/HS, hạn nộp) → `v2.work_tasks`.
2. HS làm tại `/bai-viet/<mã>`: chụp ảnh vở hoặc đánh máy (nháp lưu trên máy). **Nộp** → ảnh vào Storage
   bucket `submissions` (`<bài>/<HS>/…jpg`), dòng bài nộp ở `v2.submissions` (status `submitted`).
3. Chấm — hai cách:
   - **Tự chấm** (không cần AI): GV chọn mức **T/H/C**, (tuỳ chọn) nhập điểm hoặc chấm từng tiêu chí, viết nhận xét
     → **Lưu & duyệt**. Bỏ trống điểm = điểm gợi ý theo mức (T 90%, H 70%, C 40% thang điểm); bỏ trống nhận xét = câu mẫu
     theo mức. Bản chấm lưu ở `v2.ai_grades` (model `manual/teacher`, tin cậy 1) và `v2.grade_reviews` (decision `edited`).
   - **Chấm bằng AI** (cần `OPENROUTER_API_KEY` hoặc `GEMINI_API_KEY`): AI chấm → GV Duyệt / Sửa & duyệt / Tự chấm / Chấm lại / Trả lại.
4. Duyệt → HS thấy điểm, mức, nhận xét (trang Phản hồi + mục "Bài viết của em"), cộng 1–3 sao (một lần), cập nhật thành thạo kĩ năng;
   phụ huynh thấy bài đã duyệt. Trả lại → HS thấy lời dặn và làm lại.
5. HS/phụ huynh **không** đọc được điểm trước khi GV duyệt (RLS `can_see_grade`, `can_see_review`).

Mã: `packages/data/src/assess/rules.ts` (`teacherGrade`), `supabase/functions/ai-grade/index.ts` (`manual: true`),
`apps/teacher/src/pages/assess/Review.tsx` (`ManualPanel`). Kiểm thử: `__tests__/teacherGrade.test.ts`, `e2e/tu-cham.spec.ts`.
