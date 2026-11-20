-- =============================================================================
-- migrate-v1 · Bước 1 · Người dùng: profiles → v2.profiles, parents → v2.profiles(role parent), guardian_links
-- Chỉ chuyển người có tài khoản trong auth.users (cùng id). Chạy lại được:
--   • app cũ là nguồn chuẩn cho vai trò/tên/username → cập nhật lại khi chạy lại;
--   • linh vật, màu, cài đặt do em tự chọn trên app mới → KHÔNG bị ghi đè.
-- =============================================================================

-- Học sinh / GV / admin
with src as (
  select u.id,
         v1etl.map_role(p.role) as role,
         coalesce(p.name, split_part(coalesce(p.email, u.email, ''), '@', 1), '') as name,
         case when lower(coalesce(p.email, u.email, '')) like '%@openlms.edu'
                   and length(split_part(lower(coalesce(p.email, u.email)), '@', 1)) between 1 and 64
              then split_part(lower(coalesce(p.email, u.email)), '@', 1) end as uname,
         v2.jsonb_compact(jsonb_build_object(
           'source', 'public.profiles', 'avatar', p.avatar, 'class_name', p.class_name,
           'saved_prompts', p.saved_prompts, 'custom_tools', p.custom_tools,
           'allowed_grades', p.allowed_grades, 'hidden_topics', p.hidden_topics)) as legacy,
         coalesce(p.created_at, u.created_at, now()) as created_at
  from v1etl.profiles p
  join auth.users u on u.id::text = p.id
),
dedup as (
  select s.*, row_number() over (partition by s.uname order by s.created_at, s.id) as rn from src s
)
insert into v2.profiles as t (id, role, name, username, avatar_color, legacy, created_at)
select d.id, d.role, d.name,
       case when d.uname is not null and d.rn = 1
                 and not exists (select 1 from v2.profiles x where x.username = d.uname and x.id <> d.id)
            then d.uname end,
       (array['#2f7bf6', '#ff8a3d', '#8b5cf6', '#20a974', '#0ea5a4', '#ff5d8f', '#e8485f', '#f08a24'])[1 + abs(hashtext(d.id::text)) % 8],
       d.legacy, d.created_at
from dedup d
on conflict (id) do update set
  role = excluded.role,
  name = excluded.name,
  username = coalesce(excluded.username, t.username),
  legacy = excluded.legacy;

-- Phụ huynh (bảng parents có tài khoản auth.users cùng id). KHÔNG chép mật khẩu / số điện thoại.
insert into v2.profiles as t (id, role, name, legacy, created_at)
select u.id, 'parent', coalesce(pa.name, split_part(coalesce(pa.email, u.email, ''), '@', 1), ''),
       '{"source":"public.parents"}'::jsonb, coalesce(pa.created_at, u.created_at, now())
from v1etl.parents pa
join auth.users u on u.id::text = pa.id
where not exists (select 1 from v1etl.profiles p where p.id = pa.id)
on conflict (id) do update set role = 'parent', name = excluded.name, legacy = excluded.legacy;

-- Liên kết phụ huynh – học sinh
insert into v2.guardian_links (parent_id, student_id)
select distinct pp.id, sp.id
from v1etl.parent_links l
join v2.profiles pp on pp.id::text = l.parent_id and pp.role = 'parent'
join v2.profiles sp on sp.id::text = l.student_id and sp.role = 'student'
on conflict do nothing;

-- Hộ chiếu cho mọi hồ sơ (trigger đã tạo cho dòng mới; dòng này bù cho trường hợp thiếu)
insert into v2.passports (user_id) select id from v2.profiles on conflict do nothing;

select 'profiles' as bảng, count(*) as số_dòng_v2 from v2.profiles
union all select 'guardian_links', count(*) from v2.guardian_links;
