-- =============================================================================
-- OPEN-EDU v2 — Vườn lớp trên TV không cần đăng nhập (22/11/2026)
-- App màn hình lớp (TV) chạy ở địa chỉ riêng, không có phiên đăng nhập → get_class_garden báo
-- "permission denied". Giải pháp: mỗi lớp có một KHÓA TV bí mật (GV tạo trong Bàn làm việc giáo viên);
-- link TV mang khóa: /vuon-lop?lop=<lớp>&ma=<khóa>. Ai có link chỉ xem được vườn của ĐÚNG lớp đó, dạng
-- ẩn danh (tổng sao, cây chung, cây theo tổ — không tên HS). GV "Đổi link" → link cũ thôi hoạt động.
-- Chạy lại nhiều lần không sao.
-- =============================================================================

create table if not exists v2.garden_tv_keys (
  class_id text primary key references v2.classes(id) on delete cascade,
  key text not null unique check (length(key) >= 40),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table v2.garden_tv_keys enable row level security;
-- Không có policy: chỉ đọc / ghi qua hai hàm dưới đây.
revoke all on v2.garden_tv_keys from anon, authenticated;

-- Lấy khóa TV của lớp (tạo nếu chưa có). p_new = true → đổi khóa mới, link cũ ngừng hoạt động.
create or replace function v2.garden_tv_key(p_class text, p_new boolean default false) returns text
language plpgsql security definer set search_path = v2, public as $$
declare v_key text;
begin
  perform v2._require_user();
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ thầy/cô của lớp mới tạo được link TV.' using errcode = '42501';
  end if;
  if not p_new then
    select key into v_key from v2.garden_tv_keys where class_id = p_class;
    if v_key is not null then return v_key; end if;
  end if;
  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into v2.garden_tv_keys (class_id, key, created_by) values (p_class, v_key, auth.uid())
  on conflict (class_id) do update set key = excluded.key, created_by = excluded.created_by, created_at = now();
  return v_key;
end $$;

-- Màn hình TV (không đăng nhập): vườn của lớp, ẩn danh. Sai / hết hiệu lực khóa → 42501.
create or replace function v2.get_class_garden_tv(p_class text, p_key text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare v jsonb;
begin
  if p_key is null or length(p_key) < 40 or not exists (select 1 from v2.garden_tv_keys where class_id = p_class and key = p_key) then
    raise exception 'Link TV không còn hiệu lực. Thầy/cô mở lại từ Bàn làm việc giáo viên → Vườn lớp → Mở trên TV.' using errcode = '42501';
  end if;
  v := v2._garden_raw(p_class);
  -- Chắc chắn không lộ tên / từng học sinh dù người mở link là ai.
  return v || jsonb_build_object('students', '[]'::jsonb, 'me', null);
end $$;

revoke all on function v2.garden_tv_key(text, boolean) from public, anon;
grant execute on function v2.garden_tv_key(text, boolean) to authenticated;
revoke all on function v2.get_class_garden_tv(text, text) from public;
grant execute on function v2.get_class_garden_tv(text, text) to anon, authenticated;
