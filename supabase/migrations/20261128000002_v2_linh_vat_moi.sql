-- =============================================================================
-- SQL 25 — 4 linh vật mới cho Hộ chiếu khám phá (đồng bộ packages/contracts/src/mascots.ts):
--   Sư tử Leo (Kenya) 650 sao · Gấu Tuyết (Canada) 780 sao · Cánh Cụt Pip (Ác-hen-ti-na) 920 sao · Lạc đà Sa Sa (Ai Cập) 1080 sao.
-- Mở khóa theo mốc sao cố định như 10 bạn cũ (v2.passport_sync). Chạy lại nhiều lần không sao.
-- =============================================================================
insert into v2.mascots (id, unlock_stars, position) values
  ('sutu', 650, 10), ('gautuyet', 780, 11), ('canhcut', 920, 12), ('lacda', 1080, 13)
on conflict (id) do update set unlock_stars = excluded.unlock_stars, position = excluded.position;
