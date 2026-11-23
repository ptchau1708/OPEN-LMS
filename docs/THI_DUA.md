# Thi đua: ghi nhận, thống kê, vinh danh

- **Thi đua** (/thi-dua): chạm vào em / tổ / cả lớp để ghi nhận hành vi (điểm dương cộng sao). Bảng tuần này ở bên phải.
- **Thống kê & vinh danh** (/thi-dua/thong-ke): chọn đợt **Tuần / Tháng / Học kì** và một ngày trong đợt.
  - **Bảng vinh danh**: tối đa 10 em có điểm dương cao nhất; bằng điểm ở vị trí thứ 10 thì lấy đủ các em cùng điểm.
    Không vinh danh em 0 điểm hoặc điểm âm. Nút **Trình chiếu vinh danh** (chữ to, in được).
  - **Theo tổ**, **Thống kê từng học sinh**: hạng (bằng điểm cùng hạng), điểm, tăng/giảm so với đợt trước, số lần tích
    cực / cần cố gắng, hành vi nổi bật và hành vi cần cố gắng nhiều nhất.
  - **Lịch sử**: cả lớp (lọc theo em, theo loại) và từng em (đợt đang xem hoặc từ trước tới nay). Ghi nhầm → **Xóa**
    (bấm hai lần), điểm và sao được trả lại như lúc hoàn tác.
  - **Xuất Excel**: Thống kê, Vinh danh, Tổ, Lịch sử.
- Tuần: thứ Hai → Chủ nhật; học kì: HK I 01/09 → 15/01, HK II 16/01 → 31/08 (giờ Việt Nam).
- Mã: `packages/data/src/behaviorStats.ts`, `apps/teacher/src/pages/assess/BehaviorStats.tsx`.
  Kiểm thử: `__tests__/behaviorStats.test.ts`, `e2e/thi-dua-thong-ke.spec.ts`.
