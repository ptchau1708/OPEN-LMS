-- =============================================================================
-- OPEN-EDU v2 — Phase 5: tài khoản phụ huynh thật, mã liên kết, báo cáo trường, quản trị.
-- Hợp đồng: docs/PHASE5_API.md. Chạy sau 20261111000002_v2_assess.sql. Idempotent.
--
-- Quyền:
--   • guardian_codes: GV của lớp / admin tạo, xem, thu hồi (qua RPC). Phụ huynh dùng mã qua RPC redeem (≤ 10 lần sai/ngày).
--   • Mỗi HS tối đa 4 phụ huynh (trigger). Mỗi mã dùng 1 lần, hết hạn sau 14 ngày.
--   • Báo cáo: admin cả trường; GV chỉ lớp mình chủ nhiệm.
--   • Quản trị (lớp, cài đặt, danh sách tài khoản): admin. Tạo tài khoản / đặt lại mật khẩu: Edge Function `school-admin`.
--
-- ⚠ Bảng cũ public.parents có cột password lưu dạng chữ thường: KHÔNG đọc, KHÔNG chép sang hệ mới, KHÔNG dùng để
--   đăng nhập. Phụ huynh tự đăng ký lại bằng mã liên kết. Khi app cũ ngừng chạy: xoá cột đó (xem docs/PHASE5_API.md §5).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vá: tự đăng ký (signUp) không được tự gán vai trò GV/admin qua raw_user_meta_data.
-- Vai trò tin cậy: app_metadata (chỉ service role ghi) hoặc bảng cũ; qua GoTrue, user_metadata chỉ được 'parent'.
-- -----------------------------------------------------------------------------
create or replace function v2.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare
  v_role text;
  v_meta_role text;
  v_name text;
  v_old_role text;
  v_old_name text;
  v_username text;
begin
  begin
    v_role := lower(coalesce(new.raw_app_meta_data ->> 'role', ''));
    v_meta_role := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
    -- GoTrue (đăng ký / admin API) chạy bằng supabase_auth_admin: chỉ tin user_metadata khi là 'parent'.
    -- Chèn trực tiếp bằng SQL (postgres: seed, ETL, kiểm thử) vẫn dùng user_metadata như trước.
    if v_role = '' and (v_meta_role = 'parent' or current_user <> 'supabase_auth_admin') then v_role := v_meta_role; end if;
    v_name := coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '');
    if to_regclass('public.profiles') is not null then
      begin
        execute 'select lower(role::text), name::text from public.profiles where id::text = $1 limit 1'
          into v_old_role, v_old_name using new.id::text;
      exception when others then null;
      end;
    end if;
    if v_old_role is null and to_regclass('public.parents') is not null then
      begin
        -- Chỉ đọc tên; KHÔNG đọc cột password.
        execute 'select ''parent'', name::text from public.parents where id::text = $1 limit 1'
          into v_old_role, v_old_name using new.id::text;
      exception when others then null;
      end;
    end if;
    v_role := coalesce(nullif(v_old_role, ''), nullif(v_role, ''), 'student');
    v_name := coalesce(nullif(v_old_name, ''), v_name);
    v_role := case when v_role in ('student', 'teacher', 'admin', 'parent') then v_role else 'student' end;
    v_username := nullif(lower(coalesce(new.raw_app_meta_data ->> 'username', '')), '');
    if v_username is null and new.email ilike '%@openlms.edu' then
      v_username := lower(split_part(new.email, '@', 1));
    end if;
    if v_username is null and v_role = 'parent' then
      -- Phụ huynh: số điện thoại (<số>@parent.<miền>) hoặc email đầy đủ.
      v_username := case when new.email ilike '%@parent.%' then lower(split_part(new.email, '@', 1)) else lower(new.email) end;
    end if;
    if v_username is not null and exists (select 1 from v2.profiles where username = v_username) then v_username := null; end if;
    insert into v2.profiles (id, role, name, username, grade, class_id)
    values (
      new.id, v_role,
      coalesce(nullif(v_name, ''), split_part(coalesce(new.email, ''), '@', 1)),
      v_username,
      v2.try_int(new.raw_app_meta_data ->> 'grade')::smallint,
      nullif(new.raw_app_meta_data ->> 'class_id', '')
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'v2.handle_new_auth_user: %', sqlerrm;
  end;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Cài đặt trường (1 dòng)
-- -----------------------------------------------------------------------------
create table if not exists v2.school_settings (
  id boolean primary key default true check (id),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_by uuid references v2.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into v2.school_settings (id, data) values (true, jsonb_build_object(
  'schoolName', '', 'schoolYear',
  case when extract(month from v2.today_vn()) >= 8 then extract(year from v2.today_vn())::int || '-' || (extract(year from v2.today_vn())::int + 1)
       else (extract(year from v2.today_vn())::int - 1) || '-' || extract(year from v2.today_vn())::int end,
  'termId', 'GK1', 'aiDailyQuota', 200))
on conflict (id) do nothing;

alter table v2.school_settings enable row level security;
drop policy if exists school_settings_read on v2.school_settings;
create policy school_settings_read on v2.school_settings for select to authenticated using (true);
revoke all on v2.school_settings from anon, authenticated;
grant select on v2.school_settings to authenticated;
grant all on v2.school_settings to service_role;

-- -----------------------------------------------------------------------------
-- Mã liên kết phụ huynh
-- -----------------------------------------------------------------------------
create table if not exists v2.guardian_codes (
  code text primary key check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  student_id uuid not null references v2.profiles (id) on delete cascade,
  class_id text not null references v2.classes (id) on delete cascade,
  created_by uuid references v2.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid references v2.profiles (id) on delete set null,
  revoked_at timestamptz
);
create index if not exists guardian_codes_class_idx on v2.guardian_codes (class_id, created_at desc);
create index if not exists guardian_codes_student_idx on v2.guardian_codes (student_id);

create table if not exists v2.guardian_code_attempts (
  user_id uuid not null references v2.profiles (id) on delete cascade,
  day date not null default v2.today_vn(),
  failures int not null default 0,
  primary key (user_id, day)
);

alter table v2.guardian_codes enable row level security;
alter table v2.guardian_code_attempts enable row level security;
drop policy if exists guardian_codes_read on v2.guardian_codes;
create policy guardian_codes_read on v2.guardian_codes for select to authenticated using (v2.is_teacher_of_class(class_id));
-- Không ai ghi trực tiếp: chỉ qua RPC security definer.
revoke all on v2.guardian_codes, v2.guardian_code_attempts from anon, authenticated;
grant select on v2.guardian_codes to authenticated;
grant all on v2.guardian_codes, v2.guardian_code_attempts to service_role;

-- guardian_links: thêm cột thời điểm đã có (created_at), giới hạn 4 phụ huynh/HS.
create or replace function v2.check_guardian_limit() returns trigger
language plpgsql set search_path = v2, public as $$
begin
  if (select count(*) from v2.guardian_links g where g.student_id = new.student_id and g.parent_id <> new.parent_id) >= 4 then
    raise exception 'Con đã có đủ 4 tài khoản phụ huynh. Xin liên hệ thầy/cô để gỡ bớt.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from v2.profiles p where p.id = new.parent_id and p.role = 'parent') then
    raise exception 'Chỉ tài khoản phụ huynh mới liên kết được với học sinh.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists guardian_links_limit on v2.guardian_links;
create trigger guardian_links_limit before insert on v2.guardian_links for each row execute function v2.check_guardian_limit();

-- HS của một lớp (thành viên hoặc lớp chính trong hồ sơ).
create or replace function v2._class_students(p_class text) returns setof uuid
language sql stable security definer set search_path = v2, public as $$
  select m.user_id from v2.class_members m where m.class_id = p_class and m.role = 'student'
  union
  select p.id from v2.profiles p where p.class_id = p_class and p.role = 'student'
$$;

create or replace function v2._new_guardian_code() returns text
language plpgsql volatile set search_path = v2, public as $$
declare
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from v2.guardian_codes where code = v_code);
  end loop;
  return v_code;
end $$;

create or replace function v2._code_json(c v2.guardian_codes) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select to_jsonb(c) || jsonb_build_object('student_name', (select p.name from v2.profiles p where p.id = c.student_id))
$$;

-- Sinh mã cho cả lớp (p_students null) hoặc vài HS; thu hồi mã còn hiệu lực cũ của các HS đó.
create or replace function v2.create_guardian_codes(p_class text, p_students uuid[] default null) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_ids uuid[];
  v_out jsonb := '[]'::jsonb;
  v_sid uuid;
  v_row v2.guardian_codes;
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Thầy/cô chỉ quản lí được lớp mình chủ nhiệm.' using errcode = '42501';
  end if;
  select array_agg(s) into v_ids from v2._class_students(p_class) s
  where p_students is null or s = any (p_students);
  if v_ids is null then return v_out; end if;
  update v2.guardian_codes set revoked_at = now()
  where student_id = any (v_ids) and used_at is null and revoked_at is null and expires_at > now();
  foreach v_sid in array v_ids loop
    insert into v2.guardian_codes (code, student_id, class_id, created_by)
    values (v2._new_guardian_code(), v_sid, p_class, auth.uid())
    returning * into v_row;
    v_out := v_out || jsonb_build_array(v2._code_json(v_row));
  end loop;
  return v_out;
end $$;

create or replace function v2.list_guardian_codes(p_class text) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Thầy/cô chỉ quản lí được lớp mình chủ nhiệm.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(v2._code_json(c) order by c.created_at desc) from v2.guardian_codes c where c.class_id = p_class), '[]'::jsonb);
end $$;

create or replace function v2.revoke_guardian_code(p_code text) returns void
language plpgsql security definer set search_path = v2, public as $$
declare v_class text;
begin
  select class_id into v_class from v2.guardian_codes where code = upper(p_code);
  if v_class is null then raise exception 'Không tìm thấy mã này.' using errcode = 'P0002'; end if;
  if not v2.is_teacher_of_class(v_class) then
    raise exception 'Thầy/cô chỉ quản lí được lớp mình chủ nhiệm.' using errcode = '42501';
  end if;
  update v2.guardian_codes set revoked_at = now() where code = upper(p_code) and used_at is null and revoked_at is null;
end $$;

-- Dùng mã: p_parent mặc định là người gọi (phụ huynh). Edge Function (service role) truyền p_parent khi vừa đăng ký.
create or replace function v2.redeem_guardian_code(p_code text, p_relation text default null, p_parent uuid default null) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_parent uuid := coalesce(case when coalesce(auth.jwt() ->> 'role', '') = 'service_role' then p_parent end, auth.uid());
  v_code v2.guardian_codes;
  v_linked boolean;
  v_fail int;
  v_child jsonb;
  v_found boolean;
begin
  if v_parent is null or not exists (select 1 from v2.profiles where id = v_parent and role = 'parent') then
    raise exception 'Bố mẹ đăng nhập tài khoản phụ huynh trước khi nhập mã nhé.' using errcode = '42501';
  end if;
  select failures into v_fail from v2.guardian_code_attempts where user_id = v_parent and day = v2.today_vn();
  if coalesce(v_fail, 0) >= 10 then
    raise exception 'Bố mẹ đã nhập sai quá nhiều lần hôm nay. Xin thử lại vào ngày mai hoặc nhờ thầy/cô kiểm tra mã.' using errcode = 'P0001';
  end if;
  select * into v_code from v2.guardian_codes where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) for update;
  v_found := found;
  v_linked := v_found and exists (select 1 from v2.guardian_links where parent_id = v_parent and student_id = v_code.student_id);
  if v_found and v_linked and v_code.used_by = v_parent then
    null; -- dùng lại mã của chính mình: không lỗi
  elsif not v_found or v_code.revoked_at is not null or v_code.used_at is not null or v_code.expires_at <= now() then
    insert into v2.guardian_code_attempts as a (user_id, day, failures) values (v_parent, v2.today_vn(), 1)
    on conflict (user_id, day) do update set failures = a.failures + 1;
    raise exception '%', case
      when not v_found then 'Mã chưa đúng. Bố mẹ kiểm tra lại 8 kí tự trên phiếu nhé.'
      when v_code.revoked_at is not null then 'Mã này đã được thầy/cô thu hồi. Xin nhờ thầy/cô in mã mới.'
      when v_code.used_at is not null then 'Mã này đã được dùng. Mỗi mã chỉ dùng một lần — xin nhờ thầy/cô cấp mã mới.'
      else 'Mã đã hết hạn (14 ngày). Xin nhờ thầy/cô cấp mã mới.' end using errcode = 'P0001';
  else
    if not v_linked then
      insert into v2.guardian_links (parent_id, student_id, relation) values (v_parent, v_code.student_id, nullif(btrim(coalesce(p_relation, '')), ''));
    end if;
    update v2.guardian_codes set used_at = now(), used_by = v_parent where code = v_code.code;
  end if;
  select to_jsonb(p) into v_child from v2.profiles p where p.id = v_code.student_id;
  return jsonb_build_object('child', v_child, 'already_linked', v_linked);
end $$;

-- Phụ huynh của lớp (GV lớp / admin). Email/SĐT che bớt.
create or replace function v2.list_guardian_links(p_class text) returns jsonb
language plpgsql stable security definer set search_path = v2, public, auth as $$
begin
  if not v2.is_teacher_of_class(p_class) then
    raise exception 'Thầy/cô chỉ quản lí được lớp mình chủ nhiệm.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'parent_id', g.parent_id, 'parent_name', pp.name, 'student_id', g.student_id, 'student_name', sp.name,
      'relation', g.relation, 'created_at', g.created_at,
      'parent_login', case
        when u.email ilike '%@parent.%' then left(split_part(u.email, '@', 1), 4) || '***' || right(split_part(u.email, '@', 1), 3)
        when u.email is not null then left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2) end
    ) order by sp.name)
    from v2.guardian_links g
    join v2.profiles sp on sp.id = g.student_id
    join v2.profiles pp on pp.id = g.parent_id
    left join auth.users u on u.id = g.parent_id
    where g.student_id in (select v2._class_students(p_class))
  ), '[]'::jsonb);
end $$;

create or replace function v2.revoke_guardian_link(p_parent uuid, p_student uuid) returns void
language plpgsql security definer set search_path = v2, public as $$
begin
  if not (v2.is_admin() or v2.is_teacher_of_student(p_student)) then
    raise exception 'Thầy/cô chỉ quản lí được lớp mình chủ nhiệm.' using errcode = '42501';
  end if;
  delete from v2.guardian_links where parent_id = p_parent and student_id = p_student;
end $$;

-- -----------------------------------------------------------------------------
-- Báo cáo trường
-- -----------------------------------------------------------------------------
-- Lớp người gọi được xem báo cáo: admin tất cả, GV lớp mình.
create or replace function v2._report_classes() returns setof v2.classes
language sql stable security definer set search_path = v2, public as $$
  select c.* from v2.classes c
  where v2.is_admin() or (v2.is_staff() and v2.is_teacher_of_class(c.id))
$$;

create or replace function v2._report_members() returns table (class_id text, grade smallint, user_id uuid)
language sql stable security definer set search_path = v2, public as $$
  select c.id, c.grade, s from v2._report_classes() c cross join lateral v2._class_students(c.id) s
$$;

-- Một dòng / lớp + khối × môn + AI + chuyên cần; lọc theo người gọi.
create or replace function v2.school_report(p_from timestamptz default null, p_to timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
  v_to timestamptz := coalesce(p_to, now());
  v_settings jsonb := (select data from v2.school_settings where id);
  v_term text := coalesce(v_settings ->> 'termId', 'GK1');
  v_year text := coalesce(v_settings ->> 'schoolYear', '');
  v_classes jsonb;
  v_mastery jsonb;
begin
  if not v2.is_staff() then
    raise exception 'Chỉ thầy/cô và quản trị xem được báo cáo.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.grade, r.name), '[]'::jsonb) into v_classes from (
    select c.id, c.name, c.grade, c.teacher_id, t.name as teacher_name,
      (select count(*) from v2._report_members() m where m.class_id = c.id) as students,
      (select count(distinct e.user_id) from v2.learning_events e join v2._report_members() m on m.user_id = e.user_id and m.class_id = c.id
         where e.at >= v_from and e.at <= v_to) as active,
      (select count(*) from v2.learning_events e join v2._report_members() m on m.user_id = e.user_id and m.class_id = c.id
         where e.at >= v_from and e.at <= v_to and e.verb = 'completed' and e.object_type = 'lesson') as lessons_completed,
      (select count(*) from v2.learning_events e join v2._report_members() m on m.user_id = e.user_id and m.class_id = c.id
         where e.at >= v_from and e.at <= v_to and e.verb = 'answered' and e.object_type = 'item' and e.result ? 'correct') as answered,
      (select count(*) from v2.learning_events e join v2._report_members() m on m.user_id = e.user_id and m.class_id = c.id
         where e.at >= v_from and e.at <= v_to and e.verb = 'answered' and e.object_type = 'item' and (e.result ->> 'correct')::boolean) as correct,
      (select avg(sm.p) from v2.skill_mastery sm join v2._report_members() m on m.user_id = sm.user_id and m.class_id = c.id where sm.attempts >= 3) as avg_p,
      (select count(distinct sm.user_id) from v2.skill_mastery sm join v2._report_members() m on m.user_id = sm.user_id and m.class_id = c.id where sm.level = 'can-on') as gap_students,
      (select count(*) filter (where a.status in ('co-mat', 'muon')) from v2.attendance a where a.class_id = c.id and a.date >= v2.today_vn() - 30) as att_present,
      (select count(*) from v2.attendance a where a.class_id = c.id and a.date >= v2.today_vn() - 30) as att_total,
      (select count(*) from v2.tt27_evaluations x where x.class_id = c.id and x.term_id = v_term and x.school_year = v_year and x.status = 'final') as tt27_final,
      (select count(*) from v2.submissions s where s.class_id = c.id and s.status = 'approved') as works_approved
    from v2._report_classes() c
    left join v2.profiles t on t.id = c.teacher_id
  ) r;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.grade, x.subject), '[]'::jsonb) into v_mastery from (
    select m.grade, k.subject, count(distinct sm.user_id) as students,
      avg(sm.p) filter (where sm.attempts >= 3) as avg_p,
      count(*) filter (where sm.level = 'vung') as secure, count(*) as cells
    from v2.skill_mastery sm
    join v2._report_members() m on m.user_id = sm.user_id
    join v2.skills k on k.code = sm.skill_code
    where sm.attempts > 0
    group by m.grade, k.subject
  ) x;

  return jsonb_build_object(
    'settings', v_settings,
    'classes', v_classes,
    'mastery', v_mastery,
    'teachers', (select count(distinct teacher_id) from v2._report_classes() where teacher_id is not null),
    'attendance', (select jsonb_build_object('present', count(*) filter (where a.status in ('co-mat', 'muon')), 'total', count(*))
                   from v2.attendance a where a.class_id in (select id from v2._report_classes()) and a.date >= v2.today_vn() - 30),
    'ai', jsonb_build_object(
      'today', (select coalesce(sum(u.count), 0) from v2.ai_usage u where u.bucket = 'grade' and u.day = v2.today_vn()
                and (v2.is_admin() or u.user_id = auth.uid())),
      'range', (select coalesce(sum(u.count), 0) from v2.ai_usage u where u.bucket = 'grade'
                and u.day between (v_from at time zone 'Asia/Ho_Chi_Minh')::date and (v_to at time zone 'Asia/Ho_Chi_Minh')::date
                and (v2.is_admin() or u.user_id = auth.uid())))
  );
end $$;

-- Bản đồ kĩ năng cả khối: lớp × kĩ năng (môn) → số HS đã làm, p trung bình, số HS mỗi mức.
create or replace function v2.grade_skill_report(p_grade smallint, p_subject text default 'toan') returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if not v2.is_staff() then
    raise exception 'Chỉ thầy/cô và quản trị xem được báo cáo.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
                 'students', (select count(*) from v2._class_students(c.id))) order by c.name)
               from v2._report_classes() c where c.grade = p_grade), '[]'::jsonb),
    'cells', coalesce((
      select jsonb_agg(jsonb_build_object('class_id', x.class_id, 'skill_code', x.skill_code, 'n', x.n, 'avg_p', x.avg_p, 'counts', x.counts))
      from (
        select c.id as class_id, sm.skill_code, count(*) as n, avg(sm.p) as avg_p,
          jsonb_build_object('chua-hoc', count(*) filter (where sm.level = 'chua-hoc'), 'dang-hoc', count(*) filter (where sm.level = 'dang-hoc'),
                             'can-on', count(*) filter (where sm.level = 'can-on'), 'vung', count(*) filter (where sm.level = 'vung')) as counts
        from v2._report_classes() c
        cross join lateral v2._class_students(c.id) s
        join v2.skill_mastery sm on sm.user_id = s and sm.attempts > 0
        join v2.skills k on k.code = sm.skill_code and k.subject = p_subject
        where c.grade = p_grade
        group by c.id, sm.skill_code
      ) x), '[]'::jsonb)
  );
end $$;

-- -----------------------------------------------------------------------------
-- Quản trị (admin)
-- -----------------------------------------------------------------------------
create or replace function v2._require_admin() returns void
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if not v2.is_admin() then
    raise exception 'Chỉ quản trị trường mới làm được việc này.' using errcode = '42501';
  end if;
end $$;

create or replace function v2.admin_save_settings(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare v jsonb;
begin
  perform v2._require_admin();
  if coalesce(p_data ->> 'schoolYear', '') !~ '^\d{4}-\d{4}$' then
    raise exception 'Năm học có dạng 2026-2027.' using errcode = '22023';
  end if;
  if coalesce(p_data ->> 'termId', '') not in ('GK1', 'CK1', 'GK2', 'CN') then
    raise exception 'Kì đánh giá không hợp lệ.' using errcode = '22023';
  end if;
  v := jsonb_build_object('schoolName', btrim(coalesce(p_data ->> 'schoolName', '')), 'schoolYear', p_data ->> 'schoolYear',
                          'termId', p_data ->> 'termId', 'aiDailyQuota', greatest(0, coalesce(v2.try_int(p_data ->> 'aiDailyQuota'), 200)));
  insert into v2.school_settings (id, data, updated_by, updated_at) values (true, v, auth.uid(), now())
  on conflict (id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now();
  return v;
end $$;

create or replace function v2.admin_save_class(p_class jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v_id text := nullif(p_class ->> 'id', '');
  v_name text := upper(btrim(coalesce(p_class ->> 'name', '')));
  v_grade smallint := v2.try_int(p_class ->> 'grade')::smallint;
  v_teacher uuid := v2.try_uuid(p_class ->> 'teacher_id');
  v_row v2.classes;
begin
  perform v2._require_admin();
  if v_name = '' then raise exception 'Nhập tên lớp (ví dụ 4B).' using errcode = '22023'; end if;
  if v_grade is null or v_grade not between 1 and 5 then raise exception 'Khối lớp từ 1 đến 5.' using errcode = '22023'; end if;
  if v_teacher is not null and not exists (select 1 from v2.profiles where id = v_teacher and role in ('teacher', 'admin')) then
    raise exception 'Giáo viên chủ nhiệm không hợp lệ.' using errcode = '22023';
  end if;
  if exists (select 1 from v2.classes where upper(name) = v_name and id is distinct from v_id) then
    raise exception 'Trường đã có lớp %.', v_name using errcode = '22023';
  end if;
  if v_id is null then
    insert into v2.classes (name, grade, teacher_id, academic_year)
    values (v_name, v_grade, v_teacher, (select data ->> 'schoolYear' from v2.school_settings where id))
    returning * into v_row;
  else
    update v2.classes set name = v_name, grade = v_grade, teacher_id = v_teacher, updated_at = now() where id = v_id returning * into v_row;
    if not found then raise exception 'Không tìm thấy lớp này.' using errcode = 'P0002'; end if;
    update v2.profiles set grade = v_grade where class_id = v_id and role = 'student';
  end if;
  if v_teacher is not null then
    insert into v2.class_members (class_id, user_id, role) values (v_row.id, v_teacher, 'teacher') on conflict do nothing;
    update v2.profiles set class_id = v_row.id where id = v_teacher and class_id is null;
  end if;
  return to_jsonb(v_row);
end $$;

-- Admin: mọi tài khoản. GV: HS lớp mình (để in lại phiếu / đặt lại mật khẩu).
create or replace function v2.admin_list_users(p_role text default null, p_class text default null) returns jsonb
language plpgsql stable security definer set search_path = v2, public as $$
begin
  if not v2.is_staff() then raise exception 'Chỉ thầy/cô và quản trị xem được danh sách này.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'role', p.role, 'name', p.name, 'username', p.username, 'grade', p.grade,
      'class_id', p.class_id, 'class_name', c.name,
      'class_ids', case when p.role = 'teacher' then (select jsonb_agg(x.id) from v2.classes x where x.teacher_id = p.id) end)
      order by p.role, c.name nulls last, p.name)
    from v2.profiles p left join v2.classes c on c.id = p.class_id
    where (p_role is null or p.role = p_role)
      and (p_class is null or p.class_id = p_class)
      and (v2.is_admin() or (p.role = 'student' and v2.is_teacher_of_class(p.class_id)))
  ), '[]'::jsonb);
end $$;

revoke execute on function
  v2._class_students(text), v2._new_guardian_code(), v2._code_json(v2.guardian_codes), v2._report_classes(), v2._report_members(), v2._require_admin(),
  v2.create_guardian_codes(text, uuid[]), v2.list_guardian_codes(text), v2.revoke_guardian_code(text),
  v2.redeem_guardian_code(text, text, uuid), v2.list_guardian_links(text), v2.revoke_guardian_link(uuid, uuid),
  v2.school_report(timestamptz, timestamptz), v2.grade_skill_report(smallint, text),
  v2.admin_save_settings(jsonb), v2.admin_save_class(jsonb), v2.admin_list_users(text, text)
  from public, anon;
grant execute on function
  v2.create_guardian_codes(text, uuid[]), v2.list_guardian_codes(text), v2.revoke_guardian_code(text),
  v2.redeem_guardian_code(text, text, uuid), v2.list_guardian_links(text), v2.revoke_guardian_link(uuid, uuid),
  v2.school_report(timestamptz, timestamptz), v2.grade_skill_report(smallint, text),
  v2.admin_save_settings(jsonb), v2.admin_save_class(jsonb), v2.admin_list_users(text, text)
  to authenticated, service_role;
grant execute on function v2._class_students(text), v2._new_guardian_code(), v2._code_json(v2.guardian_codes), v2._report_classes(), v2._report_members(), v2._require_admin() to service_role;
