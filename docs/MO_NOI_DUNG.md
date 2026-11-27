# Nội dung mở — thầy/cô thêm / sửa / xoá được

Nguyên tắc: mọi nội dung thầy/cô dùng hằng ngày đều có thao tác **thêm, sửa, xoá** (hoặc ẩn khi cần giữ lịch sử).
Danh mục có sẵn trong mã (kĩ năng, môn học, câu mẫu…) là **bản gốc**: phần thầy/cô sửa được lưu riêng và áp lên khi mở
ứng dụng (`CatalogGate` trong `packages/data/src/catalog`), nên luôn **khôi phục bản gốc** được.

## Bảng rà soát (24/11/2026)

| Nội dung | Thêm | Sửa | Xoá / ẩn | Ghi chú |
|---|---|---|---|---|
| Bài giảng | ✓ | ✓ (chủ bài) | ✓ | **Mới:** bài của người khác / bài mẫu → “Nhân bản để sửa” (danh sách + trình soạn) |
| Câu hỏi (ngân hàng) | ✓ | ✓ | ✓ | Câu của người khác: “Nhân bản câu này” |
| **Giao bài** | ✓ | **Mới** | **Mới** | Sửa tên, học sinh, giờ mở, hạn nộp, nộp muộn; xoá bài đã giao |
| Gói HTML5 | ✓ | — | **Mới** | Xoá trong hộp “Nhập gói HTML5” |
| Tiêu chí chấm, bài viết, ma trận đề | ✓ | ✓ | ✓ | |
| **Đề kiểm tra đã ra** | ✓ | ✓ | **Mới** | Xoá kèm bài làm của đề |
| **Hành vi thi đua** | ✓ | ✓ | **Mới** | Điểm đã ghi giữ nguyên (nhật kí ghi “hành vi đã xoá”) |
| **Huy hiệu của thầy/cô** | ✓ | — | **Mới: thu hồi** | GV lớp / người tặng / quản trị |
| **Danh mục kĩ năng** | **Mới** | **Mới** | **Mới** | Trang “Danh mục kĩ năng” (`/ki-nang`): thêm, sửa chữ, ẩn/hiện, khôi phục gốc, xoá kĩ năng tự thêm |
| **Môn học** | — | **Mới (quản trị)** | **Mới: ẩn/hiện** | Quản trị → Năm học & kì: đổi tên (vd “Khác” → “Giáo dục địa phương”), tên ngắn, ẩn môn |
| **Mẫu nhận xét khi tự chấm** | **Mới** | **Mới** | **Mới** | Theo mức T/H/C, cho HS và phụ huynh; riêng từng GV; bấm để chèn |
| **Câu trả lời nhanh (trò chuyện nhóm)** | **Mới** | **Mới** | **Mới** | Đặt cho từng phòng trong hộp sửa phòng |
| Phòng thảo luận, từ cần lọc, trang học, ứng dụng kết nối, điểm danh, TT27 | ✓ | ✓ | ✓ | Đã có |
| Môn hiện trên bản đồ kiến thức | ✓ | ✓ | ✓ | Theo GV + lớp (SQL 18) |

Không mở (cố định theo quy định hoặc là phần mềm): mức T/H/C, kì GK1–CN (TT27), trạng thái điểm danh, mức thành thạo,
dạng câu hỏi, linh vật / trang phục cửa hàng (hình vẽ), thông số trò chơi thách đấu.

## Danh mục kĩ năng — cách lưu
- Supabase (SQL 19): cột `custom`, `owner_id`, `hidden`, `edit_topic`, `edit_text`, `edit_short`, `edited_by`, `edited_at` của `v2.skills`.
  Chữ GV sửa nằm ở `edit_*` → chạy lại SQL 18 / `supabase/seed/skills.sql` **không ghi đè** phần đã sửa.
- RPC `save_skill(jsonb)`: thêm (mã `<MÔN><lớp>.GV.<SLUG>`), sửa chữ, `hidden`, `restore`. Mọi GV / quản trị (danh mục chung toàn trường).
- RPC `delete_skill(text)`: kĩ năng tự thêm chưa có câu hỏi / kết quả → xoá hẳn (chỉ người thêm hoặc quản trị);
  còn lại → ẩn (giữ lịch sử).
- Edge Function `grade`, `ai-grade`: nhận cả kĩ năng tự thêm (`knownSkillCodes` trong `_shared/mastery-store.ts`) — cần triển khai lại.
- Ứng dụng: `applySkillOverrides` cập nhật tại chỗ `SKILLS` (đang dùng, không gồm kĩ năng ẩn) và `SKILL_BY_CODE` (tất cả).

## Môn học của trường
`school_settings.data.subjects = { "<mã môn>": { name?, short?, hidden? } }`, lưu qua `admin_save_settings` (SQL 19).
`applySubjectOverrides` cập nhật tại chỗ `SUBJECTS`, `SUBJECT_LIST`. Câu hỏi / bài giảng của môn bị ẩn vẫn dùng được.

## Kiểm thử
`e2e/mo-noi-dung.spec.ts` (5 kịch bản), `packages/data/src/__tests__/openCatalog.test.ts`,
`supabase/tests/database/open_catalog.test.sql` (24).
