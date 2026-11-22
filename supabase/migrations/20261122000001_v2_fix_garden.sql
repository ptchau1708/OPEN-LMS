-- =============================================================================
-- OPEN-EDU v2 — sửa lỗi 22/11/2026 (phát hiện khi kiểm tra project Supabase thật)
--  1. Vườn lớp (get_class_garden / set_garden_goal) báo lỗi 400 "DELETE requires a WHERE clause":
--     Supabase bật pg_safeupdate cho các yêu cầu qua API, nên `delete from _g_stars;` bị chặn.
--  2. v2.try_timestamptz: đặt search_path cố định (cảnh báo bảo mật của Supabase Advisor).
-- Chạy lại nhiều lần không sao.
-- =============================================================================

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

alter function v2.try_timestamptz(text) set search_path = pg_catalog;
