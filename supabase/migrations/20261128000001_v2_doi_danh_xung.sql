-- =============================================================================
-- SQL 24 — Danh xưng thống nhất "thầy/cô" (nhãn ngắn phía GV: "GV") + báo phụ huynh mới liên kết.
--   1) Mọi lời nhắn, thông báo, báo lỗi của các hàm v2: "cô" / "thầy cô" → "thầy/cô".
--      Ví dụ: "Thầy/cô đã chấm bài", "Em được thầy/cô khen", "Chỉ thầy/cô và quản trị xem được…".
--      Thông báo đã gửi trước đây giữ nguyên chữ cũ.
--   2) Huy hiệu: "Huy hiệu của thầy/cô" (mã 'cua-co' giữ nguyên), mô tả huy hiệu "… được thầy/cô duyệt / khen".
--      Nội dung chương trình (kĩ năng "Kính thầy cô, quý bạn"…) giữ nguyên.
--   3) Phụ huynh vừa liên kết tài khoản: nếu lớp đã có thông báo gửi trong 30 ngày qua,
--      phụ huynh nhận 1 thông báo "Lớp … có N thông báo gần đây" để mở đọc (trước đây chỉ GV được báo).
-- Chạy lại nhiều lần không sao (idempotent). Cần SQL 23 đã chạy.
-- =============================================================================

update v2.badges set title = 'Huy hiệu của thầy/cô' where id = 'cua-co' and title is distinct from 'Huy hiệu của thầy/cô';
update v2.badges set title = regexp_replace(title, '([Tt])hầy cô', '\1hầy/cô', 'g'), hint = regexp_replace(hint, '([Tt])hầy cô', '\1hầy/cô', 'g')
 where title ~ '[Tt]hầy cô' or hint ~ '[Tt]hầy cô';

create or replace function v2._trg_submission_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare v_task text;
begin
  begin
    select coalesce(t.title, 'Bài viết') into v_task from v2.work_tasks t where t.id = new.task_id;
    v_task := coalesce(v_task, 'Bài viết');
    if new.submitted_by = 'student' and new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
      perform v2._notify(v2._ph_teachers(new.class_id), 'gv-nop-bai', '%s bài mới cần chấm: ' || v_task, v2._ph_name(new.student_id) || ' vừa nộp bài.',
                         '/cham-bai', jsonb_build_object('taskId', new.task_id), false, 'sub:' || new.task_id);
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      if new.status = 'approved' then
        perform v2._notify(array[new.student_id], 'hs-bai-cham', 'Thầy/cô đã chấm bài: ' || v_task, 'Em vào xem nhận xét của thầy/cô nhé.',
                           '/bai-viet/' || new.task_id, jsonb_build_object('taskId', new.task_id));
        if v2._ps_mode(new.class_id, 'works') = 'auto' then
          perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-bai-viet', v2._ph_name(new.student_id) || ': bài viết đã được chấm',
                             v_task, '/phu-huynh', jsonb_build_object('studentId', new.student_id, 'submissionId', new.id));
        end if;
      elsif new.status = 'returned' then
        perform v2._notify(array[new.student_id], 'hs-bai-cham', 'Thầy/cô trả bài để em sửa: ' || v_task, 'Em đọc lời thầy/cô dặn rồi nộp lại nhé.',
                           '/bai-viet/' || new.task_id, jsonb_build_object('taskId', new.task_id));
      end if;
    end if;
  exception when others then raise warning 'thông báo (bài viết): %', sqlerrm;
  end;
  return null;
end $$;

create or replace function v2._trg_behavior_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare
  v_kind text; v_label text;
begin
  begin
    if new.at < now() - interval '1 day' then return null; end if;
    v_kind := v2._ps_behavior_kind(new.class_id, new.behavior_id, new.points);
    select b.label into v_label from v2.behaviors b where b.class_id = new.class_id and b.id = new.behavior_id;
    v_label := coalesce(v_label, nullif(btrim(new.note), ''), case when v_kind = 'praise' then 'thi đua' else 'nề nếp' end);
    if v_kind = 'praise' then
      perform v2._notify(array[new.student_id], 'hs-khen', 'Em được thầy/cô khen: ' || v_label,
                         case when new.points > 0 then '+' || new.points || ' điểm thi đua' else '' end, '/toi', '{}'::jsonb);
      if v2._ps_mode(new.class_id, 'praise') = 'auto' then
        perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-khen', v2._ph_name(new.student_id) || ' được thầy/cô khen: ' || v_label,
                           coalesce(nullif(btrim(new.note), ''), ''), '/phu-huynh', jsonb_build_object('studentId', new.student_id));
      end if;
    elsif v2._ps_mode(new.class_id, 'reminders') = 'auto' then
      perform v2._notify(v2._ph_guardians(array[new.student_id]), 'ph-nhac-nho', v2._ph_name(new.student_id) || ': thầy/cô nhắc nhở ' || v_label,
                         coalesce(nullif(btrim(new.note), ''), ''), '/phu-huynh', jsonb_build_object('studentId', new.student_id), true);
    end if;
  exception when others then raise warning 'thông báo (thi đua): %', sqlerrm;
  end;
  return null;
end $$;

create or replace function v2._trg_discussion_report_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare d v2.discussions;
begin
  begin
    select x.* into d from v2.discussions x join v2.discussion_posts p on p.discussion_id = x.id where p.id = new.post_id;
    if found then
      perform v2._notify(v2._ph_teachers(d.class_id), 'gv-thao-luan', '%s bài bị báo cần thầy/cô xem', d.title,
                         '/thao-luan/' || d.id, jsonb_build_object('discussionId', d.id), false, 'report:' || d.id);
    end if;
  exception when others then raise warning 'thông báo (báo thầy/cô): %', sqlerrm;
  end;
  return null;
end $$;

create or replace function v2._trg_guardian_link_notify() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare
  v_class text := v2._class_of_student(new.student_id);
  v_posts int; v_cname text;
begin
  begin
    if v_class is not null then
      perform v2._notify(v2._ph_teachers(v_class), 'gv-lien-ket', '%s phụ huynh mới liên kết',
                         v2._ph_name(new.parent_id) || coalesce(' (' || new.relation || ')', '') || ' của ' || v2._ph_name(new.student_id),
                         '/phu-huynh?the=lien-ket', jsonb_build_object('studentId', new.student_id), false, 'link:' || v_class);
      -- Phụ huynh mới: báo có thông báo cả lớp gần đây (thông báo gửi trước khi liên kết vẫn đọc được trong hộp thư).
      select count(*)::int into v_posts from v2.parent_posts p
       where p.class_id = v_class and p.recalled_at is null and p.notified_at is not null
         and p.send_at <= now() and p.send_at > now() - interval '30 days'
         and (p.audience = 'class' or new.student_id = any (p.student_ids));
      if v_posts > 0 then
        select c.name into v_cname from v2.classes c where c.id = v_class;
        perform v2._notify(array[new.parent_id], 'ph-thong-bao',
                           'Lớp ' || coalesce(v_cname, 'của con') || ' có ' || v_posts || ' thông báo gần đây',
                           'Bố mẹ mở để đọc các thông báo thầy/cô đã gửi.', '/phu-huynh',
                           jsonb_build_object('studentId', new.student_id), false, 'welcome:' || new.student_id, null, true);
      end if;
    end if;
  exception when others then raise warning 'thông báo (liên kết): %', sqlerrm;
  end;
  return null;
end $$;

-- Các hàm v2 còn lại (báo lỗi, lời nhắn…): viết lại "thầy cô" → "thầy/cô" ngay trên mã hàm đang chạy,
-- giữ nguyên chữ kí, quyền, security definer, search_path. Hàm đã đổi rồi thì bỏ qua.
do $doi$
declare r record; v_def text; n int := 0;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'v2' and p.prokind in ('f', 'p') and p.prosrc ~ '[Tt]hầy cô'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_def := regexp_replace(v_def, '([Tt])hầy cô', '\1hầy/cô', 'g');
    execute v_def;
    n := n + 1;
  end loop;
  raise notice 'SQL 24: đã đổi danh xưng trong % hàm.', n;
end $doi$;
