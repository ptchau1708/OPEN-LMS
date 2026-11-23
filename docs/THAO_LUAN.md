# Phòng thảo luận

Mỗi lớp có các **phòng thảo luận** theo chủ đề. Trong một phòng:
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

## Học sinh (Trang chủ → **Thảo luận**)
- Chọn phòng nhỏ, tab → viết (câu mở đầu gợi ý, nút **Nói** để đọc thành chữ trên Chrome/Android), chụp ảnh, chọn màu thẻ → **Đăng**.
- Phòng duyệt trước: bài hiện "⏳ Đang chờ cô xem" (chỉ em thấy). Bài có từ chưa phù hợp luôn chờ duyệt.
- Thả ❤️ ⭐ 👍, bình luận, **⚑ Báo cô**; sửa / gỡ bài của mình. Tối đa 10 bài mỗi phút.
- Phụ huynh: trang Phụ huynh có mục "Con thảo luận cùng lớp" (chỉ xem bài đã được duyệt của con).

## Kỹ thuật
- SQL 15: `supabase/migrations/20261124000001_v2_discussions.sql` — bảng `v2.discussions` (rooms, tabs dạng jsonb), `discussion_posts`,
  `discussion_reactions`, `discussion_reports`, `discussion_words`; RPC `post_discussion`, `edit_discussion_post`, `remove_my_discussion_post`,
  `moderate_discussion_posts`, `toggle_discussion_reaction`, `report_discussion_post`; bucket riêng tư `discussion`; Realtime.
- Lọc từ: khớp nguyên từ, giữ dấu ("ngu" không chặn "ngủ"). Danh sách chung của trường (quản trị) + của lớp (GV).
- Mã: `packages/data/src/discuss/*`, `apps/teacher/src/pages/discuss/*`, `apps/learner/src/pages/discuss/Discuss.tsx`.
- Kiểm thử: `supabase/tests/database/discussions.test.sql` (30), `packages/data/src/__tests__/discuss.test.ts`, `e2e/thao-luan.spec.ts`.
- Chưa làm (giai đoạn sau): trò chuyện nhóm thời gian thực theo giờ học, cộng sao thật khi GV khen ⭐, chèn phòng thảo luận vào Trang học.
