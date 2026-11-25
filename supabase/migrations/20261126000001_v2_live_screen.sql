-- =============================================================================
-- OPEN-EDU v2 — Màn hình lớp (TV) cho lớp học trực tiếp / đố vui không cần đăng nhập (26/11/2026)
--
-- App màn hình lớp chạy ở địa chỉ riêng nên không có phiên đăng nhập của giáo viên:
--   • nhập mã 6 số → find_live báo "permission denied for function find_live";
--   • bấm "Mở trên TV" → treo ở "Đang mở lớp học…" (không đọc được live_sessions, bài giảng, câu hỏi).
-- Hai hàm dưới đây cho TV (khách) xem đúng phiên bằng MÃ LỚP (PIN) đang mở:
--   • find_live_screen(pin)       → mã phiên (không ghi "đã vào lớp" như find_live của học sinh);
--   • live_screen(phiên, pin, …)  → trạng thái, bài giảng, câu hỏi, câu trả lời — để TV vẽ giống hệt trước.
-- Bảo vệ đáp án: câu hỏi trả về KHÔNG kèm đáp án; chỉ khi giáo viên bấm "Hiện đáp án" (phase = reveal)
-- mới kèm đáp án của câu đang chiếu. Đúng / sai của từng câu trả lời cũng chỉ gửi lúc hiện đáp án / kết thúc.
-- Phiên quá 12 giờ coi như đã đóng (như start_live). Chạy lại nhiều lần không sao.
-- =============================================================================

create or replace function v2.find_live_screen(p_pin text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  v_s v2.live_sessions;
  v_title text;
begin
  if length(v_pin) <> 6 then
    return null;
  end if;
  select s.* into v_s from v2.live_sessions s
  where s.pin = v_pin and s.ended_at is null and s.created_at > now() - interval '12 hours'
  order by s.created_at desc limit 1;
  if not found then
    return null;
  end if;
  select l.title into v_title from v2.lessons l where l.id = v_s.lesson_id;
  return jsonb_build_object('sessionId', v_s.id, 'pin', v_s.pin, 'lessonId', v_s.lesson_id, 'lessonTitle', coalesce(v_title, ''));
end $$;

-- p_since: chỉ lấy câu trả lời mới hơn mốc này (TV hỏi lại mỗi 2 giây). p_full: kèm bài giảng + câu hỏi (lần đầu).
create or replace function v2.live_screen(p_session uuid, p_pin text, p_since timestamptz default null, p_full boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  v_s v2.live_sessions;
  v_l v2.lessons;
  v_phase text;
  v_idx int;
  v_reveal boolean;
  v_open_keys boolean;
  v_slide v2.lesson_slides;
  v_show text[] := '{}';
  v_items jsonb;
  v_keys jsonb := '{}'::jsonb;
  v_resp jsonb;
begin
  if p_session is null or length(v_pin) <> 6 then
    return null;
  end if;
  select s.* into v_s from v2.live_sessions s
  where s.id = p_session and s.pin = v_pin and s.created_at > now() - interval '12 hours';
  if not found then
    return null;
  end if;

  v_phase := coalesce(v_s.state ->> 'phase', '');
  v_idx := v2.try_int(v_s.state ->> 'slideIndex');
  v_open_keys := v_phase = 'reveal';
  v_reveal := v_phase in ('reveal', 'ended');

  -- Đáp án chỉ của câu đang chiếu, chỉ khi đã hiện đáp án.
  if v_open_keys and v_idx is not null then
    select * into v_slide from v2.lesson_slides where lesson_id = v_s.lesson_id and position = v_idx;
    if found then
      select coalesce(array_agg(li.item_id), '{}') into v_show from v2.lesson_items li
      where li.lesson_id = v_s.lesson_id and li.slide_id = v_slide.id;
    end if;
    if nullif(v_s.state ->> 'activeItemId', '') is not null
       and exists (select 1 from v2.lesson_items li where li.lesson_id = v_s.lesson_id and li.item_id = v_s.state ->> 'activeItemId') then
      v_show := v_show || (v_s.state ->> 'activeItemId');
    end if;
    select coalesce(jsonb_object_agg(k.item_id, k.key), '{}'::jsonb) into v_keys
    from v2.item_keys k where k.item_id = any (v_show);
  end if;

  if p_full then
    select * into v_l from v2.lessons where id = v_s.lesson_id;
    select coalesce(jsonb_agg(v2.item_to_json(i, null, false)), '[]'::jsonb) into v_items
    from (select distinct li.item_id from v2.lesson_items li where li.lesson_id = v_s.lesson_id limit 300) x
    join v2.items i on i.id = x.item_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'sessionId', r.session_id, 'userId', r.user_id, 'itemId', r.item_id, 'slideIndex', r.slide_index,
           'response', r.response, 'at', r.at)
         || case when v_reveal then v2.jsonb_compact(jsonb_build_object('correct', r.correct, 'score', r.score)) else '{}'::jsonb end
         order by r.at), '[]'::jsonb)
    into v_resp
  from v2.live_responses r
  where r.session_id = v_s.id
    and (p_since is null or r.at > p_since or (v_reveal and r.slide_index = v_idx));

  return v2.jsonb_compact(jsonb_build_object(
    'sessionId', v_s.id, 'pin', v_s.pin, 'lessonId', v_s.lesson_id,
    'state', v_s.state,
    'ended', v_s.ended_at is not null,
    'lesson', case when p_full and v_l.id is not null then v2.lesson_to_json(v_l, false) end,
    'items', case when p_full then v_items end,
    'keys', v_keys,
    'responses', v_resp,
    'now', now()));
end $$;

revoke all on function v2.find_live_screen(text) from public;
revoke all on function v2.live_screen(uuid, text, timestamptz, boolean) from public;
grant execute on function v2.find_live_screen(text) to anon, authenticated;
grant execute on function v2.live_screen(uuid, text, timestamptz, boolean) to anon, authenticated;
