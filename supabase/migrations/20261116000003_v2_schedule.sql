-- =============================================================================
-- OPEN-EDU v2 — việc chạy định kì (gói Supabase Free)
--  1. public.openedu_ping(): hàm "gõ cửa" để GitHub Actions giữ dự án không bị tạm dừng sau 7 ngày không dùng.
--     Không trả dữ liệu nào ngoài giờ máy chủ. Nằm ở schema public vì hàm v2 không mở cho người chưa đăng nhập.
--  2. v2.run_maintenance(): gộp dọn hằng tháng + xóa nhật ký lỗi cũ.
--  3. Nếu có pg_cron: tự đặt lịch 03:17 ngày 1 hằng tháng. Không có pg_cron thì bỏ qua (chạy tay / GitHub Actions).
-- Chạy lại nhiều lần được.
-- =============================================================================
create or replace function public.openedu_ping() returns timestamptz
language sql stable security invoker set search_path = '' as $$ select now() $$;
grant execute on function public.openedu_ping() to anon, authenticated, service_role;

create or replace function v2.run_maintenance() returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare v_clean jsonb; v_err int;
begin
  begin
    select to_jsonb(x) into v_clean from (select v2.monthly_cleanup() as result) x;
  exception when others then v_clean := jsonb_build_object('error', sqlerrm);
  end;
  v_err := v2.purge_client_errors();
  return jsonb_build_object('at', now(), 'cleanup', v_clean, 'clientErrorsDeleted', v_err);
end $$;
revoke execute on function v2.run_maintenance() from public, anon, authenticated;
grant execute on function v2.run_maintenance() to service_role;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron không có ở máy này (%). Bỏ qua đặt lịch — chạy "select v2.run_maintenance();" mỗi tháng.', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule(jobid) from cron.job where jobname in ('openedu-v2-maintenance', 'openedu-v2-monthly-cleanup');
    perform cron.schedule('openedu-v2-maintenance', '17 20 1 * *', 'select v2.run_maintenance()');  -- 20:17 UTC = 03:17 giờ Việt Nam ngày 2
  exception when others then
    raise notice 'Chưa đặt được lịch pg_cron: %', sqlerrm;
  end;
end $$;
