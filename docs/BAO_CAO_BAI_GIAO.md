# Báo cáo bài giao, giao lại nhiều lượt, chính sách quá hạn

## Chấm và ghi kết quả
- HS mở bài từ trang **Hôm nay** → địa chỉ `/bai/<bài>?giao=<lần giao>`. Mỗi câu trả lời được máy chủ chấm (Edge
  Function `grade`, máy HS không có đáp án) và ghi vào `learning_events` **kèm mã lần giao**.
- Báo cáo đọc từ đó: mỗi câu lấy kết quả **lần trả lời cuối** (điểm bài, câu nhiều ý tính từng phần) và **lần đầu**
  ("đúng ngay lần đầu"). **Hoàn thành** = đã trả lời đủ mọi câu của bài; **muộn** = hoàn thành sau hạn nộp;
  **quá hạn** = qua hạn mà chưa xong. Thời gian làm = từ câu đầu tới câu cuối.
- Bài viết tự luận không chấm tự động (GV chấm ở mục Chấm bài).
- Kết quả làm bài trước khi có bản này (không kèm mã lần giao) không hiện trong báo cáo bài giao — vẫn có trong hồ sơ HS.

## Xem ở đâu
- **Giao bài**: mỗi bài đã giao hiện điểm / trạng thái từng em, nút **Báo cáo** (điểm từng em, câu sai nhiều lên
  trước, so sánh các lượt, xuất Excel) và **Giao lại**.
- **Báo cáo bài giao** (menu): chọn lớp, đợt **Ngày / Tuần / Tháng / Học kì** và một ngày trong đợt → các bài **mở**
  trong đợt. Xuất Excel 4 trang: Tổng hợp, Điểm theo học sinh (bảng HS × bài), Chi tiết, Câu hỏi.
  Tuần: thứ Hai → Chủ nhật. Học kì: HK I 01/09 → 15/01, HK II 16/01 → 31/08 (giờ Việt Nam).

## Giao lại
- **Giao lại** tạo lần giao mới cùng bài (lượt 2, 3…), chọn: cả lớp / **em chưa đạt** (chưa xong hoặc dưới 80%) /
  từng em; ngày mở, hạn nộp, chính sách quá hạn riêng.
- HS làm lượt mới **từ đầu** (`v2.start_assignment` xóa tiến độ cũ có trước ngày mở của lượt). Kết quả các lượt cũ
  vẫn giữ để so sánh. Sao: lượt mới có thể nhận lại sao lần đúng đầu tiên của lượt đó.

## Khi quá hạn
- **Cho nộp muộn** (mặc định): HS vẫn làm, báo cáo ghi "muộn", thẻ việc ghi "vẫn nộp được".
- **Khóa bài**: qua hạn thì HS không mở được bài và máy chủ từ chối câu trả lời mới (403 `past_due`).

## Cài đặt
1. Supabase → SQL Editor: chạy `13_giao-lai-bao-cao.sql` (migration `20261123000001_v2_assign_rounds.sql`).
   Chưa chạy thì giao bài vẫn như cũ (không có giao lại / khóa bài).
2. Triển khai lại `grade`: `npx supabase@latest functions deploy grade --project-ref <ref> --use-api`.

Mã: `packages/data/src/assignReport.ts`, `export/assignReportXlsx.ts`, `apps/teacher/src/pages/assign/report.tsx`.
Kiểm thử: `__tests__/assignReport.test.ts`, `supabase/tests/database/assign_rounds.test.sql`, `e2e/bao-cao-bai-giao.spec.ts`.
⚠ Chưa chạy trên Supabase thật.
