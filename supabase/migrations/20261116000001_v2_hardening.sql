-- =============================================================================
-- OPEN-EDU v2 — gia cố (đợt 1)
--  1. Hàm trong schema v2 không còn gọi được khi CHƯA đăng nhập.
--     Lý do: `alter default privileges in schema … revoke … from public` không gỡ được quyền EXECUTE mặc định
--     của PUBLIC (Postgres chỉ gỡ được ở mức toàn cục), nên các hàm tạo sau migration RLS vẫn mở cho anon.
--     Các hàm đều tự kiểm tra auth.uid() nên chưa lộ dữ liệu — đây là lớp chặn thứ hai.
--  2. Chỉ mục cho các khóa ngoại hay truy vấn.
-- Chạy lại nhiều lần được. Migration tạo hàm mới SAU tệp này phải tự
-- `revoke execute … from public, anon` (pgTAP hardening.test.sql sẽ báo nếu quên).
-- =============================================================================

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
           has_function_privilege('service_role', p.oid, 'execute') as svc_ok
    from pg_proc p where p.pronamespace = 'v2'::regnamespace and p.prokind in ('f', 'p')
  loop
    -- Giữ nguyên quyền hiện có của người đã đăng nhập / service role (kể cả quyền đang có nhờ PUBLIC).
    if f.auth_ok then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if f.svc_ok then execute format('grant execute on function %s to service_role', f.sig); end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

create index if not exists submissions_submitter_idx on v2.submissions (submitter_id);
create index if not exists duel_answers_user_idx on v2.duel_answers (user_id);
create index if not exists live_sessions_class_idx on v2.live_sessions (class_id);
create index if not exists exams_matrix_idx on v2.exams (matrix_id);
create index if not exists exams_created_by_idx on v2.exams (created_by);
create index if not exists assignments_created_by_idx on v2.assignments (created_by);
create index if not exists work_tasks_created_by_idx on v2.work_tasks (created_by);
create index if not exists courses_owner_idx on v2.courses (owner_id);
create index if not exists behavior_logs_team_idx on v2.behavior_logs (team_id);
create index if not exists user_badges_badge_idx on v2.user_badges (badge_id);
create index if not exists duels_invitee_idx on v2.duels (invitee) where invitee is not null;
create index if not exists misconceptions_skill_idx on v2.misconceptions (skill_code);

-- -----------------------------------------------------------------------------
-- 3. Nhật ký lỗi phía app (màn hình "Có lỗi rồi") — để quản trị biết máy nào hỏng gì.
--    Không lưu nội dung bài làm; chỉ thông báo lỗi, vị trí mã, trang đang mở, loại máy.
-- -----------------------------------------------------------------------------
create table if not exists v2.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid references v2.profiles (id) on delete set null,
  app text not null check (app in ('learner', 'teacher', 'present')),
  message text not null,
  stack text,
  url text,
  user_agent text,
  app_version text,
  at timestamptz not null default now()
);
create index if not exists client_errors_at_idx on v2.client_errors (at desc);
create index if not exists client_errors_user_idx on v2.client_errors (user_id, at desc);
alter table v2.client_errors enable row level security;
drop policy if exists client_errors_admin_read on v2.client_errors;
create policy client_errors_admin_read on v2.client_errors for select to authenticated using (v2.is_admin());
revoke all on v2.client_errors from anon, authenticated;
grant select on v2.client_errors to authenticated;
grant all on v2.client_errors to service_role;

-- Tối đa 20 lỗi / người / ngày để một máy hỏng không làm đầy CSDL.
create or replace function v2.log_client_error(p jsonb) returns boolean
language plpgsql volatile security definer set search_path = v2, public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if coalesce(p ->> 'app', '') not in ('learner', 'teacher', 'present') or coalesce(btrim(p ->> 'message'), '') = '' then return false; end if;
  if (select count(*) from v2.client_errors e where e.user_id = v_uid and e.at > now() - interval '1 day') >= 20 then return false; end if;
  insert into v2.client_errors (user_id, app, message, stack, url, user_agent, app_version)
  values (v_uid, p ->> 'app', left(p ->> 'message', 500), left(p ->> 'stack', 4000), left(p ->> 'url', 300),
          left(p ->> 'userAgent', 300), left(p ->> 'appVersion', 40));
  return true;
end $$;
revoke execute on function v2.log_client_error(jsonb) from public, anon;
grant execute on function v2.log_client_error(jsonb) to authenticated, service_role;

-- Dọn hằng tháng: thêm nhật ký lỗi cũ hơn 90 ngày (bọc hàm cũ, giữ nguyên kết quả của nó).
create or replace function v2.purge_client_errors() returns int
language plpgsql volatile security definer set search_path = v2, public as $$
declare n int;
begin
  delete from v2.client_errors where at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function v2.purge_client_errors() from public, anon, authenticated;
grant execute on function v2.purge_client_errors() to service_role;
