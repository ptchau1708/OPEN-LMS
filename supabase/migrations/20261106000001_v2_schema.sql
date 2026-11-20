-- =============================================================================
-- OPEN-EDU · Migration 1/6 · Schema v2 + bảng + ràng buộc + trigger updated_at
-- Chạy được nhiều lần (idempotent): if not exists / create or replace / drop … if exists.
-- Yêu cầu Postgres ≥ 15 (Supabase mặc định). Không đụng tới schema public của app cũ.
-- =============================================================================

create schema if not exists v2;
comment on schema v2 is 'OPEN-EDU (app mới). Schema public giữ nguyên cho OpenLMS cũ tới khi chuyển hẳn.';

grant usage on schema v2 to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tiện ích chung
-- -----------------------------------------------------------------------------
create or replace function v2.set_updated_at() returns trigger
language plpgsql set search_path = v2, public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Ngày theo giờ Việt Nam (chuỗi ngày học liên tiếp, hạn mức AI theo ngày).
create or replace function v2.today_vn() returns date
language sql stable set search_path = v2, public as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

-- Bỏ các khóa có giá trị null ở tầng trên cùng (không đệ quy như jsonb_strip_nulls).
create or replace function v2.jsonb_compact(p jsonb) returns jsonb
language sql immutable set search_path = v2, public as $$
  select coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(p) e where e.value <> 'null'::jsonb), '{}'::jsonb)
$$;

-- Đọc số nguyên an toàn từ chuỗi (null nếu không hợp lệ).
create or replace function v2.try_int(p text) returns int
language sql immutable set search_path = v2, public as $$
  select case when p ~ '^\s*-?\d{1,9}(\.0+)?\s*$' then trunc(p::numeric)::int end
$$;

create or replace function v2.try_uuid(p text) returns uuid
language sql immutable set search_path = v2, public as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

-- -----------------------------------------------------------------------------
-- Linh vật (đồng bộ với packages/contracts/src/mascots.ts → MASCOTS[].unlockStars)
-- -----------------------------------------------------------------------------
create table if not exists v2.mascots (
  id text primary key,
  unlock_stars int not null check (unlock_stars >= 0),
  position smallint not null
);
insert into v2.mascots (id, unlock_stars, position) values
  ('nghe', 0, 0), ('shiba', 20, 1), ('panda', 50, 2), ('capybara', 90, 3), ('koala', 140, 4),
  ('voi', 200, 5), ('kiwi', 270, 6), ('ho', 350, 7), ('ga', 440, 8), ('cong', 540, 9)
on conflict (id) do update set unlock_stars = excluded.unlock_stars, position = excluded.position;

-- -----------------------------------------------------------------------------
-- Người dùng, lớp, tổ, phụ huynh
-- -----------------------------------------------------------------------------
create table if not exists v2.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin', 'parent')),
  name text not null default '',
  username text check (username is null or (length(username) between 1 and 64 and username = lower(username))),
  grade smallint check (grade between 1 and 5),
  class_id text,
  avatar_mascot text not null default 'nghe' references v2.mascots (id),
  avatar_color text not null default '#2f7bf6' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  -- Dữ liệu cũ chỉ để tham khảo (avatar URL, saved_prompts, custom_tools, allowed_grades…). Không dùng trong app.
  legacy jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_key on v2.profiles (username) where username is not null;
create index if not exists profiles_class_idx on v2.profiles (class_id) where class_id is not null;
create index if not exists profiles_role_idx on v2.profiles (role);

create table if not exists v2.classes (
  id text primary key default gen_random_uuid()::text,
  name text not null check (length(btrim(name)) > 0),
  grade smallint not null default 1 check (grade between 1 and 5),
  teacher_id uuid references v2.profiles (id) on delete set null,
  academic_year text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists classes_teacher_idx on v2.classes (teacher_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_class_id_fkey' and conrelid = 'v2.profiles'::regclass) then
    alter table v2.profiles add constraint profiles_class_id_fkey
      foreign key (class_id) references v2.classes (id) on delete set null;
  end if;
end $$;

create table if not exists v2.class_teams (
  id text primary key default gen_random_uuid()::text,
  class_id text not null references v2.classes (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  color text not null default '#2f7bf6',
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists class_teams_class_idx on v2.class_teams (class_id);

create table if not exists v2.class_members (
  class_id text not null references v2.classes (id) on delete cascade,
  user_id uuid not null references v2.profiles (id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher')),
  team_id text references v2.class_teams (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists class_members_user_idx on v2.class_members (user_id);
create index if not exists class_members_team_idx on v2.class_members (team_id) where team_id is not null;

-- Tổ phải thuộc đúng lớp.
create or replace function v2.check_member_team() returns trigger
language plpgsql set search_path = v2, public as $$
begin
  if new.team_id is not null and not exists (
    select 1 from v2.class_teams t where t.id = new.team_id and t.class_id = new.class_id
  ) then
    raise exception 'Tổ này không thuộc lớp %.', new.class_id using errcode = '23503';
  end if;
  return new;
end $$;
drop trigger if exists class_members_team_check on v2.class_members;
create trigger class_members_team_check before insert or update of team_id, class_id on v2.class_members
  for each row execute function v2.check_member_team();

create table if not exists v2.guardian_links (
  parent_id uuid not null references v2.profiles (id) on delete cascade,
  student_id uuid not null references v2.profiles (id) on delete cascade,
  relation text,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id),
  check (parent_id <> student_id)
);
create index if not exists guardian_links_student_idx on v2.guardian_links (student_id);

-- -----------------------------------------------------------------------------
-- Nội dung: item (không chứa đáp án), item_keys (đáp án), bài giảng, slide, khóa học, gói HTML5
-- -----------------------------------------------------------------------------
create table if not exists v2.items (
  id text primary key default gen_random_uuid()::text check (length(id) between 1 and 128),
  type text not null check (type in (
    'MCQ', 'MCQ_MULTIPLE', 'MATCHING', 'ORDERING', 'DRAG_DROP', 'SHORT_ANSWER', 'SENTENCE_SCRAMBLE',
    'WORD_CLASSIFY', 'FILL_IN_PASSAGE', 'INLINE_DROPDOWN', 'LISTEN_CHOOSE', 'HOTSPOT', 'DRAW',
    'RECORD_READ', 'MATH_MANIPULATIVE', 'POLL')),
  grade smallint not null check (grade between 1 and 5),
  subject text not null check (subject in ('toan', 'tieng-viet', 'tieng-anh', 'tnxh', 'khoa-hoc', 'mi-thuat', 'am-nhac', 'khac')),
  skill text,
  difficulty text check (difficulty in ('nhan-biet', 'ket-noi', 'van-dung')),
  prompt jsonb not null default '{"text": ""}'::jsonb check (jsonb_typeof(prompt) = 'object'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  hint text,
  explanation text,
  stars smallint not null default 1 check (stars between 0 and 5),
  tags text[] not null default '{}',
  owner_id uuid default auth.uid() references v2.profiles (id) on delete set null,
  legacy_ref text,     -- 'qb:<id>', 'ar:<id>', 'ex:<examId>:<qid>' khi chuyển từ app cũ
  content_hash text,   -- md5 nội dung chuẩn hóa, để chống trùng khi chuyển dữ liệu
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_subject_grade_idx on v2.items (subject, grade);
create index if not exists items_owner_idx on v2.items (owner_id);
create index if not exists items_type_idx on v2.items (type);
create index if not exists items_tags_idx on v2.items using gin (tags);
create unique index if not exists items_legacy_ref_key on v2.items (legacy_ref) where legacy_ref is not null;
create index if not exists items_content_hash_idx on v2.items (content_hash) where content_hash is not null;

create table if not exists v2.item_keys (
  item_id text primary key references v2.items (id) on delete cascade,
  key jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists v2.lessons (
  id text primary key default gen_random_uuid()::text check (length(id) between 1 and 128),
  title text not null check (length(btrim(title)) > 0),
  subject text not null check (subject in ('toan', 'tieng-viet', 'tieng-anh', 'tnxh', 'khoa-hoc', 'mi-thuat', 'am-nhac', 'khac')),
  grade smallint not null check (grade between 1 and 5),
  description text,
  mascot text references v2.mascots (id),
  owner_id uuid default auth.uid() references v2.profiles (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  minutes smallint check (minutes between 0 and 600),
  legacy_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lessons_subject_grade_idx on v2.lessons (subject, grade, status);
create index if not exists lessons_owner_idx on v2.lessons (owner_id);

create table if not exists v2.lesson_slides (
  id text not null check (length(id) between 1 and 128),
  lesson_id text not null references v2.lessons (id) on delete cascade,
  position int not null check (position >= 0),
  layout text not null check (layout in ('title', 'image-text', 'fullscreen', 'activity', 'compare', 'game', 'package', 'summary')),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  primary key (lesson_id, id),
  unique (lesson_id, position)
);

-- Chỉ mục item ↔ slide (trigger tự cập nhật): dùng để biết item thuộc bài nào (quyền đọc, ghi tiến độ, chống "cày" sao).
create table if not exists v2.lesson_items (
  lesson_id text not null,
  slide_id text not null,
  item_id text not null,
  kind text not null check (kind in ('activity', 'embedded', 'video')),
  primary key (lesson_id, slide_id, item_id),
  foreign key (lesson_id, slide_id) references v2.lesson_slides (lesson_id, id) on delete cascade
);
create index if not exists lesson_items_item_idx on v2.lesson_items (item_id);

create or replace function v2.sync_lesson_items() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from v2.lesson_items where lesson_id = old.lesson_id and slide_id = old.id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into v2.lesson_items (lesson_id, slide_id, item_id, kind)
    select new.lesson_id, new.id, x.item_id, min(x.kind)
    from (
      select new.data ->> 'itemId' as item_id, 'activity' as kind
      union all
      select new.data -> 'item' ->> 'id', 'embedded' where jsonb_typeof(new.data -> 'item') = 'object'
      union all
      select q ->> 'itemId', 'video'
      from jsonb_array_elements(case when jsonb_typeof(new.data -> 'video' -> 'questions') = 'array'
                                     then new.data -> 'video' -> 'questions' else '[]'::jsonb end) q
    ) x
    where x.item_id is not null and x.item_id <> ''
    group by x.item_id
    on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists lesson_slides_items on v2.lesson_slides;
create trigger lesson_slides_items after insert or update or delete on v2.lesson_slides
  for each row execute function v2.sync_lesson_items();

create table if not exists v2.courses (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  subject text not null check (subject in ('toan', 'tieng-viet', 'tieng-anh', 'tnxh', 'khoa-hoc', 'mi-thuat', 'am-nhac', 'khac')),
  grade smallint not null check (grade between 1 and 5),
  description text,
  owner_id uuid default auth.uid() references v2.profiles (id) on delete set null,
  status text not null default 'published' check (status in ('draft', 'published')),
  legacy_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists courses_subject_grade_idx on v2.courses (subject, grade);

-- Nút trên bản đồ phiêu lưu. Course.lessonIds = các nút kind='lesson' theo position.
create table if not exists v2.course_nodes (
  id text primary key default gen_random_uuid()::text,
  course_id text not null references v2.courses (id) on delete cascade,
  position int not null check (position >= 0),
  kind text not null default 'lesson' check (kind in ('lesson', 'package', 'practice', 'chapter')),
  lesson_id text references v2.lessons (id) on delete cascade,
  target_id text,
  title text,
  data jsonb not null default '{}'::jsonb,
  unique (course_id, position),
  check (kind <> 'lesson' or lesson_id is not null)
);
create index if not exists course_nodes_lesson_idx on v2.course_nodes (lesson_id) where lesson_id is not null;

create table if not exists v2.packages (
  id text primary key default gen_random_uuid()::text check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  kind text not null check (kind in ('h5p', 'scorm12', 'scorm2004', 'html')),
  title text not null,
  base_url text not null,
  entry text not null default 'index.html',
  owner_id uuid default auth.uid() references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists packages_owner_idx on v2.packages (owner_id);

-- -----------------------------------------------------------------------------
-- Giao bài, tiến độ, nhật ký học tập, phần thưởng
-- -----------------------------------------------------------------------------
create table if not exists v2.assignments (
  id text primary key default gen_random_uuid()::text,
  target_type text not null check (target_type in ('lesson', 'practice', 'package')),
  target_id text not null,
  title text not null,
  class_id text not null references v2.classes (id) on delete cascade,
  student_ids text[] not null default '{}',  -- rỗng = cả lớp
  open_at timestamptz not null default now(),
  due_at timestamptz,
  created_by uuid default auth.uid() references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (due_at is null or due_at >= open_at)
);
create index if not exists assignments_class_idx on v2.assignments (class_id, open_at desc);
create index if not exists assignments_students_idx on v2.assignments using gin (student_ids);

create table if not exists v2.lesson_progress (
  user_id uuid not null default auth.uid() references v2.profiles (id) on delete cascade,
  lesson_id text not null references v2.lessons (id) on delete cascade,
  slide_index int not null default 0 check (slide_index >= 0),
  completed_slides text[] not null default '{}',
  -- { "<slideId>": { "correct": bool, "score": 0..1 } } — chỉ server ghi (Edge Function grade).
  -- Câu hỏi chen trong video dùng khóa "<slideId>#<itemId>".
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  stars_earned int not null default 0 check (stars_earned >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index if not exists lesson_progress_lesson_idx on v2.lesson_progress (lesson_id);

-- Nhiều dòng nhất → id bigint, result gọn; dọn sau 12 tháng (v2.monthly_cleanup).
create table if not exists v2.learning_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references v2.profiles (id) on delete cascade,
  verb text not null check (verb in ('started', 'viewed', 'answered', 'completed', 'joined', 'awarded')),
  object_type text not null check (object_type in ('slide', 'item', 'lesson', 'package', 'live', 'arena')),
  object_id text not null check (length(object_id) between 1 and 128),
  lesson_id text,
  assignment_id text,
  live_session_id uuid,
  result jsonb,
  at timestamptz not null default now()
);
create index if not exists learning_events_user_idx on v2.learning_events (user_id, at desc);
create index if not exists learning_events_lesson_idx on v2.learning_events (lesson_id, at desc) where lesson_id is not null;
create index if not exists learning_events_live_idx on v2.learning_events (live_session_id, user_id) where live_session_id is not null;
create index if not exists learning_events_at_brin on v2.learning_events using brin (at);

create table if not exists v2.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references v2.profiles (id) on delete cascade,
  stars int not null default 0,
  coins int not null default 0,
  xp int not null default 0,
  reason text not null default '',
  source_type text not null check (source_type in ('item', 'lesson', 'live', 'arena', 'behavior', 'bonus')),
  source_id text,
  -- Khóa chống cộng trùng: 'item:<id>:lesson:<id>', 'lesson:<id>', 'migrate:behavior'… null = không giới hạn (thưởng GV).
  dedupe_key text,
  created_by uuid,
  at timestamptz not null default now()
);
create index if not exists reward_ledger_user_idx on v2.reward_ledger (user_id, at desc);
create unique index if not exists reward_ledger_dedupe_key on v2.reward_ledger (user_id, dedupe_key) where dedupe_key is not null;

create table if not exists v2.streaks (
  user_id uuid primary key references v2.profiles (id) on delete cascade,
  current_days int not null default 0,
  best_days int not null default 0,
  last_day date
);

create table if not exists v2.passports (
  user_id uuid primary key references v2.profiles (id) on delete cascade,
  unlocked text[] not null default '{nghe}',
  companion text not null default 'nghe' references v2.mascots (id),
  updated_at timestamptz not null default now()
);

-- Đấu trường (giữ chỉ số từ arena_profiles của app cũ; dùng ở giai đoạn sau).
create table if not exists v2.arena_profiles (
  user_id uuid primary key references v2.profiles (id) on delete cascade,
  elo_rating int not null default 1000,
  tower_floor int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  total_xp int not null default 0,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Lớp học trực tiếp
-- -----------------------------------------------------------------------------
create table if not exists v2.live_sessions (
  id uuid primary key default gen_random_uuid(),
  pin char(6) not null check (pin ~ '^[0-9]{6}$'),
  lesson_id text not null references v2.lessons (id) on delete cascade,
  class_id text references v2.classes (id) on delete set null,
  teacher_id uuid not null references v2.profiles (id) on delete cascade,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists live_sessions_active_pin on v2.live_sessions (pin) where ended_at is null;
create index if not exists live_sessions_teacher_idx on v2.live_sessions (teacher_id, created_at desc);
create index if not exists live_sessions_lesson_active_idx on v2.live_sessions (lesson_id) where ended_at is null;

create table if not exists v2.live_responses (
  id bigint generated always as identity primary key,
  session_id uuid not null references v2.live_sessions (id) on delete cascade,
  user_id uuid not null references v2.profiles (id) on delete cascade,
  item_id text not null,
  slide_index int not null default 0,
  response jsonb,
  correct boolean,
  score real,
  at timestamptz not null default now()
);
create index if not exists live_responses_session_idx on v2.live_responses (session_id, slide_index);
create index if not exists live_responses_user_idx on v2.live_responses (user_id);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'classes', 'items', 'item_keys', 'lessons', 'courses', 'packages',
                           'lesson_progress', 'passports', 'live_sessions', 'arena_profiles'] loop
    execute format('drop trigger if exists %I on v2.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on v2.%I for each row execute function v2.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Hồ sơ tự tạo
-- -----------------------------------------------------------------------------
-- Mỗi hồ sơ có một hộ chiếu (Nghé Tí mở sẵn).
create or replace function v2.on_profile_created() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  insert into v2.passports (user_id) values (new.id) on conflict (user_id) do nothing;
  return null;
end $$;
drop trigger if exists profiles_passport on v2.profiles;
create trigger profiles_passport after insert on v2.profiles
  for each row execute function v2.on_profile_created();

-- Tài khoản mới trong auth.users (do app cũ hoặc admin tạo) → hồ sơ v2.
-- Không bao giờ làm hỏng việc tạo tài khoản: mọi lỗi đều bị nuốt (app cũ vẫn chạy bình thường).
create or replace function v2.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare
  v_role text;
  v_name text;
  v_old_role text;
  v_old_name text;
  v_username text;
begin
  begin
    v_role := lower(coalesce(new.raw_user_meta_data ->> 'role', new.raw_app_meta_data ->> 'role', ''));
    v_name := coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '');
    -- Ưu tiên dữ liệu bảng cũ nếu có (profiles/parents được đồng bộ sang auth.users cùng id).
    if to_regclass('public.profiles') is not null then
      begin
        execute 'select lower(role::text), name::text from public.profiles where id::text = $1 limit 1'
          into v_old_role, v_old_name using new.id::text;
      exception when others then null;
      end;
    end if;
    if v_old_role is null and to_regclass('public.parents') is not null then
      begin
        execute 'select ''parent'', name::text from public.parents where id::text = $1 limit 1'
          into v_old_role, v_old_name using new.id::text;
      exception when others then null;
      end;
    end if;
    v_role := coalesce(nullif(v_old_role, ''), v_role);
    v_name := coalesce(nullif(v_old_name, ''), v_name);
    v_role := case when v_role in ('student', 'teacher', 'admin', 'parent') then v_role else 'student' end;
    if new.email ilike '%@openlms.edu' then
      v_username := lower(split_part(new.email, '@', 1));
      if exists (select 1 from v2.profiles where username = v_username) then v_username := null; end if;
    end if;
    insert into v2.profiles (id, role, name, username)
    values (new.id, v_role, coalesce(nullif(v_name, ''), split_part(coalesce(new.email, ''), '@', 1)), v_username)
    on conflict (id) do nothing;
  exception when others then
    raise warning 'v2.handle_new_auth_user: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists openedu_v2_on_auth_user_created on auth.users;
create trigger openedu_v2_on_auth_user_created after insert on auth.users
  for each row execute function v2.handle_new_auth_user();
