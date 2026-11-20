-- =============================================================================
-- OPEN-EDU · Migration 5/6 · Hạn mức AI theo người dùng/ngày (Edge Function ai-gateway)
-- Chỉ service role ghi (qua v2.ai_quota_take). Người dùng đọc được số lượt của chính mình.
-- =============================================================================

create table if not exists v2.ai_usage (
  user_id uuid not null references v2.profiles (id) on delete cascade,
  day date not null default v2.today_vn(),
  bucket text not null check (bucket in ('generate', 'encourage')),
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, bucket)
);

alter table v2.ai_usage enable row level security;
drop policy if exists ai_usage_read on v2.ai_usage;
create policy ai_usage_read on v2.ai_usage for select to authenticated using (user_id = (select auth.uid()));

revoke all on v2.ai_usage from anon, authenticated;
grant select on v2.ai_usage to authenticated;
grant all on v2.ai_usage to service_role;

-- Lấy 1 lượt nếu còn hạn mức. Trả về số lượt đã dùng hôm nay (kể cả lượt này), hoặc null nếu đã hết.
create or replace function v2.ai_quota_take(p_user uuid, p_bucket text, p_limit int) returns int
language plpgsql security definer set search_path = v2, public as $$
declare v_count int;
begin
  if p_limit is null or p_limit <= 0 then
    return null;
  end if;
  insert into v2.ai_usage as u (user_id, day, bucket, count)
  values (p_user, v2.today_vn(), p_bucket, 1)
  on conflict (user_id, day, bucket) do update set count = u.count + 1, updated_at = now()
  where u.count < p_limit
  returning u.count into v_count;
  return v_count;
end $$;

revoke execute on function v2.ai_quota_take(uuid, text, int) from public, anon, authenticated;
grant execute on function v2.ai_quota_take(uuid, text, int) to service_role;
