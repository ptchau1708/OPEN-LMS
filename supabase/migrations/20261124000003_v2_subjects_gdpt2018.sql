-- =============================================================================
-- OPEN-EDU · SQL 17 · Môn học theo Chương trình GDPT 2018 (cấp tiểu học)
--   Thêm: Đạo đức (dao-duc), Lịch sử và Địa lí (lich-su-dia-li), Tin học (tin-hoc), Công nghệ (cong-nghe),
--         Giáo dục thể chất (gdtc), Hoạt động trải nghiệm (hdtn).
--   'tnxh' (Tự nhiên và Xã hội) VẪN hợp lệ để dữ liệu cũ không lỗi — ứng dụng chỉ ẩn môn này khỏi các ô chọn.
--   Cập nhật mọi ràng buộc CHECK cột subject trong schema v2 và hai hàm kiểm tra môn (_upsert_item, save_lesson).
-- Chạy lại nhiều lần được.
-- =============================================================================
do $$
declare
  r record;
  v_list constant text := $l$('toan', 'tieng-viet', 'tieng-anh', 'dao-duc', 'lich-su-dia-li', 'khoa-hoc', 'tin-hoc', 'cong-nghe', 'gdtc', 'am-nhac', 'mi-thuat', 'hdtn', 'tnxh', 'khac')$l$;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'v2' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~ '\msubject\M' and pg_get_constraintdef(c.oid) like '%khoa-hoc%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I check (subject in %s)', r.tbl, r.conname, v_list);
  end loop;
end $$;

-- Hàm kiểm tra môn: thay danh sách cũ trong thân hàm (giữ nguyên phần còn lại, giữ quyền).
do $$
declare
  f text;
  def text;
  v_old constant text := $o$array['toan', 'tieng-viet', 'tieng-anh', 'tnxh', 'khoa-hoc', 'mi-thuat', 'am-nhac', 'khac']$o$;
  v_new constant text := $n$array['toan', 'tieng-viet', 'tieng-anh', 'dao-duc', 'lich-su-dia-li', 'khoa-hoc', 'tin-hoc', 'cong-nghe', 'gdtc', 'am-nhac', 'mi-thuat', 'hdtn', 'tnxh', 'khac']$n$;
begin
  foreach f in array array['v2._upsert_item(jsonb,uuid,uuid,boolean)', 'v2.save_lesson(jsonb)'] loop
    if to_regprocedure(f) is null then continue; end if;
    def := pg_get_functiondef(to_regprocedure(f));
    if position(v_old in def) > 0 then
      execute replace(def, v_old, v_new);
    end if;
  end loop;
end $$;
