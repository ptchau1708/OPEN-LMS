-- =============================================================================
-- OPEN-EDU · SQL 19 · Danh mục mở — thầy cô thêm / sửa / ẩn / xoá được nội dung trước đây cố định:
--   1) Kĩ năng (yêu cầu cần đạt): GV thêm kĩ năng mới, sửa chữ kĩ năng gốc (lưu ở cột edit_* — chạy lại SQL 18 /
--      seed KHÔNG ghi đè phần đã sửa), ẩn / hiện, khôi phục bản gốc, xoá kĩ năng tự thêm (đã có dữ liệu → ẩn).
--      Áp dụng chung toàn trường. RPC: save_skill(jsonb), delete_skill(text).
--   2) Thu hồi "Huy hiệu của cô" đã tặng nhầm: revoke_teacher_badge(uuid).
--   3) Môn học của trường (quản trị viên): đổi tên, tên ngắn, ẩn / hiện — school_settings.data.subjects.
--   4) Phòng trò chuyện: câu trả lời nhanh do GV đặt — discussions.quick_replies.
-- Cần chạy SAU SQL 18. Chạy lại được (idempotent).
-- =============================================================================
begin;

-- 1) Kĩ năng ---------------------------------------------------------------------
alter table v2.skills add column if not exists custom boolean not null default false;
alter table v2.skills add column if not exists owner_id uuid references v2.profiles (id) on delete set null;
alter table v2.skills add column if not exists hidden boolean not null default false;
alter table v2.skills add column if not exists edit_topic text;
alter table v2.skills add column if not exists edit_text text;
alter table v2.skills add column if not exists edit_short text;
alter table v2.skills add column if not exists edited_by uuid references v2.profiles (id) on delete set null;
alter table v2.skills add column if not exists edited_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'skills_edit_len_check') then
    alter table v2.skills add constraint skills_edit_len_check check (
      (edit_topic is null or length(btrim(edit_topic)) between 1 and 120)
      and (edit_text is null or length(btrim(edit_text)) between 1 and 500)
      and (edit_short is null or length(btrim(edit_short)) between 1 and 80));
  end if;
end $$;
create index if not exists skills_open_idx on v2.skills (code) where custom or hidden or edited_at is not null;
comment on column v2.skills.edit_text is 'Chữ GV đã sửa cho kĩ năng gốc (null = dùng text gốc). Danh mục mở — SQL 19.';

create or replace function v2._clean(p text, n int) returns text
language sql immutable set search_path = v2, public as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), n), '')
$$;

create or replace function v2.save_skill(p jsonb) returns v2.skills
language plpgsql security definer set search_path = v2, public as $$
declare
  v_code text := upper(btrim(coalesce(p ->> 'code', '')));
  v_row v2.skills;
  v_topic text := v2._clean(p ->> 'topic', 120);
  v_text text := v2._clean(p ->> 'text', 500);
  v_short text := v2._clean(p ->> 'short', 80);
  v_subject text := p ->> 'subject';
  v_grade smallint := v2.try_int(p ->> 'grade')::smallint;
begin
  if not (select v2.is_staff()) then
    raise exception 'Chỉ thầy cô mới sửa được danh mục kĩ năng.' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z]+[1-5]\.[A-Z0-9-]+\.[A-Z0-9-]+$' then
    raise exception 'Mã kĩ năng không hợp lệ.' using errcode = '22023';
  end if;
  select * into v_row from v2.skills where code = v_code for update;

  if not found then
    -- Thêm kĩ năng mới
    if v_topic is null or v_text is null or v_short is null then
      raise exception 'Kĩ năng mới cần đủ chủ đề, tên ngắn và mô tả.' using errcode = '22023';
    end if;
    if v_subject is null or v_subject <> all (array['toan', 'tieng-viet', 'tieng-anh', 'dao-duc', 'lich-su-dia-li', 'khoa-hoc', 'tin-hoc',
        'cong-nghe', 'gdtc', 'am-nhac', 'mi-thuat', 'hdtn', 'tnxh', 'khac']) then
      raise exception 'Môn học không hợp lệ.' using errcode = '22023';
    end if;
    if v_grade is null or v_grade not between 1 and 5 then
      raise exception 'Lớp phải từ 1 đến 5.' using errcode = '22023';
    end if;
    insert into v2.skills (code, subject, grade, strand, topic, text, short, prereqs, provisional, position, custom, owner_id, edited_by, edited_at)
    values (v_code, v_subject, v_grade, 'CHU-DE', v_topic, v_text, v_short, '{}', true,
            20000 + (select count(*) from v2.skills where custom), true, auth.uid(), auth.uid(), now())
    returning * into v_row;
    return v_row;
  end if;

  if p ? 'hidden' then
    update v2.skills set hidden = coalesce((p ->> 'hidden')::boolean, false), updated_at = now()
     where code = v_code returning * into v_row;
    return v_row;
  end if;

  if coalesce((p ->> 'restore')::boolean, false) then
    if v_row.custom then raise exception 'Kĩ năng tự thêm không có bản gốc để khôi phục.' using errcode = '22023'; end if;
    update v2.skills set edit_topic = null, edit_text = null, edit_short = null, edited_by = null, edited_at = null, updated_at = now()
     where code = v_code returning * into v_row;
    return v_row;
  end if;

  if v_topic is null or v_text is null or v_short is null then
    raise exception 'Thầy cô nhập đủ chủ đề, tên ngắn và mô tả nhé.' using errcode = '22023';
  end if;
  if v_row.custom then
    update v2.skills set topic = v_topic, text = v_text, short = v_short, edited_by = auth.uid(), edited_at = now(), updated_at = now()
     where code = v_code returning * into v_row;
  else
    update v2.skills set
      edit_topic = nullif(v_topic, topic), edit_text = nullif(v_text, text), edit_short = nullif(v_short, short),
      edited_by = auth.uid(),
      edited_at = case when nullif(v_topic, topic) is null and nullif(v_text, text) is null and nullif(v_short, short) is null then null else now() end,
      updated_at = now()
     where code = v_code returning * into v_row;
  end if;
  return v_row;
end $$;

create or replace function v2.delete_skill(p_code text) returns text
language plpgsql security definer set search_path = v2, public as $$
declare v_row v2.skills; v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not (select v2.is_staff()) then
    raise exception 'Chỉ thầy cô mới sửa được danh mục kĩ năng.' using errcode = '42501';
  end if;
  select * into v_row from v2.skills where code = v_code for update;
  if not found then raise exception 'Không tìm thấy kĩ năng này.' using errcode = 'P0002'; end if;
  if v_row.custom then
    if v_row.owner_id is distinct from auth.uid() and not (select v2.is_admin()) then
      raise exception 'Chỉ người thêm kĩ năng hoặc quản trị viên mới xoá được.' using errcode = '42501';
    end if;
    if not exists (select 1 from v2.item_skills where skill_code = v_code)
       and not exists (select 1 from v2.skill_mastery where skill_code = v_code) then
      delete from v2.skills where code = v_code;
      return 'deleted';
    end if;
  end if;
  -- Kĩ năng gốc, hoặc kĩ năng đã có câu hỏi / kết quả luyện tập: ẩn để giữ lịch sử.
  update v2.skills set hidden = true, updated_at = now() where code = v_code;
  return 'hidden';
end $$;

revoke all on function v2._clean(text, int) from public, anon;
revoke all on function v2.save_skill(jsonb) from public, anon;
revoke all on function v2.delete_skill(text) from public, anon;
grant execute on function v2._clean(text, int) to authenticated;
grant execute on function v2.save_skill(jsonb) to authenticated;
grant execute on function v2.delete_skill(text) to authenticated;

-- 2) Thu hồi "Huy hiệu của cô" -------------------------------------------------------
create or replace function v2.revoke_teacher_badge(p_id uuid) returns void
language plpgsql security definer set search_path = v2, public as $$
declare b v2.user_badges;
begin
  select * into b from v2.user_badges where id = p_id;
  if not found or b.badge_id <> 'cua-co' then
    raise exception 'Không tìm thấy huy hiệu này.' using errcode = 'P0002';
  end if;
  if not (b.granted_by = auth.uid() or (select v2.is_admin())
          or exists (select 1 from v2.class_ids_of(b.user_id) c where v2.is_teacher_of_class(c))) then
    raise exception 'Thầy cô chỉ thu hồi huy hiệu của học sinh lớp mình.' using errcode = '42501';
  end if;
  delete from v2.user_badges where id = p_id;
end $$;
revoke all on function v2.revoke_teacher_badge(uuid) from public, anon;
grant execute on function v2.revoke_teacher_badge(uuid) to authenticated;

-- 3) Môn học của trường ---------------------------------------------------------------
create or replace function v2.admin_save_settings(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare
  v jsonb;
  v_subj jsonb := '{}'::jsonb;
  k text;
  o jsonb;
  e jsonb;
begin
  perform v2._require_admin();
  if coalesce(p_data ->> 'schoolYear', '') !~ '^\d{4}-\d{4}$' then
    raise exception 'Năm học có dạng 2026-2027.' using errcode = '22023';
  end if;
  if coalesce(p_data ->> 'termId', '') not in ('GK1', 'CK1', 'GK2', 'CN') then
    raise exception 'Kì đánh giá không hợp lệ.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_data -> 'subjects') = 'object' then
    for k, o in select key, value from jsonb_each(p_data -> 'subjects') loop
      continue when k <> all (array['toan', 'tieng-viet', 'tieng-anh', 'dao-duc', 'lich-su-dia-li', 'khoa-hoc', 'tin-hoc',
        'cong-nghe', 'gdtc', 'am-nhac', 'mi-thuat', 'hdtn', 'tnxh', 'khac']) or jsonb_typeof(o) <> 'object';
      e := '{}'::jsonb;
      if v2._clean(o ->> 'name', 40) is not null then e := e || jsonb_build_object('name', v2._clean(o ->> 'name', 40)); end if;
      if v2._clean(o ->> 'short', 12) is not null then e := e || jsonb_build_object('short', v2._clean(o ->> 'short', 12)); end if;
      if jsonb_typeof(o -> 'hidden') = 'boolean' then e := e || jsonb_build_object('hidden', (o ->> 'hidden')::boolean); end if;
      if e <> '{}'::jsonb then v_subj := v_subj || jsonb_build_object(k, e); end if;
    end loop;
  end if;
  v := jsonb_build_object('schoolName', btrim(coalesce(p_data ->> 'schoolName', '')), 'schoolYear', p_data ->> 'schoolYear',
                          'termId', p_data ->> 'termId', 'aiDailyQuota', greatest(0, coalesce(v2.try_int(p_data ->> 'aiDailyQuota'), 200)))
       || case when v_subj <> '{}'::jsonb then jsonb_build_object('subjects', v_subj) else '{}'::jsonb end;
  insert into v2.school_settings (id, data, updated_by, updated_at) values (true, v, auth.uid(), now())
  on conflict (id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now();
  return v;
end $$;
revoke all on function v2.admin_save_settings(jsonb) from public, anon;
grant execute on function v2.admin_save_settings(jsonb) to authenticated;

-- 4) Câu trả lời nhanh của phòng trò chuyện -----------------------------------------------
alter table v2.discussions add column if not exists quick_replies jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'discussions_quick_replies_check') then
    alter table v2.discussions add constraint discussions_quick_replies_check
      check (jsonb_typeof(quick_replies) = 'array' and jsonb_array_length(quick_replies) <= 12 and pg_column_size(quick_replies) <= 4000);
  end if;
end $$;

commit;
