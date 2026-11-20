-- =============================================================================
-- OPEN-EDU · Migration 7 · Kĩ năng (yêu cầu cần đạt CT GDPT 2018), gắn thẻ câu hỏi, quan niệm sai,
-- mức thành thạo kĩ năng (skill_mastery) + RPC hồ sơ học sinh / bản đồ nhiệt lớp / tóm tắt phụ huynh.
--
-- • Danh mục (skills, misconceptions) và item_skills của câu hỏi mẫu: supabase/seed/skills.sql,
--   SINH bởi `node tools/gen-skills-sql.mjs` từ packages/contracts/src/skills-*.ts (không sửa tay).
-- • skill_mastery CHỈ do Edge Function `grade` ghi (service role), tính bằng đúng mã thuần
--   packages/data/src/mastery (chép sang supabase/functions/_shared/mastery bởi tools/sync-scoring.mjs).
-- • Đọc: HS chính mình, GV của HS, phụ huynh (guardian_links), admin.
-- Chạy lại được (idempotent).
-- =============================================================================

create table if not exists v2.skills (
  code text primary key check (code ~ '^[A-Z]+[0-9]\.[A-Z0-9-]+\.[A-Z0-9-]+$'),
  subject text not null check (subject in ('toan', 'tieng-viet', 'tieng-anh', 'tnxh', 'khoa-hoc', 'mi-thuat', 'am-nhac', 'khac')),
  grade smallint not null check (grade between 1 and 5),
  strand text not null check (strand in ('SO-PHEP-TINH', 'HINH-DO-LUONG', 'THONG-KE-XAC-SUAT', 'TAM-THOI')),
  topic text not null,
  text text not null check (length(btrim(text)) > 0),
  short text not null check (length(btrim(short)) > 0),
  prereqs text[] not null default '{}',
  provisional boolean not null default false,
  position int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists skills_subject_grade_idx on v2.skills (subject, grade, position);
comment on table v2.skills is 'Skill (packages/contracts skills.ts). prereqs: mã kĩ năng nền (không có chu trình — kiểm thử ở packages/data).';

create table if not exists v2.misconceptions (
  code text primary key check (code ~ '^[A-Z0-9-]+$'),
  text text not null,
  kid_hint text not null default '',
  skill_code text references v2.skills (code) on delete set null,
  root_skill text references v2.skills (code) on delete set null
);

create table if not exists v2.item_skills (
  item_id text not null references v2.items (id) on delete cascade,
  skill_code text not null references v2.skills (code) on delete cascade,
  position smallint not null default 0,
  primary key (item_id, skill_code)
);
create index if not exists item_skills_skill_idx on v2.item_skills (skill_code);

create table if not exists v2.skill_mastery (
  user_id uuid not null references v2.profiles (id) on delete cascade,
  skill_code text not null references v2.skills (code) on delete cascade,
  level text not null check (level in ('chua-hoc', 'dang-hoc', 'can-on', 'vung')),
  p real not null default 0 check (p between 0 and 1),
  attempts int not null default 0 check (attempts >= 0),
  correct_streak int not null default 0 check (correct_streak >= 0),
  distinct_days int not null default 0 check (distinct_days >= 0),
  last_at timestamptz,
  misconceptions jsonb not null default '{}'::jsonb check (jsonb_typeof(misconceptions) = 'object'),
  review_stage smallint not null default 0 check (review_stage between 0 and 3),
  next_review_at timestamptz,
  was_gap boolean not null default false,
  recent_wrong jsonb not null default '[]'::jsonb check (jsonb_typeof(recent_wrong) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_code)
);
create index if not exists skill_mastery_skill_idx on v2.skill_mastery (skill_code, level);
create index if not exists skill_mastery_review_idx on v2.skill_mastery (user_id, next_review_at) where next_review_at is not null;
comment on table v2.skill_mastery is 'SkillMastery (contracts mastery.ts). Chỉ Edge Function grade ghi (service role).';

-- learning_events: thêm loại đối tượng 'remediation' (bộ ôn tập; chỉ Edge Function ghi — record_event vẫn từ chối).
alter table v2.learning_events drop constraint if exists learning_events_object_type_check;
alter table v2.learning_events add constraint learning_events_object_type_check
  check (object_type in ('slide', 'item', 'lesson', 'package', 'live', 'arena', 'remediation'));
create index if not exists learning_events_user_verb_idx on v2.learning_events (user_id, verb, at desc);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table v2.skills enable row level security;
alter table v2.misconceptions enable row level security;
alter table v2.item_skills enable row level security;
alter table v2.skill_mastery enable row level security;

drop policy if exists skills_read on v2.skills;
drop policy if exists skills_write on v2.skills;
create policy skills_read on v2.skills for select to authenticated using (true);
create policy skills_write on v2.skills for all to authenticated using ((select v2.is_admin())) with check ((select v2.is_admin()));

drop policy if exists misconceptions_read on v2.misconceptions;
drop policy if exists misconceptions_write on v2.misconceptions;
create policy misconceptions_read on v2.misconceptions for select to authenticated using (true);
create policy misconceptions_write on v2.misconceptions for all to authenticated using ((select v2.is_admin())) with check ((select v2.is_admin()));

-- item_skills: ai cũng đọc được (chỉ là mã kĩ năng; nội dung item vẫn theo RLS items). Chủ item / admin ghi.
drop policy if exists item_skills_read on v2.item_skills;
drop policy if exists item_skills_write on v2.item_skills;
create policy item_skills_read on v2.item_skills for select to authenticated using (true);
create policy item_skills_write on v2.item_skills for all to authenticated
  using (v2.owns_item(item_id)) with check (v2.owns_item(item_id));

-- skill_mastery: HS chính mình, GV của HS, phụ huynh, admin. Không ai ghi trực tiếp (service role bỏ qua RLS).
drop policy if exists skill_mastery_read on v2.skill_mastery;
create policy skill_mastery_read on v2.skill_mastery for select to authenticated
  using (v2.can_view_user(user_id) or (select v2.is_admin()));

grant select on v2.skills, v2.misconceptions, v2.item_skills, v2.skill_mastery to authenticated;
grant insert, update, delete on v2.item_skills to authenticated;
grant insert, update, delete on v2.skills, v2.misconceptions to authenticated; -- RLS: chỉ admin
grant all on v2.skills, v2.misconceptions, v2.item_skills, v2.skill_mastery to service_role;

-- -----------------------------------------------------------------------------
-- Hàm nội bộ cho Edge Function grade (service role)
-- -----------------------------------------------------------------------------
-- Ghi kèm skills/misconceptions vào sự kiện 'answered' vừa tạo bởi record_grade (cùng HS, cùng item, ≤ 5 phút).
create or replace function v2.annotate_answer(p_user uuid, p_item_id text, p_extra jsonb) returns void
language sql security definer set search_path = v2, public as $$
  update v2.learning_events e
     set result = coalesce(e.result, '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb)
   where e.id = (
     select id from v2.learning_events
      where user_id = p_user and object_id = p_item_id and verb = 'answered' and at > now() - interval '5 minutes'
      order by id desc limit 1
   )
$$;

-- Sự kiện gọn (bỏ result.response — có thể là hình vẽ DRAW rất nặng).
create or replace function v2.event_lite(e v2.learning_events) returns jsonb
language sql stable set search_path = v2, public as $$
  select jsonb_build_object(
    'id', e.id, 'user_id', e.user_id, 'verb', e.verb, 'object_type', e.object_type, 'object_id', e.object_id,
    'lesson_id', e.lesson_id, 'assignment_id', e.assignment_id, 'live_session_id', e.live_session_id,
    'result', coalesce(e.result, '{}'::jsonb) - 'response', 'at', e.at)
$$;

-- -----------------------------------------------------------------------------
-- RPC đọc (dữ liệu thô; client lắp ráp bằng packages/data/src/profile.ts + mastery)
-- -----------------------------------------------------------------------------
create or replace function v2.class_json(p_class text) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select to_jsonb(c) || jsonb_build_object(
    'teacher_name', (select t.name from v2.profiles t where t.id = c.teacher_id),
    'class_members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'team_id', m.team_id)) from v2.class_members m where m.class_id = c.id), '[]'::jsonb),
    'class_teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)) from v2.class_teams t where t.class_id = c.id), '[]'::jsonb))
  from v2.classes c where c.id = p_class
$$;

-- Hồ sơ 360° (thô): profile, class, wallet, passport, masteries, assignments, lessons (id, title, subject, slide_ids),
-- progress, events (300 gần nhất), rewards (100 gần nhất).
create or replace function v2.get_student_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_class text;
begin
  if not (v2.can_view_user(p_user) or v2.is_admin()) then
    raise exception 'Không có quyền xem hồ sơ học sinh này.' using errcode = '42501';
  end if;
  select coalesce(p.class_id, (select m.class_id from v2.class_members m where m.user_id = p.id and m.role = 'student' limit 1))
    into v_class from v2.profiles p where p.id = p_user;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from v2.profiles p where p.id = p_user),
    'class', case when v_class is null then null else v2.class_json(v_class) end,
    'wallet', (select to_jsonb(w) from v2.wallets w where w.user_id = p_user),
    'passport', (select to_jsonb(x) from v2.passports x where x.user_id = p_user),
    'masteries', coalesce((select jsonb_agg(to_jsonb(m) order by m.skill_code) from v2.skill_mastery m where m.user_id = p_user), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.open_at desc) from v2.assignments a
       where a.class_id = v_class and (cardinality(a.student_ids) = 0 or p_user::text = any (a.student_ids))), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'subject', l.subject,
               'slide_ids', coalesce((select jsonb_agg(s.id order by s.position) from v2.lesson_slides s where s.lesson_id = l.id), '[]'::jsonb)))
        from v2.lessons l
       where l.id in (
         select a.target_id from v2.assignments a
          where a.target_type = 'lesson' and a.class_id = v_class and (cardinality(a.student_ids) = 0 or p_user::text = any (a.student_ids))
         union select lp.lesson_id from v2.lesson_progress lp where lp.user_id = p_user)), '[]'::jsonb),
    'progress', coalesce((select jsonb_agg(to_jsonb(lp)) from v2.lesson_progress lp where lp.user_id = p_user), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(v2.event_lite(e) order by e.at desc) from (
      select * from v2.learning_events where user_id = p_user order by at desc limit 300) e), '[]'::jsonb),
    'rewards', coalesce((select jsonb_agg(to_jsonb(r) order by r.at desc) from (
      select * from v2.reward_ledger where user_id = p_user order by at desc limit 100) r), '[]'::jsonb)
  );
end
$$;

-- Bản đồ nhiệt lớp (thô): class, students (profiles), masteries của mọi HS trong lớp. GV của lớp / admin.
create or replace function v2.get_class_heatmap(p_class text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if not (v2.is_teacher_of_class(p_class) or v2.is_admin()) then
    raise exception 'Chỉ giáo viên của lớp xem được bản đồ kĩ năng.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'class', (select jsonb_build_object('id', c.id, 'name', c.name, 'grade', c.grade, 'teacher_id', c.teacher_id) from v2.classes c where c.id = p_class),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'role', p.role, 'name', p.name, 'username', p.username, 'grade', p.grade,
               'class_id', p.class_id, 'avatar_mascot', p.avatar_mascot, 'avatar_color', p.avatar_color) order by p.name)
        from v2.class_members m join v2.profiles p on p.id = m.user_id
       where m.class_id = p_class and m.role = 'student'), '[]'::jsonb),
    'masteries', coalesce((
      select jsonb_agg(to_jsonb(s)) from v2.skill_mastery s
       where s.user_id in (select m.user_id from v2.class_members m where m.class_id = p_class and m.role = 'student')), '[]'::jsonb)
  );
end
$$;

-- Tóm tắt phụ huynh (thô): profile, masteries, events + rewards 15 ngày gần nhất. Phụ huynh / GV / chính HS / admin.
create or replace function v2.get_parent_summary(p_child uuid) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if not (v2.is_guardian_of(p_child) or v2.can_view_user(p_child) or v2.is_admin()) then
    raise exception 'Không có quyền xem thông tin học sinh này.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from v2.profiles p where p.id = p_child),
    'masteries', coalesce((select jsonb_agg(to_jsonb(m)) from v2.skill_mastery m where m.user_id = p_child), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(v2.event_lite(e) order by e.at desc) from v2.learning_events e
                         where e.user_id = p_child and e.at > now() - interval '15 days'), '[]'::jsonb),
    'rewards', coalesce((select jsonb_agg(to_jsonb(r) order by r.at desc) from v2.reward_ledger r
                          where r.user_id = p_child and r.at > now() - interval '15 days'), '[]'::jsonb)
  );
end
$$;

revoke execute on function v2.annotate_answer(uuid, text, jsonb), v2.event_lite(v2.learning_events), v2.class_json(text)
  from public, anon, authenticated;
grant execute on function v2.get_student_profile(uuid), v2.get_class_heatmap(text), v2.get_parent_summary(uuid) to authenticated;
grant execute on function v2.annotate_answer(uuid, text, jsonb), v2.event_lite(v2.learning_events), v2.class_json(text),
  v2.get_student_profile(uuid), v2.get_class_heatmap(text), v2.get_parent_summary(uuid) to service_role;
