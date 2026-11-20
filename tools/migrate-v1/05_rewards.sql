-- =============================================================================
-- migrate-v1 · Bước 5 · Phần thưởng:
--   behavior_logs → 1 dòng "số dư đầu kỳ" mỗi HS trong v2.reward_ledger
--     (stars = tổng điểm DƯƠNG, reason 'Chuyển từ thi đua cũ', source_type 'behavior', dedupe 'migrate:behavior')
--   arena_profiles → v2.arena_profiles + XP vào reward_ledger (dedupe 'migrate:arena')
--   rồi mở khóa linh vật theo tổng sao (v2._sync_passport).
-- Chạy lại: số dư đầu kỳ được CẬP NHẬT theo dữ liệu cũ mới nhất (không cộng dồn hai lần).
--
-- Muốn quy đổi khác (vd 2 điểm thi đua = 1 sao, tối đa 300 sao) thì sửa CTE params bên dưới.
-- =============================================================================

with params as (
  select 1.0::numeric as points_per_star,  -- số điểm thi đua cũ cho 1 sao
         null::int as max_opening_stars    -- null = không giới hạn
),
sums as (
  select b.student_id, sum(b.points) filter (where b.points > 0) as pos
  from v1etl.behavior_logs b
  where b.student_id is not null
  group by b.student_id
)
insert into v2.reward_ledger as r (user_id, stars, coins, xp, reason, source_type, dedupe_key)
select p.id,
       least(floor(s.pos / params.points_per_star)::int, coalesce(params.max_opening_stars, 2147483647)),
       0, 0, 'Chuyển từ thi đua cũ', 'behavior', 'migrate:behavior'
from sums s
cross join params
join v2.profiles p on p.id::text = s.student_id and p.role = 'student'
where coalesce(s.pos, 0) > 0
on conflict (user_id, dedupe_key) where dedupe_key is not null
do update set stars = excluded.stars, at = now();

insert into v2.arena_profiles as t (user_id, elo_rating, tower_floor, wins, losses, total_xp)
select distinct on (p.id) p.id, coalesce(a.elo_rating, 1000), coalesce(a.tower_floor, 0),
       coalesce(a.wins, 0), coalesce(a.losses, 0), greatest(coalesce(a.total_xp, 0), 0)
from v1etl.arena_profiles a
join v2.profiles p on p.id::text = a.user_id
order by p.id, a.total_xp desc nulls last
on conflict (user_id) do update set
  elo_rating = excluded.elo_rating, tower_floor = excluded.tower_floor, wins = excluded.wins,
  losses = excluded.losses, total_xp = excluded.total_xp;

insert into v2.reward_ledger as r (user_id, stars, coins, xp, reason, source_type, dedupe_key)
select a.user_id, 0, 0, a.total_xp, 'Chuyển XP từ Đấu trường cũ', 'arena', 'migrate:arena'
from v2.arena_profiles a
where a.total_xp > 0
on conflict (user_id, dedupe_key) where dedupe_key is not null
do update set xp = excluded.xp, at = now();

-- Mở khóa linh vật theo số sao vừa chuyển
select count(*) filter (where cardinality(v2._sync_passport(p.id)) > 0) as số_hs_vừa_mở_thêm_linh_vật,
       count(*) as tổng_số_hs
from v2.profiles p
where p.role = 'student';
