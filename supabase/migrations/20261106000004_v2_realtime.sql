-- =============================================================================
-- OPEN-EDU · Migration 4/6 · Realtime
--   • live_responses vào publication supabase_realtime → GV/TV nghe postgres_changes INSERT
--     (lọc session_id=eq.{id}); RLS live_responses_read quyết định ai nhận được.
--   • Kênh broadcast/presence `live:{sessionId}`: nếu client dùng kênh private ({ config: { private: true } }),
--     các policy trên realtime.messages dưới đây giới hạn người nghe/gửi. Kênh public thì không áp dụng.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'v2' and tablename = 'live_responses'
  ) then
    alter publication supabase_realtime add table v2.live_responses;
  end if;
end $$;

-- Quyền theo topic 'live:<uuid>'.
create or replace function v2.live_topic_session(p_topic text) returns uuid
language sql immutable set search_path = v2, public as $$
  select case when p_topic like 'live:%' then v2.try_uuid(substr(p_topic, 6)) end
$$;

create or replace function v2.can_access_live_topic(p_topic text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (
    select 1 from v2.live_sessions s
    where s.id = v2.live_topic_session(p_topic) and s.ended_at is null
      and v2.live_visible(s.id, s.class_id, s.teacher_id)
  )
$$;

create or replace function v2.can_host_live_topic(p_topic text) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select v2.is_live_host(v2.live_topic_session(p_topic))
$$;

grant execute on function v2.live_topic_session(text), v2.can_access_live_topic(text), v2.can_host_live_topic(text)
  to authenticated, service_role;

do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists "openedu v2 live receive" on realtime.messages';
    execute 'drop policy if exists "openedu v2 live send" on realtime.messages';
    -- Nghe: GV chủ phiên, HS cùng lớp hoặc đã vào bằng PIN.
    execute $p$
      create policy "openedu v2 live receive" on realtime.messages for select to authenticated
      using (realtime.topic() like 'live:%' and v2.can_access_live_topic(realtime.topic()))
    $p$;
    -- Gửi: presence cho mọi người tham gia; broadcast (state) chỉ GV chủ phiên.
    execute $p$
      create policy "openedu v2 live send" on realtime.messages for insert to authenticated
      with check (
        realtime.topic() like 'live:%'
        and v2.can_access_live_topic(realtime.topic())
        and (extension = 'presence' or v2.can_host_live_topic(realtime.topic()))
      )
    $p$;
  else
    raise notice 'realtime.messages chưa có (Realtime Authorization chưa bật) — bỏ qua policy kênh private.';
  end if;
end $$;
