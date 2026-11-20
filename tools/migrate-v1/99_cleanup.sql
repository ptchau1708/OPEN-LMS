-- migrate-v1 · Dọn: xóa schema tạm v1etl (view chuẩn hóa, hàm, bảng ứng viên). Không đụng public / v2.
-- Chạy sau khi đã xem 90_verify.sql. Muốn chuyển lại thì chạy lại từ 00_prepare.sql.
drop schema if exists v1etl cascade;
