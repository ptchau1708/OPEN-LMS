# Phòng thảo luận

Hai loại phòng: **Bảng thảo luận** (kiểu Padlet, mục dưới) và **Trò chuyện nhóm** (chat theo tổ, cần SQL 16).

Mỗi lớp có các **bảng thảo luận** theo chủ đề. Trong một bảng:
- **Phòng nhỏ**: "Cả lớp" + các phòng riêng (vd theo tổ). Phòng không chọn thành viên thì cả lớp vào được. GV thấy mọi phòng.
- **Tab đăng bài** (như cột trên Padlet): "Ý kiến", "Câu hỏi", "Hình ảnh"… HS chọn tab rồi đăng bài vào tab đó. GV xem từng tab hoặc **Xem dạng cột**.
- Bài = thẻ màu (chữ ≤ 1000 ký tự, ≤ 3 ảnh), có ❤️ ⭐ 👍 và **bình luận** (1 tầng).

## Giáo viên (menu **Thảo luận**)
- **Tạo phòng**: tên, lời dẫn, duyệt bài (*Duyệt trước khi hiện* — mặc định lớp 1–3; *Hiện ngay* — mặc định lớp 4–5),
  "Em chỉ thấy bài bạn sau khi đã đăng bài", giờ mở/đóng, ghim, **Chia theo tổ của lớp**, chọn thành viên từng phòng nhỏ, thêm/xếp tab.
- **Bảng thảo luận**: hàng chờ duyệt (**Duyệt tất cả bài không có cảnh báo**), Duyệt / Ẩn / Hiện lại từng bài, xem báo cáo của HS,
  đăng bài (hiện ngay), **Khóa ngay**, **Trình chiếu** (chữ to, tùy chọn ẩn tên), **Xuất Excel** (Tham gia: số bài, bình luận, lượt khen
  từng em — minh chứng TT27; Tất cả bài), **Từ cần chặn** của lớp.
- Không xóa thật bài của HS: chỉ ẩn (GV) hoặc gỡ (HS tự gỡ); vẫn xem lại được.
- **Mở trên TV** (`/thao-luan/:id/tv`, cửa sổ riêng): chữ to, tự cập nhật, mã QR để HS vào phòng, chỉ hiện bài đã duyệt,
  tùy chọn **Ẩn tên**, **Dạng cột**, **Tự chuyển tab** (20 giây), **Toàn màn hình**.
- **Mở 10 / 15 / 30 phút** (mở khóa + đặt giờ đóng), **Mở không hẹn giờ**, **Khóa ngay**.
- **🏅 Khen** trên bài / tin nhắn của HS → chọn một hành vi tích cực → ghi vào **Thi đua** (điểm + sao vào ví, ghi chú
  “Thảo luận: <tên phòng>”, xem lại ở Thống kê & vinh danh), đồng thời thả ⭐ lên bài (nút chuyển thành “Đã khen”).
- **Chèn vào Trang học**: nút chép mã `[[thao-luan:<id>|Tên phòng]]`; hoặc khi sửa trang (Trang học) chọn
  **Chèn phòng thảo luận** → HS thấy ô “💬 Tên phòng — Vào thảo luận” trong trang.

## Trò chuyện nhóm (SQL 16)
- GV: **Thảo luận → Trò chuyện nhóm**: tự tạo một nhóm mỗi tổ (sửa được thành viên), tin nhắn hiện ngay, tin có từ chưa phù hợp
  chờ duyệt. Phòng mới tạo **đang khóa** → bấm **Mở 15 phút** khi bắt đầu hoạt động nhóm; hết giờ HS không nhắn được nữa.
- GV xem **tất cả nhóm cùng lúc** (hoặc từng nhóm), nhắn vào từng nhóm, Duyệt / Ẩn / 🏅 Khen từng tin. **Mở trên TV**: mọi nhóm.
- HS: chỉ thấy nhóm của mình; bong bóng tin nhắn, câu trả lời nhanh (“Em đồng ý! 👍”…), nút **micro** đọc thành chữ, ⚑ báo cô.
- Tin mới hiện qua Realtime (dự phòng tải lại 4 giây một lần).

## Học sinh (Trang chủ → **Thảo luận**)
- Chọn phòng nhỏ, tab → viết (câu mở đầu gợi ý, nút **Nói** để đọc thành chữ trên Chrome/Android), chụp ảnh, chọn màu thẻ → **Đăng**.
- Phòng duyệt trước: bài hiện "⏳ Đang chờ cô xem" (chỉ em thấy). Bài có từ chưa phù hợp luôn chờ duyệt.
- Thả ❤️ ⭐ 👍, bình luận, **⚑ Báo cô**; sửa / gỡ bài của mình. Tối đa 10 bài mỗi phút.
- Phụ huynh: trang Phụ huynh có mục "Con thảo luận cùng lớp" (chỉ xem bài đã được duyệt của con).

## Kỹ thuật
- SQL 16: `supabase/migrations/20261124000002_v2_discussion_chat.sql` — cột `kind` ('board' | 'chat'). Chưa chạy SQL 16 thì bảng thảo
  luận vẫn dùng bình thường, chỉ chưa tạo được phòng trò chuyện.
- SQL 15: `supabase/migrations/20261124000001_v2_discussions.sql` — bảng `v2.discussions` (rooms, tabs dạng jsonb), `discussion_posts`,
  `discussion_reactions`, `discussion_reports`, `discussion_words`; RPC `post_discussion`, `edit_discussion_post`, `remove_my_discussion_post`,
  `moderate_discussion_posts`, `toggle_discussion_reaction`, `report_discussion_post`; bucket riêng tư `discussion`; Realtime.
- Lọc từ: khớp nguyên từ, giữ dấu ("ngu" không chặn "ngủ"). Danh sách chung của trường (quản trị) + của lớp (GV).
- Mã: `packages/data/src/discuss/*`, `apps/teacher/src/pages/discuss/*`, `apps/learner/src/pages/discuss/Discuss.tsx`.
- Kiểm thử: `supabase/tests/database/discussions.test.sql` (33), `packages/data/src/__tests__/discuss.test.ts` (có kiểm thử hai HS nhắn
  cùng lúc trên một kho dùng chung), `e2e/thao-luan.spec.ts` (6 kịch bản: HS bảng, GV duyệt, TV, HS chat, GV chat, khen + Trang học).
- Giới hạn: hai máy khác nhau cùng nhắn chỉ kiểm thử được ở lớp dữ liệu; trên Supabase thật cần thử với 2 tài khoản HS.
