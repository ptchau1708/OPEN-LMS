-- =============================================================================
-- OPEN-EDU · Đấu 1–1 (Đấu trường)
--   • v2.duels: một trận (mã phòng 4 số, lớp, môn, 7 câu cùng thứ tự, kế hoạch bạn Robo, điểm, người thắng).
--   • v2.duel_answers: kết quả từng câu do Edge Function `grade` ghi (context.duelId) — không chứa lựa chọn.
--   • RPC: duel_seek / duel_create / duel_join / duel_create_bot / duel_cancel / duel_get / duel_skip /
--          duel_finish / duel_stats; duel_record_answer chỉ cho service role.
--   • Sao: tham gia 1, thắng +2, tối đa 5 trận có sao mỗi ngày (giờ Việt Nam), dedupe 'duel:<id>'.
--   • Kênh Realtime private `duel:<id>` (hai bạn trong trận) và `duel-lobby:<classId>` (HS cùng lớp).
--   Gói Free: không bảng nào vào publication; chỉ broadcast/presence, RPC nhỏ.
-- =============================================================================

create table if not exists v2.duels (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[0-9]{4}$'),
  mode text not null check (mode in ('queue', 'code', 'challenge', 'bot')),
  class_id text references v2.classes (id) on delete set null,
  subject text not null check (subject in ('toan', 'tieng-viet', 'tieng-anh', 'tnxh', 'khoa-hoc', 'mi-thuat', 'am-nhac', 'khac')),
  grade smallint not null check (grade between 1 and 5),
  -- players[1] = chủ phòng; trận với Robo chỉ có 1 HS.
  players uuid[] not null check (cardinality(players) between 1 and 2),
  invitee uuid references v2.profiles (id) on delete cascade,
  item_ids text[] not null check (cardinality(item_ids) between 3 and 10),
  seed int not null default 0,
  bot_plan jsonb check (bot_plan is null or jsonb_typeof(bot_plan) = 'array'),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished', 'cancelled')),
  scores jsonb not null default '{}'::jsonb,
  correct jsonb not null default '{}'::jsonb,
  -- null + winner_bot=false = hoà (khi đã xong).
  winner uuid,
  winner_bot boolean not null default false,
  forfeit_by uuid,
  created_by uuid not null references v2.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);
create unique index if not exists duels_open_code_key on v2.duels (code) where status in ('waiting', 'playing');
create index if not exists duels_queue_idx on v2.duels (subject, grade, class_id, created_at) where status = 'waiting' and mode = 'queue';
create index if not exists duels_players_idx on v2.duels using gin (players);
create index if not exists duels_class_idx on v2.duels (class_id, created_at desc);

create table if not exists v2.duel_answers (
  duel_id uuid not null references v2.duels (id) on delete cascade,
  user_id uuid not null references v2.profiles (id) on delete cascade,
  q smallint not null check (q between 0 and 9),
  item_id text,
  correct boolean not null default false,
  points int not null default 0 check (points between 0 and 150),
  ms int not null check (ms between 0 and 20000),
  at timestamptz not null default now(),
  primary key (duel_id, user_id, q)
);

alter table v2.duels enable row level security;
alter table v2.duel_answers enable row level security;
drop policy if exists duels_read on v2.duels;
create policy duels_read on v2.duels for select to authenticated
  using ((select auth.uid()) = any (players) or invitee = (select auth.uid()) or v2.is_teacher_of_class(class_id) or (select v2.is_admin()));
drop policy if exists duel_answers_read on v2.duel_answers;
create policy duel_answers_read on v2.duel_answers for select to authenticated
  using (exists (select 1 from v2.duels d where d.id = duel_id and ((select auth.uid()) = any (d.players) or v2.is_teacher_of_class(d.class_id))));
-- Không có policy ghi: mọi thay đổi đi qua RPC security definer.
grant select on v2.duels, v2.duel_answers to authenticated;
grant all on v2.duels, v2.duel_answers to service_role;

-- -----------------------------------------------------------------------------
-- Tiện ích
-- -----------------------------------------------------------------------------
-- Giống packages/data/src/duel/logic.ts duelPoints.
create or replace function v2.duel_points(p_correct boolean, p_ms int) returns int
language sql immutable set search_path = v2, public as $$
  select case when p_correct then 100 + round(50 * (1 - least(20000, greatest(0, coalesce(p_ms, 20000)))::numeric / 20000))::int else 0 end
$$;

create or replace function v2.duel_player_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object('userId', p.id, 'name', p.name, 'mascot', p.avatar_mascot, 'color', p.avatar_color)
  from v2.profiles p where p.id = p_user
$$;

create or replace function v2.duel_json(d v2.duels) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', d.id, 'code', d.code, 'mode', d.mode, 'classId', d.class_id, 'subject', d.subject, 'grade', d.grade,
    'players', coalesce((select jsonb_agg(v2.duel_player_json(u) order by o) from unnest(d.players) with ordinality as x(u, o)), '[]'::jsonb)
      || case when d.mode = 'bot' then jsonb_build_array(jsonb_build_object('userId', 'bot-robo', 'name', 'Bạn Robo', 'mascot', 'panda', 'color', '#64748b', 'isBot', true)) else '[]'::jsonb end,
    'itemIds', to_jsonb(d.item_ids), 'seed', d.seed, 'botPlan', d.bot_plan, 'status', d.status, 'createdAt', d.created_at))
$$;

-- 7 câu dạng trả lời nhanh, có đáp án; ưu tiên tối đa 4 câu thuộc kĩ năng HS đang học / cần ôn; thứ tự ngẫu nhiên.
create or replace function v2._duel_pick_items(p_user uuid, p_grade int, p_subject text) returns text[]
language sql volatile security definer set search_path = v2, public as $$
  with c as (
    select i.id, random() as r,
      exists (select 1 from v2.item_skills s join v2.skill_mastery m on m.skill_code = s.skill_code and m.user_id = p_user
              where s.item_id = i.id and m.level in ('dang-hoc', 'can-on')) as pref
    from v2.items i join v2.item_keys k on k.item_id = i.id and k.key is not null
    where i.grade = p_grade and i.subject = p_subject
      and i.type in ('MCQ', 'LISTEN_CHOOSE', 'SHORT_ANSWER', 'MATH_MANIPULATIVE', 'MCQ_MULTIPLE', 'ORDERING')
  ), p as (select id from c where pref order by r limit 4),
  o as (select id from c where id not in (select id from p) order by r limit 7),
  z as (select id from (select id, 0 as g from p union all select id, 1 from o) u order by g limit 7)
  select coalesce(array_agg(id order by random()), '{}') from z
$$;

create or replace function v2._duel_new(p_mode text, p_subject text, p_invitee uuid) returns v2.duels
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_me v2.profiles;
  v_items text[];
  v_code text;
  v_d v2.duels;
  i int := 0;
begin
  if v_role <> 'student' then raise exception 'Đấu 1–1 dành cho học sinh.' using errcode = '42501'; end if;
  select * into v_me from v2.profiles where id = v_uid;
  if v_me.grade is null then raise exception 'Tài khoản của em chưa có khối lớp. Em báo thầy/cô nhé.' using errcode = '22023'; end if;
  if (select count(*) from v2.duels where created_by = v_uid and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Em đấu nhiều quá rồi! Nghỉ một chút rồi chơi tiếp nhé.' using errcode = '54000';
  end if;
  -- Huỷ phòng chờ cũ của em.
  update v2.duels set status = 'cancelled', ended_at = now() where created_by = v_uid and status = 'waiting';
  v_items := v2._duel_pick_items(v_uid, v_me.grade, p_subject);
  if coalesce(cardinality(v_items), 0) < 3 then raise exception 'Môn này chưa đủ câu hỏi để đấu. Em chọn môn khác nhé!' using errcode = 'P0002'; end if;
  loop
    v_code := (1000 + floor(random() * 9000))::int::text;
    exit when not exists (select 1 from v2.duels where code = v_code and status in ('waiting', 'playing'));
    i := i + 1;
    if i > 30 then raise exception 'Phòng đấu đang đông, em thử lại sau ít giây nhé.' using errcode = '54000'; end if;
  end loop;
  insert into v2.duels (code, mode, class_id, subject, grade, players, invitee, item_ids, seed, status, created_by, started_at)
  values (v_code, p_mode, v_me.class_id, p_subject, v_me.grade, array[v_uid], p_invitee, v_items, floor(random() * 2147483647)::int,
          case when p_mode = 'bot' then 'playing' else 'waiting' end, v_uid, case when p_mode = 'bot' then now() end)
  returning * into v_d;
  return v_d;
end $$;

-- -----------------------------------------------------------------------------
-- Ghép cặp
-- -----------------------------------------------------------------------------
create or replace function v2.duel_seek(p_subject text) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_me v2.profiles;
  v_d v2.duels;
begin
  select * into v_me from v2.profiles where id = v_uid;
  select * into v_d from v2.duels d
   where d.status = 'waiting' and d.mode = 'queue' and d.subject = p_subject and d.grade = v_me.grade
     and d.class_id is not distinct from v_me.class_id and d.created_by <> v_uid and d.created_at > now() - interval '60 seconds'
   order by d.created_at limit 1 for update skip locked;
  if found then
    update v2.duels set players = players || v_uid, status = 'playing', started_at = now() where id = v_d.id returning * into v_d;
    update v2.duels set status = 'cancelled', ended_at = now() where created_by = v_uid and status = 'waiting';
    return v2.duel_json(v_d);
  end if;
  return v2.duel_json(v2._duel_new('queue', p_subject, null));
end $$;

create or replace function v2.duel_create(p_subject text, p_invitee uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare v_me v2.profiles;
begin
  perform v2._require_user();
  if p_invitee is not null then
    select * into v_me from v2.profiles where id = auth.uid();
    if not exists (select 1 from v2.profiles p where p.id = p_invitee and p.role = 'student' and p.id <> v_me.id
                   and (p.class_id is not distinct from v_me.class_id) and p.grade = v_me.grade) then
      raise exception 'Em chỉ thách đấu được bạn cùng lớp.' using errcode = '42501';
    end if;
  end if;
  return v2.duel_json(v2._duel_new(case when p_invitee is null then 'code' else 'challenge' end, p_subject, p_invitee));
end $$;

create or replace function v2.duel_join(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_me v2.profiles;
  v_d v2.duels;
begin
  if v_role <> 'student' then raise exception 'Đấu 1–1 dành cho học sinh.' using errcode = '42501'; end if;
  select * into v_me from v2.profiles where id = v_uid;
  select * into v_d from v2.duels d where d.code = btrim(p_code) and d.status = 'waiting' and d.mode in ('code', 'challenge')
     and d.created_at > now() - interval '30 minutes' for update;
  if not found or v_d.created_by = v_uid then
    raise exception 'Không tìm thấy phòng này. Em hỏi lại bạn mã 4 số nhé!' using errcode = 'P0002';
  end if;
  if v_d.invitee is not null and v_d.invitee <> v_uid then
    raise exception 'Phòng này đang chờ một bạn khác.' using errcode = '42501';
  end if;
  if v_d.grade <> v_me.grade then
    raise exception 'Phòng này dành cho bạn cùng khối lớp.' using errcode = '42501';
  end if;
  update v2.duels set players = players || v_uid, status = 'playing', started_at = now() where id = v_d.id returning * into v_d;
  return v2.duel_json(v_d);
end $$;

-- Bạn Robo: độ khó theo mức thành thạo môn (tỉ lệ đúng 45–85 %, thời gian 5–11 giây) — giống botProfileFor/botPlan.
create or replace function v2.duel_create_bot(p_subject text) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_d v2.duels;
  v_avg real;
  v_acc real;
  v_mean int;
  v_plan jsonb := '[]'::jsonb;
  v_ok boolean;
  i int;
begin
  v_d := v2._duel_new('bot', p_subject, null);
  select coalesce(avg(m.p), 0.5) into v_avg from v2.skill_mastery m join v2.skills s on s.code = m.skill_code
   where m.user_id = auth.uid() and s.subject = p_subject;
  v_acc := least(0.85, greatest(0.45, 0.4 + v_avg * 0.45));
  v_mean := round(11000 - v_avg * 6000);
  for i in 1 .. cardinality(v_d.item_ids) loop
    v_ok := random() < v_acc;
    v_plan := v_plan || jsonb_build_object('correct', v_ok,
      'ms', least(18000, greatest(2500, round(v_mean * (0.6 + random() * 0.8) * case when v_ok then 1 else 1.15 end)))::int);
  end loop;
  update v2.duels set bot_plan = v_plan where id = v_d.id returning * into v_d;
  return v2.duel_json(v_d);
end $$;

create or replace function v2.duel_cancel(p_id uuid) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  update v2.duels set status = 'cancelled', ended_at = now()
   where id = p_id and status = 'waiting' and (created_by = auth.uid() or invitee = auth.uid());
end $$;

create or replace function v2.duel_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare v_d v2.duels;
begin
  perform v2._require_user();
  select * into v_d from v2.duels where id = p_id and (auth.uid() = any (players) or invitee = auth.uid());
  if not found then return null; end if;
  return v2.duel_json(v_d);
end $$;

-- -----------------------------------------------------------------------------
-- Câu trả lời (Edge Function grade, service role) và hết giờ (HS)
-- -----------------------------------------------------------------------------
create or replace function v2.duel_record_answer(
  p_user uuid, p_duel uuid, p_q int, p_item text, p_correct boolean, p_score real, p_ms int,
  p_response jsonb, p_skills text[], p_misconceptions text[]
) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_d v2.duels;
  v_ms int := least(20000, greatest(300, coalesce(p_ms, 20000)));
  v_points int;
  v_new boolean;
begin
  select * into v_d from v2.duels where id = p_duel;
  if not found or not (p_user = any (v_d.players)) then raise exception 'Em không ở trong trận này.' using errcode = '42501'; end if;
  if v_d.status <> 'playing' then raise exception 'Trận đã kết thúc.' using errcode = '22023'; end if;
  if p_q is null or p_q < 0 or p_q >= cardinality(v_d.item_ids) or v_d.item_ids[p_q + 1] <> p_item then
    raise exception 'Câu hỏi không thuộc trận này.' using errcode = '22023';
  end if;
  v_points := v2.duel_points(p_correct, v_ms);
  insert into v2.duel_answers (duel_id, user_id, q, item_id, correct, points, ms)
  values (p_duel, p_user, p_q, p_item, coalesce(p_correct, false), v_points, v_ms)
  on conflict do nothing
  returning true into v_new;
  if coalesce(v_new, false) then
    insert into v2.learning_events (user_id, verb, object_type, object_id, result)
    values (p_user, 'answered', 'arena', p_item, jsonb_build_object(
      'correct', coalesce(p_correct, false), 'score', coalesce(p_score, 0), 'durationMs', v_ms, 'duelId', p_duel,
      'skills', to_jsonb(coalesce(p_skills, '{}')), 'misconceptions', to_jsonb(coalesce(p_misconceptions, '{}'))));
    return jsonb_build_object('points', v_points, 'ms', v_ms, 'recorded', true);
  end if;
  -- Gửi lại cùng câu: trả kết quả đã ghi, không tính lại.
  return (select jsonb_build_object('points', a.points, 'ms', a.ms, 'recorded', false, 'correct', a.correct)
            from v2.duel_answers a where a.duel_id = p_duel and a.user_id = p_user and a.q = p_q);
end $$;

create or replace function v2.duel_skip(p_id uuid, p_q int) returns void
language plpgsql volatile security definer set search_path = v2, public as $$
declare v_d v2.duels;
begin
  perform v2._require_user();
  select * into v_d from v2.duels where id = p_id and auth.uid() = any (players) and status = 'playing';
  if not found or p_q < 0 or p_q >= cardinality(v_d.item_ids) then return; end if;
  insert into v2.duel_answers (duel_id, user_id, q, item_id, correct, points, ms)
  values (p_id, auth.uid(), p_q, v_d.item_ids[p_q + 1], false, 0, 20000) on conflict do nothing;
end $$;

-- -----------------------------------------------------------------------------
-- Kết thúc trận + sao
-- Trả { pending: true } khi trận chưa xong (client hỏi lại sau 1–2 giây).
-- Trận xong khi: đủ câu của cả hai (Robo: của HS); hoặc quá 4 phút; hoặc bạn kia im lặng > 20 giây (p_claim_forfeit).
-- -----------------------------------------------------------------------------
create or replace function v2.duel_finish(p_id uuid, p_claim_forfeit boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := v2._require_user();
  v_d v2.duels;
  v_n int;
  v_opp uuid;
  v_my_count int;
  v_opp_count int;
  v_opp_last timestamptz;
  v_scores jsonb;
  v_correct jsonb;
  v_my int;
  v_op int;
  v_myc int;
  v_opc int;
  v_outcome text;
  v_today int;
  v_stars int := 0;
  v_capped boolean := false;
  v_award jsonb;
  v_bot boolean;
begin
  select * into v_d from v2.duels where id = p_id for update;
  if not found or not (v_uid = any (v_d.players)) then raise exception 'Không tìm thấy trận đấu.' using errcode = 'P0002'; end if;
  if v_d.status in ('waiting', 'cancelled') then raise exception 'Trận này chưa bắt đầu.' using errcode = '22023'; end if;
  v_bot := v_d.mode = 'bot';
  v_n := cardinality(v_d.item_ids);
  v_opp := (select u from unnest(v_d.players) u where u <> v_uid limit 1);

  if v_d.status = 'playing' then
    select count(*) into v_my_count from v2.duel_answers where duel_id = p_id and user_id = v_uid;
    if v_bot then
      if v_my_count < v_n and now() < v_d.started_at + interval '4 minutes' then return jsonb_build_object('pending', true); end if;
      v_my := coalesce((select sum(points) from v2.duel_answers where duel_id = p_id and user_id = v_uid), 0);
      v_myc := (select count(*) from v2.duel_answers where duel_id = p_id and user_id = v_uid and correct);
      select coalesce(sum(v2.duel_points((s ->> 'correct')::boolean, (s ->> 'ms')::int)), 0), count(*) filter (where (s ->> 'correct')::boolean)
        into v_op, v_opc from jsonb_array_elements(coalesce(v_d.bot_plan, '[]'::jsonb)) s;
      v_scores := jsonb_build_object(v_uid::text, v_my, 'bot-robo', v_op);
      v_correct := jsonb_build_object(v_uid::text, v_myc, 'bot-robo', v_opc);
      update v2.duels set status = 'finished', ended_at = now(), scores = v_scores, correct = v_correct,
        winner = case when v_my > v_op or (v_my = v_op and v_myc > v_opc) then v_uid end,
        winner_bot = (v_op > v_my or (v_op = v_my and v_opc > v_myc))
      where id = p_id returning * into v_d;
    else
      select count(*), max(at) into v_opp_count, v_opp_last from v2.duel_answers where duel_id = p_id and user_id = v_opp;
      if p_claim_forfeit and v_opp_count < v_n and coalesce(v_opp_last, v_d.started_at) < now() - interval '20 seconds' then
        update v2.duels set forfeit_by = v_opp where id = p_id;
        v_d.forfeit_by := v_opp;
      elsif (v_my_count < v_n or v_opp_count < v_n) and now() < v_d.started_at + interval '4 minutes' then
        return jsonb_build_object('pending', true);
      end if;
      select coalesce(jsonb_object_agg(u::text, coalesce((select sum(points) from v2.duel_answers a where a.duel_id = p_id and a.user_id = u), 0)), '{}'),
             coalesce(jsonb_object_agg(u::text, (select count(*) from v2.duel_answers a where a.duel_id = p_id and a.user_id = u and a.correct)), '{}')
        into v_scores, v_correct from unnest(v_d.players) u;
      v_my := (v_scores ->> v_uid::text)::int; v_op := coalesce((v_scores ->> v_opp::text)::int, 0);
      v_myc := (v_correct ->> v_uid::text)::int; v_opc := coalesce((v_correct ->> v_opp::text)::int, 0);
      update v2.duels set status = 'finished', ended_at = now(), scores = v_scores, correct = v_correct,
        winner = case
          when v_d.forfeit_by is not null then (select u from unnest(players) u where u <> v_d.forfeit_by limit 1)
          when v_my > v_op or (v_my = v_op and v_myc > v_opc) then v_uid
          when v_op > v_my or (v_op = v_my and v_opc > v_myc) then v_opp
        end
      where id = p_id returning * into v_d;
    end if;
  end if;

  v_outcome := case when v_d.winner = v_uid then 'win' when v_d.winner is null and not v_d.winner_bot then 'draw' else 'lose' end;

  -- Sao (một lần mỗi trận; người bỏ cuộc không có sao; tối đa 5 trận/ngày).
  if v_d.forfeit_by is distinct from v_uid
     and not exists (select 1 from v2.reward_ledger where user_id = v_uid and dedupe_key = 'duel:' || p_id::text) then
    select count(*) into v_today from v2.reward_ledger
     where user_id = v_uid and source_type = 'arena' and dedupe_key like 'duel:%'
       and at >= (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
    if v_today >= 5 then
      v_capped := true;
    else
      v_stars := 1 + case when v_outcome = 'win' then 2 else 0 end;
      v_award := v2._award(v_uid, v_stars, v_stars, v_stars * 10,
        case when v_outcome = 'win' then 'Thắng trận Đấu 1–1' else 'Tham gia Đấu 1–1' end, 'arena', p_id::text, 'duel:' || p_id::text, null);
      v_stars := coalesce((v_award ->> 'stars')::int, 0);
    end if;
  end if;
  if not exists (select 1 from v2.learning_events where user_id = v_uid and object_type = 'arena' and object_id = 'duel:' || p_id::text) then
    insert into v2.learning_events (user_id, verb, object_type, object_id, result)
    values (v_uid, 'completed', 'arena', 'duel:' || p_id::text, jsonb_build_object(
      'correct', v_outcome = 'win', 'score', coalesce((v_d.scores ->> v_uid::text)::int, 0),
      'correctCount', coalesce((v_d.correct ->> v_uid::text)::int, 0), 'total', v_n,
      'response', jsonb_build_object('outcome', v_outcome, 'bot', v_bot, 'subject', v_d.subject)));
    insert into v2.arena_profiles (user_id, wins, losses) values (v_uid, (v_outcome = 'win')::int, (v_outcome = 'lose')::int)
    on conflict (user_id) do update set wins = v2.arena_profiles.wins + excluded.wins, losses = v2.arena_profiles.losses + excluded.losses, updated_at = now();
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'pending', false, 'scores', v_d.scores, 'correct', v_d.correct,
    'winner', case when v_d.winner_bot then 'bot-robo' else v_d.winner::text end,
    'forfeitBy', v_d.forfeit_by, 'stars', v_stars, 'capped', v_capped,
    'wallet', coalesce(v_award -> 'wallet', v2.wallet_json(v_uid)), 'newlyUnlocked', coalesce(v_award -> 'newlyUnlocked', '[]'::jsonb)));
end $$;

create or replace function v2.duel_stats(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  if not (v2.can_view_user(p_user) or v2.is_admin()) then raise exception 'Không có quyền xem.' using errcode = '42501'; end if;
  return (select jsonb_build_object('played', count(*),
      'wins', count(*) filter (where e.result -> 'response' ->> 'outcome' = 'win'),
      'draws', count(*) filter (where e.result -> 'response' ->> 'outcome' = 'draw'))
    from v2.learning_events e
    where e.user_id = p_user and e.verb = 'completed' and e.object_type = 'arena' and e.object_id like 'duel:%');
end $$;

-- Dọn phòng chờ quá hạn (gọi từ v2 maintenance hoặc cron nếu có).
create or replace function v2.duel_cleanup() returns int
language sql volatile security definer set search_path = v2, public as $$
  with u as (update v2.duels set status = 'cancelled', ended_at = now()
             where status = 'waiting' and created_at < now() - interval '30 minutes' returning 1)
  select count(*)::int from u
$$;

revoke execute on function v2.duel_record_answer(uuid, uuid, int, text, boolean, real, int, jsonb, text[], text[]),
  v2._duel_new(text, text, uuid), v2._duel_pick_items(uuid, int, text), v2.duel_cleanup(), v2.duel_player_json(uuid), v2.duel_json(v2.duels)
  from public, anon, authenticated;
grant execute on function v2.duel_seek(text), v2.duel_create(text, uuid), v2.duel_join(text), v2.duel_create_bot(text),
  v2.duel_cancel(uuid), v2.duel_get(uuid), v2.duel_skip(uuid, int), v2.duel_finish(uuid, boolean), v2.duel_stats(uuid),
  v2.duel_points(boolean, int) to authenticated;
grant execute on function v2.duel_record_answer(uuid, uuid, int, text, boolean, real, int, jsonb, text[], text[]),
  v2.duel_cleanup(), v2.duel_json(v2.duels), v2.duel_player_json(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Kênh Realtime private
-- -----------------------------------------------------------------------------
create or replace function v2.can_access_duel_topic(p_topic text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select case
    when p_topic like 'duel:%' then exists (
      select 1 from v2.duels d where d.id = v2.try_uuid(substr(p_topic, 6))
        and (auth.uid() = any (d.players) or d.invitee = auth.uid() or d.created_by = auth.uid())
        and d.created_at > now() - interval '1 day')
    when p_topic like 'duel-lobby:%' then v2.is_member_of_class(substr(p_topic, 12))
      or exists (select 1 from v2.profiles p where p.id = auth.uid() and p.class_id = substr(p_topic, 12))
    else false end
$$;
grant execute on function v2.can_access_duel_topic(text) to authenticated, service_role;

do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists "openedu v2 duel receive" on realtime.messages';
    execute 'drop policy if exists "openedu v2 duel send" on realtime.messages';
    execute $p$
      create policy "openedu v2 duel receive" on realtime.messages for select to authenticated
      using ((realtime.topic() like 'duel:%' or realtime.topic() like 'duel-lobby:%') and v2.can_access_duel_topic(realtime.topic()))
    $p$;
    execute $p$
      create policy "openedu v2 duel send" on realtime.messages for insert to authenticated
      with check ((realtime.topic() like 'duel:%' or realtime.topic() like 'duel-lobby:%') and v2.can_access_duel_topic(realtime.topic()))
    $p$;
  else
    raise notice 'realtime.messages chưa có (Realtime Authorization chưa bật) — bỏ qua policy kênh duel.';
  end if;
end $$;
