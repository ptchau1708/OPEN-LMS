-- =============================================================================
-- migrate-v1 · Hoàn tác dữ liệu ĐÃ CHUYỂN (schema public không bị ảnh hưởng, app cũ chạy bình thường).
-- Chỉ xóa dòng có dấu chuyển (legacy_ref, id el_/cg_, dedupe 'migrate:*', id trùng bảng cũ).
-- Dữ liệu tạo mới trên v2 (bài giảng GV soạn mới, sao HS kiếm được…) được giữ — trừ phần C (hồ sơ).
--
-- Chạy cả file trong SQL Editor; mọi thứ nằm trong một giao dịch.
-- Hoàn tác TOÀN BỘ v2 (kể cả dữ liệu mới):  drop schema v2 cascade;  rồi chạy lại supabase/migrations.
-- =============================================================================
begin;

-- A0. Lịch sử (bước 6): bài kiểm tra cũ (xóa kèm bài nộp, AI chấm, duyệt — cascade), TT27 chưa được GV sửa
delete from v2.work_tasks where id like 'v1ex\_%';
delete from v2.rubrics where id like 'v1ex\_%';
delete from v2.tt27_evaluations where data ->> '_v1' = 'true' and updated_by is null;

-- A. Phần thưởng, Đấu trường, tiến độ, học liệu, câu hỏi
delete from v2.reward_ledger where dedupe_key like 'migrate:%';
delete from v2.arena_profiles;
delete from v2.lesson_progress where lesson_id like 'el\_%' and completed_at is not null and answers = '{}'::jsonb;
delete from v2.course_nodes where id like 'el\_%';
delete from v2.courses where legacy_ref like 'el_course:%';
delete from v2.lessons where legacy_ref like 'el_lesson:%';          -- xóa kèm slide, tiến độ (cascade)
-- Lưu ý: bài giảng mới có slide trỏ tới item cũ (itemId) sẽ thành slide trống câu hỏi.
delete from v2.items where legacy_ref is not null;                   -- xóa kèm item_keys (cascade)

-- B. Lớp, tổ, thành viên (lớp có id trùng bảng cũ)
delete from v2.class_teams where id like 'cg\_%';
do $$ begin
  if to_regclass('public.classes') is not null then
    execute 'delete from v2.classes c using public.classes o where c.id = o.id::text';
  end if;
end $$;

-- Tính lại hộ chiếu theo sổ thưởng còn lại (giữ các linh vật đã mở bằng sao kiếm trên v2)
update v2.passports p set unlocked = array(
  select m.id from v2.mascots m
  where m.unlock_stars <= coalesce((select sum(greatest(r.stars, 0)) from v2.reward_ledger r where r.user_id = p.user_id), 0)
  order by m.position);
update v2.passports set companion = 'nghe' where not (companion = any (unlocked));

-- C. (TÙY CHỌN) Xóa hồ sơ đã chuyển — xóa luôn MỌI dữ liệu v2 của các tài khoản đó. Bỏ dấu -- để chạy.
-- delete from v2.guardian_links;
-- delete from v2.profiles p where exists (select 1 from public.profiles o where o.id::text = p.id::text)
--                              or exists (select 1 from public.parents o where o.id::text = p.id::text);

commit;
