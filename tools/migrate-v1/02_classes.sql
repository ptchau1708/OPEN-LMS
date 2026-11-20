-- =============================================================================
-- migrate-v1 · Bước 2 · Lớp: classes → v2.classes, student_ids → v2.class_members,
--   class_groups / class_group_members → v2.class_teams + team_id,
--   lớp chính + khối của HS (profiles.class_id, grade). Chạy lại được.
-- =============================================================================

-- Lớp kèm năm học; recency = 1 là lớp của năm học mới nhất.
create or replace view v1etl.classes_x as
select c.*,
       coalesce(ay.name, c.academic_year_id) as year_name,
       coalesce(v1etl.map_grade(c.grade), v1etl.map_grade(c.name), 1)::smallint as grade_n,
       row_number() over (order by ay.is_current desc nulls last, ay.start_date desc nulls last,
                                   ay.name desc nulls last, c.created_at desc nulls last, c.id) as recency
from v1etl.classes c
left join v1etl.academic_years ay on ay.id = c.academic_year_id
where c.id is not null;

insert into v2.classes as t (id, name, grade, teacher_id, academic_year, created_at)
select c.id, coalesce(c.name, 'Lớp ' || c.id), c.grade_n, tp.id, c.year_name, coalesce(c.created_at, now())
from v1etl.classes_x c
left join v2.profiles tp on tp.id::text = c.teacher_id and tp.role in ('teacher', 'admin')
on conflict (id) do update set
  name = excluded.name, grade = excluded.grade, teacher_id = excluded.teacher_id, academic_year = excluded.academic_year;

-- Thành viên từ classes.student_ids
insert into v2.class_members (class_id, user_id, role)
select distinct c.id, p.id, 'student'
from v1etl.classes_x c
cross join lateral unnest(coalesce(c.student_ids, '{}')) as sid
join v2.profiles p on p.id::text = btrim(sid) and p.role = 'student'
on conflict do nothing;

-- HS chưa thuộc lớp nào: ghép theo profiles.class_id hoặc tên lớp (class_name), ưu tiên năm học mới nhất
insert into v2.class_members (class_id, user_id, role)
select distinct on (p.id) cx.id, p.id, 'student'
from v1etl.profiles op
join v2.profiles p on p.id::text = op.id and p.role = 'student'
join v1etl.classes_x cx on cx.id = op.class_id or lower(btrim(cx.name)) = lower(btrim(op.class_name))
where not exists (select 1 from v2.class_members m where m.user_id = p.id)
order by p.id, (cx.id = op.class_id) desc nulls last, cx.recency
on conflict do nothing;

-- Lớp chính + khối của HS = lớp thuộc năm học mới nhất
update v2.profiles p
set class_id = s.class_id, grade = s.grade
from (
  select distinct on (m.user_id) m.user_id, m.class_id, c.grade
  from v2.class_members m
  join v2.classes c on c.id = m.class_id
  join v1etl.classes_x cx on cx.id = c.id
  where m.role = 'student'
  order by m.user_id, cx.recency
) s
where p.id = s.user_id and (p.class_id is distinct from s.class_id or p.grade is distinct from s.grade);

-- Lớp 1–2: bật chữ to mặc định (không ghi đè nếu em đã tự chỉnh)
update v2.profiles
set settings = settings || '{"bigText": true}'::jsonb
where role = 'student' and grade in (1, 2) and not (settings ? 'bigText');

-- Tổ / nhóm thi đua
insert into v2.class_teams as t (id, class_id, name, color, position)
select 'cg_' || g.id, g.class_id, coalesce(g.name, 'Tổ'),
       case when g.color ~ '^#[0-9a-fA-F]{6}$' then g.color
            else (array['#2f7bf6', '#ff8a3d', '#20a974', '#8b5cf6', '#ff5d8f', '#0ea5a4'])[1 + abs(hashtext(g.id)) % 6] end,
       coalesce(g.position, 0)
from v1etl.class_groups g
join v2.classes c on c.id = g.class_id
where g.id is not null
on conflict (id) do update set name = excluded.name, color = excluded.color, position = excluded.position;

update v2.class_members m
set team_id = 'cg_' || gm.group_id
from v1etl.class_group_members gm
join v1etl.class_groups g on g.id = gm.group_id
where m.user_id::text = gm.student_id
  and m.class_id = g.class_id
  and m.team_id is distinct from 'cg_' || gm.group_id
  and exists (select 1 from v2.class_teams t where t.id = 'cg_' || gm.group_id);

select 'classes' as bảng, count(*) as số_dòng_v2 from v2.classes
union all select 'class_members', count(*) from v2.class_members
union all select 'class_teams', count(*) from v2.class_teams;
