-- =============================================================================
-- OPEN-EDU v2 — Giao lại nhiều lượt + chính sách quá hạn (23/11/2026) — docs/BAO_CAO_BAI_GIAO.md
--  • assignments.late_policy: 'allow' (mặc định — quá hạn vẫn làm, báo cáo ghi "muộn") | 'lock' (khóa bài).
--  • assignments.parent_id / round: "Giao lại" tạo lần giao mới cùng bài, nối về lần giao đầu (để so sánh các lượt).
--  • v2.start_assignment(id): HS mở bài từ một lần giao. Tiến độ bài cũ (cập nhật trước ngày mở của lượt này) → làm
--    lại từ đầu. Quá hạn mà lần giao khóa bài → lỗi. Kết quả từng câu vẫn ghi vào learning_events kèm assignment_id
--    (Edge Function grade) — báo cáo bài giao đọc từ đó.
-- Chạy lại nhiều lần không sao.
-- =============================================================================

alter table v2.assignments add column if not exists late_policy text not null default 'allow';
alter table v2.assignments add column if not exists parent_id text references v2.assignments(id) on delete set null;
alter table v2.assignments add column if not exists round smallint not null default 1;
do $$ begin
  alter table v2.assignments add constraint assignments_late_policy_chk check (late_policy in ('allow', 'lock'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table v2.assignments add constraint assignments_round_chk check (round between 1 and 99);
exception when duplicate_object then null; end $$;
create index if not exists assignments_parent_idx on v2.assignments (parent_id) where parent_id is not null;
create index if not exists learning_events_assignment_idx on v2.learning_events (assignment_id) where assignment_id is not null;

create or replace function v2.start_assignment(p_assignment text) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare a v2.assignments; v_reset boolean := false;
begin
  perform v2._require_user();
  select * into a from v2.assignments where id = p_assignment;
  if a.id is null or not (v2.is_member_of_class(a.class_id) and (cardinality(a.student_ids) = 0 or auth.uid()::text = any (a.student_ids))) then
    raise exception 'Không tìm thấy bài được giao.' using errcode = 'P0002';
  end if;
  if a.open_at > now() then
    raise exception 'Bài này chưa đến giờ mở.' using errcode = 'P0001';
  end if;
  if a.late_policy = 'lock' and a.due_at is not null and a.due_at < now() then
    raise exception 'Bài này đã hết hạn nộp. Em hỏi thầy cô nhé.' using errcode = 'P0001';
  end if;
  if a.target_type = 'lesson' then
    update v2.lesson_progress
       set slide_index = 0, completed_slides = '{}', answers = '{}'::jsonb, completed_at = null, updated_at = now()
     where user_id = auth.uid() and lesson_id = a.target_id and updated_at < a.open_at;
    v_reset := found;
  end if;
  return jsonb_build_object('ok', true, 'reset', v_reset);
end $$;
revoke all on function v2.start_assignment(text) from public, anon;
grant execute on function v2.start_assignment(text) to authenticated;
