-- =============================================================================
-- OPEN-EDU · SQL 16 · Trò chuyện nhóm (docs/THAO_LUAN.md)
--   v2.discussions.kind: 'board' (bảng thảo luận kiểu Padlet, mặc định) | 'chat' (trò chuyện nhóm theo tổ, thời gian thực).
--   Phòng trò chuyện dùng lại phòng nhỏ (rooms) và một tab 'chat'; tin nhắn là discussion_posts (cùng quyền, cùng lọc từ,
--   cùng giới hạn 10 tin / phút). Mở / khóa theo giờ: opens_at, closes_at, locked (đã có ở SQL 15).
-- Chạy sau SQL 15. Chạy lại nhiều lần được.
-- =============================================================================
alter table v2.discussions add column if not exists kind text not null default 'board';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'discussions_kind_check' and conrelid = 'v2.discussions'::regclass) then
    alter table v2.discussions add constraint discussions_kind_check check (kind in ('board', 'chat'));
  end if;
end $$;
