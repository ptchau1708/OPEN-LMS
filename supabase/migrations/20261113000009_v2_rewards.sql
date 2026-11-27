-- =============================================================================
-- Phase 6 — Huy hiệu, cửa hàng trang phục linh vật, Vườn lớp (docs/PHASE6_REWARDS.md)
-- Bảng: badges, user_badges, badge_evals, shop_items, user_items, equipped, class_gardens, garden_goals
-- RPC: get_badge_shelf, evaluate_badges, mark_badges_seen, grant_teacher_badge, list_teacher_badges,
--      get_shop, buy_item, equip_item, get_class_garden, set_garden_goal
-- Quy tắc xu: mỗi sao kiếm được kèm 1 xu (`_award` vá lại bên dưới + chuyển dữ liệu cũ). Xu chỉ tiêu trong
-- cửa hàng (dòng sổ thưởng source_type 'shop', coins âm). Không có tiền thật.
-- HS chỉ có quyền SELECT trên các bảng mới; mọi ghi qua RPC security definer.
-- =============================================================================

-- ---------- sổ thưởng: thêm 'shop' vào danh sách nguồn (giữ nguyên các giá trị migration khác đã thêm) ----------
do $$
declare v_def text; v_vals text[];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = 'v2.reward_ledger'::regclass and c.conname = 'reward_ledger_source_type_check';
  if v_def is null or v_def like '%''shop''%' then return; end if;
  select array_agg(distinct m[1]) into v_vals from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  v_vals := array_append(v_vals, 'shop');
  execute 'alter table v2.reward_ledger drop constraint reward_ledger_source_type_check';
  execute format('alter table v2.reward_ledger add constraint reward_ledger_source_type_check check (source_type = any (%L::text[]))', v_vals);
end $$;

-- ---------- 1 sao = 1 xu: khi nơi gọi không ghi xu (coins = 0) mà có sao dương ----------
create or replace function v2._award(
  p_user uuid, p_stars int, p_coins int, p_xp int, p_reason text,
  p_source_type text, p_source_id text, p_dedupe text, p_created_by uuid
) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_id uuid;
  v_new text[] := '{}';
  v_coins int := case when coalesce(p_coins, 0) = 0 and coalesce(p_stars, 0) > 0 then p_stars else coalesce(p_coins, 0) end;
begin
  insert into v2.reward_ledger (user_id, stars, coins, xp, reason, source_type, source_id, dedupe_key, created_by)
  values (p_user, coalesce(p_stars, 0), v_coins, coalesce(p_xp, 0), coalesce(p_reason, ''),
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
revoke execute on function v2._award(uuid, int, int, int, text, text, text, text, uuid) from public, anon, authenticated;

-- Dữ liệu cũ: dòng có sao mà chưa có xu → cộng xu bằng số sao (chạy một lần; dòng 'shop' luôn có stars = 0).
update v2.reward_ledger set coins = stars where coins = 0 and stars > 0;

-- =============================================================================
-- Bảng
-- =============================================================================
create table if not exists v2.badges (
  id text primary key,
  category text not null check (category in ('cham-chi', 'kham-pha', 'va-lo-hong', 'bai-viet', 'dau-truong', 'thi-dua', 'dac-biet', 'cua-co')),
  title text not null,
  hint text not null default '',
  glyph text not null,
  tier smallint not null default 1 check (tier between 1 and 3),
  rule_kind text check (rule_kind in ('streak', 'lessons', 'remediation', 'work', 'workTop', 'duels', 'duelWins', 'tower', 'behavior', 'live', 'help')),
  min_value int not null default 1,
  subject text,
  position smallint not null default 0
);

-- Trùng khớp packages/contracts/src/badges.ts BADGES (kiểm tra bằng vitest badges.test.ts).
insert into v2.badges (id, category, title, hint, glyph, tier, rule_kind, min_value, subject, position) values
  ('streak-3', 'cham-chi', 'Ba ngày chăm chỉ', 'Học 3 ngày liền', 'flame', 1, 'streak', 3, null, 1),
  ('streak-7', 'cham-chi', 'Tuần lễ siêng năng', 'Học 7 ngày liền', 'sun', 2, 'streak', 7, null, 2),
  ('streak-30', 'cham-chi', 'Tháng bền bỉ', 'Học 30 ngày liền', 'rocket', 3, 'streak', 30, null, 3),
  ('lesson-1', 'kham-pha', 'Bài học đầu tiên', 'Học xong 1 bài giảng', 'book', 1, 'lessons', 1, null, 4),
  ('lesson-10', 'kham-pha', 'Nhà thám hiểm', 'Học xong 10 bài giảng', 'compass', 3, 'lessons', 10, null, 5),
  ('toan-3', 'kham-pha', 'Bạn thân của Toán', 'Học xong 3 bài Toán', 'abacus', 2, 'lessons', 3, 'toan', 6),
  ('tv-3', 'kham-pha', 'Bạn thân của Tiếng Việt', 'Học xong 3 bài Tiếng Việt', 'letters', 2, 'lessons', 3, 'tieng-viet', 7),
  ('ta-2', 'kham-pha', 'Xin chào thế giới', 'Học xong 2 bài Tiếng Anh', 'globe', 2, 'lessons', 2, 'tieng-anh', 8),
  ('tnxh-2', 'kham-pha', 'Nhà tự nhiên nhí', 'Học xong 2 bài Tự nhiên và Xã hội', 'leaf', 2, 'lessons', 2, 'tnxh', 9),
  ('rem-1', 'va-lo-hong', 'Vá lỗ hổng đầu tiên', 'Ôn đạt 1 bộ “Ôn lại cho chắc”', 'bandage', 1, 'remediation', 1, null, 10),
  ('rem-5', 'va-lo-hong', 'Thợ vá siêu đẳng', 'Ôn đạt 5 bộ “Ôn lại cho chắc”', 'wrench', 3, 'remediation', 5, null, 11),
  ('work-1', 'bai-viet', 'Bài viết đầu tay', 'Có 1 bài viết được thầy/cô duyệt', 'pencil', 1, 'work', 1, null, 12),
  ('work-5', 'bai-viet', 'Cây bút chăm chỉ', 'Có 5 bài viết được thầy/cô duyệt', 'quill', 2, 'work', 5, null, 13),
  ('work-top', 'bai-viet', 'Ngòi bút vàng', 'Có 1 bài viết đạt mức Hoàn thành tốt', 'crown', 3, 'workTop', 1, null, 14),
  ('duel-1', 'dau-truong', 'Trận đấu đầu tiên', 'Chơi 1 trận Đấu 1–1', 'bolt', 1, 'duels', 1, null, 15),
  ('duel-win-3', 'dau-truong', 'Ba lần chiến thắng', 'Thắng 3 trận Đấu 1–1', 'trophy', 2, 'duelWins', 3, null, 16),
  ('tower-10', 'dau-truong', 'Leo tháp', 'Trả lời đúng 10 câu ở Leo tháp', 'tower', 1, 'tower', 10, null, 17),
  ('tower-50', 'dau-truong', 'Chinh phục đỉnh tháp', 'Trả lời đúng 50 câu ở Leo tháp', 'flag', 3, 'tower', 50, null, 18),
  ('behavior-10', 'thi-dua', 'Ngôi sao của lớp', 'Được thầy/cô khen 10 điểm thi đua', 'star', 1, 'behavior', 10, null, 19),
  ('behavior-30', 'thi-dua', 'Tấm gương sáng', 'Được thầy/cô khen 30 điểm thi đua', 'medal', 3, 'behavior', 30, null, 20),
  ('live-1', 'dac-biet', 'Lớp học trên TV', 'Vào lớp học trực tiếp lần đầu', 'tv', 1, 'live', 1, null, 21),
  ('live-5', 'dac-biet', 'Bạn nhỏ hăng hái', 'Vào lớp học trực tiếp 5 lần', 'rainbow', 2, 'live', 5, null, 22),
  ('help-1', 'dac-biet', 'Người bạn tốt', 'Được khen vì giúp đỡ bạn', 'hands', 1, 'help', 1, null, 23),
  ('help-5', 'dac-biet', 'Trái tim ấm áp', 'Được khen 5 lần vì giúp đỡ bạn', 'heart', 3, 'help', 5, null, 24),
  ('cua-co', 'cua-co', 'Huy hiệu của thầy/cô', 'Thầy/cô tặng riêng cho em', 'heart', 2, null, 0, null, 99)
on conflict (id) do update set category = excluded.category, title = excluded.title, hint = excluded.hint, glyph = excluded.glyph,
  tier = excluded.tier, rule_kind = excluded.rule_kind, min_value = excluded.min_value, subject = excluded.subject, position = excluded.position;

create table if not exists v2.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references v2.profiles (id) on delete cascade,
  badge_id text not null references v2.badges (id),
  earned_at timestamptz not null default now(),
  title text check (title is null or length(title) between 1 and 40),
  glyph text check (glyph is null or glyph in ('heart', 'star', 'flower', 'cup', 'rainbow', 'sun')),
  note text check (note is null or length(note) <= 120),
  granted_by uuid references v2.profiles (id) on delete set null,
  seen_at timestamptz
);
-- Huy hiệu theo quy tắc: mỗi HS một lần; "Huy hiệu của thầy/cô" thì nhiều lần.
create unique index if not exists user_badges_once on v2.user_badges (user_id, badge_id) where badge_id <> 'cua-co';
create index if not exists user_badges_user_idx on v2.user_badges (user_id, earned_at desc);

-- Lần xét đầu tiên: huy hiệu đủ điều kiện từ trước coi như đã xem (không dồn màn chúc mừng).
create table if not exists v2.badge_evals (
  user_id uuid primary key references v2.profiles (id) on delete cascade,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);

create table if not exists v2.shop_items (
  id text primary key,
  slot text not null check (slot in ('hat', 'glasses', 'neck', 'bg')),
  name text not null,
  price int not null check (price > 0),
  position smallint not null default 0,
  active boolean not null default true
);
-- Trùng khớp packages/contracts/src/badges.ts SHOP_ITEMS (giá ở đây là gốc).
insert into v2.shop_items (id, slot, name, price, position) values
  ('hat-party', 'hat', 'Mũ sinh nhật', 15, 1), ('hat-crown', 'hat', 'Vương miện giấy', 40, 2), ('hat-cap', 'hat', 'Mũ lưỡi trai', 20, 3),
  ('hat-flower', 'hat', 'Vòng hoa', 25, 4), ('hat-wizard', 'hat', 'Mũ phù thủy sao', 50, 5), ('hat-chef', 'hat', 'Mũ đầu bếp', 30, 6),
  ('glasses-round', 'glasses', 'Kính tròn', 15, 7), ('glasses-star', 'glasses', 'Kính ngôi sao', 30, 8),
  ('glasses-heart', 'glasses', 'Kính trái tim', 30, 9), ('glasses-sun', 'glasses', 'Kính râm', 25, 10),
  ('neck-bow', 'neck', 'Nơ con bướm', 15, 11), ('neck-scarf', 'neck', 'Khăn len kẻ', 25, 12), ('neck-pioneer', 'neck', 'Khăn quàng đỏ', 20, 13),
  ('neck-medal', 'neck', 'Huy chương vàng', 45, 14), ('neck-flowers', 'neck', 'Vòng hoa cổ', 35, 15),
  ('bg-sky', 'bg', 'Bầu trời xanh', 20, 16), ('bg-night', 'bg', 'Đêm đầy sao', 35, 17), ('bg-beach', 'bg', 'Bãi biển', 35, 18),
  ('bg-garden', 'bg', 'Khu vườn', 30, 19), ('bg-space', 'bg', 'Vũ trụ', 60, 20)
on conflict (id) do update set slot = excluded.slot, name = excluded.name, price = excluded.price, position = excluded.position;

create table if not exists v2.user_items (
  user_id uuid not null references v2.profiles (id) on delete cascade,
  item_id text not null references v2.shop_items (id),
  price int not null,
  ledger_id uuid references v2.reward_ledger (id) on delete set null,
  bought_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists v2.equipped (
  user_id uuid not null,
  slot text not null check (slot in ('hat', 'glasses', 'neck', 'bg')),
  item_id text not null,
  primary key (user_id, slot),
  foreign key (user_id, item_id) references v2.user_items (user_id, item_id) on delete cascade
);

create table if not exists v2.class_gardens (
  class_id text primary key references v2.classes (id) on delete cascade,
  -- Mục tiêu mặc định GV đặt (dùng cho tuần chưa đặt riêng); null = 25 sao × sĩ số.
  default_target int check (default_target is null or default_target between 10 and 5000),
  updated_at timestamptz not null default now()
);

create table if not exists v2.garden_goals (
  class_id text not null references v2.classes (id) on delete cascade,
  week_start date not null,
  target_stars int not null check (target_stars between 10 and 5000),
  plant text not null check (plant in ('huong-duong', 'sen', 'hoa-dao', 'cuc', 'ca-chua', 'xuong-rong')),
  set_by uuid references v2.profiles (id) on delete set null,
  reached_at timestamptz,
  primary key (class_id, week_start)
);

-- =============================================================================
-- RLS: chỉ đọc (theo quyền xem người dùng / lớp); không có policy ghi → HS không tự ghi được.
-- =============================================================================
alter table v2.badges enable row level security;
alter table v2.user_badges enable row level security;
alter table v2.badge_evals enable row level security;
alter table v2.shop_items enable row level security;
alter table v2.user_items enable row level security;
alter table v2.equipped enable row level security;
alter table v2.class_gardens enable row level security;
alter table v2.garden_goals enable row level security;

drop policy if exists badges_read on v2.badges;
create policy badges_read on v2.badges for select to authenticated using (true);
drop policy if exists shop_items_read on v2.shop_items;
create policy shop_items_read on v2.shop_items for select to authenticated using (true);
drop policy if exists user_badges_read on v2.user_badges;
create policy user_badges_read on v2.user_badges for select to authenticated using (v2.can_view_user(user_id));
drop policy if exists user_items_read on v2.user_items;
create policy user_items_read on v2.user_items for select to authenticated using (v2.can_view_user(user_id));
drop policy if exists equipped_read on v2.equipped;
-- Đồ đang mặc: bạn cùng lớp cũng thấy (linh vật hiện trên màn hình lớp).
create policy equipped_read on v2.equipped for select to authenticated using (v2.can_view_user(user_id) or v2.shares_class_with(user_id));
drop policy if exists class_gardens_read on v2.class_gardens;
create policy class_gardens_read on v2.class_gardens for select to authenticated using (v2.can_see_class(class_id));
drop policy if exists garden_goals_read on v2.garden_goals;
create policy garden_goals_read on v2.garden_goals for select to authenticated using (v2.can_see_class(class_id));

revoke all on v2.badges, v2.user_badges, v2.badge_evals, v2.shop_items, v2.user_items, v2.equipped, v2.class_gardens, v2.garden_goals from anon, authenticated;
grant select on v2.badges, v2.user_badges, v2.shop_items, v2.user_items, v2.equipped, v2.class_gardens, v2.garden_goals to authenticated;
grant all on v2.badges, v2.user_badges, v2.badge_evals, v2.shop_items, v2.user_items, v2.equipped, v2.class_gardens, v2.garden_goals to service_role;

-- =============================================================================
-- Huy hiệu
-- =============================================================================
-- Số liệu cho quy tắc (cùng định nghĩa với packages/data/src/badges/rules.ts badgeStatsFrom).
create or replace function v2._badge_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with rw as (select * from v2.reward_ledger where user_id = p_user),
  ev as (select * from v2.learning_events where user_id = p_user),
  days as (select distinct (r.at at time zone 'Asia/Ho_Chi_Minh')::date as d from rw r where r.source_type <> 'shop' and (r.stars > 0 or r.xp > 0)),
  runs as (select count(*) as n from (select d, d - (row_number() over (order by d))::int as g from days) x group by g),
  les as (
    select source_id as id from rw where source_type = 'lesson' and source_id is not null
    union select object_id from ev where verb = 'completed' and object_type = 'lesson'),
  subj as (select l.subject, count(*)::int as n from les join v2.lessons l on l.id = les.id group by l.subject),
  duels as (select object_id, bool_or(coalesce((result ->> 'correct')::boolean, false)) as won
            from ev where object_type = 'arena' and verb = 'completed' and object_id like 'duel:%' group by object_id),
  logs as (select bl.*, b.label from v2.behavior_logs bl left join v2.behaviors b on b.class_id = bl.class_id and b.id = bl.behavior_id
           where bl.student_id = p_user)
  select jsonb_build_object(
    'bestStreak', greatest(coalesce((select max(n) from runs), 0), coalesce((select s.best_days from v2.streaks s where s.user_id = p_user), 0)),
    'lessons', (select count(*) from les),
    'lessonsBySubject', coalesce((select jsonb_object_agg(subject, n) from subj), '{}'::jsonb),
    'remediationPassed', (select count(*) from ev where object_type = 'remediation' and verb = 'completed' and (result ->> 'correct') = 'true'),
    'workApproved', (select count(distinct coalesce(source_id, id::text)) from rw where source_type = 'work'),
    'workTop', (select count(distinct regexp_replace(object_id, ':sai$', '')) from ev where object_type = 'work' and (result -> 'response' ->> 'level') = 'T'),
    'duels', (select count(*) from duels),
    'duelWins', (select count(*) from duels where won),
    'towerCorrect', (select count(*) from rw where source_type = 'arena' and coalesce(source_id, '') not like 'duel:%'),
    'behaviorPoints', (select coalesce(sum(greatest(points, 0)), 0) from logs),
    'liveClasses', greatest(
      (select count(distinct coalesce(live_session_id::text, object_id)) from ev where verb = 'joined' and object_type = 'live'),
      (select count(distinct (at at time zone 'Asia/Ho_Chi_Minh')::date) from rw where source_type = 'live')),
    'helpCount', (select count(*) from logs where points > 0 and (behavior_id = 'bh-giup-ban' or coalesce(label, '') ilike '%giúp%'))
  )
$$;

create or replace function v2._badge_stat_value(p_stats jsonb, p_kind text, p_subject text) returns int
language sql immutable set search_path = v2, public as $$
  select coalesce(case p_kind
    when 'streak' then (p_stats ->> 'bestStreak')::int
    when 'lessons' then case when p_subject is null then (p_stats ->> 'lessons')::int else (p_stats -> 'lessonsBySubject' ->> p_subject)::int end
    when 'remediation' then (p_stats ->> 'remediationPassed')::int
    when 'work' then (p_stats ->> 'workApproved')::int
    when 'workTop' then (p_stats ->> 'workTop')::int
    when 'duels' then (p_stats ->> 'duels')::int
    when 'duelWins' then (p_stats ->> 'duelWins')::int
    when 'tower' then (p_stats ->> 'towerCorrect')::int
    when 'behavior' then (p_stats ->> 'behaviorPoints')::int
    when 'live' then (p_stats ->> 'liveClasses')::int
    when 'help' then (p_stats ->> 'helpCount')::int
  end, 0)
$$;

create or replace function v2._user_badge_json(b v2.user_badges) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select v2.jsonb_compact(jsonb_build_object(
    'id', b.id, 'userId', b.user_id, 'badgeId', b.badge_id, 'earnedAt', b.earned_at, 'title', b.title, 'glyph', b.glyph,
    'note', b.note, 'grantedBy', b.granted_by,
    'grantedByName', (select p.name from v2.profiles p where p.id = b.granted_by),
    'seen', b.seen_at is not null))
$$;

create or replace function v2.get_badge_shelf(p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare v_user uuid := coalesce(p_user, auth.uid());
begin
  perform v2._require_user();
  if not v2.can_view_user(v_user) then
    raise exception 'Không xem được huy hiệu của bạn này.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'stats', v2._badge_stats(v_user),
    'earned', coalesce((select jsonb_agg(v2._user_badge_json(b) order by b.earned_at desc) from v2.user_badges b where b.user_id = v_user), '[]'::jsonb));
end $$;

-- Xét huy hiệu cho chính HS đang đăng nhập; trả về huy hiệu chưa xem (mới đạt + của thầy/cô).
create or replace function v2.evaluate_badges() returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_uid uuid := auth.uid();
  v_stats jsonb;
  v_first boolean;
begin
  if v2._require_user() <> 'student' then return '[]'::jsonb; end if;
  v_first := not exists (select 1 from v2.badge_evals e where e.user_id = v_uid);
  v_stats := v2._badge_stats(v_uid);
  insert into v2.user_badges (user_id, badge_id, seen_at)
  select v_uid, b.id, case when v_first then now() end
  from v2.badges b
  where b.rule_kind is not null and v2._badge_stat_value(v_stats, b.rule_kind, b.subject) >= b.min_value
  on conflict (user_id, badge_id) where badge_id <> 'cua-co' do nothing;
  insert into v2.badge_evals (user_id) values (v_uid) on conflict (user_id) do update set last_at = now();
  return coalesce((select jsonb_agg(v2._user_badge_json(b) order by b.earned_at)
                   from v2.user_badges b where b.user_id = v_uid and b.seen_at is null), '[]'::jsonb);
end $$;

create or replace function v2.mark_badges_seen(p_ids uuid[]) returns void
language plpgsql security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  update v2.user_badges set seen_at = now() where user_id = auth.uid() and id = any (coalesce(p_ids, '{}')) and seen_at is null;
end $$;

create or replace function v2.grant_teacher_badge(p_class text, p_students uuid[], p_title text, p_glyph text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare v_title text := btrim(coalesce(p_title, '')); v_out jsonb := '[]'::jsonb; v_sid uuid; b v2.user_badges;
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Thầy/cô chỉ tặng huy hiệu cho học sinh lớp mình.' using errcode = '42501';
  end if;
  if length(v_title) = 0 then raise exception 'Thầy/cô đặt tên cho huy hiệu nhé.' using errcode = '22023'; end if;
  if p_glyph is null or p_glyph not in ('heart', 'star', 'flower', 'cup', 'rainbow', 'sun') then
    raise exception 'Biểu tượng này chưa có trong bộ huy hiệu.' using errcode = '22023';
  end if;
  foreach v_sid in array coalesce(p_students, '{}') loop
    if not exists (select 1 from v2.class_ids_of(v_sid) c where c = p_class)
       or (select role from v2.profiles where id = v_sid) is distinct from 'student' then continue; end if;
    insert into v2.user_badges (user_id, badge_id, title, glyph, note, granted_by)
    values (v_sid, 'cua-co', left(v_title, 40), p_glyph, nullif(left(btrim(coalesce(p_note, '')), 120), ''), auth.uid())
    returning * into b;
    v_out := v_out || v2._user_badge_json(b);
  end loop;
  return v_out;
end $$;

create or replace function v2.list_teacher_badges(p_class text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ thầy/cô của lớp mới xem được.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(v2._user_badge_json(b) order by b.earned_at desc)
    from v2.user_badges b where b.badge_id = 'cua-co' and exists (select 1 from v2.class_ids_of(b.user_id) c where c = p_class)), '[]'::jsonb);
end $$;

-- =============================================================================
-- Cửa hàng trang phục
-- =============================================================================
create or replace function v2._shop_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'userId', p_user,
    'coins', greatest(coalesce((select sum(coins) from v2.reward_ledger where user_id = p_user), 0), 0),
    'owned', coalesce((select jsonb_agg(item_id order by bought_at) from v2.user_items where user_id = p_user), '[]'::jsonb),
    'outfit', coalesce((select jsonb_object_agg(slot, item_id) from v2.equipped where user_id = p_user), '{}'::jsonb),
    'companion', coalesce((select companion from v2.passports where user_id = p_user), 'nghe'))
$$;

create or replace function v2.get_shop() returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  return v2._shop_json(auth.uid());
end $$;

create or replace function v2.buy_item(p_item text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare v_uid uuid := auth.uid(); v_item v2.shop_items; v_balance int; v_ledger uuid;
begin
  if v2._require_user() <> 'student' then
    raise exception 'Chỉ học sinh mới đổi xu lấy đồ.' using errcode = '42501';
  end if;
  select * into v_item from v2.shop_items where id = p_item and active;
  if not found then raise exception 'Không tìm thấy món đồ này.' using errcode = 'P0002'; end if;
  -- Khóa theo HS để hai lần bấm cùng lúc không tiêu quá số xu.
  perform pg_advisory_xact_lock(hashtext('v2.buy_item:' || v_uid::text));
  if exists (select 1 from v2.user_items where user_id = v_uid and item_id = p_item) then
    raise exception 'Em đã có món này rồi.' using errcode = '23505';
  end if;
  select coalesce(sum(coins), 0) into v_balance from v2.reward_ledger where user_id = v_uid;
  if v_balance < v_item.price then
    raise exception 'Em cần thêm % xu nữa nhé. Học thêm để nhận sao và xu!', v_item.price - v_balance using errcode = 'P0001';
  end if;
  insert into v2.reward_ledger (user_id, stars, coins, xp, reason, source_type, source_id, dedupe_key, created_by)
  values (v_uid, 0, -v_item.price, 0, 'Đổi xu lấy: ' || v_item.name, 'shop', v_item.id, 'shop:' || v_item.id, v_uid)
  returning id into v_ledger;
  insert into v2.user_items (user_id, item_id, price, ledger_id) values (v_uid, v_item.id, v_item.price, v_ledger);
  return v2._shop_json(v_uid);
end $$;

create or replace function v2.equip_item(p_slot text, p_item text default null) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare v_uid uuid := auth.uid(); v_slot text;
begin
  perform v2._require_user();
  if p_slot not in ('hat', 'glasses', 'neck', 'bg') then raise exception 'Chỗ mặc không hợp lệ.' using errcode = '22023'; end if;
  if p_item is null then
    delete from v2.equipped where user_id = v_uid and slot = p_slot;
    return v2._shop_json(v_uid);
  end if;
  select slot into v_slot from v2.shop_items where id = p_item;
  if v_slot is distinct from p_slot then raise exception 'Món này không mặc ở chỗ đó được.' using errcode = '22023'; end if;
  if not exists (select 1 from v2.user_items where user_id = v_uid and item_id = p_item) then
    raise exception 'Em cần đổi xu lấy món này trước nhé.' using errcode = '42501';
  end if;
  insert into v2.equipped (user_id, slot, item_id) values (v_uid, p_slot, p_item)
  on conflict (user_id, slot) do update set item_id = excluded.item_id;
  return v2._shop_json(v_uid);
end $$;

-- =============================================================================
-- Vườn lớp
-- =============================================================================
create or replace function v2._vn_week_start() returns date
language sql stable set search_path = v2, public as $$
  select date_trunc('week', (now() at time zone 'Asia/Ho_Chi_Minh'))::date
$$;

create or replace function v2._class_student_ids(p_class text) returns setof uuid
language sql stable security definer set search_path = v2, public as $$
  select p.id from v2.profiles p where p.role = 'student' and p.class_id = p_class
  union
  select m.user_id from v2.class_members m join v2.profiles p on p.id = m.user_id
  where m.class_id = p_class and m.role = 'student' and p.role = 'student'
$$;

-- Dữ liệu thô của vườn (GardenRaw trong packages/data/src/badges/rules.ts), đã lọc theo người xem:
-- GV/admin thấy từng HS; HS chỉ thấy phần của mình + tổng lớp + tổng tổ (không có bảng xếp hạng).
create or replace function v2._garden_raw(p_class text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  c v2.classes;
  v_week date := v2._vn_week_start();
  v_from timestamptz := (v2._vn_week_start()::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_staff boolean := v2.is_teacher_of_class(p_class);
  v_goal v2.garden_goals;
  v_count int;
  v_target int; v_plant text; v_custom boolean;
  v_total int;
  v_plants text[] := array['huong-duong', 'sen', 'hoa-dao', 'cuc', 'ca-chua', 'xuong-rong'];
begin
  select * into c from v2.classes where id = p_class;
  if not found then raise exception 'Không tìm thấy lớp.' using errcode = 'P0002'; end if;
  create temp table if not exists _g_stars (user_id uuid primary key, stars int, team_id text) on commit drop;
  delete from _g_stars where true;  -- Supabase bật pg_safeupdate cho API: DELETE phải có WHERE.
  insert into _g_stars
  select s.id, coalesce((select sum(r.stars) from v2.reward_ledger r where r.user_id = s.id and r.stars > 0 and r.at >= v_from), 0),
         (select m.team_id from v2.class_members m where m.class_id = p_class and m.user_id = s.id)
  from v2._class_student_ids(p_class) s(id);
  select count(*), coalesce(sum(stars), 0) into v_count, v_total from _g_stars;

  select * into v_goal from v2.garden_goals where class_id = p_class and week_start = v_week;
  if found then
    v_target := v_goal.target_stars; v_plant := v_goal.plant; v_custom := true;
  else
    v_target := coalesce((select default_target from v2.class_gardens where class_id = p_class), greatest(50, ceil(v_count * 25 / 10.0)::int * 10));
    -- Cùng công thức defaultPlant (rules.ts): số tuần kể từ 1970 theo mốc thứ Hai 0 giờ (giờ VN).
    v_plant := v_plants[1 + (floor(extract(epoch from v_from) / (7 * 86400))::bigint % 6)::int];
    v_custom := false;
  end if;
  -- Đạt mục tiêu → ghi vào bộ sưu tập (một lần mỗi tuần).
  if v_total >= v_target then
    insert into v2.garden_goals (class_id, week_start, target_stars, plant, reached_at)
    values (p_class, v_week, v_target, v_plant, now())
    on conflict (class_id, week_start) do update set reached_at = coalesce(v2.garden_goals.reached_at, now());
  end if;

  return jsonb_build_object(
    'classId', c.id, 'className', c.name, 'grade', c.grade,
    'weekStart', to_char(v_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'),
    'goal', jsonb_build_object('targetStars', v_target, 'plant', v_plant, 'custom', v_custom),
    'classStars', v_total, 'studentCount', v_count,
    'students', case when v_staff then coalesce((
      select jsonb_agg(v2.jsonb_compact(jsonb_build_object('id', g.user_id, 'name', p.name, 'mascot', coalesce(pp.companion, p.avatar_mascot), 'stars', g.stars, 'teamId', g.team_id)) order by p.name)
      from _g_stars g join v2.profiles p on p.id = g.user_id left join v2.passports pp on pp.user_id = g.user_id), '[]'::jsonb) else '[]'::jsonb end,
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color,
        'stars', coalesce((select sum(g.stars) from _g_stars g where g.team_id = t.id), 0),
        'members', (select count(*) from _g_stars g where g.team_id = t.id)) order by t.position, t.name)
      from v2.class_teams t where t.class_id = p_class), '[]'::jsonb),
    'collection', coalesce((
      select jsonb_agg(jsonb_build_object('weekStart', to_char((gg.week_start::timestamp at time zone 'Asia/Ho_Chi_Minh') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'), 'plant', gg.plant) order by gg.week_start desc)
      from v2.garden_goals gg where gg.class_id = p_class and gg.reached_at is not null), '[]'::jsonb),
    'me', case when v_staff then null else (
      select v2.jsonb_compact(jsonb_build_object('id', g.user_id, 'stars', g.stars, 'teamId', g.team_id)) from _g_stars g where g.user_id = auth.uid()) end
  );
end $$;

create or replace function v2.get_class_garden(p_class text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
begin
  perform v2._require_user();
  if not (v2.is_teacher_of_class(p_class) or (v2.current_role() = 'student' and v2.is_member_of_class(p_class))) then
    raise exception 'Em chỉ xem được vườn của lớp mình.' using errcode = '42501';
  end if;
  return v2._garden_raw(p_class);
end $$;

create or replace function v2.set_garden_goal(p_class text, p_target int, p_plant text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare v_week date := v2._vn_week_start();
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Chỉ thầy/cô của lớp mới đặt mục tiêu được.' using errcode = '42501';
  end if;
  if p_target is null or p_target < 10 or p_target > 5000 then
    raise exception 'Mục tiêu nên từ 10 đến 5000 sao.' using errcode = '22023';
  end if;
  insert into v2.garden_goals (class_id, week_start, target_stars, plant, set_by)
  values (p_class, v_week, p_target, p_plant, auth.uid())
  on conflict (class_id, week_start) do update set target_stars = excluded.target_stars, plant = excluded.plant, set_by = excluded.set_by,
    reached_at = null; -- đổi mục tiêu: xét lại "đã đạt" theo mục tiêu mới
  insert into v2.class_gardens (class_id, default_target) values (p_class, p_target)
  on conflict (class_id) do update set default_target = excluded.default_target, updated_at = now();
  return v2._garden_raw(p_class);
end $$;

-- =============================================================================
-- Quyền gọi hàm
-- =============================================================================
revoke execute on function
  v2._badge_stats(uuid), v2._badge_stat_value(jsonb, text, text), v2._user_badge_json(v2.user_badges), v2._shop_json(uuid),
  v2._class_student_ids(text), v2._garden_raw(text), v2._vn_week_start()
  from public, anon, authenticated;
revoke execute on function
  v2.get_badge_shelf(uuid), v2.evaluate_badges(), v2.mark_badges_seen(uuid[]), v2.grant_teacher_badge(text, uuid[], text, text, text),
  v2.list_teacher_badges(text), v2.get_shop(), v2.buy_item(text), v2.equip_item(text, text), v2.get_class_garden(text),
  v2.set_garden_goal(text, int, text)
  from public, anon;
grant execute on function
  v2.get_badge_shelf(uuid), v2.evaluate_badges(), v2.mark_badges_seen(uuid[]), v2.grant_teacher_badge(text, uuid[], text, text, text),
  v2.list_teacher_badges(text), v2.get_shop(), v2.buy_item(text), v2.equip_item(text, text), v2.get_class_garden(text),
  v2.set_garden_goal(text, int, text)
  to authenticated;
grant execute on all functions in schema v2 to service_role;
