-- =============================================================================
-- migrate-v1 · Bước 4 · Học liệu: el_courses → v2.courses, el_lessons → v2.lessons + v2.lesson_slides,
--   thứ tự chương/bài → v2.course_nodes, el_student_progress → v2.lesson_progress (đánh dấu đã học xong).
--
-- Mỗi bài cũ thành 2–4 slide: tiêu đề → video toàn màn hình ('fullscreen', nếu có video) →
--   ảnh + chữ ('image-text', nếu có nội dung) → tổng kết ('summary').
-- Bài đã có trên v2 (id el_<id>) không bị ghi đè (giữ chỉnh sửa của GV trên app mới).
-- =============================================================================

insert into v2.courses (id, title, subject, grade, description, owner_id, status, legacy_ref, created_at)
select 'el_' || c.id, coalesce(c.title, 'Khóa học'), v1etl.map_subject(coalesce(c.subject, c.title)),
       coalesce(v1etl.map_grade(c.grade), v1etl.map_grade(c.title), 1), left(v1etl.strip_html(c.description), 1000),
       op.id,
       case when coalesce(c.is_published, v1etl.try_bool(c.status), true) then 'published' else 'draft' end,
       'el_course:' || c.id, coalesce(c.created_at, now())
from v1etl.el_courses c
left join v2.profiles op on op.id::text = c.teacher_id and op.role in ('teacher', 'admin')
where c.id is not null
on conflict (id) do nothing;

create or replace view v1etl.el_lesson_src as
select l.*,
       coalesce(l.course_id, ch.course_id) as course_ref,
       ch.position as chapter_pos,
       c.title as course_title, c.subject as course_subject, c.grade as course_grade, c.teacher_id as course_teacher,
       coalesce(c.is_published, v1etl.try_bool(c.status), true) as published,
       coalesce(l.video_url, v1etl.first_iframe(l.content)) as video,
       v1etl.strip_html(l.content) as plain
from v1etl.el_lessons l
left join v1etl.el_chapters ch on ch.id = l.chapter_id
left join v1etl.el_courses c on c.id = coalesce(l.course_id, ch.course_id)
where l.id is not null;

with ins as (
  insert into v2.lessons (id, title, subject, grade, description, owner_id, status, minutes, legacy_ref, created_at)
  select 'el_' || s.id, coalesce(s.title, 'Bài học'),
         v1etl.map_subject(coalesce(s.course_subject, s.course_title)),
         coalesce(v1etl.map_grade(s.course_grade), v1etl.map_grade(s.course_title), 1),
         left(s.plain, 300), op.id,
         case when s.published then 'published' else 'draft' end,
         case when s.duration between 1 and 600 then s.duration
              when s.duration > 600 then least(600, s.duration / 60) end,
         'el_lesson:' || s.id, coalesce(s.created_at, now())
  from v1etl.el_lesson_src s
  left join v2.profiles op on op.id::text = s.course_teacher and op.role in ('teacher', 'admin')
  on conflict (id) do nothing
  returning id
)
insert into v2.lesson_slides (id, lesson_id, position, layout, data)
select x.slide_id, i.id, x.pos, x.layout, x.data
from ins i
join v1etl.el_lesson_src s on 'el_' || s.id = i.id
cross join lateral (
  select (row_number() over (order by z.ord) - 1)::int as pos, z.slide_id, z.layout, z.data
  from (
    select 1 as ord, 's1' as slide_id, 'title' as layout,
           v2.jsonb_compact(jsonb_build_object('title', coalesce(s.title, 'Bài học'), 'text', s.course_title)) as data
    union all
    select 2, 's2', 'fullscreen', jsonb_build_object('title', coalesce(s.title, ''), 'video', jsonb_build_object('url', s.video))
    where s.video is not null
    union all
    select 3, 's3', 'image-text',
           v2.jsonb_compact(jsonb_build_object('title', s.title, 'text', left(s.plain, 4000), 'image', v1etl.first_img(s.content)))
    where s.plain is not null
    union all
    select 4, 's4', 'summary', '{"title": "Em đã học xong bài!"}'::jsonb
  ) z
) x;

-- Thứ tự bài trong khóa (chương → bài)
insert into v2.course_nodes (id, course_id, position, kind, lesson_id, title)
select 'el_' || s.id, 'el_' || s.course_ref,
       (row_number() over (partition by s.course_ref
                           order by s.chapter_pos nulls last, s.chapter_id, s.position nulls last, s.created_at, s.id) - 1)::int,
       'lesson', 'el_' || s.id, s.title
from v1etl.el_lesson_src s
join v2.courses c on c.id = 'el_' || s.course_ref
join v2.lessons l on l.id = 'el_' || s.id
on conflict do nothing;

-- Tiến độ cũ: chỉ đánh dấu bài đã học xong (không cộng sao — sao cũ đã chuyển ở bước 5)
insert into v2.lesson_progress (user_id, lesson_id, completed_at)
select distinct on (p.id, l.id) p.id, l.id,
       case when coalesce(e.completed, false) or coalesce(e.progress, 0) >= 100 then coalesce(e.completed_at, now()) end
from v1etl.el_progress e
join v2.profiles p on p.id::text = e.student_id and p.role = 'student'
join v2.lessons l on l.id = 'el_' || e.lesson_id
order by p.id, l.id, e.completed desc nulls last
on conflict (user_id, lesson_id) do nothing;

select 'courses (v1)' as bảng, count(*) as số_dòng_v2 from v2.courses where legacy_ref is not null
union all select 'lessons (v1)', count(*) from v2.lessons where legacy_ref is not null
union all select 'lesson_slides (v1)', count(*) from v2.lesson_slides s join v2.lessons l on l.id = s.lesson_id where l.legacy_ref is not null
union all select 'course_nodes (v1)', count(*) from v2.course_nodes where id like 'el\_%'
union all select 'lesson_progress (v1)', count(*) from v2.lesson_progress where lesson_id like 'el\_%';
