/**
 * Cài đặt cá nhân của người dùng (đồng bộ giữa các máy) — vd môn hiện trên bản đồ kiến thức của từng lớp.
 * - Supabase: bảng v2.user_prefs (SQL 18), mỗi người chỉ đọc / ghi hàng của mình (RLS).
 * - Chưa chạy SQL 18, mất mạng, hoặc bản demo: lưu trên trình duyệt (localStorage) — không lỗi.
 * - Luôn giữ một bản sao trên trình duyệt để mở trang hiện ngay, rồi cập nhật khi tải xong từ máy chủ.
 */
export * from './react';
export { getPrefStore, prefKeyOk, type PrefStore } from './store';
