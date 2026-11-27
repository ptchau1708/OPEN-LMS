-- =============================================================================
-- OPEN-EDU · Migration 3/6 · RPC (docs/SUPABASE_API.md), cộng sao, mở khóa hộ chiếu, chuỗi ngày học, view wallets
--
-- Mọi RPC: security definer, search_path = v2, public, tự kiểm tra quyền, lỗi bằng tiếng Việt dễ hiểu.
-- Mã lỗi: 42501 = không đủ quyền (PostgREST → 403), P0002 = không tìm thấy, 22023 = dữ liệu không hợp lệ.
--
-- Quy tắc thưởng:
--   • Câu trả lời đúng LẦN ĐẦU cho mỗi (HS, item, ngữ cảnh) → item.stars sao + 10 XP. Ngữ cảnh = lớp trực tiếp
--     (nếu item thuộc bài của phiên) › bài học (nếu item nằm trong bài) › bài được giao › 'free'.
--   • Hoàn thành bài (complete_lesson) → 1 lần/bài: số câu đúng trong lesson_progress.answers (tối đa 10) + 20 XP.
--   • GV thưởng (award_bonus) → 1–5 sao/lần.
--   • Linh vật mở khóa khi tổng sao tích lũy ≥ mốc trong v2.mascots (= MASCOTS[].unlockStars).
--   • level = 1 + floor(sqrt(xp / 25)) → 0 XP: cấp 1, 25: cấp 2, 100: cấp 3, 225: cấp 4, 400: cấp 5…
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Nội bộ
-- -----------------------------------------------------------------------------
create or replace function v2._require_user() returns text
language plpgsql stable security definer set search_path = v2, public as $$
declare v_role text;
begin
  if auth.uid() is null then
    raise exception 'Em cần đăng nhập trước nhé.' using errcode = '42501';
  end if;
  select p.role into v_role from v2.profiles p where p.id = auth.uid();
  if v_role is null then
    raise exception 'Tài khoản chưa có hồ sơ trên hệ thống mới. Hãy báo thầy/cô hoặc quản trị viên.' using errcode = '42501';
  end if;
  return v_role;
end $$;

create or replace function v2.level_for_xp(p_xp bigint) returns int
language sql immutable set search_path = v2, public as $$
  select 1 + floor(sqrt(greatest(coalesce(p_xp, 0), 0) / 25.0))::int
$$;

-- Chuỗi còn hiệu lực nếu ngày học gần nhất là hôm nay hoặc hôm qua (giờ Việt Nam).
create or replace function v2.streak_days(p_user uuid) returns int
language sql stable security definer set search_path = v2, public as $$
  select coalesce((
    select case when s.last_day >= v2.today_vn() - 1 then s.current_days else 0 end
    from v2.streaks s where s.user_id = p_user
  ), 0)
$$;

create or replace function v2.wallet_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'userId', p_user,
    'stars', coalesce(sum(r.stars), 0),
    'coins', coalesce(sum(r.coins), 0),
    'xp', coalesce(sum(r.xp), 0),
    'level', v2.level_for_xp(coalesce(sum(r.xp), 0)),
    'streakDays', v2.streak_days(p_user))
  from v2.reward_ledger r where r.user_id = p_user
$$;

create or replace function v2._touch_streak(p_user uuid) returns void
language plpgsql security definer set search_path = v2, public as $$
declare v_today date := v2.today_vn();
begin
  insert into v2.streaks as s (user_id, current_days, best_days, last_day)
  values (p_user, 1, 1, v_today)
  on conflict (user_id) do update set
    current_days = case when s.last_day = v_today - 1 then s.current_days + 1 else 1 end,
    best_days = greatest(s.best_days, case when s.last_day = v_today - 1 then s.current_days + 1 else 1 end),
    last_day = v_today
  where s.last_day is distinct from v_today;
end $$;

-- Mở khóa linh vật theo tổng sao tích lũy. Trả về các linh vật VỪA mở (theo thứ tự hộ chiếu).
-- Khóa dòng passports (FOR UPDATE) để hai lần cộng sao đồng thời không báo trùng.
create or replace function v2._sync_passport(p_user uuid) returns text[]
language plpgsql security definer set search_path = v2, public as $$
declare
  v_old text[];
  v_total bigint;
  v_new text[];
begin
  insert into v2.passports (user_id) values (p_user) on conflict (user_id) do nothing;
  select p.unlocked into v_old from v2.passports p where p.user_id = p_user for update;
  select coalesce(sum(greatest(r.stars, 0)), 0) into v_total from v2.reward_ledger r where r.user_id = p_user;
  select coalesce(array_agg(m.id order by m.position), '{}') into v_new
  from v2.mascots m where m.unlock_stars <= v_total and not (m.id = any (coalesce(v_old, '{}')));
  if cardinality(v_new) > 0 then
    update v2.passports
      set unlocked = array(select m.id from v2.mascots m where m.id = any (coalesce(v_old, '{}') || v_new) order by m.position)
      where user_id = p_user;
  end if;
  return v_new;
end $$;

-- Ghi một dòng sổ thưởng (idempotent theo dedupe_key) và mở khóa linh vật.
-- Trả về { awarded, stars, wallet, newlyUnlocked }.
create or replace function v2._award(
  p_user uuid, p_stars int, p_coins int, p_xp int, p_reason text,
  p_source_type text, p_source_id text, p_dedupe text, p_created_by uuid
) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_id uuid;
  v_new text[] := '{}';
begin
  insert into v2.reward_ledger (user_id, stars, coins, xp, reason, source_type, source_id, dedupe_key, created_by)
  values (p_user, coalesce(p_stars, 0), coalesce(p_coins, 0), coalesce(p_xp, 0), coalesce(p_reason, ''),
          p_source_type, p_source_id, p_dedupe, p_created_by)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  if v_id is not null and coalesce(p_stars, 0) > 0 then
    v_new := v2._sync_passport(p_user);
  end if;
  return jsonb_build_object(
    'awarded', v_id is not null,
    'stars', case when v_id is null then 0 else coalesce(p_stars, 0) end,
    'wallet', v2.wallet_json(p_user),
    'newlyUnlocked', to_jsonb(v_new));
end $$;

-- -----------------------------------------------------------------------------
-- Chuyển dòng ↔ JSON theo packages/contracts
-- -----------------------------------------------------------------------------
create or replace function v2.item_to_json(i v2.items, p_key jsonb, p_with_key boolean) returns jsonb
language sql stable set search_path = v2, public as $$
  select v2.jsonb_compact(jsonb_build_object(
      'id', i.id, 'type', i.type, 'grade', i.grade, 'subject', i.subject, 'skill', i.skill,
      'difficulty', i.difficulty, 'prompt', i.prompt, 'payload', i.payload, 'hint', i.hint,
      'explanation', i.explanation, 'stars', i.stars, 'tags', to_jsonb(i.tags), 'updatedAt', i.updated_at))
    || case when p_with_key then jsonb_build_object('key', coalesce(p_key, 'null'::jsonb)) else '{}'::jsonb end
$$;

create or replace function v2.slide_to_json(s v2.lesson_slides, p_with_keys boolean) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object('id', s.id, 'layout', s.layout)
    || (s.data - 'id' - 'layout')
    || case
         when p_with_keys and jsonb_typeof(s.data -> 'item') = 'object' then
           jsonb_build_object('item', (s.data -> 'item') || coalesce(
             (select jsonb_build_object('key', k.key) from v2.item_keys k where k.item_id = s.data -> 'item' ->> 'id'),
             '{}'::jsonb))
         else '{}'::jsonb
       end
$$;

create or replace function v2.lesson_to_json(l v2.lessons, p_with_keys boolean) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select v2.jsonb_compact(jsonb_build_object(
      'id', l.id, 'title', l.title, 'subject', l.subject, 'grade', l.grade, 'description', l.description,
      'mascot', l.mascot, 'ownerId', coalesce(l.owner_id::text, ''), 'status', l.status, 'minutes', l.minutes,
      'updatedAt', l.updated_at))
    || jsonb_build_object('slides', coalesce(
         (select jsonb_agg(v2.slide_to_json(s, p_with_keys) order by s.position) from v2.lesson_slides s where s.lesson_id = l.id),
         '[]'::jsonb))
$$;

-- Kiểm tra + ghi một item (và đáp án nếu có khóa "key"). Dùng chung cho save_item và item nhúng trong save_lesson.
create or replace function v2._upsert_item(p_item jsonb, p_owner uuid, p_caller uuid, p_is_admin boolean) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_id text := nullif(btrim(coalesce(p_item ->> 'id', '')), '');
  v_type text := p_item ->> 'type';
  v_grade int := v2.try_int(p_item ->> 'grade');
  v_subject text := coalesce(nullif(p_item ->> 'subject', ''), 'khac');
  v_prompt jsonb := p_item -> 'prompt';
  v_payload jsonb := coalesce(p_item -> 'payload', '{}'::jsonb);
  v_diff text := nullif(p_item ->> 'difficulty', '');
  v_stars int := coalesce(v2.try_int(p_item ->> 'stars'), 1);
  v_tags text[] := '{}';
  v_existing v2.items;
  v_row v2.items;
  v_key jsonb;
  v_has_key boolean;
begin
  if jsonb_typeof(p_item) is distinct from 'object' then
    raise exception 'Câu hỏi không hợp lệ.' using errcode = '22023';
  end if;
  if v_type is null or v_type <> all (array['MCQ', 'MCQ_MULTIPLE', 'MATCHING', 'ORDERING', 'DRAG_DROP', 'SHORT_ANSWER',
      'SENTENCE_SCRAMBLE', 'WORD_CLASSIFY', 'FILL_IN_PASSAGE', 'INLINE_DROPDOWN', 'LISTEN_CHOOSE', 'HOTSPOT', 'DRAW',
      'RECORD_READ', 'MATH_MANIPULATIVE', 'POLL']) then
    raise exception 'Dạng câu hỏi "%" chưa được hỗ trợ.', coalesce(v_type, '') using errcode = '22023';
  end if;
  if v_grade is null or v_grade not between 1 and 5 then
    raise exception 'Lớp của câu hỏi phải từ 1 đến 5.' using errcode = '22023';
  end if;
  if v_subject <> all (array['toan', 'tieng-viet', 'tieng-anh', 'tnxh', 'khoa-hoc', 'mi-thuat', 'am-nhac', 'khac']) then
    raise exception 'Môn học "%" không hợp lệ.', v_subject using errcode = '22023';
  end if;
  if jsonb_typeof(v_prompt) = 'string' then
    v_prompt := jsonb_build_object('text', v_prompt);
  end if;
  if jsonb_typeof(v_prompt) is distinct from 'object' or jsonb_typeof(v_prompt -> 'text') is distinct from 'string' then
    raise exception 'Câu hỏi cần có đề bài (prompt.text).' using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload) is distinct from 'object' then
    raise exception 'Nội dung câu hỏi (payload) không hợp lệ.' using errcode = '22023';
  end if;
  if v_diff is not null and v_diff <> all (array['nhan-biet', 'ket-noi', 'van-dung']) then
    raise exception 'Mức độ "%" không hợp lệ.', v_diff using errcode = '22023';
  end if;
  if v_stars not between 0 and 5 then
    raise exception 'Mỗi câu thưởng từ 0 đến 5 sao.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_item -> 'tags') = 'array' then
    v_tags := array(select t from jsonb_array_elements_text(p_item -> 'tags') t where t <> '');
  end if;
  if v_id is null then
    v_id := gen_random_uuid()::text;
  end if;
  if length(v_id) > 128 then
    raise exception 'Mã câu hỏi quá dài.' using errcode = '22023';
  end if;

  select * into v_existing from v2.items where id = v_id for update;
  if found and v_existing.owner_id is distinct from p_caller and not p_is_admin then
    raise exception 'Câu hỏi "%" thuộc thầy/cô khác nên không sửa được. Hãy nhân bản để dùng.', v_id using errcode = '42501';
  end if;

  insert into v2.items as i (id, type, grade, subject, skill, difficulty, prompt, payload, hint, explanation, stars, tags, owner_id)
  values (v_id, v_type, v_grade, v_subject, nullif(p_item ->> 'skill', ''), v_diff, v_prompt, v_payload,
          nullif(p_item ->> 'hint', ''), nullif(p_item ->> 'explanation', ''), v_stars, v_tags, p_owner)
  on conflict (id) do update set
    type = excluded.type, grade = excluded.grade, subject = excluded.subject, skill = excluded.skill,
    difficulty = excluded.difficulty, prompt = excluded.prompt, payload = excluded.payload, hint = excluded.hint,
    explanation = excluded.explanation, stars = excluded.stars, tags = excluded.tags, updated_at = now()
  returning * into v_row;

  if p_item ? 'key' then
    insert into v2.item_keys (item_id, key) values (v_id, p_item -> 'key')
    on conflict (item_id) do update set key = excluded.key, updated_at = now();
  end if;
  select k.key, true into v_key, v_has_key from v2.item_keys k where k.item_id = v_id;
  return v2.item_to_json(v_row, v_key, coalesce(v_has_key, false));
end $$;

-- -----------------------------------------------------------------------------
-- Bài giảng
-- -----------------------------------------------------------------------------
create or replace function v2.get_lesson(p_id text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_role text := v2._require_user();
  v_l v2.lessons;
begin
  select * into v_l from v2.lessons where id = p_id;
  if not found then
    return null;
  end if;
  if not v2.lesson_visible(v_l.id, v_l.owner_id, v_l.status, v_l.grade) then
    raise exception 'Bài học này chưa được mở cho em. Hãy hỏi thầy/cô nhé.' using errcode = '42501';
  end if;
  return v2.lesson_to_json(v_l, v_role in ('teacher', 'admin'));
end $$;

create or replace function v2.save_lesson(p_lesson jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_id text := nullif(btrim(coalesce(p_lesson ->> 'id', '')), '');
  v_title text := nullif(btrim(coalesce(p_lesson ->> 'title', '')), '');
  v_subject text := coalesce(nullif(p_lesson ->> 'subject', ''), 'khac');
  v_grade int := v2.try_int(p_lesson ->> 'grade');
  v_status text := coalesce(nullif(p_lesson ->> 'status', ''), 'draft');
  v_mascot text := nullif(p_lesson ->> 'mascot', '');
  v_minutes int := v2.try_int(p_lesson ->> 'minutes');
  v_slides jsonb := coalesce(p_lesson -> 'slides', '[]'::jsonb);
  v_existing v2.lessons;
  v_owner uuid;
  v_slide jsonb;
  v_pos int := 0;
  v_slide_id text;
  v_layout text;
  v_data jsonb;
  v_item jsonb;
  v_seen text[] := '{}';
  v_row v2.lessons;
begin
  if v_role not in ('teacher', 'admin') then
    raise exception 'Chỉ thầy/cô mới lưu được bài giảng.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lesson) is distinct from 'object' then
    raise exception 'Dữ liệu bài giảng không hợp lệ.' using errcode = '22023';
  end if;
  if v_title is null then
    raise exception 'Bài giảng cần có tên.' using errcode = '22023';
  end if;
  if v_subject <> all (array['toan', 'tieng-viet', 'tieng-anh', 'tnxh', 'khoa-hoc', 'mi-thuat', 'am-nhac', 'khac']) then
    raise exception 'Môn học "%" không hợp lệ.', v_subject using errcode = '22023';
  end if;
  if v_grade is null or v_grade not between 1 and 5 then
    raise exception 'Lớp của bài giảng phải từ 1 đến 5.' using errcode = '22023';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'Trạng thái bài giảng chỉ là "draft" hoặc "published".' using errcode = '22023';
  end if;
  if v_mascot is not null and not exists (select 1 from v2.mascots where id = v_mascot) then
    raise exception 'Linh vật "%" không có trong danh sách.', v_mascot using errcode = '22023';
  end if;
  if v_minutes is not null and v_minutes not between 0 and 600 then
    raise exception 'Thời lượng bài giảng từ 0 đến 600 phút.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_slides) is distinct from 'array' then
    raise exception 'Danh sách slide không hợp lệ.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_slides) > 200 then
    raise exception 'Mỗi bài giảng tối đa 200 slide.' using errcode = '22023';
  end if;
  if v_id is null then
    v_id := gen_random_uuid()::text;
  end if;
  if length(v_id) > 128 then
    raise exception 'Mã bài giảng quá dài.' using errcode = '22023';
  end if;

  select * into v_existing from v2.lessons where id = v_id for update;
  if found then
    if v_existing.owner_id is distinct from v_uid and v_role <> 'admin' then
      raise exception 'Thầy/cô chỉ sửa được bài giảng của mình. Hãy nhân bản bài này để chỉnh sửa.' using errcode = '42501';
    end if;
    v_owner := v_existing.owner_id;
  else
    v_owner := v_uid;
    if v_role = 'admin' and v2.try_uuid(p_lesson ->> 'ownerId') is not null
       and exists (select 1 from v2.profiles where id = v2.try_uuid(p_lesson ->> 'ownerId') and role in ('teacher', 'admin')) then
      v_owner := v2.try_uuid(p_lesson ->> 'ownerId');
    end if;
  end if;

  insert into v2.lessons as l (id, title, subject, grade, description, mascot, owner_id, status, minutes)
  values (v_id, v_title, v_subject, v_grade, nullif(p_lesson ->> 'description', ''), v_mascot, v_owner, v_status, v_minutes)
  on conflict (id) do update set
    title = excluded.title, subject = excluded.subject, grade = excluded.grade, description = excluded.description,
    mascot = excluded.mascot, status = excluded.status, minutes = excluded.minutes, updated_at = now();

  delete from v2.lesson_slides where lesson_id = v_id;

  for v_slide in select value from jsonb_array_elements(v_slides) loop
    if jsonb_typeof(v_slide) is distinct from 'object' then
      raise exception 'Slide thứ % không hợp lệ.', v_pos + 1 using errcode = '22023';
    end if;
    v_layout := v_slide ->> 'layout';
    if v_layout is null or v_layout <> all (array['title', 'image-text', 'fullscreen', 'activity', 'compare', 'game', 'package', 'summary']) then
      raise exception 'Slide thứ % có bố cục "%" không hợp lệ.', v_pos + 1, coalesce(v_layout, '') using errcode = '22023';
    end if;
    v_slide_id := coalesce(nullif(btrim(coalesce(v_slide ->> 'id', '')), ''), gen_random_uuid()::text);
    if v_slide_id = any (v_seen) then
      raise exception 'Hai slide trùng mã "%". Hãy tạo lại slide bị trùng.', v_slide_id using errcode = '22023';
    end if;
    v_seen := v_seen || v_slide_id;
    v_data := v_slide - 'id' - 'layout';
    -- Item nhúng: lưu vào ngân hàng (để Edge Function grade chấm được), bỏ đáp án khỏi slide.
    if jsonb_typeof(v_data -> 'item') = 'object' then
      v_item := v2._upsert_item(
        (v_data -> 'item') || jsonb_build_object(
          'grade', coalesce(v_data -> 'item' -> 'grade', to_jsonb(v_grade)),
          'subject', coalesce(v_data -> 'item' -> 'subject', to_jsonb(v_subject))),
        v_owner, v_uid, v_role = 'admin');
      v_data := jsonb_set(v_data, '{item}', v_item - 'key');
    end if;
    insert into v2.lesson_slides (id, lesson_id, position, layout, data)
    values (v_slide_id, v_id, v_pos, v_layout, v_data);
    v_pos := v_pos + 1;
  end loop;

  select * into v_row from v2.lessons where id = v_id;
  return v2.lesson_to_json(v_row, true);
end $$;

-- -----------------------------------------------------------------------------
-- Câu hỏi
-- -----------------------------------------------------------------------------
create or replace function v2.get_items(p_ids text[]) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_role text := v2._require_user();
  v_staff boolean := v_role in ('teacher', 'admin');
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return '[]'::jsonb;
  end if;
  if cardinality(p_ids) > 300 then
    raise exception 'Mỗi lần chỉ lấy tối đa 300 câu hỏi.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(v2.item_to_json(i, k.key, v_staff and k.item_id is not null) order by x.ord)
    from (select u.id, min(u.ord) as ord from unnest(p_ids) with ordinality as u(id, ord) group by u.id) x
    join v2.items i on i.id = x.id
    left join v2.item_keys k on v_staff and k.item_id = i.id
    where v_staff or v2.student_can_read_item(i.id, i.grade)
  ), '[]'::jsonb);
end $$;

create or replace function v2.save_item(p_item jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_role text := v2._require_user();
begin
  if v_role not in ('teacher', 'admin') then
    raise exception 'Chỉ thầy/cô mới lưu được câu hỏi.' using errcode = '42501';
  end if;
  return v2._upsert_item(p_item, auth.uid(), auth.uid(), v_role = 'admin');
end $$;

-- -----------------------------------------------------------------------------
-- Phần thưởng
-- -----------------------------------------------------------------------------
-- p_live_session_id (tùy chọn, ngoài hợp đồng): thưởng trong lớp trực tiếp → source_type 'live';
-- khi đó GV chủ phiên thưởng được cả HS vào bằng PIN dù không thuộc lớp mình.
create or replace function v2.award_bonus(p_user uuid, p_stars int, p_reason text default null, p_live_session_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_target_role text;
  v_allowed boolean;
  v_res jsonb;
begin
  if v_role not in ('teacher', 'admin') then
    raise exception 'Chỉ thầy/cô mới thưởng sao được.' using errcode = '42501';
  end if;
  select role into v_target_role from v2.profiles where id = p_user;
  if v_target_role is null then
    raise exception 'Không tìm thấy học sinh.' using errcode = 'P0002';
  end if;
  if v_target_role <> 'student' then
    raise exception 'Chỉ thưởng sao cho học sinh.' using errcode = '22023';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Mỗi lần thưởng từ 1 đến 5 sao.' using errcode = '22023';
  end if;
  v_allowed := v2.is_teacher_of_student(p_user);
  if not v_allowed and p_live_session_id is not null then
    v_allowed := exists (
      select 1 from v2.live_sessions s
      where s.id = p_live_session_id and s.ended_at is null and (s.teacher_id = v_uid or v2.is_teacher_of_class(s.class_id))
        and exists (select 1 from v2.learning_events e where e.user_id = p_user and e.live_session_id = s.id and e.verb = 'joined'));
  end if;
  if not v_allowed then
    raise exception 'Thầy/cô chỉ thưởng sao được cho học sinh lớp mình.' using errcode = '42501';
  end if;

  v_res := v2._award(p_user, p_stars, 0, 0,
    left(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Thầy/cô khen thưởng'), 200),
    case when p_live_session_id is not null then 'live' else 'bonus' end,
    p_live_session_id::text, null, v_uid);
  if p_live_session_id is not null then
    insert into v2.learning_events (user_id, verb, object_type, object_id, live_session_id, result)
    values (p_user, 'awarded', 'live', p_live_session_id::text, p_live_session_id, jsonb_build_object('stars', p_stars, 'by', v_uid));
  end if;
  return v_res -> 'wallet';
end $$;

create or replace function v2.complete_lesson(p_lesson_id text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_l v2.lessons;
  v_answers jsonb;
  v_correct int;
  v_stars int;
  v_res jsonb;
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
      set completed_at = coalesce(completed_at, now()), stars_earned = stars_earned + v_stars
      where user_id = v_uid and lesson_id = p_lesson_id;
    insert into v2.learning_events (user_id, verb, object_type, object_id, lesson_id, result)
    values (v_uid, 'completed', 'lesson', p_lesson_id, p_lesson_id, jsonb_build_object('correct', v_correct, 'stars', v_stars));
  end if;

  return jsonb_build_object('wallet', v_res -> 'wallet', 'newlyUnlocked', v_res -> 'newlyUnlocked', 'starsAwarded', v_res -> 'stars');
end $$;

-- Ghi kết quả chấm từ Edge Function `grade` (CHỈ service role). Một giao dịch:
-- learning_events + live_responses + cộng sao lần đúng đầu + lesson_progress.answers + chuỗi ngày.
create or replace function v2.record_grade(
  p_user uuid, p_item_id text, p_response jsonb, p_graded boolean, p_correct boolean, p_score real,
  p_lesson_id text default null, p_assignment_id text default null, p_live_session_id uuid default null,
  p_slide_index int default null, p_duration_ms int default null
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
begin
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
  insert into v2.learning_events (user_id, verb, object_type, object_id, lesson_id, assignment_id, live_session_id, result)
  values (p_user, 'answered', 'item', p_item_id, coalesce(p_lesson_id, v_session.lesson_id), p_assignment_id, p_live_session_id, v_result);

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

-- Ghi sự kiện học tập từ client (ngoài hợp đồng — DataSource.recordEvent cần một đường ghi).
-- Không cho ghi 'answered' (phải qua grade) và 'awarded' (server).
create or replace function v2.record_event(p_event jsonb) returns void
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_verb text := p_event ->> 'verb';
  v_type text := p_event ->> 'objectType';
  v_obj text := nullif(btrim(coalesce(p_event ->> 'objectId', '')), '');
  v_result jsonb := p_event -> 'result';
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
  if jsonb_typeof(v_result) is distinct from 'object' then
    v_result := null;
  elsif pg_column_size(v_result) > 2048 then
    v_result := v_result - 'response';
    if pg_column_size(v_result) > 2048 then v_result := null; end if;
  end if;
  -- Chống ghi dồn: tối đa 120 sự kiện/phút/người (bỏ qua êm, không báo lỗi cho em).
  if (select count(*) from v2.learning_events e where e.user_id = v_uid and e.at > now() - interval '1 minute') >= 120 then
    return;
  end if;
  insert into v2.learning_events (user_id, verb, object_type, object_id, lesson_id, assignment_id, live_session_id, result)
  values (v_uid, v_verb, v_type, v_obj,
          left(nullif(p_event ->> 'lessonId', ''), 128),
          left(nullif(p_event ->> 'assignmentId', ''), 128),
          -- 'joined' + phiên trực tiếp chỉ do find_live ghi (dùng để cấp quyền đọc phiên).
          case when v_verb = 'joined' then null else v2.try_uuid(p_event ->> 'liveSessionId') end,
          v_result);
  if v_role = 'student' then
    perform v2._touch_streak(v_uid);
  end if;
end $$;

-- Cổng chung cho DataSource.award() (ngoài hợp đồng): server quyết định số sao.
create or replace function v2.award(p_entry jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_type text := p_entry ->> 'sourceType';
  v_user uuid := v2.try_uuid(p_entry ->> 'userId');
  v_wallet jsonb;
begin
  perform v2._require_user();
  if v_type = 'lesson' then
    if v_user is not null and v_user <> auth.uid() then
      raise exception 'Chỉ em mới nhận được sao hoàn thành bài của mình.' using errcode = '42501';
    end if;
    return v2.complete_lesson(p_entry ->> 'sourceId');
  elsif v_type in ('bonus', 'live', 'behavior') then
    if v_user is null then
      raise exception 'Thiếu học sinh nhận thưởng.' using errcode = '22023';
    end if;
    v_wallet := v2.award_bonus(v_user, v2.try_int(p_entry ->> 'stars'), p_entry ->> 'reason',
                               case when v_type = 'live' then v2.try_uuid(p_entry ->> 'sourceId') end);
    return jsonb_build_object('wallet', v_wallet, 'newlyUnlocked', '[]'::jsonb);
  else
    raise exception 'Sao cho câu trả lời được cộng tự động khi chấm bài (Edge Function grade).' using errcode = '22023';
  end if;
end $$;

create or replace function v2.set_companion(p_mascot text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_p v2.passports;
begin
  perform v2._require_user();
  if not exists (select 1 from v2.mascots where id = p_mascot) then
    raise exception 'Không có bạn đồng hành "%".', coalesce(p_mascot, '') using errcode = '22023';
  end if;
  perform v2._sync_passport(v_uid);
  select * into v_p from v2.passports where user_id = v_uid for update;
  if not (p_mascot = any (v_p.unlocked)) then
    raise exception 'Em chưa mở khóa bạn này. Học thêm để nhận sao nhé!' using errcode = '42501';
  end if;
  update v2.passports set companion = p_mascot where user_id = v_uid returning * into v_p;
  return jsonb_build_object('userId', v_uid, 'unlocked', to_jsonb(v_p.unlocked), 'companion', v_p.companion);
end $$;

-- -----------------------------------------------------------------------------
-- Lớp học trực tiếp
-- -----------------------------------------------------------------------------
create or replace function v2.start_live(p_lesson_id text, p_class_id text default null) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_l v2.lessons;
  v_class text := nullif(btrim(coalesce(p_class_id, '')), '');
  v_pin text;
  v_id uuid;
  v_try int := 0;
  v_teams jsonb;
begin
  if v_role not in ('teacher', 'admin') then
    raise exception 'Chỉ thầy/cô mới mở được lớp học trực tiếp.' using errcode = '42501';
  end if;
  select * into v_l from v2.lessons where id = p_lesson_id;
  if not found then
    raise exception 'Không tìm thấy bài giảng.' using errcode = 'P0002';
  end if;
  if not v2.lesson_visible(v_l.id, v_l.owner_id, v_l.status, v_l.grade) then
    raise exception 'Thầy/cô chưa dùng được bài giảng này (bài nháp của người khác).' using errcode = '42501';
  end if;
  if v_class is not null then
    if not exists (select 1 from v2.classes where id = v_class) then
      raise exception 'Không tìm thấy lớp.' using errcode = 'P0002';
    end if;
    if not v2.is_teacher_of_class(v_class) then
      raise exception 'Thầy/cô chỉ mở lớp trực tiếp cho lớp mình phụ trách.' using errcode = '42501';
    end if;
  end if;

  -- Phiên quá 12 giờ coi như đã kết thúc (giải phóng mã PIN).
  update v2.live_sessions set ended_at = now() where ended_at is null and created_at < now() - interval '12 hours';

  loop
    v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into v2.live_sessions (pin, lesson_id, class_id, teacher_id)
      values (v_pin, p_lesson_id, v_class, v_uid)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try >= 20 then
        raise exception 'Chưa tạo được mã PIN, thầy/cô thử lại nhé.';
      end if;
    end;
  end loop;

  v_teams := coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'stars', 0) order by t.position, t.name)
    from v2.class_teams t where t.class_id = v_class), '[]'::jsonb);
  update v2.live_sessions set state = jsonb_build_object(
      'sessionId', v_id, 'pin', v_pin, 'lessonId', p_lesson_id, 'slideIndex', 0, 'phase', 'lobby',
      'locked', false, 'teams', v_teams, 'participants', '[]'::jsonb, 'studentStars', '{}'::jsonb, 'updatedAt', now())
    where id = v_id;

  return jsonb_build_object('sessionId', v_id, 'pin', v_pin, 'lessonId', p_lesson_id, 'lessonTitle', v_l.title);
end $$;

-- Tìm phiên theo PIN. Ghi sự kiện 'joined' (một lần) — dùng để cấp quyền đọc phiên/bài cho HS vào bằng PIN.
create or replace function v2.find_live(p_pin text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  v_s v2.live_sessions;
  v_title text;
begin
  perform v2._require_user();
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
  if not exists (select 1 from v2.learning_events e where e.user_id = v_uid and e.live_session_id = v_s.id and e.verb = 'joined') then
    insert into v2.learning_events (user_id, verb, object_type, object_id, lesson_id, live_session_id)
    values (v_uid, 'joined', 'live', v_s.id::text, v_s.lesson_id, v_s.id);
  end if;
  return jsonb_build_object('sessionId', v_s.id, 'pin', v_s.pin, 'lessonId', v_s.lesson_id, 'lessonTitle', coalesce(v_title, ''));
end $$;

create or replace function v2.update_live_state(p_session_id uuid, p_state jsonb) returns void
language plpgsql security definer set search_path = v2, public as $$
declare
  v_s v2.live_sessions;
  v_state jsonb;
begin
  perform v2._require_user();
  select * into v_s from v2.live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không tìm thấy lớp học trực tiếp.' using errcode = 'P0002';
  end if;
  if v_s.teacher_id is distinct from auth.uid() and not v2.is_admin() then
    raise exception 'Chỉ thầy/cô mở lớp mới điều khiển được.' using errcode = '42501';
  end if;
  if v_s.ended_at is not null then
    return; -- đã kết thúc: bỏ qua êm (GV có thể gửi lại lệnh 'end')
  end if;
  if jsonb_typeof(p_state) is distinct from 'object' then
    raise exception 'Trạng thái lớp không hợp lệ.' using errcode = '22023';
  end if;
  -- Chế độ Supabase không lưu bài giảng/item (có đáp án) trong state.
  v_state := (p_state - 'lesson' - 'items')
    || jsonb_build_object('sessionId', v_s.id, 'pin', v_s.pin, 'lessonId', v_s.lesson_id);
  if pg_column_size(v_state) > 262144 then
    raise exception 'Trạng thái lớp quá lớn (tối đa 256 KB).' using errcode = '22023';
  end if;
  update v2.live_sessions
    set state = v_state,
        ended_at = case when v_state ->> 'phase' = 'ended' then now() else null end
    where id = p_session_id;
end $$;

-- -----------------------------------------------------------------------------
-- View ví: tổng hợp sổ thưởng + chuỗi ngày (RLS của bảng gốc áp dụng: security_invoker)
-- -----------------------------------------------------------------------------
create or replace view v2.wallets with (security_invoker = true) as
select p.id as user_id,
       coalesce(l.stars, 0)::int as stars,
       coalesce(l.coins, 0)::int as coins,
       coalesce(l.xp, 0)::int as xp,
       v2.level_for_xp(coalesce(l.xp, 0)) as level,
       coalesce(case when s.last_day >= v2.today_vn() - 1 then s.current_days end, 0) as streak_days
from v2.profiles p
left join (
  select r.user_id, sum(r.stars) as stars, sum(r.coins) as coins, sum(r.xp) as xp
  from v2.reward_ledger r group by r.user_id
) l on l.user_id = p.id
left join v2.streaks s on s.user_id = p.id
where v2.can_view_user(p.id);
comment on view v2.wallets is 'Wallet (packages/contracts users.ts): stars/coins/xp từ reward_ledger, level từ xp, streak_days từ streaks.';

-- -----------------------------------------------------------------------------
-- Quyền gọi hàm
-- -----------------------------------------------------------------------------
revoke execute on function
  v2._require_user(), v2.streak_days(uuid), v2.wallet_json(uuid), v2._touch_streak(uuid), v2._sync_passport(uuid),
  v2._award(uuid, int, int, int, text, text, text, text, uuid),
  v2.item_to_json(v2.items, jsonb, boolean), v2.slide_to_json(v2.lesson_slides, boolean),
  v2.lesson_to_json(v2.lessons, boolean), v2._upsert_item(jsonb, uuid, uuid, boolean),
  v2.record_grade(uuid, text, jsonb, boolean, boolean, real, text, text, uuid, int, int)
  from public, anon, authenticated;

grant execute on function
  v2.get_lesson(text), v2.save_lesson(jsonb), v2.get_items(text[]), v2.save_item(jsonb),
  v2.award_bonus(uuid, int, text, uuid), v2.complete_lesson(text), v2.start_live(text, text), v2.find_live(text),
  v2.update_live_state(uuid, jsonb), v2.set_companion(text), v2.record_event(jsonb), v2.award(jsonb),
  v2.level_for_xp(bigint)
  to authenticated;

grant execute on all functions in schema v2 to service_role;
grant select on v2.wallets to authenticated, service_role;
