# Khối ưu tiên (mặc định lớp 5)

Mỗi giáo viên có một **khối ưu tiên**, mặc định là **lớp 5**. Đổi ở menu tài khoản → **Cài đặt cá nhân** (trang `/cai-dat`). Cài đặt lưu theo tài khoản nên dùng được trên mọi máy (bảng `v2.user_prefs`, khoá `khoi.uu-tien`; chưa chạy SQL 18 thì lưu trên trình duyệt).

| Nơi | Ảnh hưởng |
|---|---|
| Ngân hàng câu hỏi, Bài giảng | Lọc sẵn khối ưu tiên. Chọn “Mọi lớp” để xem hết, khi đó khối ưu tiên đứng đầu, rồi đến khối gần nhất. |
| Tạo bài giảng, câu hỏi mới, Thêm nhanh nhiều câu, tiêu chí chấm, ma trận đề, Danh mục kĩ năng, lớp mới (quản trị) | Chọn sẵn khối ưu tiên |
| Danh sách lớp (Tổng quan, Giao bài, Trực tiếp, Hồ sơ học sinh, Kiến thức, Phụ huynh, Đấu trường, Đề kiểm tra…) | Lớp thuộc khối ưu tiên đứng đầu và được mở sẵn |
| Giao bài, Trực tiếp, danh sách tiêu chí và ma trận đề | Bài / mục của khối ưu tiên (hoặc khối của lớp đang chọn) đứng đầu |
| Trang đã chọn một lớp | Dùng khối của lớp đó |

Mặc định khi nhập câu hỏi (dán văn bản, Word, Excel, AI) cũng là lớp 5 nếu đề không ghi lớp.

Mã: `apps/teacher/src/lib/focusGrade.tsx` (`FocusGradeProvider`, `useFocusGrade`, `useDefaultGrade`, `byFocus`, `useClasses` đã sắp theo khối ưu tiên).
