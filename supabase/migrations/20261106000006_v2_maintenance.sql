-- =============================================================================
-- OPEN-EDU · Migration 6/6 · Dọn dữ liệu hằng tháng (giữ CSDL gói Free dưới 500 MB)
--
--   • learning_events cũ hơn 12 tháng
--   • live_responses cũ hơn 6 tháng (có thể chứa hình vẽ DRAW dạng dataUrl — chiếm chỗ nhất)
--   • ai_usage cũ hơn 90 ngày
--   • phiên trực tiếp treo quá 12 giờ → đánh dấu kết thúc
-- Lưu ý: DELETE không trả dung lượng đĩa ngay; autovacuum tái sử dụng chỗ trống cho dòng mới.
--
-- Lên lịch (nếu bật extension pg_cron trong Dashboard → Database → Extensions):
--   select cron.schedule('openedu-v2-monthly-cleanup', '17 3 1 * *', $$select v2.monthly_cleanup()$$);
--   -- 03:17 UTC ngày 1 hằng tháng. Gỡ: select cron.unschedule('openedu-v2-monthly-cleanup');
-- Không có pg_cron: chạy tay `select v2.monthly_cleanup();` trong SQL Editor mỗi tháng.
-- =============================================================================

create or replace function v2.monthly_cleanup() returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_events int;
  v_responses int;
  v_ai int;
  v_sessions int;
begin
  delete from v2.learning_events where at < now() - interval '12 months';
  get diagnostics v_events = row_count;

  delete from v2.live_responses where at < now() - interval '6 months';
  get diagnostics v_responses = row_count;

  delete from v2.ai_usage where day < v2.today_vn() - 90;
  get diagnostics v_ai = row_count;

  update v2.live_sessions set ended_at = now()
  where ended_at is null and created_at < now() - interval '12 hours';
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'learningEventsDeleted', v_events,
    'liveResponsesDeleted', v_responses,
    'aiUsageDeleted', v_ai,
    'liveSessionsEnded', v_sessions,
    'ranAt', now());
end $$;

revoke execute on function v2.monthly_cleanup() from public, anon, authenticated;
grant execute on function v2.monthly_cleanup() to service_role;
