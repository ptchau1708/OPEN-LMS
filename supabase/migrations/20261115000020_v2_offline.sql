-- =============================================================================
-- Phase 6 — Học offline: khóa idempotency + thời điểm thật cho câu trả lời đồng bộ muộn (docs/PHASE6_OFFLINE.md)
--  * learning_events.client_event_id (duy nhất theo HS) — hàng đợi offline gửi lại không ghi / cộng sao trùng.
--  * submissions.client_event_id — nộp bài làm offline không trùng.
--  * record_grade(+p_client_event_id, p_answered_at), complete_lesson(+p_completed_at), record_event (clientEventId, clientAt).
--  * Thời điểm từ máy HS: tương lai (> 5 phút) → kẹp về now(); cũ hơn 14 ngày → từ chối (câu trả lời) / kẹp (sự kiện khác).
-- =============================================================================

alter table v2.learning_events add column if not exists client_event_id text check (client_event_id is null or length(client_event_id) between 8 and 64);
create unique index if not exists learning_events_client_event_key on v2.learning_events (user_id, client_event_id) where client_event_id is not null;

alter table v2.submissions add column if not exists client_event_id text check (client_event_id is null or length(client_event_id) between 8 and 64);
create unique index if not exists submissions_client_event_key on v2.submissions (student_id, client_event_id) where client_event_id is not null;

-- Thời điểm hợp lý: null → now(); > now()+5 phút → now(); < now()-14 ngày → lỗi (p_strict) hoặc now().
create or replace function v2._plausible_at(p_at timestamptz, p_strict boolean) returns timestamptz
language plpgsql stable set search_path = v2, public as $$
begin
  if p_at is null or p_at > now() + interval '5 minutes' then return now(); end if;
  if p_at < now() - interval '14 days' then
    if p_strict then
      raise exception 'stale_answer: câu trả lời quá 14 ngày, không ghi nhận được.' using errcode = '22007';
    end if;
    return now();
  end if;
  return p_at;
end $$;

drop function if exists v2.record_grade(uuid, text, jsonb, boolean, boolean, real, text, text, uuid, int, int);
create or replace function v2.record_grade(
  p_user uuid, p_item_id text, p_response jsonb, p_graded boolean, p_correct boolean, p_score real,
  p_lesson_id text default null, p_assignment_id text default null, p_live_session_id uuid default null,
  p_slide_index int default null, p_duration_ms int default null,
  p_client_event_id text default null, p_answered_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_role text;
  v_item v2.items;
  v_session v2.live_sessions;
  v_graded boolean := coalesce(p_graded, false);
  v_correct boolean := coalesce(p_graded, false) and coalesce(p_correct, false);
  v_score real := greatest(0, least(1, coalesce(p_score, 0)));
  v_ctx text;
  v_slide_id text;
  v_kind text;
  v_answer_key text;
  v_award jsonb;
  v_stars int := 0;
  v_new jsonb := '[]'::jsonb;
  v_result jsonb;
  v_at timestamptz := v2._plausible_at(p_answered_at, true);
  v_event_id bigint;
  v_prev v2.learning_events;
begin
  -- Gửi lại từ hàng đợi offline: đã nhận rồi → trả lại kết quả cũ, không chấm / cộng sao lần hai.
  if p_client_event_id is not null then
    select * into v_prev from v2.learning_events where user_id = p_user and client_event_id = p_client_event_id;
    if found then
      return jsonb_build_object('starsAwarded', 0, 'wallet', v2.wallet_json(p_user), 'newlyUnlocked', '[]'::jsonb, 'duplicate', true,
        'correct', coalesce((v_prev.result ->> 'correct')::boolean, false), 'score', coalesce((v_prev.result ->> 'score')::real, 0));
    end if;
  end if;
  select role into v_role from v2.profiles where id = p_user;
  if v_role is null then
    raise exception 'Tài khoản của em chưa có trên hệ thống mới. Hãy báo thầy/cô nhé.' using errcode = '42501';
  end if;
  select * into v_item from v2.items where id = p_item_id;
  if not found then
    raise exception 'Không tìm thấy câu hỏi.' using errcode = 'P0002';
  end if;

  if p_live_session_id is not null then
    select * into v_session from v2.live_sessions where id = p_live_session_id;
    if not found then
      raise exception 'Không tìm thấy lớp học trực tiếp.' using errcode = 'P0002';
    end if;
    if v_session.ended_at is not null then
      raise exception 'Lớp học trực tiếp đã kết thúc rồi.' using errcode = '22023';
    end if;
    insert into v2.live_responses (session_id, user_id, item_id, slide_index, response, correct, score)
    values (p_live_session_id, p_user, p_item_id,
            coalesce(p_slide_index, v2.try_int(v_session.state ->> 'slideIndex'), 0),
            p_response, case when v_graded then v_correct end, case when v_graded then v_score end);
    if exists (select 1 from v2.lesson_items li where li.lesson_id = v_session.lesson_id and li.item_id = p_item_id) then
      v_ctx := 'live:' || p_live_session_id::text;
    end if;
  elsif p_lesson_id is not null then
    select li.slide_id, li.kind into v_slide_id, v_kind
    from v2.lesson_items li
    join v2.lesson_slides s on s.lesson_id = li.lesson_id and s.id = li.slide_id
    where li.lesson_id = p_lesson_id and li.item_id = p_item_id
    order by (s.position = p_slide_index) desc nulls last, s.position
    limit 1;
    if v_slide_id is not null then
      v_ctx := 'lesson:' || p_lesson_id;
      v_answer_key := case when v_kind = 'video' then v_slide_id || '#' || p_item_id else v_slide_id end;
    end if;
  end if;

  if v_ctx is null and p_assignment_id is not null and exists (
    select 1 from v2.assignments a
    where a.id = p_assignment_id
      and a.class_id in (select v2.class_ids_of(p_user))
      and (cardinality(a.student_ids) = 0 or p_user::text = any (a.student_ids))
  ) then
    v_ctx := 'assignment:' || p_assignment_id;
  end if;
  v_ctx := coalesce(v_ctx, 'free');

  v_result := v2.jsonb_compact(jsonb_build_object(
    'correct', case when v_graded then v_correct end,
    'score', case when v_graded then v_score end,
    'graded', v_graded,
    'durationMs', p_duration_ms,
    'response', case when p_response is not null and pg_column_size(p_response) <= 2048 then p_response end));
  if p_client_event_id is not null then
    v_result := v_result || jsonb_build_object('offline', true);
  end if;
  insert into v2.learning_events (user_id, verb, object_type, object_id, lesson_id, assignment_id, live_session_id, result, at, client_event_id)
  values (p_user, 'answered', 'item', p_item_id, coalesce(p_lesson_id, v_session.lesson_id), p_assignment_id, p_live_session_id, v_result,
          v_at, left(p_client_event_id, 64))
  on conflict (user_id, client_event_id) where client_event_id is not null do nothing
  returning id into v_event_id;
  if v_event_id is null then
    -- Hai lần gửi chạy song song: lần thua không cộng sao.
    return jsonb_build_object('starsAwarded', 0, 'wallet', v2.wallet_json(p_user), 'newlyUnlocked', '[]'::jsonb, 'duplicate', true);
  end if;

  if v_role = 'student' then
    perform v2._touch_streak(p_user);
    if v_correct then
      v_award := v2._award(p_user, v_item.stars, 0, 10,
        case when p_live_session_id is not null then 'Trả lời đúng trong lớp học trực tiếp' else 'Trả lời đúng' end,
        'item', p_item_id, 'item:' || p_item_id || ':' || v_ctx, null);
      v_stars := coalesce((v_award ->> 'stars')::int, 0);
      v_new := coalesce(v_award -> 'newlyUnlocked', '[]'::jsonb);
    end if;
  end if;

  -- Tiến độ tự học: giữ kết quả đúng đã có (không hạ xuống sai khi em làm lại).
  if v_answer_key is not null then
    insert into v2.lesson_progress as lp (user_id, lesson_id, answers, stars_earned)
    values (p_user, p_lesson_id,
            jsonb_build_object(v_answer_key, v2.jsonb_compact(jsonb_build_object(
              'correct', v_correct, 'score', v_score, 'graded', case when not v_graded then false end))),
            v_stars)
    on conflict (user_id, lesson_id) do update set
      answers = case when lp.answers -> v_answer_key ->> 'correct' = 'true' then lp.answers
                     else lp.answers || excluded.answers end,
      stars_earned = lp.stars_earned + v_stars;
  end if;

  return jsonb_build_object(
    'starsAwarded', v_stars,
    'wallet', coalesce(v_award -> 'wallet', v2.wallet_json(p_user)),
    'newlyUnlocked', v_new);
end $$;


drop function if exists v2.complete_lesson(text);
create or replace function v2.complete_lesson(p_lesson_id text, p_completed_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_l v2.lessons;
  v_answers jsonb;
  v_correct int;
  v_stars int;
  v_res jsonb;
  v_at timestamptz := v2._plausible_at(p_completed_at, false);
begin
  select * into v_l from v2.lessons where id = p_lesson_id;
  if not found then
    raise exception 'Không tìm thấy bài học.' using errcode = 'P0002';
  end if;
  if not v2.lesson_visible(v_l.id, v_l.owner_id, v_l.status, v_l.grade) then
    raise exception 'Bài học này chưa được mở cho em.' using errcode = '42501';
  end if;
  -- GV/phụ huynh xem thử: không cộng thưởng.
  if v_role <> 'student' then
    return jsonb_build_object('wallet', v2.wallet_json(v_uid), 'newlyUnlocked', '[]'::jsonb, 'starsAwarded', 0);
  end if;

  insert into v2.lesson_progress (user_id, lesson_id) values (v_uid, p_lesson_id) on conflict do nothing;
  select lp.answers into v_answers from v2.lesson_progress lp
  where lp.user_id = v_uid and lp.lesson_id = p_lesson_id for update;

  select count(*) into v_correct
  from jsonb_each(coalesce(v_answers, '{}'::jsonb)) e
  where jsonb_typeof(e.value) = 'object'
    and e.value ->> 'correct' = 'true'
    and coalesce(e.value ->> 'graded', 'true') <> 'false';
  v_stars := least(v_correct, 10);

  perform v2._touch_streak(v_uid);
  v_res := v2._award(v_uid, v_stars, 0, 20, left('Hoàn thành bài: ' || v_l.title, 200),
                     'lesson', p_lesson_id, 'lesson:' || p_lesson_id, v_uid);

  if (v_res ->> 'awarded')::boolean then
    update v2.lesson_progress
      set completed_at = coalesce(completed_at, v_at), stars_earned = stars_earned + v_stars
      where user_id = v_uid and lesson_id = p_lesson_id;
    insert into v2.learning_events (user_id, verb, object_type, object_id, lesson_id, result, at)
    values (v_uid, 'completed', 'lesson', p_lesson_id, p_lesson_id,
            jsonb_build_object('correct', v_correct, 'stars', v_stars) || case when p_completed_at is not null then '{"offline":true}'::jsonb else '{}'::jsonb end,
            v_at);
  end if;

  return jsonb_build_object('wallet', v_res -> 'wallet', 'newlyUnlocked', v_res -> 'newlyUnlocked', 'starsAwarded', v_res -> 'stars');
end $$;


-- record_event: đọc cả khóa camelCase lẫn snake_case (toEventRow gửi snake_case), chống trùng theo clientEventId.
create or replace function v2.record_event(p_event jsonb) returns void
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_verb text := p_event ->> 'verb';
  v_type text := coalesce(p_event ->> 'objectType', p_event ->> 'object_type');
  v_obj text := nullif(btrim(coalesce(p_event ->> 'objectId', p_event ->> 'object_id', '')), '');
  v_result jsonb := p_event -> 'result';
  v_cid text := nullif(p_event ->> 'clientEventId', '');
  v_at timestamptz := v2._plausible_at(v2.try_timestamptz(p_event ->> 'clientAt'), false);
begin
  if v_verb is null or v_verb not in ('started', 'viewed', 'completed', 'joined') then
    raise exception 'Sự kiện "%" không ghi trực tiếp được.', coalesce(v_verb, '') using errcode = '22023';
  end if;
  if v_type is null or v_type not in ('slide', 'item', 'lesson', 'package', 'live', 'arena') then
    raise exception 'Loại đối tượng "%" không hợp lệ.', coalesce(v_type, '') using errcode = '22023';
  end if;
  if v_obj is null or length(v_obj) > 128 then
    raise exception 'Thiếu mã đối tượng.' using errcode = '22023';
  end if;
  if v_cid is not null and (length(v_cid) < 8 or length(v_cid) > 64) then v_cid := null; end if;
  if jsonb_typeof(v_result) is distinct from 'object' then
    v_result := null;
  elsif pg_column_size(v_result) > 2048 then
    v_result := v_result - 'response';
    if pg_column_size(v_result) > 2048 then v_result := null; end if;
  end if;
  if (p_event ->> 'offline') = 'true' then
    v_result := coalesce(v_result, '{}'::jsonb) || '{"offline":true}'::jsonb;
  end if;
  -- Chống ghi dồn: tối đa 120 sự kiện/phút/người (bỏ qua êm). Hàng đợi offline gửi dồn → vẫn trong giới hạn nhờ lùi dần.
  if (select count(*) from v2.learning_events e where e.user_id = v_uid and e.at > now() - interval '1 minute') >= 120 then
    return;
  end if;
  insert into v2.learning_events (user_id, verb, object_type, object_id, lesson_id, assignment_id, live_session_id, result, at, client_event_id)
  values (v_uid, v_verb, v_type, v_obj,
          left(nullif(coalesce(p_event ->> 'lessonId', p_event ->> 'lesson_id'), ''), 128),
          left(nullif(coalesce(p_event ->> 'assignmentId', p_event ->> 'assignment_id'), ''), 128),
          case when v_verb = 'joined' then null else v2.try_uuid(coalesce(p_event ->> 'liveSessionId', p_event ->> 'live_session_id')) end,
          v_result, v_at, v_cid)
  on conflict (user_id, client_event_id) where client_event_id is not null do nothing;
  if v_role = 'student' then
    perform v2._touch_streak(v_uid);
  end if;
end $$;

create or replace function v2.try_timestamptz(p text) returns timestamptz
language plpgsql stable as $$
begin
  return p::timestamptz;
exception when others then
  return null;
end $$;

-- annotate_answer: sự kiện vừa ghi có thể mang thời điểm cũ (đồng bộ muộn) → tìm theo id mới nhất, không theo `at`.
create or replace function v2.annotate_answer(p_user uuid, p_item_id text, p_extra jsonb) returns void
language sql security definer set search_path = v2, public as $$
  update v2.learning_events e
     set result = coalesce(e.result, '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb)
   where e.id = (
     select id from v2.learning_events
      where user_id = p_user and object_id = p_item_id and verb = 'answered'
      order by id desc limit 1
   )
$$;

revoke execute on function
  v2.record_grade(uuid, text, jsonb, boolean, boolean, real, text, text, uuid, int, int, text, timestamptz),
  v2._plausible_at(timestamptz, boolean), v2.annotate_answer(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function v2.complete_lesson(text, timestamptz), v2.record_event(jsonb), v2.try_timestamptz(text) to authenticated;
grant execute on function v2.record_grade(uuid, text, jsonb, boolean, boolean, real, text, text, uuid, int, int, text, timestamptz),
  v2._plausible_at(timestamptz, boolean), v2.annotate_answer(uuid, text, jsonb), v2.complete_lesson(text, timestamptz) to service_role;
